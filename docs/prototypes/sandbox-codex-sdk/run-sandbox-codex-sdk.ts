import { createHash, randomBytes } from "node:crypto";

import { Sandbox } from "@vercel/sandbox";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

// Phase A tutorial script.
//
// This file is intentionally ordered like an open-source SDK example:
// 1. Read config from private env files.
// 2. Create one prepared Vercel Sandbox.
// 3. Install the Codex SDK inside it.
// 4. Snapshot that prepared sandbox.
// 5. Fork two sandboxes from the snapshot.
// 6. Run Codex SDK in each fork.
// 7. Read the created source/output/proof files from outside the sandbox.
// 8. Delete temporary sandboxes and snapshots.

const forkLabels = ["fork-a", "fork-b"] as const;

type RunStatus =
  | "sandbox_created"
  | "runner_started"
  | "running"
  | "completed"
  | "failed";

type VercelSandbox = Awaited<ReturnType<typeof Sandbox.create>>;
type VercelSnapshot = Awaited<ReturnType<VercelSandbox["snapshot"]>>;
type ForkLabel = (typeof forkLabels)[number];
type SandboxRole = "base" | ForkLabel;

type TutorialConfig = {
  codexApiKey: string;
  codexModel: string;
  codexReasoningEffort: string;
  convexIngestToken: string;
  convexIngestUrl: string;
  convexUrl: string;
  sandboxNamePrefix?: string;
  sandboxRuntime: string;
  sandboxTimeoutMs: number;
  sandboxVcpus: number;
  tutorialId: string;
  vercelCredentials: {
    projectId?: string;
    teamId?: string;
    token?: string;
  };
};

type CreatedResources = {
  sandboxes: VercelSandbox[];
  snapshots: VercelSnapshot[];
};

type ForkRun = {
  expectedOutput: string;
  externalRunId: string;
  helloFile: string;
  label: ForkLabel;
  outputFile: string;
  prompt: string;
  proofFile: string;
  runnerToken: string;
};

type ForkResult = {
  externalRunId: string;
  helloFile: string;
  helloSource: string;
  label: ForkLabel;
  outputFile: string;
  outputText: string;
  proofFile: string;
  proofText: string;
};

type SandboxArtifacts = {
  helloSource: string;
  outputText: string;
  proofText: string;
};

const createRun = makeFunctionReference<
  "mutation",
  {
    externalRunId: string;
    prompt: string;
    runnerIngestTokenHash?: string;
  },
  string
>("sandboxPrototype:createRun");

const getRun = makeFunctionReference<
  "query",
  { externalRunId: string },
  Record<string, unknown> | null
>("sandboxPrototype:getRun");

const listEvents = makeFunctionReference<
  "query",
  { externalRunId: string },
  Record<string, unknown>[]
>("sandboxPrototype:listEvents");

const tutorialId = `drip-sdk-tutorial-${Date.now()}`;

main().catch((error) => {
  console.error(safeError(error));
  process.exit(1);
});

// -----------------------------------------------------------------------------
// Tutorial: read this function first
// -----------------------------------------------------------------------------

async function main() {
  const config = readTutorialConfig(tutorialId);
  const convex = new ConvexHttpClient(config.convexUrl);
  const resources: CreatedResources = {
    sandboxes: [],
    snapshots: [],
  };

  try {
    const baseSandbox = await createBaseSandbox(config, resources);
    await copyRunnerIntoSandbox(baseSandbox);
    await installCodexSdk(baseSandbox);

    const snapshot = await snapshotBaseSandbox(baseSandbox, resources);

    const forkResults = await runForkedSandboxes({
      config,
      convex,
      resources,
      snapshotId: snapshot.snapshotId,
    });

    await verifyConvexRuns(convex, forkResults);

    console.log("Tutorial complete: Vercel Sandbox + Codex SDK + Convex E2E works.");
  } finally {
    await cleanupResources(resources);
  }
}

// -----------------------------------------------------------------------------
// Step 1: create a prepared base sandbox
// -----------------------------------------------------------------------------

async function createBaseSandbox(
  config: TutorialConfig,
  resources: CreatedResources,
) {
  console.log("Step 1: Create a base Vercel Sandbox.");

  const sandbox = await createSandbox({
    config,
    resources,
    role: "base",
  });

  console.log(
    json({
      step: "base.created",
      sandboxName: sandbox.name,
      runtime: sandbox.runtime,
    }),
  );

  return sandbox;
}

