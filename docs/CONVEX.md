# Convex

Last updated: 2026-06-03

## How to Update This Document

This document is Drip's Convex architecture and operations note. Keep it focused
on decisions that future contributors need to understand: what Convex owns, how
local development is linked, which environment variables belong where, and how
Convex participates in production deploys.

When Convex setup changes:

1. Update the relevant section in this document.
2. Update `.env.example` in the same change if any environment variable is
   added, renamed, removed, or moved between local, Vercel, and Convex stores.
3. Update `AGENTS.md` if the change affects how a new person self-hosts or
   self-deploys Drip.
4. Keep real deployment names, URLs, dashboard links, project IDs, deploy keys,
   and account-specific values out of committed files.

## Role in Drip

Drip uses Convex as the backend function and database layer for the Next.js app.
Application source lives in `src/`, and Convex functions live in `src/convex/`.
The repo-level `convex.json` points Convex at that function directory:

```json
{
  "functions": "src/convex/"
}
```

The current smoke function is `src/convex/smoke.ts`. The browser smoke page at
`/convex-smoke` calls that function through `NEXT_PUBLIC_CONVEX_URL`, so it is a
small end-to-end check that the deployed web app can talk to Convex.

## Environment Ownership

Environment values are split by where they are used. The rule is simple: commit
names and placeholders, never real values.

Local development uses ignored local files:

```bash
CONVEX_DEPLOYMENT=
NEXT_PUBLIC_CONVEX_URL=
NEXT_PUBLIC_CONVEX_SITE_URL=
```

`pnpm exec convex dev` writes these local values to `.env.local` after the
project is configured. `.env` may exist as an ignored private placeholder or
override file, but `.env.example` remains the tracked contract.

Vercel Production currently needs only:

```bash
CONVEX_DEPLOY_KEY=
```

Do not manually set `NEXT_PUBLIC_CONVEX_URL` or `NEXT_PUBLIC_CONVEX_SITE_URL` in
Vercel for the normal production flow. The Convex deploy wrapper injects the
public Convex client URL into the Next.js build it runs.

`NEXT_PUBLIC_APP_URL` is documented in `.env.example` for smoke checks and
future app-level URL needs. Set it only when code or an operational check
actually depends on it.

## Local Development

Use `pnpm` for all commands:

```bash
pnpm install
cp .env.example .env.local
pnpm exec convex dev
pnpm dev
```

For a brand-new local checkout, configure Convex against the intended existing
project or create a new project:

```bash
pnpm exec convex dev --configure existing
pnpm exec convex dev --configure new
```

Prefer a cloud dev deployment for normal signed-in development. Anonymous or
local-only deployments are useful for isolated experiments, but they should not
be treated as the shared project setup.

## Production Deploys

Convex production deploys are coordinated by Vercel. The production build
command is defined in `vercel.json`:

```bash
pnpm exec convex deploy --cmd 'pnpm run build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL
```

That command deploys Convex functions first, then runs the Next.js build with
the public Convex URL available as `NEXT_PUBLIC_CONVEX_URL`. Vercel needs
`CONVEX_DEPLOY_KEY` in its Production environment so this command can deploy
Convex during the production build.

Do not run `pnpm exec convex deploy` manually unless the user explicitly asks
for a manual deploy. The expected production path is a git push to `master`,
which lets Vercel run the wrapped deploy/build flow.

## Verification

After changing Convex code, run:

```bash
pnpm exec convex codegen
pnpm exec convex run smoke:ping '{"label":"cli"}'
```

For production verification, keep checks bounded and display-safe:

```bash
pnpm exec convex run smoke:ping '{"label":"prod-check"}'
```

If you need to target a specific deployment, use an explicit deployment selector
from private operator config. Do not commit or paste deployment names, dashboard
URLs, or generated Convex URLs while recording debugging notes.

## Plugin and CLI Usage

In Codex, use the Convex plugin for setup guidance, scaling questions, and
Convex-specific implementation advice. Use the Convex CLI for project
configuration, codegen, function checks, env inspection, and deployment-scoped
operations unless a live account inspection tool is available in the session.

Useful commands:

```bash
pnpm exec convex --help
pnpm exec convex dev
pnpm exec convex codegen
pnpm exec convex run smoke:ping '{"label":"cli"}'
pnpm exec convex env list
pnpm exec convex function-spec
```

When inspecting envs, report names and presence only. Never print secret values
or account-specific deployment identifiers in logs, docs, screenshots, or final
responses.

