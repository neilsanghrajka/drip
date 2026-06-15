import { getAuthUserId } from "@convex-dev/auth/server";
import {
  makeFunctionReference,
  type FunctionReference,
} from "convex/server";
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

const sandboxRunnerTerminalStatus = v.union(
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("cancelled"),
);

const terminalStatuses = new Set(["succeeded", "failed", "cancelled", "lost"]);
const maxEventPageSize = 100;

const dropStage = v.union(
  v.literal("scout"),
  v.literal("designer"),
  v.literal("marketer"),
  v.literal("builder"),
);

const collectStageArtifacts = makeFunctionReference<
  "action",
  { sandboxRunId: Id<"sandboxRuns"> },
  null
>("dropActions:collectStageArtifacts") as unknown as FunctionReference<
  "action",
  "internal",
  { sandboxRunId: Id<"sandboxRuns"> },
  null
>;

type SandboxRunError = {
  message: string;
  code?: string;
};

function now() {
  return Date.now();
}

async function currentUserWorkspaceId(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  return userId ? workspaceIdForUser(userId) : null;
}

async function requireUserWorkspaceId(ctx: QueryCtx | MutationCtx) {
  const workspaceId = await currentUserWorkspaceId(ctx);
  if (!workspaceId) {
    throw new Error("Sign in to access campaign runs.");
  }
  return workspaceId;
}

async function ownsSandboxRun(
  ctx: QueryCtx | MutationCtx,
  sandboxRun: Doc<"sandboxRuns">,
) {
  const workspaceId = await currentUserWorkspaceId(ctx);
  return Boolean(workspaceId && sandboxRun.workspaceId === workspaceId);
}

function workspaceIdForUser(userId: Id<"users">) {
  return `user:${userId}`;
}

async function getSandboxRunOrThrow(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  sandboxRunId: Id<"sandboxRuns">,
) {
  const sandboxRun = await ctx.db.get(sandboxRunId);
  if (!sandboxRun) {
    throw new Error("Sandbox run not found.");
  }
  return sandboxRun;
}

function safeSandboxRun(sandboxRun: Doc<"sandboxRuns">) {
  const copy = { ...sandboxRun };
  delete copy.ingestTokenHash;
  return copy;
}

async function verifySandboxRunnerToken(
  sandboxRun: Doc<"sandboxRuns">,
  ingestToken: string,
) {
  const tokenHash = await sha256Hex(ingestToken);
  if (!sandboxRun.ingestTokenHash || tokenHash !== sandboxRun.ingestTokenHash) {
    throw new Error("Unauthorized runner token.");
  }
}

async function latestSandboxRunEventSeq(
  ctx: QueryCtx | MutationCtx,
  sandboxRunId: Id<"sandboxRuns">,
) {
  const latest = await ctx.db
    .query("sandboxRunEvents")
    .withIndex("by_sandbox_run_seq", (q) => q.eq("sandboxRunId", sandboxRunId))
    .order("desc")
    .first();
  return latest?.seq ?? 0;
}

async function sandboxRunEventBySeq(
  ctx: QueryCtx | MutationCtx,
  sandboxRunId: Id<"sandboxRuns">,
  seq: number,
) {
  return await ctx.db
    .query("sandboxRunEvents")
    .withIndex("by_sandbox_run_seq", (q) =>
      q.eq("sandboxRunId", sandboxRunId).eq("seq", seq),
    )
    .first();
}