// -----------------------------------------------------------------------------
// Step 2: copy the tiny runner and package manifest
// -----------------------------------------------------------------------------

async function copyRunnerIntoSandbox(sandbox: VercelSandbox) {
  console.log("Step 2: Copy the tiny runner and package.json into the base sandbox.");

  await sandbox.writeFiles([
    {
      path: "package.json",
      content: JSON.stringify(
        {
          private: true,
          type: "module",
          dependencies: {
            "@openai/codex-sdk": "0.136.0",
          },
        },
        null,
        2,
      ),
    },
    {
      path: "tutorial-runner.mjs",
      content: tutorialRunnerSource,
      mode: 0o755,
    },
  ]);
}

// -----------------------------------------------------------------------------
// Step 3: install once in the base sandbox
// -----------------------------------------------------------------------------

async function installCodexSdk(sandbox: VercelSandbox) {
  console.log("Step 3: Install Codex SDK dependencies inside the base sandbox.");

  await runCommandOrThrow(sandbox, {
    cmd: "npm",
    args: ["install", "--ignore-scripts", "--omit=dev"],
    cwd: "/vercel/sandbox",
    timeoutMs: 180_000,
  });
}

// -----------------------------------------------------------------------------
// Step 4: snapshot the prepared base sandbox
// -----------------------------------------------------------------------------

async function snapshotBaseSandbox(
  sandbox: VercelSandbox,
  resources: CreatedResources,
) {
  console.log("Step 4: Snapshot the prepared base sandbox.");

  const snapshot = await sandbox.snapshot({
    expiration: 24 * 60 * 60 * 1000,
  });
  resources.snapshots.push(snapshot);

  console.log(
    json({
      step: "base.snapshot_created",
      snapshotId: snapshot.snapshotId,
    }),
  );

  return snapshot;
}

// -----------------------------------------------------------------------------
// Step 5: fork from the snapshot and run Codex SDK
// -----------------------------------------------------------------------------

async function runForkedSandboxes({
  config,
  convex,
  resources,
  snapshotId,
}: {
  config: TutorialConfig;
  convex: ConvexHttpClient;
  resources: CreatedResources;
  snapshotId: string;
}) {
  console.log("Step 5: Fork two sandboxes from that one snapshot.");

  const forkResults: ForkResult[] = [];
  for (const label of forkLabels) {
    forkResults.push(
      await runForkedSandbox({
        config,
        convex,
        label,
        resources,
        snapshotId,
      }),
    );
  }

  return forkResults;
}

async function runForkedSandbox({
  config,
  convex,
  label,
  resources,
  snapshotId,
}: {
  config: TutorialConfig;
  convex: ConvexHttpClient;
  label: ForkLabel;
  resources: CreatedResources;
  snapshotId: string;
}): Promise<ForkResult> {
  const run = defineForkRun(config, label);

  await createConvexRun(convex, run);

  console.log(`${stepForFork(label)}: Start ${label} from the snapshot.`);
  const sandbox = await createForkedSandbox({
    config,
    label,
    resources,
    snapshotId,
  });

  await reportHostEvent(config, run.externalRunId, {
    sequence: 1,
    eventType: "sandbox.created",
    status: "sandbox_created",
    payload: {
      label,
      sandboxName: sandbox.name,
      snapshotId,
      runtime: sandbox.runtime,
    },
    sandboxName: sandbox.name,
  });

  console.log(`${stepForFork(label)}: Run Codex SDK in ${label}.`);
  const command = await runCodexRunner({
    config,
    run,
    sandbox,
  });

  const artifacts = await readSandboxArtifacts({
    commandId: command.cmdId,
    config,
    run,
    sandbox,
  });

  return {
    externalRunId: run.externalRunId,
    helloFile: run.helloFile,
    helloSource: artifacts.helloSource,
    label,
    outputFile: run.outputFile,
    outputText: artifacts.outputText,
    proofFile: run.proofFile,
    proofText: artifacts.proofText,
  };
}

