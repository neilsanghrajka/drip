# Drip PRD

Last updated: 2026-06-03

## How to Update This Document

This is Drip's lightweight product requirements document and product
changelog. Keep it high level: capture what changed, why it matters, core user
journeys, AI teammate responsibilities, and user acceptance criteria. Detailed
specs for individual flows should live in separate documents and be linked from
here.

When product requirements change:

1. Update the relevant section if the current product direction has changed.
2. Add an entry under Amendments with the date, summary, and any linked
   follow-up specs.
3. Keep implementation details, API schemas, and deep edge-case handling out of
   this document unless they are necessary to understand the product.

## Product Summary

Drip is an autonomous AI drop studio for internet-moment merch. It helps a solo
creator, founder, or small fashion-commerce operator go from "something is
trending" to "this is the product worth launching" without manually
coordinating a research team, fashion designer, mockup studio, performance
marketer, and web builder.

The product should feel like hiring a small AI team for a weekly limited-drop
business. A user creates a Drop Campaign, optionally gives Drip a few topics
they care about, and watches the AI team work through the campaign:

- Scout finds cultural moments and proposes candidate ideas.
- Designer turns selected moments into merch concepts.
- Studio creates realistic product and campaign mockups.
- Growth validates demand before the user manufactures or launches anything.
- Builder creates a standalone drop page for the winning product.

The core output is not a pile of images or a generic storefront. The core output
is a clear product decision:

- Build this.
- Do not build that.
- This is why the moment matters now.
- This is who the drop is for.
- These mockups performed best.
- This is the recommended launch.

The simple positioning is: Drip is a self-driving drop engine for internet
moments. It watches culture, designs products, tests demand, and launches the
winning drop.

## Problem Statement

Internet culture moves faster than small merchants can operate. A sports win,
album release, meme, celebrity moment, product launch, local event, or
city-specific trend can create a short window where a limited merch drop feels
urgent and desirable. By the time a creator researches the moment, decides what
to make, produces mockups, tests demand, and builds a storefront, the moment may
already be stale.

Today this workflow is fragmented across too many skills and tools. A creator
has to:

- Notice what is trending.
- Decide whether the trend is actually merchable.
- Translate the moment into tasteful fashion concepts.
- Produce credible product visuals before inventory exists.
- Run or simulate lightweight demand tests.
- Interpret weak signals from clicks, comments, saves, and intent.
- Decide what is worth building.
- Create a drop page quickly enough for the cultural moment to matter.

That leads to slow launches, generic merch, overproduction, and decisions based
on instinct instead of demand. Drip turns this into one guided campaign where AI
teammates do the work, show their reasoning, and ask the user to approve the
important decisions.

## Campaign Flow at a Glance

Drip's top-level campaign flow is:

1. User starts from the current-week suggestions or creates a new Drop Campaign.
2. Scout finds up to five merchable cultural moments.
3. User selects the ideas worth exploring, usually about three.
4. Designer turns selected ideas into fashion product concepts.
5. Studio creates realistic mockups and campaign visuals.
6. User selects the mockups that should be validated, usually two to three per
   selected idea.
7. Growth evaluates demand signals and recommends what to build.
8. User approves the winning Drop Brief.
9. Builder creates a previewable drop page and returns a launch-ready result.
10. User approves, shares, or revises the final drop page.

The campaign should feel like one continuous workspace. The user should not need
to understand internal systems or switch between disconnected tools to follow
the journey.

## Initial Scope

As of the initial version, Drip is scoped to:

- Product surface: a desktop web app centered on a single Drop Campaign
  cockpit, with a clean way to create a new drop and switch between current and
  historical drops.
- User: an individual operator building a limited-edition merch, drop-shipping,
  or fashion-drop business.
- Public landing page: a first screen that explains Drip, introduces the AI
  team, and lets a user sign up or log in.
- Authentication: simple signup, login, and logout so different users can have
  their own campaigns and history.
- First-run experience: a lightweight "meet your AI team" introduction, then a
  fast path to start the first drop.
