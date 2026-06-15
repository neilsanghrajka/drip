"use node";

import { Sandbox } from "@vercel/sandbox";
import {
  makeFunctionReference,
  type FunctionReference,
} from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { action } from "./_generated/server";

type SandboxRunDoc = Doc<"sandboxRuns">;

type VercelSandboxCredentials = {
  teamId: string;
  projectId: string;
  token?: string;
};
type SandboxGetOrCreateParams = NonNullable<
  Parameters<typeof Sandbox.getOrCreate>[0]
>;
type SnapshotSandboxParams = NonNullable<Parameters<typeof Sandbox.create>[0]> & {
  name: string;
  resume?: boolean;
  onCreate?: (sandbox: Sandbox) => Promise<void>;
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
      const sandbox = await createSandbox(sandboxRun);
      const command = await sandbox.runCommand({
        cmd: "node",
        args: ["--import", "tsx", sandboxRunnerEntrypoint()],
        cwd: sandboxRunnerCwd(),
        detached: true,
        env: {
          CONVEX_URL: runnerConvexUrl(),
          INGEST_TOKEN: ingestToken,
          OPENAI_API_KEY: openAiApiKey(),
          SANDBOX_RUN_ID: args.sandboxRunId,
          CODEX_MODEL: process.env.CODEX_MODEL ?? "gpt-5.5",
          CODEX_REASONING_EFFORT:
            process.env.CODEX_REASONING_EFFORT ?? "low",
          DRIP_CODEX_NETWORK_ACCESS_ENABLED:
            process.env.DRIP_CODEX_NETWORK_ACCESS_ENABLED ?? "false",
          ...optionalDropSitesEnv(),
          ...optionalEnv("EXA_API_KEY"),
          ...optionalMetaAdsEnv(),
          ...optionalEnv("X_BEARER_TOKEN"),
          ...optionalEnv("TWITTER_BEARER_TOKEN"),
          ...optionalDropRunEnv(sandboxRun),
          WORKING_DIRECTORY: sandboxAgentWorkdir(),
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
        sandboxName: sandboxRun.sandboxName,
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

async function createSandbox(sandboxRun: SandboxRunDoc) {
  const snapshotId = requiredEnv("BASE_SANDBOX_IMAGE");
  const commonParams = {
    ...vercelSandboxCredentials(),
    timeout: numberEnv("DRIP_SANDBOX_TIMEOUT_MS", 30 * 60 * 1000),
    resources: {
      vcpus: numberEnv("DRIP_SANDBOX_VCPUS", 2),
    },
  };

  if (sandboxRun.sandboxName) {
    return await getOrCreateSnapshotSandbox({
      ...commonParams,
      name: sandboxRun.sandboxName,
      persistent: true,
      source: {
        type: "snapshot",
        snapshotId,
      },
      snapshotExpiration: numberEnv(
        "DRIP_DROP_SANDBOX_SNAPSHOT_TTL_MS",
        7 * 24 * 60 * 60 * 1000,
      ),
      keepLastSnapshots: {
        count: numberEnv("DRIP_DROP_SANDBOX_KEEP_SNAPSHOTS", 3),
        expiration: numberEnv(
          "DRIP_DROP_SANDBOX_SNAPSHOT_TTL_MS",
          7 * 24 * 60 * 60 * 1000,
        ),
        deleteEvicted: true,
      },
    });
  }

  return await Sandbox.create({
    ...commonParams,
    source: {
      type: "snapshot",
      snapshotId,
    },
  });
}

async function getOrCreateSnapshotSandbox(params: SnapshotSandboxParams) {
  // The runtime supports snapshot sources in getOrCreate; the SDK d.ts models
  // only git/tarball sources for this method in the installed version.
  return await Sandbox.getOrCreate(params as unknown as SandboxGetOrCreateParams);
}

function vercelSandboxCredentials(): VercelSandboxCredentials {
  const token = process.env.VERCEL_TOKEN;
  const hasVercelToken = Boolean(token);
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;

  if (!hasVercelToken || !teamId || !projectId) {
    const missing = [
      hasVercelToken ? null : "VERCEL_TOKEN",
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
    token,
  };
}

function optionalDropRunEnv(sandboxRun: SandboxRunDoc) {
  return {
    ...(sandboxRun.dropId ? { DRIP_DROP_ID: sandboxRun.dropId } : {}),
    ...(sandboxRun.dropStageRunId
      ? { DRIP_DROP_STAGE_RUN_ID: sandboxRun.dropStageRunId }
      : {}),
    ...(sandboxRun.stage ? { DRIP_DROP_STAGE: sandboxRun.stage } : {}),
    ...(sandboxRun.expectedOutputPath
      ? { DRIP_EXPECTED_OUTPUT_PATH: sandboxRun.expectedOutputPath }
      : {}),
  };
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function optionalEnv(name: string) {
  const value = process.env[name];
  return value ? { [name]: value } : {};
}

function optionalMetaAdsEnv() {
  const accessToken = process.env.META_ADS_ACCESS_TOKEN ?? process.env.ACCESS_TOKEN;
  const adAccountId = process.env.META_ADS_AD_ACCOUNT_ID ?? process.env.AD_ACCOUNT_ID;
  const businessId = process.env.META_ADS_BUSINESS_ID ?? process.env.BUSINESS_ID;

  return {
    ...(accessToken ? { META_ADS_ACCESS_TOKEN: accessToken } : {}),
    ...(adAccountId ? { META_ADS_AD_ACCOUNT_ID: adAccountId } : {}),
    ...(businessId ? { META_ADS_BUSINESS_ID: businessId } : {}),
  };
}

function optionalDropSitesEnv() {
  return {
    ...optionalEnv("DRIP_DROP_SITES_VERCEL_PROJECT"),
    ...optionalEnv("DRIP_DROP_SITES_VERCEL_SCOPE"),
    ...optionalEnv("VERCEL_DEPLOY_TOKEN"),
    ...optionalEnv("VERCEL_TEAM_ID"),
  };
}

function openAiApiKey() {
  return process.env.OPENAI_API_KEY ?? requiredEnv("CODEX_API_KEY");
}

function runnerConvexUrl() {
  return requiredEnv("CONVEX_CLOUD_URL");
}

function sandboxRunnerCwd() {
  return process.env.DRIP_SANDBOX_RUNNER_CWD ?? "/vercel/sandbox/runner";
}

function sandboxRunnerEntrypoint() {
  return process.env.DRIP_SANDBOX_RUNNER_ENTRYPOINT ?? "index.ts";
}

function sandboxAgentWorkdir() {
  return process.env.DRIP_SANDBOX_AGENT_WORKDIR ?? "/vercel/sandbox/agent-workspace";
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
