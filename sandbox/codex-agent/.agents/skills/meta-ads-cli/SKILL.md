---
name: meta-ads-cli
description: Use when a sandbox task needs to operate Meta Ads through the `meta` CLI: account/page preflight, campaign/ad set/ad/creative creation or updates, optional read-only status checks, insights reads, catalog/dataset/pixel checks, env mapping, command safety, redaction, and paused-by-default ad operations.
---

# Meta Ads CLI

Use the `meta` command already installed in the Drip sandbox base image. Do not
install or upgrade the CLI during a run unless the command is missing and the
caller explicitly asks you to repair the runtime.

Drip's current verified sandbox path installs the Python `meta-ads` package as a
Python 3.12 uv tool. Meta's public Ads CLI docs may describe a newer package or
OAuth flow; before changing this repo's install/auth model, verify the official
docs and update the base snapshot setup, docs, and smoke checks together.

## Runtime

The runner maps Drip's private Meta env vars into the official CLI env names:

- `ACCESS_TOKEN`
- `AD_ACCOUNT_ID`
- `BUSINESS_ID`

Required private inputs:

- `META_ADS_ACCESS_TOKEN` or `ACCESS_TOKEN`
- `META_ADS_AD_ACCOUNT_ID` or `AD_ACCOUNT_ID`
- `META_ADS_BUSINESS_ID` or `BUSINESS_ID` when business-scoped commands need it

Never print token values. Avoid printing raw business, ad account, app, Page,
Instagram, campaign, ad set, ad, creative, pixel, catalog, or dataset IDs in
final answers.

## Preflight

Start with read-only checks:

```bash
meta --version
meta auth status
meta ads adaccount list
meta ads page list
meta ads campaign list
```

If the task only needs reporting, a bounded insights read is acceptable:

```bash
meta ads insights get --date-preset last_7d --limit 1
```

Treat `meta auth status` and raw `list/get` output as sensitive logs. Summarize
presence and statuses instead of copying account details.

Codex streams command stdout/stderr into Convex events. For commands that may
print tokens, IDs, or dashboard URLs, do not run them in a way that prints raw
output. Use one of these patterns:

- pipe JSON into a short parser that prints only counts/statuses
- redirect raw stdout/stderr to a private workspace file and print a sanitized
  summary
- write a small shell script containing raw IDs as variables, run the script by
  filename, and ensure the script prints only sanitized evidence

Never print raw output from:

- `meta auth status`
- `meta ads adaccount list`
- `meta ads page list`
- `meta ads campaign/adset/ad/creative get`
- any command that returns an `access_token` field

## Paused Creation Pattern

For campaign creation, prefer paused objects unless the user explicitly approves
activation.

### Exact Drip Facebook Creation Recipe

For Performance Marketer, run exactly this recipe. Do not add another Meta
agent, insights readback, optimization loop, or extra Meta exploration.

Inputs:

- `campaignName`
- three `adSets` with `ideaRef` and `name`
- six `ads` with `ideaRef`, `imageRef`, `imagePath`, `creativeName`, `adName`,
  `headline`, `body`, `description`, and `callToAction`
- `budgetMinorUnits`, default `10000`
- `targetingCountries`, default `IN`
- optional `destinationUrl`; otherwise use the first accessible Facebook Page URL

Do this:

1. Run independent read-only preflight checks together where practical:
   `meta --version`, `meta auth status`, `meta ads adaccount list`,
   `meta ads page list`, and `meta ads campaign list`.
2. Select the first accessible Facebook Page from `meta ads page list`.
3. Create one campaign with the Graph campaign-create call below. Required:
   `objective=OUTCOME_TRAFFIC`, `status=PAUSED`, `daily_budget=<budgetMinorUnits>`,
   and `special_ad_categories=[]`.
4. Create the three ad sets under that campaign. Required:
   `--optimization-goal link_clicks`, `--billing-event impressions`,
   `--bid-amount 100`, `--targeting-countries <country>`, `--status paused`.
5. Create the six creatives using the selected Page ID and image paths.
   Required: `--call-to-action learn_more`.
6. Create the six ads, each attached to its matching ad set and creative, with
   `--status paused`.
7. Immediately run `meta ads ad update <ad-id> --status paused` for each ad.
8. Stop. Do not run insights. Do not spawn another agent. Do not poll for review.

Use one private workspace script and run it once. The script may run independent
ad set, creative, ad, and pause-update commands concurrently with bounded
concurrency. Keep raw outputs in private files or variables only. Do not echo
raw commands containing IDs.

Return exactly one compact sanitized JSON object:

```json
{
  "status": "created",
  "campaign": {
    "name": "Campaign name",
    "safeRef": "campaign:<hash>",
    "objective": "outcome_traffic",
    "budgetMinorUnits": 10000,
    "currency": "unknown",
    "configuredStatus": "PAUSED",
    "effectiveStatus": "UNKNOWN"
  },
  "adSets": [
    {
      "ideaRef": "idea_01",
      "name": "Ad set name",
      "safeRef": "adset:<hash>",
      "targetingCountries": ["IN"],
      "configuredStatus": "PAUSED",
      "effectiveStatus": "UNKNOWN"
    }
  ],
  "ads": [
    {
      "ideaRef": "idea_01",
      "imageRef": "idea_01-image-01",
      "imagePath": "/vercel/sandbox/agent-workspace/performance-marketer-assets/idea_01-image-01.jpg",
      "creativeName": "Creative name",
      "adName": "Ad name",
      "creativeSafeRef": "creative:<hash>",
      "adSafeRef": "ad:<hash>",
      "headline": "Headline",
      "body": "Body copy.",
      "callToAction": "learn_more",
      "configuredStatus": "PAUSED",
      "effectiveStatus": "UNKNOWN"
    }
  ],
  "counts": {
    "campaigns": 1,
    "adSets": 3,
    "creatives": 6,
    "ads": 6
  },
  "evidence": {
    "allConfiguredPaused": true,
    "activationPerformed": false,
    "insightsReadbackPerformed": false,
    "rawMetaIdsReturned": false,
    "issues": []
  }
}
```

