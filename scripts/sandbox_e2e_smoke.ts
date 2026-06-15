import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Sandbox } from "@vercel/sandbox";
import { ConvexHttpClient } from "convex/browser";

import type { Id } from "../src/convex/_generated/dataModel";
import { api } from "../src/convex/_generated/api";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const privateEnvPath = path.join(repoRoot, ".env");
const defaultArtifactRoot = path.join(repoRoot, ".sandbox-e2e");
const terminalStatuses = new Set(["succeeded", "failed", "cancelled", "lost"]);
const defaultTimeoutMs = 8 * 60 * 1000;
const defaultPollMs = 5_000;
const defaultStartAttempts = 3;
const startRetryDelayMs = 30_000;
const builderWorkspaceRoot = "/vercel/sandbox/agent-workspace";
const builderDefaultSiteDir = `${builderWorkspaceRoot}/builder-site`;
const builderStaticDirRelative = ".vercel/output/static";
let convexClient: ConvexHttpClient | null = null;

type ScenarioName =
  | "fashion-designer-product"
  | "scout-cultural"
  | "builder-drop-site"
  | "drop-workflow-builder"
  | "performance-marketer-facebook-paused";

type CliOptions = {
  scenario: ScenarioName | "all";
  timeoutMs: number;
  pollMs: number;
  startAttempts: number;
  artifactRoot: string;
  keepSandbox: boolean;
  skipSandboxFiles: boolean;
  cleanupArtifacts: boolean;
  allowMetaCreate: boolean;
};

type SandboxRun = {
  _id: string;
  status: string;
  task: string;
  workspaceId: string;
  dropId?: string;
  dropStageRunId?: string;
  stage?: DropStage;
  sandboxName?: string;
  expectedOutputPath?: string;
  createdAt?: number;
  updatedAt?: number;
  lastHeartbeatAt?: number;
  sandboxId?: string;
  commandId?: string;
  codexThreadId?: string;
  result?: {
    finalResponse?: string;
    usage?: unknown;
  };
  error?: {
    message: string;
    code?: string;
  };
};

type SandboxEvent = {
  seq: number;
  type: string;
  createdAt?: number;
  payload?: unknown;
};

type RunResult = {
  run: SandboxRun;
  events: SandboxEvent[];
  artifactDir: string;
  dbState: DbStateEvidence;
  outputJson?: unknown;
  assets: AssetEvidence[];
  samples: SmokeSample[];
};

type AssetEvidence = {
  sandboxPath: string;
  localPath: string;
  fileName: string;
  bytes: number;
  sha256: string;
  image: {
    format: "png" | "jpeg" | "webp";
    validSignature: boolean;
    width: number;
    height: number;
  };
};

type SmokeSample = {
  label: string;
  value: string;
  path?: string;
  url?: string;
  status?: number;
  bytes?: number;
};

type SandboxFileInfo = {
  sandboxPath: string;
  relativePath: string;
  bytes: number;
};

type Scenario = {
  name: ScenarioName;
  workspaceId: string;
  task: string;
  outputPath: string;
  collectAssets: boolean;
  validateEvents: (run: SandboxRun, events: SandboxEvent[]) => void;
  validateOutput: (output: unknown) => void;
  validateSandboxFiles?: (args: {
    run: SandboxRun;
    output: unknown;
    artifactDir: string;
  }) => Promise<SmokeSample[]>;
};

type CreatedRun = {
  sandboxRunId: string;
  task: string;
  workspaceId: string;
};

type StartSandboxRunResult = {
  commandId: string;
  sandboxId: string;
  sandboxName?: string;
};

type DropStage = "scout" | "designer" | "marketer" | "builder";

type CreatedDrop = {
  dropId: string;
  sandboxName: string;
  status: string;
  workspaceId: string;
  name: string;
  dropDate: string;
};

type StartDropStageResult = StartSandboxRunResult & {
  dropId: string;
  stageRunId: string;
  sandboxRunId: string;
  stage: DropStage;
  sandboxName: string;
  expectedOutputPath: string;
};

type DropRecord = {
  _id: string;
  workspaceId: string;
  name: string;
  dropDate: string;
  startingMode: string;
  status: string;
  currentStage?: DropStage;
  sandboxName: string;
  currentSandboxId?: string;
  currentSnapshotId?: string;
  websiteUrl?: string;
  createdAt: number;
  updatedAt: number;
  error?: {
    message: string;
    code?: string;
  };
};

type DropStageRun = {
  _id: string;
  dropId: string;
  sandboxRunId?: string;
  stage: DropStage;
  attempt: number;
  status: string;
  sandboxName: string;
  sandboxId?: string;
  commandId?: string;
  input?: unknown;
  expectedOutputPath: string;
  outputArtifactId?: string;
  error?: {
    message: string;
    code?: string;
  };
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
};

type DropArtifact = {
  _id: string;
  dropId: string;
  dropStageRunId: string;
  sandboxRunId: string;
  stage: DropStage;
  kind: string;
  schemaVersion: string;
  generatedAt?: string;
  sandboxPath: string;
  data: unknown;
  summary?: unknown;
  createdAt: number;
};

type DropView = {
  drop: DropRecord;
  stageRuns: DropStageRun[];
  artifacts: DropArtifact[];
  selections: unknown[];
};

type DropEvent = {
  seq: number;
  stage?: DropStage;
  type: string;
  message?: string;
  visibility: "user" | "debug";
  payload?: unknown;
  createdAt?: number;
};

type RunStateEvidence = {
  status: string;
  sandboxRunId: string;
  sandboxId: string | null;
  commandId: string | null;
  codexThreadId: string | null;
  hasFinalResponse: boolean;
  eventCount?: number;
};

type DbStateEvidence = {
  queued: RunStateEvidence;
  started: RunStateEvidence & {
    actionCommandId: string;
    actionSandboxId: string;
  };
  terminal: RunStateEvidence;
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  await loadPrivateEnv();
  const options = parseArgs(process.argv.slice(2));
  const scenarios = selectScenarios(options);
  const results: RunResult[] = [];

  for (const scenario of scenarios) {
    results.push(await runScenarioWithRetries(scenario, options));
  }

  const summaryPath = path.join(options.artifactRoot, "latest-summary.json");
  await mkdir(options.artifactRoot, { recursive: true });
  await writeFile(
    summaryPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        scenarios: results.map((result) => ({
          name: result.run.workspaceId,
          sandboxRunId: result.run._id,
          status: result.run.status,
          sandboxId: result.run.sandboxId ?? null,
          dbState: result.dbState,
          durationMs:
            result.run.createdAt && result.run.updatedAt
              ? result.run.updatedAt - result.run.createdAt
              : null,
          artifactDir: result.artifactDir,
          assets: result.assets,
          samples: result.samples,
        })),
      },
      null,
      2,
    ),
  );

  console.log(`sandbox-e2e-ok ${summaryPath}`);
}

