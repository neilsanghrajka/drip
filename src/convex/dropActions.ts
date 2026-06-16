"use node";

import { createHash } from "node:crypto";
import path from "node:path";

import { getAuthUserId } from "@convex-dev/auth/server";
import { Sandbox } from "@vercel/sandbox";
import {
  makeFunctionReference,
  type FunctionReference,
} from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import {
  collectWorkspaceImagePaths,
  contentTypeForPath,
  isRecord,
  normalizeError,
  normalizeSandboxProvisioningError,
  summarizeStageOutput,
} from "./artifactLogic";

type DropStage = "scout" | "designer" | "marketer" | "builder";
type CreateDropResult = {
  dropId: Id<"drops">;
  sandboxName: string;
};
type PreparedStageRun = {
  dropId: Id<"drops">;
  stageRunId: Id<"dropStageRuns">;
  sandboxRunId: Id<"sandboxRuns">;
  stage: DropStage;
  sandboxName: string;
  expectedOutputPath: string;
};
type CollectorContext = {
  drop: Doc<"drops">;
  stageRun: Doc<"dropStageRuns">;
  sandboxRun: Doc<"sandboxRuns">;
};
type StoredAsset = {
  sandboxPath: string;
  storageId: Id<"_storage">;
  fileName: string;
  contentType: string;
  bytes: number;
  sha256: string;
};
type SandboxGetOrCreateParams = NonNullable<
  Parameters<typeof Sandbox.getOrCreate>[0]
>;
type SnapshotSandboxParams = NonNullable<Parameters<typeof Sandbox.create>[0]> & {
  name: string;
  resume?: boolean;
  onCreate?: (sandbox: Sandbox) => Promise<void>;
};

const createDropFromAction = makeFunctionReference<
  "mutation",
  {
    workspaceId: string;
    name: string;
    dropDate: string;
    city?: string;
    startingMode: string;
    topics?: string[];
    productCategories?: string[];
    tasteConstraints?: string[];
    winningDrop?: unknown;
  },
  CreateDropResult
>("drops:createDropFromAction") as unknown as FunctionReference<
  "mutation",
  "internal",
  {
    workspaceId: string;
    name: string;
    dropDate: string;
    city?: string;
    startingMode: string;
    topics?: string[];
    productCategories?: string[];
    tasteConstraints?: string[];
    winningDrop?: unknown;
  },
  CreateDropResult
>;

const markDropSandboxReady = makeFunctionReference<
  "mutation",
  {
    dropId: Id<"drops">;
    sandboxName: string;
    sandboxId: string;
    currentSnapshotId?: string;
  },
  { status: string }
>("drops:markDropSandboxReady") as unknown as FunctionReference<
  "mutation",
  "internal",
  {
    dropId: Id<"drops">;
    sandboxName: string;
    sandboxId: string;
    currentSnapshotId?: string;
  },
  { status: string }
>;

const markDropSandboxFailed = makeFunctionReference<
  "mutation",
  {
    dropId: Id<"drops">;
    error: { message: string; code?: string };
  },
  null
>("drops:markDropSandboxFailed") as unknown as FunctionReference<
  "mutation",
  "internal",
  {
    dropId: Id<"drops">;
    error: { message: string; code?: string };
  },
  null
>;

const prepareNextStageRun = makeFunctionReference<
  "mutation",
  { dropId: Id<"drops"> },
  PreparedStageRun
>("drops:prepareNextStageRun") as unknown as FunctionReference<
  "mutation",
  "internal",
  { dropId: Id<"drops"> },
  PreparedStageRun
>;

const getDropForAction = makeFunctionReference<
  "query",
  { dropId: Id<"drops"> },
  Doc<"drops"> | null
>("drops:getDropForAction") as unknown as FunctionReference<
  "query",
  "internal",
  { dropId: Id<"drops"> },
  Doc<"drops"> | null
>;

const getStageRunForCollector = makeFunctionReference<
  "query",
  { sandboxRunId: Id<"sandboxRuns"> },
  CollectorContext | null
>("drops:getStageRunForCollector") as unknown as FunctionReference<
  "query",
  "internal",
  { sandboxRunId: Id<"sandboxRuns"> },
  CollectorContext | null
>;

