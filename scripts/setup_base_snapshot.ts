import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  chmod,
  lstat,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Sandbox, Snapshot } from "@vercel/sandbox";

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sandboxPayloadRoot = path.join(repoRoot, "sandbox");
const runnerSourceRoot = path.join(sandboxPayloadRoot, "runner");
const codexAgentSourceRoot = path.join(sandboxPayloadRoot, "codex-agent");
const sandboxRoot = "/vercel/sandbox";
const defaultRunnerCwd = "/vercel/sandbox/runner";
const defaultRunnerEntrypoint = "index.ts";
const defaultAgentWorkdir = "/vercel/sandbox/agent-workspace";
const privateEnvFile = ".env";
const privateEnvPath = path.join(repoRoot, privateEnvFile);
const setupCommand = "pnpm run setup:base-snapshot";
const proofFile = "phase-c-snapshot-proof.json";
const writeBatchBytes = 4 * 1024 * 1024;
const writeBatchFiles = 64;
let redactionValues: string[] = [];

type EnvMap = Record<string, string | undefined>;
type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
};
type VercelSandbox = Awaited<ReturnType<typeof Sandbox.create>>;
type VercelSnapshot = Awaited<ReturnType<VercelSandbox["snapshot"]>>;

type SetupConfig = {
  agentWorkdir: string;
  installTimeoutMs: number;
  packageManagerSpec: string;
  runnerCwd: string;
  runnerEntrypoint: string;
  sandboxRuntime: string;
  sandboxTimeoutMs: number;
  sandboxVcpus: number;
  vercelCredentials: {
    projectId: string;
    teamId: string;
    token?: string;
  };
};