function defineForkRun(
  config: TutorialConfig,
  label: ForkLabel,
): ForkRun {
  const expectedOutput = `hello world from ${label}`;
  const helloFile = `hello-world-${label}.mjs`;
  const outputFile = `hello-world-output-${label}.txt`;
  const proofFile = `codex-sdk-proof-${label}.txt`;

  return {
    expectedOutput,
    externalRunId: `${config.tutorialId}-${label}`,
    helloFile,
    label,
    outputFile,
    prompt: [
      `Create a Node.js file named ${helloFile} in the current directory.`,
      `That file must print exactly "${expectedOutput}" to stdout.`,
      `Run it with Node and save stdout to ${outputFile}.`,
      `Then create ${proofFile} containing JSON with ok=true, source="codex-sdk", fork="${label}", helloFile="${helloFile}", and outputFile="${outputFile}".`,
      "Return only JSON matching the requested schema.",
    ].join(" "),
    proofFile,
    runnerToken: randomBytes(32).toString("base64url"),
  };
}

async function createConvexRun(convex: ConvexHttpClient, run: ForkRun) {
  await convex.mutation(createRun, {
    externalRunId: run.externalRunId,
    prompt: run.prompt,
    runnerIngestTokenHash: sha256Hex(run.runnerToken),
  });
}

async function createForkedSandbox({
  config,
  label,
  resources,
  snapshotId,
}: {
  config: TutorialConfig;
  label: ForkLabel;
  resources: CreatedResources;
  snapshotId: string;
}) {
  return await createSandbox({
    config,
    resources,
    role: label,
    snapshotId,
  });
}

async function runCodexRunner({
  config,
  run,
  sandbox,
}: {
  config: TutorialConfig;
  run: ForkRun;
  sandbox: VercelSandbox;
}) {
  const command = await sandbox.runCommand({
    cmd: "node",
    args: ["tutorial-runner.mjs"],
    cwd: "/vercel/sandbox",
    detached: true,
    env: {
      DRIP_CODEX_PROMPT: run.prompt,
      DRIP_CONVEX_INGEST_URL: config.convexIngestUrl,
      DRIP_EVENT_SEQUENCE_START: "100",
      DRIP_EXTERNAL_RUN_ID: run.externalRunId,
      DRIP_FORK_LABEL: run.label,
      DRIP_HELLO_FILE: run.helloFile,
      DRIP_INGEST_TOKEN: run.runnerToken,
      DRIP_OUTPUT_FILE: run.outputFile,
      DRIP_PROOF_FILE: run.proofFile,
    },
    timeoutMs: 300_000,
  });

  await reportHostEvent(config, run.externalRunId, {
    sequence: 2,
    eventType: "sandbox.command_started",
    status: "runner_started",
    payload: {
      label: run.label,
      sandboxCommandId: command.cmdId,
      sandboxName: sandbox.name,
    },
    sandboxCommandId: command.cmdId,
    sandboxName: sandbox.name,
  });

  console.log(
    json({
      step: "fork.command_started",
      label: run.label,
      externalRunId: run.externalRunId,
      sandboxName: sandbox.name,
      commandId: command.cmdId,
    }),
  );

  for await (const log of command.logs()) {
    const stream = log.stream === "stderr" ? process.stderr : process.stdout;
    stream.write(log.data);
  }

  const result = await command.wait();
  if (result.exitCode !== 0) {
    await reportHostEvent(config, run.externalRunId, {
      sequence: 900,
      eventType: "sandbox.command_failed",
      status: "failed",
      payload: { label: run.label, exitCode: result.exitCode },
      error: `Runner exited with ${result.exitCode}`,
      sandboxCommandId: command.cmdId,
      sandboxName: sandbox.name,
    });
    throw new Error(`${run.label} runner exited with ${result.exitCode}`);
  }

  return command;
}