export const createSandboxRun = mutation({
  args: {
    workspaceId: v.string(),
    task: v.string(),
    dropId: v.optional(v.id("drops")),
    dropStageRunId: v.optional(v.id("dropStageRuns")),
    stage: v.optional(dropStage),
    sandboxName: v.optional(v.string()),
    expectedOutputPath: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workspaceId = await requireUserWorkspaceId(ctx);
    const timestamp = now();
    const sandboxRunId = await ctx.db.insert("sandboxRuns", {
      workspaceId,
      task: args.task,
      status: "queued",
      dropId: args.dropId,
      dropStageRunId: args.dropStageRunId,
      stage: args.stage,
      sandboxName: args.sandboxName,
      expectedOutputPath: args.expectedOutputPath,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return { sandboxRunId };
  },
});

export const getSandboxRun = query({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
  },
  handler: async (ctx, args) => {
    const sandboxRun = await ctx.db.get(args.sandboxRunId);
    if (!sandboxRun || !(await ownsSandboxRun(ctx, sandboxRun))) {
      return null;
    }
    return safeSandboxRun(sandboxRun);
  },
});

export const listSandboxRunEvents = query({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
    afterSeq: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sandboxRun = await ctx.db.get(args.sandboxRunId);
    if (!sandboxRun || !(await ownsSandboxRun(ctx, sandboxRun))) {
      return [];
    }

    const query = ctx.db
      .query("sandboxRunEvents")
      .withIndex("by_sandbox_run_seq", (q) => {
        const runQuery = q.eq("sandboxRunId", args.sandboxRunId);
        return args.afterSeq === undefined
          ? runQuery
          : runQuery.gt("seq", args.afterSeq);
      });

    return await query.take(maxEventPageSize);
  },
});

export const cancelSandboxRun = mutation({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
  },
  handler: async (ctx, args) => {
    const sandboxRun = await getSandboxRunOrThrow(ctx, args.sandboxRunId);
    if (!(await ownsSandboxRun(ctx, sandboxRun))) {
      throw new Error("Sandbox run not found.");
    }

    if (terminalStatuses.has(sandboxRun.status)) {
      return { status: sandboxRun.status };
    }

    const timestamp = now();
    await ctx.db.patch(args.sandboxRunId, {
      status: "cancelled",
      cancelRequestedAt: timestamp,
      updatedAt: timestamp,
    });

    if (sandboxRun.dropId && sandboxRun.dropStageRunId && sandboxRun.stage) {
      await markDropStageFinished(ctx, sandboxRun, "cancelled", {
        message: "Sandbox run cancelled.",
        code: "sandbox_run_cancelled",
      });
    }

    return { status: "cancelled" as const };
  },
});

export const getSandboxRunForRunner = mutation({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
    ingestToken: v.string(),
  },
  handler: async (ctx, args) => {
    const sandboxRun = await getSandboxRunOrThrow(ctx, args.sandboxRunId);
    await verifySandboxRunnerToken(sandboxRun, args.ingestToken);

    return {
      task: sandboxRun.task,
      expectedOutputPath: sandboxRun.expectedOutputPath,
      cancelRequested: sandboxRun.cancelRequestedAt !== undefined,
    };
  },
});

export const ingestSandboxRunEvent = mutation({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
    ingestToken: v.string(),
    seq: v.number(),
    type: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const sandboxRun = await getSandboxRunOrThrow(ctx, args.sandboxRunId);
    await verifySandboxRunnerToken(sandboxRun, args.ingestToken);

    const latestSeq = await latestSandboxRunEventSeq(ctx, args.sandboxRunId);
    const expectedSeq = latestSeq + 1;

    if (args.seq <= latestSeq) {
      const existing = await sandboxRunEventBySeq(
        ctx,
        args.sandboxRunId,
        args.seq,
      );
      return {
        accepted: Boolean(existing),
        expectedSeq,
      };
    }

    if (args.seq !== expectedSeq) {
      return {
        accepted: false,
        expectedSeq,
      };
    }

    const timestamp = now();
    await ctx.db.insert("sandboxRunEvents", {
      sandboxRunId: args.sandboxRunId,
      seq: args.seq,
      type: args.type,
      payload: args.payload,
      createdAt: timestamp,
    });

    const patch: Partial<Doc<"sandboxRuns">> = {
      updatedAt: timestamp,
    };
    const codexThreadId = readCodexThreadId(args.type, args.payload);
    if (codexThreadId) {
      patch.codexThreadId = codexThreadId;
    }

    await ctx.db.patch(args.sandboxRunId, patch);

    return {
      accepted: true,
      expectedSeq: args.seq + 1,
    };
  },
});

export const heartbeatSandboxRun = mutation({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
    ingestToken: v.string(),
  },
  handler: async (ctx, args) => {
    const sandboxRun = await getSandboxRunOrThrow(ctx, args.sandboxRunId);
    await verifySandboxRunnerToken(sandboxRun, args.ingestToken);

    const timestamp = now();
    await ctx.db.patch(args.sandboxRunId, {
      lastHeartbeatAt: timestamp,
      updatedAt: timestamp,
    });

    return {
      cancelRequested: sandboxRun.cancelRequestedAt !== undefined,
    };
  },
});