class MissingEnvError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Missing required env: ${missing.join(", ")}`);
  }
}

main().catch((error) => {
  if (error instanceof MissingEnvError) {
    console.error("Snapshot setup blocked before sandbox creation.");
    console.error(`Missing env: ${error.missing.join(", ")}`);
    console.error(`First blocked command: ${setupCommand}`);
    console.error("Snapshot smoke status: blocked");
    process.exitCode = 1;
    return;
  }

  console.error(redactSensitiveText(errorMessage(error)));
  console.error("Snapshot smoke status: failed");
  process.exitCode = 1;
});

async function main() {
  const env = await readPrivateEnv();
  redactionValues = redactionValuesFromEnv(env);
  primeProcessEnvForSandboxAuth(env);

  const runnerPackageJson = await readRunnerPackageJson();
  const config = readConfig(env, runnerPackageJson);

  let baseSandbox: VercelSandbox | undefined;
  let forkSandbox: VercelSandbox | undefined;
  let snapshot: VercelSnapshot | undefined;
  let snapshotPromoted = false;
  let snapshotReferenced = false;
  const previousSnapshotId = env.BASE_SANDBOX_IMAGE;

  try {
    log("Checking private env target.");
    await assertPrivateEnvTarget();

    log("Checking sandbox runtime payload.");
    await assertSandboxPayload(config);

    log("Creating fresh Vercel Sandbox.");
    baseSandbox = await createSandbox(config, "base");

    log("Copying sandbox runtime payload.");
    await copySandboxPayload(baseSandbox, config);

    log("Installing runner dependencies in sandbox.");
    await preparePnpm(baseSandbox, config);
    await installRunnerDependencies(baseSandbox, config);
    await installSandboxNodeToolDependencies(baseSandbox, config);

    log("Installing sandbox Python tool dependencies.");
    await installSandboxPythonToolDependencies(baseSandbox, config);

    log("Running base image smoke.");
    await runBaseSmoke(baseSandbox, config);

    log("Creating non-expiring snapshot.");
    snapshot = await baseSandbox.snapshot({ expiration: 0 });

    log("Starting fork from snapshot.");
    forkSandbox = await createSandbox(config, "fork", snapshot);

    log("Running fork smoke.");
    await runForkSmoke(forkSandbox, config);
    await verifySandboxPythonToolDependencies(forkSandbox, config);
    await readAndVerifyProof(forkSandbox, config);

    log("Promoting base image env.");
    const promotion = await promoteBaseSandboxImage({
      config,
      onReferenced: () => {
        snapshotReferenced = true;
      },
      previousSnapshotId,
      snapshotId: snapshot.snapshotId,
    });
    snapshotPromoted = promotion.completed;
    snapshotReferenced = promotion.referenced;

    log(`Snapshot smoke status: passed; ${privateEnvFile} and Convex env updated.`);
  } finally {
    await deleteSandbox(forkSandbox);
    await deleteSandbox(baseSandbox);
    if (snapshot && !snapshotPromoted && !snapshotReferenced) {
      await deleteSnapshot(snapshot);
    }
  }
}

async function readPrivateEnv(): Promise<EnvMap> {
  const fileEnv = await readEnvFile(privateEnvPath);
  return {
    ...fileEnv,
    ...process.env,
  };
}

async function readEnvFile(filePath: string) {
  try {
    const text = await readFile(filePath, "utf8");
    return parseEnv(text);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function parseEnv(text: string) {
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
  return trimmed;
}

async function readRunnerPackageJson(): Promise<PackageJson> {
  return JSON.parse(
    await readFile(path.join(runnerSourceRoot, "package.json"), "utf8"),
  );
}

function readConfig(env: EnvMap, runnerPackageJson: PackageJson): SetupConfig {
  const hasVercelToken = Boolean(env.VERCEL_TOKEN);
  const hasOidcToken = Boolean(env.VERCEL_OIDC_TOKEN);
  const missing = [
    hasVercelToken || hasOidcToken ? null : "VERCEL_TOKEN or VERCEL_OIDC_TOKEN",
    env.VERCEL_TEAM_ID ? null : "VERCEL_TEAM_ID",
    env.VERCEL_PROJECT_ID ? null : "VERCEL_PROJECT_ID",
  ].filter((value): value is string => value !== null);

  if (missing.length > 0) {
    throw new MissingEnvError(missing);
  }

  const packageManagerSpec = runnerPackageJson.packageManager;
  if (!packageManagerSpec?.startsWith("pnpm@")) {
    throw new Error("sandbox/runner/package.json must declare a pnpm packageManager.");
  }

  assertRunnerDependencies(runnerPackageJson);

  return {
    agentWorkdir: sandboxPathEnv(
      env,
      "DRIP_SANDBOX_AGENT_WORKDIR",
      defaultAgentWorkdir,
    ),
    installTimeoutMs: numberEnv(env, "DRIP_SANDBOX_INSTALL_TIMEOUT_MS", 600_000),
    packageManagerSpec,
    runnerCwd: sandboxPathEnv(env, "DRIP_SANDBOX_RUNNER_CWD", defaultRunnerCwd),
    runnerEntrypoint: runnerEntrypointEnv(env),
    sandboxRuntime: env.DRIP_SANDBOX_RUNTIME ?? "node24",
    sandboxTimeoutMs: numberEnv(env, "DRIP_SANDBOX_TIMEOUT_MS", 30 * 60 * 1000),
    sandboxVcpus: numberEnv(env, "DRIP_SANDBOX_VCPUS", 2),
    vercelCredentials: {
      projectId: env.VERCEL_PROJECT_ID!,
      teamId: env.VERCEL_TEAM_ID!,
      ...(env.VERCEL_TOKEN ? { token: env.VERCEL_TOKEN } : {}),
    },
  };
}

function primeProcessEnvForSandboxAuth(env: EnvMap) {
  for (const name of [
    "VERCEL_OIDC_TOKEN",
    "VERCEL_PROJECT_ID",
    "VERCEL_TEAM_ID",
  ]) {
    const value = env[name];
    if (!process.env[name] && value) {
      process.env[name] = value;
    }
  }
}

function assertRunnerDependencies(packageJson: PackageJson) {
  const deps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };
  for (const name of [
    "@openai/codex-sdk",
    "agent-browser",
    "convex",
    "tsx",
    "vercel",
  ]) {
    if (!deps[name]) {
      throw new Error(`sandbox/runner/package.json must include ${name}.`);
    }
  }
}

function sandboxPathEnv(env: EnvMap, name: string, fallback: string) {
  const value = env[name] ?? fallback;
  assertSandboxAbsolutePath(name, value);
  return value.replace(/\/+$/, "");
}

function runnerEntrypointEnv(env: EnvMap) {
  const value = env.DRIP_SANDBOX_RUNNER_ENTRYPOINT ?? defaultRunnerEntrypoint;
  if (value.startsWith("/") || value.includes("..") || value.trim() === "") {
    throw new Error("DRIP_SANDBOX_RUNNER_ENTRYPOINT must be a relative file path.");
  }
  return toPosixPath(value);
}

function assertSandboxAbsolutePath(name: string, value: string) {
  if (
    !value.startsWith(`${sandboxRoot}/`) ||
    value.includes("..") ||
    value.includes("\0")
  ) {
    throw new Error(`${name} must be an absolute path under ${sandboxRoot}.`);
  }
}

async function assertPrivateEnvTarget() {
  const ignored = await hostCommandOk("git", [
    "check-ignore",
    "--quiet",
    privateEnvFile,
  ]);
  if (!ignored) {
    throw new Error(`${privateEnvFile} must be ignored by git before updating it.`);
  }

  try {
    const stat = await lstat(privateEnvPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`${privateEnvFile} must not be a symlink.`);
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function assertSandboxPayload(config: SetupConfig) {
  for (const relativePath of [
    "runner/index.ts",
    "runner/config.ts",
    "runner/codex.ts",
    "runner/convex.ts",
    "runner/types.ts",
    "runner/package.json",
    "runner/pnpm-lock.yaml",
    "runner/pnpm-workspace.yaml",
    "codex-agent/.codex/config.toml",
    "codex-agent/.codex/agents/sandbox-verifier.toml",
    "codex-agent/.codex/agents/x-researcher.toml",
    "codex-agent/.codex/agents/exa-researcher.toml",
    "codex-agent/.codex/agents/cap-designer.toml",
    "codex-agent/.codex/agents/sock-designer.toml",
    "codex-agent/.codex/agents/apparel-designer.toml",
    "codex-agent/.codex/agents/fashion-reviewer.toml",
    "codex-agent/.codex/agents/drop-site-builder.toml",
    "codex-agent/.codex/agents/drop-site-reviewer.toml",
    "codex-agent/.codex/agents/drop-site-deployer.toml",
    "codex-agent/.codex/agents/facebook-ad-copywriter.toml",
    "codex-agent/.codex/agents/facebook-ad-operator.toml",
    "codex-agent/.codex/skills/.system/imagegen/SKILL.md",
    "codex-agent/.codex/skills/.system/imagegen/scripts/image_gen.py",
    "codex-agent/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py",
    "codex-agent/.agents/skills/agent-browser/SKILL.md",
    "codex-agent/.agents/skills/builder/SKILL.md",
    "codex-agent/.agents/skills/frontend-skill/SKILL.md",
    "codex-agent/.agents/skills/scout/SKILL.md",
    "codex-agent/.agents/skills/fashion-designer/SKILL.md",
    "codex-agent/.agents/skills/meta-ads-cli/SKILL.md",
    "codex-agent/.agents/skills/performance-marketer/SKILL.md",
    "codex-agent/.agents/skills/x-trends/SKILL.md",
    "codex-agent/.agents/skills/exa-search/SKILL.md",
  ]) {
    const stat = await lstat(path.join(sandboxPayloadRoot, relativePath));
    if (!stat.isFile()) {
      throw new Error(`Sandbox runtime payload is missing ${relativePath}.`);
    }
  }

  if (config.runnerCwd === config.agentWorkdir) {
    throw new Error("Runner cwd and agent workspace must be separate directories.");
  }
}

async function createSandbox(
  config: SetupConfig,
  role: "base" | "fork",
  snapshot?: VercelSnapshot,
) {
  const common = {
    ...config.vercelCredentials,
    resources: {
      vcpus: config.sandboxVcpus,
    },
    tags: {
      app: "drip",
      phase: "C",
      role,
    },
    timeout: config.sandboxTimeoutMs,
  };

  if (snapshot) {
    return await Sandbox.create({
      ...common,
      source: {
        type: "snapshot",
        snapshotId: snapshot.snapshotId,
      },
    });
  }

  return await Sandbox.create({
    ...common,
    runtime: config.sandboxRuntime,
  });
}

async function copySandboxPayload(sandbox: VercelSandbox, config: SetupConfig) {
  const files = await listSandboxPayloadFiles(config);
  let batch: { content: Buffer; path: string }[] = [];
  let batchBytes = 0;

  for (const file of files) {
    const content = await readFile(file.sourcePath);
    batch.push({
      content,
      path: file.sandboxPath,
    });
    batchBytes += content.byteLength;

    if (batch.length >= writeBatchFiles || batchBytes >= writeBatchBytes) {
      await sandbox.writeFiles(batch);
      batch = [];
      batchBytes = 0;
    }
  }

  if (batch.length > 0) {
    await sandbox.writeFiles(batch);
  }
}

async function listSandboxPayloadFiles(config: SetupConfig) {
  const files: Array<{ sandboxPath: string; sourcePath: string }> = [];
  await collectPayloadFiles({
    files,
    sandboxDestinationRoot: relativeSandboxPath(config.runnerCwd),
    sourceRoot: runnerSourceRoot,
  });
  await collectPayloadFiles({
    files,
    sandboxDestinationRoot: relativeSandboxPath(config.agentWorkdir),
    sourceRoot: codexAgentSourceRoot,
  });
  return files.sort((a, b) => a.sandboxPath.localeCompare(b.sandboxPath));
}

async function collectPayloadFiles({
  absoluteDirectory,
  files,
  relativeDirectory = "",
  sandboxDestinationRoot,
  sourceRoot,
}: {
  absoluteDirectory?: string;
  files: Array<{ sandboxPath: string; sourcePath: string }>;
  relativeDirectory?: string;
  sandboxDestinationRoot: string;
  sourceRoot: string;
}) {
  absoluteDirectory ??= path.join(sourceRoot, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    const absolutePath = path.join(sourceRoot, relativePath);
    assertSafePayloadPath(relativePath);

    if (entry.isDirectory()) {
      await collectPayloadFiles({
        absoluteDirectory: absolutePath,
        files,
        relativeDirectory: relativePath,
        sandboxDestinationRoot,
        sourceRoot,
      });
      continue;
    }

    if (entry.isFile()) {
      files.push({
        sandboxPath: path.posix.join(
          sandboxDestinationRoot,
          toPosixPath(relativePath),
        ),
        sourcePath: absolutePath,
      });
    }
  }
}

function assertSafePayloadPath(relativePath: string) {
  const posixPath = toPosixPath(relativePath);
  if (posixPath.includes("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Refusing to copy unexpected payload path: ${relativePath}`);
  }

  const privatePath =
    posixPath === ".env" ||
    posixPath.startsWith(".env.") ||
    posixPath.startsWith(".codex/secrets") ||
    posixPath.includes("/.env") ||
    posixPath === "node_modules" ||
    posixPath.startsWith("node_modules/") ||
    posixPath.includes("/node_modules/") ||
    posixPath === ".git" ||
    posixPath.startsWith(".git/") ||
    posixPath.includes("/.git/") ||
    posixPath === ".next" ||
    posixPath.startsWith(".next/") ||
    posixPath.includes("/.next/") ||
    posixPath === "build" ||
    posixPath.startsWith("build/") ||
    posixPath.includes("/build/") ||
    posixPath === "docs" ||
    posixPath.startsWith("docs/") ||
    posixPath.includes("/docs/") ||
    posixPath === "out" ||
    posixPath.startsWith("out/") ||
    posixPath.includes("/out/");

  if (privatePath) {
    throw new Error(`Refusing to copy private or generated payload path: ${relativePath}`);
  }
}

