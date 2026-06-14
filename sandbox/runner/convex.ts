import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

import type {
  SandboxRunError,
  RunnerEvent,
  RunnerFinishStatus,
  RunnerHeartbeat,
  RunnerIngestResult,
  RunnerSandboxRun,
} from "./types";
import type { RunnerConfig } from "./config";

const getSandboxRunForRunner = makeFunctionReference<
  "mutation",
  { sandboxRunId: string; ingestToken: string },
  RunnerSandboxRun
>("sandboxRuns:getSandboxRunForRunner");

const ingestSandboxRunEvent = makeFunctionReference<
  "mutation",
  {
    sandboxRunId: string;
    ingestToken: string;
    seq: number;
    type: string;
    payload: unknown;
  },
  RunnerIngestResult
>("sandboxRuns:ingestSandboxRunEvent");

const heartbeatSandboxRun = makeFunctionReference<
  "mutation",
  { sandboxRunId: string; ingestToken: string },
  RunnerHeartbeat
>("sandboxRuns:heartbeatSandboxRun");

const finishSandboxRun = makeFunctionReference<
  "mutation",
  {
    sandboxRunId: string;
    ingestToken: string;
    status: RunnerFinishStatus;
    result?: unknown;
    error?: SandboxRunError;
  },
  { status: RunnerFinishStatus }
>("sandboxRuns:finishSandboxRun");

export type RunnerControlClient = ReturnType<typeof createRunnerControlClient>;

export function createRunnerControlClient(config: RunnerConfig) {
  const convex = new ConvexHttpClient(config.convexUrl);
  const sandboxRunId = config.sandboxRunId;
  const ingestToken = config.ingestToken;

  return {
    async getSandboxRun() {
      return await convex.mutation(getSandboxRunForRunner, {
        sandboxRunId,
        ingestToken,
      });
    },

    async ingest(event: RunnerEvent) {
      return await convex.mutation(ingestSandboxRunEvent, {
        sandboxRunId,
        ingestToken,
        seq: event.seq,
        type: event.type,
        payload: event.payload,
      });
    },

    async heartbeat() {
      return await convex.mutation(heartbeatSandboxRun, {
        sandboxRunId,
        ingestToken,
      });
    },

    async finish(input: {
      status: RunnerFinishStatus;
      result?: unknown;
      error?: SandboxRunError;
    }) {
      return await convex.mutation(finishSandboxRun, {
        sandboxRunId,
        ingestToken,
        ...input,
      });
    },
  };
}
