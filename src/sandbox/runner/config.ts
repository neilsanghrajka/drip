export type RunnerConfig = {
  codexReasoningEffort: ModelReasoningEffort;
  convexUrl: string;
  heartbeatMs: number;
  ingestToken: string;
  model: string;
  openAiApiKey: string;
  sandboxRunId: string;
  workingDirectory: string;
};

export function readRunnerConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    codexReasoningEffort: reasoningEffort(env.CODEX_REASONING_EFFORT),
    convexUrl: must(env, "CONVEX_URL"),
    heartbeatMs: numberEnv(env, "DRIP_HEARTBEAT_MS", 5000),
    ingestToken: must(env, "INGEST_TOKEN"),
    model: env.CODEX_MODEL ?? "gpt-5.5",
    openAiApiKey: must(env, "OPENAI_API_KEY"),
    sandboxRunId: env.SANDBOX_RUN_ID ?? must(env, "RUN_ID"),
    workingDirectory: env.WORKING_DIRECTORY ?? process.cwd(),
  } satisfies RunnerConfig;
}

function reasoningEffort(
  value: string | undefined,
): ModelReasoningEffort {
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

function must(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function numberEnv(env: NodeJS.ProcessEnv, name: string, fallback: number) {
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

type ModelReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
