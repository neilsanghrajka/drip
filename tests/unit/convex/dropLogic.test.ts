import { describe, expect, it } from "vitest";

import {
  buildReplayActivity,
  currentStageAfterCollection,
  currentStageForStatus,
  dropSandboxName,
  nextStageForDrop,
  nextStageForStatus,
  readBuilderUrl,
  runningStatus,
  stageArtifactIssue,
  stageLabel,
  stageOutputPath,
  statusAfterSuccessfulCollection,
} from "../../../src/convex/dropLogic";

describe("drop logic", () => {
  it("maps drop statuses to the next executable stage", () => {
    expect(nextStageForStatus("ready")).toBe("scout");
    expect(nextStageForStatus("ready_to_design")).toBe("designer");
    expect(nextStageForStatus("ready_to_build")).toBe("builder");
    expect(nextStageForStatus("ready_to_market")).toBe("marketer");
    expect(nextStageForStatus("completed")).toBeNull();

    expect(nextStageForDrop({ status: "creating" })).toBe("scout");
    expect(nextStageForDrop({ status: "creating", winningDrop: { id: "win" } })).toBe(
      "builder",
    );
    expect(nextStageForDrop({ status: "failed", currentStage: "designer" })).toBe(
      "designer",
    );
    expect(nextStageForDrop({ status: "cancelled", currentStage: "builder" })).toBe(
      "builder",
    );
    expect(nextStageForDrop({ status: "completed", currentStage: "marketer" })).toBe(
      "marketer",
    );
  });

  it("maps stage execution and collection state", () => {
    expect(runningStatus("scout")).toBe("scouting");
    expect(runningStatus("designer")).toBe("designing");
    expect(runningStatus("builder")).toBe("building");
    expect(runningStatus("marketer")).toBe("marketing");

    expect(statusAfterSuccessfulCollection("scout", {})).toBe(
      "awaiting_idea_selection",
    );
    expect(statusAfterSuccessfulCollection("designer", {})).toBe(
      "awaiting_mock_selection",
    );
    expect(statusAfterSuccessfulCollection("builder", {})).toBe("ready_to_market");
    expect(statusAfterSuccessfulCollection("builder", { winningDrop: { id: "win" } })).toBe(
      "completed",
    );
    expect(statusAfterSuccessfulCollection("marketer", {})).toBe("completed");

    expect(currentStageForStatus("ready_to_market")).toBe("marketer");
    expect(currentStageForStatus("completed")).toBeUndefined();
    expect(currentStageAfterCollection("builder", "completed")).toBe("builder");
  });

  it("rejects unsafe or incomplete marketer artifacts", () => {
    const accepted = {
      safety: { allCreatedPaused: true, rawMetaIdsPersisted: false },
      verification: {
        issues: [],
        campaignCount: "1",
        adSetCount: 1,
        adCount: 1,
      },
    };

    expect(stageArtifactIssue("builder", {})).toBeNull();
    expect(stageArtifactIssue("marketer", accepted)).toBeNull();
    expect(
      stageArtifactIssue("marketer", {
        ...accepted,
        safety: { allCreatedPaused: true, rawMetaIdsPersisted: true },
      }),
    ).toBe("Marketer artifact contains raw Meta identifiers and was not accepted.");
    expect(
      stageArtifactIssue("marketer", {
        ...accepted,
        safety: { allCreatedPaused: false, rawMetaIdsPersisted: false },
      }),
    ).toBe("Marketer did not verify every created delivery object status.");
    expect(
      stageArtifactIssue("marketer", {
        ...accepted,
        verification: { issues: ["blocked"], campaignCount: 1, adSetCount: 1, adCount: 1 },
      }),
    ).toBe("Marketer saved a blocked Meta artifact. Retry is required.");
    expect(
      stageArtifactIssue("marketer", {
        ...accepted,
        verification: { issues: [], campaignCount: 0, adSetCount: 1, adCount: 1 },
      }),
    ).toBe("Marketer did not create the required campaign, ad set, and ad.");
  });

  it("builds stable sandbox names, stage paths, labels, and builder URLs", () => {
    expect(dropSandboxName("drop:123" as never)).toBe("drip-drop-drop-123");
    expect(stageLabel("builder")).toBe("Builder");
    expect(stageOutputPath("drop_1" as never, "run_1" as never, "builder")).toBe(
      "/vercel/sandbox/agent-workspace/drops/drop_1/runs/run_1/builder/builder-output.json",
    );
    expect(readBuilderUrl({ site: { deploymentUrl: "https://drop.example" } })).toBe(
      "https://drop.example",
    );
    expect(
      readBuilderUrl({
        site: { canonicalHistoricalUrl: "https://historical.example" },
      }),
    ).toBe("https://historical.example");
  });

  it("builds replay activity from latest stage and event state", () => {
    const activity = buildReplayActivity({
      drop: { status: "ready", _id: "drop_1" } as never,
      stageRuns: [
        {
          stage: "scout",
          status: "running",
          attempt: 2,
          updatedAt: 100,
        } as never,
      ],
      artifacts: [],
      dropEvents: [
        {
          stage: "scout",
          visibility: "user",
          message: "Scout is searching.",
          createdAt: 120,
        } as never,
      ],
      sandboxEvents: Array.from({ length: 9 }, () => ({ stage: "scout" }) as never),
    });

    const scoutItems = activity.filter((item) => item.stage === "scout");
    expect(scoutItems[0].status).toBe("complete");
    expect(scoutItems[3]).toMatchObject({
      status: "running",
      attempt: 2,
      detail: "Scout is searching.",
      createdAt: 120,
    });
  });
});
