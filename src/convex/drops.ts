import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

const dropStage = v.union(
  v.literal("scout"),
  v.literal("designer"),
  v.literal("marketer"),
  v.literal("builder"),
);

type DropStage = "scout" | "designer" | "marketer" | "builder";
type DropStatus = Doc<"drops">["status"];

const artifactRoot = "/vercel/sandbox/agent-workspace/drops";

export const listDrops = query({
  args: {
    workspaceId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("drops")
      .withIndex("by_workspace_date", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(Math.min(args.limit ?? 50, 100));
  },
});

export const getDrop = query({
  args: {
    dropId: v.id("drops"),
  },
  handler: async (ctx, args) => {
    const drop = await ctx.db.get(args.dropId);
    if (!drop) {
      return null;
    }

    const [stageRuns, artifacts, selections] = await Promise.all([
      ctx.db
        .query("dropStageRuns")
        .withIndex("by_drop_stage_attempt", (q) => q.eq("dropId", args.dropId))
        .collect(),
      ctx.db
        .query("dropArtifacts")
        .withIndex("by_drop_stage_created", (q) => q.eq("dropId", args.dropId))
        .collect(),
      ctx.db
        .query("dropSelections")
        .withIndex("by_drop_kind", (q) => q.eq("dropId", args.dropId))
        .collect(),
    ]);

    return {
      drop,
      stageRuns: stageRuns.sort((left, right) => left.createdAt - right.createdAt),
      artifacts: artifacts.sort((left, right) => left.createdAt - right.createdAt),
      selections,
    };
  },
});

export const listDropEvents = query({
  args: {
    dropId: v.id("drops"),
    afterSeq: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query("dropEvents")
      .withIndex("by_drop_seq", (q) => {
        const dropQuery = q.eq("dropId", args.dropId);
        return args.afterSeq === undefined
          ? dropQuery
          : dropQuery.gt("seq", args.afterSeq);
      });

    return await query.take(Math.min(args.limit ?? 100, 200));
  },
});

export const listDropArtifacts = query({
  args: {
    dropId: v.id("drops"),
    stage: v.optional(dropStage),
  },
  handler: async (ctx, args) => {
    const artifacts = await ctx.db
      .query("dropArtifacts")
      .withIndex("by_drop_stage_created", (q) =>
        args.stage === undefined
          ? q.eq("dropId", args.dropId)
          : q.eq("dropId", args.dropId).eq("stage", args.stage),
      )
      .collect();
    return artifacts.sort((left, right) => left.createdAt - right.createdAt);
  },
});

export const selectScoutIdeas = mutation({
  args: {
    dropId: v.id("drops"),
    approvedIdeas: v.any(),
  },
  handler: async (ctx, args) => {
    await upsertSelection(ctx, args.dropId, "approvedIdeas", args.approvedIdeas);
    await patchDropStatus(ctx, args.dropId, "ready_to_design");
    return { status: "ready_to_design" as const };
  },
});

export const selectDesignerMocks = mutation({
  args: {
    dropId: v.id("drops"),
    selectedMocks: v.any(),
  },
  handler: async (ctx, args) => {
    await upsertSelection(ctx, args.dropId, "selectedMocks", args.selectedMocks);
    await patchDropStatus(ctx, args.dropId, "ready_to_market");
    return { status: "ready_to_market" as const };
  },
});

export const approveWinningDrop = mutation({
  args: {
    dropId: v.id("drops"),
    winningDrop: v.any(),
  },
  handler: async (ctx, args) => {
    await upsertSelection(ctx, args.dropId, "winningDrop", args.winningDrop);
    await ctx.db.patch(args.dropId, {
      winningDrop: args.winningDrop,
      status: "ready_to_build",
      currentStage: "builder",
      updatedAt: now(),
    });
    await insertDropEvent(ctx, {
      dropId: args.dropId,
      type: "selection.winning_drop_approved",
      message: "Winning Drop approved for Builder.",
      visibility: "user",
      payload: { winningDrop: args.winningDrop },
    });
    return { status: "ready_to_build" as const };
  },
});

export const createDropFromAction = internalMutation({
  args: {
    workspaceId: v.string(),
    name: v.string(),
    dropDate: v.string(),
    startingMode: v.string(),
    topics: v.optional(v.array(v.string())),
    productCategories: v.optional(v.array(v.string())),
    tasteConstraints: v.optional(v.array(v.string())),
    winningDrop: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const timestamp = now();
    const dropId = await ctx.db.insert("drops", {
      workspaceId: args.workspaceId,
      name: args.name,
      dropDate: args.dropDate,
      startingMode: args.startingMode,
      status: "creating",
      sandboxName: "pending",
      topics: args.topics,
      productCategories: args.productCategories,
      tasteConstraints: args.tasteConstraints,
      winningDrop: args.winningDrop,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const sandboxName = dropSandboxName(dropId);
    await ctx.db.patch(dropId, { sandboxName });
    await insertDropEvent(ctx, {
      dropId,
      type: "drop.creating",
      message: "Creating persistent drop sandbox.",
      visibility: "user",
      payload: { sandboxName },
    });
    return { dropId, sandboxName };
  },
});

export const markDropSandboxReady = internalMutation({
  args: {
    dropId: v.id("drops"),
    sandboxName: v.string(),
    sandboxId: v.string(),
    currentSnapshotId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const drop = await getDropOrThrow(ctx, args.dropId);
    const nextStatus: DropStatus = drop.winningDrop ? "ready_to_build" : "ready";
    await ctx.db.patch(args.dropId, {
      status: nextStatus,
      currentStage: nextStatus === "ready_to_build" ? "builder" : "scout",
      sandboxName: args.sandboxName,
      currentSandboxId: args.sandboxId,
      currentSnapshotId: args.currentSnapshotId,
      updatedAt: now(),
    });
    await insertDropEvent(ctx, {
      dropId: args.dropId,
      type: "drop.ready",
      message: "Persistent drop sandbox is ready.",
      visibility: "user",
      payload: {
        sandboxName: args.sandboxName,
        sandboxId: args.sandboxId,
        currentSnapshotId: args.currentSnapshotId,
      },
    });
    return { status: nextStatus };
  },
});

export const markDropSandboxFailed = internalMutation({
  args: {
    dropId: v.id("drops"),
    error: v.object({
      message: v.string(),
      code: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.dropId, {
      status: "failed",
      error: args.error,
      updatedAt: now(),
    });
    await insertDropEvent(ctx, {
      dropId: args.dropId,
      type: "drop.failed",
      message: "Persistent drop sandbox setup failed.",
      visibility: "user",
      payload: { error: args.error },
    });
  },
});

export const getDropForAction = internalQuery({
  args: {
    dropId: v.id("drops"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.dropId);
  },
});

export const prepareNextStageRun = internalMutation({
  args: {
    dropId: v.id("drops"),
  },
  handler: async (ctx, args) => {
    const drop = await getDropOrThrow(ctx, args.dropId);
    const stage = nextStageForStatus(drop.status);
    if (!stage) {
      throw new Error(`Drop is not ready to start a stage: ${drop.status}.`);
    }
    const active = await activeStageRun(ctx, args.dropId);
    if (active) {
      throw new Error(`Drop already has an active stage run: ${active._id}.`);
    }

    const attempt = (await latestAttempt(ctx, args.dropId, stage)) + 1;
    const stageInput = await buildStageInput(ctx, drop, stage);
    const stageRunId = await ctx.db.insert("dropStageRuns", {
      dropId: args.dropId,
      stage,
      attempt,
      status: "queued",
      sandboxName: drop.sandboxName,
      input: stageInput,
      expectedOutputPath: "",
      createdAt: now(),
      updatedAt: now(),
    });
    const outputPath = stageOutputPath(args.dropId, stageRunId, stage);
    const task = buildStageTask({
      drop,
      stage,
      stageRunId,
      outputPath,
      input: stageInput,
    });
    const timestamp = now();
    const sandboxRunId = await ctx.db.insert("sandboxRuns", {
      workspaceId: drop.workspaceId,
      task,
      status: "queued",
      dropId: args.dropId,
      dropStageRunId: stageRunId,
      stage,
      sandboxName: drop.sandboxName,
      expectedOutputPath: outputPath,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await ctx.db.patch(stageRunId, {
      sandboxRunId,
      expectedOutputPath: outputPath,
      updatedAt: timestamp,
    });
    await ctx.db.patch(args.dropId, {
      status: runningStatus(stage),
      currentStage: stage,
      updatedAt: timestamp,
    });
    await insertDropEvent(ctx, {
      dropId: args.dropId,
      dropStageRunId: stageRunId,
      sandboxRunId,
      stage,
      type: "stage.queued",
      message: `${stageLabel(stage)} queued.`,
      visibility: "user",
      payload: {
        attempt,
        sandboxName: drop.sandboxName,
        expectedOutputPath: outputPath,
      },
    });

    return {
      dropId: args.dropId,
      stageRunId,
      sandboxRunId,
      stage,
      sandboxName: drop.sandboxName,
      expectedOutputPath: outputPath,
    };
  },
});

export const getStageRunForCollector = internalQuery({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
  },
  handler: async (ctx, args) => {
    const sandboxRun = await ctx.db.get(args.sandboxRunId);
    if (!sandboxRun?.dropId || !sandboxRun.dropStageRunId || !sandboxRun.stage) {
      return null;
    }
    const [drop, stageRun] = await Promise.all([
      ctx.db.get(sandboxRun.dropId),
      ctx.db.get(sandboxRun.dropStageRunId),
    ]);
    if (!drop || !stageRun) {
      return null;
    }
    return { drop, stageRun, sandboxRun };
  },
});

export const recordCollectedStageArtifact = internalMutation({
  args: {
    dropId: v.id("drops"),
    stageRunId: v.id("dropStageRuns"),
    sandboxRunId: v.id("sandboxRuns"),
    stage: dropStage,
    kind: v.string(),
    schemaVersion: v.string(),
    generatedAt: v.optional(v.string()),
    sandboxPath: v.string(),
    storageId: v.id("_storage"),
    data: v.any(),
    summary: v.optional(v.any()),
    assets: v.array(
      v.object({
        sandboxPath: v.string(),
        storageId: v.id("_storage"),
        fileName: v.string(),
        contentType: v.string(),
        bytes: v.number(),
        sha256: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const timestamp = now();
    const artifactId = await ctx.db.insert("dropArtifacts", {
      dropId: args.dropId,
      dropStageRunId: args.stageRunId,
      sandboxRunId: args.sandboxRunId,
      stage: args.stage,
      kind: args.kind,
      schemaVersion: args.schemaVersion,
      generatedAt: args.generatedAt,
      sandboxPath: args.sandboxPath,
      storageId: args.storageId,
      data: args.data,
      summary: args.summary,
      createdAt: timestamp,
    });

    for (const asset of args.assets) {
      await ctx.db.insert("dropAssets", {
        dropId: args.dropId,
        dropStageRunId: args.stageRunId,
        sandboxRunId: args.sandboxRunId,
        artifactId,
        stage: args.stage,
        sandboxPath: asset.sandboxPath,
        storageId: asset.storageId,
        fileName: asset.fileName,
        contentType: asset.contentType,
        bytes: asset.bytes,
        sha256: asset.sha256,
        createdAt: timestamp,
      });
    }

    await ctx.db.patch(args.stageRunId, {
      status: "succeeded",
      outputArtifactId: artifactId,
      completedAt: timestamp,
      updatedAt: timestamp,
    });

    const dropPatch: Partial<Doc<"drops">> = {
      status: statusAfterSuccessfulCollection(args.stage),
      updatedAt: timestamp,
    };
    if (args.stage === "builder") {
      const websiteUrl = readBuilderUrl(args.data);
      if (websiteUrl) {
        dropPatch.websiteUrl = websiteUrl;
      }
      dropPatch.currentStage = "builder";
    }
    await ctx.db.patch(args.dropId, dropPatch);

    await insertDropEvent(ctx, {
      dropId: args.dropId,
      dropStageRunId: args.stageRunId,
      sandboxRunId: args.sandboxRunId,
      stage: args.stage,
      type: "artifact.collected",
      message: `${stageLabel(args.stage)} artifact collected.`,
      visibility: "user",
      payload: {
        artifactId,
        schemaVersion: args.schemaVersion,
        assetCount: args.assets.length,
        summary: args.summary,
      },
    });

    return { artifactId };
  },
});

export const markStageArtifactCollectionFailed = internalMutation({
  args: {
    dropId: v.id("drops"),
    stageRunId: v.id("dropStageRuns"),
    sandboxRunId: v.id("sandboxRuns"),
    stage: dropStage,
    error: v.object({
      message: v.string(),
      code: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.stageRunId, {
      status: "failed",
      error: args.error,
      completedAt: now(),
      updatedAt: now(),
    });
    await ctx.db.patch(args.dropId, {
      status: "failed",
      error: args.error,
      updatedAt: now(),
    });
    await insertDropEvent(ctx, {
      dropId: args.dropId,
      dropStageRunId: args.stageRunId,
      sandboxRunId: args.sandboxRunId,
      stage: args.stage,
      type: "artifact.collection_failed",
      message: `${stageLabel(args.stage)} artifact collection failed.`,
      visibility: "user",
      payload: { error: args.error },
    });
  },
});

async function upsertSelection(
  ctx: MutationCtx,
  dropId: Id<"drops">,
  kind: "approvedIdeas" | "selectedMocks" | "winningDrop",
  value: unknown,
) {
  const timestamp = now();
  const existing = await ctx.db
    .query("dropSelections")
    .withIndex("by_drop_kind", (q) => q.eq("dropId", dropId).eq("kind", kind))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, { value, updatedAt: timestamp });
  } else {
    await ctx.db.insert("dropSelections", {
      dropId,
      kind,
      value,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
  await insertDropEvent(ctx, {
    dropId,
    type: `selection.${kind}`,
    message: selectionMessage(kind),
    visibility: "user",
    payload: { value },
  });
}

async function patchDropStatus(
  ctx: MutationCtx,
  dropId: Id<"drops">,
  status: DropStatus,
) {
  await ctx.db.patch(dropId, {
    status,
    currentStage: currentStageForStatus(status),
    updatedAt: now(),
  });
}

async function getDropOrThrow(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  dropId: Id<"drops">,
) {
  const drop = await ctx.db.get(dropId);
  if (!drop) {
    throw new Error("Drop not found.");
  }
  return drop;
}

async function activeStageRun(ctx: MutationCtx, dropId: Id<"drops">) {
  const activeStatuses = new Set(["queued", "starting", "running", "collecting"]);
  const runs = await ctx.db
    .query("dropStageRuns")
    .withIndex("by_drop_status", (q) => q.eq("dropId", dropId))
    .collect();
  return runs.find((run) => activeStatuses.has(run.status));
}

async function latestAttempt(
  ctx: MutationCtx,
  dropId: Id<"drops">,
  stage: DropStage,
) {
  const latest = await ctx.db
    .query("dropStageRuns")
    .withIndex("by_drop_stage_attempt", (q) =>
      q.eq("dropId", dropId).eq("stage", stage),
    )
    .order("desc")
    .first();
  return latest?.attempt ?? 0;
}

async function buildStageInput(
  ctx: MutationCtx,
  drop: Doc<"drops">,
  stage: DropStage,
) {
  switch (stage) {
    case "scout":
      return {
        dropName: drop.name,
        dropDate: drop.dropDate,
        topics: drop.topics ?? [],
        productCategories: drop.productCategories ?? [],
        tasteConstraints: drop.tasteConstraints ?? [],
      };
    case "designer":
      return {
        approvedIdeas: await selectionValue(ctx, drop._id, "approvedIdeas"),
        productCategories: drop.productCategories ?? [],
        tasteConstraints: drop.tasteConstraints ?? [],
      };
    case "marketer":
      return {
        selectedMocks: await selectionValue(ctx, drop._id, "selectedMocks"),
      };
    case "builder":
      return {
        winningDrop:
          drop.winningDrop ?? (await selectionValue(ctx, drop._id, "winningDrop")),
      };
  }
}

async function selectionValue(
  ctx: MutationCtx,
  dropId: Id<"drops">,
  kind: "approvedIdeas" | "selectedMocks" | "winningDrop",
) {
  const selection = await ctx.db
    .query("dropSelections")
    .withIndex("by_drop_kind", (q) => q.eq("dropId", dropId).eq("kind", kind))
    .first();
  if (!selection) {
    throw new Error(`Missing ${kind} selection for drop.`);
  }
  return selection.value;
}

function buildStageTask({
  drop,
  stage,
  stageRunId,
  outputPath,
  input,
}: {
  drop: Doc<"drops">;
  stage: DropStage;
  stageRunId: Id<"dropStageRuns">;
  outputPath: string;
  input: unknown;
}) {
  const rootDir = stageRoot(drop._id, stageRunId, stage);
  const inputJson = JSON.stringify(input, null, 2);
  switch (stage) {
    case "scout":
      return [
        `Use $scout for Drip drop "${drop.name}" on ${drop.dropDate}.`,
        `Input JSON: ${inputJson}`,
        `Create parent directories as needed and write the Scout artifact to ${outputPath}.`,
        "Return a short status with the artifact path.",
      ].join("\n");
    case "designer":
      return [
        "Use $fashion-designer to create concepts and mock images for the approved Scout ideas in the input JSON.",
        `Input JSON: ${inputJson}`,
        `Use assetDir ${rootDir}/fashion-designer-assets.`,
        `Write the Fashion Designer artifact to ${outputPath}.`,
        "Return a short status with the artifact path.",
      ].join("\n");
    case "marketer":
      return [
        "Use $performance-marketer to create the paused Facebook-only campaign for the selected mocks in the input JSON.",
        `Input JSON: ${inputJson}`,
        `Use assetDir ${rootDir}/performance-marketer-assets.`,
        `Write the Performance Marketer artifact to ${outputPath}.`,
        "Return a short status with the artifact path and sanitized object counts.",
      ].join("\n");
    case "builder":
      return [
        "Use $builder to create the live one-page drop site for the approved Winning Drop in the input JSON.",
        `Input JSON: ${inputJson}`,
        `Use siteDir ${rootDir}/builder-site.`,
        `Write the Builder artifact to ${outputPath}.`,
        "Return a short status with the artifact path and immutable deployment URL.",
      ].join("\n");
  }
}

async function insertDropEvent(
  ctx: MutationCtx,
  input: {
    dropId: Id<"drops">;
    dropStageRunId?: Id<"dropStageRuns">;
    sandboxRunId?: Id<"sandboxRuns">;
    stage?: DropStage;
    type: string;
    message?: string;
    visibility: "user" | "debug";
    payload?: unknown;
  },
) {
  const latest = await ctx.db
    .query("dropEvents")
    .withIndex("by_drop_seq", (q) => q.eq("dropId", input.dropId))
    .order("desc")
    .first();
  await ctx.db.insert("dropEvents", {
    dropId: input.dropId,
    dropStageRunId: input.dropStageRunId,
    sandboxRunId: input.sandboxRunId,
    seq: (latest?.seq ?? 0) + 1,
    stage: input.stage,
    type: input.type,
    message: input.message,
    visibility: input.visibility,
    payload: input.payload,
    createdAt: now(),
  });
}

function nextStageForStatus(status: DropStatus): DropStage | null {
  switch (status) {
    case "ready":
      return "scout";
    case "ready_to_design":
      return "designer";
    case "ready_to_market":
      return "marketer";
    case "ready_to_build":
      return "builder";
    default:
      return null;
  }
}

function runningStatus(stage: DropStage): DropStatus {
  switch (stage) {
    case "scout":
      return "scouting";
    case "designer":
      return "designing";
    case "marketer":
      return "marketing";
    case "builder":
      return "building";
  }
}

function statusAfterSuccessfulCollection(stage: DropStage): DropStatus {
  switch (stage) {
    case "scout":
      return "awaiting_idea_selection";
    case "designer":
      return "awaiting_mock_selection";
    case "marketer":
      return "awaiting_winner_approval";
    case "builder":
      return "completed";
  }
}

function currentStageForStatus(status: DropStatus): DropStage | undefined {
  switch (status) {
    case "ready":
    case "scouting":
    case "awaiting_idea_selection":
      return "scout";
    case "ready_to_design":
    case "designing":
    case "awaiting_mock_selection":
      return "designer";
    case "ready_to_market":
    case "marketing":
    case "awaiting_winner_approval":
      return "marketer";
    case "ready_to_build":
    case "building":
    case "completed":
      return "builder";
    default:
      return undefined;
  }
}

function stageOutputPath(
  dropId: Id<"drops">,
  stageRunId: Id<"dropStageRuns">,
  stage: DropStage,
) {
  const fileName = {
    scout: "scout-output.json",
    designer: "fashion-designer-output.json",
    marketer: "performance-marketer-output.json",
    builder: "builder-output.json",
  }[stage];
  return `${stageRoot(dropId, stageRunId, stage)}/${fileName}`;
}

function stageRoot(
  dropId: Id<"drops">,
  stageRunId: Id<"dropStageRuns">,
  stage: DropStage,
) {
  return `${artifactRoot}/${dropId}/runs/${stageRunId}/${stage}`;
}

function dropSandboxName(dropId: Id<"drops">) {
  return `drip-drop-${dropId}`.replace(/[^A-Za-z0-9_-]/g, "-");
}

function selectionMessage(kind: "approvedIdeas" | "selectedMocks" | "winningDrop") {
  switch (kind) {
    case "approvedIdeas":
      return "Scout ideas selected.";
    case "selectedMocks":
      return "Designer mocks selected.";
    case "winningDrop":
      return "Winning Drop selected.";
  }
}

function stageLabel(stage: DropStage) {
  switch (stage) {
    case "scout":
      return "Scout";
    case "designer":
      return "Designer";
    case "marketer":
      return "Performance Marketer";
    case "builder":
      return "Builder";
  }
}

function readBuilderUrl(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return undefined;
  }
  const root = data as Record<string, unknown>;
  const site = root.site;
  if (site && typeof site === "object" && !Array.isArray(site)) {
    const deploymentUrl = (site as Record<string, unknown>).deploymentUrl;
    if (typeof deploymentUrl === "string") {
      return deploymentUrl;
    }
    const historicalUrl = (site as Record<string, unknown>).canonicalHistoricalUrl;
    if (typeof historicalUrl === "string") {
      return historicalUrl;
    }
  }
  return undefined;
}

function now() {
  return Date.now();
}
