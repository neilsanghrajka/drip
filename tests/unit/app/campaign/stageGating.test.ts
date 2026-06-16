import { describe, expect, it } from "vitest";

import {
  campaignStageProgress,
  isCampaignStageComplete,
  isCampaignStageUnlocked,
  resolveCampaignActiveStage,
  stageForCampaignDrop,
  type CampaignStageState,
} from "../../../../src/app/campaign/stageGating";

describe("campaign stage gating", () => {
  const designerCompleteBeforeBuildClick: CampaignStageState = {
    drop: {
      status: "awaiting_mock_selection",
      currentStage: "designer",
    },
    stageRuns: [
      {
        stage: "scout",
        status: "succeeded",
        updatedAt: 1781633003203,
      },
      {
        stage: "designer",
        status: "succeeded",
        updatedAt: 1781633353754,
      },
    ],
    artifacts: [
      { stage: "scout" },
      { stage: "designer" },
    ],
  };

  it("keeps Builder locked after Designer completes until Build Website is clicked", () => {
    expect(stageForCampaignDrop(designerCompleteBeforeBuildClick)).toBe("designer");
    expect(
      isCampaignStageUnlocked("builder", designerCompleteBeforeBuildClick),
    ).toBe(false);
    expect(
      resolveCampaignActiveStage("builder", designerCompleteBeforeBuildClick),
    ).toBe("designer");
  });

  it("unlocks Builder after Build Website records ready_to_build intent", () => {
    const afterBuildWebsiteClick: CampaignStageState = {
      ...designerCompleteBeforeBuildClick,
      drop: {
        status: "ready_to_build",
        currentStage: "builder",
      },
    };

    expect(stageForCampaignDrop(afterBuildWebsiteClick)).toBe("builder");
    expect(isCampaignStageUnlocked("builder", afterBuildWebsiteClick)).toBe(true);
    expect(resolveCampaignActiveStage("builder", afterBuildWebsiteClick)).toBe(
      "builder",
    );
  });

  it("keeps Builder reachable for the actual production post-build state", () => {
    const productionAfterBuilderSucceeded: CampaignStageState = {
      drop: {
        status: "ready_to_market",
        currentStage: "marketer",
        websiteUrl: "https://example-drop.vercel.app",
      },
      stageRuns: [
        {
          stage: "builder",
          status: "succeeded",
          startedAt: 1781662983249,
          updatedAt: 1781663192137,
        },
      ],
      artifacts: [
        { stage: "scout" },
        { stage: "designer" },
        { stage: "builder" },
      ],
    };

    expect(stageForCampaignDrop(productionAfterBuilderSucceeded)).toBe("marketer");
    expect(
      isCampaignStageUnlocked("builder", productionAfterBuilderSucceeded),
    ).toBe(true);
    expect(
      isCampaignStageUnlocked("marketer", productionAfterBuilderSucceeded),
    ).toBe(true);
    expect(
      resolveCampaignActiveStage("builder", productionAfterBuilderSucceeded),
    ).toBe("builder");
  });

  it("unlocks every stage for completed campaign replay even if artifacts are sparse", () => {
    const completedReplay: CampaignStageState = {
      drop: {
        status: "completed",
        currentStage: "marketer",
        websiteUrl: "https://example-drop.vercel.app",
      },
      artifacts: [{ stage: "marketer" }],
    };

    expect(stageForCampaignDrop(completedReplay)).toBe("marketer");
    expect(isCampaignStageUnlocked("scout", completedReplay)).toBe(true);
    expect(isCampaignStageUnlocked("designer", completedReplay)).toBe(true);
    expect(isCampaignStageUnlocked("builder", completedReplay)).toBe(true);
    expect(isCampaignStageUnlocked("marketer", completedReplay)).toBe(true);
    expect(resolveCampaignActiveStage("marketer", completedReplay)).toBe(
      "marketer",
    );
  });

  it("keeps previous stages viewable while a later stage is running", () => {
    const marketingInProgress: CampaignStageState = {
      drop: {
        status: "marketing",
        currentStage: "marketer",
        websiteUrl: "https://example-drop.vercel.app",
      },
      artifacts: [
        { stage: "scout" },
        { stage: "designer" },
        { stage: "builder" },
      ],
    };

    expect(isCampaignStageUnlocked("scout", marketingInProgress)).toBe(true);
    expect(isCampaignStageUnlocked("designer", marketingInProgress)).toBe(true);
    expect(isCampaignStageUnlocked("builder", marketingInProgress)).toBe(true);
    expect(isCampaignStageUnlocked("marketer", marketingInProgress)).toBe(true);
    expect(resolveCampaignActiveStage("builder", marketingInProgress)).toBe(
      "builder",
    );
  });

  it("unlocks the current stage and every previous stage even with sparse artifacts", () => {
    const sparseBuilderRun: CampaignStageState = {
      drop: {
        status: "building",
        currentStage: "builder",
      },
      artifacts: [],
    };

    expect(stageForCampaignDrop(sparseBuilderRun)).toBe("builder");
    expect(isCampaignStageUnlocked("scout", sparseBuilderRun)).toBe(true);
    expect(isCampaignStageUnlocked("designer", sparseBuilderRun)).toBe(true);
    expect(isCampaignStageUnlocked("builder", sparseBuilderRun)).toBe(true);
    expect(isCampaignStageUnlocked("marketer", sparseBuilderRun)).toBe(false);
    expect(resolveCampaignActiveStage("designer", sparseBuilderRun)).toBe(
      "designer",
    );
    expect(resolveCampaignActiveStage("marketer", sparseBuilderRun)).toBe(
      "builder",
    );
  });

  it("reports collected Scout and Designer artifacts as complete at full progress", () => {
    expect(
      isCampaignStageComplete("scout", designerCompleteBeforeBuildClick),
    ).toBe(true);
    expect(campaignStageProgress("scout", designerCompleteBeforeBuildClick)).toBe(
      100,
    );
    expect(
      isCampaignStageComplete("designer", designerCompleteBeforeBuildClick),
    ).toBe(true);
    expect(
      campaignStageProgress("designer", designerCompleteBeforeBuildClick),
    ).toBe(100);
  });

  it("uses awaiting progress only while the active stage has no artifact yet", () => {
    const waitingForDesignerOutput: CampaignStageState = {
      drop: {
        status: "awaiting_mock_selection",
        currentStage: "designer",
      },
      artifacts: [{ stage: "scout" }],
    };

    expect(
      isCampaignStageComplete("designer", waitingForDesignerOutput),
    ).toBe(false);
    expect(campaignStageProgress("designer", waitingForDesignerOutput)).toBe(86);
  });

  it("fills progress from live activity steps while a stage is running", () => {
    const designerRunInProgress: CampaignStageState = {
      drop: {
        status: "designing",
        currentStage: "designer",
      },
      artifacts: [{ stage: "scout" }],
      activity: [
        { stage: "designer", status: "complete" },
        { stage: "designer", status: "complete" },
        { stage: "designer", status: "running" },
        { stage: "designer", status: "pending" },
        { stage: "designer", status: "pending" },
        { stage: "designer", status: "pending" },
      ],
    };

    expect(campaignStageProgress("designer", designerRunInProgress)).toBe(42);
  });

  it("does not advance progress from pending-only activity placeholders", () => {
    const designerRunQueued: CampaignStageState = {
      drop: {
        status: "designing",
        currentStage: "designer",
      },
      artifacts: [{ stage: "scout" }],
      activity: [
        { stage: "designer", status: "pending" },
        { stage: "designer", status: "pending" },
      ],
    };

    expect(campaignStageProgress("designer", designerRunQueued)).toBe(58);
  });

  it("caps activity-derived progress below complete until the artifact is collected", () => {
    const designerRunCollectedButNoArtifactYet: CampaignStageState = {
      drop: {
        status: "designing",
        currentStage: "designer",
      },
      artifacts: [{ stage: "scout" }],
      activity: [
        { stage: "designer", status: "complete" },
        { stage: "designer", status: "complete" },
        { stage: "designer", status: "complete" },
      ],
    };

    expect(
      campaignStageProgress("designer", designerRunCollectedButNoArtifactYet),
    ).toBe(94);
  });

  it("requires completed drop status before marking Marketer complete", () => {
    const blockedMarketerOutput: CampaignStageState = {
      drop: {
        status: "marketing",
        currentStage: "marketer",
      },
      artifacts: [
        { stage: "scout" },
        { stage: "designer" },
        { stage: "builder" },
        { stage: "marketer" },
      ],
    };

    expect(isCampaignStageComplete("marketer", blockedMarketerOutput)).toBe(
      false,
    );
    expect(campaignStageProgress("marketer", blockedMarketerOutput)).toBe(58);
  });
});