async function runScenarioWithRetries(
  scenario: Scenario,
  options: CliOptions,
): Promise<RunResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.startAttempts; attempt += 1) {
    try {
      return await runScenario(scenario, options);
    } catch (error) {
      lastError = error;
      if (attempt >= options.startAttempts || !isTransientSandboxStartError(error)) {
        throw error;
      }
      console.warn(
        `${scenario.name}: transient sandbox start failure; retrying attempt ${
          attempt + 1
        }/${options.startAttempts} in ${startRetryDelayMs / 1000}s.`,
      );
      await sleep(startRetryDelayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function runScenario(
  scenario: Scenario,
  options: CliOptions,
): Promise<RunResult> {
  if (scenario.name === "drop-workflow-builder") {
    return await runDropWorkflowBuilderScenario(scenario, options);
  }

  const created = await createSandboxRun(scenario);
  const runId = created.sandboxRunId;
  const artifactDir = path.join(options.artifactRoot, scenario.name, runId);
  await mkdir(artifactDir, { recursive: true });

  let run: SandboxRun | null = null;
  let events: SandboxEvent[] = [];
  let sandbox: Sandbox | undefined;
  const startedAt = Date.now();

  try {
    const queuedRun = await getSandboxRun(runId);
    assertQueuedRun(scenario, created, queuedRun);

    const startResult = await startSandboxRun(runId);
    const startedRun = await getSandboxRun(runId);
    assertStartedRun(scenario, startResult, startedRun);
    run = startedRun;

    const waited = await waitForRun(runId, options);
    run = waited.run;
    events = waited.events;

    assert(run.status === "succeeded", `${scenario.name}: run status ${run.status}`);
    assert(run.result?.finalResponse, `${scenario.name}: missing final response`);
    validateCommonEvents(scenario.name, events);
    scenario.validateEvents(run, events);
    assertTerminalRun(scenario, startResult, run, events);
    const dbState = buildDbStateEvidence({
      events,
      queuedRun: queuedRun!,
      startResult,
      startedRun: startedRun!,
      terminalRun: run,
    });

    const output = options.skipSandboxFiles
      ? undefined
      : await readSandboxOutput(run, scenario, artifactDir);
    if (output !== undefined) {
      assertGeneratedAtFresh(scenario.name, output, startedAt, Date.now());
      scenario.validateOutput(output);
    }

    const assets =
      output === undefined || !scenario.collectAssets
        ? []
        : await collectAssetEvidence(run, output, artifactDir);
    const samples =
      output === undefined || !scenario.validateSandboxFiles
        ? []
        : await scenario.validateSandboxFiles({ run, output, artifactDir });

    await writeEvidenceFiles({
      artifactDir,
      dbState,
      run,
      events,
      output,
      assets,
      samples,
      startedAt,
    });

    if (!options.keepSandbox && run.sandboxId) {
      sandbox = await getSandbox(run.sandboxId);
      await deleteSandbox(sandbox);
    }

    if (options.cleanupArtifacts) {
      await rm(artifactDir, { recursive: true, force: true });
    }

    return {
      run,
      events,
      artifactDir,
      dbState,
      outputJson: output,
      assets,
      samples,
    };
  } catch (error) {
    await writeFailureEvidence({ artifactDir, run, events, error }).catch(
      () => undefined,
    );
    await cancelSandboxRun(runId).catch(() => undefined);
    const currentRun = run ?? (await getSandboxRun(runId).catch(() => null));
    if (!keepSandboxAfterFailure(options) && currentRun?.sandboxId) {
      sandbox = await getSandbox(currentRun.sandboxId).catch(() => undefined);
      if (sandbox) {
        await deleteSandbox(sandbox);
      }
    }
    throw error;
  }
}

async function runDropWorkflowBuilderScenario(
  scenario: Scenario,
  options: CliOptions,
): Promise<RunResult> {
  const smokeId = Date.now().toString(36);
  const artifactDir = path.join(options.artifactRoot, scenario.name, smokeId);
  await mkdir(artifactDir, { recursive: true });

  let created: CreatedDrop | null = null;
  let stageStart: StartDropStageResult | null = null;
  let run: SandboxRun | null = null;
  let events: SandboxEvent[] = [];
  let sandbox: Sandbox | undefined;
  const startedAt = Date.now();

  try {
    created = await createDropForBuilderScenario(scenario, smokeId);
    const readyDrop = await getDrop(created.dropId);
    assertDropReadyForBuilder(created, readyDrop);

    stageStart = await startDropNextStage(created.dropId);
    assert(stageStart.stage === "builder", "Drop workflow did not start Builder.");
    assert(
      stageStart.sandboxName === created.sandboxName,
      "Drop workflow changed sandboxName before Builder.",
    );

    const startedRun = await getSandboxRun(stageStart.sandboxRunId);
    assertDropStartedRun(scenario, created, stageStart, startedRun);
    run = startedRun;

    const waited = await waitForRun(stageStart.sandboxRunId, options);
    run = waited.run;
    events = waited.events;

    assert(run.status === "succeeded", `${scenario.name}: run status ${run.status}`);
    assert(run.result?.finalResponse, `${scenario.name}: missing final response`);

    const dynamicScenario = {
      ...scenario,
      outputPath: stageStart.expectedOutputPath,
    };
    validateCommonEvents(scenario.name, events);
    scenario.validateEvents(run, events);
    assertTerminalRun(dynamicScenario, stageStart, run, events);

    const dbState = buildDbStateEvidence({
      events,
      queuedRun: startedRun!,
      startResult: stageStart,
      startedRun: startedRun!,
      terminalRun: run,
    });

    const output = options.skipSandboxFiles
      ? undefined
      : await readSandboxOutput(run, dynamicScenario, artifactDir);
    if (output !== undefined) {
      assertGeneratedAtFresh(scenario.name, output, startedAt, Date.now());
      scenario.validateOutput(output);
    }

    const dropView = await waitForDropCompletion(created.dropId, options);
    const builderArtifact = assertDropBuilderState({
      created,
      stageStart,
      terminalRun: run,
      dropView,
      output,
    });
    if (output === undefined) {
      scenario.validateOutput(builderArtifact.data);
    }

    const assets =
      output === undefined || !scenario.collectAssets
        ? []
        : await collectAssetEvidence(run, output, artifactDir);
    const samples =
      output === undefined || !scenario.validateSandboxFiles
        ? []
        : await scenario.validateSandboxFiles({
            run,
            output,
            artifactDir,
          });
    const dropSamples = buildDropSamples(dropView, builderArtifact);
    const allSamples = [...samples, ...dropSamples];
    const dropEvents = await listDropEvents(created.dropId);

    await writeEvidenceFiles({
      artifactDir,
      dbState,
      run,
      events,
      output,
      assets,
      samples: allSamples,
      startedAt,
    });
    await writeDropEvidenceFiles({
      artifactDir,
      dropView,
      dropEvents,
      stageStart,
    });

    if (!options.keepSandbox && run.sandboxId) {
      sandbox = await getSandbox(run.sandboxId);
      await deleteSandbox(sandbox);
    }

    if (options.cleanupArtifacts) {
      await rm(artifactDir, { recursive: true, force: true });
    }

    return {
      run,
      events,
      artifactDir,
      dbState,
      outputJson: output,
      assets,
      samples: allSamples,
    };
  } catch (error) {
    await writeFailureEvidence({ artifactDir, run, events, error }).catch(
      () => undefined,
    );
    if (stageStart?.sandboxRunId) {
      await cancelSandboxRun(stageStart.sandboxRunId).catch(() => undefined);
    }
    const sandboxName =
      run?.sandboxId ?? stageStart?.sandboxId ?? created?.sandboxName;
    if (!keepSandboxAfterFailure(options) && sandboxName) {
      sandbox = await getSandbox(sandboxName).catch(() => undefined);
      if (sandbox) {
        await deleteSandbox(sandbox);
      }
    }
    throw error;
  }
}

async function writeFailureEvidence({
  artifactDir,
  run,
  events,
  error,
}: {
  artifactDir: string;
  run: SandboxRun | null;
  events: SandboxEvent[];
  error: unknown;
}) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(
    path.join(artifactDir, "failure.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        run,
        eventCounts: countBy(events.map((event) => event.type)),
      },
      null,
      2,
    ),
  );
  if (events.length > 0) {
    await writeFile(
      path.join(artifactDir, "events.json"),
      JSON.stringify(events, null, 2),
    );
  }
}

async function writeDropEvidenceFiles({
  artifactDir,
  dropView,
  dropEvents,
  stageStart,
}: {
  artifactDir: string;
  dropView: DropView;
  dropEvents: DropEvent[];
  stageStart: StartDropStageResult;
}) {
  await writeFile(
    path.join(artifactDir, "drop.json"),
    JSON.stringify(dropView, null, 2),
  );
  await writeFile(
    path.join(artifactDir, "drop-events.json"),
    JSON.stringify(dropEvents, null, 2),
  );
  await writeFile(
    path.join(artifactDir, "drop-stage-start.json"),
    JSON.stringify(stageStart, null, 2),
  );
}

async function createSandboxRun(scenario: Scenario): Promise<CreatedRun> {
  const suffix = Date.now().toString(36);
  const workspaceId = `${scenario.workspaceId}-${suffix}`;
  const response = await convexRun<{ sandboxRunId: string }>(
    "sandboxRuns:createSandboxRun",
    {
      workspaceId,
      task: scenario.task,
    },
  );
  return {
    sandboxRunId: response.sandboxRunId,
    task: scenario.task,
    workspaceId,
  };
}

async function createDropForBuilderScenario(
  scenario: Scenario,
  smokeId: string,
): Promise<CreatedDrop> {
  const workspaceId = `${scenario.workspaceId}-${smokeId}`;
  const dropDate = new Date().toISOString().slice(0, 10);
  const name = `E2E Builder Drop ${smokeId}`;
  const response = await convexRun<{
    dropId: string;
    sandboxName: string;
    status: string;
  }>("dropActions:createDrop", {
    workspaceId,
    name,
    dropDate,
    startingMode: "builder-ready-smoke",
    topics: ["Mumbai street cricket after monsoon rain"],
    productCategories: ["caps"],
    tasteConstraints: ["premium streetwear", "one-viewport drop site"],
    winningDrop: builderWinningDropInput(),
  });
  return {
    ...response,
    workspaceId,
    name,
    dropDate,
  };
}

async function startDropNextStage(dropId: string) {
  return await convexRun<StartDropStageResult>("dropActions:startNextStage", {
    dropId,
  });
}

async function startSandboxRun(sandboxRunId: string) {
  return await convexRun<StartSandboxRunResult>(
    "sandboxRunActions:startSandboxRun",
    { sandboxRunId },
  );
}

async function getSandboxRun(sandboxRunId: string) {
  return await convexRun<SandboxRun | null>("sandboxRuns:getSandboxRun", {
    sandboxRunId,
  });
}

async function listSandboxRunEvents(sandboxRunId: string, afterSeq?: number) {
  return await convexRun<SandboxEvent[]>("sandboxRuns:listSandboxRunEvents", {
    sandboxRunId,
    ...(afterSeq === undefined ? {} : { afterSeq }),
  });
}

async function cancelSandboxRun(sandboxRunId: string) {
  await convexRun("sandboxRuns:cancelSandboxRun", { sandboxRunId });
}

async function getDrop(dropId: string) {
  return await convexRun<DropView | null>("drops:getDrop", { dropId });
}

async function listDropEvents(dropId: string) {
  return await convexRun<DropEvent[]>("drops:listDropEvents", { dropId });
}

async function waitForDropCompletion(dropId: string, options: CliOptions) {
  const started = Date.now();

  while (Date.now() - started < options.timeoutMs) {
    const dropView = await getDrop(dropId);
    assert(dropView, `Drop disappeared: ${dropId}`);
    const builderArtifact = dropView.artifacts.find(
      (artifact) => artifact.stage === "builder",
    );
    const builderRun = dropView.stageRuns.find(
      (stageRun) => stageRun.stage === "builder",
    );
    if (
      dropView.drop.status === "completed" &&
      builderRun?.status === "succeeded" &&
      builderArtifact
    ) {
      return dropView;
    }
    if (dropView.drop.status === "failed" || dropView.drop.status === "cancelled") {
      throw new Error(
        `Drop ended as ${dropView.drop.status}: ${dropView.drop.error?.message ?? "no error"}`,
      );
    }
    await sleep(options.pollMs);
  }

  throw new Error(`Timed out waiting for Drop completion: ${dropId}.`);
}

async function waitForRun(sandboxRunId: string, options: CliOptions) {
  const started = Date.now();
  const events: SandboxEvent[] = [];
  let afterSeq: number | undefined;

  while (Date.now() - started < options.timeoutMs) {
    const nextEvents = await listSandboxRunEvents(sandboxRunId, afterSeq);
    if (nextEvents.length > 0) {
      events.push(...nextEvents);
      afterSeq = Math.max(...nextEvents.map((event) => event.seq));
    }

    const run = await getSandboxRun(sandboxRunId);
    assert(run, `Sandbox run disappeared: ${sandboxRunId}`);
    if (terminalStatuses.has(run.status)) {
      return { run, events };
    }

    await sleep(options.pollMs);
  }

  throw new Error(`Timed out waiting for sandbox run ${sandboxRunId}.`);
}

async function readSandboxOutput(
  run: SandboxRun,
  scenario: Scenario,
  artifactDir: string,
) {
  assert(run.sandboxId, `${scenario.name}: missing sandboxId`);
  const sandbox = await getSandbox(run.sandboxId);
  const buffer = await sandbox.readFileToBuffer({ path: scenario.outputPath });
  assert(buffer, `${scenario.name}: missing ${scenario.outputPath}`);
  const text = buffer.toString("utf8");
  const output = JSON.parse(text) as unknown;
  await writeFile(path.join(artifactDir, "output.json"), text);
  return output;
}

async function collectAssetEvidence(
  run: SandboxRun,
  output: unknown,
  artifactDir: string,
) {
  assert(run.sandboxId, "missing sandboxId for asset collection");
  const sandbox = await getSandbox(run.sandboxId);
  const assetDir = path.join(artifactDir, "assets");
  await mkdir(assetDir, { recursive: true });

  const paths = [...new Set(collectWorkspaceImagePaths(output))];
  assert(paths.length > 0, "No image asset paths found in output JSON.");

  const evidence: AssetEvidence[] = [];
  for (const sandboxPath of paths) {
    const buffer = await sandbox.readFileToBuffer({ path: sandboxPath });
    assert(buffer, `Missing image asset: ${sandboxPath}`);

    const fileName = path.basename(sandboxPath);
    const localPath = path.join(assetDir, fileName);
    await writeFile(localPath, buffer);

    const image = parseImageHeader(buffer);
    assert(image.validSignature, `Invalid image signature: ${sandboxPath}`);
    assert(
      image.width >= 768 && image.height >= 768,
      `Image too small: ${sandboxPath}`,
    );
    assert(buffer.byteLength >= 20_000, `Image byte size too small: ${sandboxPath}`);

    evidence.push({
      sandboxPath,
      localPath,
      fileName,
      bytes: buffer.byteLength,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      image,
    });
  }

  await writeContactSheet(artifactDir, evidence);
  return evidence;
}

async function writeEvidenceFiles({
  artifactDir,
  dbState,
  run,
  events,
  output,
  assets,
  samples,
  startedAt,
}: {
  artifactDir: string;
  dbState: DbStateEvidence;
  run: SandboxRun;
  events: SandboxEvent[];
  output: unknown;
  assets: AssetEvidence[];
  samples: SmokeSample[];
  startedAt: number;
}) {
  await writeFile(path.join(artifactDir, "run.json"), JSON.stringify(run, null, 2));
  await writeFile(
    path.join(artifactDir, "events.json"),
    JSON.stringify(events, null, 2),
  );
  await writeFile(
    path.join(artifactDir, "summary.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        status: run.status,
        sandboxRunId: run._id,
        sandboxId: run.sandboxId ?? null,
        commandId: run.commandId ?? null,
        codexThreadId: run.codexThreadId ?? null,
        dbState,
        finalResponse: run.result?.finalResponse ?? null,
        outputPresent: output !== undefined,
        assets,
        samples,
        eventCounts: countBy(events.map((event) => event.type)),
      },
      null,
      2,
    ),
  );
  if (samples.length > 0) {
    await writeFile(
      path.join(artifactDir, "samples.json"),
      JSON.stringify(samples, null, 2),
    );
  }
}

