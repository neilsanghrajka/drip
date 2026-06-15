---
name: fashion-designer
description: Use for Drip Fashion Designer work. Fashion Designer turns approved Scout ideas into beautiful product mockups, overgenerates image candidates in parallel, uses reviewer curation, and writes fashion-designer-output.json.
---

# Fashion Designer

Fashion Designer turns approved Scout ideas into product concepts and mock
images. It does not discover trends, run ads, post to Convex, or build
storefronts.

## Inputs

Accept lean user prompts. Infer reasonable defaults when omitted.

- `approvedIdeas`: approved Scout candidate ideas as a batch, or an instruction to read a Scout artifact
- `maxApprovedIdeas`: hard maximum `3`; never process more than three ideas in one run
- `input`: optional artifact path, default `/vercel/sandbox/agent-workspace/scout-output.json`
- `productCategories`: default `caps`, `socks`, `tees`, `hoodies`, and `bundles`
- `tasteConstraints`: optional audience, brand, palette, fit, or avoid-list guidance
- `mocksPerIdea`: default about `5`
- `candidateMultiplier`: default `2`, meaning generate about twice as many candidates as final mocks requested
- `maxRegenerationRounds`: default `1`
- `assetDir`: default `/vercel/sandbox/agent-workspace/fashion-designer-assets`
- `output`: default `/vercel/sandbox/agent-workspace/fashion-designer-output.json`

## Workflow

Fashion Designer owns orchestration. The caller should not need to describe the
image-generation plan.

1. Parse approved ideas, product categories, taste constraints, output path, and asset directory.
2. If approved ideas are missing, read the input Scout artifact if available.
3. Enforce the hard batch cap: process at most three approved ideas. If more than three ideas are provided, keep the first three by explicit user order, approval order, or Scout artifact order, omit the rest, and record omitted idea refs in `input.omittedIdeaIds` and `strategy.notes`.
4. Treat the capped input as a batch: `approvedIdeas[] -> perIdeaBriefs[] -> workOrders[] -> reviewer -> grouped output`.
5. For each approved idea, create exactly one concise design brief: audience, product angle, category choices, fit, color palette, print placement, typography/style direction, and avoid-list.
6. Choose product categories per idea. Use requested `productCategories` when provided; otherwise pick categories that fit the idea. `mocksPerIdea` is the final target per idea, not a global target.
7. Create work orders for the matrix of `ideaRef x productCategory`. Each work order should include:
   - `ideaRef`
   - `ideaBrief`
   - `productCategory`
   - `targetFinalMocks`
   - `candidateTarget`
   - `assetDir`
   - `tasteConstraints`
8. Distribute `mocksPerIdea` across the selected product categories for each idea unless the user explicitly provides per-category targets. Generate more image candidates than the final count:
   - Target at least `targetFinalMocks * candidateMultiplier` per work order.
   - For very small work orders, generate at least two candidates so there is something to discard.
   - Keep the pool bounded by time and cost; prefer useful variation over exhaustive exploration.
9. Spawn product subagents by work order, not just by product family:
   - Use `cap-designer` for `caps` work orders.
   - Use `sock-designer` for `socks` work orders.
   - Use `apparel-designer` for `tees`, `hoodies`, `bundles`, product-on-model shots, and product bundle work orders.
   - Use the same subagent type multiple times when several ideas or category lanes need it.
10. Run work orders in bounded waves and reserve one thread slot for review. With current `max_threads = 6`, run at most five product-lane subagents at once. If work orders exceed five lanes, run them in waves.
11. Ask each product subagent to use `$imagegen` and return compact JSON with `ideaRef` on every candidate asset. As soon as a product subagent returns its compact JSON, copy the result into the main candidate pool and close that subagent thread before spawning more product lanes or the reviewer. Do not leave completed product-lane agents open.
12. Spawn `fashion-reviewer` after each generation wave or after the full first generation wave. Before spawning it, verify all completed product-lane subagents from that wave are closed so the reviewer has a free thread slot. Give it the candidate pool grouped by idea, requested final count per idea, taste constraints, and image paths.
   - If reviewer spawn fails because of thread capacity, close any remaining completed product-lane agents, then retry the reviewer once.
   - If reviewer spawn still fails after cleanup, do not hang. Perform the curation in the main Fashion Designer thread, record the fallback in `review.notes`, and write the artifact.
   - Never stop after a failed reviewer spawn while product candidates already exist; finish curation or fail loudly with a compact reason.
