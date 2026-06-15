# Meta Ads CLI

Last updated: 2026-06-07

This guide captures the Meta Ads CLI proof for Drip's Performance Marketer.
The intent is to let a sandbox agent create real Meta ad assets, keep spend
under operator control, and return enough evidence for the Drip user to review
what was tested.

This is not a simulated ad flow. The Performance Marketer should create real
Meta campaign objects, but it should default to paused objects until the user
explicitly approves delivery.

## Product Intent

Drip's Performance Marketer validates selected mock images before the user
commits to a drop.

| Product need | Meta Ads CLI behavior |
| --- | --- |
| Test demand for selected mock images | Create campaigns, ad sets, creatives, and ads from the selected images. |
| Keep the user in control | Create assets as `PAUSED` first and require explicit approval before activation. |
| Show visible evidence | Return campaign/ad status, budget, creative names, and an Ads Manager review artifact. |
| Recommend a winner | Poll insights after delivery and compare CTR, CPC, engagement, comments, saves, or landing-page signals. |

For the hackathon demo, the minimum credible proof is:

1. A Facebook Page identity exists.
2. A Meta ad account exists with billing ready.
3. The sandbox agent can authenticate with the official `meta` CLI.
4. The CLI can create a paused campaign, paused ad set, creative, and paused ad.
5. The objects are visible in Ads Manager and verifiable with CLI `list`/`get`.

## Relationship Map

```mermaid
flowchart LR
  Person["Personal Facebook user"]
  Business["Business portfolio"]
  Page["Facebook Page<br/>ad identity"]
  Account["Ad account<br/>budget + billing"]
  App["Meta developer app"]
  SystemUser["System user"]
  Token["System-user token"]
  CLI["meta CLI"]

  Campaign["Campaign<br/>objective + budget"]
  AdSet["Ad set<br/>audience + bidding"]
  Creative["Creative<br/>image + copy + Page"]
  Ad["Ad<br/>ad set + creative"]

  Person -->|"admin setup"| Business
  Business --> Page
  Business --> Account
  Business --> App
  Business --> SystemUser
  SystemUser -->|"permissions"| Page
  SystemUser -->|"permissions"| Account
  SystemUser -->|"permissions"| App
  SystemUser --> Token
  Token --> CLI

  CLI --> Campaign
  Campaign --> AdSet
  Page --> Creative
  Creative --> Ad
  AdSet --> Ad
  Account --> Campaign
```

### What Each Piece Means

| Object | Why it matters |
| --- | --- |
| Personal Facebook user | Performs the one-time setup, accepts policies, creates or owns the business assets. |
| Business portfolio | Container for the Page, ad account, app, system user, and permissions. |
| Facebook Page | Required identity for Facebook ads. Even a basic Facebook-only ad needs a Page. |
| Ad account | Holds currency, timezone, payment method, budget limits, campaigns, ad sets, ads, and insights. |
| Meta developer app | Lets the system user generate a token with Marketing API permissions. |
| System user | Non-human business user used for server/CLI automation. |
| System-user token | Secret used by the CLI. It must never be committed or printed. |
| Campaign | Top-level ad object. Holds objective and, in our demo path, campaign-level daily budget. |
| Ad set | Audience, optimization goal, billing event, bidding, schedule, and placements. |
| Creative | Page identity plus image/video/copy/click destination. |
| Ad | Connects one ad set to one creative. |

## One-Time Meta Setup

These steps can use the Meta UI because they are account/bootstrap tasks. The
thing Drip must prove through automation is campaign operation after setup.

| Step | Result |
| --- | --- |
| Create business portfolio | Business owns the ad account, Page, app, and system user. |
| Create ad account | Use the target country/currency/timezone. Our India demo used INR and Asia/Kolkata. |
| Add billing/funding | Required before real delivery, and often needed before Meta accepts write flows reliably. |
| Accept required disclosures | Ads Manager may show first-time policy prompts, such as the non-discrimination policy. |
| Create Facebook Page | Required for Facebook ad identity. For the demo, use a simple Page such as `Drop by Codex`. |
| Create Meta developer app | Needed for the system-user token. |
| Publish/live the app if required | Some permissions and token flows are blocked while the app is only in development. |
| Create system user | Assign full access to the Page, ad account, and app. |
| Generate system-user token | Include `ads_management`, `ads_read`, `business_management`, `pages_manage_ads`, `pages_read_engagement`, and `pages_show_list`. |

