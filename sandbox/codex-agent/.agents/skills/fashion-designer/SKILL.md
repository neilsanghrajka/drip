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

- `approvedIdeas`: approved Scout candidate ideas, or an instruction to read a Scout artifact
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
3. Create a concise design brief per idea: audience, product angle, fit, color palette, print placement, typography/style direction, and avoid-list.
4. Plan a surplus candidate pool. Generate more images than the requested final count:
   - Target at least `mocksPerIdea * candidateMultiplier`.
   - For very small requests, generate at least two candidates so there is something to discard.
   - Keep the pool bounded by time and cost; prefer enough useful variation over exhaustive exploration.
5. Spawn product subagents in parallel. Split by product family and, when useful, by visual angle so image generation can run at the same time:
   - `cap-designer` for cap concepts and mock images.
   - `sock-designer` for sock concepts and mock images.
   - `apparel-designer` for tees, hoodies, bundles, product-on-model shots, and product bundle images.
6. Ask each product subagent to use `$imagegen` and return compact JSON with generated asset paths, prompts, candidate ids, concepts, and self-review notes.
7. Spawn `fashion-reviewer` after the first generation wave. Give it the full candidate pool, requested final count, taste constraints, and image paths.
8. `fashion-reviewer` keeps the best assets, rejects weak ones, and returns regeneration requests only for gaps that matter.
9. If fewer than the requested mocks are usable, run at most `maxRegenerationRounds` targeted regeneration pass through the relevant product subagent, then ask `fashion-reviewer` to review only the new replacements.
10. Use Fashion Designer judgment to choose the final user-review set from the reviewer-approved candidates.
11. Write the final JSON file, replacing any existing file.
12. Verify the JSON parses and referenced image files exist, then return a short status with the artifact path.

Keep responsibilities separated:

- Product subagents: image generation and self-review for one product family only.
- `$imagegen`: official image-generation workflow and asset handling rules.
- `fashion-reviewer`: visual QA, rejection, curation, and regeneration briefs.
- Fashion Designer: final product direction, speed/quality tradeoff, category balance, and artifact writing.

## Speed And Parallelism

- Optimize for wall-clock time. Prefer several narrow product subagent calls over one large sequential call.
- Start independent product categories in parallel whenever the request allows it.
- For a single product category, split into 2-3 visual lanes when useful: for example, `minimal embroidery`, `graphic patch`, and `lifestyle product shot`.
- Do not wait for perfect images. Once the reviewer has enough strong candidates for the requested count, stop extra regeneration.
- Run only one focused regeneration round by default. Extra rounds need explicit user instruction or a severe blocker.
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
- Never create local placeholder art, SVG/canvas/code-rendered mockups, or locally rendered substitute PNGs as a replacement for `$imagegen`.
- Keep generated concepts original. Do not copy logos, team marks, album art, lyrics, celebrity likenesses, protected characters, or protected brand trade dress.
- Prefer fashion-forward, restrained, collectible product mockups over low-effort meme merch.

## Judgment Rules

- Design for the cultural moment without copying protected source material.
- Create product concepts, not final manufacturing specs.
- Include caps and socks when feasible; add tees, hoodies, bundles, and product-on-model shots when they fit the idea.
- Select a varied review set. Do not return five near-duplicates of the same product.
- Generate surplus candidates, but write only reviewer-approved final concepts to `concepts`.
- Preserve a compact review trail in `review`, especially rejected text/image-quality issues and regeneration decisions.
- Explain why each mock is worth showing to the user before ad testing.
- If fewer than the requested mocks are usable, return fewer and explain why in `strategy.notes`.

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
      "requestedFinalMocks": 5,
      "candidateTarget": 10,
      "parallelLanes": ["cap", "sock", "apparel"],
      "regenerationRoundsUsed": 0
    },
    "notes": []
  },
  "review": {
    "reviewerAgent": "fashion-reviewer",
    "candidateCount": 10,
    "keptCount": 5,
    "rejectedCount": 5,
    "regenerationRequests": [],
    "notes": []
  },
  "concepts": [
    {
      "ideaRef": "Scout idea or candidate id",
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
          "candidateId": "cap-a-01",
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
