export type SandboxRunStatus =
  | "queued"
  | "provisioning"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "lost";

export type RunnerFinishStatus = "succeeded" | "failed" | "cancelled";

export type SandboxRunError = {
  message: string;
  code?: string;
};

export type RunnerEvent = {
  seq: number;
  type: string;
  payload: unknown;
};

export type RunnerSandboxRun = {
  task: string;
  expectedOutputPath?: string;
  cancelRequested: boolean;
};

export type RunnerHeartbeat = {
  cancelRequested: boolean;
};

export type RunnerIngestResult = {
  accepted: boolean;
  expectedSeq: number;
};
