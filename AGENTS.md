## Development
- Use `pnpm` as the package manager always.
- Keep app source in `src/`; Convex functions live in `src/convex/`.
- Use `pnpm exec` for local CLIs that are installed in this repo.
- When running in auto approval mode, always run `git` and `gh` commands outside the sandbox.
- Read `docs/DEVELOPMENT.md` before local setup, localhost testing, or parallel worktree work.
- Read `docs/DEPLOYMENT.md` before production deploy or production verification work.
- If you update files in `agent/`, ask the user if they want to recreate the base sandbox image before committing.

## Environment Variables
- Whenever you add or change an env var, update `.env.example` in the same change.
- Treat `.env`, `.env.local`, `.env.production.local`, `.vercel/`, and `.convex/` as private runtime config.
- This repo's active local runtime config should live in one ignored `.env`; do not split sandbox or Convex selection values into `.env.local`.
- Never copy real env values, deploy keys, dashboard URLs, deployment IDs, or project IDs into commits, docs, screenshots, logs, or final responses.

## Verifying Your Work
- Locally: run `pnpm lint`, `pnpm typecheck`, and `pnpm build` when code changes.
- Convex and production verification workflows live in `docs/CONVEX.md` and `docs/DEPLOYMENT.md`.

## References
- `docs/references/openai-codex/sdk/typescript/` is a read-only reference checkout of the official OpenAI Codex TypeScript SDK.
- Use it only to inspect SDK APIs, samples, tests, event shapes, and package metadata.
- Do not edit, format, refactor, or treat files under `docs/references/` as app source unless explicitly asked.

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
