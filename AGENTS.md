## Development
- Use `pnpm` as the package manager always.
- Keep app source in `src/`; Convex functions live in `src/convex/`.
- Use `pnpm exec` for local CLIs that are installed in this repo.
- When running in auto approval mode, always run `git` and `gh` commands outside the sandbox.

## Environment Variables
- Whenever you add or change an env var, update `.env.example` in the same change.
- Treat `.env`, `.env.local`, `.env.production.local`, `.vercel/`, and `.convex/` as private runtime config.
- Never copy real env values, deploy keys, dashboard URLs, deployment IDs, or project IDs into commits, docs, screenshots, logs, or final responses.

## Verifying Your Work
- Locally: run `pnpm lint`, `pnpm typecheck`, and `pnpm build` when code changes.
- Convex: run `pnpm exec convex codegen` and a bounded function check such as `pnpm exec convex run smoke:ping '{"label":"cli"}'` when Convex code changes.
- Cloud: after production deployment, verify the deployed Vercel URL and any Convex-backed route touched by the change.

## Convex
- Use Convex for backend functions and database work.
- Use `pnpm exec convex dev` for local development, `pnpm exec convex codegen` for generated API updates, and `pnpm exec convex deploy` only through the configured Vercel production build unless the user asks for a manual deploy.

## Vercel And Deploys
- Vercel production deploys are triggered by git pushes to `master`.
- `vercel.json` runs `pnpm exec convex deploy --cmd 'pnpm run build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL`, so Convex functions and the Next.js build deploy together.
- Production Vercel should have `CONVEX_DEPLOY_KEY` set for Production only. Do not manually set `NEXT_PUBLIC_CONVEX_URL` or `NEXT_PUBLIC_CONVEX_SITE_URL` in Vercel for this flow; Convex injects them during the wrapped build.

## Self-Deploy
- Whenever a change affects how a new person can self-host or self-deploy this project, update this section in `AGENTS.md` in the same change.
- Read `docs/CONVEX.md` and `docs/VERCEL.md` for the architecture choices, env ownership, and verification workflow behind these steps.
- Install dependencies with `pnpm install`.
- Copy environment placeholders with `cp .env.example .env.local`.
- Log in to Vercel with `pnpm exec vercel login`.
- Log in to Convex and create/link a project with `pnpm exec convex dev --configure new`.
- Set Vercel Production env with `pnpm exec vercel env add CONVEX_DEPLOY_KEY production --scope <vercel-team-slug>`.
- Link Vercel with `pnpm exec vercel link --yes --project drip --scope <vercel-team-slug>`.
- Push to `master`; Vercel will run the Convex deploy wrapper, inject the public Convex URLs, and publish the app.
