import path from "node:path";

export type Usage = {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
};

export type ThreadEvent = {
  type: string;
  [key: string]: unknown;
};

export type CodexRunResult = {
  codexThreadId?: string;
  finalResponse: string;
  usage: Usage | null;
};

type Env = Record<string, string | undefined>;

export function codexEnv(
  workingDirectory: string,
  sourceEnv: Env = process.env,
  currentDirectory = process.cwd(),
) {
  const env: Record<string, string> = {
    CODEX_HOME: path.join(workingDirectory, ".codex"),
    HOME: sourceEnv.HOME ?? "/tmp",
    NODE_ENV: "production",
    PATH: runnerPath(sourceEnv, currentDirectory),
    TMPDIR: sourceEnv.TMPDIR ?? "/tmp",
  };

  for (const name of [
    "OPENAI_API_KEY",
    "EXA_API_KEY",
    "X_BEARER_TOKEN",
    "TWITTER_BEARER_TOKEN",
    "ACCESS_TOKEN",
    "AD_ACCOUNT_ID",
    "BUSINESS_ID",
    "PAGE_ID",
    "DRIP_DROP_SITES_VERCEL_PROJECT",
    "DRIP_DROP_SITES_VERCEL_SCOPE",
    "META_ADS_ACCESS_TOKEN",
    "META_ADS_AD_ACCOUNT_ID",
    "META_ADS_BUSINESS_ID",
    "META_ADS_PAGE_ID",
    "VERCEL_DEPLOY_TOKEN",
    "VERCEL_TEAM_ID",
  ]) {
    const value = sourceEnv[name];
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
  if (!env.PAGE_ID && env.META_ADS_PAGE_ID) {
    env.PAGE_ID = env.META_ADS_PAGE_ID;
  }

  return env;
}

export function envPresence(env: Env) {
  return {
    EXA_API_KEY: Boolean(env.EXA_API_KEY),
    META_ADS_ACCESS_TOKEN: Boolean(
      env.META_ADS_ACCESS_TOKEN ?? env.ACCESS_TOKEN,
    ),
    META_ADS_AD_ACCOUNT_ID: Boolean(
      env.META_ADS_AD_ACCOUNT_ID ?? env.AD_ACCOUNT_ID,
    ),
    META_ADS_BUSINESS_ID: Boolean(env.META_ADS_BUSINESS_ID ?? env.BUSINESS_ID),
    META_ADS_PAGE_ID: Boolean(env.META_ADS_PAGE_ID ?? env.PAGE_ID),
    DRIP_DROP_SITES_VERCEL_PROJECT: Boolean(
      env.DRIP_DROP_SITES_VERCEL_PROJECT,
    ),
    VERCEL_DEPLOY_TOKEN: Boolean(env.VERCEL_DEPLOY_TOKEN),
    VERCEL_TEAM_ID: Boolean(env.VERCEL_TEAM_ID),
    X_BEARER_TOKEN: Boolean(env.X_BEARER_TOKEN),
    TWITTER_BEARER_TOKEN: Boolean(env.TWITTER_BEARER_TOKEN),
  };
}

export function absorbCodexEvent(
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

export function isTerminalFinalResponse(
  text: string,
  expectedOutputPath: string | undefined,
) {
  if (!expectedOutputPath) {
    return false;
  }
  if (!text.includes(expectedOutputPath)) {
    return false;
  }
  return /\b(done|wrote|written|saved|created|generated|completed|finished|validated|ready)\b/i.test(
    text,
  );
}

export function readErrorMessage(event: ThreadEvent) {
  const error = event.error;
  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }
  return "Codex turn failed.";
}

export function readEventMessage(event: ThreadEvent) {
  return typeof event.message === "string" ? event.message : "Codex error.";
}

export function normalizeError(error: unknown) {
  return {
    message: error instanceof Error ? error.message : String(error),
    code: "runner_error",
  };
}

function runnerPath(sourceEnv: Env, currentDirectory: string) {
  const currentPath = sourceEnv.PATH ?? "/usr/bin:/bin";
  const runnerNodeBin = `${currentDirectory}/node_modules/.bin`;
  const userLocalBin = `${sourceEnv.HOME ?? "/tmp"}/.local/bin`;
  return [runnerNodeBin, userLocalBin, currentPath]
    .filter((entry, index, entries) => entries.indexOf(entry) === index)
    .join(":");
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
