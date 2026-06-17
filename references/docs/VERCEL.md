# Vercel

Last updated: 2026-06-03

## How to Update This Document

This is Drip's Vercel reference. Keep it focused on Vercel-specific project
rules: production hosting, project linking, git auto-deploy policy, production
env ownership, and Vercel CLI/plugin usage.

When Vercel setup changes:

1. Update this document if a durable Vercel rule changes.
2. Update `references/docs/DEVELOPMENT.md` if the local workflow changes.
3. Update `references/docs/DEPLOYMENT.md` if the production deploy or verification flow
   changes.
4. Update `.env.example` in the same change if any env var is added, renamed,
   removed, or moved.
5. Keep real project IDs, team IDs, deployment URLs, dashboard links, deploy
   keys, and account-specific values out of committed files. Public-facing URLs
   (the live app and generated drop sites) are fine in public docs.

## Role in Drip

Vercel hosts the production Next.js app. It does not provide a local
development environment for Drip.

Local development is `localhost` Next.js plus Convex dev deployments. See
`references/docs/DEVELOPMENT.md`.

Production deployment is Vercel Production plus Convex Production after a push
to `master`. See `references/docs/DEPLOYMENT.md`.

## Git Auto-Deploy Policy

`vercel.json` disables automatic deployments for every branch except `master`:

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

Do not add Vercel Preview, Vercel Development, or staging environments unless
the decision is first captured in `references/docs/DEVELOPMENT.md` and
`references/docs/DEPLOYMENT.md`.

## Project Link

The Vercel local link lives in `.vercel/project.json`. It is private CLI/account
metadata and is ignored by git. It is not a local runtime environment.

To link a fresh checkout to the existing Vercel project:

```bash
pnpm exec vercel link --yes --project drip --scope <vercel-team-slug>
```

Use the project and scope supplied by the operator. Do not commit `.vercel/`,
and do not paste project IDs or team IDs into docs or final responses.

## Environment Ownership

Vercel Production currently owns:

```bash
CONVEX_DEPLOY_KEY=
```

Store it in the Vercel Production environment as an encrypted or sensitive
value.

Vercel Preview and Vercel Development env sets should remain empty for Drip's
current two-environment model.

Do not manually set these in Vercel for the normal Convex deploy-wrapper flow:

```bash
NEXT_PUBLIC_CONVEX_URL=
NEXT_PUBLIC_CONVEX_SITE_URL=
```

The Convex deploy wrapper injects public Convex URLs into the Next.js production
build.

## Vercel Sandbox

Vercel Sandbox is Drip's isolated execution layer for Codex SDK-powered Builder
runs. It is separate from Vercel Production hosting: it is not a Preview,
Development, or staging environment.

The sandbox flow uses one reusable base snapshot:

```bash
BASE_SANDBOX_IMAGE=
```

That private env var stores the active Vercel Sandbox snapshot ID. It is updated
in local `.env`, selected Convex, and prod Convex by:

```bash
pnpm run setup:base-snapshot
```

Testing and production use the same pattern: read
`BASE_SANDBOX_IMAGE`, create a new Vercel Sandbox from that snapshot, pass
run-specific secrets at runtime, run Codex, write results back to Convex, and
stop the sandbox.

For hackathon simplicity, keep only one active base snapshot pointer. The setup
command creates a new snapshot, points both Convex environments at it, and then
deletes the previous snapshot.

The base snapshot is prepared from the repo's top-level `agent/` payload:
`agent/runner` becomes the runner process directory, and `agent/codex-agent`
becomes the Codex agent workspace template.

Convex product sandbox actions run outside Vercel's OIDC context, so their
runtime env needs a durable `VERCEL_TOKEN` plus `VERCEL_TEAM_ID` and
`VERCEL_PROJECT_ID`. A fresh `VERCEL_OIDC_TOKEN` can be useful for the local
setup command, but it is not the product action credential.

Do not commit real snapshot IDs, Vercel project/team IDs, sandbox URLs, or
OpenAI credentials. Keep real values in local `.env` and private platform env
configuration.

See `references/docs/SANDBOX.md` for the base image update flow.

## CLI and Plugin Usage

Use the Vercel plugin for project lookup, deployment inspection, protected
deployment access, and high-level Vercel platform questions. Use the local
Vercel CLI for repo work:

```bash
pnpm exec vercel --help
pnpm exec vercel link --yes --project drip --scope <vercel-team-slug>
pnpm exec vercel env ls production
pnpm exec vercel env ls preview
pnpm exec vercel env ls development
pnpm exec vercel ls
pnpm exec vercel inspect <deployment> --wait
```

When inspecting deployments or envs, report names, presence, and readiness only.
Do not print project IDs, deployment IDs, dashboard URLs, team IDs, or secret
values in docs, screenshots, logs, or final responses. Public-facing URLs (the
live app and generated drop sites) are fine in public docs; private identifiers
remain forbidden.

## References

- `references/docs/DEVELOPMENT.md`: local development and worktree model.
- `references/docs/CONVEX.md`: Convex-specific deploy wrapper and CLI guidance.
- `references/docs/DEPLOYMENT.md`: production deploy and verification workflow.
- `references/docs/SANDBOX.md`: local Vercel Sandbox base-image update flow for Codex
  SDK-powered Builder runs.