function assertQueuedRun(
  scenario: Scenario,
  created: CreatedRun,
  queuedRun: SandboxRun | null,
) {
  assert(queuedRun, `${scenario.name}: missing queued Convex row.`);
  assert(queuedRun._id === created.sandboxRunId, `${scenario.name}: queued row id mismatch.`);
  assert(queuedRun.workspaceId === created.workspaceId, `${scenario.name}: workspaceId mismatch.`);
  assert(queuedRun.task === created.task, `${scenario.name}: task prompt was not stored.`);
  assert(queuedRun.status === "queued", `${scenario.name}: expected queued status.`);
  assert(!queuedRun.sandboxId, `${scenario.name}: queued row should not have sandboxId yet.`);
  assert(!queuedRun.commandId, `${scenario.name}: queued row should not have commandId yet.`);
}

function assertStartedRun(
  scenario: Scenario,
  startResult: StartSandboxRunResult,
  startedRun: SandboxRun | null,
) {
  assert(startedRun, `${scenario.name}: missing started Convex row.`);
  assert(startResult.sandboxId, `${scenario.name}: start action returned no sandboxId.`);
  assert(startResult.commandId, `${scenario.name}: start action returned no commandId.`);
  assert(startedRun.sandboxId === startResult.sandboxId, `${scenario.name}: sandboxId not stored.`);
  assert(startedRun.commandId === startResult.commandId, `${scenario.name}: commandId not stored.`);
  assert(
    startedRun.status === "running" || terminalStatuses.has(startedRun.status),
    `${scenario.name}: expected running/terminal status after start, got ${startedRun.status}.`,
  );
}

function assertDropReadyForBuilder(created: CreatedDrop, dropView: DropView | null) {
  assert(dropView, "Drop was not readable after creation.");
  assert(dropView.drop._id === created.dropId, "Created Drop id mismatch.");
  assert(
    dropView.drop.workspaceId === created.workspaceId,
    "Created Drop workspaceId mismatch.",
  );
  assert(
    dropView.drop.sandboxName === created.sandboxName,
    "Created Drop sandboxName mismatch.",
  );
  assert(
    dropView.drop.status === "ready_to_build",
    `Created Drop should be ready_to_build, got ${dropView.drop.status}.`,
  );
  assert(
    dropView.drop.currentStage === "builder",
    "Created Drop should point at Builder for builder-ready smoke.",
  );
}

function assertDropStartedRun(
  scenario: Scenario,
  created: CreatedDrop,
  stageStart: StartDropStageResult,
  startedRun: SandboxRun | null,
) {
  assert(startedRun, `${scenario.name}: missing Drop sandbox run.`);
  assert(stageStart.sandboxRunId === startedRun._id, `${scenario.name}: run id mismatch.`);
  assert(stageStart.sandboxId, `${scenario.name}: start action returned no sandboxId.`);
  assert(stageStart.commandId, `${scenario.name}: start action returned no commandId.`);
  assert(
    startedRun.sandboxId === stageStart.sandboxId,
    `${scenario.name}: sandboxId not stored.`,
  );
  assert(
    startedRun.commandId === stageStart.commandId,
    `${scenario.name}: commandId not stored.`,
  );
  assert(startedRun.dropId === created.dropId, `${scenario.name}: dropId not linked.`);
  assert(
    startedRun.dropStageRunId === stageStart.stageRunId,
    `${scenario.name}: stageRunId not linked.`,
  );
  assert(startedRun.stage === "builder", `${scenario.name}: run stage is not Builder.`);
  assert(
    startedRun.sandboxName === created.sandboxName,
    `${scenario.name}: run sandboxName mismatch.`,
  );
  assert(
    startedRun.expectedOutputPath === stageStart.expectedOutputPath,
    `${scenario.name}: expectedOutputPath mismatch.`,
  );
  assert(
    startedRun.status === "running" || terminalStatuses.has(startedRun.status),
    `${scenario.name}: expected running/terminal status after Drop start, got ${startedRun.status}.`,
  );
}

function assertDropBuilderState({
  created,
  stageStart,
  terminalRun,
  dropView,
  output,
}: {
  created: CreatedDrop;
  stageStart: StartDropStageResult;
  terminalRun: SandboxRun;
  dropView: DropView;
  output: unknown;
}) {
  assert(dropView.drop._id === created.dropId, "Completed Drop id mismatch.");
  assert(
    dropView.drop.status === "completed",
    `Drop should be completed, got ${dropView.drop.status}.`,
  );
  assert(dropView.drop.currentStage === "builder", "Completed Drop should end at Builder.");
  assert(
    dropView.drop.currentSandboxId === terminalRun.sandboxId,
    "Drop currentSandboxId should match terminal sandbox run.",
  );

  const stageRun = dropView.stageRuns.find(
    (value) => value._id === stageStart.stageRunId,
  );
  assert(stageRun, "Drop Builder stage run was not persisted.");
  assert(stageRun.status === "succeeded", `Builder stage status ${stageRun.status}.`);
  assert(
    stageRun.sandboxRunId === stageStart.sandboxRunId,
    "Builder stage sandboxRunId mismatch.",
  );
  assert(
    stageRun.expectedOutputPath === stageStart.expectedOutputPath,
    "Builder stage expectedOutputPath mismatch.",
  );
  assert(stageRun.outputArtifactId, "Builder stage missing outputArtifactId.");

  const artifact = dropView.artifacts.find(
    (value) => value._id === stageRun.outputArtifactId,
  );
  assert(artifact, "Builder output artifact was not persisted.");
  assert(artifact.stage === "builder", "Persisted artifact stage is not Builder.");
  assert(
    artifact.sandboxPath === stageStart.expectedOutputPath,
    "Persisted artifact path mismatch.",
  );
  assert(
    artifact.schemaVersion === "builder.drop-site.v1",
    "Persisted Builder artifact schemaVersion mismatch.",
  );
  assert(
    artifact.sandboxRunId === stageStart.sandboxRunId,
    "Persisted Builder artifact sandboxRunId mismatch.",
  );

  const artifactUrl = readBuilderDeploymentUrl(artifact.data);
  if (artifactUrl) {
    assert(
      dropView.drop.websiteUrl === artifactUrl,
      "Drop websiteUrl should match Builder artifact URL.",
    );
  }
  if (output !== undefined) {
    const outputUrl = readBuilderDeploymentUrl(output);
    if (outputUrl) {
      assert(outputUrl === artifactUrl, "Sandbox output and persisted artifact URL mismatch.");
    }
  }
  return artifact;
}

function buildDropSamples(dropView: DropView, artifact: DropArtifact): SmokeSample[] {
  const stageCounts = countBy(dropView.stageRuns.map((stageRun) => stageRun.stage));
  return [
    {
      label: "drop.status",
      value: dropView.drop.status,
    },
    {
      label: "drop.stageRuns",
      value: JSON.stringify(stageCounts),
    },
    {
      label: "drop.builderArtifact",
      value: artifact.schemaVersion,
      path: artifact.sandboxPath,
    },
    ...(dropView.drop.websiteUrl
      ? [
          {
            label: "drop.websiteUrl",
            value: "persisted",
            url: dropView.drop.websiteUrl,
          },
        ]
      : []),
  ];
}

function assertTerminalRun(
  scenario: Scenario,
  startResult: StartSandboxRunResult,
  terminalRun: SandboxRun,
  events: SandboxEvent[],
) {
  assert(
    terminalRun.sandboxId === startResult.sandboxId,
    `${scenario.name}: terminal sandboxId changed.`,
  );
  assert(
    terminalRun.commandId === startResult.commandId,
    `${scenario.name}: terminal commandId changed.`,
  );
  assert(terminalRun.codexThreadId, `${scenario.name}: terminal row missing codexThreadId.`);
  assert(terminalRun.result?.finalResponse, `${scenario.name}: terminal row missing finalResponse.`);
  assert(events.length > 0, `${scenario.name}: no Convex events were recorded.`);
}

