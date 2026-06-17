export type RunnerConfig = {
  codexReasoningEffort: ModelReasoningEffort;
  codexNetworkAccessEnabled: boolean;
  codexWebSearchMode: WebSearchMode;
  convexRequestTimeoutMs: number;
  convexUrl: string;
  dropStage?: DropStage;
  heartbeatMs: number;
  ingestToken: string;
  model: string;
  openAiApiKey: string;
  sandboxRunId: string;
  workingDirectory: string;
};

type Env = Record<string, string | undefined>;

export function readRunnerConfig(env: Env = process.env) {
  const dropStage = readDropStage(env.DRIP_DROP_STAGE);
  return {
    codexNetworkAccessEnabled: booleanEnv(
      env,
      "DRIP_CODEX_NETWORK_ACCESS_ENABLED",
      false,
    ),
    codexReasoningEffort: reasoningEffort(
      env.CODEX_REASONING_EFFORT,
    ),
    codexWebSearchMode: webSearchMode(env.CODEX_WEB_SEARCH_MODE, dropStage),
    convexRequestTimeoutMs: numberEnv(
      env,
      "DRIP_RUNNER_CONVEX_REQUEST_TIMEOUT_MS",
      20_000,
    ),
    convexUrl: must(env, "CONVEX_URL"),
    ...(dropStage ? { dropStage } : {}),
    heartbeatMs: numberEnv(env, "DRIP_HEARTBEAT_MS", 5000),
    ingestToken: must(env, "INGEST_TOKEN"),
    model: env.CODEX_MODEL ?? "gpt-5.5",
    openAiApiKey: must(env, "OPENAI_API_KEY"),
    sandboxRunId: env.SANDBOX_RUN_ID ?? must(env, "RUN_ID"),
    workingDirectory: env.WORKING_DIRECTORY ?? process.cwd(),
  } satisfies RunnerConfig;
}

function reasoningEffort(value: string | undefined): ModelReasoningEffort {
  if (value === undefined) {
    return "low";
  }
  if (
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh"
  ) {
    return value;
  }
  throw new Error("CODEX_REASONING_EFFORT must be minimal, low, medium, high, or xhigh.");
}

function webSearchMode(
  value: string | undefined,
  dropStage: DropStage | undefined,
): WebSearchMode {
  if (value === undefined) {
    return dropStage === "scout" ? "live" : "disabled";
  }
  if (value === "disabled" || value === "cached" || value === "live") {
    return value;
  }
  throw new Error("CODEX_WEB_SEARCH_MODE must be disabled, cached, or live.");
}

function must(env: Env, name: string) {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function numberEnv(env: Env, name: string, fallback: number) {
  const raw = env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a finite number.`);
  }
  return parsed;
}

function booleanEnv(env: Env, name: string, fallback: boolean) {
  const raw = env[name];
  if (!raw) {
    return fallback;
  }
  if (raw === "1" || raw.toLowerCase() === "true") {
    return true;
  }
  if (raw === "0" || raw.toLowerCase() === "false") {
    return false;
  }
  throw new Error(`${name} must be true or false.`);
}

type ModelReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
type WebSearchMode = "disabled" | "cached" | "live";
type DropStage = "scout" | "designer" | "marketer" | "builder";

function readDropStage(value: string | undefined): DropStage | undefined {
  if (
    value === "scout" ||
    value === "designer" ||
    value === "marketer" ||
    value === "builder"
  ) {
    return value;
  }
  return undefined;
}
