# Scripts

Host-side operational scripts, run with `tsx` via package.json.

- `setup_base_snapshot.ts` (`pnpm setup:base-snapshot`) - Creates a fresh sandbox, copies `sandbox/runner` and `sandbox/codex-agent`, installs runner dependencies, and saves the base snapshot that runs restore from.
- Sandbox smoke tests live under `tests/smoke/`. Use `pnpm test:smoke:sandbox`
  or the compatibility alias `pnpm e2e:sandbox`.

Both setup and smoke flows need the private `.env` loaded; see
`docs/SANDBOX.md`.