async function readSandboxArtifacts({
  commandId,
  config,
  run,
  sandbox,
}: {
  commandId: string;
  config: TutorialConfig;
  run: ForkRun;
  sandbox: VercelSandbox;
}) {
  const helloSource = await readRequiredFile(sandbox, run.helloFile);
  const outputText = await readRequiredFile(sandbox, run.outputFile);
  const proofText = await readRequiredFile(sandbox, run.proofFile);

  const artifacts = {
    helloSource,
    outputText,
    proofText,
  };

  try {
    assertSandboxArtifacts(run, artifacts);
  } catch (error) {
    await reportHostEvent(config, run.externalRunId, {
      sequence: 900,
      eventType: "sandbox.artifact_check_failed",
      status: "failed",
      payload: {
        helloFile: run.helloFile,
        label: run.label,
        outputFile: run.outputFile,
        proofFile: run.proofFile,
        expectedOutput: run.expectedOutput,
        helloSource,
        outputText,
        proofText,
      },
      error: error instanceof Error ? error.message : String(error),
      sandboxCommandId: commandId,
      sandboxName: sandbox.name,
    });
    throw error;
  }

  await reportHostEvent(config, run.externalRunId, {
    sequence: 900,
    eventType: "sandbox.artifacts_read",
    status: "completed",
    payload: {
      helloFile: run.helloFile,
      helloSource,
      label: run.label,
      outputFile: run.outputFile,
      outputText,
      proofFile: run.proofFile,
      proofText,
    },
    sandboxCommandId: commandId,
    sandboxName: sandbox.name,
  });

  console.log(
    json({
      step: "fork.artifacts_read",
      helloFile: run.helloFile,
      helloSource,
      label: run.label,
      externalRunId: run.externalRunId,
      outputFile: run.outputFile,
      outputText,
      proofFile: run.proofFile,
      proofText,
    }),
  );

  return {
    helloSource,
    outputText,
    proofText,
  };
}

function assertSandboxArtifacts(run: ForkRun, artifacts: SandboxArtifacts) {
  assertIncludes(
    artifacts.helloSource,
    run.expectedOutput,
    `${run.helloFile} should contain the expected hello-world text`,
  );
  assertEqual(
    artifacts.outputText.trim(),
    run.expectedOutput,
    `${run.outputFile} should contain stdout from running ${run.helloFile}`,
  );

  const proof = parseJsonObject(artifacts.proofText, run.proofFile);
  assertEqual(proof.ok, true, `${run.proofFile} should set ok=true`);
  assertEqual(proof.source, "codex-sdk", `${run.proofFile} should identify Codex SDK`);
  assertEqual(proof.fork, run.label, `${run.proofFile} should identify the fork`);
  assertEqual(proof.helloFile, run.helloFile, `${run.proofFile} should name helloFile`);
  assertEqual(proof.outputFile, run.outputFile, `${run.proofFile} should name outputFile`);
}

async function readRequiredFile(sandbox: VercelSandbox, path: string) {
  const file = await sandbox.readFileToBuffer({
    path,
    cwd: "/vercel/sandbox",
  });

  if (!file) {
    throw new Error(`${path} is missing from ${sandbox.name}`);
  }

  return file.toString("utf8");
}

// -----------------------------------------------------------------------------
// Step 6: query Convex back through the control-plane API
// -----------------------------------------------------------------------------

async function verifyConvexRuns(
  convex: ConvexHttpClient,
  forkResults: ForkResult[],
) {
  console.log("Step 6: Query Convex to prove both forked runs were stored.");

  for (const result of forkResults) {
    const run = await convex.query(getRun, {
      externalRunId: result.externalRunId,
    });
    const events = await convex.query(listEvents, {
      externalRunId: result.externalRunId,
    });

    console.log(
      json({
        step: "convex.verified",
        externalRunId: result.externalRunId,
        status: run?.status,
        eventCount: events.length,
        commandExecutionObserved: hasSdkCommandExecution(events),
        helloFile: result.helloFile,
        outputFile: result.outputFile,
        outputText: result.outputText,
        proofFile: result.proofFile,
        proofText: result.proofText,
      }),
    );

    assertConvexRun(result, run, events);
  }
}

function assertConvexRun(
  result: ForkResult,
  run: Record<string, unknown> | null,
  events: Record<string, unknown>[],
) {
  assertEqual(run?.status, "completed", `${result.externalRunId} should be completed`);
  assertHasEvent(events, "sandbox.created");
  assertHasEvent(events, "sandbox.command_started");
  assertHasEvent(events, "runner.started");
  assertHasEvent(events, "codex.sdk.event");
  assertHasEvent(events, "runner.completed");
  assertHasEvent(events, "sandbox.artifacts_read");

  if (!hasSdkCommandExecution(events)) {
    throw new Error(`${result.externalRunId} did not store a Codex SDK command_execution event`);
  }
}

function assertHasEvent(events: Record<string, unknown>[], eventType: string) {
  if (!events.some((event) => event.eventType === eventType)) {
    throw new Error(`Convex events are missing ${eventType}`);
  }
}

