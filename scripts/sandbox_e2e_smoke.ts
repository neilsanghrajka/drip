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
let convexClient: ConvexHttpClient | null = null;

type ScenarioName = "fashion-designer-product" | "scout-cultural";

type CliOptions = {
  scenario: ScenarioName | "all";
  timeoutMs: number;
  pollMs: number;
  startAttempts: number;
  artifactRoot: string;
  keepSandbox: boolean;
  skipSandboxFiles: boolean;
  cleanupArtifacts: boolean;
};

type SandboxRun = {
  _id: string;
  status: string;
  task: string;
  workspaceId: string;
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

type Scenario = {
  name: ScenarioName;
  workspaceId: string;
  task: string;
  outputPath: string;
  collectAssets: boolean;
  validateEvents: (run: SandboxRun, events: SandboxEvent[]) => void;
  validateOutput: (output: unknown) => void;
};

type CreatedRun = {
  sandboxRunId: string;
  task: string;
  workspaceId: string;
};

type StartSandboxRunResult = {
  commandId: string;
  sandboxId: string;
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
  const scenarios = selectScenarios(options.scenario);
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

    await writeEvidenceFiles({
      artifactDir,
      dbState,
      run,
      events,
      output,
      assets,
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
  startedAt,
}: {
  artifactDir: string;
  dbState: DbStateEvidence;
  run: SandboxRun;
  events: SandboxEvent[];
  output: unknown;
  assets: AssetEvidence[];
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
        eventCounts: countBy(events.map((event) => event.type)),
      },
      null,
      2,
    ),
  );
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

function selectScenarios(value: CliOptions["scenario"]) {
  if (value === "all") {
    return scenarios;
  }
  return scenarios.filter((scenario) => scenario.name === value);
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
];

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
    value === "scout-cultural"
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
  pnpm e2e:sandbox -- --scenario all

Options:
  --timeout-ms <ms>          Overall timeout per scenario. Default ${defaultTimeoutMs}
  --poll-ms <ms>             Poll interval. Default ${defaultPollMs}
  --start-attempts <count>   Retry transient sandbox start failures. Default ${defaultStartAttempts}
  --artifact-root <path>     Local evidence directory. Default .sandbox-e2e
  --keep-sandbox             Do not delete the Vercel Sandbox after inspection.
  --skip-sandbox-files       Validate Convex events only; do not read files from Vercel Sandbox.
  --cleanup-artifacts        Remove local evidence directory for each run after success.
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