Do not put real account IDs, app IDs, token values, payment details, or dashboard
URLs in docs, commits, screenshots, or final agent messages.

## Runtime Env

The official CLI expects these env names:

```bash
ACCESS_TOKEN=<meta-system-user-token>
AD_ACCOUNT_ID=act_<ad-account-id>
BUSINESS_ID=<business-portfolio-id>
```

Drip keeps private runtime env under namespaced app variables and maps them into
the official CLI names inside the sandbox runner:

| Drip env | CLI env | Notes |
| --- | --- | --- |
| `META_ADS_ACCESS_TOKEN` | `ACCESS_TOKEN` | System-user token. Secret. |
| `META_ADS_AD_ACCOUNT_ID` | `AD_ACCOUNT_ID` | Use the CLI account ID with the `act_` prefix. |
| `META_ADS_BUSINESS_ID` | `BUSINESS_ID` | Optional but useful for business-scoped list operations. |

For current local testing, the ignored repo `.env` stores both forms:

- `META_ADS_ACCESS_TOKEN`, `META_ADS_AD_ACCOUNT_ID`,
  `META_ADS_BUSINESS_ID` for Drip's runtime contract.
- `ACCESS_TOKEN`, `AD_ACCOUNT_ID`, `BUSINESS_ID` as direct aliases for the
  official `meta` CLI.

Keep those values only in private runtime config. Do not copy real values into
`.env.example`, docs, screenshots, logs, commits, or final agent messages.

Important gotcha: Meta surfaces several numeric IDs for the same-looking asset.
For the CLI, `AD_ACCOUNT_ID` must be the usable ad account ID, including the
`act_` prefix. Passing a business asset ID can cause confusing API errors during
campaign creation.

## Local CLI Smoke

In the Vercel Sandbox base image, `meta` should already be on PATH.

```bash
set -a
source .env
set +a

meta --version
meta auth status
meta ads adaccount list
meta ads page list
meta ads campaign list
```

Do not paste `meta auth status` output into public logs; it can reveal a token
prefix even when it masks most of the token.

For local host testing without installing the tool globally, run the official
package through `uvx`:

```bash
set -a
source .env
set +a

uvx --python 3.12 --from meta-ads meta --version
uvx --python 3.12 --from meta-ads meta auth status
uvx --python 3.12 --from meta-ads meta ads adaccount list
```

The current Drip sandbox setup preinstalls the `meta-ads` package through a
Python 3.12 `uv` tool because the package requires Python 3.12+.

## Paused Campaign Flow

This is the CLI flow that worked for the Facebook-only proof.

### 1. Create The Campaign

Use a paused traffic campaign with campaign-level budget.

```bash
meta ads campaign create \
  --name "Drop by Codex 100 INR Paused Demo" \
  --objective outcome_traffic \
  --daily-budget 10000 \
  --status paused
```

Budget values are minor units. For INR, `10000` means Rs 100. A Rs 50 daily
budget failed in our India test because Meta rejected it as too small. Rs 100
succeeded for the demo account.

### 2. Create The Ad Set

If the campaign uses campaign-level budget, omit ad set budget flags.

```bash
meta ads adset create <campaign-id> \
  --name "Drop by Codex Traffic Ad Set" \
  --optimization-goal link_clicks \
  --billing-event impressions \
  --bid-amount 100 \
  --targeting-countries IN \
  --status paused
```

The test account required `--bid-amount`; without it, Meta returned a bid-cap
requirement error. Keep this field configurable because different account bid
strategy settings can change what Meta requires.

### 3. Create A Creative

Create the creative under the same ad account and Page identity that the ad will
use.

