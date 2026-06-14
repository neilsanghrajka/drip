export const embeddedSandboxRunnerSource = String.raw`
import { Codex } from "@openai/codex-sdk";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const getSandboxRunForRunner = makeFunctionReference("sandboxRuns:getSandboxRunForRunner");
const ingestSandboxRunEvent = makeFunctionReference("sandboxRuns:ingestSandboxRunEvent");
const heartbeatMutation = makeFunctionReference("sandboxRuns:heartbeatSandboxRun");
const finishSandboxRun = makeFunctionReference("sandboxRuns:finishSandboxRun");

const config = {
  convexUrl: must("CONVEX_URL"),
  heartbeatMs: Number(process.env.DRIP_HEARTBEAT_MS || "5000"),
  ingestToken: must("INGEST_TOKEN"),
  model: process.env.CODEX_MODEL || "gpt-5.5",
  openAiApiKey: must("OPENAI_API_KEY"),
  reasoningEffort: process.env.CODEX_REASONING_EFFORT || "low",
  sandboxRunId: process.env.SANDBOX_RUN_ID || must("RUN_ID"),
  workingDirectory: process.env.WORKING_DIRECTORY || process.cwd(),
};
const convex = new ConvexHttpClient(config.convexUrl);

let seq = 1;
let cancelRequested = false;
let lastHeartbeatAt = 0;

try {
  const sandboxRun = await convex.mutation(getSandboxRunForRunner, {
    sandboxRunId: config.sandboxRunId,
    ingestToken: config.ingestToken,
  });
  cancelRequested = Boolean(sandboxRun.cancelRequested);

  await emit("runner.started", {
    cwd: config.workingDirectory,
    nodeVersion: process.version,
  });
  await maybeHeartbeat(true);

  const codex = new Codex({
    apiKey: config.openAiApiKey,
    env: {
      HOME: process.env.HOME || "/tmp",
      NODE_ENV: "production",
      PATH: process.env.PATH || "/usr/bin:/bin",
      TMPDIR: process.env.TMPDIR || "/tmp",
    },
  });
  const thread = codex.startThread({
    approvalPolicy: "never",
    model: config.model,
    modelReasoningEffort: config.reasoningEffort,
    networkAccessEnabled: false,
    sandboxMode: "danger-full-access",
    skipGitRepoCheck: true,
    webSearchMode: "disabled",
    workingDirectory: config.workingDirectory,
  });
  const abortController = new AbortController();
  const { events } = await thread.runStreamed(sandboxRun.task, {
    signal: abortController.signal,
  });

  let codexThreadId;
  let finalResponse = "";
  let usage = null;

  for await (const event of events) {
    if (event.type === "thread.started") {
      codexThreadId = event.thread_id;
    }
    if (event.type === "item.completed" && event.item?.type === "agent_message") {
      finalResponse = event.item.text;
    }
    if (event.type === "turn.completed") {
      usage = event.usage;
    }

    await emit(event.type, event);

    if (event.type === "turn.failed") {
      throw new Error(event.error?.message || "Codex turn failed.");
    }
    if (event.type === "error") {
      throw new Error(event.message || "Codex error.");
    }

    const heartbeat = await maybeHeartbeat(false);
    if (heartbeat?.cancelRequested) {
      cancelRequested = true;
      abortController.abort("Run cancelled.");
    }
  }

  const result = { codexThreadId, finalResponse, usage };
  await emit("runner.finished", result);
  await convex.mutation(finishSandboxRun, {
    sandboxRunId: config.sandboxRunId,
    ingestToken: config.ingestToken,
    status: cancelRequested ? "cancelled" : "succeeded",
    result,
  });
} catch (error) {
  const runError = normalizeError(error);
  await emit("runner.error", runError).catch(() => undefined);
  await convex.mutation(finishSandboxRun, {
    sandboxRunId: config.sandboxRunId,
    ingestToken: config.ingestToken,
    status: cancelRequested ? "cancelled" : "failed",
    error: runError,
  }).catch(() => undefined);
  if (!cancelRequested) {
    console.error(runError.message);
    process.exitCode = 1;
  }
}

async function emit(type, payload) {
  const result = await convex.mutation(ingestSandboxRunEvent, {
    sandboxRunId: config.sandboxRunId,
    ingestToken: config.ingestToken,
    seq: seq++,
    type,
    payload,
  });
  if (!result.accepted) {
    throw new Error("Event rejected, expected seq " + result.expectedSeq + ".");
  }
}

async function maybeHeartbeat(force) {
  const timestamp = Date.now();
  if (!force && timestamp - lastHeartbeatAt < config.heartbeatMs) {
    return undefined;
  }
  lastHeartbeatAt = timestamp;
  const heartbeat = await convex.mutation(heartbeatMutation, {
    sandboxRunId: config.sandboxRunId,
    ingestToken: config.ingestToken,
  });
  await emit("runner.heartbeat", {
    cancelRequested: heartbeat.cancelRequested,
  });
  return heartbeat;
}

function must(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(name + " is required.");
  }
  return value;
}

function normalizeError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    code: "runner_error",
  };
}
`;

export const embeddedSandboxPackageJson = JSON.stringify(
  {
    private: true,
    packageManager: "pnpm@11.3.0",
    type: "module",
    dependencies: {
      "@openai/codex-sdk": "0.136.0",
      convex: "1.39.1",
    },
  },
  null,
  2,
);
