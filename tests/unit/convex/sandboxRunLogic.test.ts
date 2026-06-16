import { describe, expect, it } from "vitest";

import {
  sandboxRunLastActivityAt,
  shouldMarkSandboxRunLost,
} from "../../../src/convex/sandboxRunLogic";

describe("sandbox run logic", () => {
  it("uses heartbeat before updatedAt for stale-run checks", () => {
    expect(
      sandboxRunLastActivityAt({
        status: "running",
        lastHeartbeatAt: 200,
        updatedAt: 100,
      } as never),
    ).toBe(200);
    expect(
      sandboxRunLastActivityAt({
        status: "running",
        updatedAt: 100,
      } as never),
    ).toBe(100);
  });

  it("only marks old running or provisioning runs as lost", () => {
    expect(
      shouldMarkSandboxRunLost(
        { status: "running", lastHeartbeatAt: 99, updatedAt: 10 } as never,
        100,
      ),
    ).toBe(true);
    expect(
      shouldMarkSandboxRunLost(
        { status: "provisioning", updatedAt: 99 } as never,
        100,
      ),
    ).toBe(true);
    expect(
      shouldMarkSandboxRunLost(
        { status: "running", lastHeartbeatAt: 100, updatedAt: 10 } as never,
        100,
      ),
    ).toBe(false);
    expect(
      shouldMarkSandboxRunLost(
        { status: "failed", updatedAt: 1 } as never,
        100,
      ),
    ).toBe(false);
  });
});
