import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  chmod,
  lstat,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Sandbox } from "@vercel/sandbox";

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sandboxRoot = "/vercel/sandbox";
const privateEnvFile = ".env.local";
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
  installTimeoutMs: number;
  packageManagerSpec: string;
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

  const packageJson = await readPackageJson();
  const config = readConfig(env, packageJson);
  assertSnapshotDependencies(packageJson);

  let baseSandbox: VercelSandbox | undefined;
  let forkSandbox: VercelSandbox | undefined;
  let snapshot: VercelSnapshot | undefined;
  let snapshotPromoted = false;

  try {
    log("Checking private env target.");
    await assertPrivateEnvTarget();

    log("Creating fresh Vercel Sandbox.");
    baseSandbox = await createSandbox(config, "base");

    log("Copying git-listed repo files.");
    await copyRepoFiles(baseSandbox);

    log("Installing pnpm dependencies in sandbox.");
    await preparePnpm(baseSandbox, config);
    await installDependencies(baseSandbox, config);

    log("Running base image smoke.");
    await runBaseSmoke(baseSandbox);

    log("Creating non-expiring snapshot.");
    snapshot = await baseSandbox.snapshot({ expiration: 0 });

    log("Starting fork from snapshot.");
    forkSandbox = await createSandbox(config, "fork", snapshot);

    log("Running fork smoke.");
    await runForkSmoke(forkSandbox);
    await readAndVerifyProof(forkSandbox);

    log("Updating private base image env.");
    await updateBaseSandboxImage(snapshot.snapshotId);
    snapshotPromoted = true;

    log(`Snapshot smoke status: passed; ${privateEnvFile} updated.`);
  } finally {
    await stopSandbox(forkSandbox);
    await stopSandbox(baseSandbox);
    if (snapshot && !snapshotPromoted) {
      await deleteSnapshot(snapshot);
    }
  }
}

