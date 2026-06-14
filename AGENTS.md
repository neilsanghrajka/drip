## Development
- Use `pnpm` as the package manager always.
- Keep app source in `src/`; Convex functions live in `src/convex/`.
- Use `pnpm exec` for local CLIs that are installed in this repo.
- When running in auto approval mode, always run `git` and `gh` commands outside the sandbox.
- Read `docs/DEVELOPMENT.md` before local setup, localhost testing, or parallel worktree work.
- Read `docs/DEPLOYMENT.md` before production deploy or production verification work.

## Environment Variables
- Whenever you add or change an env var, update `.env.example` in the same change.
- Treat `.env`, `.env.local`, `.env.production.local`, `.vercel/`, and `.convex/` as private runtime config.
- Never copy real env values, deploy keys, dashboard URLs, deployment IDs, or project IDs into commits, docs, screenshots, logs, or final responses.

## Verifying Your Work
- Locally: run `pnpm lint`, `pnpm typecheck`, and `pnpm build` when code changes.
- Convex and production verification workflows live in `docs/CONVEX.md` and `docs/DEPLOYMENT.md`.

## Convex
- Use Convex for backend functions and database work.
- Use the Convex plugin for Convex setup guidance, scaling questions, and backend implementation advice.
- Read `docs/CONVEX.md` for Convex-specific project rules.
- Read `docs/DEVELOPMENT.md` for local workflow and `docs/DEPLOYMENT.md` for production workflow.

## Vercel And Deploys
- Use the Vercel plugin for project lookup, deployment inspection, protected deployment access, and platform questions.
- Use `pnpm exec vercel` for local Vercel CLI work.
- Read `docs/VERCEL.md` for Vercel-specific project rules.
- Read `docs/DEPLOYMENT.md` before production deploy or production verification work.
