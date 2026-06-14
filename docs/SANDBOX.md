# Sandbox

Last updated: 2026-06-03

## Base Image Strategy

Drip uses one prebuilt Vercel Sandbox snapshot as the Codex SDK base image.
That base image is updated locally with one script:

```bash
scripts/setup_base_snapshot
```

The script always creates a fresh base snapshot and updates the same private env
variable:

```bash
base_sandbox_image=<vercel-sandbox-snapshot-id>
```

Runtime code should always read `base_sandbox_image` when it needs to
create a new Vercel Sandbox for Codex. We do not hardcode snapshot IDs in source
code or docs.

## Repo Layout

Keep the setup in this repo:

```text
agent/
  AGENTS.md
  .agents/
    skills/

scripts/
  setup_base_snapshot
```

`agent/` only contains the Codex agent files that get copied into the base
snapshot. It should not know whether it is running in Vercel Sandbox,
production, or anywhere else.

`scripts/setup_base_snapshot` owns the setup layer: creating the Vercel Sandbox,
copying repo code, copying `agent/`, installing dependencies, creating the
snapshot, and updating `base_sandbox_image`.

## What The Script Does

`scripts/setup_base_snapshot` should:

1. Create a new Vercel Sandbox.
2. Copy this repo's source code into the sandbox.
3. Copy the `agent/` folder into the sandbox.
4. Install runtime dependencies, including `@openai/codex-sdk`.
5. Set up non-secret env placeholders and any fixed local config.
6. Run a quick smoke check.
7. Create a Vercel Sandbox snapshot.
8. Update the private `base_sandbox_image` env variable to the new
   snapshot ID.

## Runtime Flow

When production needs Codex:

1. Read `base_sandbox_image`.
2. Start a new Vercel Sandbox from that snapshot.
3. Pass run-specific secrets and inputs only at runtime.
4. Run the Codex SDK runner.
5. Write status and outputs back to Convex.
6. Stop the sandbox.

## Rules

- Do not commit real snapshot IDs, env values, Vercel IDs, Convex IDs, or OpenAI
  credentials.
- Do not build a second repo for this.
- Base image refresh is local, not CI-managed.
- If the base config changes, run `scripts/setup_base_snapshot` again and keep
  updating the same `base_sandbox_image` variable.