export const finishSandboxRun = mutation({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
    ingestToken: v.string(),
    status: sandboxRunnerTerminalStatus,
    result: v.optional(v.any()),
    error: v.optional(
      v.object({
        message: v.string(),
        code: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const sandboxRun = await getSandboxRunOrThrow(ctx, args.sandboxRunId);
    await verifySandboxRunnerToken(sandboxRun, args.ingestToken);

    const timestamp = now();
    await ctx.db.patch(args.sandboxRunId, {
      status: args.status,
      result: args.result,
      error: args.error,
      updatedAt: timestamp,
    });

    if (sandboxRun.dropId && sandboxRun.dropStageRunId && sandboxRun.stage) {
      await markDropStageFinished(
        ctx,
        sandboxRun,
        args.status,
        args.error,
      );
      if (args.status === "succeeded") {
        await ctx.scheduler.runAfter(0, collectStageArtifacts, {
          sandboxRunId: args.sandboxRunId,
        });
      }
    }

    return { status: args.status };
  },
});

export const getSandboxRunForAction = internalQuery({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sandboxRunId);
  },
});

export const markSandboxRunProvisioningFromAction = internalMutation({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
    ingestTokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const sandboxRun = await getSandboxRunOrThrow(ctx, args.sandboxRunId);
    if (terminalStatuses.has(sandboxRun.status)) {
      throw new Error(`Sandbox run is already terminal: ${sandboxRun.status}`);
    }

    await ctx.db.patch(args.sandboxRunId, {
      status: "provisioning",
      ingestTokenHash: args.ingestTokenHash,
      updatedAt: now(),
    });

    if (sandboxRun.dropId && sandboxRun.dropStageRunId && sandboxRun.stage) {
      await markDropStageStarting(ctx, sandboxRun);
    }
  },
});

export const markSandboxRunRunningFromAction = internalMutation({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
    sandboxId: v.string(),
    commandId: v.string(),
  },
  handler: async (ctx, args) => {
    const sandboxRun = await getSandboxRunOrThrow(ctx, args.sandboxRunId);
    if (terminalStatuses.has(sandboxRun.status)) {
      return { status: sandboxRun.status };
    }

    await ctx.db.patch(args.sandboxRunId, {
      status: "running",
      sandboxId: args.sandboxId,
      commandId: args.commandId,
      lastHeartbeatAt: now(),
      updatedAt: now(),
    });

    if (sandboxRun.dropId && sandboxRun.dropStageRunId && sandboxRun.stage) {
      await markDropStageRunning(ctx, sandboxRun, {
        sandboxId: args.sandboxId,
        commandId: args.commandId,
      });
    }

    return { status: "running" as const };
  },
});