```bash
PAGE_ID=<page-id>

meta ads creative create \
  --name "Drop by Codex Creative A" \
  --image ./image-a.jpg \
  --page-id "$PAGE_ID" \
  --body "Drop by Codex CLI proof creative." \
  --link-url "https://www.facebook.com/profile.php?id=$PAGE_ID" \
  --title "Drop by Codex" \
  --description "CLI-created Facebook ad demo" \
  --call-to-action learn_more
```

Creative ownership matters. A creative created under one ad account cannot be
attached to an ad set in another ad account.

### 4. Create The Ad

```bash
meta ads ad create <ad-set-id> \
  --name "Drop by Codex Demo Ad" \
  --creative-id <creative-id> \
  --status paused
```

For extra safety, explicitly update the ad back to paused after creation:

```bash
meta ads ad update <ad-id> --status paused
```

### 5. Verify

```bash
meta ads campaign list
meta ads campaign get <campaign-id>

meta ads adset list
meta ads adset get <ad-set-id>

meta ads creative list
meta ads creative get <creative-id>

meta ads ad list
meta ads ad get <ad-id>
```

Expected safe state after creation:

| Object | Configured status | Effective status |
| --- | --- | --- |
| Campaign | `PAUSED` | `PAUSED` |
| Ad set | `PAUSED` | `PAUSED` |
| Ad | `PAUSED` | Often `PENDING_REVIEW` or `IN_PROCESS` until Meta completes review |

The ad can be pending review while still configured paused. That means Meta is
processing the object, not that delivery is active.

## Two-Image A/B Demo

For a simple hackathon demo, prefer two explicit creatives and two paused ads.
This keeps the output understandable in both CLI logs and Ads Manager.

```bash
meta ads creative create \
  --name "Drop by Codex Creative A" \
  --image ./image-a.jpg \
  --page-id "$PAGE_ID" \
  --body "Variant A copy." \
  --link-url "$DESTINATION_URL" \
  --title "Drop by Codex" \
  --call-to-action learn_more

meta ads creative create \
  --name "Drop by Codex Creative B" \
  --image ./image-b.jpg \
  --page-id "$PAGE_ID" \
  --body "Variant B copy." \
  --link-url "$DESTINATION_URL" \
  --title "Drop by Codex" \
  --call-to-action learn_more

meta ads ad create "$ADSET_ID" \
  --name "Drop by Codex Variant A" \
  --creative-id "$CREATIVE_A_ID" \
  --status paused

meta ads ad create "$ADSET_ID" \
  --name "Drop by Codex Variant B" \
  --creative-id "$CREATIVE_B_ID" \
  --status paused
```

The CLI also supports Dynamic Creative Optimization style inputs with repeated
`--images`, `--titles`, `--bodies`, and `--call-to-actions`. Use that when Meta
should optimize combinations automatically. For Drip's first demo, explicit
creative A/B assets are easier to explain and preserve in campaign history.

## Preview And Review Links

The official `meta` CLI currently exposes create/list/get/update/delete flows
for ad objects, but it does not expose a dedicated public ad preview URL command.

Practical review options:

| Review artifact | Works for demo? | Notes |
| --- | --- | --- |
| Ads Manager campaign/ad URL | Yes | Best visible proof for an authenticated admin. Do not commit real dashboard URLs. |
| CLI `list`/`get` output | Yes | Best deterministic proof for sandbox logs and product history. |
| Meta preview iframe generated outside the CLI | Partial | Can show a logged-in preview, but it is not a public URL and is outside the official CLI proof path. |
| Public Facebook ad URL | No reliable paused-ad URL | Paused or pending ads do not behave like public posts. |

For Drip product UX, treat the campaign status plus a reviewable Ads Manager
artifact as the acceptance target. After active delivery, insights and Meta's UI
become the source for performance reporting.

## Findings From The E2E Proof

Date: 2026-06-07.

