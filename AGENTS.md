# AGENTS.md

This repo is Drip: an AI fashion team that turns trending moments into limited merch drops.
Use this file as your operating rules and `docs/` as the directory map — the Documentation map in `README.md` and `docs/README.md` lists every doc.

## Project Map
- `docs/PRD.md` — product definition.
- `docs/BACKEND.md` — backend system map.
- `docs/specs/` — the four teammate specs, numbered in pipeline order (Scout, Fashion Designer, Builder, Performance Marketer).
- `docs/SANDBOX.md` — sandbox execution layer and base snapshot flow.
- `docs/CONVEX.md` — Convex-specific project rules.
- `docs/VERCEL.md` — Vercel-specific project rules.
- `docs/DEVELOPMENT.md` — local setup, localhost testing, parallel worktrees.
- `docs/DEPLOYMENT.md` — production deploy and verification.
- `docs/WHITEBOARD.md` — whiteboard notes.
- `references/` — read-only reference checkouts and prototypes.
- `sandbox/codex-agent/` — the agent skills and subagents that run inside the sandbox.

## Plugins And Skills
- Use the installed plugins instead of raw CLI guesswork: the Convex plugin for backend work and the Vercel plugin for deploys and platform questions.
- For frontend work use the `shadcn` skill and the `frontend-skill`.
- Use the `agent-browser` skill to drive a real browser.

## Development
- Use `pnpm` as the package manager always.
- Keep app source in `src/`; Convex functions live in `src/convex/`.
- Use `pnpm exec` for local CLIs that are installed in this repo.
- When running in auto approval mode, always run `git` and `gh` commands outside the sandbox.
- Read `docs/DEVELOPMENT.md` before local setup, localhost testing, or parallel worktree work.
- Read `docs/DEPLOYMENT.md` before production deploy or production verification work.
- If you update files in `sandbox/`, ask the user if they want to recreate the base sandbox image before committing.

## Environment Variables
- Whenever you add or change an env var, update `.env.example` in the same change.
- Treat `.env`, any `.env.*` remnants/backups, `.vercel/`, and `.convex/` as private runtime config.
- This repo's active local runtime config should live in one ignored `.env`; do not split sandbox or Convex selection values across multiple env files.
- Never copy real env values, deploy keys, dashboard URLs, deployment IDs, or project IDs into commits, docs, screenshots, logs, or final responses. Exception: public-facing URLs — the live app URL and generated drop-site URLs (customer-facing `*.vercel.app` pages) — are fine in docs and README now that the repo is public.

## Verifying Your Work
- Always self-verify in a running app, not just with static checks. In a cloud VM, use the `agent-browser` skill instead of `@browser`.
- Locally: run `pnpm lint`, `pnpm typecheck`, and `pnpm build` when code changes.
- Always run an e2e smoke test before calling work done: 1) the app loads and login works in the browser, 2) a drop stage run completes (`pnpm e2e:sandbox` covers the sandbox path), 3) artifacts and events land in Convex. Use the Vercel and Convex plugins to map the data flow end to end.
- After a production deploy, repeat the smoke test on the prod URL, not just locally.
- Convex and production verification workflows live in `docs/CONVEX.md` and `docs/DEPLOYMENT.md`.

## Git
- Multiple agent threads edit files in this same git checkout concurrently. Do not overwrite files you did not change, re-read a file before editing it, and never stage blindly (`git add .`) — stage only the files you touched, because someone else may be mid-edit.

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

## References
- `references/codex-sdk/sdk/typescript/` is a read-only reference checkout of the official OpenAI Codex TypeScript SDK.
- Use it only to inspect SDK APIs, samples, tests, event shapes, and package metadata.
- `references/sandbox-prototypes/` is the early standalone prototype that proved the Vercel Sandbox + Codex SDK execution substrate; read it to understand the substrate in isolation from the app.
- Do not edit, format, refactor, or treat files under `references/` as app source unless explicitly asked.