- Current-week suggestions: when the user enters the workspace, Drip can show
  prepared or already-running suggestions for what is interesting this week,
  even before the user creates a custom campaign.
- Drop creation: a user can create a weekly or moment-based Drop Campaign, name
  it, add optional topics, choose product categories, or let Drip discover what
  is trending.
- Trend research: Scout proposes up to five candidate drop ideas with trend
  context, audience, merch potential, urgency, and why the moment matters now.
- Human selection: the user chooses the ideas worth exploring, usually narrowing
  the set from about five candidate ideas to about three.
- Merch design: Designer turns selected ideas into product concepts across
  simple merch categories such as tees, caps, hoodies, and socks.
- Mockups: Studio creates realistic product and campaign mockups so the user
  can evaluate the drop before any manufacturing decision.
- Creative selection: the user selects the strongest mockups for validation,
  with rejected options preserved as part of the campaign history.
- Demand validation: Growth prepares and reports on Instagram/Meta-style A/B
  tests across selected products, creatives, audiences, and copy. In the initial
  demo or sandbox version, validation can be simulated, but simulated signals
  must be clearly labeled.
- Recommendation: Drip identifies the strongest product or bundle and explains
  why it should be built, including practical signals such as clicks, saves,
  comments, predicted intent, projected margin, and risk.
- Drop launch: Builder uses a Codex-powered build moment inside the product to
  create a standalone page for the winning drop with product images,
  fashion-forward copy, a clear call to action, and a limited-drop countdown.
- Build visibility: the user can see readable Builder progress, generated-page
  readiness, and check/test status before approving launch.
- Campaign status: the user can see which AI teammate is active, what it is
  doing, what it has produced, and what decision is needed next.
- Drop history: the user can switch between current and previous drops, review
  decisions, and reopen completed drop outputs.
- Product feel: the app should feel like a quiet, premium fashion operating
  system, not a generic SaaS dashboard, a toy image generator, or a technical
  console.

Out of scope for the initial version:

- Manufacturing, supplier management, inventory buying, fulfillment, returns,
  or logistics.
- A full Shopify replacement with catalog management, cart, orders, taxes,
  customer support, and post-purchase operations.
- Fully autonomous paid ad spend without human approval.
- Real ad-platform integrations or live ad spend as the default validation mode.
- Advanced media buying, budget optimization, retargeting, attribution, or
  multi-day campaign analytics.
- Native mobile apps.
- Complex onboarding, business setup, team permissions, or enterprise
  workflows.
- Broad product categories beyond simple limited-edition merch.
- Public marketplaces for drops, creators, trends, templates, or AI-generated
  campaigns.
- Claiming official affiliation with teams, artists, brands, events, leagues,
  or products unless the user has the rights to do so.
- Unlabeled simulations that make sandboxed trend, ad, or commerce data appear
  real.
- Deep technical implementation details inside this PRD.

## Initial Version Boundary

The initial version should be honest about what is real, what is sandboxed, and
what requires explicit approval.

- Real product behavior: account access, campaign creation, current and
  historical drop views, AI teammate statuses, user decisions, generated
  artifacts, the final recommendation, and the Builder launch moment.
- Sandbox or demo behavior: trend sources, ad validation, waitlist activity, and
  commerce outcomes may use prepared or simulated data. These signals must be
  labeled as sandboxed or simulated wherever they influence a user decision.
- Preview-only behavior: the generated drop page can be previewed before launch
  and should not imply orders, payments, manufacturing, or fulfillment unless
  those integrations are explicitly added later.
- Approval-required behavior: public launch, external publishing, paid ads,
  manufacturing, supplier handoff, and any irreversible or spend-related action
  require visible user approval.
- Future-only behavior: fully automated recurring runs, live social/ad platform
  integrations, real checkout, supplier operations, and post-purchase commerce
  workflows are future directions unless a later spec moves them into current
  scope.

## Core Concepts