function hasSdkCommandExecution(events: Record<string, unknown>[]) {
  return events.some((entry) => {
    if (entry.eventType !== "codex.sdk.event") {
      return false;
    }

    const payload = entry.payload;
    if (!isRecord(payload)) {
      return false;
    }

    const sdkEvent = payload.event;
    if (!isRecord(sdkEvent)) {
      return false;
    }

    const item = sdkEvent.item;
    if (!isRecord(item)) {
      return false;
    }

    return item.type === "command_execution" && typeof item.command === "string";
  });
}

// -----------------------------------------------------------------------------
// Step 7: delete temporary tutorial resources
// -----------------------------------------------------------------------------

async function cleanupResources(resources: CreatedResources) {
  await deleteSandboxes(resources.sandboxes);
  await deleteSnapshots(resources.snapshots);
}

async function deleteSandboxes(sandboxes: VercelSandbox[]) {
  for (const sandbox of [...sandboxes].reverse()) {
    await deleteSandbox(sandbox);
  }
}

async function deleteSandbox(sandbox: VercelSandbox) {
  try {
    try {
      await sandbox.stop();
    } catch {
      // A snapshotted base sandbox is already stopped. Deleting it is still OK.
    }
    await sandbox.delete();
    console.log(json({ step: "sandbox.deleted", sandboxName: sandbox.name }));
  } catch (error) {
    console.error(
      json({
        step: "sandbox.delete_failed",
        sandboxName: sandbox.name,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

async function deleteSnapshots(snapshots: VercelSnapshot[]) {
  for (const snapshot of [...snapshots].reverse()) {
    await deleteSnapshot(snapshot);
  }
}

async function deleteSnapshot(snapshot: VercelSnapshot) {
  try {
    await snapshot.delete();
    console.log(json({ step: "snapshot.deleted", snapshotId: snapshot.snapshotId }));
  } catch (error) {
    console.error(
      json({
        step: "snapshot.delete_failed",
        snapshotId: snapshot.snapshotId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

// -----------------------------------------------------------------------------
// Small wrappers around Vercel Sandbox and Convex
// -----------------------------------------------------------------------------

async function createSandbox({
  config,
  resources,
  role,
  snapshotId,
}: {
  config: TutorialConfig;
  resources: CreatedResources;
  role: SandboxRole;
  snapshotId?: string;
}) {
  const commonParams = {
    ...config.vercelCredentials,
    env: {
      // Free-plan tutorial mode: pass a disposable Codex key directly into the
      // Vercel Sandbox. Do not use a production or long-lived key here.
      CODEX_API_KEY: config.codexApiKey,
      CODEX_MODEL: config.codexModel,
      CODEX_REASONING_EFFORT: config.codexReasoningEffort,
      DRIP_CODEX_INNER_SANDBOX_MODE: "danger-full-access",
    },
    name: config.sandboxNamePrefix
      ? `${config.sandboxNamePrefix}-${role}`
      : undefined,
    networkPolicy: sandboxNetworkPolicy(config),
    resources: {
      vcpus: config.sandboxVcpus,
    },
    tags: {
      app: "drip",
      phase: "A",
      prototype: "codex-sdk-tutorial",
      role,
    },
    timeout: config.sandboxTimeoutMs,
  };

  const sandbox = snapshotId
    ? await Sandbox.create({
        ...commonParams,
        source: {
          type: "snapshot",
          snapshotId,
        },
      })
    : await Sandbox.create({
        ...commonParams,
        runtime: config.sandboxRuntime,
      });

  resources.sandboxes.push(sandbox);
  return sandbox;
}

async function runCommandOrThrow(
  sandbox: VercelSandbox,
  command: Parameters<VercelSandbox["runCommand"]>[0],
) {
  const result = await sandbox.runCommand(command);
  const stdout = await result.stdout();
  const stderr = await result.stderr();

  if (stdout) {
    process.stdout.write(stdout);
  }
  if (stderr) {
    process.stderr.write(stderr);
  }
  if (result.exitCode !== 0) {
    throw new Error(`Command failed with exit ${result.exitCode}: ${command.cmd}`);
  }
}

async function reportHostEvent(
  config: TutorialConfig,
  externalRunId: string,
  event: {
    sequence: number;
    eventType: string;
    status: RunStatus;
    payload: Record<string, unknown>;
    error?: string;
    sandboxCommandId?: string;
    sandboxName?: string;
  },
) {
  const response = await fetch(config.convexIngestUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.convexIngestToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      externalRunId,
      sequence: event.sequence,
      source: "host-tutorial",
      eventType: event.eventType,
      status: event.status,
      message: event.eventType,
      payload: event.payload,
      error: event.error,
      sandboxCommandId: event.sandboxCommandId,
      sandboxName: event.sandboxName,
    }),
  });

  if (!response.ok) {
    throw new Error(`Convex ingest failed (${response.status}): ${await response.text()}`);
  }
}

// -----------------------------------------------------------------------------
// Config and formatting helpers
// -----------------------------------------------------------------------------

function readTutorialConfig(currentTutorialId: string): TutorialConfig {
  const convexUrl = process.env.DRIP_CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  const convexSiteUrl =
    process.env.DRIP_CONVEX_SITE_URL ?? process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  const convexIngestUrl =
    process.env.DRIP_CONVEX_INGEST_URL ??
    (convexSiteUrl ? `${convexSiteUrl}/sandbox-prototype/ingest` : undefined);
  const missing = [];

  if (!process.env.VERCEL_OIDC_TOKEN && !process.env.VERCEL_TOKEN) {
    missing.push("VERCEL_OIDC_TOKEN or VERCEL_TOKEN");
  }
  if (process.env.VERCEL_TOKEN && !process.env.VERCEL_PROJECT_ID) {
    missing.push("VERCEL_PROJECT_ID");
  }
  if (process.env.VERCEL_TOKEN && !process.env.VERCEL_TEAM_ID) {
    missing.push("VERCEL_TEAM_ID");
  }
  if (!process.env.CODEX_API_KEY) {
    missing.push("CODEX_API_KEY");
  } else if (!process.env.CODEX_API_KEY.startsWith("sk-")) {
    missing.push("CODEX_API_KEY must be an OpenAI Platform API key");
  }
  if (!convexUrl) {
    missing.push("NEXT_PUBLIC_CONVEX_URL");
  }
  if (!convexIngestUrl) {
    missing.push("NEXT_PUBLIC_CONVEX_SITE_URL");
  }
  if (!process.env.SANDBOX_PROTOTYPE_INGEST_TOKEN) {
    missing.push("SANDBOX_PROTOTYPE_INGEST_TOKEN");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  return {
    codexApiKey: process.env.CODEX_API_KEY!,
    codexModel: process.env.CODEX_MODEL || "gpt-5.5",
    codexReasoningEffort: process.env.CODEX_REASONING_EFFORT ?? "low",
    convexIngestToken: process.env.SANDBOX_PROTOTYPE_INGEST_TOKEN!,
    convexIngestUrl: convexIngestUrl!,
    convexUrl: convexUrl!,
    sandboxNamePrefix: process.env.DRIP_SANDBOX_NAME || undefined,
    sandboxRuntime: process.env.DRIP_SANDBOX_RUNTIME ?? "node24",
    sandboxTimeoutMs: Number(process.env.DRIP_SANDBOX_TIMEOUT_MS ?? "600000"),
    sandboxVcpus: Number(process.env.DRIP_SANDBOX_VCPUS ?? "2"),
    tutorialId: currentTutorialId,
    vercelCredentials: vercelCredentials(),
  };
}

function vercelCredentials() {
  if (!process.env.VERCEL_TOKEN) {
    return {};
  }

  return {
    projectId: process.env.VERCEL_PROJECT_ID,
    teamId: process.env.VERCEL_TEAM_ID,
    token: process.env.VERCEL_TOKEN,
  };
}

function sandboxNetworkPolicy(config: TutorialConfig) {
  const allowed = new Set([
    "api.openai.com",
    "auth.openai.com",
    "chatgpt.com",
    "registry.npmjs.org",
    "*.npmjs.org",
    "*.convex.site",
    "*.convex.cloud",
  ]);

  allowed.add(new URL(config.convexIngestUrl).hostname);

  return { allow: Array.from(allowed) };
}

function stepForFork(label: ForkLabel) {
  return label === "fork-a" ? "Step 5.1" : "Step 5.2";
}

function parseJsonObject(value: string, label: string) {
  const parsed = JSON.parse(value) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`${label} should contain a JSON object`);
  }
  return parsed;
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${json(expected)}, got ${json(actual)}`);
  }
}

function assertIncludes(value: string, expected: string, message: string) {
  if (!value.includes(expected)) {
    throw new Error(`${message}. Expected to find ${json(expected)}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function safeError(error: unknown) {
  return json({
    tutorialId,
    error: error instanceof Error ? error.message : String(error),
  });
}

// -----------------------------------------------------------------------------
// The tiny script copied into each forked sandbox
// -----------------------------------------------------------------------------

const tutorialRunnerSource = String.raw`
import { Codex } from "@openai/codex-sdk";

const externalRunId = must("DRIP_EXTERNAL_RUN_ID");
const forkLabel = must("DRIP_FORK_LABEL");
const helloFile = must("DRIP_HELLO_FILE");
const outputFile = must("DRIP_OUTPUT_FILE");
const proofFile = must("DRIP_PROOF_FILE");
const prompt = must("DRIP_CODEX_PROMPT");
const ingestUrl = must("DRIP_CONVEX_INGEST_URL");
const ingestToken = must("DRIP_INGEST_TOKEN");
let sequence = Number(process.env.DRIP_EVENT_SEQUENCE_START ?? "100");
let codexThreadId;

const outputSchema = {
  type: "object",
  properties: {
    fork: { type: "string" },
    helloFile: { type: "string" },
    outputFile: { type: "string" },
    proofFile: { type: "string" },
    status: { type: "string", enum: ["ok", "blocked"] },
    summary: { type: "string" },
  },
  required: ["fork", "helloFile", "outputFile", "proofFile", "status", "summary"],
  additionalProperties: false,
};

try {
  // The first runner event proves the copied script started inside the fork.
  await emit("runner.started", "runner_started", {
    forkLabel,
    nodeVersion: process.version,
    cwd: process.cwd(),
  });

  // This is the actual Codex SDK runner path. The API key is inherited from
  // Sandbox.create({ env }) in the host script; it is not hardcoded here.
  const codex = new Codex({
    apiKey: must("CODEX_API_KEY"),
    env: {
      HOME: process.env.HOME ?? "/tmp",
      NODE_ENV: "production",
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      TMPDIR: process.env.TMPDIR ?? "/tmp",
    },
  });

  const thread = codex.startThread({
    approvalPolicy: "never",
    model: process.env.CODEX_MODEL || "gpt-5.5",
    modelReasoningEffort: process.env.CODEX_REASONING_EFFORT || "low",
    networkAccessEnabled: false,
    sandboxMode: process.env.DRIP_CODEX_INNER_SANDBOX_MODE || "danger-full-access",
    skipGitRepoCheck: true,
    webSearchMode: "disabled",
    workingDirectory: process.cwd(),
  });

  // The prompt asks Codex to create and run a hello-world file. Streaming events
  // are forwarded into Convex so the control plane can show progress in realtime.
  const { events } = await thread.runStreamed(prompt, {
    outputSchema,
  });

  let finalResponse = "";
  let usage = null;

  for await (const event of events) {
    if (event.type === "thread.started") {
      codexThreadId = event.thread_id;
    }
    if (event.type === "item.completed" && event.item.type === "agent_message") {
      finalResponse = event.item.text;
    }
    if (event.type === "turn.completed") {
      usage = event.usage;
    }
    if (event.type === "turn.failed") {
      throw new Error(event.error.message);
    }
    if (event.type === "error") {
      throw new Error(event.message);
    }

    await emit("codex.sdk.event", "running", {
      sdkEventType: event.type,
      event,
    });
  }

  // The host separately reads helloFile, outputFile, and proofFile back from the
  // sandbox filesystem. This event marks the SDK turn itself as complete.
  await emit("runner.completed", "completed", {
    codexThreadId,
    finalResponse,
    forkLabel,
    helloFile,
    outputFile,
    proofFile,
    usage,
  }, finalResponse);
} catch (error) {
  await emit("runner.failed", "failed", {
    error: errorToJson(error),
    forkLabel,
  }, undefined, error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function emit(eventType, status, payload, finalResponse, error) {
  // One line to stdout for humans/logs, one POST to Convex for app state.
  const event = {
    externalRunId,
    sequence: sequence++,
    source: "sandbox-runner",
    eventType,
    status,
    message: eventType,
    payload,
    codexThreadId,
    finalResponse,
    error,
  };

  console.log(JSON.stringify({ dripPrototypeEvent: true, ...event }));

  const response = await fetch(ingestUrl, {
    method: "POST",
    headers: {
      authorization: "Bearer " + ingestToken,
      "content-type": "application/json",
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    throw new Error("Convex ingest failed (" + response.status + "): " + await response.text());
  }
}

function must(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(name + " is required");
  }
  return value;
}

function errorToJson(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}
`;