function toPosixPath(value: string) {
  return value.split(path.sep).join(path.posix.sep);
}

function relativeSandboxPath(absolutePath: string) {
  assertSandboxAbsolutePath("sandbox payload destination", absolutePath);
  return absolutePath.slice(`${sandboxRoot}/`.length);
}

async function preparePnpm(sandbox: VercelSandbox, config: SetupConfig) {
  await runSandboxCommand(sandbox, "corepack enable", {
    cmd: "corepack",
    args: ["enable"],
    cwd: config.runnerCwd,
    timeoutMs: 60_000,
  });
  await runSandboxCommand(sandbox, "corepack prepare pnpm", {
    cmd: "corepack",
    args: ["prepare", config.packageManagerSpec, "--activate"],
    cwd: config.runnerCwd,
    timeoutMs: 120_000,
  });
}

async function installRunnerDependencies(
  sandbox: VercelSandbox,
  config: SetupConfig,
) {
  await runSandboxCommand(sandbox, "pnpm install runner dependencies", {
    cmd: "pnpm",
    args: ["install", "--frozen-lockfile", "--prod"],
    cwd: config.runnerCwd,
    env: {
      CI: "1",
    },
    timeoutMs: config.installTimeoutMs,
  });
}

async function installSandboxNodeToolDependencies(
  sandbox: VercelSandbox,
  config: SetupConfig,
) {
  await runSandboxCommand(sandbox, "install agent-browser browser dependency", {
    cmd: "pnpm",
    args: ["exec", "agent-browser", "install", "--with-deps"],
    cwd: config.runnerCwd,
    timeoutMs: 300_000,
  });

  await verifySandboxNodeToolDependencies(sandbox, config);
}

