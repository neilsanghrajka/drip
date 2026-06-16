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
    ]);

    expect(options).toMatchObject({
      scenario: "builder-drop-site",
      timeoutMs: 1000,
      pollMs: 250,
      startAttempts: 2,
      keepSandbox: true,
      skipSandboxFiles: true,
      cleanupArtifacts: true,
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
          trendBackfill: [
            {
              trend: "Monsoon cricket",
              sourceLane: "x",
              exaQueriesAttempted: ["Mumbai Monsoon cricket local culture"],
              backed: true,
              selectedCandidateId: "idea_01",
              dropReason: null,
            },
          ],
        },
        candidates: [
          {
            id: "idea_01",
            shortTitle: "Monsoon cricket",
            whyImportant: "Local cultural signal",
            whyFashionMerch: "Graphic cap idea",
            signals: { source: "x" },
            sources: [{ url: "https://example.com/source" }],
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

  it("rejects Scout outputs that skip trend backfill auditing", () => {
    expect(() =>
      validateScoutOutput({
        schemaVersion: "scout.cultural-moments.v1",
        strategy: {
          notes: [
            "Generic Exa event results were available, but a strong social trend was not backfilled.",
          ],
        },
        candidates: [
          {
            id: "idea_01",
            shortTitle: "City weekend fair",
            whyImportant: "A planned weekend event has current source coverage.",
            whyFashionMerch: "Graphic system idea",
            signals: { source: "exa" },
            sources: [{ url: "https://example.com/event" }],
          },
        ],
      }),
    ).toThrow("Scout strategy.trendBackfill must be an array.");
  });

  it("accepts sports and non-sports trend backfill audits without category-specific rules", () => {
    expect(() =>
      validateScoutOutput({
        schemaVersion: "scout.cultural-moments.v1",
        strategy: {
          trendBackfill: [
            {
              trend: "City championship parade",
              sourceLane: "x",
              exaQueriesAttempted: [
                "New York championship parade fans celebration recap",
              ],
              backed: true,
              selectedCandidateId: "idea_01",
              dropReason: null,
            },
            {
              trend: "Surprise album listening party",
              sourceLane: "x",
              exaQueriesAttempted: [
                "New York surprise album listening party crowd reaction",
              ],
              backed: true,
              selectedCandidateId: "idea_02",
              dropReason: null,
            },
            {
              trend: "Unverified cafe meme",
              sourceLane: "x",
              exaQueriesAttempted: ["New York unverified cafe meme reaction"],
              backed: false,
              selectedCandidateId: null,
              dropReason: "No source-backed context after targeted Exa backfill.",
            },
          ],
        },
        candidates: [
          {
            id: "idea_01",
            shortTitle: "City Parade Rush",
            whyImportant: "Fans are gathering around a citywide celebration this week.",
            whyFashionMerch: "Local pride graphics and color cues.",
            signals: { source: "x" },
            sources: [{ url: "https://example.com/parade" }],
          },
          {
            id: "idea_02",
            shortTitle: "Listening Party Line",
            whyImportant: "A surprise music drop is pulling fans into local listening events.",
            whyFashionMerch: "Audio-wave phrases and poster textures.",
            signals: { source: "x" },
            sources: [{ url: "https://example.com/listening-party" }],
          },
        ],
      }),
    ).not.toThrow();
  });

  it("counts values and identifies transient sandbox start failures", () => {
    expect(countBy(["a", "b", "a"])).toEqual({ a: 2, b: 1 });
    expect(isTransientSandboxStartError(new Error("Status code 500 is not ok"))).toBe(
      true,
    );
    expect(isTransientSandboxStartError(new Error("validation failed"))).toBe(false);
  });
});
