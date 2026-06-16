import { getAuthUserId } from "@convex-dev/auth/server";
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
import {
  buildReplayActivity,
  currentStageAfterCollection,
  currentStageForStatus,
  dropSandboxName,
  nextStageForDrop,
  readBuilderUrl,
  runningStatus,
  selectionMessage,
  stageArtifactIssue,
  stageLabel,
  stageOutputPath,
  stageRoot,
  statusAfterSuccessfulCollection,
  type DropStage,
  type DropStatus,
} from "./dropLogic";

const dropStage = v.union(
  v.literal("scout"),
  v.literal("designer"),
  v.literal("marketer"),
  v.literal("builder"),
);

export const listDrops = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const workspaceId = await currentUserWorkspaceId(ctx);
    if (!workspaceId) {
      return [];
    }

    return await ctx.db
      .query("drops")
      .withIndex("by_workspace_date", (q) => q.eq("workspaceId", workspaceId))
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
    if (!drop || !(await ownsDropWorkspace(ctx, drop))) {
      return null;
    }

    const [stageRuns, artifacts, assets, selections] = await Promise.all([
      ctx.db
        .query("dropStageRuns")
        .withIndex("by_drop_stage_attempt", (q) => q.eq("dropId", args.dropId))
        .collect(),
      ctx.db
        .query("dropArtifacts")
        .withIndex("by_drop_stage_created", (q) => q.eq("dropId", args.dropId))
        .collect(),
      ctx.db
        .query("dropAssets")
        .withIndex("by_drop_stage_created", (q) => q.eq("dropId", args.dropId))
        .collect(),
      ctx.db
        .query("dropSelections")
        .withIndex("by_drop_kind", (q) => q.eq("dropId", args.dropId))
        .collect(),
    ]);
    const assetsWithUrls = await Promise.all(
      assets
        .sort((left, right) => left.createdAt - right.createdAt)
        .map(async (asset) => ({
          ...asset,
          url: await ctx.storage.getUrl(asset.storageId),
        })),
    );

    return {
      drop,
      stageRuns: stageRuns.sort((left, right) => left.createdAt - right.createdAt),
      artifacts: artifacts.sort((left, right) => left.createdAt - right.createdAt),
      assets: assetsWithUrls,
      selections,
    };
  },
});

