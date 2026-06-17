import { describe, expect, it } from "vitest";

import { readRunnerConfig } from "../../../agent/runner/config";

const requiredEnv = {
  CONVEX_URL: "https://example.convex.cloud",
  INGEST_TOKEN: "runner-token",
  OPENAI_API_KEY: "sk-test",
  RUN_ID: "run_123",
};

describe("readRunnerConfig", () => {
  it("uses safe defaults for optional runner settings", () => {
    const config = readRunnerConfig(requiredEnv);

    expect(config).toMatchObject({
      codexNetworkAccessEnabled: false,
      codexReasoningEffort: "low",
      codexWebSearchMode: "disabled",
      convexRequestTimeoutMs: 20_000,
      heartbeatMs: 5000,
      model: "gpt-5.5",
      sandboxRunId: "run_123",
    });
  });

  it("prefers SANDBOX_RUN_ID over RUN_ID and parses explicit options", () => {
    const config = readRunnerConfig({
      ...requiredEnv,
      CODEX_MODEL: "gpt-5.5-mini",
      CODEX_REASONING_EFFORT: "xhigh",
      DRIP_CODEX_NETWORK_ACCESS_ENABLED: "true",
      DRIP_HEARTBEAT_MS: "750",
      DRIP_RUNNER_CONVEX_REQUEST_TIMEOUT_MS: "1234",
      SANDBOX_RUN_ID: "sandbox_run_456",
      WORKING_DIRECTORY: "/workspace",
    });

    expect(config.codexNetworkAccessEnabled).toBe(true);
    expect(config.codexReasoningEffort).toBe("xhigh");
    expect(config.codexWebSearchMode).toBe("disabled");
    expect(config.convexRequestTimeoutMs).toBe(1234);
    expect(config.heartbeatMs).toBe(750);
    expect(config.model).toBe("gpt-5.5-mini");
    expect(config.sandboxRunId).toBe("sandbox_run_456");
    expect(config.workingDirectory).toBe("/workspace");
  });

  it("uses Scout-specific web search with low reasoning when the drop stage is scout", () => {
    const config = readRunnerConfig({
      ...requiredEnv,
      DRIP_DROP_STAGE: "scout",
    });

    expect(config.dropStage).toBe("scout");
    expect(config.codexReasoningEffort).toBe("low");
    expect(config.codexWebSearchMode).toBe("live");
  });

  it("keeps non-Scout drop stages on conservative Codex defaults", () => {
    const config = readRunnerConfig({
      ...requiredEnv,
      DRIP_DROP_STAGE: "designer",
    });

    expect(config.dropStage).toBe("designer");
    expect(config.codexReasoningEffort).toBe("low");
    expect(config.codexWebSearchMode).toBe("disabled");
  });

  it("lets explicit Codex web search and reasoning env override stage defaults", () => {
    const config = readRunnerConfig({
      ...requiredEnv,
      CODEX_REASONING_EFFORT: "high",
      CODEX_WEB_SEARCH_MODE: "cached",
      DRIP_DROP_STAGE: "scout",
    });

    expect(config.codexReasoningEffort).toBe("high");
    expect(config.codexWebSearchMode).toBe("cached");
  });

  it("rejects malformed booleans, numbers, reasoning effort, and web search mode", () => {
    expect(() =>
      readRunnerConfig({
        ...requiredEnv,
        DRIP_CODEX_NETWORK_ACCESS_ENABLED: "yes",
      }),
    ).toThrow("DRIP_CODEX_NETWORK_ACCESS_ENABLED must be true or false.");

    expect(() =>
      readRunnerConfig({
        ...requiredEnv,
        DRIP_HEARTBEAT_MS: "soon",
      }),
    ).toThrow("DRIP_HEARTBEAT_MS must be a finite number.");

    expect(() =>
      readRunnerConfig({
        ...requiredEnv,
        CODEX_REASONING_EFFORT: "maximum",
      }),
    ).toThrow("CODEX_REASONING_EFFORT must be minimal, low, medium, high, or xhigh.");

    expect(() =>
      readRunnerConfig({
        ...requiredEnv,
        CODEX_WEB_SEARCH_MODE: "always",
      }),
    ).toThrow("CODEX_WEB_SEARCH_MODE must be disabled, cached, or live.");
  });
});
