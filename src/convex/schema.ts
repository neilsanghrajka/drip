import { authTables } from "@convex-dev/auth/server";
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

const dropStage = v.union(
  v.literal("scout"),
  v.literal("designer"),
  v.literal("marketer"),
  v.literal("builder"),
);

const dropStatus = v.union(
  v.literal("creating"),
  v.literal("ready"),
  v.literal("scouting"),
  v.literal("awaiting_idea_selection"),
  v.literal("ready_to_design"),
  v.literal("designing"),
  v.literal("awaiting_mock_selection"),
  v.literal("ready_to_market"),
  v.literal("marketing"),
  v.literal("awaiting_winner_approval"),
  v.literal("ready_to_build"),
  v.literal("building"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled"),
);

const dropStageRunStatus = v.union(
  v.literal("queued"),
  v.literal("starting"),
  v.literal("running"),
  v.literal("collecting"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("cancelled"),
);

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    username: v.string(),
    usernameNormalized: v.string(),
    isAnonymous: v.optional(v.boolean()),
  }).index("by_usernameNormalized", ["usernameNormalized"]),

  sandboxRuns: defineTable({
    workspaceId: v.string(),
    task: v.string(),
    status: sandboxControlRunStatus,
    dropId: v.optional(v.id("drops")),
    dropStageRunId: v.optional(v.id("dropStageRuns")),
    stage: v.optional(dropStage),
    sandboxName: v.optional(v.string()),
    expectedOutputPath: v.optional(v.string()),
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
    .index("by_drop_stage_created", ["dropId", "stage", "createdAt"])
    .index("by_drop_stage_run", ["dropStageRunId"])
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

  drops: defineTable({
    workspaceId: v.string(),
    name: v.string(),
    dropDate: v.string(),
    city: v.optional(v.string()),
    startingMode: v.string(),
    status: dropStatus,
    currentStage: v.optional(dropStage),
    sandboxName: v.string(),
    currentSandboxId: v.optional(v.string()),
    currentSnapshotId: v.optional(v.string()),
    topics: v.optional(v.array(v.string())),
    productCategories: v.optional(v.array(v.string())),
    tasteConstraints: v.optional(v.array(v.string())),
    winningDrop: v.optional(v.any()),
    websiteUrl: v.optional(v.string()),
    error: v.optional(
      v.object({
        message: v.string(),
        code: v.optional(v.string()),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace_date", ["workspaceId", "dropDate"])
    .index("by_status_updated", ["status", "updatedAt"])
    .index("by_sandbox_name", ["sandboxName"]),

  dropStageRuns: defineTable({
    dropId: v.id("drops"),
    sandboxRunId: v.optional(v.id("sandboxRuns")),
    stage: dropStage,
    attempt: v.number(),
    status: dropStageRunStatus,
    sandboxName: v.string(),
    sandboxId: v.optional(v.string()),
    commandId: v.optional(v.string()),
    input: v.any(),
    expectedOutputPath: v.string(),
    outputArtifactId: v.optional(v.id("dropArtifacts")),
    error: v.optional(
      v.object({
        message: v.string(),
        code: v.optional(v.string()),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_drop_stage_attempt", ["dropId", "stage", "attempt"])
    .index("by_drop_status", ["dropId", "status"])
    .index("by_sandbox_run", ["sandboxRunId"]),

  dropEvents: defineTable({
    dropId: v.id("drops"),
    dropStageRunId: v.optional(v.id("dropStageRuns")),
    sandboxRunId: v.optional(v.id("sandboxRuns")),
    seq: v.number(),
    stage: v.optional(dropStage),
    type: v.string(),
    message: v.optional(v.string()),
    visibility: v.union(v.literal("user"), v.literal("debug")),
    payload: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_drop_seq", ["dropId", "seq"]),

  dropArtifacts: defineTable({
    dropId: v.id("drops"),
    dropStageRunId: v.id("dropStageRuns"),
    sandboxRunId: v.id("sandboxRuns"),
    stage: dropStage,
    kind: v.string(),
    schemaVersion: v.string(),
    generatedAt: v.optional(v.string()),
    sandboxPath: v.string(),
    storageId: v.id("_storage"),
    data: v.any(),
    summary: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_drop_stage_created", ["dropId", "stage", "createdAt"])
    .index("by_stage_run", ["dropStageRunId"]),

  dropAssets: defineTable({
    dropId: v.id("drops"),
    dropStageRunId: v.id("dropStageRuns"),
    sandboxRunId: v.id("sandboxRuns"),
    artifactId: v.optional(v.id("dropArtifacts")),
    stage: dropStage,
    sandboxPath: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    bytes: v.number(),
    sha256: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_drop_stage_created", ["dropId", "stage", "createdAt"])
    .index("by_artifact", ["artifactId"]),

  dropSelections: defineTable({
    dropId: v.id("drops"),
    kind: v.union(
      v.literal("approvedIdeas"),
      v.literal("selectedMocks"),
      v.literal("winningDrop"),
    ),
    value: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_drop_kind", ["dropId", "kind"]),
});
