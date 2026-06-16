import type { Doc } from "./_generated/dataModel";

export type SandboxRunStaleCheck = Pick<
  Doc<"sandboxRuns">,
  "lastHeartbeatAt" | "status" | "updatedAt"
>;

export function sandboxRunLastActivityAt(run: SandboxRunStaleCheck) {
  return run.lastHeartbeatAt ?? run.updatedAt;
}

export function shouldMarkSandboxRunLost(
  run: SandboxRunStaleCheck,
  staleBefore: number,
) {
  return (
    (run.status === "provisioning" || run.status === "running") &&
    sandboxRunLastActivityAt(run) < staleBefore
  );
}
