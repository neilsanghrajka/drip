import { v } from "convex/values";

import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const runStatus = v.union(
  v.literal("created"),
  v.literal("sandbox_created"),
  v.literal("runner_started"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
);

async function runByExternalId(
  ctx: QueryCtx | MutationCtx,
  externalRunId: string,
) {
  return await ctx.db
    .query("sandboxPrototypeRuns")
    .filter((q) =>
      q.eq(q.field("externalRunId"), externalRunId),
    )
    .first();
}

export const createRun = mutation({
  args: {
    externalRunId: v.string(),
    prompt: v.string(),
    runnerIngestTokenHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await runByExternalId(ctx, args.externalRunId);
    if (existing) {
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("sandboxPrototypeRuns", {
      externalRunId: args.externalRunId,
      prompt: args.prompt,
      runnerIngestTokenHash: args.runnerIngestTokenHash,
      status: "created",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getRun = query({
  args: {
    externalRunId: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await runByExternalId(ctx, args.externalRunId);
    if (!run) {
      return null;
    }

    const safeRun = { ...run };
    delete safeRun.runnerIngestTokenHash;
    return safeRun;
  },
});

export const listEvents = query({
  args: {
    externalRunId: v.string(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("sandboxPrototypeEvents")
      .filter((q) =>
        q.eq(q.field("externalRunId"), args.externalRunId),
      )
      .collect();
    return events.sort((a, b) => a.sequence - b.sequence);
  },
});

export const ingestInternal = internalMutation({
  args: {
    externalRunId: v.string(),
    sequence: v.number(),
    source: v.string(),
    eventType: v.string(),
    status: v.optional(runStatus),
    message: v.optional(v.string()),
    payload: v.any(),
    sandboxName: v.optional(v.string()),
    sandboxCommandId: v.optional(v.string()),
    codexThreadId: v.optional(v.string()),
    finalResponse: v.optional(v.string()),
    error: v.optional(v.string()),
    runnerIngestToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await runByExternalId(ctx, args.externalRunId);
    if (!run) {
      throw new Error(`Unknown sandbox prototype run: ${args.externalRunId}`);
    }
    if (args.runnerIngestToken) {
      const tokenHash = await sha256Hex(args.runnerIngestToken);
      if (!run.runnerIngestTokenHash || tokenHash !== run.runnerIngestTokenHash) {
        throw new Error("Unauthorized runner ingest");
      }
    }

    const now = Date.now();
    await ctx.db.insert("sandboxPrototypeEvents", {
      externalRunId: args.externalRunId,
      runId: run._id,
      sequence: args.sequence,
      source: args.source,
      eventType: args.eventType,
      status: args.status,
      message: args.message,
      payload: args.payload,
      createdAt: now,
    });

    const patch: Record<string, unknown> = {
      updatedAt: now,
    };
    if (args.status && statusRank(args.status) >= statusRank(run.status)) {
      patch.status = args.status;
    }
    if (args.sandboxName) {
      patch.sandboxName = args.sandboxName;
    }
    if (args.sandboxCommandId) {
      patch.sandboxCommandId = args.sandboxCommandId;
    }
    if (args.codexThreadId) {
      patch.codexThreadId = args.codexThreadId;
    }
    if (args.finalResponse) {
      patch.finalResponse = args.finalResponse;
    }
    if (args.error) {
      patch.error = args.error;
    }
    if (args.status === "completed" || args.status === "failed") {
      patch.completedAt = now;
    }

    await ctx.db.patch(run._id, patch);
  },
});

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function statusRank(status: string) {
  switch (status) {
    case "created":
      return 0;
    case "sandbox_created":
      return 1;
    case "runner_started":
      return 2;
    case "running":
      return 3;
    case "completed":
    case "failed":
      return 4;
    default:
      return -1;
  }
}