13. `fashion-reviewer` reviews and culls per idea. It should keep enough candidates for each idea and avoid accidentally keeping all best-looking images from one idea while starving another.
14. If an idea has fewer than `mocksPerIdea` usable mocks, run at most `maxRegenerationRounds` targeted regeneration pass through the relevant product subagent, then ask `fashion-reviewer` to review only the new replacements for that idea.
15. Use Fashion Designer judgment to choose the final user-review set from reviewer-approved candidates, preserving grouping by `ideaRef`.
16. Write the final JSON file, replacing any existing file.
17. Verify the JSON parses and referenced image files exist, then return a short status with the artifact path.

Example work orders:

```json
[
  {
    "ideaRef": "idea_01",
    "productCategory": "caps",
    "targetFinalMocks": 2,
    "candidateTarget": 4
  },
  {
    "ideaRef": "idea_01",
    "productCategory": "socks",
    "targetFinalMocks": 2,
    "candidateTarget": 4
  },
  {
    "ideaRef": "idea_03",
    "productCategory": "tees",
    "targetFinalMocks": 2,
    "candidateTarget": 4
  }
]
```

Keep responsibilities separated:

- Product subagents: one work order at a time, image generation, and self-review for one product family only.
- `$imagegen`: official image-generation workflow and asset handling rules.
- `fashion-reviewer`: visual QA, rejection, curation, and regeneration briefs.
- Fashion Designer: final product direction, speed/quality tradeoff, category balance, and artifact writing.

## Speed And Parallelism

- Optimize for wall-clock time. Prefer several narrow product subagent calls over one large sequential call.
- Start independent work orders in parallel whenever the request allows it, but keep one thread slot free for review/cleanup.
- Spawn by work order. For example, run `idea_01 caps`, `idea_01 socks`, `idea_02 caps`, `idea_02 socks`, and `idea_03 caps` together, close completed lane agents after collecting their JSON, then run `idea_03 socks` or the reviewer. Do not keep six completed product-lane agents open and then try to spawn `fashion-reviewer`.
- For larger batches, run waves. Wave 1 should usually cover the strongest cap/sock lanes across ideas; Wave 2 can cover remaining apparel, bundle, or product-on-model lanes.
- For a single product category inside one idea, split into 2-3 visual lanes only when it helps reach the work order candidate target: for example, `minimal embroidery`, `graphic patch`, and `lifestyle product shot`.
- Do not wait for perfect images. Once the reviewer has enough strong candidates for the requested count, stop extra regeneration.
- Run only one focused regeneration round by default. Extra rounds need explicit user instruction or a severe blocker.
- When the official `$imagegen` CLI fallback is used for a surplus pool, prefer `generate-batch` with a small JSONL job file and `--concurrency 3-5` so independent candidate prompts run together.
- For normal fashion product mock candidates, prefer `gpt-image-2`, `quality=medium`, and `size=1024x1024`. Use higher quality only for dense text, complex details, or explicit user direction.
- For opaque product photos where transparency is not needed, `jpeg` or `webp` output is acceptable; `jpeg` with about `output_compression=85` is preferred when latency matters.
- Do not use deterministic code to rank or score images. The speed plan is procedural; quality selection is model judgment.

## Product Mockup Direction

- Generate beautiful fashion product mockups, not websites, storefronts, landing pages, poster layouts, or ad dashboards.
- The product should dominate the image: cap, socks, tee, hoodie, or bundle should be the clear subject.
- Prefer premium product photography cues: clean studio lighting, tactile materials, realistic embroidery/knit/print texture, proportional product shape, and tasteful styling props only when they help.
- Use simple backgrounds. Avoid UI chrome, browser windows, product-page layouts, floating CTA buttons, price badges, and ecommerce grids.
- When text is required on the product, keep it short and high contrast; reviewer should reject unreadable or misspelled product text.
- Make each image feel like something a fashion buyer would compare, not a meme image someone pasted on a blank template.

## Image Generation Rules

- Use the official `$imagegen` skill for every raster image.
- Use built-in image generation by default.
- If built-in image generation is unavailable and the request requires real generated images, use the official `$imagegen` CLI fallback only when `OPENAI_API_KEY` is available.
- If neither built-in image generation nor the official CLI fallback is available, fail loudly and explain the blocker.
- Save project-bound final assets under `fashion-designer-assets/`.
- Never leave campaign assets only under `$CODEX_HOME/generated_images`.
- Generated assets may be PNG, JPEG, or WebP, but every path recorded in JSON must point to a real file under the workspace asset directory.
- Never create local placeholder art, SVG/canvas/code-rendered mockups, or locally rendered substitute images as a replacement for `$imagegen`.
- Keep generated concepts original. Do not copy logos, team marks, album art, lyrics, celebrity likenesses, protected characters, or protected brand trade dress.
- Prefer fashion-forward, restrained, collectible product mockups over low-effort meme merch.

