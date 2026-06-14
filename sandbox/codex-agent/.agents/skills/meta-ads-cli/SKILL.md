---
name: meta-ads-cli
description: Use when a sandbox task needs Meta Ads account, campaign, ad set, ad, creative, catalog, dataset, pixel, or insights work through the official Meta Ads CLI.
---

# Meta Ads CLI

Use the official `meta` command from the `meta-ads` Python package. The base
sandbox snapshot preinstalls it, so do not install it per run unless the command
is missing.

## Runtime Config

The runner maps Drip's private Meta env vars into the official CLI env names:

- `ACCESS_TOKEN`
- `AD_ACCOUNT_ID`
- `BUSINESS_ID`

Before work, run a read-only smoke:

```bash
meta --version
meta auth status
meta ads adaccount list
```

If `AD_ACCOUNT_ID` is configured, a campaign or insights read is a useful second
smoke:

```bash
meta ads campaign list
meta ads insights get --date-preset last_7d --limit 1
```

## Safety

- Never print the access token.
- Avoid printing raw business, ad account, app, pixel, catalog, dataset, page,
  Instagram, campaign, ad set, ad, or creative IDs in final answers.
- Prefer read-only commands until the user explicitly asks to create, update, or
  delete an ad asset.
- Creating real ads still needs a valid payment method, a Page or Instagram
  asset with access, policy review, and any account-level Meta restrictions to
  be clear.
