import { createHash, randomBytes } from "node:crypto";

import { Sandbox } from "@vercel/sandbox";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

// Phase A tutorial script.
//
// This intentionally reads top-to-bottom like SDK documentation:
// create a base sandbox, install once, snapshot it, fork twice, run Codex in
// both forks, write proof files, report to Convex, and clean up the temporary
// sandboxes/snapshot. It is proof code, not the final production runner.

type RunStatus =
  | "sandbox_created"
  | "runner_started"
  | "running"
  | "completed"
  | "failed";

type VercelSandbox = Awaited<ReturnType<typeof Sandbox.create>>;
type VercelSnapshot = Awaited<ReturnType<VercelSandbox["snapshot"]>>;

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
const convexUrl = process.env.DRIP_CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
const convexSiteUrl =
  process.env.DRIP_CONVEX_SITE_URL ?? process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
const convexIngestUrl =
  process.env.DRIP_CONVEX_INGEST_URL ??
  (convexSiteUrl ? `${convexSiteUrl}/sandbox-prototype/ingest` : undefined);
const convexIngestToken = process.env.SANDBOX_PROTOTYPE_INGEST_TOKEN;

const forkLabels = ["fork-a", "fork-b"] as const;
const sandboxesToStop: VercelSandbox[] = [];
const snapshotsToDelete: VercelSnapshot[] = [];

// -----------------------------------------------------------------------------
// Tutorial entrypoint
// -----------------------------------------------------------------------------

main().catch((error) => {
  console.error(safeError(error));
  process.exit(1);
});

async function main() {
  validateEnv();

  const convex = new ConvexHttpClient(must(convexUrl, "NEXT_PUBLIC_CONVEX_URL"));

  // Step 1 creates the "golden" sandbox. Think of this like a base image:
  // we do setup here once, then snapshot it so later sandboxes can start fast.
  console.log("Step 1: Create a base Vercel Sandbox.");
  const baseSandbox = await createSandbox("base");
  sandboxesToStop.push(baseSandbox);
  console.log(
    json({
      step: "base.created",
      sandboxName: baseSandbox.name,
      runtime: baseSandbox.runtime,
    }),
  );

  try {
    // Step 2 writes both files needed inside the VM. To keep this prototype easy
    // to read, those files are embedded at the bottom of this TypeScript file.
    console.log("Step 2: Copy the tiny runner and package.json into the base sandbox.");
    await writeTutorialFiles(baseSandbox);

    // Step 3 installs dependencies inside the base sandbox before the snapshot.
    // That is the important startup optimization this prototype demonstrates.
    console.log("Step 3: Install Codex SDK dependencies inside the base sandbox.");
    await runOrThrow(baseSandbox, {
      cmd: "npm",
      args: ["install", "--ignore-scripts", "--omit=dev"],
      cwd: "/vercel/sandbox",
      timeoutMs: 180_000,
    });

    // Step 4 captures the prepared filesystem. Vercel stops this base sandbox as
    // part of snapshot creation, and the two forked sandboxes below restore from it.
    console.log("Step 4: Snapshot the prepared base sandbox.");
    const snapshot = await baseSandbox.snapshot({
      expiration: 24 * 60 * 60 * 1000,
    });
    snapshotsToDelete.push(snapshot);
    console.log(
      json({
        step: "base.snapshot_created",
        snapshotId: snapshot.snapshotId,
      }),
    );

    // Step 5 is the fork proof: both sandboxes start from one prepared snapshot
    // but then run independently and write their own proof files/events.
    console.log("Step 5: Fork two sandboxes from that one snapshot.");
    const forkResults = [];
    for (const label of forkLabels) {
      forkResults.push(await runFork(convex, snapshot.snapshotId, label));
    }

    // Step 6 reads Convex back through the normal query path. The point is to
    // prove the UI/control plane would see the same state via Convex realtime.
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
          proofFile: result.proofFile,
        }),
      );
    }

    console.log("Tutorial complete: Vercel Sandbox + Codex SDK + Convex E2E works.");
  } finally {
    await stopSandboxes();
    await deleteSnapshots();
  }
}

// -----------------------------------------------------------------------------
// One forked sandbox run
// -----------------------------------------------------------------------------