async function verifySandboxNodeToolDependencies(
  sandbox: VercelSandbox,
  config: SetupConfig,
) {
  const cliResult = await runSandboxCommand(sandbox, "verify sandbox node tools", {
    cmd: "pnpm",
    args: [
      "exec",
      "node",
      "-e",
      [
        "const { execFileSync } = require('node:child_process')",
        "const vercel = execFileSync('pnpm', ['exec', 'vercel', '--version'], { encoding: 'utf8' })",
        "const browser = execFileSync('pnpm', ['exec', 'agent-browser', '--version'], { encoding: 'utf8' })",
        "if (!/(?:Vercel CLI|\\d+\\.\\d+\\.\\d+)/.test(vercel)) throw new Error('vercel cli missing')",
        "if (!/agent-browser/.test(browser)) throw new Error('agent-browser cli missing')",
        "console.log('sandbox-node-tools-ok')",
      ].join("; "),
    ],
    cwd: config.runnerCwd,
    timeoutMs: 60_000,
  });
  if (!cliResult.stdout.includes("sandbox-node-tools-ok")) {
    throw new Error("Sandbox node tool smoke did not report success.");
  }
}

async function installSandboxPythonToolDependencies(
  sandbox: VercelSandbox,
  config: SetupConfig,
) {
  await runSandboxCommand(sandbox, "python ensurepip for sandbox tools", {
    cmd: "python3",
    args: ["-m", "ensurepip", "--user"],
    cwd: config.agentWorkdir,
    timeoutMs: 120_000,
  });

  await runSandboxCommand(sandbox, "install sandbox python tool dependencies", {
    cmd: "python3",
    args: ["-m", "pip", "install", "--user", "openai", "pillow", "requests", "uv"],
    cwd: config.agentWorkdir,
    timeoutMs: 300_000,
  });

  await runSandboxCommand(sandbox, "install meta ads cli", {
    cmd: "python3",
    args: [
      "-c",
      [
        "import os, subprocess",
        "local_bin = os.path.expanduser('~/.local/bin')",
        "uv = os.path.join(local_bin, 'uv')",
        "subprocess.run([uv, 'tool', 'install', '--python', '3.12', 'meta-ads'], check=True)",
      ].join("; "),
    ],
    cwd: config.agentWorkdir,
    timeoutMs: 300_000,
  });

  await verifySandboxPythonToolDependencies(sandbox, config);
}

