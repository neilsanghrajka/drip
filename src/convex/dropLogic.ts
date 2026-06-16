import type { Doc, Id } from "./_generated/dataModel";

export type DropStage = "scout" | "designer" | "marketer" | "builder";
export type DropStatus = Doc<"drops">["status"];
export type ReplayActivityStatus = "pending" | "running" | "complete" | "failed";

export type ReplayActivityInput = {
  drop: Doc<"drops">;
  stageRuns: Doc<"dropStageRuns">[];
  artifacts: Doc<"dropArtifacts">[];
  dropEvents: Doc<"dropEvents">[];
  sandboxEvents: Array<Doc<"sandboxRunEvents"> & { stage: DropStage }>;
};

const artifactRoot = "/vercel/sandbox/agent-workspace/drops";

export function nextStageForStatus(status: DropStatus): DropStage | null {
  switch (status) {
    case "creating":
    case "ready":
      return "scout";
    case "ready_to_design":
      return "designer";
    case "ready_to_build":
      return "builder";
    case "ready_to_market":
      return "marketer";
    default:
      return null;
  }
}

export function nextStageForDrop(
  drop: Pick<Doc<"drops">, "status" | "currentStage"> &
    Partial<Pick<Doc<"drops">, "winningDrop">>,
): DropStage | null {
  if (drop.status === "creating") {
    return drop.winningDrop ? "builder" : "scout";
  }
  if ((drop.status === "failed" || drop.status === "cancelled") && drop.currentStage) {
    return drop.currentStage;
  }
  if (drop.status === "completed" && drop.currentStage === "marketer") {
    return "marketer";
  }
  return nextStageForStatus(drop.status);
}

export function runningStatus(stage: DropStage): DropStatus {
  switch (stage) {
    case "scout":
      return "scouting";
    case "designer":
      return "designing";
    case "marketer":
      return "marketing";
    case "builder":
      return "building";
  }
}

export function statusAfterSuccessfulCollection(
  stage: DropStage,
  drop: Pick<Doc<"drops">, "winningDrop">,
): DropStatus {
  switch (stage) {
    case "scout":
      return "awaiting_idea_selection";
    case "designer":
      return "awaiting_mock_selection";
    case "marketer":
      return "completed";
    case "builder":
      return drop.winningDrop ? "completed" : "ready_to_market";
  }
}

export function stageArtifactIssue(stage: DropStage, data: unknown) {
  if (stage !== "marketer") {
    return null;
  }
  const root = isRecord(data) ? data : {};
  const safety = isRecord(root.safety) ? root.safety : {};
  const verification = isRecord(root.verification) ? root.verification : {};
  const issues = Array.isArray(verification.issues) ? verification.issues : [];
  const campaignCount = readNumber(verification.campaignCount, 0);
  const adSetCount = readNumber(verification.adSetCount, 0);
  const adCount = readNumber(verification.adCount, 0);
  const allCreatedPaused = safety.allCreatedPaused === true;
  const rawMetaIdsPersisted = safety.rawMetaIdsPersisted === true;

  if (rawMetaIdsPersisted) {
    return "Marketer artifact contains raw Meta identifiers and was not accepted.";
  }
  if (!allCreatedPaused) {
    return "Marketer did not verify every created delivery object status.";
  }
  if (issues.length > 0) {
    return "Marketer saved a blocked Meta artifact. Retry is required.";
  }
  if (campaignCount < 1 || adSetCount < 1 || adCount < 1) {
    return "Marketer did not create the required campaign, ad set, and ad.";
  }
  return null;
}

export function currentStageAfterCollection(
  stage: DropStage,
  status: DropStatus,
): DropStage | undefined {
  if (status === "completed") {
    return stage;
  }
  return currentStageForStatus(status);
}

export function currentStageForStatus(status: DropStatus): DropStage | undefined {
  switch (status) {
    case "ready":
    case "scouting":
    case "awaiting_idea_selection":
      return "scout";
    case "ready_to_design":
    case "designing":
    case "awaiting_mock_selection":
      return "designer";
    case "ready_to_build":
    case "building":
      return "builder";
    case "ready_to_market":
    case "marketing":
    case "awaiting_winner_approval":
      return "marketer";
    case "completed":
      return undefined;
    default:
      return undefined;
  }
}

export function stageOutputPath(
  dropId: Id<"drops">,
  stageRunId: Id<"dropStageRuns">,
  stage: DropStage,
) {
  const fileName = {
    scout: "scout-output.json",
    designer: "fashion-designer-output.json",
    marketer: "performance-marketer-output.json",
    builder: "builder-output.json",
  }[stage];
  return `${stageRoot(dropId, stageRunId, stage)}/${fileName}`;
}

export function stageRoot(
  dropId: Id<"drops">,
  stageRunId: Id<"dropStageRuns">,
  stage: DropStage,
) {
  return `${artifactRoot}/${dropId}/runs/${stageRunId}/${stage}`;
}

export function dropSandboxName(dropId: Id<"drops">) {
  return `drip-drop-${dropId}`.replace(/[^A-Za-z0-9_-]/g, "-");
}

export function selectionMessage(
  kind: "approvedIdeas" | "selectedMocks" | "winningDrop",
) {
  switch (kind) {
    case "approvedIdeas":
      return "Scout ideas selected.";
    case "selectedMocks":
      return "Designer products selected for Builder.";
    case "winningDrop":
      return "Winning Drop selected.";
  }
}

export function stageLabel(stage: DropStage) {
  switch (stage) {
    case "scout":
      return "Scout";
    case "designer":
      return "Designer";
    case "marketer":
      return "Marketer";
    case "builder":
      return "Builder";
  }
}

