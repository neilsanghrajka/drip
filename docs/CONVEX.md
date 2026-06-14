# Convex

Last updated: 2026-06-03

## How to Update This Document

This is Drip's Convex reference. Keep it focused on Convex-specific project
rules: source layout, generated code, deployment secrecy, dev deployment
behavior, and Convex CLI/plugin usage.

When Convex setup changes:

1. Update this document if a durable Convex rule changes.
2. Update `docs/DEVELOPMENT.md` if the local workflow changes.
3. Update `docs/DEPLOYMENT.md` if the production deploy or verification flow
   changes.
4. Update `.env.example` in the same change if any env var is added, renamed,
   removed, or moved.
5. Keep real deployment names, URLs, dashboard links, project IDs, deploy keys,
   and account-specific values out of committed files.

## Role in Drip

Convex is Drip's backend function and database layer. Application source lives
in `src/`, and Convex functions live in `src/convex/`.

`convex.json` is the source of truth for the Convex function path:

```json
{
  "functions": "src/convex/"
}
```

The current smoke function is `src/convex/smoke.ts`. The `/convex-smoke` page
calls it through `NEXT_PUBLIC_CONVEX_URL`, which makes it the lightweight
browser-to-Convex health check.

## Local Dev Deployments

Drip has only Local and Prod environments. In Local, Convex work uses throwaway
Convex dev deployments selected by ignored `.env` files. See
`docs/DEVELOPMENT.md` for the full local workflow and worktree diagram.

Convex plugin guidance for signed-in development is: use a real Convex cloud
dev deployment. Anonymous/local-only Convex is only for users with no Convex
account.

When multiple worktrees or agents may change `src/convex/`, give each lane its
own Convex dev deployment. Sharing one dev deployment lets the last `convex dev`
push overwrite the backend bundle expected by another worktree.

## Generated Code

Do not hand-edit generated Convex files under `src/convex/_generated/`. Refresh
them through the Convex CLI:

```bash
pnpm exec convex codegen
```

If Convex AI guidance files are installed in the future, read them before
editing Convex functions, schema, auth, actions, or generated AI-related code.

## Environment Ownership

Local Convex selection lives in ignored `.env`:

```bash
CONVEX_DEPLOYMENT=
NEXT_PUBLIC_CONVEX_URL=
NEXT_PUBLIC_CONVEX_SITE_URL=
```

Production deploy authorization lives in Vercel Production:

```bash
CONVEX_DEPLOY_KEY=
```

Do not manually set `NEXT_PUBLIC_CONVEX_URL` or
`NEXT_PUBLIC_CONVEX_SITE_URL` in Vercel for the normal production flow. The
Convex deploy wrapper injects public Convex URLs into the Next.js production
build. See `docs/DEPLOYMENT.md`.

Sandbox runtime config is duplicated intentionally: the selected default/dev
Convex deployment and the prod Convex deployment both store
`BASE_SANDBOX_IMAGE`. Run `pnpm run setup:base-snapshot` to refresh both at the
same time.

## CLI and Plugin Usage

Use the Convex plugin for setup guidance, scaling questions, and
Convex-specific implementation advice. Use the local Convex CLI for repo work:

```bash
pnpm exec convex --help
pnpm exec convex dev
pnpm exec convex deployment create dev/<lane-name> --type dev --select
pnpm exec convex codegen
pnpm exec convex run smoke:ping '{"label":"local"}'
pnpm exec convex env list
pnpm exec convex function-spec
```

When inspecting Convex envs or deployments, report names and presence only.
Never print secret values, deployment URLs, dashboard links, project IDs, or
account-specific deployment identifiers in docs, screenshots, logs, or final
responses.