async function verifySandboxPythonToolDependencies(
  sandbox: VercelSandbox,
  config: SetupConfig,
) {
  const importResult = await runSandboxCommand(
    sandbox,
    "verify sandbox python tool imports",
    {
      cmd: "python3",
      args: [
        "-c",
        "import openai; import PIL; import requests; print('sandbox-python-tool-imports-ok')",
      ],
      cwd: config.agentWorkdir,
      timeoutMs: 60_000,
    },
  );
  if (!importResult.stdout.includes("sandbox-python-tool-imports-ok")) {
    throw new Error("Sandbox Python tool import smoke did not report success.");
  }

  const cliResult = await runSandboxCommand(
    sandbox,
    "verify meta ads cli",
    {
      cmd: "python3",
      args: [
        "-c",
        [
          "import os, shutil, subprocess",
          "local_bin = os.path.expanduser('~/.local/bin')",
          "os.environ['PATH'] = local_bin + os.pathsep + os.environ.get('PATH', '')",
          "assert shutil.which('meta'), 'meta cli not found'",
          "subprocess.run(['meta', '--version'], check=True)",
          "print('meta-ads-cli-ok')",
        ].join("; "),
      ],
      cwd: config.agentWorkdir,
      timeoutMs: 60_000,
    },
  );
  if (!cliResult.stdout.includes("meta-ads-cli-ok")) {
    throw new Error("Meta Ads CLI smoke did not report success.");
  }
}

async function runBaseSmoke(sandbox: VercelSandbox, config: SetupConfig) {
  const result = await runSandboxCommand(sandbox, "base smoke", {
    cmd: "node",
    args: ["--import", "tsx", "--eval", baseSmokeSource],
    cwd: config.runnerCwd,
    env: smokeEnv(config),
    timeoutMs: 120_000,
  });
  if (!result.stdout.includes("base-smoke-ok")) {
    throw new Error("Base smoke did not report success.");
  }
}

async function runForkSmoke(sandbox: VercelSandbox, config: SetupConfig) {
  const result = await runSandboxCommand(sandbox, "fork smoke", {
    cmd: "node",
    args: ["--import", "tsx", "--eval", forkSmokeSource],
    cwd: config.runnerCwd,
    env: smokeEnv(config),
    timeoutMs: 120_000,
  });
  if (!result.stdout.includes("fork-smoke-ok")) {
    throw new Error("Fork smoke did not report success.");
  }
}

function smokeEnv(config: SetupConfig) {
  return {
    DRIP_SANDBOX_AGENT_WORKDIR: config.agentWorkdir,
    DRIP_SANDBOX_RUNNER_ENTRYPOINT: config.runnerEntrypoint,
  };
}

async function readAndVerifyProof(sandbox: VercelSandbox, config: SetupConfig) {
  const content = await sandbox.readFileToBuffer({
    path: proofFile,
    cwd: config.agentWorkdir,
  });
  if (!content) {
    throw new Error("Fork smoke proof file was not readable.");
  }

  const proof = JSON.parse(content.toString("utf8")) as unknown;
  if (!isRecord(proof) || proof.ok !== true || proof.runtime !== "sandbox-runtime") {
    throw new Error("Fork smoke proof file failed validation.");
  }
}