## Judgment Rules

- Design for the cultural moment without copying protected source material.
- Create product concepts, not final manufacturing specs.
- Include caps and socks when feasible; add tees, hoodies, bundles, and product-on-model shots when they fit the idea.
- Select a varied review set per idea. Do not return five near-duplicates of the same product for one idea, and do not starve an idea because another idea produced prettier mocks.
- Generate surplus candidates per idea, but write only reviewer-approved final concepts to `concepts`.
- Preserve a compact review trail in `review`, especially rejected text/image-quality issues and regeneration decisions.
- Explain why each mock is worth showing to the user before ad testing.
- If fewer than the requested mocks are usable for an idea, return fewer for that idea and explain why in both `ideas[].review.notes` and `strategy.notes`.

Do not use deterministic code to rank, score, or select final concepts. Visual
taste, fit, category balance, and final rationale are Fashion Designer's model
judgment.

## Output

Write the final artifact to `fashion-designer-output.json` unless the user
explicitly gives another output path. Validate it parses:

```bash
node -e 'JSON.parse(require("node:fs").readFileSync("fashion-designer-output.json", "utf8")); console.log("json-ok")'
```

Use this schema:

```json
{
  "schemaVersion": "fashion-designer.concepts.v1",
  "generatedAt": "ISO timestamp",
  "input": {
    "source": "scout-output.json",
    "approvedIdeaIds": [],
    "maxApprovedIdeas": 3,
    "omittedIdeaIds": [],
    "productCategories": ["caps", "socks", "tees", "hoodies", "bundles"],
    "mocksPerIdea": 5,
    "candidateMultiplier": 2,
    "maxRegenerationRounds": 1,
    "tasteConstraints": []
  },
  "strategy": {
    "assetDir": "/vercel/sandbox/agent-workspace/fashion-designer-assets",
    "subagentsUsed": ["cap-designer", "sock-designer", "apparel-designer", "fashion-reviewer"],
    "candidatePlan": {
      "requestedFinalMocksPerIdea": 5,
      "totalRequestedFinalMocks": 15,
      "totalCandidateTarget": 30,
      "workOrders": [
        {
          "ideaRef": "idea_01",
          "productCategory": "caps",
          "targetFinalMocks": 2,
          "candidateTarget": 4,
          "subagent": "cap-designer"
        }
      ],
      "waves": [
        ["idea_01 caps", "idea_01 socks", "idea_02 caps", "idea_02 socks", "idea_03 caps", "idea_03 socks"]
      ],
      "regenerationRoundsUsed": 0
    },
    "notes": []
  },
  "review": {
    "reviewerAgent": "fashion-reviewer",
    "candidateCount": 30,
    "keptCount": 15,
    "rejectedCount": 15,
    "byIdea": [
      {
        "ideaRef": "idea_01",
        "kept": ["idea_01-cap-01"],
        "rejected": ["idea_01-cap-02"],
        "regenerationRequests": [],
        "notes": []
      }
    ],
    "regenerationRequests": [],
    "notes": []
  },
  "ideas": [
    {
      "ideaRef": "idea_01",
      "brief": {
        "audience": "Who this idea is for.",
        "productAngle": "How the cultural moment becomes fashion.",
        "productCategories": ["caps", "socks"],
        "palette": ["ink", "cream"],
        "avoid": []
      },
      "candidateCount": 10,
      "keptCount": 5,
      "review": {
        "kept": ["idea_01-cap-01"],
        "rejected": ["idea_01-cap-02"],
        "regenerationRequests": [],
        "notes": []
      },
      "concepts": []
    }
  ],
  "concepts": [
    {
      "ideaRef": "idea_01",
      "conceptName": "Concept name",
      "productType": "cap",
      "fit": "structured six-panel cap",
      "colorPalette": ["ink", "cream"],
      "printPlacement": "front embroidery",
      "styleDirection": "quiet fan-inspired celebration piece",
      "rationale": "Why this concept fits the approved idea.",
      "imageAssets": [
        {
          "path": "/vercel/sandbox/agent-workspace/fashion-designer-assets/example.png",
          "category": "cap",
          "ideaRef": "idea_01",
          "candidateId": "idea_01-cap-01",
          "prompt": "Prompt used with imagegen.",
          "reviewDecision": "kept",
          "reviewNotes": "Visual QA and why it is usable."
        }
      ],
      "selectedForReview": true
    }
  ]
}
```