const recordCollectedStageArtifact = makeFunctionReference<
  "mutation",
  {
    dropId: Id<"drops">;
    stageRunId: Id<"dropStageRuns">;
    sandboxRunId: Id<"sandboxRuns">;
    stage: DropStage;
    kind: string;
    schemaVersion: string;
    generatedAt?: string;
    sandboxPath: string;
    storageId: Id<"_storage">;
    data: unknown;
    summary?: unknown;
    assets: StoredAsset[];
  },
  { artifactId: Id<"dropArtifacts"> }
>("drops:recordCollectedStageArtifact") as unknown as FunctionReference<
  "mutation",
  "internal",
  {
    dropId: Id<"drops">;
    stageRunId: Id<"dropStageRuns">;
    sandboxRunId: Id<"sandboxRuns">;
    stage: DropStage;
    kind: string;
    schemaVersion: string;
    generatedAt?: string;
    sandboxPath: string;
    storageId: Id<"_storage">;
    data: unknown;
    summary?: unknown;
    assets: StoredAsset[];
  },
  { artifactId: Id<"dropArtifacts"> }
>;

const markStageArtifactCollectionFailed = makeFunctionReference<
  "mutation",
  {
    dropId: Id<"drops">;
    stageRunId: Id<"dropStageRuns">;
    sandboxRunId: Id<"sandboxRuns">;
    stage: DropStage;
    error: { message: string; code?: string };
  },
  null
>("drops:markStageArtifactCollectionFailed") as unknown as FunctionReference<
  "mutation",
  "internal",
  {
    dropId: Id<"drops">;
    stageRunId: Id<"dropStageRuns">;
    sandboxRunId: Id<"sandboxRuns">;
    stage: DropStage;
    error: { message: string; code?: string };
  },
  null
>;

const startSandboxRun = makeFunctionReference<
  "action",
  { sandboxRunId: Id<"sandboxRuns"> },
  { sandboxId: string; commandId: string }
>("sandboxRunActions:startSandboxRun") as unknown as FunctionReference<
  "action",
  "public",
  { sandboxRunId: Id<"sandboxRuns"> },
  { sandboxId: string; commandId: string }
>;

const createDropArgs = {
  name: v.string(),
  dropDate: v.string(),
  city: v.optional(v.string()),
  startingMode: v.string(),
  topics: v.optional(v.array(v.string())),
  productCategories: v.optional(v.array(v.string())),
  tasteConstraints: v.optional(v.array(v.string())),
  winningDrop: v.optional(v.any()),
};

export const createDropShell = action({
  args: createDropArgs,
  handler: async (ctx, args) => {
    const created = await createDropRow(ctx, args);
    return {
      ...created,
      status: "creating" as const,
    };
  },
});

export const createDrop = action({
  args: createDropArgs,
  handler: async (ctx, args) => {
    const created = await createDropRow(ctx, args);
    return await prepareDropSandbox(ctx, created);
  },
});

export const startNextStage = action({
  args: {
    dropId: v.id("drops"),
  },
  handler: async (ctx, args) => {
    await requireOwnedDrop(ctx, args.dropId);
    await ensureDropSandboxReady(ctx, args.dropId);
    const prepared = await ctx.runMutation(prepareNextStageRun, {
      dropId: args.dropId,
    });
    const started = await ctx.runAction(startSandboxRun, {
      sandboxRunId: prepared.sandboxRunId,
    });
    return {
      ...prepared,
      ...started,
    };
  },
});

async function ensureDropSandboxReady(ctx: ActionCtx, dropId: Id<"drops">) {
  const drop = await ctx.runQuery(getDropForAction, { dropId });
  if (!drop) {
    throw new Error("Drop not found.");
  }
  if (drop.status !== "creating") {
    return drop;
  }

  return await prepareDropSandbox(ctx, {
    dropId,
    sandboxName: drop.sandboxName,
  });
}

async function createDropRow(
  ctx: ActionCtx,
  args: {
    name: string;
    dropDate: string;
    city?: string;
    startingMode: string;
    topics?: string[];
    productCategories?: string[];
    tasteConstraints?: string[];
    winningDrop?: unknown;
  },
) {
  const workspaceId = await requireUserWorkspaceId(ctx);
  return await ctx.runMutation(createDropFromAction, {
    ...args,
    workspaceId,
  });
}