export const getDropReplay = query({
  args: {
    dropId: v.id("drops"),
  },
  handler: async (ctx, args) => {
    const drop = await ctx.db.get(args.dropId);
    if (!drop || !(await ownsDropWorkspace(ctx, drop))) {
      return null;
    }

    const [stageRuns, artifacts, assets, selections, dropEvents] =
      await Promise.all([
        ctx.db
          .query("dropStageRuns")
          .withIndex("by_drop_stage_attempt", (q) => q.eq("dropId", args.dropId))
          .collect(),
        ctx.db
          .query("dropArtifacts")
          .withIndex("by_drop_stage_created", (q) => q.eq("dropId", args.dropId))
          .collect(),
        ctx.db
          .query("dropAssets")
          .withIndex("by_drop_stage_created", (q) => q.eq("dropId", args.dropId))
          .collect(),
        ctx.db
          .query("dropSelections")
          .withIndex("by_drop_kind", (q) => q.eq("dropId", args.dropId))
          .collect(),
        ctx.db
          .query("dropEvents")
          .withIndex("by_drop_seq", (q) => q.eq("dropId", args.dropId))
          .collect(),
      ]);

    const sortedStageRuns = stageRuns.sort(
      (left, right) => left.createdAt - right.createdAt,
    );
    const sortedArtifacts = artifacts.sort(
      (left, right) => left.createdAt - right.createdAt,
    );
    const sortedDropEvents = dropEvents.sort((left, right) => left.seq - right.seq);
    const sandboxEvents = (
      await Promise.all(
        sortedStageRuns
          .filter((stageRun) => stageRun.sandboxRunId)
          .map(async (stageRun) => {
            const sandboxRunId = stageRun.sandboxRunId;
            if (!sandboxRunId) {
              return [];
            }
            const events = await ctx.db
              .query("sandboxRunEvents")
              .withIndex("by_sandbox_run_seq", (q) =>
                q.eq("sandboxRunId", sandboxRunId),
              )
              .take(80);
            return events.map((event) => ({
              ...event,
              stage: stageRun.stage,
              dropStageRunId: stageRun._id,
            }));
          }),
      )
    ).flat();
    const assetsWithUrls = await Promise.all(
      assets
        .sort((left, right) => left.createdAt - right.createdAt)
        .map(async (asset) => ({
          ...asset,
          url: await ctx.storage.getUrl(asset.storageId),
        })),
    );

    return {
      drop,
      stageRuns: sortedStageRuns,
      artifacts: sortedArtifacts,
      assets: assetsWithUrls,
      selections,
      dropEvents: sortedDropEvents,
      sandboxEvents: sandboxEvents.sort(
        (left, right) => left.createdAt - right.createdAt || left.seq - right.seq,
      ),
      activity: buildReplayActivity({
        drop,
        stageRuns: sortedStageRuns,
        artifacts: sortedArtifacts,
        dropEvents: sortedDropEvents,
        sandboxEvents,
      }),
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
    const drop = await ctx.db.get(args.dropId);
    if (!drop || !(await ownsDropWorkspace(ctx, drop))) {
      return [];
    }

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
    const drop = await ctx.db.get(args.dropId);
    if (!drop || !(await ownsDropWorkspace(ctx, drop))) {
      return [];
    }

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
    await getOwnedDropOrThrow(ctx, args.dropId);
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
    await getOwnedDropOrThrow(ctx, args.dropId);
    await upsertSelection(ctx, args.dropId, "selectedMocks", args.selectedMocks);
    await patchDropStatus(ctx, args.dropId, "ready_to_build");
    return { status: "ready_to_build" as const };
  },
});

export const approveWinningDrop = mutation({
  args: {
    dropId: v.id("drops"),
    winningDrop: v.any(),
  },
  handler: async (ctx, args) => {
    await getOwnedDropOrThrow(ctx, args.dropId);
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

export const restoreCompletedFromMarketerArtifact = mutation({
  args: {
    dropId: v.id("drops"),
  },
  handler: async (ctx, args) => {
    const drop = await getOwnedDropOrThrow(ctx, args.dropId);
    if (drop.currentStage !== "marketer") {
      throw new Error("Only Marketer-stage drops can be restored to completed.");
    }
    const marketerArtifact = await latestArtifact(ctx, args.dropId, "marketer");
    if (!marketerArtifact) {
      throw new Error("Missing Marketer artifact for completed restore.");
    }
    await ctx.db.patch(args.dropId, {
      status: "completed",
      currentStage: "marketer",
      error: undefined,
      updatedAt: now(),
    });
    await insertDropEvent(ctx, {
      dropId: args.dropId,
      stage: "marketer",
      type: "drop.restored_completed",
      message: "Drop restored to completed from collected Marketer artifact.",
      visibility: "debug",
      payload: { artifactId: marketerArtifact._id },
    });
    return { status: "completed" as const };
  },
});

export const createDropFromAction = internalMutation({
  args: {
    workspaceId: v.string(),
    name: v.string(),
    dropDate: v.string(),
    city: v.optional(v.string()),
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
      city: args.city,
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
    const stage = nextStageForDrop(drop);
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
      error: undefined,
      updatedAt: timestamp,
    });
    await insertDropEvent(ctx, {
      dropId: args.dropId,
      dropStageRunId: stageRunId,
      sandboxRunId,
      stage,
      type: "stage.queued",
      message:
        attempt > 1 ? `${stageLabel(stage)} retry queued.` : `${stageLabel(stage)} queued.`,
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

    const drop = await getDropOrThrow(ctx, args.dropId);
    const artifactIssue = stageArtifactIssue(args.stage, args.data);
    if (artifactIssue) {
      const error = {
        message: artifactIssue,
        code: `${args.stage}_artifact_incomplete`,
      };
      await ctx.db.patch(args.stageRunId, {
        status: "failed",
        outputArtifactId: artifactId,
        error,
        completedAt: timestamp,
        updatedAt: timestamp,
      });
      await ctx.db.patch(args.dropId, {
        status: "failed",
        currentStage: args.stage,
        error,
        updatedAt: timestamp,
      });
      await insertDropEvent(ctx, {
        dropId: args.dropId,
        dropStageRunId: args.stageRunId,
        sandboxRunId: args.sandboxRunId,
        stage: args.stage,
        type: "artifact.blocked",
        message: `${stageLabel(args.stage)} artifact was saved but needs retry.`,
        visibility: "user",
        payload: {
          artifactId,
          schemaVersion: args.schemaVersion,
          assetCount: args.assets.length,
          summary: args.summary,
          error,
        },
      });
      return { artifactId };
    }

    await ctx.db.patch(args.stageRunId, {
      status: "succeeded",
      outputArtifactId: artifactId,
      completedAt: timestamp,
      updatedAt: timestamp,
    });

    const nextStatus = statusAfterSuccessfulCollection(args.stage, drop);
    const dropPatch: Partial<Doc<"drops">> = {
      status: nextStatus,
      currentStage: currentStageAfterCollection(args.stage, nextStatus),
      updatedAt: timestamp,
    };
    if (args.stage === "builder") {
      const websiteUrl = readBuilderUrl(args.data);
      if (websiteUrl) {
        dropPatch.websiteUrl = websiteUrl;
      }
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

async function currentUserWorkspaceId(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  return userId ? workspaceIdForUser(userId) : null;
}

async function requireUserWorkspaceId(ctx: QueryCtx | MutationCtx) {
  const workspaceId = await currentUserWorkspaceId(ctx);
  if (!workspaceId) {
    throw new Error("Sign in to access campaign history.");
  }
  return workspaceId;
}

async function ownsDropWorkspace(ctx: QueryCtx | MutationCtx, drop: Doc<"drops">) {
  const workspaceId = await currentUserWorkspaceId(ctx);
  return Boolean(workspaceId && drop.workspaceId === workspaceId);
}

async function getOwnedDropOrThrow(
  ctx: QueryCtx | MutationCtx,
  dropId: Id<"drops">,
) {
  const workspaceId = await requireUserWorkspaceId(ctx);
  const drop = await ctx.db.get(dropId);
  if (!drop || drop.workspaceId !== workspaceId) {
    throw new Error("Drop not found.");
  }
  return drop;
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

function workspaceIdForUser(userId: Id<"users">) {
  return `user:${userId}`;
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
        city: drop.city ?? "Mumbai",
        window: "7 days",
      };
    case "designer":
      return {
        approvedIdeas: await selectionValue(ctx, drop._id, "approvedIdeas"),
        productCategories: drop.productCategories ?? [],
        tasteConstraints: drop.tasteConstraints ?? [],
      };
    case "marketer": {
      const builderArtifact = await latestArtifact(ctx, drop._id, "builder");
      if (!builderArtifact) {
        throw new Error("Missing Builder artifact for Marketer.");
      }
      const destinationUrl = drop.websiteUrl ?? readBuilderUrl(builderArtifact.data);
      if (!destinationUrl) {
        throw new Error("Missing Builder website URL for Marketer.");
      }
      return {
        selectedMocks: await selectionValue(ctx, drop._id, "selectedMocks"),
        builderArtifact: builderArtifact.data,
        destinationUrl,
        dropName: drop.name,
        dropDate: drop.dropDate,
      };
    }
    case "builder":
      return {
        dropName: drop.name,
        dropDate: drop.dropDate,
        selectedMocks:
          drop.winningDrop ?? (await selectionValue(ctx, drop._id, "selectedMocks")),
        productCategories: drop.productCategories ?? [],
        tasteConstraints: drop.tasteConstraints ?? [],
      };
  }
}

async function latestArtifact(
  ctx: MutationCtx,
  dropId: Id<"drops">,
  stage: DropStage,
) {
  return await ctx.db
    .query("dropArtifacts")
    .withIndex("by_drop_stage_created", (q) =>
      q.eq("dropId", dropId).eq("stage", stage),
    )
    .order("desc")
    .first();
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
    case "scout": {
      const scoutInput =
        input && typeof input === "object" && !Array.isArray(input)
          ? { ...(input as Record<string, unknown>), output: outputPath }
          : { input, output: outputPath };
      return [
        "Use $scout for Drip.",
        `Input JSON: ${JSON.stringify(scoutInput)}`,
        `Output path: ${outputPath}`,
      ].join("\n");
    }
    case "designer":
      return [
        "Use $fashion-designer to create concepts and mock images for the approved Scout ideas in the input JSON.",
        `Input JSON: ${inputJson}`,
        "Keep each concept subtly related to its Scout idea through concrete cues from the Scout text; do not turn it into a literal event poster.",
        `Use assetDir ${rootDir}/fashion-designer-assets.`,
        `Write the Fashion Designer artifact to ${outputPath}.`,
        "Return a short status with the artifact path.",
      ].join("\n");
    case "marketer":
      return [
        "Use $performance-marketer to create one Facebook-only Meta drop-of-week ad for the generated Builder website in the input JSON.",
        `Input JSON: ${inputJson}`,
        `Use assetDir ${rootDir}/performance-marketer-assets.`,
        `Write the Marketer artifact to ${outputPath}.`,
        "The user clicked Create ad, so this is explicit authorization to create real Meta objects when Meta credentials are present.",
        "Before running the Meta operator, verify `python3 -c \"import requests\"`; if requests is missing in this persistent sandbox, install it with `python3 -m pip install --user requests` and retry the import once.",
        "Use the Builder destination URL and selected product images. Create exactly one traffic campaign, one ad set, one creative/ad using those images, and one ad.",
        "Use budget minor units 10000 for Meta API validity, but keep every campaign/ad set/ad delivery object configured PAUSED so no spend can occur.",
        "Do not activate delivery, do not spend money, do not run insights readback, and do not create A/B or multi-variant experiments.",
        "Persist sanitized refs/evidence only; never write raw Meta IDs, access tokens, account IDs, business IDs, or secrets into the artifact.",
        "Return a short status with the artifact path and sanitized ad evidence.",
      ].join("\n");
    case "builder":
      return [
        "Use $builder to create the live one-page drop site for the selected Designer products in the input JSON.",
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

function now() {
  return Date.now();
}
