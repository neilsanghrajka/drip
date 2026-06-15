"use node";

import { Sandbox } from "@vercel/sandbox";
import { ConvexHttpClient } from "convex/browser";
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

const getSandboxRunForRunner = makeFunctionReference<
  "mutation",
  { sandboxRunId: Id<"sandboxRuns">; ingestToken: string },
  { task: string; cancelRequested: boolean }
>("sandboxRuns:getSandboxRunForRunner") as unknown as FunctionReference<
  "mutation",
  "public",
  { sandboxRunId: Id<"sandboxRuns">; ingestToken: string },
  { task: string; cancelRequested: boolean }
>;

const ingestSandboxRunEvent = makeFunctionReference<
  "mutation",
  {
    sandboxRunId: Id<"sandboxRuns">;
    ingestToken: string;
    seq: number;
    type: string;
    payload: unknown;
  },
  { accepted: boolean; expectedSeq: number }
>("sandboxRuns:ingestSandboxRunEvent") as unknown as FunctionReference<
  "mutation",
  "public",
  {
    sandboxRunId: Id<"sandboxRuns">;
    ingestToken: string;
    seq: number;
    type: string;
    payload: unknown;
  },
  { accepted: boolean; expectedSeq: number }
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
      const convexUrl = runnerConvexUrl();
      await assertRunnerCallbackReachable({
        convexUrl,
        sandboxRunId: args.sandboxRunId,
        ingestToken,
      });
      const sandbox = await createSandbox(sandboxRun);
      const command = await sandbox.runCommand({
        cmd: "node",
        args: sandboxRunnerArgs(),
        cwd: sandboxRunnerCwd(),
        detached: true,
        env: {
          CONVEX_URL: convexUrl,
          INGEST_TOKEN: ingestToken,
          OPENAI_API_KEY: openAiApiKey(),
          SANDBOX_RUN_ID: args.sandboxRunId,
          CODEX_MODEL: process.env.CODEX_MODEL ?? "gpt-5.5",
          CODEX_REASONING_EFFORT:
            process.env.CODEX_REASONING_EFFORT ?? "low",
          DRIP_CODEX_NETWORK_ACCESS_ENABLED:
            process.env.DRIP_CODEX_NETWORK_ACCESS_ENABLED ?? "false",
          ...optionalEnv("DRIP_RUNNER_CONVEX_REQUEST_TIMEOUT_MS"),
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
      const failure = normalizeSandboxStartError(error);
      await ctx.runMutation(markSandboxRunFailedFromAction, {
        sandboxRunId: args.sandboxRunId,
        error: failure,
      });
      throw new Error(failure.message);
    }
  },
});

async function assertRunnerCallbackReachable({
  convexUrl,
  sandboxRunId,
  ingestToken,
}: {
  convexUrl: string;
  sandboxRunId: Id<"sandboxRuns">;
  ingestToken: string;
}) {
  const client = new ConvexHttpClient(convexUrl, { logger: false });
  const timeoutMs = numberEnv("DRIP_RUNNER_CALLBACK_PREFLIGHT_TIMEOUT_MS", 15_000);
  try {
    await Promise.race([
      client.mutation(getSandboxRunForRunner, {
        sandboxRunId,
        ingestToken,
      }),
      timeout(timeoutMs, "runner callback preflight timed out"),
    ]);
    const ingestPreflight = await Promise.race([
      client.mutation(ingestSandboxRunEvent, {
        sandboxRunId,
        ingestToken,
        seq: 0,
        type: "runner.preflight",
        payload: null,
      }),
      timeout(timeoutMs, "runner ingest preflight timed out"),
    ]);
    if (ingestPreflight.accepted || ingestPreflight.expectedSeq !== 1) {
      throw new Error("runner ingest preflight returned an unexpected sequence");
    }
  } catch (error) {
    throw new Error(`Runner callback preflight failed: ${errorMessage(error)}`);
  }
}

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
  const pageId = process.env.META_ADS_PAGE_ID ?? process.env.PAGE_ID;

  return {
    ...(accessToken ? { META_ADS_ACCESS_TOKEN: accessToken } : {}),
    ...(adAccountId ? { META_ADS_AD_ACCOUNT_ID: adAccountId } : {}),
    ...(businessId ? { META_ADS_BUSINESS_ID: businessId } : {}),
    ...(pageId ? { META_ADS_PAGE_ID: pageId } : {}),
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
  return (
    process.env.DRIP_RUNNER_CONVEX_URL ??
    process.env.NEXT_PUBLIC_CONVEX_URL ??
    process.env.CONVEX_URL ??
    requiredEnv("CONVEX_CLOUD_URL")
  );
}

