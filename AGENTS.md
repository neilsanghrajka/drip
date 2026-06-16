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

## References
- `references/codex-sdk/sdk/typescript/` is a read-only reference checkout of the official OpenAI Codex TypeScript SDK.
- Use it only to inspect SDK APIs, samples, tests, event shapes, and package metadata.
- Do not edit, format, refactor, or treat files under `references/` as app source unless explicitly asked.
