"use node";

import { Sandbox } from "@vercel/sandbox";
import {
  makeFunctionReference,
  type FunctionReference,
} from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import {
  embeddedSandboxPackageJson,
  embeddedSandboxRunnerSource,
} from "../sandbox/runner/embedded";

type SandboxRunDoc = Doc<"sandboxRuns">;

type VercelSandboxCredentials = {
  teamId: string;
  projectId: string;
  token?: string;
};

const getSandboxRunForAction = makeFunctionReference<
  "query",
  { sandboxRunId: Id<"sandboxRuns"> },
  SandboxRunDoc | null
>("sandboxRuns:getSandboxRunForAction") as unknown as FunctionReference<
  "query",
  "internal",
  { sandboxRunId: Id<"sandboxRuns"> },
  SandboxRunDoc | null
>;

const markSandboxRunProvisioningFromAction = makeFunctionReference<
  "mutation",
  { sandboxRunId: Id<"sandboxRuns">; ingestTokenHash: string },
  null
>("sandboxRuns:markSandboxRunProvisioningFromAction") as unknown as FunctionReference<
  "mutation",
  "internal",
  { sandboxRunId: Id<"sandboxRuns">; ingestTokenHash: string },
  null
>;

const markSandboxRunRunningFromAction = makeFunctionReference<
  "mutation",
  { sandboxRunId: Id<"sandboxRuns">; sandboxId: string; commandId: string },
  { status: string }
>("sandboxRuns:markSandboxRunRunningFromAction") as unknown as FunctionReference<
  "mutation",
  "internal",
  { sandboxRunId: Id<"sandboxRuns">; sandboxId: string; commandId: string },
  { status: string }
>;

const markSandboxRunFailedFromAction = makeFunctionReference<
  "mutation",
  { sandboxRunId: Id<"sandboxRuns">; error: { message: string; code?: string } },
  null
>("sandboxRuns:markSandboxRunFailedFromAction") as unknown as FunctionReference<
  "mutation",
  "internal",
  { sandboxRunId: Id<"sandboxRuns">; error: { message: string; code?: string } },
  null
>;

export const startSandboxRun = action({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
  },
  handler: async (ctx, args) => {
    const sandboxRun = await ctx.runQuery(getSandboxRunForAction, {
      sandboxRunId: args.sandboxRunId,
    });
    if (!sandboxRun) {
      throw new Error("Sandbox run not found.");
    }
    if (sandboxRun.status !== "queued") {
      throw new Error(
        `Sandbox run must be queued before start, got ${sandboxRun.status}.`,
      );
    }

    const ingestToken = randomToken();
    await ctx.runMutation(markSandboxRunProvisioningFromAction, {
      sandboxRunId: args.sandboxRunId,
      ingestTokenHash: await sha256Hex(ingestToken),
    });

    try {
      const sandbox = await createSandbox();
      await bootstrapSandboxIfNeeded(sandbox);
      const command = await sandbox.runCommand({
        cmd: "node",
        args: runnerCommandArgs(),
        cwd: "/vercel/sandbox",
        detached: true,
        env: {
          CONVEX_URL: runnerConvexUrl(),
          INGEST_TOKEN: ingestToken,
          OPENAI_API_KEY: openAiApiKey(),
          SANDBOX_RUN_ID: args.sandboxRunId,
          CODEX_MODEL: process.env.CODEX_MODEL ?? "gpt-5.5",
          CODEX_REASONING_EFFORT:
            process.env.CODEX_REASONING_EFFORT ?? "low",
        },
        timeoutMs: numberEnv("DRIP_SANDBOX_RUNNER_TIMEOUT_MS", 300_000),
      });

      await ctx.runMutation(markSandboxRunRunningFromAction, {
        sandboxRunId: args.sandboxRunId,
        sandboxId: sandbox.name,
        commandId: command.cmdId,
      });

      return {
        sandboxId: sandbox.name,
        commandId: command.cmdId,
      };
    } catch (error) {
      await ctx.runMutation(markSandboxRunFailedFromAction, {
        sandboxRunId: args.sandboxRunId,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: "sandbox_start_failed",
        },
      });
      throw error;
    }
  },
});

