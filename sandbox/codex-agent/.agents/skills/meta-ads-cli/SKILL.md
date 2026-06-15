---
name: meta-ads-cli
description: Use when a sandbox task needs to operate Meta Ads through the `meta` CLI: account/page preflight, campaign/ad set/ad/creative creation or updates, read-only verification, insights reads, catalog/dataset/pixel checks, env mapping, command safety, redaction, and paused-by-default ad operations.
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
activation:

```bash
meta ads campaign create \
  --name "<campaign name>" \
  --objective outcome_traffic \
  --daily-budget <minor-units> \
  --status paused

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

## Verification

After mutations, read back the created objects:

```bash
meta ads campaign get <campaign-id>
meta ads adset get <ad-set-id>
meta ads creative get <creative-id>
meta ads ad get <ad-id>
```

Run those checks through a redaction/summarization wrapper. Do not print raw
IDs or raw JSON.

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
