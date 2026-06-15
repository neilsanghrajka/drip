---
name: performance-marketer
description: Use for Drip Performance Marketer work. Performance Marketer turns selected Fashion Designer mock images into real Facebook-only Meta ad campaign objects through the Meta Ads CLI, keeps everything paused, writes performance-marketer-output.json, and stops before activation, insights readback, or winner recommendation.
---

# Performance Marketer

Performance Marketer creates paused Facebook ad test objects for selected Drip
mock images. It does not discover trends, generate fashion mockups, activate
ads, read performance, choose a winner, or build storefronts.

The caller can stay lean:

```text
Use $performance-marketer to create a paused Facebook ad campaign for these 3 ideas and 6 selected images: [...]
```

## Inputs

Accept selected ideas and image paths directly in the prompt or from a provided
artifact. Infer safe defaults when omitted.

- `ideas`: default maximum `3`
- `imagesPerIdea`: default `2`
- `input`: optional artifact path, default
  `/vercel/sandbox/agent-workspace/fashion-designer-output.json`
- `assetDir`: default
  `/vercel/sandbox/agent-workspace/performance-marketer-assets`
- `output`: default
  `/vercel/sandbox/agent-workspace/performance-marketer-output.json`
- `budgetMinorUnits`: default `10000`
- `currency`: infer from ad account when possible, otherwise record `unknown`
- `targetingCountries`: default `IN` unless prompt says otherwise
- `objective`: always `outcome_traffic` for this v1 recipe
- `destinationUrl`: default to the selected Facebook Page URL

For explicit sandbox smoke prompts only, if no real image paths exist and the
prompt says to create smoke input images, create six simple local JPEG files
under `/vercel/sandbox/agent-workspace/performance-marketer-smoke-input/` and
record `input.syntheticSmokeImages: true`. Do not use synthetic images in
normal product runs. Do not install npm/Python packages for smoke images. Use a
built-in tiny JPEG byte fixture or plain Node standard-library code, copy the
files into `assetDir`, and validate with extension plus JPEG/PNG/WebP magic
bytes in Node. Do not rely on the `file` binary; it is not guaranteed in the
sandbox base image.

## Workflow

1. Parse up to three ideas and exactly two selected images per idea when
   available. If more are provided, keep the first three ideas and first two
   images per idea, then record omissions.
2. Verify every normal input image path exists, is under the agent workspace,
   and has a PNG/JPEG/WebP extension. Copy or convert accepted images into
   `assetDir` when needed.
3. Build a compact ad brief containing idea refs, product names, mock image
   paths, targeting country, budget cap, Page requirement, and safety rules.
4. Ask `facebook-ad-copywriter` for JSON only. It must fill the copy schema and
   do nothing else.
5. Ask `facebook-ad-operator` to use `$meta-ads-cli` and create the exact v1
   recipe. The work order should contain the copywriter JSON, image paths,
   budget, and country only. Do not describe command strategy in the work order;
   `$meta-ads-cli` owns the exact command recipe.
   - one paused Facebook traffic campaign
   - three paused ad sets, one per idea
   - six creatives, one per selected image
   - six paused ads, one per creative
   - no activation and no insights readback
6. Convert the operator response into the final artifact. Do not spawn a
   second Meta agent. Do not ask for a second status pass. Use the
   operator's sanitized creation evidence and configured paused states.
7. Write `performance-marketer-output.json`, replacing any previous file.
8. Validate the JSON parses and the output records `facebookOnly: true`,
   `activationPerformed: false`, and `insightsReadbackPerformed: false`.
9. Return a short status with the output path and created object counts, not
    raw IDs or dashboard URLs.

If named subagents are unavailable, spawn generic subagents with the same work
orders. Keep Meta execution delegated to the operator; the main thread owns the
artifact and final safety judgment.

## Output

Write:

```text
/vercel/sandbox/agent-workspace/performance-marketer-output.json
```

Use this schema:

```json
{
  "schemaVersion": "performance-marketer.facebook-campaign.v1",
  "generatedAt": "ISO timestamp",
  "input": {
    "source": "fashion-designer-output.json or prompt",
    "ideaRefs": ["idea_01", "idea_02", "idea_03"],
    "imagesPerIdea": 2,
    "syntheticSmokeImages": false,
    "omittedIdeaRefs": [],
    "omittedImageRefs": []
  },
  "safety": {
    "facebookOnly": true,
    "allCreatedPaused": true,
    "activationPerformed": false,
    "insightsReadbackPerformed": false,
    "rawMetaIdsPersisted": false
  },
  "campaign": {
    "name": "Campaign name",
    "safeRef": "campaign:<redacted-or-hash>",
    "objective": "outcome_traffic",
    "budgetMinorUnits": 10000,
    "currency": "INR",
    "configuredStatus": "PAUSED",
    "effectiveStatus": "PAUSED"
  },
  "adSets": [
    {
      "ideaRef": "idea_01",
      "name": "Ad set name",
      "safeRef": "adset:<redacted-or-hash>",
      "targetingCountries": ["IN"],
      "configuredStatus": "PAUSED",
      "effectiveStatus": "PAUSED"
    }
  ],
  "ads": [
    {
      "ideaRef": "idea_01",
      "imageRef": "idea_01-image-01",
      "imagePath": "/vercel/sandbox/agent-workspace/performance-marketer-assets/idea_01-image-01.jpg",
      "creativeName": "Creative name",
      "adName": "Ad name",
      "creativeSafeRef": "creative:<redacted-or-hash>",
      "adSafeRef": "ad:<redacted-or-hash>",
      "headline": "Short headline",
      "body": "Short body copy.",
      "callToAction": "learn_more",
      "configuredStatus": "PAUSED",
      "effectiveStatus": "PENDING_REVIEW"
    }
  ],
  "verification": {
    "verifiedAt": "ISO timestamp",
    "source": "facebook-ad-operator-created-object-evidence",
    "campaignCount": 1,
    "adSetCount": 3,
    "creativeCount": 6,
    "adCount": 6,
    "pausedObjectCount": 10,
    "issues": []
  },
  "strategy": {
    "subagentsUsed": [
      "facebook-ad-copywriter",
      "facebook-ad-operator"
    ],
    "notes": []
  }
}
```

Validate it parses:

```bash
node -e 'JSON.parse(require("node:fs").readFileSync("/vercel/sandbox/agent-workspace/performance-marketer-output.json", "utf8")); console.log("json-ok")'
```

## Safety

- Use `$meta-ads-cli` for all Meta CLI command knowledge.
- Keep Performance Marketer-specific campaign counts and Drip output shape in
  this skill and its subagents.
- Never print tokens, raw account IDs, raw Page IDs, raw campaign/ad set/ad
  IDs, raw creative IDs, dashboard URLs, or private env values.
- Remember that command stdout/stderr is streamed into Convex events. Require
  the operator to wrap Meta CLI calls so raw IDs, Page access tokens, and raw
  JSON never print to the event stream.
- There is no second Meta status agent in this flow. It is too slow for the
  hackathon path and duplicates evidence the operator already has from created
  objects.
- Do not run `meta ads insights` in v1.
- Do not update any object to active.
- If campaign creation fails before a campaign ID is returned, stop with a
  sanitized blocker and do not request a focused retry of
  `meta ads campaign create`. The only valid campaign-create path in this
  sandbox is the `$meta-ads-cli` Graph fallback with
  `special_ad_categories=[]`.
- If Meta reports configured active delivery, stop and report failure rather
  than continuing.