async function bootstrapSandboxIfNeeded(
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>,
) {
  if (
    process.env.BASE_SANDBOX_IMAGE &&
    process.env.DRIP_SANDBOX_BOOTSTRAP !== "1"
  ) {
    return;
  }

  await sandbox.writeFiles([
    {
      path: "package.json",
      content: embeddedSandboxPackageJson,
    },
    {
      path: "runner.mjs",
      content: embeddedSandboxRunnerSource,
      mode: 0o755,
    },
  ]);

  await runSandboxCommand(sandbox, "corepack enable", {
    cmd: "corepack",
    args: ["enable"],
    cwd: "/vercel/sandbox",
    timeoutMs: 60_000,
  });
  await runSandboxCommand(sandbox, "corepack prepare pnpm", {
    cmd: "corepack",
    args: ["prepare", "pnpm@11.3.0", "--activate"],
    cwd: "/vercel/sandbox",
    timeoutMs: 120_000,
  });
  await runSandboxCommand(sandbox, "Sandbox bootstrap install", {
    cmd: "pnpm",
    args: ["install", "--ignore-scripts", "--prod"],
    cwd: "/vercel/sandbox",
    timeoutMs: numberEnv("DRIP_SANDBOX_INSTALL_TIMEOUT_MS", 180_000),
  });
}

function runnerCommandArgs() {
  if (
    process.env.BASE_SANDBOX_IMAGE &&
    process.env.DRIP_SANDBOX_BOOTSTRAP !== "1"
  ) {
    return ["--import", "tsx", "src/sandbox/runner/index.ts"];
  }
  return ["runner.mjs"];
}

async function createSandbox() {
  const snapshotId = process.env.BASE_SANDBOX_IMAGE;
  const commonParams = {
    ...vercelSandboxCredentials(),
    env: {
      OPENAI_API_KEY: openAiApiKey(),
    },
    timeout: numberEnv("DRIP_SANDBOX_TIMEOUT_MS", 30 * 60 * 1000),
    resources: {
      vcpus: numberEnv("DRIP_SANDBOX_VCPUS", 2),
    },
  };

  if (snapshotId) {
    return await Sandbox.create({
      ...commonParams,
      source: {
        type: "snapshot",
        snapshotId,
      },
    });
  }

  return await Sandbox.create({
    ...commonParams,
    runtime: process.env.DRIP_SANDBOX_RUNTIME ?? "node24",
  });
}

function vercelSandboxCredentials(): VercelSandboxCredentials {
  const hasVercelToken = Boolean(process.env.VERCEL_TOKEN);
  const hasOidcToken = Boolean(process.env.VERCEL_OIDC_TOKEN);
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;

  if ((!hasVercelToken && !hasOidcToken) || !teamId || !projectId) {
    const missing = [
      hasVercelToken || hasOidcToken ? null : "VERCEL_TOKEN or VERCEL_OIDC_TOKEN",
      teamId ? null : "VERCEL_TEAM_ID",
      projectId ? null : "VERCEL_PROJECT_ID",
    ].filter((value): value is string => value !== null);
    throw new Error(
      `Vercel Sandbox credentials are required: missing ${missing.join(", ")}.`,
    );
  }

  return {
    teamId,
    projectId,
    ...(process.env.VERCEL_TOKEN ? { token: process.env.VERCEL_TOKEN } : {}),
  };
}

async function runSandboxCommand(
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>,
  label: string,
  command: Parameters<Awaited<ReturnType<typeof Sandbox.create>>["runCommand"]>[0],
) {
  const result = await sandbox.runCommand(command);
  if (result.exitCode !== 0) {
    const stderr = await result.stderr();
    throw new Error(`${label} failed: ${stderr}`);
  }
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function openAiApiKey() {
  return process.env.OPENAI_API_KEY ?? requiredEnv("CODEX_API_KEY");
}

function runnerConvexUrl() {
  return (
    process.env.DRIP_RUNNER_CONVEX_URL ??
    process.env.NEXT_PUBLIC_CONVEX_URL ??
    requiredEnv("CONVEX_URL")
  );
}

function numberEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a finite number.`);
  }
  return parsed;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