function buildDbStateEvidence({
  events,
  queuedRun,
  startResult,
  startedRun,
  terminalRun,
}: {
  events: SandboxEvent[];
  queuedRun: SandboxRun;
  startResult: StartSandboxRunResult;
  startedRun: SandboxRun;
  terminalRun: SandboxRun;
}): DbStateEvidence {
  return {
    queued: runStateEvidence(queuedRun),
    started: {
      ...runStateEvidence(startedRun),
      actionCommandId: startResult.commandId,
      actionSandboxId: startResult.sandboxId,
    },
    terminal: runStateEvidence(terminalRun, events.length),
  };
}

function runStateEvidence(run: SandboxRun, eventCount?: number): RunStateEvidence {
  return {
    status: run.status,
    sandboxRunId: run._id,
    sandboxId: run.sandboxId ?? null,
    commandId: run.commandId ?? null,
    codexThreadId: run.codexThreadId ?? null,
    hasFinalResponse: Boolean(run.result?.finalResponse),
    ...(eventCount === undefined ? {} : { eventCount }),
  };
}

async function writeContactSheet(artifactDir: string, assets: AssetEvidence[]) {
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Sandbox E2E Contact Sheet</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 32px; color: #171717; background: #fafafa; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
    figure { margin: 0; padding: 12px; background: white; border: 1px solid #ddd; border-radius: 8px; }
    img { display: block; width: 100%; height: auto; border-radius: 4px; background: #eee; }
    figcaption { font-size: 12px; line-height: 1.45; margin-top: 10px; word-break: break-word; }
  </style>
</head>
<body>
  <h1>Sandbox E2E Contact Sheet</h1>
  <div class="grid">
    ${assets
      .map(
        (asset) => `<figure>
      <img src="assets/${escapeHtml(asset.fileName)}" alt="${escapeHtml(asset.fileName)}">
      <figcaption>
        <strong>${escapeHtml(asset.fileName)}</strong><br>
        ${asset.image.format.toUpperCase()}, ${asset.image.width}x${asset.image.height}, ${asset.bytes} bytes<br>
        ${escapeHtml(asset.sha256)}
      </figcaption>
    </figure>`,
      )
      .join("\n")}
  </div>
</body>
</html>`;
  await writeFile(path.join(artifactDir, "contact-sheet.html"), html);
}

function validateCommonEvents(name: string, events: SandboxEvent[]) {
  const types = new Set(events.map((event) => event.type));
  for (const type of [
    "runner.started",
    "thread.started",
    "turn.completed",
    "runner.finished",
  ]) {
    assert(types.has(type), `${name}: missing event type ${type}`);
  }

  const seqs = events.map((event) => event.seq);
  for (let index = 1; index < seqs.length; index += 1) {
    assert(
      seqs[index] === seqs[index - 1] + 1,
      `${name}: event seq gap between ${seqs[index - 1]} and ${seqs[index]}`,
    );
  }
}

function validateFashionDesignerEvents(run: SandboxRun, events: SandboxEvent[]) {
  const text = eventText(events);
  assert(
    run.result?.finalResponse?.includes("fashion-designer-output.json"),
    "Fashion Designer final response did not mention output JSON.",
  );
  assert(!/\$fashion-designer unavailable/i.test(text), "Fashion Designer skill was unavailable.");
}

function validateScoutEvents(run: SandboxRun, events: SandboxEvent[]) {
  const text = eventText(events);
  const runnerStarted = findEventPayload(events, "runner.started");
  const codexEnvPresence = isRecord(runnerStarted)
    ? runnerStarted.codexEnvPresence
    : undefined;
  if (isRecord(codexEnvPresence)) {
    assert(
      codexEnvPresence.EXA_API_KEY === true,
      "Scout run did not receive EXA_API_KEY in Codex env.",
    );
    assert(
      codexEnvPresence.X_BEARER_TOKEN === true ||
        codexEnvPresence.TWITTER_BEARER_TOKEN === true,
      "Scout run did not receive X/Twitter bearer token in Codex env.",
    );
  }
  assert(
    run.result?.finalResponse?.includes("scout-output.json"),
    "Scout final response did not mention scout-output.json.",
  );
  assert(!/\$scout unavailable/i.test(text), "Scout skill was unavailable.");
}

function validateBuilderEvents(run: SandboxRun, events: SandboxEvent[]) {
  const text = eventText(events);
  assert(
    run.result?.finalResponse?.includes("builder-output.json"),
    "Builder final response did not mention builder-output.json.",
  );
  assert(!/\$builder unavailable/i.test(text), "Builder skill was unavailable.");
}

function validatePerformanceMarketerEvents(run: SandboxRun, events: SandboxEvent[]) {
  const text = eventText(events);
  const runnerStarted = findEventPayload(events, "runner.started");
  const codexEnvPresence = isRecord(runnerStarted)
    ? runnerStarted.codexEnvPresence
    : undefined;
  if (isRecord(codexEnvPresence)) {
    assert(
      codexEnvPresence.META_ADS_ACCESS_TOKEN === true,
      "Performance Marketer run did not receive Meta access token in Codex env.",
    );
    assert(
      codexEnvPresence.META_ADS_AD_ACCOUNT_ID === true,
      "Performance Marketer run did not receive Meta ad account ID in Codex env.",
    );
  }
  assert(
    run.result?.finalResponse?.includes("performance-marketer-output.json"),
    "Performance Marketer final response did not mention performance-marketer-output.json.",
  );
  assert(
    !/\$performance-marketer unavailable/i.test(text),
    "Performance Marketer skill was unavailable.",
  );
}

function validateFashionDesignerOutput(output: unknown) {
  const root = asRecord(output, "Fashion Designer output");
  assert(
    root.schemaVersion === "fashion-designer.concepts.v1",
    "Fashion Designer schemaVersion mismatch.",
  );
  const expectedIdeaRefs = ["idea_01", "idea_02"];
  const expectedFinalMocksPerIdea = 2;
  const expectedFinalMocks = expectedIdeaRefs.length * expectedFinalMocksPerIdea;

  const ideas = asArray(root.ideas, "Fashion Designer ideas");
  assert(
    ideas.length >= expectedIdeaRefs.length,
    "Fashion Designer did not group output by idea.",
  );

  const ideasByRef = new Map<string, Record<string, unknown>>();
  for (const [ideaIndex, ideaValue] of ideas.entries()) {
    const idea = asRecord(ideaValue, `Fashion Designer idea ${ideaIndex}`);
    assert(typeof idea.ideaRef === "string", "Fashion Designer idea missing ideaRef.");
    ideasByRef.set(idea.ideaRef, idea);
    assert(isRecord(idea.brief), `Fashion Designer idea ${idea.ideaRef} missing brief.`);
    assertNumberAtLeast(idea.candidateCount, 2, `ideas[${idea.ideaRef}].candidateCount`);
    assertNumberAtLeast(idea.keptCount, 1, `ideas[${idea.ideaRef}].keptCount`);
    assert(
      Number(idea.candidateCount) > Number(idea.keptCount),
      `Fashion Designer did not overgenerate for idea ${idea.ideaRef}.`,
    );
    assert(isRecord(idea.review), `Fashion Designer idea ${idea.ideaRef} missing review.`);
    assert(Array.isArray(idea.concepts), `Fashion Designer idea ${idea.ideaRef} concepts missing.`);
  }

  for (const ideaRef of expectedIdeaRefs) {
    const idea = ideasByRef.get(ideaRef);
    assert(idea, `Fashion Designer missing grouped idea ${ideaRef}.`);
    assertNumberAtLeast(
      idea.keptCount,
      expectedFinalMocksPerIdea,
      `ideas[${ideaRef}].keptCount`,
    );
    assertNumberAtLeast(
      idea.candidateCount,
      expectedFinalMocksPerIdea * 2,
      `ideas[${ideaRef}].candidateCount`,
    );
  }

  const concepts = asArray(root.concepts, "Fashion Designer concepts");
  assert(
    concepts.length === expectedFinalMocks,
    `Fashion Designer expected ${expectedFinalMocks} final concepts, got ${concepts.length}.`,
  );

  const review = asRecord(root.review, "Fashion Designer review");
  assertNumberAtLeast(review.candidateCount, expectedFinalMocks * 2, "review.candidateCount");
  assertNumberAtLeast(review.keptCount, expectedFinalMocks, "review.keptCount");
  assertNumberAtLeast(review.rejectedCount, 1, "review.rejectedCount");
  assert(
    Number(review.candidateCount) > Number(review.keptCount),
    "Fashion Designer did not overgenerate beyond kept concepts.",
  );
  const reviewByIdea = asArray(review.byIdea, "Fashion Designer review.byIdea");
  for (const ideaRef of expectedIdeaRefs) {
    const entry = reviewByIdea.find(
      (value) => isRecord(value) && value.ideaRef === ideaRef,
    );
    assert(entry, `Fashion Designer review missing byIdea entry for ${ideaRef}.`);
    const byIdea = asRecord(entry, `review.byIdea ${ideaRef}`);
    const kept = asArray(byIdea.kept, `review.byIdea ${ideaRef} kept`);
    const rejected = asArray(byIdea.rejected, `review.byIdea ${ideaRef} rejected`);
    asArray(
      byIdea.regenerationRequests,
      `review.byIdea ${ideaRef} regenerationRequests`,
    );
    assert(
      kept.length >= expectedFinalMocksPerIdea,
      `Fashion Designer kept too few mocks for ${ideaRef}.`,
    );
    assert(rejected.length >= 1, `Fashion Designer did not reject any surplus for ${ideaRef}.`);
  }

  const strategy = asRecord(root.strategy, "Fashion Designer strategy");
  const candidatePlan = asRecord(strategy.candidatePlan, "strategy.candidatePlan");
  assertNumberAtLeast(
    candidatePlan.requestedFinalMocksPerIdea,
    expectedFinalMocksPerIdea,
    "candidatePlan.requestedFinalMocksPerIdea",
  );
  assertNumberAtLeast(
    candidatePlan.totalRequestedFinalMocks,
    expectedFinalMocks,
    "candidatePlan.totalRequestedFinalMocks",
  );
  assertNumberAtLeast(
    candidatePlan.totalCandidateTarget,
    expectedFinalMocks * 2,
    "candidatePlan.totalCandidateTarget",
  );
  assert(
    Number(candidatePlan.totalCandidateTarget) >
      Number(candidatePlan.totalRequestedFinalMocks),
    "Fashion Designer did not record surplus candidate planning.",
  );
  const workOrders = asArray(candidatePlan.workOrders, "strategy.candidatePlan.workOrders");
  assertNumberAtLeast(workOrders.length, 4, "workOrders.length");
  for (const [workOrderIndex, workOrderValue] of workOrders.entries()) {
    const workOrder = asRecord(
      workOrderValue,
      `Fashion Designer workOrder ${workOrderIndex}`,
    );
    assert(typeof workOrder.ideaRef === "string", "workOrder missing ideaRef.");
    assert(
      typeof workOrder.productCategory === "string",
      "workOrder missing productCategory.",
    );
    assertNumberAtLeast(workOrder.targetFinalMocks, 1, "workOrder.targetFinalMocks");
    assertNumberAtLeast(workOrder.candidateTarget, 2, "workOrder.candidateTarget");
  }

  const assetDir =
    typeof strategy.assetDir === "string"
      ? strategy.assetDir
      : "/vercel/sandbox/agent-workspace/fashion-designer-assets";
  const conceptCountsByIdea = new Map<string, number>();
  for (const [conceptIndex, conceptValue] of concepts.entries()) {
    const concept = asRecord(conceptValue, `Fashion Designer concept ${conceptIndex}`);
    assert(typeof concept.ideaRef === "string", "concept ideaRef must be a string.");
    conceptCountsByIdea.set(
      concept.ideaRef,
      (conceptCountsByIdea.get(concept.ideaRef) ?? 0) + 1,
    );
    assert(typeof concept.conceptName === "string", "conceptName must be a string.");
    assert(typeof concept.productType === "string", "productType must be a string.");
    const imageAssets = asArray(
      concept.imageAssets,
      `Fashion Designer concept ${conceptIndex} imageAssets`,
    );
    assert(imageAssets.length >= 1, "Each Fashion Designer concept needs an image asset.");

    for (const [assetIndex, assetValue] of imageAssets.entries()) {
      const asset = asRecord(
        assetValue,
        `Fashion Designer concept ${conceptIndex} imageAsset ${assetIndex}`,
      );
      assert(
        typeof asset.path === "string" && asset.path.startsWith(assetDir),
        "Image asset path must live under the configured assetDir.",
      );
      assert(asset.ideaRef === concept.ideaRef, "Image asset ideaRef must match concept ideaRef.");
      assert(typeof asset.candidateId === "string", "Image asset missing candidateId.");
      assert(
        !/placeholder|substitute|svg|canvas/i.test(asset.path),
        "Image asset path looked like a placeholder or local substitute.",
      );
      assert(
        /\.(png|jpe?g|webp)$/i.test(asset.path),
        "Image asset path must point to a raster image.",
      );
      assert(typeof asset.prompt === "string" && asset.prompt.length > 20, "Image prompt missing.");
      assert(
        typeof asset.reviewDecision === "string" &&
          /kept|rejected|regenerated/i.test(asset.reviewDecision),
        "Image asset missing reviewDecision.",
      );
    }
  }

  for (const ideaRef of expectedIdeaRefs) {
    assert(
      conceptCountsByIdea.get(ideaRef) === expectedFinalMocksPerIdea,
      `Fashion Designer expected ${expectedFinalMocksPerIdea} final mocks for ${ideaRef}.`,
    );
  }
}

function validateScoutOutput(output: unknown) {
  const root = asRecord(output, "Scout output");
  assert(
    root.schemaVersion === "scout.cultural-moments.v1",
    "Scout schemaVersion mismatch.",
  );
  const candidates = asArray(root.candidates, "Scout candidates");
  if (candidates.length < 1) {
    const strategy = isRecord(root.strategy) ? root.strategy : {};
    const notes = Array.isArray(strategy.notes)
      ? strategy.notes.filter((note) => typeof note === "string").join(" ")
      : "";
    throw new Error(
      `Scout returned zero candidates. Check sandbox runtime X/Exa credentials and provider balance. ${notes}`.trim(),
    );
  }
  assert(candidates.length <= 5, "Scout candidate count out of range.");
  assert(/https?:\/\//i.test(JSON.stringify(candidates)), "Scout candidates lacked source URLs.");
}

function validateBuilderOutput(output: unknown) {
  const root = asRecord(output, "Builder output");
  assert(
    root.schemaVersion === "builder.drop-site.v1",
    "Builder schemaVersion mismatch.",
  );

  const site = asRecord(root.site, "Builder site");
  const siteDir = trimTrailingSlash(
    requireOptionalString(site.siteDir, builderDefaultSiteDir, "site.siteDir"),
  );
  assertBuilderWorkspacePath(siteDir, "site.siteDir");
  assert(
    siteDir.endsWith("/builder-site"),
    "Builder site.siteDir should point at the builder-site workspace.",
  );
  if (site.assetDir !== undefined) {
    const assetDir = trimTrailingSlash(requireString(site.assetDir, "site.assetDir"));
    assertBuilderWorkspacePath(assetDir, "site.assetDir");
    assert(
      assetDir.startsWith(siteDir),
      "Builder site.assetDir should live under site.siteDir.",
    );
  }

  const page = asRecord(root.page, "Builder page");
  assert(
    page.countdownHours === 24,
    "Builder page.countdownHours should be 24.",
  );
  assert(
    typeof page.ctaLabel === "string" && /buy\s*now/i.test(page.ctaLabel),
    "Builder page.ctaLabel should be Buy now.",
  );
  assert(
    page.ctaBehavior === "dummy",
    "Builder page.ctaBehavior should be dummy.",
  );
  validateBuilderReviewEvidence(root);

  const urlEntries = collectBuilderDeploymentUrlEntries(root);
  assert(
    urlEntries.some(
      (entry) =>
        entry.label === "site.deploymentUrl" ||
        entry.label === "site.canonicalHistoricalUrl",
    ),
    "Builder output missing site.deploymentUrl or site.canonicalHistoricalUrl.",
  );

  const deployment = isRecord(root.deployment) ? root.deployment : null;
  if (deployment) {
    if (deployment.provider !== undefined) {
      assert(deployment.provider === "vercel", "Builder deployment.provider should be vercel.");
    }
    if (deployment.target !== undefined) {
      assert(deployment.target === "preview", "Builder deployment.target should be preview.");
    }
  }
}

function validatePerformanceMarketerOutput(output: unknown) {
  const root = asRecord(output, "Performance Marketer output");
  assert(
    root.schemaVersion === "performance-marketer.facebook-campaign.v1",
    "Performance Marketer schemaVersion mismatch.",
  );

  const safety = asRecord(root.safety, "Performance Marketer safety");
  assert(safety.facebookOnly === true, "Performance Marketer must be Facebook-only.");
  assert(safety.allCreatedPaused === true, "Performance Marketer did not verify all objects paused.");
  assert(
    safety.activationPerformed === false,
    "Performance Marketer must not activate ads.",
  );
  assert(
    safety.insightsReadbackPerformed === false,
    "Performance Marketer must not read insights in v1.",
  );
  assert(
    safety.rawMetaIdsPersisted === false,
    "Performance Marketer output must not persist raw Meta IDs.",
  );

  const campaign = asRecord(root.campaign, "Performance Marketer campaign");
  assert(
    campaign.objective === "outcome_traffic",
    "Performance Marketer campaign objective should be outcome_traffic.",
  );
  assertPausedStatus(
    campaign.configuredStatus,
    "Performance Marketer campaign configuredStatus",
  );
  assertNumberAtLeast(
    campaign.budgetMinorUnits,
    1,
    "Performance Marketer campaign budgetMinorUnits",
  );

  const adSets = asArray(root.adSets, "Performance Marketer adSets");
  assert(adSets.length === 3, `Performance Marketer expected 3 ad sets, got ${adSets.length}.`);
  for (const [index, value] of adSets.entries()) {
    const adSet = asRecord(value, `Performance Marketer adSet ${index}`);
    assert(typeof adSet.ideaRef === "string", "Performance Marketer ad set missing ideaRef.");
    assert(typeof adSet.name === "string", "Performance Marketer ad set missing name.");
    assert(typeof adSet.safeRef === "string", "Performance Marketer ad set missing safeRef.");
    assertPausedStatus(
      adSet.configuredStatus,
      `Performance Marketer adSet ${index} configuredStatus`,
    );
  }

  const ads = asArray(root.ads, "Performance Marketer ads");
  assert(ads.length === 6, `Performance Marketer expected 6 ads, got ${ads.length}.`);
  const seenIdeaImagePairs = new Set<string>();
  for (const [index, value] of ads.entries()) {
    const ad = asRecord(value, `Performance Marketer ad ${index}`);
    const ideaRef = requireString(ad.ideaRef, `ads[${index}].ideaRef`);
    const imageRef = requireString(ad.imageRef, `ads[${index}].imageRef`);
    seenIdeaImagePairs.add(`${ideaRef}:${imageRef}`);
    assert(typeof ad.imagePath === "string", "Performance Marketer ad missing imagePath.");
    assert(
      typeof ad.creativeSafeRef === "string" && typeof ad.adSafeRef === "string",
      "Performance Marketer ad missing safe refs.",
    );
    assert(typeof ad.headline === "string", "Performance Marketer ad missing headline.");
    assert(typeof ad.body === "string", "Performance Marketer ad missing body.");
    assertPausedStatus(
      ad.configuredStatus,
      `Performance Marketer ad ${index} configuredStatus`,
    );
  }
  assert(
    seenIdeaImagePairs.size === 6,
    "Performance Marketer ads should map to six distinct idea/image pairs.",
  );

  const verification = asRecord(
    root.verification,
    "Performance Marketer verification",
  );
  assert(verification.campaignCount === 1, "Performance Marketer expected one campaign.");
  assert(verification.adSetCount === 3, "Performance Marketer expected three ad sets.");
  assert(verification.creativeCount === 6, "Performance Marketer expected six creatives.");
  assert(verification.adCount === 6, "Performance Marketer expected six ads.");
  assertNumberAtLeast(
    verification.pausedObjectCount,
    10,
    "Performance Marketer pausedObjectCount",
  );
  const issues = asArray(verification.issues, "Performance Marketer verification.issues");
  assert(issues.length === 0, "Performance Marketer verification should have no issues.");
}

async function validateBuilderSandboxFiles({
  run,
  output,
  artifactDir,
}: {
  run: SandboxRun;
  output: unknown;
  artifactDir: string;
}): Promise<SmokeSample[]> {
  assert(run.sandboxId, "Builder: missing sandboxId for static-site inspection.");
  const sandbox = await getSandbox(run.sandboxId);
  const root = asRecord(output, "Builder output");
  const siteDir = getBuilderSiteDir(root);
  const outputDir = path.posix.join(siteDir, ".vercel/output");
  const staticDir = path.posix.join(siteDir, builderStaticDirRelative);
  const configPath = path.posix.join(outputDir, "config.json");
  const samples: SmokeSample[] = [
    {
      label: "schemaVersion",
      value: "builder.drop-site.v1",
      path: "/vercel/sandbox/agent-workspace/builder-output.json",
    },
  ];

  const configText = await readSandboxUtf8(sandbox, configPath, "Builder Vercel output config");
  JSON.parse(configText);
  samples.push({
    label: "vercelOutput.config",
    value: "config.json parses",
    path: configPath,
    bytes: Buffer.byteLength(configText),
  });

  const staticFiles = await listSandboxFiles(sandbox, staticDir);
  assert(staticFiles.length > 0, "Builder static output directory was empty.");

  const htmlFiles = staticFiles.filter((file) => /\.html$/i.test(file.relativePath));
  assert(
    htmlFiles.length === 1,
    `Builder should emit one HTML document, found ${htmlFiles.length}.`,
  );
  const htmlFile = htmlFiles.find((file) => file.relativePath === "index.html") ?? htmlFiles[0];
  const htmlText = await readSandboxUtf8(sandbox, htmlFile.sandboxPath, "Builder index HTML");
  assert(/<html[\s>]/i.test(htmlText), "Builder HTML did not contain an <html> document.");
  await writeFile(path.join(artifactDir, "builder-index.html"), htmlText);

  const textFiles = staticFiles.filter(
    (file) =>
      /\.(css|js|json|txt)$/i.test(file.relativePath) &&
      file.sandboxPath !== configPath &&
      file.bytes <= 500_000,
  );
  const textContents = await Promise.all(
    textFiles.map((file) =>
      readSandboxUtf8(sandbox, file.sandboxPath, `Builder text asset ${file.relativePath}`),
    ),
  );
  const pageSignalText = [htmlText, ...textContents].join("\n");
  validateBuilderPageSignals(root, pageSignalText);

  const imageFiles = staticFiles.filter((file) =>
    /\.(png|jpe?g|webp)$/i.test(file.relativePath),
  );
  assert(imageFiles.length > 0, "Builder static output did not include product imagery.");
  assert(
    imageFiles.length >= 2,
    "Builder static output should include at least two product images for the carousel.",
  );
  validateBuilderLayoutSignals(htmlText, pageSignalText, imageFiles);
  assert(
    hasRasterImageReference(pageSignalText, imageFiles),
    "Builder page did not reference a raster image asset.",
  );
  for (const imageFile of imageFiles.slice(0, 3)) {
    const buffer = await readSandboxBuffer(
      sandbox,
      imageFile.sandboxPath,
      `Builder image asset ${imageFile.relativePath}`,
    );
    const image = parseImageHeader(buffer);
    assert(image.validSignature, `Builder image had an invalid signature: ${imageFile.sandboxPath}`);
    assert(
      image.width > 0 && image.height > 0,
      `Builder image dimensions were invalid: ${imageFile.sandboxPath}`,
    );
    assert(
      buffer.byteLength >= 1_024,
      `Builder image asset was unexpectedly small: ${imageFile.sandboxPath}`,
    );
  }

  samples.push({
    label: "static.index",
    value: htmlFile.relativePath,
    path: htmlFile.sandboxPath,
    bytes: Buffer.byteLength(htmlText),
  });
  samples.push({
    label: "static.sampleFiles",
    value: staticFiles
      .slice(0, 8)
      .map((file) => file.relativePath)
      .join(", "),
    path: staticDir,
  });
  samples.push({
    label: "page.signals",
    value: "one-html,top-countdown,buy-now,price,carousel,no-scroll,raster-image",
    path: htmlFile.sandboxPath,
  });
  samples.push({
    label: "review.browser",
    value: "agent-browser,desktop-16x10,desktop-16x9,no-overflow,no-right-clipping",
    path: "/vercel/sandbox/agent-workspace/builder-output.json",
  });

  const verifiedUrls = new Map<string, { status: number; bytes: number }>();
  for (const entry of collectBuilderDeploymentUrlEntries(root)) {
    const cached =
      verifiedUrls.get(entry.url) ??
      (await verifyHttp200(entry.url, `Builder ${entry.label}`));
    verifiedUrls.set(entry.url, cached);
    samples.push({
      label: `${entry.label}.http`,
      value: "HTTP 200",
      url: entry.url,
      status: cached.status,
      bytes: cached.bytes,
    });
  }

  return samples;
}

function getBuilderSiteDir(root: Record<string, unknown>) {
  const site = asRecord(root.site, "Builder site");
  const siteDir = trimTrailingSlash(
    requireOptionalString(site.siteDir, builderDefaultSiteDir, "site.siteDir"),
  );
  assertBuilderWorkspacePath(siteDir, "site.siteDir");
  return siteDir;
}

function validateBuilderPageSignals(root: Record<string, unknown>, text: string) {
  const page = asRecord(root.page, "Builder page");
  const normalized = text.replace(/\s+/g, " ");
  const hasCountdown =
    /countdown|time\s*left|ends\s*in|hours?.{0,24}minutes?|minutes?.{0,24}seconds?/i.test(
      normalized,
    );
  const has24HourSignal =
    page.countdownHours === 24 || /\b24\s*(?:hour|hr|h)\b/i.test(normalized);
  assert(hasCountdown, "Builder page missing countdown/timer signal.");
  assert(has24HourSignal, "Builder page missing 24-hour countdown signal.");
  assert(
    /buy\s*now/i.test(String(page.ctaLabel ?? "")) || /buy\s*now/i.test(normalized),
    "Builder page missing Buy Now signal.",
  );
  assert(
    /(?:\u20b9|\$|\u20ac|\u00a3)\s*\d|(?:inr|usd|eur|gbp|rs\.?)\s*\d|\bprice\b.{0,40}\d/i.test(
      normalized,
    ),
    "Builder page missing price signal.",
  );
}

function validateBuilderReviewEvidence(root: Record<string, unknown>) {
  const review = asRecord(root.review, "Builder review");
  assert(review.passed === true, "Builder review.passed should be true.");
  assert(
    review.agentBrowserUsed === true,
    "Builder review must record agentBrowserUsed: true.",
  );
  const browserChecks = asRecord(review.browserChecks, "Builder review.browserChecks");
  for (const [name, expectedViewport] of [
    ["desktop16x10", "1440x900"],
    ["desktop16x9", "1920x1080"],
  ] as const) {
    const check = asRecord(browserChecks[name], `Builder review.browserChecks.${name}`);
    assert(
      typeof check.viewport === "string" && check.viewport.includes(expectedViewport),
      `Builder ${name} browser check missing viewport ${expectedViewport}.`,
    );
    assert(
      check.horizontalOverflow === false,
      `Builder ${name} browser check should report no horizontal overflow.`,
    );
    assert(
      check.rightEdgeClipping === false,
      `Builder ${name} browser check should report no right-edge clipping.`,
    );
    assert(
      Array.isArray(check.clippedRightEdgeElements) &&
        check.clippedRightEdgeElements.length === 0,
      `Builder ${name} browser check should report zero clipped right-edge elements.`,
    );
  }
}

function validateBuilderLayoutSignals(
  htmlText: string,
  text: string,
  imageFiles: SandboxFileInfo[],
) {
  const body = extractHtmlBody(htmlText).toLowerCase();
  const normalized = text.replace(/\s+/g, " ");
  const normalizedLower = normalized.toLowerCase();
  const countdownIndex = firstMatchIndex(body, [
    "countdown",
    "time-left",
    "time left",
    "ends-in",
    "ends in",
    "timer",
  ]);
  assert(countdownIndex >= 0, "Builder page missing countdown markup.");

  const firstProductIndex = firstPresentIndex(
    body,
    ["<img", "buy now", "price", "₹", "inr", "$"],
  );
  assert(
    firstProductIndex === -1 || countdownIndex < firstProductIndex,
    "Builder countdown should appear before product, price, and CTA content.",
  );

  assert(
    /carousel|slider|slides?|data-carousel|aria-roledescription=["']carousel["']/i.test(
      normalized,
    ),
    "Builder page missing carousel/slide signal.",
  );
  assert(
    /setinterval|requestanimationframe|animation\s*:|@keyframes/i.test(normalized),
    "Builder page missing auto-advance carousel or animation signal.",
  );

  const referencedImages = imageFiles.filter((file) =>
    normalizedLower.includes(file.relativePath.toLowerCase()) ||
    normalizedLower.includes(path.posix.basename(file.relativePath).toLowerCase()),
  );
  assert(
    referencedImages.length >= 2,
    "Builder page should reference at least two carousel product images.",
  );
  assert(
    /100(?:svh|dvh|vh)|min-height\s*:\s*100|height\s*:\s*100/i.test(normalized),
    "Builder page missing one-viewport sizing signal.",
  );
  assert(
    /overflow-y\s*:\s*hidden|overflow\s*:\s*hidden/i.test(normalized),
    "Builder page missing no-scroll overflow control signal.",
  );
}

function extractHtmlBody(htmlText: string) {
  const match = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(htmlText);
  return match?.[1] ?? htmlText;
}

function firstMatchIndex(text: string, patterns: string[]) {
  const indexes = patterns
    .map((pattern) => text.indexOf(pattern))
    .filter((index) => index >= 0);
  return indexes.length === 0 ? -1 : Math.min(...indexes);
}

function firstPresentIndex(text: string, patterns: string[]) {
  return firstMatchIndex(text, patterns);
}

function hasRasterImageReference(text: string, imageFiles: SandboxFileInfo[]) {
  const normalized = text.toLowerCase();
  if (/<img\b|background-image|url\([^)]*\.(?:png|jpe?g|webp)/i.test(text)) {
    return true;
  }
  return imageFiles.some((file) => normalized.includes(file.relativePath.toLowerCase()));
}

function collectBuilderDeploymentUrlEntries(root: Record<string, unknown>) {
  const entries: { label: string; url: string }[] = [];
  const site = isRecord(root.site) ? root.site : {};
  const deployment = isRecord(root.deployment) ? root.deployment : {};
  for (const [label, value] of [
    ["site.deploymentUrl", site.deploymentUrl],
    ["site.canonicalHistoricalUrl", site.canonicalHistoricalUrl],
    ["deployment.url", deployment.url],
  ] as const) {
    if (typeof value === "string" && value.trim().length > 0) {
      const url = value.trim();
      assertHttpUrl(url, label);
      entries.push({ label, url });
    }
  }
  return entries;
}

function readBuilderDeploymentUrl(output: unknown) {
  if (!isRecord(output)) {
    return undefined;
  }
  return collectBuilderDeploymentUrlEntries(output)[0]?.url;
}

async function listSandboxFiles(
  sandbox: Sandbox,
  root: string,
  maxDepth = 5,
): Promise<SandboxFileInfo[]> {
  const files: SandboxFileInfo[] = [];

  async function visit(directory: string, depth: number) {
    assert(depth <= maxDepth, `Builder static output exceeded ${maxDepth} directory levels.`);
    const entries = await sandbox.fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const sandboxPath = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(sandboxPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const stat = await sandbox.fs.stat(sandboxPath);
      files.push({
        sandboxPath,
        relativePath: path.posix.relative(root, sandboxPath),
        bytes: stat.size,
      });
    }
  }

  await visit(root, 0);
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function readSandboxUtf8(sandbox: Sandbox, sandboxPath: string, label: string) {
  const buffer = await readSandboxBuffer(sandbox, sandboxPath, label);
  return buffer.toString("utf8");
}

async function readSandboxBuffer(sandbox: Sandbox, sandboxPath: string, label: string) {
  const buffer = await sandbox.readFileToBuffer({ path: sandboxPath });
  assert(buffer, `${label} missing: ${sandboxPath}`);
  return buffer;
}

async function verifyHttp200(url: string, label: string) {
  const response = await fetchWithTimeout(url, 30_000);
  const text = await response.text();
  assert(response.status === 200, `${label} expected HTTP 200, got ${response.status}.`);
  return {
    status: response.status,
    bytes: Buffer.byteLength(text),
  };
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function requireOptionalString(value: unknown, fallback: string, label: string) {
  if (value === undefined || value === null) {
    return fallback;
  }
  return requireString(value, label);
}

function assertBuilderWorkspacePath(value: string, label: string) {
  assert(value.startsWith(`${builderWorkspaceRoot}/`), `${label} must live in ${builderWorkspaceRoot}.`);
  assert(!value.includes("/../"), `${label} must not contain parent-directory traversal.`);
}

function assertHttpUrl(value: string, label: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  assert(
    url.protocol === "https:" || url.protocol === "http:",
    `${label} must be an HTTP URL.`,
  );
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function selectScenarios(options: CliOptions) {
  if (
    options.scenario === "performance-marketer-facebook-paused" &&
    !options.allowMetaCreate
  ) {
    throw new Error(
      "performance-marketer-facebook-paused creates real paused Meta ad objects. Re-run with --allow-meta-create.",
    );
  }

  if (options.scenario === "all") {
    return options.allowMetaCreate
      ? scenarios
      : scenarios.filter(
          (scenario) => scenario.name !== "performance-marketer-facebook-paused",
        );
  }
  return scenarios.filter((scenario) => scenario.name === options.scenario);
}

const scenarios: Scenario[] = [
  {
    name: "fashion-designer-product",
    workspaceId: "e2e-fashion-designer-product",
    outputPath: "/vercel/sandbox/agent-workspace/fashion-designer-output.json",
    collectAssets: true,
    validateEvents: validateFashionDesignerEvents,
    validateOutput: validateFashionDesignerOutput,
    task:
      "Use $fashion-designer to create beautiful product mockups for these approved Scout ideas: idea_01 Mumbai monsoon street cricket comeback, a light local cultural moment around neighborhood cricket returning after rain breaks in Mumbai, India; idea_02 Mumbai late-night vada pav study break, a playful local student celebration around exam-season snack runs. Product categories: caps and socks. Keep exactly 2 final mockups per idea total. candidateMultiplier 2. Generate surplus candidates, review and cull per idea, and group the output by ideaRef. Make every image a premium fashion product mockup, not a website, ad, or storefront.",
  },
  {
    name: "scout-cultural",
    workspaceId: "e2e-scout-cultural",
    outputPath: "/vercel/sandbox/agent-workspace/scout-output.json",
    collectAssets: false,
    validateEvents: validateScoutEvents,
    validateOutput: validateScoutOutput,
    task:
      "Use $scout to get latest cultural trends for Mumbai, India in the last 24 hours.",
  },
  {
    name: "builder-drop-site",
    workspaceId: "e2e-builder-drop-site",
    outputPath: "/vercel/sandbox/agent-workspace/builder-output.json",
    collectAssets: false,
    validateEvents: validateBuilderEvents,
    validateOutput: validateBuilderOutput,
    validateSandboxFiles: validateBuilderSandboxFiles,
    task:
      "Use $builder to create a live drop page for this winning cap product: ideaRef idea_01; productRef winner_cap_01; product Monsoon Crease Cap, a washed black cotton cricket cap with electric-blue rain-stitch embroidery; winning copy Play starts when the rain stops; price INR 2499; ad result 2.7% CTR among Mumbai street-cricket fans. Make it one no-scroll page with the 24-hour countdown at the top, a large auto-advancing product image carousel, and a dummy Buy Now button.",
  },
  {
    name: "drop-workflow-builder",
    workspaceId: "e2e-drop-workflow-builder",
    outputPath: "/vercel/sandbox/agent-workspace/drop-builder-output-placeholder.json",
    collectAssets: false,
    validateEvents: validateBuilderEvents,
    validateOutput: validateBuilderOutput,
    validateSandboxFiles: validateBuilderSandboxFiles,
    task:
      "Create a Drop with a persistent sandbox, start the Builder stage through dropActions.startNextStage, persist the Builder artifact, and validate the historical Drop state.",
  },
  {
    name: "performance-marketer-facebook-paused",
    workspaceId: "e2e-performance-marketer-facebook-paused",
    outputPath: "/vercel/sandbox/agent-workspace/performance-marketer-output.json",
    collectAssets: false,
    validateEvents: validatePerformanceMarketerEvents,
    validateOutput: validatePerformanceMarketerOutput,
    task:
      "Use $performance-marketer to create a paused Facebook-only Meta ad campaign for three Drip ideas and two selected candidate images per idea. This is an explicit sandbox smoke: create smoke input images locally before calling Meta. Ideas: idea_01 Mumbai monsoon street cricket comeback; idea_02 Mumbai late-night vada pav study break; idea_03 Mumbai local train first-rain playlist. Use the hackathon recipe: one paused traffic campaign, three paused ad sets, six creatives, six paused ads, no activation, no insights readback. Budget minor units 10000, targeting country IN. Write performance-marketer-output.json with sanitized refs only.",
  },
];

function builderWinningDropInput() {
  return {
    ideaRef: "idea_01",
    productRef: "winner_cap_01",
    productName: "Monsoon Crease Cap",
    productType: "cap",
    description:
      "A washed black cotton cricket cap with electric-blue rain-stitch embroidery.",
    winningCopy: "Play starts when the rain stops.",
    price: {
      currency: "INR",
      amountMinor: 249900,
      display: "INR 2499",
    },
    performance: {
      result: "2.7% CTR among Mumbai street-cricket fans",
      audience: "Mumbai street-cricket fans",
      channel: "Facebook",
    },
    selectedCreative: {
      imageDirection:
        "Premium fashion product imagery on wet concrete, with blue stitch detail visible.",
      carouselFrames: [
        "front product detail",
        "side embroidery detail",
        "lifestyle rain-break cricket cue",
      ],
    },
    siteRequirements: {
      countdownHours: 24,
      countdownPlacement: "top",
      ctaLabel: "Buy Now",
      ctaBehavior: "dummy",
      layout: "one no-scroll page",
      carousel: "large auto-advancing product image carousel",
      deploymentTarget: "preview",
    },
  };
}

async function convexRun<T = unknown>(
  functionName: string,
  args: Record<string, unknown>,
): Promise<T> {
  const client = getConvexClient();

  if (functionName === "sandboxRuns:createSandboxRun") {
    return (await client.mutation(api.sandboxRuns.createSandboxRun, {
      workspaceId: requireString(args.workspaceId, "workspaceId"),
      task: requireString(args.task, "task"),
    })) as T;
  }
  if (functionName === "sandboxRunActions:startSandboxRun") {
    return (await client.action(api.sandboxRunActions.startSandboxRun, {
      sandboxRunId: requireSandboxRunId(args.sandboxRunId),
    })) as T;
  }
  if (functionName === "sandboxRuns:getSandboxRun") {
    return (await client.query(api.sandboxRuns.getSandboxRun, {
      sandboxRunId: requireSandboxRunId(args.sandboxRunId),
    })) as T;
  }
  if (functionName === "sandboxRuns:listSandboxRunEvents") {
    const afterSeq = args.afterSeq;
    return (await client.query(api.sandboxRuns.listSandboxRunEvents, {
      sandboxRunId: requireSandboxRunId(args.sandboxRunId),
      ...(typeof afterSeq === "number" ? { afterSeq } : {}),
    })) as T;
  }
  if (functionName === "sandboxRuns:cancelSandboxRun") {
    return (await client.mutation(api.sandboxRuns.cancelSandboxRun, {
      sandboxRunId: requireSandboxRunId(args.sandboxRunId),
    })) as T;
  }
  if (functionName === "dropActions:createDrop") {
    return (await client.action(api.dropActions.createDrop, {
      workspaceId: requireString(args.workspaceId, "workspaceId"),
      name: requireString(args.name, "name"),
      dropDate: requireString(args.dropDate, "dropDate"),
      startingMode: requireString(args.startingMode, "startingMode"),
      ...(args.topics === undefined
        ? {}
        : { topics: requireStringArray(args.topics, "topics") }),
      ...(args.productCategories === undefined
        ? {}
        : {
            productCategories: requireStringArray(
              args.productCategories,
              "productCategories",
            ),
          }),
      ...(args.tasteConstraints === undefined
        ? {}
        : {
            tasteConstraints: requireStringArray(
              args.tasteConstraints,
              "tasteConstraints",
            ),
          }),
      ...(args.winningDrop === undefined ? {} : { winningDrop: args.winningDrop }),
    })) as T;
  }
  if (functionName === "dropActions:startNextStage") {
    return (await client.action(api.dropActions.startNextStage, {
      dropId: requireDropId(args.dropId),
    })) as T;
  }
  if (functionName === "drops:getDrop") {
    return (await client.query(api.drops.getDrop, {
      dropId: requireDropId(args.dropId),
    })) as T;
  }
  if (functionName === "drops:listDropEvents") {
    return (await client.query(api.drops.listDropEvents, {
      dropId: requireDropId(args.dropId),
    })) as T;
  }

  throw new Error(`Unsupported Convex function in smoke harness: ${functionName}`);
}

function getConvexClient() {
  if (convexClient) {
    return convexClient;
  }
  const convexUrl =
    process.env.NEXT_PUBLIC_CONVEX_URL ??
    process.env.CONVEX_CLOUD_URL ??
    process.env.CONVEX_URL;
  assert(convexUrl, "A Convex URL is required for the e2e smoke harness.");
  convexClient = new ConvexHttpClient(convexUrl, { logger: false });
  return convexClient;
}

async function getSandbox(name: string) {
  return await Sandbox.get({
    name,
    ...vercelCredentials(),
  });
}

function vercelCredentials() {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  assert(token, "VERCEL_TOKEN is required for sandbox file inspection.");
  assert(teamId, "VERCEL_TEAM_ID is required for sandbox file inspection.");
  assert(projectId, "VERCEL_PROJECT_ID is required for sandbox file inspection.");
  return { token, teamId, projectId };
}

async function loadPrivateEnv() {
  const text = await readFile(privateEnvPath, "utf8").catch(() => "");
  const parsed = parseEnvFile(text);
  for (const [key, value] of Object.entries(parsed)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  normalizeEnvValues([
    "CONVEX_DEPLOYMENT",
    "NEXT_PUBLIC_CONVEX_URL",
    "CONVEX_URL",
    "CONVEX_CLOUD_URL",
    "VERCEL_TOKEN",
    "VERCEL_TEAM_ID",
    "VERCEL_PROJECT_ID",
    "OPENAI_API_KEY",
    "CODEX_API_KEY",
  ]);
}

function normalizeEnvValues(names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined) {
      process.env[name] = unwrapEnvValue(value);
    }
  }
}

function parseEnvFile(text: string) {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) {
      continue;
    }
    values[match[1]] = unwrapEnvValue(match[2]);
  }
  return values;
}

function unwrapEnvValue(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return stripInlineEnvComment(trimmed);
}

function stripInlineEnvComment(value: string) {
  const index = value.search(/\s#/);
  return index >= 0 ? value.slice(0, index).trimEnd() : value;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    scenario: "fashion-designer-product",
    timeoutMs: defaultTimeoutMs,
    pollMs: defaultPollMs,
    startAttempts: defaultStartAttempts,
    artifactRoot: defaultArtifactRoot,
    keepSandbox: false,
    skipSandboxFiles: false,
    cleanupArtifacts: false,
    allowMetaCreate: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--scenario") {
      options.scenario = parseScenario(readArgValue(args, ++index, arg));
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = parsePositiveInteger(readArgValue(args, ++index, arg), arg);
    } else if (arg === "--poll-ms") {
      options.pollMs = parsePositiveInteger(readArgValue(args, ++index, arg), arg);
    } else if (arg === "--start-attempts") {
      options.startAttempts = parsePositiveInteger(readArgValue(args, ++index, arg), arg);
    } else if (arg === "--artifact-root") {
      options.artifactRoot = path.resolve(repoRoot, readArgValue(args, ++index, arg));
    } else if (arg === "--keep-sandbox") {
      options.keepSandbox = true;
    } else if (arg === "--skip-sandbox-files") {
      options.skipSandboxFiles = true;
    } else if (arg === "--cleanup-artifacts") {
      options.cleanupArtifacts = true;
    } else if (arg === "--allow-meta-create") {
      options.allowMetaCreate = true;
    } else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function parseScenario(value: string): CliOptions["scenario"] {
  if (
    value === "all" ||
    value === "fashion-designer-product" ||
    value === "scout-cultural" ||
    value === "builder-drop-site" ||
    value === "drop-workflow-builder" ||
    value === "performance-marketer-facebook-paused"
  ) {
    return value;
  }
  throw new Error(`Unknown scenario: ${value}`);
}

function readArgValue(args: string[], index: number, flag: string) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function parsePositiveInteger(value: string, flag: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage:
  pnpm e2e:sandbox -- --scenario fashion-designer-product
  pnpm e2e:sandbox -- --scenario scout-cultural
  pnpm e2e:sandbox -- --scenario builder-drop-site
  pnpm e2e:sandbox -- --scenario drop-workflow-builder
  pnpm e2e:sandbox -- --scenario performance-marketer-facebook-paused --allow-meta-create
  pnpm e2e:sandbox -- --scenario all

Options:
  --timeout-ms <ms>          Overall timeout per scenario. Default ${defaultTimeoutMs}
  --poll-ms <ms>             Poll interval. Default ${defaultPollMs}
  --start-attempts <count>   Retry transient sandbox start failures. Default ${defaultStartAttempts}
  --artifact-root <path>     Local evidence directory. Default .sandbox-e2e
  --keep-sandbox             Do not delete the Vercel Sandbox after inspection.
  --skip-sandbox-files       Validate Convex events only; do not read files from Vercel Sandbox.
  --cleanup-artifacts        Remove local evidence directory for each run after success.
  --allow-meta-create        Allow live Meta create scenarios that create real paused ad objects.
`);
}

function eventText(events: SandboxEvent[]) {
  return events.map((event) => JSON.stringify(event.payload ?? "")).join("\n");
}

function findEventPayload(events: SandboxEvent[], type: string) {
  return events.find((event) => event.type === type)?.payload;
}

function assertGeneratedAtFresh(name: string, output: unknown, startedAt: number, endedAt: number) {
  const root = asRecord(output, `${name} output`);
  assert(typeof root.generatedAt === "string", `${name}: generatedAt must be a string.`);
  const generatedAt = Date.parse(root.generatedAt);
  assert(Number.isFinite(generatedAt), `${name}: generatedAt must be an ISO timestamp.`);

  const clockSkewMs = 5 * 60 * 1000;
  assert(
    generatedAt >= startedAt - clockSkewMs && generatedAt <= endedAt + clockSkewMs,
    `${name}: generatedAt was outside the current run window.`,
  );
}

function collectWorkspaceImagePaths(value: unknown): string[] {
  if (typeof value === "string") {
    return value.startsWith("/vercel/sandbox/agent-workspace/") &&
      /\.(png|jpe?g|webp)$/i.test(value)
      ? [value]
      : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectWorkspaceImagePaths);
  }
  if (isRecord(value)) {
    return Object.values(value).flatMap(collectWorkspaceImagePaths);
  }
  return [];
}