async function updateBaseSandboxImage(snapshotId: string) {
  const eol = "\n";
  let text = "";
  try {
    text = await readFile(privateEnvPath, "utf8");
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  const lines = text ? text.split(/\r?\n/) : [];
  let replaced = false;
  const updated = lines.map((line) => {
    if (/^\s*BASE_SANDBOX_IMAGE\s*=/.test(line)) {
      replaced = true;
      return `BASE_SANDBOX_IMAGE=${snapshotId}`;
    }
    return line;
  });

  if (!replaced) {
    if (updated.length > 0 && updated[updated.length - 1] !== "") {
      updated.push("");
    }
    updated.push("# Updated by pnpm run setup:base-snapshot.");
    updated.push(`BASE_SANDBOX_IMAGE=${snapshotId}`);
  }

  await writeFile(privateEnvPath, `${updated.join(eol).replace(/\n+$/, "")}${eol}`, {
    mode: 0o600,
  });
  await chmod(privateEnvPath, 0o600).catch(() => undefined);
}

async function promoteBaseSandboxImage({
  config,
  onReferenced,
  previousSnapshotId,
  snapshotId,
}: {
  config: SetupConfig;
  onReferenced: () => void;
  previousSnapshotId: string | undefined;
  snapshotId: string;
}) {
  let referenced = false;

  await syncConvexBaseSandboxImage("selected Convex deployment", [], snapshotId);
  referenced = true;
  onReferenced();

  await syncConvexBaseSandboxImage(
    "production Convex deployment",
    ["--prod"],
    snapshotId,
    cleanProdEnv(),
  );

  await updateBaseSandboxImage(snapshotId);
  referenced = true;
  onReferenced();

  await deletePreviousBaseSnapshot(previousSnapshotId, snapshotId, config);

  return {
    completed: true,
    referenced,
  };
}

async function syncConvexBaseSandboxImage(
  label: string,
  options: string[],
  snapshotId: string,
  env?: NodeJS.ProcessEnv,
) {
  log(`Syncing ${label} BASE_SANDBOX_IMAGE.`);
  await hostCommand(
    "pnpm",
    ["exec", "convex", "env", "set", ...options, "BASE_SANDBOX_IMAGE", snapshotId],
    env,
  );
}

function cleanProdEnv() {
  const env = { ...process.env };
  delete env.CONVEX_DEPLOYMENT;
  delete env.NEXT_PUBLIC_CONVEX_URL;
  delete env.NEXT_PUBLIC_CONVEX_SITE_URL;
  return env;
}

async function runSandboxCommand(
  sandbox: VercelSandbox,
  label: string,
  command: Parameters<VercelSandbox["runCommand"]>[0],
) {
  const result = await sandbox.runCommand(command);
  const [stdout, stderr] = await Promise.all([
    result.stdout(),
    result.stderr(),
  ]);

  if (result.exitCode !== 0) {
    const output = redactSensitiveText([stderr, stdout].filter(Boolean).join("\n"));
    const suffix = output ? ` Sanitized output: ${output.slice(0, 2000)}` : "";
    throw new Error(`${label} failed with exit ${result.exitCode}.${suffix}`);
  }

  return {
    stderr,
    stdout,
  };
}

async function deleteSandbox(sandbox: VercelSandbox | undefined) {
  if (!sandbox) {
    return;
  }

  try {
    await sandbox.delete();
    return;
  } catch {
    await sandbox.stop().catch(() => undefined);
  }

  await sandbox.delete().catch((error) => {
    log(`Temporary sandbox cleanup skipped: ${redactSensitiveText(errorMessage(error))}`);
  });
}

async function deleteSnapshot(snapshot: VercelSnapshot) {
  await snapshot.delete().catch(() => undefined);
}

async function deletePreviousBaseSnapshot(
  previousSnapshotId: string | undefined,
  nextSnapshotId: string,
  config: SetupConfig,
) {
  if (!previousSnapshotId || previousSnapshotId === nextSnapshotId) {
    return;
  }

  log("Deleting previous base image snapshot.");
  try {
    const previous = await Snapshot.get({
      snapshotId: previousSnapshotId,
      ...config.vercelCredentials,
    });
    await previous.delete();
  } catch (error) {
    log(`Previous snapshot cleanup skipped: ${redactSensitiveText(errorMessage(error))}`);
  }
}

async function hostCommand(
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
) {
  const result = await execFileAsync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    stderr: String(result.stderr),
    stdout: String(result.stdout),
  };
}