| Finding | Impact |
| --- | --- |
| The official CLI package is `meta-ads`; command is `meta`. | The sandbox should preinstall `meta` and agents should not bootstrap it per run. |
| The CLI authenticates from `ACCESS_TOKEN`, `AD_ACCOUNT_ID`, and `BUSINESS_ID`. | Drip maps private `META_ADS_*` env into those official names. |
| `AD_ACCOUNT_ID` must be the CLI-visible `act_...` account ID. | Using the wrong Meta asset ID can create generic API failures. |
| A Page is required for Facebook ad creatives. | Facebook-only is the easiest first demo; Instagram can wait. |
| Billing/funding and one-time Ads Manager disclosures can block account readiness. | Use UI only for setup; then prove ad operations with the CLI. |
| Rs 50 daily budget was too low for the India test account. | Use Rs 100 for the hackathon demo cap unless a future account reports a lower minimum. |
| Ad set creation required `--bid-amount` for the test account. | Keep bid amount configurable and retry with it when Meta asks for a bid cap. |
| Creative ownership is scoped to the ad account. | Create creatives under the same ad account used by the ad set. |
| A newly created ad may show `PENDING_REVIEW` or `IN_PROCESS` while configured paused. | This is expected review processing; verify `configured_status` or explicit `status` before claiming safety. |
| The CLI does not provide a public ad preview URL command. | Use Ads Manager plus CLI status as the review artifact. |

## Common Blockers

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `No results` for ad accounts | Token lacks business/ad-account access. | Assign the system user to the ad account and regenerate/refresh token permissions. |
| Campaign create returns generic API error | Wrong ad account ID, account not ready, missing billing, or first-time policy prompt. | Confirm `meta ads adaccount list`, use `act_...`, clear setup prompts, verify billing. |
| Rs 50 budget rejected | Account minimum daily budget is higher. | Use the account's minimum or Rs 100 for India demo. |
| Ad set asks for bid cap | Account/campaign bid strategy requires `bid_amount`. | Retry ad set create with `--bid-amount`. |
| Creative cannot attach to ad | Creative belongs to another ad account. | Recreate the creative under the same current `AD_ACCOUNT_ID`. |
| Ad is pending review | Meta review is processing the ad. | Keep status paused and poll until review completes if delivery is needed. |
| Need Instagram-only placement | Instagram account and placement configuration are not yet wired. | Start with Facebook-only; add Instagram asset linking later. |

## Sandbox Agent Rules

Sandbox agents using `meta-ads-cli` should follow these rules:

1. Run read-only smoke checks before mutation.
2. Never print tokens or raw account/app/business IDs in final answers.
3. Create campaign objects as `paused` by default.
4. Keep budgets at or below the user-approved cap.
5. Use Facebook-only Page identity for the first demo unless the task explicitly
   asks for Instagram and the Instagram asset is linked.
6. Return concise evidence: campaign name, budget, status, ad set status, ad
   status, and whether the ad is pending review.
7. Do not activate a campaign, ad set, or ad without an explicit user approval
   for live delivery.

## Productization Notes

The product should eventually store these fields on the Drop Campaign record:

| Field | Why |
| --- | --- |
| Campaign name and sanitized Meta object references | Lets the cockpit reopen/reconcile the Meta test. |
| Budget cap and currency | Makes spend controls visible to the user. |
| Objective, audience, and optimization goal | Explains what was being tested. |
| Creative names and image references | Ties ad results back to selected Designer mocks. |
| Configured/effective statuses | Separates user-controlled pause state from Meta review state. |
| Review artifact | Link or reference for an admin to inspect in Ads Manager. |
| Insights snapshot | CTR, CPC, spend, impressions, clicks, and engagement after delivery. |
| Winner recommendation | Performance Marketer's final "build this, not that" output. |

Open product questions:

| Question | Current answer |
| --- | --- |
| Should Drip auto-activate ads? | No. Create paused first; activation should be explicit. |
| Is Instagram needed for v1 demo? | No. Facebook-only is simpler and proves the CLI path. |
| Can we show a public ad link? | Not reliably for paused/pending ads. Show Ads Manager artifact plus CLI status. |
| What is the smallest budget? | Account-specific. Rs 50 failed; Rs 100 succeeded in the India proof. |
| Should we use DCO or explicit A/B ads? | Explicit A/B ads first; DCO later if we want Meta-managed combinations. |