- User: The person operating Drip and making final campaign decisions.
- Drop Campaign: One weekly or moment-based merch launch workflow.
- Current Drop: The active Drop Campaign the user is operating now.
- Drop History: The user's previous campaigns, decisions, outputs, and results.
- AI Team: The set of AI teammates that move a campaign from trend to live drop.
- Scout: The AI teammate that finds and explains timely cultural moments.
- Designer: The AI teammate that turns selected moments into fashion product
  concepts.
- Studio: The AI teammate that creates realistic mockups and ad-ready visuals.
- Growth: The AI teammate that validates demand and recommends what is worth
  building.
- Builder: The AI teammate that creates the launch page for the winning drop.
- Candidate Idea: A potential merch direction tied to a trend or user-provided
  topic.
- Product Concept: A concrete clothing direction with product type, fit, color,
  print placement, typography, and creative rationale.
- Mockup: A realistic visual representation of a product or campaign creative.
- Validation Test: A demand signal used to decide which product should be built.
- Winning Drop: The selected product or bundle Drip recommends launching.
- Drop Brief: The final package of product, audience, creative, validation, and
  launch guidance passed to Builder.
- Drop Page: The standalone customer-facing page created for the winning drop.
- Review Gate: A point where the user must approve, reject, or revise before
  Drip advances to a risky, paid, or public-facing step.

## Product Principles

- Validate before making. Drip should help the user avoid manufacturing or
  promoting products before there is evidence of demand.
- Make the moment legible. Every candidate idea should explain why it matters
  now, who cares, and how long the window may last.
- Feel like a team, not a form. The user should experience Scout, Designer,
  Studio, Growth, and Builder as collaborators with visible work and clear
  handoffs.
- Keep the human in the loop. Drip should automate work, but user approval
  remains central for idea selection, creative selection, validation, launch,
  spend, and manufacturing.
- Give a simple final answer. The product should ultimately say: build this, do
  not build that, and here is why.
- Prefer taste over novelty. The merch should feel like fashion or collectible
  streetwear, not a low-effort meme printed on a shirt.
- Stay single-page and momentum-driven. A campaign should feel alive, updating
  in place as the team works.
- Preserve evidence. Recommendations should tie back to trend reasoning, design
  choices, mockups, validation signals, and user decisions.
- Launch one strong drop. Drip should optimize for a focused limited-edition
  product or bundle rather than a sprawling catalog.
- Label simulations honestly. If trend, ad, waitlist, or commerce data is
  sandboxed, the product should say so clearly.
- Protect brand trust. Drip should avoid unsafe claims, official-sounding
  language, trademark risk, or designs that depend on rights the user may not
  have.

## AI Team Responsibilities

### Scout

Scout finds cultural moments that could become timely merch drops.

Inputs:

- The user's optional topics, such as sports, music, local culture, technology,
  memes, fashion, or a specific event.
- Current-week trend prompts when the user wants Drip to auto-discover ideas.
- Public cultural signals such as social trends, news, sports moments, memes,
  city-specific culture, and community conversation.
- The user's brand or taste guidance when available.

Outputs:

- Up to five candidate ideas.
- A plain-language explanation of what is trending and why now.
- The audience that likely cares about the moment.
- The merch angle for each idea.
- Urgency or expected trend half-life.
- Risk notes, including rights, brand-safety, taste, or "too late" concerns.

Acceptance criteria:

- Scout produces multiple candidate ideas instead of a single opaque answer.
- Each candidate idea is understandable without reading raw research logs.
- Each candidate idea explains what is trending, why it matters, who cares, and
  whether it can become merch.
- Scout can enrich user-provided topics instead of always searching for new
  topics.
- Scout distinguishes strong merch opportunities from trends that are
  interesting but weak for commerce.

### Designer

Designer turns selected candidate ideas into fashion product concepts.

Inputs:

- Candidate ideas selected by the user.
- Product categories such as tee, cap, hoodie, socks, or bundle.
- Audience and style direction from Scout.
- Brand constraints, taste guidance, and risk notes.

Outputs:

- Product concepts for each selected idea.
- Product type, color direction, fit, print placement, and typography guidance.
- Creative rationale explaining why the concept fits the moment.
- A recommendation for which concepts should proceed to mockups.

