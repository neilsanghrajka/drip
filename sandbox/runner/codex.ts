import path from "node:path";

import type { RunnerConfig } from "./config";
import type { RunnerControlClient } from "./convex";

type Usage = {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
};

type ThreadEvent = {
  type: string;
  [key: string]: unknown;
};

type CodexRunResult = {
  codexThreadId?: string;
  finalResponse: string;
  usage: Usage | null;
};

export async function runCodexSdk({
  config,
  control,
}: {
  config: RunnerConfig;
  control: RunnerControlClient;
}) {
  const sandboxRun = await control.getSandboxRun();
  let seq = 1;
  let lastHeartbeatAt = 0;
  let cancelRequested = sandboxRun.cancelRequested;
  let codexThreadId: string | undefined;
  let finalResponse = "";
  let usage: Usage | null = null;
  const abortController = new AbortController();

  const emit = async (type: string, payload: unknown) => {
    const result = await control.ingest({
      seq: seq++,
      type,
      payload,
    });
    if (!result.accepted) {
      throw new Error(`Event rejected, expected seq ${result.expectedSeq}.`);
    }
  };

  const maybeHeartbeat = async (force = false) => {
    const timestamp = Date.now();
    if (!force && timestamp - lastHeartbeatAt < config.heartbeatMs) {
      return;
    }

    lastHeartbeatAt = timestamp;
    const heartbeat = await control.heartbeat();
    await emit("runner.heartbeat", {
      cancelRequested: heartbeat.cancelRequested,
    });
    if (heartbeat.cancelRequested) {
      cancelRequested = true;
      abortController.abort("Run cancelled.");
    }
  };

  try {
    await emit("runner.started", {
      cwd: config.workingDirectory,
      nodeVersion: process.version,
    });
    await maybeHeartbeat(true);

    const { Codex } = await import("@openai/codex-sdk");
    const env = codexEnv(config.workingDirectory);
    const codex = new Codex({
      apiKey: config.openAiApiKey,
      env,
    });
    const thread = codex.startThread({
      approvalPolicy: "never",
      model: config.model,
      modelReasoningEffort: config.codexReasoningEffort,
      networkAccessEnabled: config.codexNetworkAccessEnabled,
      sandboxMode: "danger-full-access",
      skipGitRepoCheck: true,
      webSearchMode: "disabled",
      workingDirectory: config.workingDirectory,
    });
    const { events } = await thread.runStreamed(sandboxRun.task, {
      signal: abortController.signal,
    });

    for await (const event of events) {
      ({ codexThreadId, finalResponse, usage } = absorbCodexEvent(event, {
        codexThreadId,
        finalResponse,
        usage,
      }));
      await emit(event.type, event);

      if (event.type === "turn.failed") {
        throw new Error(readErrorMessage(event));
      }
      if (event.type === "error") {
        throw new Error(readEventMessage(event));
      }

      await maybeHeartbeat();
    }

    const result: CodexRunResult = {
      codexThreadId,
      finalResponse,
      usage,
    };
    await emit("runner.finished", result);
    await control.finish({
      status: cancelRequested ? "cancelled" : "succeeded",
      result,
    });
  } catch (error) {
    const runError = normalizeError(error);
    await emit("runner.error", runError).catch(() => undefined);
    await control.finish({
      status: cancelRequested ? "cancelled" : "failed",
      error: runError,
    });
    if (!cancelRequested) {
      throw error;
    }
  }
}

function codexEnv(workingDirectory: string) {
  const env: Record<string, string> = {
    CODEX_HOME: path.join(workingDirectory, ".codex"),
    HOME: process.env.HOME ?? "/tmp",
    NODE_ENV: "production",
    PATH: runnerPath(),
    TMPDIR: process.env.TMPDIR ?? "/tmp",
  };

  for (const name of [
    "OPENAI_API_KEY",
    "EXA_API_KEY",
    "X_BEARER_TOKEN",
    "TWITTER_BEARER_TOKEN",
  ]) {
    const value = process.env[name];
    if (value) {
      env[name] = value;
    }
  }

  if (!env.TWITTER_BEARER_TOKEN && env.X_BEARER_TOKEN) {
    env.TWITTER_BEARER_TOKEN = env.X_BEARER_TOKEN;
  }
  if (!env.X_BEARER_TOKEN && env.TWITTER_BEARER_TOKEN) {
    env.X_BEARER_TOKEN = env.TWITTER_BEARER_TOKEN;
  }

  return env;
}

function runnerPath() {
  const currentPath = process.env.PATH ?? "/usr/bin:/bin";
  const runnerNodeBin = `${process.cwd()}/node_modules/.bin`;
  return currentPath.includes(runnerNodeBin)
    ? currentPath
    : `${runnerNodeBin}:${currentPath}`;
}

function absorbCodexEvent(
  event: ThreadEvent,
  state: CodexRunResult,
): CodexRunResult {
  if (event.type === "thread.started") {
    const threadId = event.thread_id;
    return {
      ...state,
      codexThreadId: typeof threadId === "string" ? threadId : state.codexThreadId,
    };
  }
  if (event.type === "item.completed" && isAgentMessageItem(event.item)) {
    return {
      ...state,
      finalResponse: event.item.text,
    };
  }
  if (event.type === "turn.completed") {
    return {
      ...state,
      usage: isUsage(event.usage) ? event.usage : state.usage,
    };
  }

  return state;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAgentMessageItem(
  value: unknown,
): value is { type: "agent_message"; text: string } {
  return (
    isRecord(value) &&
    value.type === "agent_message" &&
    typeof value.text === "string"
  );
}

function isUsage(value: unknown): value is Usage {
  return (
    isRecord(value) &&
    typeof value.input_tokens === "number" &&
    typeof value.cached_input_tokens === "number" &&
    typeof value.output_tokens === "number" &&
    typeof value.reasoning_output_tokens === "number"
  );
}

function readErrorMessage(event: ThreadEvent) {
  const error = event.error;
  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }
  return "Codex turn failed.";
}

function readEventMessage(event: ThreadEvent) {
  return typeof event.message === "string" ? event.message : "Codex error.";
}

function normalizeError(error: unknown) {
  return {
    message: error instanceof Error ? error.message : String(error),
    code: "runner_error",
  };
}
