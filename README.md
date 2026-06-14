## Self-Deploy
- Whenever a change affects how a new person can self-host or self-deploy this project, update this section in `AGENTS.md` in the same change.
- Install dependencies with `pnpm install`.
- Copy environment placeholders with `cp .env.example .env.local`.
- Log in to Vercel with `pnpm exec vercel login`.
- Log in to Convex and create/link a project with `pnpm exec convex dev --configure new`.
- Set Vercel Production env with `pnpm exec vercel env add CONVEX_DEPLOY_KEY production --scope <vercel-team-slug>`.
- Link Vercel with `pnpm exec vercel link --yes --project drip --scope <vercel-team-slug>`.
- Push to `master`; Vercel will run the Convex deploy wrapper, inject the public Convex URLs, and publish the app.