Acceptance criteria:

- Designer produces concepts that feel like intentional fashion directions, not
  generic meme merch.
- Each concept includes enough product detail for Studio to create mockups.
- Concepts can span multiple product categories when that better fits the
  moment.
- The user can review concepts before mockup generation proceeds.
- Rejected concepts remain visible in campaign history.

### Studio

Studio creates realistic product and campaign mockups before anything is
manufactured.

Inputs:

- Designer's approved product concepts.
- Product categories and visual direction.
- Any preferred mockup types such as product photos, model shots, ad creatives,
  or bundle visuals.

Outputs:

- Multiple mockups per selected idea.
- Product visuals for tees, caps, hoodies, socks, or bundles.
- Campaign-ready creative options that can be used for validation.
- A clear selection surface for the user to approve mockups.

Acceptance criteria:

- Studio generates enough variation for the user to compare directions.
- Mockups feel realistic enough to support validation before manufacturing.
- The user can select, reject, or request changes to mockups.
- Drip does not use a mockup for validation until the user has approved it or
  explicitly chosen an auto-approval mode.
- Selected mockups are carried forward into Growth and Builder outputs.

### Growth

Growth validates demand and recommends what is worth building.

Inputs:

- Approved mockups and campaign creatives.
- Suggested audience, price, product category, and copy.
- User approval for any paid or external-facing test.
- Validation mode, such as sandbox/demo, estimated projection, or approved live
  test.

Outputs:

- Comparison of selected products, creatives, audiences, and copy.
- Performance signals labeled by type: observed live signals, estimated
  projections, or simulated sandbox signals.
- A reviewable validation artifact, status, or campaign link so the user can
  inspect what Growth tested.
- A recommendation for the winning product or bundle.
- Plain-language explanation of why one option should be built and another
  should not.
- Risk notes for weak intent, low-margin ideas, expensive clicks, or misleading
  engagement.

Acceptance criteria:

- Growth returns an evaluated recommendation, not just raw metrics.
- Growth can flag a concept that gets attention but does not show purchase
  intent.
- Growth explains the commercial reason for the winning recommendation.
- Growth labels each signal as observed, estimated, or simulated.
- Growth shows a validation status or review artifact before the user accepts
  the winner.
- Growth does not spend real money without explicit user approval.

### Builder

Builder creates the launch surface for the winning drop.

Inputs:

- Winning Drop and final Drop Brief.
- Selected mockups and product images.
- Audience, positioning, price, urgency, and validation proof.
- Brand and risk constraints.
- User approval to generate, preview, and launch.

Outputs:

- A visible Codex-powered build run inside the Drip product.
- Readable Builder progress such as preparing the brief, generating the drop
  page, checking the result, and ready for review.
- A standalone drop page for the winning product or bundle.
- Product name, campaign story, mockup gallery, price, call to action, and
  limited-drop countdown.
- Customer-facing copy that feels premium, timely, and specific to the moment.
- Size, fit, or product detail guidance when needed for the selected merch.
- Validation proof or social proof from Growth, labeled according to whether it
  is observed, estimated, or simulated.
- A previewable page before launch.
- A shareable live link after approval.

Acceptance criteria:

- Builder starts a visible Codex-powered launch run from the approved Drop
  Brief.
- Builder uses the winning product, selected mockups, and validation rationale.
- Builder shows readable progress and final check/test status without requiring
  the user to read raw developer logs.
- The generated page feels distinct from the internal Drip cockpit.
- The page clearly communicates limited-edition urgency.
- The user can preview the page before it is live.
- Builder does not publish a public page without visible approval.

## Decision Gates and Risk Controls

Drip feels autonomous, but important business decisions require human review.
The user should always know when the AI team is recommending, when it is acting,
and when a decision could create spend, public exposure, brand risk, or
manufacturing work.

