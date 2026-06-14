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

export default defineSchema({
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
