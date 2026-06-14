# Sandbox Codex SDK Tutorial

Tiny Phase A tutorial proving the execution substrate:

- Vercel Sandbox creates an isolated execution environment.
- The base sandbox installs `@openai/codex-sdk` once and is snapshotted.
- Two forked sandboxes restore from that snapshot and run Codex SDK separately.
- Each fork uses Codex SDK to create/run a hello-world file, then the host reads the source/output/proof files back.
- The script stops/deletes created sandboxes and deletes the temporary snapshot at the end.
- Delete temporary snapshots after tutorial runs; keep only intentionally named base snapshots.

Everything is in one commented TypeScript file:

- `run-sandbox-codex-sdk.ts`

Run it with env loaded:

```sh
set -a
. ./.env
. ./.env.local
set +a

pnpm exec tsx docs/prototypes/sandbox-codex-sdk/run-sandbox-codex-sdk.ts
```

Required env names: `CODEX_API_KEY`, Vercel Sandbox auth, `NEXT_PUBLIC_CONVEX_URL`,
`NEXT_PUBLIC_CONVEX_SITE_URL`, and `SANDBOX_PROTOTYPE_INGEST_TOKEN`.
By default it runs Codex SDK with `CODEX_MODEL=gpt-5.5` and `CODEX_REASONING_EFFORT=low`.

This is free-plan prototype code: it passes `CODEX_API_KEY` into
`Sandbox.create({ env })`. Use a disposable key and rotate it after testing.
