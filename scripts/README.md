# Scripts

Host-side operational scripts, run with `tsx` via package.json.

- `setup_base_snapshot.ts` (`pnpm setup:base-snapshot`) - Creates a fresh sandbox, copies `sandbox/runner` and `sandbox/codex-agent`, installs runner dependencies, and saves the base snapshot that runs restore from.
- `sandbox_e2e_smoke.ts` (`pnpm e2e:sandbox`) - End-to-end smoke test: starts a sandbox run through Convex, polls until a terminal status, and writes run artifacts to `.sandbox-e2e/`.

Both need the private `.env` loaded; see `docs/SANDBOX.md`.