async function hostCommandOk(command: string, args: string[]) {
  try {
    await hostCommand(command, args);
    return true;
  } catch {
    return false;
  }
}

function numberEnv(env: EnvMap, name: string, fallback: number) {
  const raw = env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return parsed;
}

function log(message: string) {
  console.log(message);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function redactSensitiveText(text: string) {
  let redacted = text;
  for (const value of redactionValues) {
    redacted = redacted.split(value).join("[redacted]");
  }

  return redacted
    .replace(/\b(?:snap|sbx|cmd|prj|team)_[A-Za-z0-9_-]+\b/g, "[redacted-id]")
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[redacted-key]")
    .replace(/https?:\/\/[^\s"')]+/g, "[redacted-url]");
}

function redactionValuesFromEnv(env: EnvMap) {
  return [
    env.BASE_SANDBOX_IMAGE,
    env.CODEX_API_KEY,
    env.CONVEX_DEPLOY_KEY,
    env.OPENAI_API_KEY,
    env.META_ADS_ACCESS_TOKEN,
    env.META_ADS_AD_ACCOUNT_ID,
    env.META_ADS_BUSINESS_ID,
    env.VERCEL_OIDC_TOKEN,
    env.VERCEL_PROJECT_ID,
    env.VERCEL_TEAM_ID,
    env.VERCEL_DEPLOY_TOKEN,
    env.VERCEL_TOKEN,
  ].filter((value): value is string => Boolean(value));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const baseSmokeSource = String.raw`
const { access, readFile } = require("node:fs/promises");
const path = require("node:path");

const agentWorkdir = process.env.DRIP_SANDBOX_AGENT_WORKDIR;
const runnerEntrypoint = process.env.DRIP_SANDBOX_RUNNER_ENTRYPOINT;
if (!agentWorkdir || !runnerEntrypoint) {
  throw new Error("Smoke env is missing runner or agent workspace paths.");
}

async function assertFile(filePath) {
  await access(filePath);
}

async function assertMissing(filePath) {
  try {
    await access(filePath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  throw new Error("Unexpected copied path: " + filePath);
}

async function main() {
  for (const file of [
    runnerEntrypoint,
    "config.ts",
    "codex.ts",
    "convex.ts",
    "types.ts",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
  ]) {
    await assertFile(file);
  }

  for (const file of [
    ".codex/config.toml",
    ".codex/agents/sandbox-verifier.toml",
    ".codex/agents/x-researcher.toml",
    ".codex/agents/exa-researcher.toml",
    ".codex/agents/cap-designer.toml",
    ".codex/agents/sock-designer.toml",
    ".codex/agents/apparel-designer.toml",
    ".codex/agents/fashion-reviewer.toml",
    ".codex/agents/drop-site-builder.toml",
    ".codex/agents/drop-site-reviewer.toml",
    ".codex/agents/drop-site-deployer.toml",
    ".codex/agents/facebook-ad-copywriter.toml",
    ".codex/agents/facebook-ad-operator.toml",
    ".codex/skills/.system/imagegen/SKILL.md",
    ".codex/skills/.system/imagegen/scripts/image_gen.py",
    ".codex/skills/.system/imagegen/scripts/remove_chroma_key.py",
    ".agents/skills/agent-browser/SKILL.md",
    ".agents/skills/builder/SKILL.md",
    ".agents/skills/frontend-skill/SKILL.md",
    ".agents/skills/scout/SKILL.md",
    ".agents/skills/fashion-designer/SKILL.md",
    ".agents/skills/meta-ads-cli/SKILL.md",
    ".agents/skills/performance-marketer/SKILL.md",
    ".agents/skills/x-trends/SKILL.md",
    ".agents/skills/exa-search/SKILL.md",
  ]) {
    await assertFile(path.join(agentWorkdir, file));
  }

  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  for (const name of ["@openai/codex-sdk", "agent-browser", "convex", "tsx", "vercel"]) {
    if (!deps[name]) {
      throw new Error("Runner dependency is missing: " + name);
    }
  }

  await import("@openai/codex-sdk");
  await import("./config.ts");
  await import("./codex.ts");
  await import("./convex.ts");
  await import("./types.ts");

  const config = await readFile(path.join(agentWorkdir, ".codex/config.toml"), "utf8");
  if (
    !config.includes('model = "gpt-5.5"') ||
    !config.includes('service_tier = "fast"') ||
    !config.includes(agentWorkdir) ||
    !config.includes("x-researcher") ||
    !config.includes("exa-researcher") ||
    !config.includes("cap-designer") ||
    !config.includes("sock-designer") ||
    !config.includes("apparel-designer") ||
    !config.includes("fashion-reviewer") ||
    !config.includes("drop-site-builder") ||
    !config.includes("drop-site-reviewer") ||
    !config.includes("drop-site-deployer") ||
    !config.includes("facebook-ad-copywriter") ||
    !config.includes("facebook-ad-operator")
  ) {
    throw new Error("Codex config is missing expected defaults.");
  }

  await assertMissing("/vercel/sandbox/src");
  await assertMissing("/vercel/sandbox/package.json");
  await assertMissing("/vercel/sandbox/pnpm-lock.yaml");
  await assertMissing("/vercel/sandbox/docs");
  await assertMissing("/vercel/sandbox/.env");
  await assertMissing("/vercel/sandbox/.vercel");
  await assertMissing("/vercel/sandbox/.convex");
  await assertMissing("/vercel/sandbox/.next");
  await assertMissing(path.join(agentWorkdir, "src"));
  await assertMissing(path.join(agentWorkdir, "package.json"));
  await assertMissing(path.join(agentWorkdir, "pnpm-lock.yaml"));
  await assertMissing(path.join(agentWorkdir, "docs"));

  console.log("base-smoke-ok");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
`;

const forkSmokeSource = String.raw`
const { access, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const agentWorkdir = process.env.DRIP_SANDBOX_AGENT_WORKDIR;
const runnerEntrypoint = process.env.DRIP_SANDBOX_RUNNER_ENTRYPOINT;
if (!agentWorkdir || !runnerEntrypoint) {
  throw new Error("Smoke env is missing runner or agent workspace paths.");
}

async function main() {
  for (const file of [
    runnerEntrypoint,
    "config.ts",
    "codex.ts",
    "convex.ts",
    "types.ts",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
  ]) {
    await access(file);
  }

  for (const file of [
    ".codex/config.toml",
    ".codex/agents/sandbox-verifier.toml",
    ".codex/agents/x-researcher.toml",
    ".codex/agents/exa-researcher.toml",
    ".codex/agents/cap-designer.toml",
    ".codex/agents/sock-designer.toml",
    ".codex/agents/apparel-designer.toml",
    ".codex/agents/fashion-reviewer.toml",
    ".codex/agents/drop-site-builder.toml",
    ".codex/agents/drop-site-reviewer.toml",
    ".codex/agents/drop-site-deployer.toml",
    ".codex/agents/facebook-ad-copywriter.toml",
    ".codex/agents/facebook-ad-operator.toml",
    ".codex/skills/.system/imagegen/SKILL.md",
    ".codex/skills/.system/imagegen/scripts/image_gen.py",
    ".codex/skills/.system/imagegen/scripts/remove_chroma_key.py",
    ".agents/skills/agent-browser/SKILL.md",
    ".agents/skills/builder/SKILL.md",
    ".agents/skills/frontend-skill/SKILL.md",
    ".agents/skills/scout/SKILL.md",
    ".agents/skills/fashion-designer/SKILL.md",
    ".agents/skills/meta-ads-cli/SKILL.md",
    ".agents/skills/performance-marketer/SKILL.md",
    ".agents/skills/x-trends/SKILL.md",
    ".agents/skills/exa-search/SKILL.md",
  ]) {
    await access(path.join(agentWorkdir, file));
  }

  await import("@openai/codex-sdk");
  await import("./config.ts");

  for (const file of [
    "/vercel/sandbox/src",
    "/vercel/sandbox/package.json",
    "/vercel/sandbox/pnpm-lock.yaml",
    "/vercel/sandbox/docs",
    "/vercel/sandbox/.env",
    "/vercel/sandbox/.vercel",
    "/vercel/sandbox/.convex",
    "/vercel/sandbox/.next",
    path.join(agentWorkdir, "src"),
    path.join(agentWorkdir, "package.json"),
    path.join(agentWorkdir, "pnpm-lock.yaml"),
    path.join(agentWorkdir, "docs"),
  ]) {
    try {
      await access(file);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
    throw new Error("Unexpected copied path: " + file);
  }

  const proof = {
    ok: true,
    runtime: "sandbox-runtime",
    config: ".codex/config.toml",
    runner: runnerEntrypoint,
    skill: ".agents/skills/scout/SKILL.md",
    workdir: agentWorkdir
  };

  const proofPath = path.join(agentWorkdir, "${proofFile}");
  await writeFile(proofPath, JSON.stringify(proof), "utf8");
  const stored = JSON.parse(await readFile(proofPath, "utf8"));
  if (stored.ok !== true || stored.runtime !== "sandbox-runtime") {
    throw new Error("Fork proof mismatch.");
  }

  console.log("fork-smoke-ok");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
`;
