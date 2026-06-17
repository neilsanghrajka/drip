import { describe, expect, it } from "vitest";

import {
  absorbCodexEvent,
  codexEnv,
  envPresence,
  isTerminalFinalResponse,
  normalizeError,
  readErrorMessage,
  readEventMessage,
} from "../../../agent/runner/codexLogic";

describe("codex runner logic", () => {
  it("aliases X/Twitter and Meta env names for the Codex child process", () => {
    const env = codexEnv(
      "/workspace",
      {
        HOME: "/home/test",
        PATH: "/usr/bin",
        TMPDIR: "/tmp/test",
        X_BEARER_TOKEN: "x-token",
        META_ADS_ACCESS_TOKEN: "meta-token",
        META_ADS_AD_ACCOUNT_ID: "act_123",
        META_ADS_BUSINESS_ID: "biz_123",
        META_ADS_PAGE_ID: "page_123",
      },
      "/runner",
    );

    expect(env.CODEX_HOME).toBe("/workspace/.codex");
    expect(env.TWITTER_BEARER_TOKEN).toBe("x-token");
    expect(env.ACCESS_TOKEN).toBe("meta-token");
    expect(env.AD_ACCOUNT_ID).toBe("act_123");
    expect(env.BUSINESS_ID).toBe("biz_123");
    expect(env.PAGE_ID).toBe("page_123");
    expect(env.PATH.split(":").slice(0, 2)).toEqual([
      "/runner/node_modules/.bin",
      "/home/test/.local/bin",
    ]);
  });

  it("reports env presence using either canonical or compatibility names", () => {
    expect(
      envPresence({
        ACCESS_TOKEN: "token",
        AD_ACCOUNT_ID: "act",
        TWITTER_BEARER_TOKEN: "twitter",
      }),
    ).toMatchObject({
      META_ADS_ACCESS_TOKEN: true,
      META_ADS_AD_ACCOUNT_ID: true,
      TWITTER_BEARER_TOKEN: true,
      X_BEARER_TOKEN: false,
    });
  });

  it("absorbs thread ids, final responses, and usage only from expected events", () => {
    const usage = {
      input_tokens: 10,
      cached_input_tokens: 1,
      output_tokens: 20,
      reasoning_output_tokens: 5,
    };
    const state = { finalResponse: "", usage: null };
    const withThread = absorbCodexEvent(
      { type: "thread.started", thread_id: "thread_123" },
      state,
    );
    const withResponse = absorbCodexEvent(
      {
        type: "item.completed",
        item: { type: "agent_message", text: "Wrote /tmp/output.json" },
      },
      withThread,
    );
    const withUsage = absorbCodexEvent(
      { type: "turn.completed", usage },
      withResponse,
    );

    expect(withUsage).toEqual({
      codexThreadId: "thread_123",
      finalResponse: "Wrote /tmp/output.json",
      usage,
    });
  });

  it("detects terminal final responses and normalizes error messages", () => {
    expect(isTerminalFinalResponse("Saved /workspace/output.json", "/workspace/output.json")).toBe(
      true,
    );
    expect(
      isTerminalFinalResponse(
        "I’m writing `/workspace/output.json` with compact card fields.",
        "/workspace/output.json",
      ),
    ).toBe(false);
    expect(isTerminalFinalResponse("Saved output", undefined)).toBe(false);
    expect(readErrorMessage({ type: "turn.failed", error: { message: "boom" } })).toBe("boom");
    expect(readEventMessage({ type: "error", message: "bad" })).toBe("bad");
    expect(normalizeError(new Error("bad"))).toEqual({
      message: "bad",
      code: "runner_error",
    });
  });
});
