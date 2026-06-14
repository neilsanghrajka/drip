import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const sandboxRunStatus = v.union(
  v.literal("created"),
  v.literal("sandbox_created"),
  v.literal("runner_started"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
);

const sandboxControlRunStatus = v.union(
  v.literal("queued"),
  v.literal("provisioning"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("cancelled"),
  v.literal("lost"),
);

export default defineSchema({
  sandboxRuns: defineTable({
    workspaceId: v.string(),
    task: v.string(),
    status: sandboxControlRunStatus,
    sandboxId: v.optional(v.string()),
    commandId: v.optional(v.string()),
    codexThreadId: v.optional(v.string()),
    ingestTokenHash: v.optional(v.string()),
    cancelRequestedAt: v.optional(v.number()),
    lastHeartbeatAt: v.optional(v.number()),
    result: v.optional(v.any()),
    error: v.optional(
      v.object({
        message: v.string(),
        code: v.optional(v.string()),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace_created", ["workspaceId", "createdAt"])
    .index("by_status_updated", ["status", "updatedAt"]),

  sandboxRunEvents: defineTable({
    sandboxRunId: v.id("sandboxRuns"),
    seq: v.number(),
    type: v.string(),
    payload: v.any(),
    createdAt: v.number(),
  }).index("by_sandbox_run_seq", ["sandboxRunId", "seq"]),

  sandboxPrototypeRuns: defineTable({
    externalRunId: v.string(),
    prompt: v.string(),
    runnerIngestTokenHash: v.optional(v.string()),
    status: sandboxRunStatus,
    sandboxName: v.optional(v.string()),
    sandboxCommandId: v.optional(v.string()),
    codexThreadId: v.optional(v.string()),
    finalResponse: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_externalRunId", ["externalRunId"]),

  sandboxPrototypeEvents: defineTable({
    externalRunId: v.string(),
    runId: v.id("sandboxPrototypeRuns"),
    sequence: v.number(),
    source: v.string(),
    eventType: v.string(),
    status: v.optional(sandboxRunStatus),
    message: v.optional(v.string()),
    payload: v.any(),
    createdAt: v.number(),
  })
    .index("by_externalRunId_sequence", ["externalRunId", "sequence"])
    .index("by_runId_sequence", ["runId", "sequence"]),
});
