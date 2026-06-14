# Vercel

Last updated: 2026-06-03

## How to Update This Document

This document is Drip's Vercel architecture and deployment note. Keep it focused
on decisions that future contributors need to understand: what Vercel owns, how
the project is linked, which branch deploys production, which environment
variables belong in Vercel, and how Vercel coordinates Convex.

When Vercel setup changes:

1. Update the relevant section in this document.
2. Update `.env.example` in the same change if the change adds, removes, or
   moves an environment variable.
3. Update `AGENTS.md` if the change affects how a new person self-hosts or
   self-deploys Drip.
4. Keep real project IDs, team IDs, deployment URLs, dashboard links, deploy
   keys, and account-specific values out of committed files.

## Role in Drip

Vercel hosts the Next.js app and coordinates production deployments. Convex owns
backend functions and data, while Vercel owns the web build, routing, hosting,
and git-triggered production deploy flow.

The important architectural choice is that Vercel does not run a plain Next.js
build in production. It runs the Convex deploy wrapper from `vercel.json`:

```bash
pnpm exec convex deploy --cmd 'pnpm run build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL
```

This keeps Convex functions and the Next.js build in the same production deploy
path.

## Git and Production Deploys

Production deploys are triggered by pushes to `master`. Other branches are not
enabled for automatic deployment in `vercel.json`:

```json
{
  "git": {
    "deploymentEnabled": {
      "*": false,
      "master": true
    }
  }
}
```

The expected production path is:

1. Push to `master`.
2. Vercel starts the production build.
3. Vercel runs the Convex deploy wrapper.
4. Convex deploys functions and injects `NEXT_PUBLIC_CONVEX_URL`.
5. Next.js builds with the injected Convex URL.
6. Vercel publishes the production deployment.

## Local Project Link

The Vercel local link lives in `.vercel/project.json`. It is private runtime
configuration and is ignored by git.

To link a fresh checkout to an existing Vercel project:

```bash
pnpm exec vercel link --yes --project drip --scope <vercel-team-slug>
```

Use the project and scope supplied by the operator. Do not commit `.vercel/`, and
do not paste project IDs or team IDs into docs or final responses.

## Environment Ownership

Vercel Production currently needs:

```bash
CONVEX_DEPLOY_KEY=
```

Store it in the Vercel Production environment. It should be encrypted or
sensitive in Vercel and never committed locally.

Do not manually set these in Vercel for the normal Convex deploy-wrapper flow:

```bash
NEXT_PUBLIC_CONVEX_URL=
NEXT_PUBLIC_CONVEX_SITE_URL=
```

`NEXT_PUBLIC_CONVEX_URL` is injected by `pnpm exec convex deploy --cmd ...`.
Local development gets public Convex URLs from `.env.local`, which Convex writes
after `pnpm exec convex dev` configures the project.

`NEXT_PUBLIC_APP_URL` is a placeholder in `.env.example` for future app URL
checks and self-host documentation. Set it in Vercel only when code or an
operational check actually depends on it.

## Deployment Checks

Use the Vercel CLI or the Vercel plugin for deployment visibility. Prefer checks
that confirm state without printing private identifiers or env values:

```bash
pnpm exec vercel project inspect drip --scope <vercel-team-slug>
pnpm exec vercel env ls production
pnpm exec vercel inspect <production-url> --format=json
```

After a production deploy, verify:

- The deployment is `READY`.
- The build command came from `vercel.json` and is the Convex deploy wrapper.
- Vercel Production has `CONVEX_DEPLOY_KEY`.
- Vercel Production does not have manually set public Convex URL variables.
- The app loads.
- `/convex-smoke` returns the live Convex smoke status.

## Plugin and CLI Usage

In Codex, use the Vercel plugin for project lookup, deployment inspection,
protected deployment access, and high-level Vercel platform questions. Use the
Vercel CLI for local linking and env-name checks from this repo.

Useful commands:

```bash
pnpm exec vercel --help
pnpm exec vercel link --yes --project drip --scope <vercel-team-slug>
pnpm exec vercel env ls production
pnpm exec vercel project inspect drip --scope <vercel-team-slug>
```

When inspecting deployments or envs, report names, presence, and readiness only.
Do not print project IDs, deployment IDs, production URLs, dashboard URLs, team
IDs, or secret values in committed docs or final responses.