async function runFork(
  convex: ConvexHttpClient,
  snapshotId: string,
  label: (typeof forkLabels)[number],
) {
  const externalRunId = `${tutorialId}-${label}`;
  const proofFile = `codex-sdk-proof-${label}.txt`;
  const prompt = [
    `Create a file named ${proofFile} in the current directory.`,
    `The file must contain JSON with ok=true, source="codex-sdk", and fork="${label}".`,
    "Return only JSON matching the requested schema.",
  ].join(" ");
  const runnerToken = randomBytes(32).toString("base64url");

  // Create the Convex run before the sandbox starts reporting. The runner token
  // is scoped to this one run; Convex stores only its hash.
  await convex.mutation(createRun, {
    externalRunId,
    prompt,
    runnerIngestTokenHash: sha256Hex(runnerToken),
  });

  console.log(`Step 5.${label === "fork-a" ? "1" : "2"}: Start ${label} from the snapshot.`);
  const sandbox = await createSandbox(label, snapshotId);
  sandboxesToStop.push(sandbox);
  await ingestHostEvent(externalRunId, {
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

  // The runner is detached so we can stream logs/events while it runs. It uses
  // the CODEX_API_KEY inherited from Sandbox.create({ env }) and gets only the
  // run-specific Convex token here.
  console.log(`Step 5.${label === "fork-a" ? "1" : "2"}: Run Codex SDK in ${label}.`);
  const command = await sandbox.runCommand({
    cmd: "node",
    args: ["tutorial-runner.mjs"],
    cwd: "/vercel/sandbox",
    detached: true,
    env: {
      DRIP_CODEX_PROMPT: prompt,
      DRIP_CONVEX_INGEST_URL: must(convexIngestUrl, "NEXT_PUBLIC_CONVEX_SITE_URL"),
      DRIP_EVENT_SEQUENCE_START: "100",
      DRIP_EXTERNAL_RUN_ID: externalRunId,
      DRIP_FORK_LABEL: label,
      DRIP_INGEST_TOKEN: runnerToken,
      DRIP_PROOF_FILE: proofFile,
    },
    timeoutMs: 300_000,
  });

  await ingestHostEvent(externalRunId, {
    sequence: 2,
    eventType: "sandbox.command_started",
    status: "runner_started",
    payload: {
      label,
      sandboxCommandId: command.cmdId,
      sandboxName: sandbox.name,
    },
    sandboxCommandId: command.cmdId,
    sandboxName: sandbox.name,
  });

  console.log(
    json({
      step: "fork.command_started",
      label,
      externalRunId,
      sandboxName: sandbox.name,
      commandId: command.cmdId,
    }),
  );

  for await (const log of command.logs()) {
    const stream = log.stream === "stderr" ? process.stderr : process.stdout;
    stream.write(log.data);
  }

  // If the Codex process fails, mark the Convex run failed before throwing.
  const result = await command.wait();
  if (result.exitCode !== 0) {
    await ingestHostEvent(externalRunId, {
      sequence: 900,
      eventType: "sandbox.command_failed",
      status: "failed",
      payload: { label, exitCode: result.exitCode },
      error: `Runner exited with ${result.exitCode}`,
      sandboxCommandId: command.cmdId,
      sandboxName: sandbox.name,
    });
    throw new Error(`${label} runner exited with ${result.exitCode}`);
  }

  // This file read is the filesystem proof. Codex wrote the file inside the
  // forked sandbox; the host reads it back through the Vercel Sandbox SDK.
  const proof = await sandbox.readFileToBuffer({
    path: proofFile,
    cwd: "/vercel/sandbox",
  });
  if (!proof) {
    await ingestHostEvent(externalRunId, {
      sequence: 900,
      eventType: "sandbox.proof_missing",
      status: "failed",
      payload: { label, proofFile },
      error: "Proof file missing after runner completed",
      sandboxCommandId: command.cmdId,
      sandboxName: sandbox.name,
    });
    throw new Error(`${label} did not write ${proofFile}`);
  }

  await ingestHostEvent(externalRunId, {
    sequence: 900,
    eventType: "sandbox.proof_read",
    status: "completed",
    payload: {
      label,
      proofFile,
      proofText: proof.toString("utf8"),
      bytes: proof.byteLength,
    },
    sandboxCommandId: command.cmdId,
    sandboxName: sandbox.name,
  });

  console.log(
    json({
      step: "fork.proof_read",
      label,
      externalRunId,
      proofFile,
      proofText: proof.toString("utf8"),
    }),
  );

  return {
    externalRunId,
    proofFile,
  };
}

// -----------------------------------------------------------------------------
// Vercel Sandbox setup helpers
// -----------------------------------------------------------------------------

async function createSandbox(label: string, snapshotId?: string) {
  const commonParams = {
    ...vercelCredentials(),
    env: {
      // Hobby/free-plan tutorial mode: put the disposable Codex key directly
      // into the Vercel Sandbox. Do not use a production or long-lived key here.
      CODEX_API_KEY: must(process.env.CODEX_API_KEY, "CODEX_API_KEY"),
      CODEX_MODEL: process.env.CODEX_MODEL ?? "",
      CODEX_REASONING_EFFORT: process.env.CODEX_REASONING_EFFORT ?? "low",
      DRIP_CODEX_INNER_SANDBOX_MODE: "danger-full-access",
    },
    name: process.env.DRIP_SANDBOX_NAME
      ? `${process.env.DRIP_SANDBOX_NAME}-${label}`
      : undefined,
    networkPolicy: networkPolicy(),
    resources: {
      vcpus: Number(process.env.DRIP_SANDBOX_VCPUS ?? "2"),
    },
    tags: {
      app: "drip",
      phase: "A",
      prototype: "codex-sdk-tutorial",
      role: label,
    },
    timeout: Number(process.env.DRIP_SANDBOX_TIMEOUT_MS ?? "600000"),
  };

  if (snapshotId) {
    // Snapshot restores inherit the runtime from the snapshot, so the SDK type
    // intentionally does not allow a separate runtime field here.
    return await Sandbox.create({
      ...commonParams,
      source: {
        type: "snapshot",
        snapshotId,
      },
    });
  }

  return await Sandbox.create({
    ...commonParams,
    runtime: process.env.DRIP_SANDBOX_RUNTIME ?? "node24",
  });
}

async function writeTutorialFiles(sandbox: VercelSandbox) {
  // These are the only files copied into the sandbox. Keeping them tiny makes
  // the prototype read like SDK documentation rather than app infrastructure.
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
// Command, Convex ingest, and cleanup helpers
// -----------------------------------------------------------------------------

async function runOrThrow(
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

async function ingestHostEvent(
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
  // Host events use the private ingest token from .env. Sandbox-runner events
  // use their own per-run token, checked by Convex against the stored hash.
  const response = await fetch(must(convexIngestUrl, "NEXT_PUBLIC_CONVEX_SITE_URL"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${must(
        convexIngestToken,
        "SANDBOX_PROTOTYPE_INGEST_TOKEN",
      )}`,
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

async function stopSandboxes() {
  for (const sandbox of sandboxesToStop.reverse()) {
    try {
      await sandbox.stop();
      console.log(json({ step: "sandbox.stopped", sandboxName: sandbox.name }));
    } catch (error) {
      console.error(
        json({
          step: "sandbox.stop_failed",
          sandboxName: sandbox.name,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}

async function deleteSnapshots() {
  for (const snapshot of snapshotsToDelete.reverse()) {
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
}

// -----------------------------------------------------------------------------
// Env and formatting helpers
// -----------------------------------------------------------------------------

function validateEnv() {
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
  if (!convexIngestToken) {
    missing.push("SANDBOX_PROTOTYPE_INGEST_TOKEN");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
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

function networkPolicy() {
  const allowed = new Set([
    "api.openai.com",
    "auth.openai.com",
    "chatgpt.com",
    "registry.npmjs.org",
    "*.npmjs.org",
    "*.convex.site",
    "*.convex.cloud",
  ]);

  if (convexIngestUrl) {
    allowed.add(new URL(convexIngestUrl).hostname);
  }

  return { allow: Array.from(allowed) };
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function must(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
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
    proofFile: { type: "string" },
    status: { type: "string", enum: ["ok", "blocked"] },
    summary: { type: "string" },
  },
  required: ["fork", "proofFile", "status", "summary"],
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
    model: process.env.CODEX_MODEL || undefined,
    modelReasoningEffort: process.env.CODEX_REASONING_EFFORT || "low",
    networkAccessEnabled: false,
    sandboxMode: process.env.DRIP_CODEX_INNER_SANDBOX_MODE || "danger-full-access",
    skipGitRepoCheck: true,
    webSearchMode: "disabled",
    workingDirectory: process.cwd(),
  });

  // The prompt asks Codex to write the proof file. Streaming events are forwarded
  // into Convex so the control plane can show progress in realtime.
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

  // The host separately reads the proof file back from the sandbox filesystem.
  // This event marks the SDK turn itself as complete.
  await emit("runner.completed", "completed", {
    codexThreadId,
    finalResponse,
    forkLabel,
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