`UNKNOWN` effective status is acceptable for the hackathon artifact when the
create/update commands succeeded and all configured statuses are paused. Meta
review can lag and status reads can hit rate limits after repeated smoke runs.

### Campaign Creation Decision

In the current Drip sandbox, create campaigns with the Graph fallback first.
Then use the `meta` CLI for ad sets, creatives, ads, updates, and read-only
verification.

Why: Meta requires every new campaign to declare special ad categories. For
normal Drip apparel/drop traffic tests, use an empty category list:
`special_ad_categories=[]`. This means no credit, employment, housing, social
issues, elections, or politics category applies. The verified sandbox CLI
(`meta` from `meta-ads` 1.0.1) does not expose a campaign-create flag for this
field, so `meta ads campaign create` can fail even when the account, token,
Page, billing, and budget are valid.

Do not try to avoid this field. Do not use `--adset-budget-sharing` as a
workaround for Drip. Do not retry the same failing CLI campaign command after
Meta reports `special_ad_categories` is required.

Only use `meta ads campaign create` if a future installed CLI help output shows
a clear special-category flag and you include an empty special category list.

### Graph Campaign Create

Required fields for Drip:

- `name`: campaign name from the work order
- `objective`: `OUTCOME_TRAFFIC`
- `status`: `PAUSED`
- `daily_budget`: approved budget in minor units
- `special_ad_categories`: `[]`
- `access_token`: `${ACCESS_TOKEN}`

Run the Graph call from a private wrapper script. Redirect raw output to a
private workspace file, parse the returned campaign ID, hash it for safe refs,
and print only sanitized evidence.

```bash
META_API_VERSION="${META_API_VERSION:-v25.0}"
curl -sS -X POST "https://graph.facebook.com/${META_API_VERSION}/${AD_ACCOUNT_ID}/campaigns" \
  -F "name=<campaign name>" \
  -F "objective=OUTCOME_TRAFFIC" \
  -F "status=PAUSED" \
  -F "daily_budget=<minor-units>" \
  -F "special_ad_categories=[]" \
  -F "access_token=${ACCESS_TOKEN}"
```

Immediately verify the campaign with a Graph `GET` for only these safe fields:
`name`, `objective`, `status`, `configured_status`, `effective_status`,
`daily_budget`, and `special_ad_categories`. Do not print the raw response.

The expected campaign state is:

- `status`: `PAUSED`
- `configured_status`: `PAUSED`
- `effective_status`: `PAUSED`
- `special_ad_categories`: `[]`

### Downstream CLI Create

After the campaign ID exists, use the CLI for child objects:

```bash
meta ads adset create <campaign-id> \
  --name "<ad set name>" \
  --optimization-goal link_clicks \
  --billing-event impressions \
  --bid-amount <minor-units> \
  --targeting-countries <country-code> \
  --status paused

meta ads creative create \
  --name "<creative name>" \
  --image <local-image-path> \
  --page-id <page-id> \
  --body "<ad body>" \
  --link-url "<destination url>" \
  --title "<headline>" \
  --description "<description>" \
  --call-to-action learn_more

meta ads ad create <ad-set-id> \
  --name "<ad name>" \
  --creative-id <creative-id> \
  --status paused

meta ads ad update <ad-id> --status paused
```

Budget values are minor currency units. Keep budgets at or below the user
approved cap and record the currency/budget assumption.

## Optional Manual Status Checks

Only run read-only status checks when the caller explicitly asks for them or
when a create command reports an ambiguous failure. They are not part of the
normal Performance Marketer hackathon flow.

```bash
meta ads campaign get <campaign-id>
meta ads adset get <ad-set-id>
meta ads creative get <creative-id>
meta ads ad get <ad-id>
```

Run checks through a redaction/summarization wrapper. Do not print raw IDs or
raw JSON. Do not read insights.

Expected safe state:

- campaign configured status is paused
- ad set configured status is paused
- ad configured status is paused
- ad effective status may be pending review or processing while configured
  paused

## Safety Rules

- Prefer read-only commands until the caller asks for a write.
- Create objects as `paused` by default.
- Do not activate campaigns, ad sets, or ads without explicit user approval for
  live delivery.
- Use Facebook-only Page identity unless the caller explicitly asks for another
  placement and the asset is wired.
- Return concise sanitized evidence: names, configured/effective statuses,
  budget, currency, and counts.
- Do not return raw dashboard URLs, tokens, account IDs, Page IDs, campaign IDs,
  ad set IDs, ad IDs, or creative IDs in final answers.
- If a command fails because billing, policy prompts, permissions, wrong account
  ID, or Page access is missing, fail loudly with the blocker and the next
  operator action.
