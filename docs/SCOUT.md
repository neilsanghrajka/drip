# Scout

Scout is Drip's first AI teammate. Its job is to find live cultural moments and
turn them into up to five source-backed candidate ideas that could inspire
original fashion merchandise.

Scout stops at discovery. It does not design products, run ads, post to Convex,
or build storefronts.

![Scout architecture](whiteboard/scout_architecture.svg)

## TL;DR

The product prompt should stay lean:

```text
Use $scout to get latest cultural trends for Mumbai, India in the last 24 hours.
```

The `$scout` skill owns the rest: source selection, subagent fanout, final
judgment, JSON writing, and JSON validation.

## How It Runs

1. Convex starts a Vercel Sandbox from `BASE_SANDBOX_IMAGE`.
2. The sandbox runner starts a Codex SDK thread in `/vercel/sandbox/agent-workspace`.
3. The runner sets `CODEX_HOME` to `/vercel/sandbox/agent-workspace/.codex` so Codex can load the sandbox skills and subagents.
4. Codex uses `$scout`.
5. `$scout` spawns `x-researcher` and `exa-researcher` in parallel.
6. Researchers return compact evidence only.
7. `$scout` uses model judgment to choose the final candidates.
8. `$scout` writes `scout-output.json`.

## Responsibility Map

| Layer | File | Responsibility |
| --- | --- | --- |
| Scout skill | [`sandbox/codex-agent/.agents/skills/scout/SKILL.md`](../sandbox/codex-agent/.agents/skills/scout/SKILL.md) | End-to-end Scout workflow, subagent orchestration, final judgment, output contract. |
| X skill | [`sandbox/codex-agent/.agents/skills/x-trends/SKILL.md`](../sandbox/codex-agent/.agents/skills/x-trends/SKILL.md) | Generic X public-data API guidance and compact signal shape. |
| Exa skill | [`sandbox/codex-agent/.agents/skills/exa-search/SKILL.md`](../sandbox/codex-agent/.agents/skills/exa-search/SKILL.md) | Generic, query-agnostic Exa Search API guidance and compact evidence shape. |
| X subagent | [`sandbox/codex-agent/.codex/agents/x-researcher.toml`](../sandbox/codex-agent/.codex/agents/x-researcher.toml) | Evidence-only X trend and recent-post researcher. |
| Exa subagent | [`sandbox/codex-agent/.codex/agents/exa-researcher.toml`](../sandbox/codex-agent/.codex/agents/exa-researcher.toml) | Evidence-only source-backed web researcher. |
| Codex sandbox config | [`sandbox/codex-agent/.codex/config.toml`](../sandbox/codex-agent/.codex/config.toml) | Sets sandbox defaults and registers subagents; project skills are discovered from `.agents/skills`. |
| Runner | [`sandbox/runner/codex.ts`](../sandbox/runner/codex.ts) | Runs Codex SDK, passes research env, and streams generic Codex events/results. |
| Base snapshot setup | [`scripts/setup_base_snapshot.ts`](../scripts/setup_base_snapshot.ts) | Copies and smoke-tests the sandbox runtime payload. |
| Sandbox guide | [`docs/SANDBOX.md`](SANDBOX.md) | Runtime, env, and base snapshot map. |

## Important Boundaries

- Scout owns judgment. Do not implement coded candidate ranking, scoring, or
  merchability decisions in runner, Convex, or helper scripts.
- X and Exa skills are reusable source adapters. They do not know Drip's final
  taste criteria.
- Source subagents do not synthesize final candidates. They return compact
  evidence for Scout.
- With `max_depth = 1`, Scout spawns the Codex subagents. X/Exa skills may
  recommend API-level parallel calls, but they should not spawn nested Codex
  subagents.
- Every final candidate should include source URLs.

## Output

Scout writes:

```text
/vercel/sandbox/agent-workspace/scout-output.json
```

The schema version is:

```text
scout.cultural-moments.v1
```

Read the Scout skill for the exact JSON shape.

The runner is intentionally generic and does not enforce this Scout-specific
artifact contract. E2E tests and any future Scout-specific orchestration layer
should verify the file exists, parses, and matches the expected schema.

## Updating The Base Image

Scout lives inside the sandbox agent payload. After changing files under
`sandbox/codex-agent/` or `sandbox/runner/`, recreate the base image before
black-box sandbox testing. The setup command syncs `BASE_SANDBOX_IMAGE` into
local `.env`, selected Convex, and prod Convex:

```bash
pnpm run setup:base-snapshot
```