export function buildReplayActivity(input: ReplayActivityInput) {
  return (["scout", "designer", "builder", "marketer"] as DropStage[]).flatMap(
    (stage) => buildStageActivity(stage, input),
  );
}

export function stageRunningIndex(
  status: Doc<"dropStageRuns">["status"] | undefined,
  sandboxEventCount: number,
  stepCount: number,
) {
  if (!status || status === "queued") {
    return 0;
  }
  if (status === "starting") {
    return Math.min(1, stepCount - 1);
  }
  if (status === "running") {
    return Math.min(2 + Math.floor(sandboxEventCount / 8), stepCount - 2);
  }
  if (status === "collecting" || status === "succeeded") {
    return stepCount - 1;
  }
  if (status === "failed" || status === "cancelled") {
    return Math.min(2, stepCount - 1);
  }
  return 0;
}

export function activitySteps(stage: DropStage) {
  switch (stage) {
    case "scout":
      return [
        {
          label: "Preparing trend brief",
          detail: "Preparing a city-only culture scan for Scout.",
        },
        {
          label: "Searching X",
          detail: "Looking for live cultural signals and early momentum.",
        },
        {
          label: "Searching Exa",
          detail: "Checking shopping, culture, and web context.",
        },
        {
          label: "Dedupe signals",
          detail: "Removing repeats and weak trend evidence.",
        },
        {
          label: "Rank merchable moments",
          detail: "Choosing source-backed moments that can inspire a limited drop.",
        },
        {
          label: "Write Scout proposals",
          detail: "Saving proposal cards for user selection.",
        },
      ];
    case "designer":
      return [
        {
          label: "Read selected Scout ideas",
          detail: "Turning approved moments into product briefs.",
        },
        {
          label: "Generate product directions",
          detail: "Exploring fits, graphics, and product angles.",
        },
        {
          label: "Create mock images",
          detail: "Generating merch visuals for review.",
        },
        {
          label: "Review image quality",
          detail: "Checking whether the mockups look usable.",
        },
        {
          label: "Package mockups",
          detail: "Saving image assets and structured Designer output.",
        },
      ];
    case "builder":
      return [
        {
          label: "Read selected clothes/images",
          detail: "Loading the exact products chosen by the user.",
        },
        {
          label: "Generate carousel assets",
          detail: "Preparing selected product images for the drop site.",
        },
        {
          label: "Build static drop page",
          detail: "Creating the limited-drop page and buy CTA.",
        },
        {
          label: "Run visual review",
          detail: "Checking layout, image quality, and mobile fit.",
        },
        {
          label: "Deploy preview URL",
          detail: "Publishing the reviewed site preview.",
        },
        {
          label: "Save Builder artifact",
          detail: "Persisting the site URL, files, and proof.",
        },
      ];
    case "marketer":
      return [
        {
          label: "Read Builder URL",
          detail: "Using the generated site link as the ad destination.",
        },
        {
          label: "Prepare selected product images",
          detail: "Packaging the same product images for Facebook.",
        },
        {
          label: "Write Facebook ad copy",
          detail: "Drafting product-safe drop-of-week creative.",
        },
        {
          label: "Create ad",
          detail: "Creating the campaign, ad set, and ad.",
        },
        {
          label: "Verify status",
          detail: "Confirming delivery status before saving evidence.",
        },
        {
          label: "Save sanitized ad artifact",
          detail: "Persisting IDs and proof without raw secret data.",
        },
      ];
  }
}

export function readBuilderUrl(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return undefined;
  }
  const root = data as Record<string, unknown>;
  const site = root.site;
  if (site && typeof site === "object" && !Array.isArray(site)) {
    const deploymentUrl = (site as Record<string, unknown>).deploymentUrl;
    if (typeof deploymentUrl === "string") {
      return deploymentUrl;
    }
    const historicalUrl = (site as Record<string, unknown>).canonicalHistoricalUrl;
    if (typeof historicalUrl === "string") {
      return historicalUrl;
    }
  }
  return undefined;
}

function buildStageActivity(stage: DropStage, input: ReplayActivityInput) {
  const steps = activitySteps(stage);
  const stageRuns = input.stageRuns.filter((run) => run.stage === stage);
  const latestRun = stageRuns[stageRuns.length - 1];
  const hasArtifact = input.artifacts.some((artifact) => artifact.stage === stage);
  const latestDropEvent = [...input.dropEvents]
    .reverse()
    .find((event) => event.stage === stage && event.visibility === "user");
  const sandboxEventCount = input.sandboxEvents.filter(
    (event) => event.stage === stage,
  ).length;
  const status = latestRun?.status;
  const failed = status === "failed" || input.drop.status === "failed";
  const runningIndex = stageRunningIndex(status, sandboxEventCount, steps.length);
  const completeCount = hasArtifact
    ? steps.length
    : status === "collecting"
      ? Math.max(steps.length - 1, 0)
      : status === "succeeded"
        ? Math.max(steps.length - 1, 0)
        : Math.max(runningIndex, 0);

  return steps.map((step, index) => {
    let itemStatus: ReplayActivityStatus = "pending";
    if (index < completeCount) {
      itemStatus = "complete";
    } else if (index === runningIndex && status) {
      itemStatus = failed ? "failed" : "running";
    }
    return {
      stage,
      label: step.label,
      detail:
        index === runningIndex && latestDropEvent?.message
          ? latestDropEvent.message
          : step.detail,
      status: itemStatus,
      attempt: latestRun?.attempt ?? null,
      createdAt: latestDropEvent?.createdAt ?? latestRun?.updatedAt ?? null,
    };
  });
}

function readNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
