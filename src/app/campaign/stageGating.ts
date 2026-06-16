export type CampaignStageKey = "scout" | "designer" | "builder" | "marketer";

export type CampaignDropStatus =
  | "creating"
  | "ready"
  | "scouting"
  | "awaiting_idea_selection"
  | "ready_to_design"
  | "designing"
  | "awaiting_mock_selection"
  | "ready_to_build"
  | "building"
  | "ready_to_market"
  | "marketing"
  | "completed"
  | "failed"
  | "cancelled"
  | string;

export type CampaignStageState = {
  drop?: {
    status?: CampaignDropStatus;
    currentStage?: CampaignStageKey;
    websiteUrl?: string | null;
  } | null;
  stageRuns?: ReadonlyArray<{
    stage: CampaignStageKey | string;
    status?: string;
    startedAt?: number;
    updatedAt?: number;
  }> | null;
  artifacts?: ReadonlyArray<{
    stage: CampaignStageKey | string;
  }> | null;
};

const stageOrder: CampaignStageKey[] = [
  "scout",
  "designer",
  "builder",
  "marketer",
];

export function resolveCampaignActiveStage(
  requestedStage: CampaignStageKey,
  state: CampaignStageState | null | undefined,
) {
  return isCampaignStageUnlocked(requestedStage, state)
    ? requestedStage
    : stageForCampaignDrop(state);
}

export function stageForCampaignDrop(
  state: CampaignStageState | null | undefined,
): CampaignStageKey {
  const status = state?.drop?.status;
  const currentStage = state?.drop?.currentStage;
  if (!status) {
    return "scout";
  }
  if (
    (status === "completed" || status === "failed" || status === "cancelled") &&
    currentStage
  ) {
    return currentStage;
  }
  if (status === "ready_to_market" || status === "marketing" || status === "completed") {
    return "marketer";
  }
  if (status === "ready_to_build" || status === "building") {
    return "builder";
  }
  if (
    status === "ready_to_design" ||
    status === "designing" ||
    status === "awaiting_mock_selection"
  ) {
    return "designer";
  }
  return "scout";
}

export function isCampaignStageUnlocked(
  stage: CampaignStageKey,
  state: CampaignStageState | null | undefined,
) {
  const index = stageOrder.indexOf(stage);
  if (index <= 0) {
    return true;
  }
  if (!state?.drop) {
    return false;
  }
  if (stage === "builder") {
    return isBuilderStageUnlocked(state);
  }
  if (isCampaignStageComplete(stage, state)) {
    return true;
  }
  if (state.drop.currentStage === stage || stageForCampaignDrop(state) === stage) {
    return true;
  }
  const previousStage = stageOrder[index - 1];
  return previousStage ? isCampaignStageComplete(previousStage, state) : false;
}

export function isCampaignStageComplete(
  stage: CampaignStageKey,
  state: CampaignStageState | null | undefined,
) {
  if (!state?.drop) {
    return false;
  }
  if (stage === "marketer") {
    return state.drop.status === "completed";
  }
  return Boolean(state.artifacts?.some((artifact) => artifact.stage === stage));
}

export function campaignStageProgress(
  stage: CampaignStageKey,
  state: CampaignStageState | null | undefined,
) {
  if (isCampaignStageComplete(stage, state)) {
    return 100;
  }
  if (state?.drop?.currentStage === stage) {
    return state.drop.status?.startsWith("awaiting") ? 86 : 58;
  }
  return 0;
}

function isBuilderStageUnlocked(state: CampaignStageState) {
  if (isCampaignStageComplete("builder", state)) {
    return true;
  }
  if (state.drop?.websiteUrl) {
    return true;
  }
  if (state.drop?.currentStage === "builder") {
    return true;
  }
  if (latestCampaignStageRun(state, "builder")) {
    return true;
  }
  return [
    "ready_to_build",
    "building",
    "ready_to_market",
    "marketing",
    "completed",
  ].includes(state.drop?.status ?? "");
}

function latestCampaignStageRun(
  state: CampaignStageState,
  stage: CampaignStageKey,
) {
  return state.stageRuns
    ?.filter((stageRun) => stageRun.stage === stage)
    .sort(
      (left, right) =>
        (right.startedAt ?? right.updatedAt ?? 0) -
        (left.startedAt ?? left.updatedAt ?? 0),
    )[0];
}