async function prepareDropSandbox(
  ctx: ActionCtx,
  created: CreateDropResult,
) {
  try {
    const sandbox = await getOrCreateDropSandbox(created.sandboxName);
    await assertSandboxReady(sandbox);
    const stopped = await sandbox.stop().catch(() => undefined);
    const ready = await ctx.runMutation(markDropSandboxReady, {
      dropId: created.dropId,
      sandboxName: created.sandboxName,
      sandboxId: sandbox.name,
      currentSnapshotId:
        stopped?.snapshot?.id ?? sandbox.currentSnapshotId ?? undefined,
    });
    return {
      ...created,
      status: ready.status,
    };
  } catch (error) {
    const failure = normalizeSandboxProvisioningError(
      error,
      "drop_sandbox_create_failed",
    );
    await ctx.runMutation(markDropSandboxFailed, {
      dropId: created.dropId,
      error: failure,
    });
    throw new Error(failure.message);
  }
}

export const collectStageArtifacts = internalAction({
  args: {
    sandboxRunId: v.id("sandboxRuns"),
  },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(getStageRunForCollector, {
      sandboxRunId: args.sandboxRunId,
    });
    if (!context) {
      return null;
    }

    const stage = context.sandboxRun.stage;
    if (!stage) {
      return null;
    }

    try {
      const sandbox = await Sandbox.get({
        name: context.drop.sandboxName,
        ...vercelSandboxCredentials(),
      });
      const outputPath =
        context.sandboxRun.expectedOutputPath ||
        context.stageRun.expectedOutputPath;
      const outputBuffer = await sandbox.readFileToBuffer({ path: outputPath });
      if (!outputBuffer) {
        throw new Error(`Missing stage artifact: ${outputPath}`);
      }
      const outputText = outputBuffer.toString("utf8");
      const outputJson = JSON.parse(outputText) as unknown;
      const outputRecord = isRecord(outputJson) ? outputJson : {};
      const schemaVersion =
        typeof outputRecord.schemaVersion === "string"
          ? outputRecord.schemaVersion
          : `${stage}.unknown`;
      const generatedAt =
        typeof outputRecord.generatedAt === "string"
          ? outputRecord.generatedAt
          : undefined;

      const storedOutput = await storeBuffer(
        ctx,
        outputBuffer,
        "application/json",
        `${stage} output artifact`,
      );
      const assets = await collectAssets(ctx, sandbox, outputJson);
      return await ctx.runMutation(recordCollectedStageArtifact, {
        dropId: context.drop._id,
        stageRunId: context.stageRun._id,
        sandboxRunId: context.sandboxRun._id,
        stage,
        kind: `${stage}.output`,
        schemaVersion,
        generatedAt,
        sandboxPath: outputPath,
        storageId: storedOutput.storageId,
        data: outputJson,
        summary: summarizeStageOutput(stage, outputJson),
        assets,
      });
    } catch (error) {
      await ctx.runMutation(markStageArtifactCollectionFailed, {
        dropId: context.drop._id,
        stageRunId: context.stageRun._id,
        sandboxRunId: context.sandboxRun._id,
        stage,
        error: normalizeError(error, "artifact_collection_failed"),
      });
      throw error;
    }
  },
});

async function requireUserWorkspaceId(ctx: ActionCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Sign in to access campaign history.");
  }
  return workspaceIdForUser(userId);
}

async function requireOwnedDrop(ctx: ActionCtx, dropId: Id<"drops">) {
  const workspaceId = await requireUserWorkspaceId(ctx);
  const drop = await ctx.runQuery(getDropForAction, { dropId });
  if (!drop || drop.workspaceId !== workspaceId) {
    throw new Error("Drop not found.");
  }
  return drop;
}

function workspaceIdForUser(userId: Id<"users">) {
  return `user:${userId}`;
}

