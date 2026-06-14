# Sandbox Handoff

Last updated: 2026-06-03

## Summary

Phase B now has a generic `sandboxRun` control-plane substrate for running
Codex SDK inside Vercel Sandbox and streaming state back through Convex.

The implementation is intentionally not drop-campaign-specific. It supports one
task, one sandbox run, one detached sandbox runner command, ordered events,
heartbeats, cancellation flags, and final success/failure reporting.

## What Changed

- Added the canonical architecture/tutorial map in `docs/SANDBOX.md`.
- Added Convex tables `sandboxRuns` and `sandboxRunEvents`.
- Added public Convex APIs under `sandboxRuns.*`:
  `createSandboxRun`, `getSandboxRun`, `listSandboxRunEvents`,
  `cancelSandboxRun`, `getSandboxRunForRunner`, `ingestSandboxRunEvent`,
  `heartbeatSandboxRun`, and `finishSandboxRun`.
- Added `sandboxRunActions.startSandboxRun` to provision Vercel Sandbox and
  launch the runner.
- Added `src/sandbox/runner/*` for the TypeScript Codex SDK runner and
  embedded fallback runner used when no prepared snapshot is configured.
- Added `DRIP_RUNNER_CONVEX_URL` and Vercel Sandbox credential placeholders to
  `.env.example`.
- Moved `@vercel/sandbox` to runtime dependencies because Convex Node actions
  import it.

## Verified Evidence

- Convex renamed API blackbox passed: create, token-gated runner access,
  sequence rejection, cancellation heartbeat, and finish.
- Full Vercel Sandbox e2e passed:
  `createSandboxRun` -> `startSandboxRun` -> sandbox runner -> Codex SDK ->
  Convex events/result.
- The e2e coding task wrote actual files in the sandbox filesystem:
  `artifact-demo/manifest.json` and `artifact-demo/dripAnswer.ts`.
- The sandbox was re-opened through the Vercel Sandbox SDK and both artifact
  files were read back successfully.
- Final observed e2e result:
  status `succeeded`, 11 events, final response
  `DRIP_SANDBOX_CODE_TASK_OK`.
- Local verification passed: `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

## Merge Notes For Main

- Pull this worktree's commit into main, then run `pnpm install` if the
  lockfile dependency category move is not already reflected locally.
- Ensure private runtime env is configured outside git. Do not copy real values
  into commits or docs.
- For durable non-local execution, prefer scoped Vercel access-token
  credentials over a copied local OIDC token.
- The product UI can subscribe to `sandboxRuns.getSandboxRun` and
  `sandboxRuns.listSandboxRunEvents` to show realtime progress today.
- Artifact storage is not durable yet; generated files remain inside Vercel
  Sandbox unless a later phase exports them.