export const markSandboxRunFailedFromAction = internalMutation({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
    error: v.object({
      message: v.string(),
      code: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const sandboxRun = await getSandboxRunOrThrow(ctx, args.sandboxRunId);

    await ctx.db.patch(args.sandboxRunId, {
      status: "failed",
      error: args.error,
      updatedAt: now(),
    });

    if (sandboxRun.dropId && sandboxRun.dropStageRunId && sandboxRun.stage) {
      await markDropStageFailed(ctx, sandboxRun, args.error);
    }
  },
});

async function markDropStageStarting(
  ctx: MutationCtx,
  sandboxRun: Doc<"sandboxRuns">,
) {
  const timestamp = now();
  await ctx.db.patch(sandboxRun.dropStageRunId!, {
    status: "starting",
    updatedAt: timestamp,
  });
  await ctx.db.patch(sandboxRun.dropId!, {
    status: runningDropStatus(sandboxRun.stage!),
    currentStage: sandboxRun.stage,
    updatedAt: timestamp,
  });
  await insertDropEvent(ctx, {
    dropId: sandboxRun.dropId!,
    dropStageRunId: sandboxRun.dropStageRunId,
    sandboxRunId: sandboxRun._id,
    stage: sandboxRun.stage,
    type: "stage.starting",
    message: `${stageLabel(sandboxRun.stage!)} is starting.`,
    visibility: "user",
    payload: {
      sandboxName: sandboxRun.sandboxName,
      expectedOutputPath: sandboxRun.expectedOutputPath,
    },
  });
}

async function markDropStageRunning(
  ctx: MutationCtx,
  sandboxRun: Doc<"sandboxRuns">,
  ids: { sandboxId: string; commandId: string },
) {
  const timestamp = now();
  await ctx.db.patch(sandboxRun.dropStageRunId!, {
    status: "running",
    sandboxId: ids.sandboxId,
    commandId: ids.commandId,
    startedAt: timestamp,
    updatedAt: timestamp,
  });
  await ctx.db.patch(sandboxRun.dropId!, {
    currentSandboxId: ids.sandboxId,
    status: runningDropStatus(sandboxRun.stage!),
    currentStage: sandboxRun.stage,
    updatedAt: timestamp,
  });
  await insertDropEvent(ctx, {
    dropId: sandboxRun.dropId!,
    dropStageRunId: sandboxRun.dropStageRunId,
    sandboxRunId: sandboxRun._id,
    stage: sandboxRun.stage,
    type: "stage.running",
    message: `${stageLabel(sandboxRun.stage!)} is running in the drop sandbox.`,
    visibility: "user",
    payload: {
      sandboxId: ids.sandboxId,
      commandId: ids.commandId,
    },
  });
}

async function markDropStageFailed(
  ctx: MutationCtx,
  sandboxRun: Doc<"sandboxRuns">,
  error: SandboxRunError,
) {
  const timestamp = now();
  await ctx.db.patch(sandboxRun.dropStageRunId!, {
    status: "failed",
    error,
    completedAt: timestamp,
    updatedAt: timestamp,
  });
  await ctx.db.patch(sandboxRun.dropId!, {
    status: "failed",
    error,
    updatedAt: timestamp,
  });
  await insertDropEvent(ctx, {
    dropId: sandboxRun.dropId!,
    dropStageRunId: sandboxRun.dropStageRunId,
    sandboxRunId: sandboxRun._id,
    stage: sandboxRun.stage,
    type: "stage.failed",
    message: `${stageLabel(sandboxRun.stage!)} failed before the runner started.`,
    visibility: "user",
    payload: { error },
  });
}

async function markDropStageFinished(
  ctx: MutationCtx,
  sandboxRun: Doc<"sandboxRuns">,
  status: "succeeded" | "failed" | "cancelled",
  error?: SandboxRunError,
) {
  const timestamp = now();
  const stageStatus =
    status === "succeeded"
      ? "collecting"
      : status === "cancelled"
        ? "cancelled"
        : "failed";

  const stagePatch: {
    status: "collecting" | "failed" | "cancelled";
    error?: SandboxRunError;
    completedAt?: number;
    updatedAt: number;
  } = {
    status: stageStatus,
    error,
    updatedAt: timestamp,
  };
  if (status !== "succeeded") {
    stagePatch.completedAt = timestamp;
  }

  await ctx.db.patch(sandboxRun.dropStageRunId!, stagePatch);

  if (status !== "succeeded") {
    await ctx.db.patch(sandboxRun.dropId!, {
      status: status === "cancelled" ? "cancelled" : "failed",
      error,
      updatedAt: timestamp,
    });
  }

  await insertDropEvent(ctx, {
    dropId: sandboxRun.dropId!,
    dropStageRunId: sandboxRun.dropStageRunId,
    sandboxRunId: sandboxRun._id,
    stage: sandboxRun.stage,
    type: `stage.${status}`,
    message:
      status === "succeeded"
        ? `${stageLabel(sandboxRun.stage!)} finished. Collecting the artifact.`
        : `${stageLabel(sandboxRun.stage!)} ${status}.`,
    visibility: "user",
    payload: error ? { error } : undefined,
  });
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

function runningDropStatus(stage: DropStage) {
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

type DropStage = "scout" | "designer" | "marketer" | "builder";

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function readCodexThreadId(type: string, payload: unknown) {
  if (type !== "thread.started") {
    return undefined;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  const threadId = (payload as Record<string, unknown>).thread_id;
  return typeof threadId === "string" ? threadId : undefined;
}

export type PublicSandboxRunError = SandboxRunError;