async function readPrivateEnv(): Promise<EnvMap> {
  const fileEnv: Record<string, string> = {};
  for (const name of [".env", ".env.production.local", ".env.local"]) {
    Object.assign(fileEnv, await readEnvFile(path.join(repoRoot, name)));
  }

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

async function readPackageJson(): Promise<PackageJson> {
  return JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
}

function readConfig(env: EnvMap, packageJson: PackageJson): SetupConfig {
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

  const packageManagerSpec = packageJson.packageManager;
  if (!packageManagerSpec?.startsWith("pnpm@")) {
    throw new Error("package.json must declare a pnpm packageManager.");
  }

  return {
    installTimeoutMs: numberEnv(env, "DRIP_SANDBOX_INSTALL_TIMEOUT_MS", 600_000),
    packageManagerSpec,
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

function assertSnapshotDependencies(packageJson: PackageJson) {
  const deps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };
  for (const name of ["@openai/codex-sdk", "tsx"]) {
    if (!deps[name]) {
      throw new Error(`package.json must include ${name} for snapshot mode.`);
    }
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

async function copyRepoFiles(sandbox: VercelSandbox) {
  const files = await gitListedFiles();
  let batch: { content: Buffer; mode?: number; path: string }[] = [];
  let batchBytes = 0;

  for (const file of files) {
    const absolutePath = path.join(repoRoot, file);
    const stat = await lstat(absolutePath);
    if (!stat.isFile()) {
      continue;
    }

    const content = await readFile(absolutePath);
    batch.push({
      content,
      path: file,
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

async function gitListedFiles() {
  const { stdout } = await hostCommand("git", [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  return stdout
    .split("\0")
    .filter(Boolean)
    .map(assertSafeGitListedFile)
    .sort();
}

function assertSafeGitListedFile(file: string) {
  const privatePath =
    file === ".env" ||
    (file.startsWith(".env.") && file !== ".env.example") ||
    file.startsWith(".convex/") ||
    file.startsWith(".git/") ||
    file.startsWith(".next/") ||
    file.startsWith(".pnpm-store/") ||
    file.startsWith(".vercel/") ||
    file.startsWith("build/") ||
    file.startsWith("node_modules/") ||
    file.startsWith("out/");

  if (privatePath) {
    throw new Error(`Refusing to copy private or generated path: ${file}`);
  }

  return file;
}

async function preparePnpm(sandbox: VercelSandbox, config: SetupConfig) {
  await runSandboxCommand(sandbox, "corepack enable", {
    cmd: "corepack",
    args: ["enable"],
    cwd: sandboxRoot,
    timeoutMs: 60_000,
  });
  await runSandboxCommand(sandbox, "corepack prepare pnpm", {
    cmd: "corepack",
    args: ["prepare", config.packageManagerSpec, "--activate"],
    cwd: sandboxRoot,
    timeoutMs: 120_000,
  });
}

async function installDependencies(sandbox: VercelSandbox, config: SetupConfig) {
  await runSandboxCommand(sandbox, "pnpm install", {
    cmd: "pnpm",
    args: ["install", "--frozen-lockfile"],
    cwd: sandboxRoot,
    env: {
      CI: "1",
    },
    timeoutMs: config.installTimeoutMs,
  });
}

async function runBaseSmoke(sandbox: VercelSandbox) {
  const result = await runSandboxCommand(sandbox, "base smoke", {
    cmd: "node",
    args: ["--import", "tsx", "--eval", baseSmokeSource],
    cwd: sandboxRoot,
    timeoutMs: 120_000,
  });
  if (!result.stdout.includes("base-smoke-ok")) {
    throw new Error("Base smoke did not report success.");
  }
}

async function runForkSmoke(sandbox: VercelSandbox) {
  const result = await runSandboxCommand(sandbox, "fork smoke", {
    cmd: "node",
    args: ["--import", "tsx", "--eval", forkSmokeSource],
    cwd: sandboxRoot,
    timeoutMs: 120_000,
  });
  if (!result.stdout.includes("fork-smoke-ok")) {
    throw new Error("Fork smoke did not report success.");
  }
}

async function readAndVerifyProof(sandbox: VercelSandbox) {
  const content = await sandbox.readFileToBuffer({ path: proofFile });
  if (!content) {
    throw new Error("Fork smoke proof file was not readable.");
  }

  const proof = JSON.parse(content.toString("utf8")) as unknown;
  if (!isRecord(proof) || proof.ok !== true || proof.runner !== "codex-sdk") {
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

async function stopSandbox(sandbox: VercelSandbox | undefined) {
  if (!sandbox) {
    return;
  }

  await sandbox.stop().catch(() => undefined);
}

async function deleteSnapshot(snapshot: VercelSnapshot) {
  await snapshot.delete().catch(() => undefined);
}

async function hostCommand(command: string, args: string[]) {
  const result = await execFileAsync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
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
    env.VERCEL_OIDC_TOKEN,
    env.VERCEL_PROJECT_ID,
    env.VERCEL_TEAM_ID,
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
import { access, readFile } from "node:fs/promises";

for (const file of [
  "src/sandbox/runner/index.ts",
  "src/sandbox/runner/config.ts",
  "src/sandbox/runner/codex.ts",
  "src/sandbox/runner/convex.ts",
]) {
  await access(file);
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
if (!deps["@openai/codex-sdk"] || !deps.tsx) {
  throw new Error("Snapshot dependencies are missing.");
}

await import("@openai/codex-sdk");
await import("./src/sandbox/runner/config.ts");
await import("./src/sandbox/runner/codex.ts");

console.log("base-smoke-ok");
`;

const forkSmokeSource = String.raw`
import { access, readFile, writeFile } from "node:fs/promises";

await access("src/sandbox/runner/index.ts");
await import("@openai/codex-sdk");
await import("./src/sandbox/runner/config.ts");

const proof = {
  ok: true,
  runner: "codex-sdk",
  source: "drip-phase-c-snapshot",
  tsx: true
};

await writeFile("${proofFile}", JSON.stringify(proof), "utf8");
const stored = JSON.parse(await readFile("${proofFile}", "utf8"));
if (stored.ok !== true || stored.runner !== "codex-sdk" || stored.tsx !== true) {
  throw new Error("Fork proof mismatch.");
}

console.log("fork-smoke-ok");
`;