function parseImageHeader(buffer: Buffer): AssetEvidence["image"] {
  const pngSignature =
    buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

  if (pngSignature) {
    return {
      format: "png",
      validSignature: true,
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  const jpeg = parseJpegHeader(buffer);
  if (jpeg) {
    return { format: "jpeg", validSignature: true, ...jpeg };
  }

  const webp = parseWebpHeader(buffer);
  if (webp) {
    return { format: "webp", validSignature: true, ...webp };
  }

  return { format: "png", validSignature: false, width: 0, height: 0 };
}

function parseJpegHeader(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) {
      break;
    }

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame && offset + 8 < buffer.length) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + segmentLength;
  }

  return null;
}

function parseWebpHeader(buffer: Buffer) {
  if (
    buffer.length < 30 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }

  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X" && buffer.length >= 30) {
    return {
      width:
        1 +
        buffer[24] +
        (buffer[25] << 8) +
        (buffer[26] << 16),
      height:
        1 +
        buffer[27] +
        (buffer[28] << 8) +
        (buffer[29] << 16),
    };
  }

  if (chunk === "VP8 " && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  if (chunk === "VP8L" && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  return null;
}

function keepSandboxAfterFailure(options: CliOptions) {
  return options.keepSandbox || process.env.DRIP_E2E_KEEP_SANDBOX_ON_FAILURE === "1";
}

function isTransientSandboxStartError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /Status code (429|5\d\d) is not ok|ECONNRESET|ETIMEDOUT|fetch failed/i.test(
    message,
  );
}

