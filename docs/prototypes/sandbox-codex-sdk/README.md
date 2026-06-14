# Sandbox Codex SDK Tutorial

This is a Phase A proof script, not production code.

It shows the whole loop in one commented TypeScript file:

1. Create a base Vercel Sandbox.
2. Copy a tiny Codex SDK runner and `package.json` into it.
3. Install dependencies inside the sandbox.
4. Snapshot the prepared sandbox.
5. Fork two new sandboxes from that snapshot.
6. Run Codex SDK separately in both forks.
7. Write/read proof files from both forks.
8. Store and query run events in Convex.
9. Stop the sandboxes and delete the temporary snapshot.

## File

- `run-sandbox-codex-sdk.ts`

That one file embeds the sandbox runner source and the sandbox `package.json`.

## Required Env Vars

Vercel Sandbox auth:

- `VERCEL_OIDC_TOKEN`
- or `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, and `VERCEL_PROJECT_ID`

Codex SDK:

- `CODEX_API_KEY`
- `CODEX_MODEL` optional
- `CODEX_REASONING_EFFORT` optional, defaults to `low`

Convex:

- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_SITE_URL`
- `SANDBOX_PROTOTYPE_INGEST_TOKEN`

The same `SANDBOX_PROTOTYPE_INGEST_TOKEN` must also be set privately in the
selected Convex deployment.

## Run

`pnpm exec tsx` does not automatically load `.env.local`, so source env first:

```bash
set -a
. ./.env
. ./.env.local
set +a

pnpm exec tsx docs/prototypes/sandbox-codex-sdk/run-sandbox-codex-sdk.ts
```

## What It Prints

The script prints tutorial step names and JSON summaries:

- base sandbox name
- snapshot id
- forked sandbox names
- command ids
- proof files read back from each fork
- Convex verification for both forked runs
- cleanup confirmation for stopped sandboxes and deleted snapshots

The proof files look like:

```json
{"ok":true,"source":"codex-sdk","fork":"fork-a"}
```

and:

```json
{"ok":true,"source":"codex-sdk","fork":"fork-b"}
```

## Free Plan Credential Choice

This tutorial intentionally passes `CODEX_API_KEY` directly into
`Sandbox.create({ env })` because Vercel Sandbox network-policy header
transforms require a paid plan.

Use a disposable OpenAI/Codex key for this proof and rotate it after testing.
Do not use this as the final production credential model.

## Cleanup

Yes, delete snapshots when this tutorial is done.

The script creates one temporary base snapshot only to prove that a prepared
sandbox can be forked into two independent sandboxes. After both forks run, the
script:

1. Stops every sandbox it created.
2. Deletes the temporary snapshot it created.

That keeps the proof tidy and avoids leaving sandbox storage around after the
demo. For a production base image, you would keep a named snapshot intentionally
and rotate it through a separate lifecycle.

## Why The Inner Codex Sandbox Is Disabled

Codex SDK normally has its own local sandbox mode. Inside Vercel Sandbox, that
nested Linux sandbox can fail on missing `bwrap` capabilities, so this tutorial
sets the inner Codex sandbox to `danger-full-access`.

Vercel Sandbox is the isolation boundary for this proof.
