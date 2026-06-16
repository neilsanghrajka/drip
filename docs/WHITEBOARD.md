# Whiteboard Map

Photos of the original planning whiteboard, plus a few cleaned-up digital diagrams, in `docs/whiteboard/`. They show how Drip was designed before it was built and are kept as-is for context, not maintained. Where a drawing disagrees with the docs, the docs are correct.

Two naming notes before reading the photos:

- **"Trend setter" is Scout's earlier name.**
- **Early sandbox sketches say "Modal sandbox"** — the shipped execution layer is Vercel Sandbox (see [`SANDBOX.md`](SANDBOX.md)).

## Overview

- `whiteboard/full_whiteboard.jpg` — The complete board in one shot. Use it to locate where each close-up below sits.

## System flow

- `whiteboard/codex_agent_runtime.png` — Clean diagram of the shipped runtime: local repo → `pnpm setup:base-snapshot` → `BASE_SANDBOX_IMAGE` → forked sandboxes running the runner + Codex SDK, streaming events back to Convex. Matches [`SANDBOX.md`](SANDBOX.md).
- `whiteboard/data_flow.jpg` — How the UI, Convex, sandbox, and auth fit together at a high level. Current truth: [`BACKEND.md`](BACKEND.md).
- `whiteboard/convex_runs.jpg` — The Convex run lifecycle: how a sandbox run is created, started, and polled. Current truth: [`BACKEND.md`](BACKEND.md).
- `whiteboard/sandbox_flow.jpg` — The coding-sandbox loop across dashboard, sandbox, Convex, and the Next.js UI, drawn in the Modal era.
- `whiteboard/sandbox_loop.jpg` — Close-up of the same loop.

## Teammate architecture

These three match what shipped; the specs in [`specs/`](specs/) are the written version.

- `whiteboard/scout_architecture.svg` — Scout: skill, research subagents, source skills, and output wiring. Spec: [`specs/01_SCOUT.md`](specs/01_SCOUT.md).
- `whiteboard/fashion_designer_architecture.svg` — Fashion Designer: parallel product-lane subagents, reviewer curation, imagegen, and output wiring. Spec: [`specs/02_FASHION_DESIGNER.md`](specs/02_FASHION_DESIGNER.md).
- `whiteboard/builder_architecture.png` — Builder: static-site build, browser review loop, immutable Vercel deploy. Spec: [`specs/03_BUILDER.md`](specs/03_BUILDER.md).

## Teammate flows (early sketches)

- `whiteboard/trendsetter_flow.jpg` — Scout's first sketch, as "trend setter": research agents (X, web, and a Reddit agent that did not ship) → taste skill → five candidate ideas.
- `whiteboard/employee_flows.jpg` — First sketches of the Fashion Designer and Performance Marketer flows. Specs 02 and 04 are current.
- `whiteboard/developer_flow.jpg` — How a developer works on Drip: from a Codex session to implementation, deployment, and the live website.

## Product planning

- `whiteboard/auto_drop.jpg` — Spec table for "Auto Drop" (recurring automatic campaigns) across product, tech, risks, and Codex features. Still a future idea; see the PRD's Future Ideas.
- `whiteboard/demo_stack.jpg` — Planned demo sequence plus the tech-stack and skills shortlist.
- `whiteboard/repo_structure.jpg` — The repo layout as first proposed. The README's Repo layout section is current.
- `whiteboard/prototypes.jpg` — The prototype checklist used to de-risk the build. The surviving prototype lives in [`references/sandbox-prototypes/`](../references/sandbox-prototypes/).