async function deleteSandbox(sandbox: Sandbox) {
  try {
    await sandbox.delete();
  } catch {
    await sandbox.stop().catch(() => undefined);
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  assert(isRecord(value), `${label} must be an object.`);
  return value;
}

function asArray(value: unknown, label: string): unknown[] {
  assert(Array.isArray(value), `${label} must be an array.`);
  return value;
}

function assertNumberAtLeast(value: unknown, min: number, label: string) {
  assert(typeof value === "number", `${label} must be a number.`);
  assert(value >= min, `${label} must be >= ${min}.`);
}

function requireString(value: unknown, label: string) {
  assert(typeof value === "string" && value.length > 0, `${label} must be a string.`);
  return value;
}

function requireSandboxRunId(value: unknown) {
  return requireString(value, "sandboxRunId") as Id<"sandboxRuns">;
}

function requireDropId(value: unknown) {
  return requireString(value, "dropId") as Id<"drops">;
}

function requireStringArray(value: unknown, label: string) {
  assert(Array.isArray(value), `${label} must be an array.`);
  for (const [index, entry] of value.entries()) {
    assert(typeof entry === "string", `${label}[${index}] must be a string.`);
  }
  return value;
}

function assertPausedStatus(value: unknown, label: string) {
  assert(typeof value === "string", `${label} must be a string.`);
  assert(value.toUpperCase() === "PAUSED", `${label} must be PAUSED.`);
}

function countBy(values: string[]) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
