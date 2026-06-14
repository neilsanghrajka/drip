# Deployment

Last updated: 2026-06-03

## How to Update This Document

This is Drip's production deployment workflow map. Keep it focused on what
happens after a production push, how production is verified, and which platform
owns which part of the deploy.

When deployment changes:

1. Update this document if the production deploy path, auto-deploy policy,
   production env ownership, or production verification changes.
2. Update `docs/CONVEX.md` for Convex-specific backend rules.
3. Update `docs/VERCEL.md` for Vercel-specific platform rules.
4. Update `.env.example` in the same change if any production env var changes.
5. Keep real production URLs, deployment IDs, dashboard links, project IDs, and
   deploy keys out of committed files.

## Production Model

Drip has only Local and Prod environments. See `docs/DEVELOPMENT.md` for the
local model.

Prod is:

```text
Prod = Vercel Production + Convex Production
```

Production deploys happen only after a push to `master`.

## Production Deploy Flow

The expected flow is:

1. Commit the change.
2. Push to `master`.
3. Vercel Production starts the build.
4. Vercel runs the Convex deploy wrapper from `vercel.json`.
5. Convex deploys production functions.
6. Convex injects public Convex URLs into the wrapped Next.js build.
7. Vercel publishes the production site.

The production build command is:

```bash
pnpm exec convex deploy --cmd 'pnpm run build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL
```

Do not run `pnpm exec convex deploy` manually unless the user explicitly asks
for a manual deploy.

## Vercel Environment Policy

Vercel Production owns:

```bash
CONVEX_DEPLOY_KEY=
```

Vercel Preview and Vercel Development env sets should stay empty. Drip does not
use Vercel Preview, Vercel Development, or shared staging in the current model.

## Production Verification

Use the Vercel plugin or Vercel CLI to verify deployment status:

```bash
pnpm exec vercel ls
pnpm exec vercel inspect <deployment> --wait
pnpm exec vercel env ls production
```

Verify:

- The new deployment is `Ready`.
- The deployment was built from `master`.
- Build logs show the Convex deploy wrapper ran.
- Vercel Production has `CONVEX_DEPLOY_KEY`.
- Vercel Preview and Development env sets remain empty.
- The production app loads.
- `/convex-smoke` shows the live Convex smoke status.

Use production Convex CLI targeting only when the production deployment selector
is known from private operator config. Do not paste deployment selectors,
dashboard URLs, production URLs, or generated Convex URLs into committed docs or
final responses.

## References

- `docs/DEVELOPMENT.md`: local development and worktree model.
- `docs/CONVEX.md`: Convex-specific deploy wrapper and CLI guidance.
- `docs/VERCEL.md`: Vercel-specific project, env, and CLI guidance.
- `docs/SANDBOX.md`: local base snapshot update flow using
  `pnpm run setup:base-snapshot` and the private `BASE_SANDBOX_IMAGE` env var.
