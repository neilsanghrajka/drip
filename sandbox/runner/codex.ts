import type { RunnerConfig } from "./config";
import type { RunnerControlClient } from "./convex";
import {
  absorbCodexEvent,
  codexEnv,
  envPresence,
  isTerminalFinalResponse,
  normalizeError,
  readErrorMessage,
  readEventMessage,
  type CodexRunResult,
  type ThreadEvent,
  type Usage,
} from "./codexLogic";

const terminalFinalResponseIdleMs = 20_000;

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
    const iterator = events[Symbol.asyncIterator]();
    let pendingEvent = iterator.next();
    let terminalFinalResponseAt: number | null = null;

    while (true) {
      const next = await Promise.race([
        pendingEvent.then((result) => ({ kind: "event" as const, result })),
        delay(nextTickMs(terminalFinalResponseAt, config.heartbeatMs)).then(
          () => ({ kind: "tick" as const }),
        ),
      ]);

      if (next.kind === "tick") {
        await maybeHeartbeat(true);
        if (
          terminalFinalResponseAt !== null &&
          Date.now() - terminalFinalResponseAt >= terminalFinalResponseIdleMs
        ) {
          pendingEvent.catch(() => undefined);
          abortController.abort("Final response observed and stream went idle.");
          await emit("runner.stream_idle_completed", {
            idleMs: terminalFinalResponseIdleMs,
            expectedOutputPath: sandboxRun.expectedOutputPath,
          });
          break;
        }
        continue;
      }

      if (next.result.done) {
        break;
      }

      const event = next.result.value as ThreadEvent;
      const previousFinalResponse = finalResponse;
      ({ codexThreadId, finalResponse, usage } = absorbCodexEvent(event, {
        codexThreadId,
        finalResponse,
        usage,
      }));
      if (
        finalResponse !== previousFinalResponse &&
        isTerminalFinalResponse(finalResponse, sandboxRun.expectedOutputPath)
      ) {
        terminalFinalResponseAt = Date.now();
      }
      await emit(event.type, event);

      if (event.type === "turn.failed") {
        throw new Error(readErrorMessage(event));
      }
      if (event.type === "error") {
        throw new Error(readEventMessage(event));
      }

      await maybeHeartbeat();
      pendingEvent = iterator.next();
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextTickMs(
  terminalFinalResponseAt: number | null,
  heartbeatMs: number,
) {
  if (terminalFinalResponseAt === null) {
    return heartbeatMs;
  }
  const remaining = Math.max(
    terminalFinalResponseIdleMs - (Date.now() - terminalFinalResponseAt),
    0,
  );
  return Math.max(Math.min(remaining, heartbeatMs), 0);
}
