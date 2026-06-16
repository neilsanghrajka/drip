# Sandbox

Everything in this folder runs inside the Vercel Sandbox; it is copied into the base snapshot, not imported by the Next.js app.

- `runner/` - The runner process: Codex SDK loop, Convex ingest client, config, and the runner-local dependency manifest.
- `codex-agent/` - The agent home. `.agents/skills/` holds the four teammate skills (`scout`, `fashion-designer`, `builder`, `performance-marketer`) plus supporting skills (`x-trends`, `exa-search`, `meta-ads-cli`, `agent-browser`, `frontend-skill`). `.codex/agents/*.toml` defines the subagents each teammate spawns; `.codex/config.toml` holds sandbox-only Codex defaults.

See `docs/SANDBOX.md` for the full execution-layer map and `docs/specs/` for per-teammate behavior.