| Campaign stage | User decision | Product requirement |
| --- | --- | --- |
| Drop setup | Start from current-week suggestions, provide topics, or let Scout auto-discover | Drip should make the starting mode clear. |
| Scout research | Choose which candidate ideas move forward | Drip should preserve rejected or deferred ideas in campaign history. |
| Designer and Studio | Approve concepts and mockups for validation | Drip should not validate unapproved creative unless the user has chosen an auto-approval mode. |
| Growth validation | Approve any live, paid, or external-facing test | Drip should clearly label sandbox, estimated, and observed signals. |
| Winner selection | Accept, reject, or revise the recommended Winning Drop | Drip should explain why the winner is worth building and why alternatives lost. |
| Builder | Preview, request changes, or approve the drop page | Drip should keep the page private until the user approves sharing or publishing. |
| Spend or production | Approve ads, manufacturing, supplier handoff, or checkout | Drip should never treat paid or irreversible actions as silent automation. |

Acceptance criteria:

- Drip requires user approval before a campaign advances from research to
  design.
- Drip requires user approval before mockups are used for validation.
- Drip requires user approval before real ad spend or public-facing validation.
- Drip requires user approval before the winning design becomes a launch
  candidate.
- Drip flags brand, legal, trademark, spend, and manufacturing risks before
  launch.
- A user can approve, reject, or request changes at each review gate.
- Drip never presents risky, paid, or public actions as fully automatic without
  a visible approval step.

## User Journeys

### 1. Landing and Auth

A signed-out user lands on Drip, understands that the product is an AI merch
team for turning internet trends into validated drops, and can sign up or log in
before entering the campaign workspace. The landing page should introduce the
AI team at a high level so the user understands the workflow before starting.

Acceptance criteria:

- A signed-out user can understand the core product promise from the landing
  page.
- The landing page introduces Scout, Designer, Studio, Growth, and Builder.
- A user can sign up, log in, or log out.
- Authenticated users land in the main Drip workspace.
- Signed-out users cannot access private campaign, history, or review surfaces.
- The auth flow stays lightweight and does not become a long onboarding wizard.

### 2. Meet the AI Team

After signup or first login, the user sees Drip as a small AI-native fashion
team. The product can show teammate cards or avatars with role previews, example
outputs, and the kind of decision each teammate helps the user make.

Acceptance criteria:

- A first-time user can identify what each AI teammate does.
- Each teammate has a clear role, status, and expected output.
- The introduction makes the workflow feel like a team of specialists rather
  than a generic chatbot.
- The user can proceed directly to creating a drop without completing a long
  setup flow.
- The introduction can be revisited or summarized inside the campaign cockpit.

### 3. Create a Drop Campaign

The user creates a Drop Campaign from the main workspace. They can name the
drop, choose a timing frame such as this week or a specific cultural moment,
select product categories, add optional topics, or let Drip auto-discover what
is trending.

Acceptance criteria:

- A user can create a new Drop Campaign from an empty workspace.
- A returning user can create a new campaign from the current-drop cockpit.
- The workspace can show this week's prepared Scout suggestions before the user
  starts a custom campaign.
- A user can choose one of the prepared suggestions as the campaign starting
  point.
- A campaign can start from user-provided topics.
- A campaign can start from AI auto-discovery when the user has no topic.
- A user can select product categories such as tees, caps, hoodies, socks, or
  bundles.
- The campaign workspace shows the current stage and next required action.
- A campaign can be saved without launching a drop.

### 4. Scout Research and Candidate Ideas

Scout reviews cultural signals and produces a shortlist of merchable moments
with plain-language reasoning. The user compares the ideas, sees which ones are
timely, and selects the ideas that should proceed to design.

Acceptance criteria:

- Scout presents up to five candidate ideas for a campaign.
- Each candidate includes a title, audience, why-now explanation, merch angle,
  urgency, and risk notes.
- The user can compare candidate ideas before choosing.
- The user can select about three ideas to pursue.
- Selected ideas persist and become the source of truth for downstream design,
  mockup, validation, and storefront work.
- The user can see rejected or deferred candidate ideas later in campaign
  history.

### 5. Designer Concepts and Studio Mockups

Designer turns selected candidate ideas into clothing concepts, and Studio turns
those concepts into realistic product and campaign mockups. The user reviews
the options and selects which mockups should be validated.

