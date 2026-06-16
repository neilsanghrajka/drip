import { describe, expect, it } from "vitest";

import {
  collectWorkspaceImagePaths,
  countBy,
  isTransientSandboxStartError,
  parseArgs,
  parseImageHeader,
  validateBuilderOutput,
  validateCommonEvents,
  validatePerformanceMarketerOutput,
  validateScoutEvents,
  validateScoutOutput,
} from "../../smoke/sandbox-e2e-smoke";

describe("sandbox smoke helpers", () => {
  it("parses smoke CLI options", () => {
    const options = parseArgs([
      "--scenario",
      "builder-drop-site",
      "--timeout-ms",
      "1000",
      "--poll-ms",
      "250",
      "--start-attempts",
      "2",
      "--artifact-root",
      "tmp/evidence",
      "--keep-sandbox",
      "--skip-sandbox-files",
      "--cleanup-artifacts",
      "--identity-subject",
      "user_prod_subject",
      "--prod",
    ]);

    expect(options).toMatchObject({
      scenario: "builder-drop-site",
      timeoutMs: 1000,
      pollMs: 250,
      startAttempts: 2,
      keepSandbox: true,
      skipSandboxFiles: true,
      cleanupArtifacts: true,
      identitySubject: "user_prod_subject",
      convexDeployment: "prod",
    });
    expect(options.artifactRoot).toMatch(/tmp\/evidence$/);
    expect(() => parseArgs(["--scenario", "missing"])).toThrow(
      "Unknown scenario: missing",
    );
    expect(() => parseArgs(["--timeout-ms", "0"])).toThrow(
      "--timeout-ms must be a positive integer.",
    );
  });

  it("validates common event presence and sequence continuity", () => {
    const events = [
      { seq: 1, type: "runner.started" },
      { seq: 2, type: "thread.started" },
      { seq: 3, type: "turn.completed" },
      { seq: 4, type: "runner.finished" },
    ];

    expect(() => validateCommonEvents("smoke", events)).not.toThrow();
    expect(() =>
      validateCommonEvents("smoke", [
        events[0],
        { seq: 3, type: "thread.started" },
        events[2],
        events[3],
      ]),
    ).toThrow("smoke: event seq gap between 1 and 3");
  });

  it("validates Scout event logs include both researcher subagents", () => {
    const scoutRun = {
      _id: "run_1",
      status: "succeeded",
      task: "Use $scout",
      workspaceId: "e2e-scout-cultural",
      result: {
        finalResponse: "Wrote /vercel/sandbox/agent-workspace/scout-output.json",
      },
    };
    const scoutEvents = [
      {
        seq: 1,
        type: "runner.started",
        payload: {
          codexEnvPresence: {
            EXA_API_KEY: true,
            X_BEARER_TOKEN: true,
          },
          modelReasoningEffort: "low",
          webSearchMode: "live",
        },
      },
      {
        seq: 2,
        type: "item.completed",
        payload: {
          item: {
            type: "agent_message",
            text: "Spawned x-researcher and exa-researcher for first-pass research.",
          },
        },
      },
    ];

    expect(() => validateScoutEvents(scoutRun, scoutEvents)).not.toThrow();
    expect(() =>
      validateScoutEvents(scoutRun, [
        scoutEvents[0],
        {
          seq: 2,
          type: "item.completed",
          payload: {
            item: {
              type: "agent_message",
              text: "Spawned x-researcher for first-pass research.",
            },
          },
        },
      ]),
    ).toThrow("Scout event log did not show exa-researcher spawn.");
  });

  it("parses image headers and collects workspace image references", () => {
    const png = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.writeUInt32BE(1024, 16);
    png.writeUInt32BE(768, 20);

    expect(parseImageHeader(png)).toEqual({
      format: "png",
      validSignature: true,
      width: 1024,
      height: 768,
    });
    expect(parseImageHeader(Buffer.from("not an image"))).toMatchObject({
      validSignature: false,
      width: 0,
      height: 0,
    });
    expect(
      collectWorkspaceImagePaths([
        "/vercel/sandbox/agent-workspace/a.jpg",
        "/outside/b.jpg",
      ]),
    ).toEqual(["/vercel/sandbox/agent-workspace/a.jpg"]);
  });

  it("validates minimal Scout, Builder, and Performance Marketer outputs", () => {
    expect(() =>
      validateScoutOutput({
        schemaVersion: "scout.cultural-moments.v1",
        strategy: {
          marketsChecked: ["Mumbai"],
          exaQueriesRun: 1,
          notes: ["Source-backed local cultural signal."],
        },
        candidates: [
          {
            id: "idea_01",
            shortTitle: "Monsoon cricket",
            xSignalLine: "Sources: 1",
            whyImportant: "Local cultural signal",
            description:
              "A neighborhood cricket watch party is pulling fans into a local monsoon-week ritual. The source-backed signal gives Scout enough detail to frame it as a city moment, not just a sports topic.",
            whyNow: "A listed watch event is happening this week.",
            audience: "Local cricket fans and monsoon hangout crews.",
            localAnchor: "Bandra neighborhood watch-party listing",
            whyFashionMerch:
              "Graphic cap idea with rain-marked score grids, taped bat textures, and original match-day phrases for a limited local drop.",
            signals: {
              xTrendNames: [],
              exaEvidenceCount: 1,
              uniqueSourceDomains: 1,
            },
            sources: [{ url: "https://example.com/source", sourceType: "web" }],
            evidenceHighlights: [
              {
                label: "Source",
                detail: "Local listing anchors the watch-party timing.",
                url: "https://example.com/source",
              },
            ],
          },
        ],
      }),
    ).not.toThrow();

    expect(() =>
      validateBuilderOutput({
        schemaVersion: "builder.drop-site.v1",
        site: {
          siteDir: "/vercel/sandbox/agent-workspace/builder-site",
          deploymentUrl: "https://example.com/drop",
        },
        page: {
          countdownHours: 24,
          ctaLabel: "Buy now",
          ctaBehavior: "dummy",
        },
        review: {
          passed: true,
          agentBrowserUsed: true,
          browserChecks: {
            desktop16x10: {
              viewport: "1440x900",
              horizontalOverflow: false,
              rightEdgeClipping: false,
              clippedRightEdgeElements: [],
            },
            desktop16x9: {
              viewport: "1920x1080",
              horizontalOverflow: false,
              rightEdgeClipping: false,
              clippedRightEdgeElements: [],
            },
          },
        },
      }),
    ).not.toThrow();

    expect(() =>
      validatePerformanceMarketerOutput({
        schemaVersion: "performance-marketer.facebook-campaign.v1",
        safety: {
          facebookOnly: true,
          allCreatedPaused: true,
          abTestingPerformed: false,
          activationPerformed: false,
          insightsReadbackPerformed: false,
          rawMetaIdsPersisted: false,
        },
        input: {
          destinationUrl: "https://example.com/drop",
          selectedImageRefs: ["image_1"],
        },
        campaign: {
          objective: "outcome_traffic",
          configuredStatus: "PAUSED",
          budgetMinorUnits: 10000,
        },
        adSets: [
          {
            name: "Drop ad set",
            safeRef: "adset_safe",
            dropRef: "drop-of-week",
            configuredStatus: "PAUSED",
          },
        ],
        ads: [
          {
            imageRefs: ["image_1"],
            imagePath: "/vercel/sandbox/agent-workspace/image.png",
            creativeSafeRef: "creative_safe",
            adSafeRef: "ad_safe",
            headline: "Drop now",
            body: "Limited run",
            destinationUrl: "https://example.com/drop",
            configuredStatus: "PAUSED",
          },
        ],
        verification: {
          campaignCount: 1,
          adSetCount: 1,
          creativeCount: 1,
          adCount: 1,
          pausedObjectCount: 3,
          issues: [],
        },
      }),
    ).not.toThrow();
  });

  it("accepts X-only Scout candidates with explicit uncertainty", () => {
    expect(() =>
      validateScoutOutput({
        schemaVersion: "scout.cultural-moments.v1",
        strategy: {
          exaQueriesRun: 0,
          notes: [
            "Exa was late, so this X-only candidate keeps uncertainty explicit.",
          ],
        },
        candidates: [
          {
            id: "idea_01",
            shortTitle: "Bandra Creator Queue",
            xSignalLine: "X: creator meet queue",
            whyImportant: "Public X posts show a fresh creator meet queue forming in Bandra today.",
            description:
              "A creator meet-up queue is becoming a visible fan ritual around Bandra today. The signal is X-only, but the posts describe a local line forming rather than a generic celebrity trend.",
            whyNow: "Posts sampled today show fans gathering around the meet-up queue.",
            audience: "Creator fans and local youth culture followers.",
            localAnchor: "Bandra creator meet queue",
            whyFashionMerch: "Queue-map graphics and original fan phrases.",
            signals: {
              xTrendNames: ["creator meet queue"],
              xTweetCountMax: null,
              xPublicMetricsSample: null,
              xMetricsUncertainty:
                "X counts were unavailable, so this is a directional recency signal.",
              exaEvidenceCount: 0,
              uniqueSourceDomains: 0,
            },
            sources: [],
            evidenceHighlights: [
              {
                label: "X sample",
                detail: "Recent public posts describe a Bandra queue forming today.",
              },
            ],
          },
        ],
      }),
    ).not.toThrow();
  });

  it("accepts mixed Scout candidates with Exa-only, X-only, and both-backed evidence", () => {
    expect(() =>
      validateScoutOutput({
        schemaVersion: "scout.cultural-moments.v1",
        strategy: {
          exaQueriesRun: 4,
          notes: [
            "Exa returned source-backed moments while one X-only fallback kept uncertainty explicit.",
          ],
        },
        candidates: [
          {
            id: "idea_01",
            shortTitle: "Gallery Night Queue",
            xSignalLine: "Sources: 2",
            whyImportant: "Listings and coverage show a city gallery night pulling fresh crowds.",
            whyFashionMerch: "Poster-grid graphics and opening-night badge cues.",
            signals: {
              xTrendNames: [],
              exaEvidenceCount: 2,
              uniqueSourceDomains: 2,
            },
            sources: [
              { url: "https://example.com/gallery", sourceType: "web" },
              { url: "https://events.example.com/gallery", sourceType: "web" },
            ],
          },
          {
            id: "idea_02",
            shortTitle: "Bandra Creator Queue",
            xSignalLine: "X: creator meet queue",
            whyImportant: "Public X posts show a fresh local fan queue forming in Bandra today.",
            description:
              "A creator meet-up queue is visible enough on X to read as a small city behavior. It stays marked as a deadline fallback because Exa was thin for this specific queue.",
            whyNow: "Recent posts today show the queue forming around the meet-up.",
            audience: "Creator fans and nearby college-age followers.",
            localAnchor: "Bandra creator meet queue",
            whyFashionMerch: "Queue-map graphics and original fan phrases.",
            signals: {
              xTrendNames: ["creator meet queue"],
              xTweetCountMax: null,
              xPublicMetricsSample: null,
              xMetricsUncertainty:
                "Exa was thin for this deadline fallback, so X metrics remain directional.",
              exaEvidenceCount: 0,
              uniqueSourceDomains: 0,
            },
            sources: [],
            evidenceHighlights: [
              {
                label: "X sample",
                detail: "Recent-search samples describe local queue behavior.",
              },
            ],
          },
          {
            id: "idea_03",
            shortTitle: "Food Fest Chant",
            xSignalLine: "X + sources",
            whyImportant: "A food festival is drawing public chatter and fresh event coverage.",
            whyFashionMerch: "Snack-stall emblems and chant-inspired original typography.",
            signals: {
              xTrendNames: ["food fest"],
              xTweetCountMax: 42,
              xPublicMetricsSample: { likes: 12 },
              exaEvidenceCount: 1,
              uniqueSourceDomains: 1,
            },
            sources: [
              { url: "https://example.com/food-fest", sourceType: "web" },
              { url: "https://x.com/example/status/1", sourceType: "x" },
            ],
          },
        ],
      }),
    ).not.toThrow();
  });

  it("requires a normal Scout artifact to include Exa query and candidate evidence", () => {
    expect(() =>
      validateScoutOutput({
        schemaVersion: "scout.cultural-moments.v1",
        strategy: {
          exaQueriesRun: 0,
          notes: ["Source-backed local cultural signal."],
        },
        candidates: [
          {
            id: "idea_01",
            shortTitle: "Monsoon cricket",
            xSignalLine: "Sources: 1",
            whyImportant: "Local cultural signal",
            whyFashionMerch: "Graphic cap idea",
            signals: {
              xTrendNames: [],
              exaEvidenceCount: 1,
              uniqueSourceDomains: 1,
            },
            sources: [{ url: "https://example.com/source", sourceType: "web" }],
          },
        ],
      }),
    ).toThrow(
      "Scout normal smoke must run Exa queries unless strategy.notes explains Exa was unavailable.",
    );

    expect(() =>
      validateScoutOutput({
        schemaVersion: "scout.cultural-moments.v1",
        strategy: {
          exaQueriesRun: 3,
          notes: ["Exa returned source-backed moments for the normal Scout smoke."],
        },
        candidates: [
          {
            id: "idea_01",
            shortTitle: "Bandra Creator Queue",
            xSignalLine: "X: creator meet queue",
            whyImportant: "Public X posts show a fresh local fan queue forming in Bandra today.",
            description:
              "A creator meet-up queue is visible enough on X to read as a local behavior. This fixture intentionally has no Exa-backed candidate elsewhere.",
            whyNow: "Recent posts today show the queue forming around the meet-up.",
            audience: "Creator fans and local youth culture followers.",
            localAnchor: "Bandra creator meet queue",
            whyFashionMerch: "Queue-map graphics and original fan phrases.",
            signals: {
              xTrendNames: ["creator meet queue"],
              xTweetCountMax: null,
              xPublicMetricsSample: null,
              xMetricsUncertainty:
                "X counts were unavailable, so this is a directional recency signal.",
              exaEvidenceCount: 0,
              uniqueSourceDomains: 0,
            },
            sources: [],
            evidenceHighlights: [
              {
                label: "X sample",
                detail: "Recent public posts describe a local queue.",
              },
            ],
          },
        ],
      }),
    ).toThrow(
      "Scout must include at least one Exa-backed candidate when Exa returned evidence.",
    );
  });

  it("rejects generic Scout topic labels without concrete moment context", () => {
    expect(() =>
      validateScoutOutput({
        schemaVersion: "scout.cultural-moments.v1",
        strategy: {
          exaQueriesRun: 0,
          notes: ["Exa was late, so this X-only candidate keeps uncertainty explicit."],
        },
        candidates: [
          {
            id: "idea_01",
            shortTitle: "Cricket Chatter Spike",
            xSignalLine: "X: 24 recent posts",
            whyImportant:
              "Ishan Kishan chatter is freshly active across Mumbai and India trend lanes.",
            whyFashionMerch: "Use generic cricket graphics and match-day phrases.",
            signals: {
              xTrendNames: ["Ishan Kishan"],
              xTweetCountMax: null,
              xMetricsUncertainty:
                "X counts were unavailable, so this is a directional recency signal.",
              exaEvidenceCount: 0,
              uniqueSourceDomains: 0,
            },
            sources: [],
          },
        ],
      }),
    ).toThrow(
      "Scout candidate 0 is too generic; final moments need a concrete trigger and local anchor.",
    );

    expect(() =>
      validateScoutOutput({
        schemaVersion: "scout.cultural-moments.v1",
        strategy: {
          exaQueriesRun: 0,
          notes: ["Exa was late, so this X-only candidate keeps uncertainty explicit."],
        },
        candidates: [
          {
            id: "idea_01",
            shortTitle: "Mumbai Cricket Comeback",
            xSignalLine: "X: 24 recent posts",
            whyImportant:
              "Cricket posts clustered today around live match discussion and Mumbai references.",
            description:
              "Ishan Kishan and #INDvsAFG appeared in Mumbai and India trend checks, with same-day cricket debate tied to Mumbai Indians history.",
            whyNow: "X posts clustered today around live or same-day cricket discussion.",
            audience: "Indian cricket fans and Mumbai Indians followers.",
            localAnchor:
              "Mumbai trend list, Mumbai Indians references and Wankhede-adjacent fan framing",
            whyFashionMerch: "Use cricket score grids and local match-day phrases.",
            signals: {
              xTrendNames: ["Ishan Kishan", "#INDvsAFG"],
              xTweetCountMax: null,
              xMetricsUncertainty:
                "X counts were unavailable, so this is a directional recency signal.",
              exaEvidenceCount: 0,
              uniqueSourceDomains: 0,
            },
            sources: [],
            evidenceHighlights: [
              {
                label: "X sample",
                detail: "Recent-search samples show same-day national cricket debate.",
              },
            ],
          },
        ],
      }),
    ).toThrow(
      "Scout candidate 0 X-only evidence needs a concrete trigger and local anchor.",
    );
  });

  it("rejects malformed or empty Scout candidates", () => {
    expect(() =>
      validateScoutOutput({
        schemaVersion: "scout.cultural-moments.v1",
        strategy: {
          notes: ["No credible live cultural candidates returned."],
        },
        candidates: [],
      }),
    ).toThrow("Scout returned zero candidates.");

    expect(() =>
      validateScoutOutput({
        schemaVersion: "scout.cultural-moments.v1",
        strategy: {
          exaQueriesRun: 1,
          notes: ["Malformed candidate fixture."],
        },
        candidates: [
          {
            id: "idea_01",
            whyImportant: "Fans are gathering around a citywide celebration this week.",
            whyFashionMerch: "Local pride graphics and color cues.",
            signals: {
              exaEvidenceCount: 1,
            },
            sources: [{ url: "https://example.com/parade", sourceType: "web" }],
          },
        ],
      }),
    ).toThrow("Scout candidate 0 missing shortTitle.");
  });

  it("rejects Scout artifacts that include trendBackfill", () => {
    expect(() =>
      validateScoutOutput({
        schemaVersion: "scout.cultural-moments.v1",
        strategy: {
          trendBackfill: [],
          notes: ["Deprecated audit field should not be present."],
        },
        candidates: [
          {
            id: "idea_01",
            shortTitle: "City Parade Rush",
            xSignalLine: "Sources: 1",
            whyImportant: "Fans are gathering around a citywide celebration this week.",
            whyFashionMerch: "Local pride graphics and color cues.",
            signals: {
              exaEvidenceCount: 1,
              uniqueSourceDomains: 1,
            },
            sources: [{ url: "https://example.com/parade", sourceType: "web" }],
          },
        ],
      }),
    ).toThrow("Scout artifact must not contain trendBackfill.");
  });

  it("counts values and identifies transient sandbox start failures", () => {
    expect(countBy(["a", "b", "a"])).toEqual({ a: 2, b: 1 });
    expect(isTransientSandboxStartError(new Error("Status code 500 is not ok"))).toBe(
      true,
    );
    expect(isTransientSandboxStartError(new Error("validation failed"))).toBe(false);
  });
});
