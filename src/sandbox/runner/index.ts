import { readRunnerConfig } from "./config";
import { createRunnerControlClient } from "./convex";
import { runCodexSdk } from "./codex";

async function main() {
  const config = readRunnerConfig();
  await runCodexSdk({
    config,
    control: createRunnerControlClient(config),
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
