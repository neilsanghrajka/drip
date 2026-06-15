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
    const env = codexEnv(config.workingDirectory);
    await emit("runner.started", {
      codexEnvPresence: envPresence(env),
      cwd: config.workingDirectory,
      networkAccessEnabled: config.codexNetworkAccessEnabled,
      nodeVersion: process.version,
      runnerEnvPresence: envPresence(process.env),
    });
    await maybeHeartbeat(true);

    const { Codex } = await import("@openai/codex-sdk");
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
    "ACCESS_TOKEN",
    "AD_ACCOUNT_ID",
    "BUSINESS_ID",
    "DRIP_DROP_SITES_VERCEL_PROJECT",
    "DRIP_DROP_SITES_VERCEL_SCOPE",
    "META_ADS_ACCESS_TOKEN",
    "META_ADS_AD_ACCOUNT_ID",
    "META_ADS_BUSINESS_ID",
    "VERCEL_DEPLOY_TOKEN",
    "VERCEL_TEAM_ID",
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
  if (!env.ACCESS_TOKEN && env.META_ADS_ACCESS_TOKEN) {
    env.ACCESS_TOKEN = env.META_ADS_ACCESS_TOKEN;
  }
  if (!env.AD_ACCOUNT_ID && env.META_ADS_AD_ACCOUNT_ID) {
    env.AD_ACCOUNT_ID = env.META_ADS_AD_ACCOUNT_ID;
  }
  if (!env.BUSINESS_ID && env.META_ADS_BUSINESS_ID) {
    env.BUSINESS_ID = env.META_ADS_BUSINESS_ID;
  }

  return env;
}

function envPresence(env: NodeJS.ProcessEnv | Record<string, string>) {
  return {
    EXA_API_KEY: Boolean(env.EXA_API_KEY),
    META_ADS_ACCESS_TOKEN: Boolean(
      env.META_ADS_ACCESS_TOKEN ?? env.ACCESS_TOKEN,
    ),
    META_ADS_AD_ACCOUNT_ID: Boolean(
      env.META_ADS_AD_ACCOUNT_ID ?? env.AD_ACCOUNT_ID,
    ),
    META_ADS_BUSINESS_ID: Boolean(env.META_ADS_BUSINESS_ID ?? env.BUSINESS_ID),
    DRIP_DROP_SITES_VERCEL_PROJECT: Boolean(
      env.DRIP_DROP_SITES_VERCEL_PROJECT,
    ),
    VERCEL_DEPLOY_TOKEN: Boolean(env.VERCEL_DEPLOY_TOKEN),
    VERCEL_TEAM_ID: Boolean(env.VERCEL_TEAM_ID),
    X_BEARER_TOKEN: Boolean(env.X_BEARER_TOKEN),
    TWITTER_BEARER_TOKEN: Boolean(env.TWITTER_BEARER_TOKEN),
  };
}

function runnerPath() {
  const currentPath = process.env.PATH ?? "/usr/bin:/bin";
  const runnerNodeBin = `${process.cwd()}/node_modules/.bin`;
  const userLocalBin = `${process.env.HOME ?? "/tmp"}/.local/bin`;
  return [runnerNodeBin, userLocalBin, currentPath]
    .filter((entry, index, entries) => entries.indexOf(entry) === index)
    .join(":");
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