Acceptance criteria:

- Designer generates multiple product concepts from selected ideas.
- Each concept includes product type, color direction, fit, print placement,
  typography or visual style, and creative rationale.
- Studio produces about five realistic mockups for each selected idea in the
  default demo flow.
- Mockups can include tees, caps, hoodies, socks, product shots, model shots,
  bundle shots, or ad creative previews.
- The user can select two to three mockups per selected idea for validation in
  the default demo flow.
- The user can reject or request changes before mockups advance.
- Selected mockups carry forward into Growth's validation view.

### 6. Growth Validation and Winner Selection

Growth tests or simulates demand for selected mockups and tells the user which
product is most worth building. The product should emphasize commercial
judgment, not only visual preference.

Acceptance criteria:

- Growth compares multiple mockups or variants within a campaign.
- Each variant can show observed, estimated, or simulated demand signals such
  as CTR, CPC, saves, comments, waitlist signups, predicted conversion,
  projected margin, and qualitative buyer intent.
- Growth shows a validation status and reviewable campaign artifact or link,
  even when the validation is simulated.
- Growth recommends a winner and explains why it should be built.
- Growth can say "do not build this" when a design gets attention but weak
  purchase intent.
- Live, external, or paid validation steps require user approval.
- Simulated validation is clearly labeled as sandbox or demo data.
- The winning design is promoted into a launch-ready Drop Brief.

### 7. Builder and Drop Page

Builder takes the winning Drop Brief and creates a customer-facing drop page.
The user can trigger the Codex-powered Builder run, watch readable progress,
preview the generated page, request changes, and approve launch.

Acceptance criteria:

- The user can start the Builder run from the winning Drop Brief.
- Builder creates a storefront preview from the winning Drop Brief.
- The storefront includes product name, audience positioning, mockup gallery,
  price, call to action, limited-drop countdown, validation proof, and product
  details such as size or fit guidance when relevant.
- Builder preserves brand, taste, and risk constraints from the campaign.
- Builder shows readable progress and check/test status before the user
  approves launch.
- The user can preview the generated storefront before launch.
- The storefront status is understandable to a non-technical user: draft,
  building, ready for review, approved, or live.
- The user can request changes before publishing.
- The final drop page has a shareable link after approval.

### 8. Campaign History

A user can revisit previous campaigns, see what the AI team produced,
understand which products won or lost, and reopen the resulting drop report or
drop page.

Acceptance criteria:

- A user can view active and historical campaigns.
- Each campaign shows its current or final stage.
- Each campaign preserves Scout research, selected concepts, mockups, Growth
  validation, Builder output, and final decisions.
- A user can reopen a campaign detail view from history.
- History makes it easy to understand why a product was recommended or
  rejected.
- The current campaign remains easy to return to from history.

## UX Direction

Drip should feel like a desktop single-page cockpit for running an autonomous
drop campaign. The primary experience is not a form-heavy dashboard. It is a
live command surface where the user can see the current drop, review AI
teammate work, make key decisions inline, and watch the campaign move from
trend to product to launch.

The first authenticated screen should center on the active drop. A persistent
campaign switcher should let the user move between the current drop and prior
drop history without losing the main cockpit context. The main canvas
should show the campaign timeline, AI teammate cards, generated concepts,
market signals, approval decisions, and launch readiness in one coherent flow.

The user should feel like they are managing a small AI-native fashion team.
Teammate cards should show clear roles and statuses such as research, design,
mockup creation, validation, and launch. Decisions should be selectable and
editable inline wherever possible, so the user can approve, revise, or override
the system without opening deep configuration pages.

The product should have motion and real-time presence. Status changes,
generated assets, teammate updates, and launch readiness should update with a
sense of momentum while remaining calm and legible. The goal is a premium
cockpit, not a chaotic agent log.

Acceptance criteria:

- A desktop user can understand the active drop from the first authenticated
  screen.
- The user can switch between current drop and drop history without leaving the
  main workspace.