function sandboxRunnerCwd() {
  return process.env.DRIP_SANDBOX_RUNNER_CWD ?? "/vercel/sandbox/runner";
}

function sandboxRunnerEntrypoint() {
  return process.env.DRIP_SANDBOX_RUNNER_ENTRYPOINT ?? "index.ts";
}

function sandboxRunnerArgs() {
  const entrypoint = sandboxRunnerEntrypoint();
  if (entrypoint !== "index.ts") {
    return ["--import", "tsx", entrypoint];
  }

  return [
    "--import",
    "tsx",
    "--input-type=module",
    "--eval",
    defaultSandboxRunnerScript(),
  ];
}

function defaultSandboxRunnerScript() {
  return `
const errorMessage = (error) => error instanceof Error ? error.message : String(error);
const requestTimeoutMs = Number(process.env.DRIP_RUNNER_CONVEX_REQUEST_TIMEOUT_MS ?? 20000);
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await originalFetch(input, { ...init, signal: init.signal ?? controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(\`Convex runner request timed out after \${requestTimeoutMs}ms.\`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};
let control;
try {
  console.log("drip-runner: boot");
  const [{ readRunnerConfig }, { createRunnerControlClient }, { runCodexSdk }] = await Promise.all([
    import("./config.ts"),
    import("./convex.ts"),
    import("./codex.ts"),
  ]);
  const config = readRunnerConfig();
  const baseControl = createRunnerControlClient(config);
  control = {
    async getSandboxRun() {
      console.log("drip-runner: control.getSandboxRun:start");
      const result = await baseControl.getSandboxRun();
      console.log("drip-runner: control.getSandboxRun:done");
      return result;
    },
    async ingest(event) {
      console.log(\`drip-runner: control.ingest:start:\${event.type}\`);
      const result = await baseControl.ingest(event);
      console.log(\`drip-runner: control.ingest:done:\${event.type}:\${result.accepted}\`);
      return result;
    },
    async heartbeat() {
      console.log("drip-runner: control.heartbeat:start");
      const result = await baseControl.heartbeat();
      console.log("drip-runner: control.heartbeat:done");
      return result;
    },
    async finish(input) {
      console.log(\`drip-runner: control.finish:start:\${input.status}\`);
      const result = await baseControl.finish(input);
      console.log(\`drip-runner: control.finish:done:\${result.status}\`);
      return result;
    },
  };
  console.log("drip-runner: checking-control");
  await control.getSandboxRun();
  console.log("drip-runner: control-ready");
  await runCodexSdk({ config, control });
  console.log("drip-runner: done");
} catch (error) {
  const message = errorMessage(error);
  console.error(message);
  if (control) {
    await control.finish({
      status: "failed",
      error: { message, code: "runner_process_failed" },
    }).catch((finishError) => {
      console.error(\`Failed to mark sandbox run failed: \${errorMessage(finishError)}\`);
    });
  }
  process.exitCode = 1;
}
`.trim();
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

function timeout(ms: number, message: string) {
  return new Promise<never>((_resolve, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeSandboxStartError(error: unknown) {
  const status = httpStatus(error);
  if (status === 402) {
    return {
      message:
        "Vercel Sandbox creation is blocked for the configured team/project (HTTP 402). Check Sandbox entitlement, billing/quota, and VERCEL_TEAM_ID/VERCEL_PROJECT_ID scope, then retry.",
      code: "vercel_sandbox_scope_or_entitlement",
    };
  }
  if (status === 403) {
    return {
      message:
        "Vercel Sandbox creation is forbidden for the configured team/project (HTTP 403). Check the Vercel token permissions and sandbox scope, then retry.",
      code: "vercel_sandbox_forbidden",
    };
  }
  return {
    message: errorMessage(error),
    code: "sandbox_start_failed",
  };
}

function httpStatus(error: unknown) {
  if (!isRecord(error)) {
    return null;
  }
  const response = error.response;
  if (!isRecord(response)) {
    return null;
  }
  if (typeof response.status === "number") {
    return response.status;
  }
  if (typeof response.statusCode === "number") {
    return response.statusCode;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