async function getOrCreateDropSandbox(name: string) {
  return await getOrCreateSnapshotSandbox({
    name,
    source: {
      type: "snapshot",
      snapshotId: requiredEnv("BASE_SANDBOX_IMAGE"),
    },
    persistent: true,
    snapshotExpiration: numberEnv("DRIP_DROP_SANDBOX_SNAPSHOT_TTL_MS", 7 * 24 * 60 * 60 * 1000),
    keepLastSnapshots: {
      count: numberEnv("DRIP_DROP_SANDBOX_KEEP_SNAPSHOTS", 3),
      expiration: numberEnv("DRIP_DROP_SANDBOX_SNAPSHOT_TTL_MS", 7 * 24 * 60 * 60 * 1000),
      deleteEvicted: true,
    },
    timeout: numberEnv("DRIP_SANDBOX_TIMEOUT_MS", 30 * 60 * 1000),
    resources: {
      vcpus: numberEnv("DRIP_SANDBOX_VCPUS", 2),
    },
    ...vercelSandboxCredentials(),
  });
}

async function getOrCreateSnapshotSandbox(params: SnapshotSandboxParams) {
  // The runtime supports snapshot sources in getOrCreate; the SDK d.ts models
  // only git/tarball sources for this method in the installed version.
  return await Sandbox.getOrCreate(params as unknown as SandboxGetOrCreateParams);
}

async function assertSandboxReady(sandbox: Sandbox) {
  const command = await sandbox.runCommand({
    cmd: "node",
    args: [
      "-e",
      [
        "const fs=require('node:fs');",
        "for (const p of ['/vercel/sandbox/runner/index.ts','/vercel/sandbox/agent-workspace/.codex','/vercel/sandbox/agent-workspace/.agents']) {",
        "if (!fs.existsSync(p)) throw new Error(`missing ${p}`);",
        "}",
        "console.log('drop-sandbox-ready');",
      ].join(" "),
    ],
    cwd: sandboxRunnerCwd(),
    timeoutMs: 30_000,
  });
  if (command.exitCode !== 0) {
    throw new Error(
      `Drop sandbox sanity check failed: ${(await command.stderr()).trim()}`,
    );
  }
}

async function collectAssets(
  ctx: ActionCtx,
  sandbox: Sandbox,
  outputJson: unknown,
) {
  const paths = [...new Set(collectWorkspaceImagePaths(outputJson))].slice(0, 50);
  const assets: StoredAsset[] = [];
  for (const sandboxPath of paths) {
    const buffer = await sandbox.readFileToBuffer({ path: sandboxPath });
    if (!buffer) {
      throw new Error(`Missing referenced asset: ${sandboxPath}`);
    }
    const contentType = contentTypeForPath(sandboxPath);
    const storedAsset = await storeBuffer(
      ctx,
      buffer,
      contentType,
      `asset ${path.posix.basename(sandboxPath)}`,
    );
    assets.push({
      sandboxPath,
      storageId: storedAsset.storageId,
      fileName: path.posix.basename(sandboxPath),
      contentType,
      bytes: buffer.byteLength,
      sha256: storedAsset.sha256,
    });
  }
  return assets;
}

async function storeBuffer(
  ctx: ActionCtx,
  buffer: Buffer,
  contentType: string,
  label: string,
) {
  const sha256 = sha256Hex(buffer);
  try {
    const storageId = await ctx.storage.store(
      new Blob([toArrayBuffer(buffer)], { type: contentType }),
    );
    return { storageId, sha256 };
  } catch (error) {
    throw new Error(
      `Error uploading ${label} (${contentType}, ${buffer.byteLength} bytes): ${errorMessage(error)}`,
    );
  }
}

function vercelSandboxCredentials() {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const missing = [
    token ? null : "VERCEL_TOKEN",
    teamId ? null : "VERCEL_TEAM_ID",
    projectId ? null : "VERCEL_PROJECT_ID",
  ].filter((value): value is string => value !== null);
  if (missing.length > 0) {
    throw new Error(
      `Vercel Sandbox credentials are required: missing ${missing.join(", ")}.`,
    );
  }
  return { token, teamId, projectId };
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function sandboxRunnerCwd() {
  return process.env.DRIP_SANDBOX_RUNNER_CWD ?? "/vercel/sandbox/runner";
}

function numberEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a finite number.`);
  }
  return parsed;
}

function sha256Hex(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function toArrayBuffer(buffer: Buffer) {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return bytes.buffer as ArrayBuffer;
}