- AI teammate cards clearly show role, current status, and latest output.
- Core decisions can be selected, approved, rejected, or edited inline.
- Campaign progress feels animated or live without becoming distracting.
- The user can always tell what Drip is doing now and what decision is needed
  next.

## UI and Platform Direction

Drip should be designed desktop-first. The core surface is a single-page
campaign cockpit optimized for a wide browser viewport, with dense but elegant
information layout. Mobile can be supported later, but the initial version
should prioritize the desktop demo experience and the feeling of operating a
polished autonomous commerce engine.

The visual direction should feel clean, luxury, and fashion-forward: restrained
color, generous spacing, sharp typography, editorial product imagery, and
minimal visual noise. It should avoid looking like a generic SaaS admin panel,
a playful merch generator, or a developer console. The product should feel
closer to a modern fashion operations room.

The app experience and the generated drop website should feel intentionally
distinct. The Drip cockpit is the operator interface: status, decisions,
teammates, and controls. The generated drop page is the customer-facing fashion
storefront: immersive, product-led, editorial, and built to make the selected
drop feel real.

The product should be honest about simulation. If demand validation is sandboxed
for demo purposes, the UI should still feel real and useful, but it must not
pretend that fake ad spend, fake waitlist signups, or fake commerce activity is
live customer behavior.

Acceptance criteria:

- The UI supports a clean luxury fashion aesthetic rather than a generic
  dashboard style.
- The Drip cockpit and generated drop page are visually and functionally
  distinct.
- The generated drop page communicates the product, urgency, and CTA without
  requiring the user to understand the internal campaign workflow.
- Simulated signals are labeled clearly enough that the user understands what
  is real and what is sandboxed.
- The interface avoids unnecessary technical terminology in user-facing copy.

## Key Risks and Open Questions

- How much of the drop pipeline should be real in the initial version versus
  simulated for demo clarity?
- What is the minimum approval needed before a drop can be considered launched?
- Which teammate outputs are editable by the user, and which are only
  reviewable?
- How should Drip communicate confidence, uncertainty, and simulated market
  validation without overclaiming?
- What makes a generated drop page feel premium enough for the demo while
  staying achievable?
- How should Drip avoid official affiliation claims for sports teams, artists,
  events, brands, or product launches?
- What parts of the experience need real-time animation versus simple status
  transitions?
- How much campaign history should be retained and shown before the interface
  feels crowded?
- Should the product optimize first for a cinematic demo flow, a reusable
  operator workflow, or both?
- What counts as sufficient validation to recommend "build this"?
- Should live ad tests, real spend, and external publishing remain future-only
  until the sandboxed workflow is reliable?
- What checkout or waitlist behavior should the initial customer-facing drop
  page support?

## Future Directions

- Fully automated recurring Auto Drop runs that start without the user opening
  the workspace.
- Mobile companion view for checking drop status and approving decisions away
  from desktop.
- More detailed drop history with searchable campaigns, generated assets,
  decisions, and launch outcomes.
- Richer teammate memory so each AI role learns brand preferences, prior
  decisions, and taste constraints.
- Multiple brand modes or aesthetic presets for different fashion identities.
- Real social trend integrations once source reliability and permissions are
  clear.
- Real ad-platform validation with explicit budget, account, and approval
  guardrails.
- Commerce or checkout integrations for real customer purchases.
- Supplier or fulfillment packet generation after a drop is approved.
- Supplier or fulfillment handoff for production-ready drop packets.
- Collaboration features for founder, designer, marketer, and reviewer roles.
- Brand safety and rights review before public launch.
- A/B storefront variants generated for different audiences or campaign angles.
- Post-launch performance reporting that compares predicted demand to actual
  waitlist, purchase, or conversion behavior.

## Amendments

### 2026-06-03: Initial High-Level PRD

Created the first lightweight product requirements document for Drip. Defined
the product as an autonomous AI drop studio for internet-moment merch, captured
the Scout, Designer, Studio, Growth, and Builder teammate model, established
the top-level Drop Campaign journey, documented human review gates, and set the
UX direction as a desktop-first single-page campaign cockpit with a distinct
generated drop page.
