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

type SandboxRunError = {
  message: string;
  code?: string;
};

function now() {
  return Date.now();
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
  },
  handler: async (ctx, args) => {
    const timestamp = now();
    const sandboxRunId = await ctx.db.insert("sandboxRuns", {
      workspaceId: args.workspaceId,
      task: args.task,
      status: "queued",
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
    return sandboxRun ? safeSandboxRun(sandboxRun) : null;
  },
});

export const listSandboxRunEvents = query({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
    afterSeq: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
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

    if (terminalStatuses.has(sandboxRun.status)) {
      return { status: sandboxRun.status };
    }

    const timestamp = now();
    const nextStatus =
      sandboxRun.status === "queued" ? "cancelled" : sandboxRun.status;

    await ctx.db.patch(args.sandboxRunId, {
      status: nextStatus,
      cancelRequestedAt: timestamp,
      updatedAt: timestamp,
    });

    return { status: nextStatus };
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
    await ctx.db.patch(args.sandboxRunId, {
      status: "failed",
      error: args.error,
      updatedAt: now(),
    });
  },
});

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
