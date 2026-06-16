"use client";

import {
  ArrowUpRight,
  BarChart3,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Crosshair,
  ExternalLink,
  Info,
  Loader2,
  Maximize2,
  PenLine,
  Sparkle,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ComponentType, CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAction, useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  campaignStageProgress,
  isCampaignStageComplete,
  isCampaignStageUnlocked,
  resolveCampaignActiveStage,
  stageForCampaignDrop,
} from "./stageGating";

type StageKey = "scout" | "designer" | "builder" | "marketer";
type DropStatus =
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

type Stage = {
  key: StageKey;
  step: string;
  name: string;
  shortName: string;
  color: string;
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  portrait: string;
  focusImage: string;
  title: string;
  estimate: string;
  line: string;
};

type DropView = {
  drop: {
    _id: Id<"drops">;
    workspaceId: string;
    createdAt?: number;
    name: string;
    dropDate: string;
    city?: string;
    startingMode?: string;
    status: DropStatus;
    currentStage?: StageKey;
    currentSandboxId?: string;
    currentSnapshotId?: string;
    topics?: string[];
    productCategories?: string[];
    tasteConstraints?: string[];
    websiteUrl?: string;
    error?: { message: string; code?: string };
    updatedAt?: number;
  };
  artifacts: DropArtifact[];
  assets: DropAsset[];
  activity?: ActivityItem[];
  dropEvents?: DropEvent[];
  selections: DropSelection[];
  sandboxEvents?: SandboxEvent[];
  stageRuns: Array<{
    _id: Id<"dropStageRuns">;
    attempt?: number;
    completedAt?: number;
    sandboxId?: string;
    sandboxRunId?: Id<"sandboxRuns">;
    stage: StageKey;
    startedAt?: number;
    status: string;
    error?: { message: string; code?: string };
    updatedAt?: number;
  }>;
};

type DropSummary = {
  _id: Id<"drops">;
  name: string;
  dropDate: string;
  status: DropStatus;
  currentStage?: StageKey;
  websiteUrl?: string;
  error?: { message: string; code?: string };
  createdAt: number;
  updatedAt: number;
};

type DropArtifact = {
  _id: Id<"dropArtifacts">;
  stage: StageKey;
  schemaVersion: string;
  data: unknown;
  summary?: unknown;
  createdAt: number;
};

type DropAsset = {
  sandboxPath: string;
  stage: StageKey;
  fileName: string;
  url?: string | null;
};

type DropSelection = {
  kind: "approvedIdeas" | "selectedMocks" | "winningDrop";
  value: unknown;
};

type DropEvent = {
  seq: number;
  stage?: StageKey;
  type: string;
  message?: string;
  visibility: "user" | "debug";
  createdAt: number;
};

type SandboxEvent = {
  seq: number;
  stage?: StageKey;
  type: string;
  createdAt: number;
};

type ActivityItem = {
  stage: StageKey;
  label: string;
  detail: string;
  status: "pending" | "running" | "complete" | "failed";
  attempt?: number | null;
  createdAt?: number | null;
};

type ScoutIdea = {
  id: string;
  title: string;
  xSignal: string;
  signal: string;
  angle: string;
  urgency: string;
  detail: ScoutIdeaDetail;
  raw: unknown;
};

type ScoutIdeaDetail = {
  audience?: string;
  description?: string;
  localAnchor?: string;
  uncertainty?: string;
  whyNow?: string;
  angle?: string;
  evidenceHighlights: ScoutEvidenceHighlight[];
  sources: ScoutSource[];
};

type ScoutEvidenceHighlight = {
  id: string;
  label: string;
  detail: string;
  url?: string;
};

type ScoutSource = {
  id: string;
  label: string;
  url?: string;
};

type DesignerMock = {
  id: string;
  ideaRef: string;
  name: string;
  idea: string;
  productType: string;
  imagePath?: string;
  imageUrl?: string | null;
  raw: unknown;
};

type ImagePreview = {
  alt: string;
  color: string;
  detail?: string;
  src: string;
  title: string;
};

const dropIdStorageKey = "drip.activeDropId";
const dropIdStorageEvent = "drip-active-drop-change";
const metaAdsManagerUrl = "https://adsmanager.facebook.com/adsmanager/manage/ads";

const stages: Stage[] = [
  {
    key: "scout",
    step: "01",
    name: "Scout",
    shortName: "Scout",
    color: "#55d12c",
    icon: Crosshair,
    portrait: "/drip-team/scout-portrait.png",
    focusImage: "/drip-campaign/scout-focus.png",
    title: "Finds the moment",
    estimate: "Est. 2-3 min",
    line: "Turns live signals into merchable drop ideas.",
  },
  {
    key: "designer",
    step: "02",
    name: "Fashion Designer",
    shortName: "Designer",
    color: "#1264ff",
    icon: PenLine,
    portrait: "/drip-team/designer-portrait.png",
    focusImage: "/drip-campaign/designer-focus.png",
    title: "Creates the mocks",
    estimate: "Est. 2-3 min",
    line: "Converts approved ideas into fashion concepts and images.",
  },
  {
    key: "builder",
    step: "03",
    name: "Builder",
    shortName: "Builder",
    color: "#f8ca00",
    icon: Box,
    portrait: "/drip-team/builder-portrait.png",
    focusImage: "/drip-campaign/builder-focus.png",
    title: "Builds the drop",
    estimate: "Est. 1-2 min",
    line: "Turns selected products into a one-page limited-drop site.",
  },
  {
    key: "marketer",
    step: "04",
    name: "Marketer",
    shortName: "Marketer",
    color: "#ff3c38",
    icon: BarChart3,
    portrait: "/drip-team/meta-portrait.png",
    focusImage: "/drip-campaign/marketer-focus.png",
    title: "Drafts the ad",
    estimate: "Est. 1-2 min",
    line: "Creates one Facebook ad from the site link and images.",
  },
];

export default function CampaignPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createDrop = useAction(api.dropActions.createDropShell);
  const startNextStage = useAction(api.dropActions.startNextStage);
  const selectScoutIdeas = useMutation(api.drops.selectScoutIdeas);
  const selectDesignerMocks = useMutation(api.drops.selectDesignerMocks);
  const cancelSandboxRun = useMutation(api.sandboxRuns.cancelSandboxRun);

  const [campaignName, setCampaignName] = useState("Week 52 Drop");
  const [campaignCity, setCampaignCity] = useState("Mumbai");
  const campaignDate = "This Week Sunday";
  const dropId = useSyncExternalStore(
    subscribeActiveDropId,
    readStoredDropId,
    readServerDropId,
  );
  const [manualStage, setManualStage] = useState<StageKey | null>(null);
  const [selectedIdeasOverride, setSelectedIdeasOverride] = useState<
    string[] | null
  >(null);
  const [selectedMocksOverride, setSelectedMocksOverride] = useState<
    string[] | null
  >(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const bootstrappingDropRef = useRef<Id<"drops"> | null>(null);
  const newSessionRequested = searchParams.get("new") === "1";
  const requestedDropId = searchParams.get("drop") as Id<"drops"> | null;
  const activeDropId = newSessionRequested ? null : (requestedDropId ?? dropId);

  const rawDropView = useQuery(
    api.drops.getDropReplay,
    activeDropId ? { dropId: activeDropId } : "skip",
  );
  const dropView = rawDropView as DropView | null | undefined;
  const rawRecentDrops = useQuery(api.drops.listDrops, { limit: 8 });
  const recentDrops = (rawRecentDrops ?? []) as DropSummary[];
  const started = Boolean(activeDropId);

  useEffect(() => {
    if (newSessionRequested) {
      window.localStorage.removeItem(dropIdStorageKey);
      window.dispatchEvent(new Event(dropIdStorageEvent));
      window.history.replaceState(null, "", "/campaign");
      return;
    }
    if (requestedDropId && requestedDropId !== dropId) {
      writeStoredDropId(requestedDropId);
    }
  }, [dropId, newSessionRequested, requestedDropId]);

  useEffect(() => {
    if (activeDropId && rawDropView === null) {
      window.localStorage.removeItem(dropIdStorageKey);
      window.dispatchEvent(new Event(dropIdStorageEvent));
    }
  }, [activeDropId, rawDropView]);

  const artifacts = useMemo(
    () => ({
      scout: latestArtifact(dropView, "scout"),
      designer: latestArtifact(dropView, "designer"),
      builder: latestArtifact(dropView, "builder"),
      marketer: latestArtifact(dropView, "marketer"),
    }),
    [dropView],
  );
  const scoutIdeas = useMemo(
    () => readScoutIdeas(artifacts.scout?.data),
    [artifacts.scout],
  );
  const designerMocks = useMemo(
    () => readDesignerMocks(artifacts.designer?.data, dropView?.assets ?? []),
    [artifacts.designer, dropView?.assets],
  );
  const builderUrl = useMemo(
    () => dropView?.drop.websiteUrl ?? readBuilderUrl(artifacts.builder?.data),
    [artifacts.builder, dropView?.drop.websiteUrl],
  );
  const selectedIdeas =
    selectedIdeasOverride ?? scoutIdeas.slice(0, 3).map((idea) => idea.id);
  const selectedMocks =
    selectedMocksOverride ?? designerMocks.slice(0, 3).map((mock) => mock.id);
  const requestedActiveKey = manualStage ?? stageForCampaignDrop(dropView);
  const activeKey = resolveCampaignActiveStage(requestedActiveKey, dropView);
  const activeIndex = Math.max(
    0,
    stages.findIndex((stage) => stage.key === activeKey),
  );
  const active = stages[activeIndex] ?? stages[0];
  const activityItems = dropView?.activity ?? [];
  const cancellableRun = useMemo(() => activeDropStageRun(dropView), [dropView]);
  const workspaceStatus = workspaceLifecycleStatus(dropView, cancellableRun);
  const isStageActionPending = Boolean(
    pendingAction || dropView?.drop.status === "creating",
  );

  useEffect(() => {
    const currentDropId = dropView?.drop._id;
    const currentDropStatus = dropView?.drop.status;
    if (
      !currentDropId ||
      currentDropStatus !== "creating" ||
      bootstrappingDropRef.current === currentDropId
    ) {
      return;
    }

    bootstrappingDropRef.current = currentDropId;
    void startNextStage({ dropId: currentDropId })
      .catch((caught) => {
        setError(cleanActionError(caught));
      })
      .finally(() => {
        if (bootstrappingDropRef.current === currentDropId) {
          bootstrappingDropRef.current = null;
        }
      });
  }, [dropView?.drop._id, dropView?.drop.status, startNextStage]);

  async function runAction(label: string, action: () => Promise<void>) {
    setPendingAction(label);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(cleanActionError(caught));
    } finally {
      setPendingAction(null);
    }
  }

  async function beginScouting() {
    await runAction("begin-scouting", async () => {
      const created = await createDrop({
        name: campaignName,
        dropDate: campaignDate,
        city: campaignCity.trim() || "Mumbai",
        startingMode: "weekly-scout",
        productCategories: ["caps", "socks", "tees", "hoodies"],
        tasteConstraints: [
          "premium streetwear",
          "collectible weekly drop",
          "clear readable original text",
          "original emblem or badge system",
          "3D, puff, embroidered, or dimensional print treatment",
        ],
      });
      writeStoredDropId(created.dropId);
      setSelectedIdeasOverride(null);
      setSelectedMocksOverride(null);
      setManualStage("scout");
    });
  }

  async function approveIdeasAndDesign() {
    if (!dropView) {
      return;
    }
    await runAction("send-to-designer", async () => {
      const approvedIdeas = scoutIdeas
        .filter((idea) => selectedIdeas.includes(idea.id))
        .slice(0, 3)
        .map((idea) => idea.raw);
      await selectScoutIdeas({
        dropId: dropView.drop._id,
        approvedIdeas,
      });
      setManualStage("designer");
      await startNextStage({ dropId: dropView.drop._id });
    });
  }

  async function approveProductsAndBuild() {
    if (!dropView) {
      return;
    }
    await runAction("send-to-builder", async () => {
      const selectedProducts = designerMocks
        .filter((mock) => selectedMocks.includes(mock.id))
        .map((mock) => ({
          ...asRecord(mock.raw),
          mockRef: mock.id,
          ideaRef: mock.ideaRef,
          productName: mock.name,
          productType: mock.productType,
          imagePath: mock.imagePath,
          imageUrl: mock.imageUrl,
        }));
      await selectDesignerMocks({
        dropId: dropView.drop._id,
        selectedMocks: selectedProducts,
      });
      setManualStage("builder");
      await startNextStage({ dropId: dropView.drop._id });
    });
  }

  async function marketDrop() {
    if (!dropView) {
      return;
    }
    await runAction("create-ad", async () => {
      setManualStage("marketer");
      await startNextStage({ dropId: dropView.drop._id });
    });
  }

  function goToMarketer() {
    setManualStage("marketer");
    setError(null);
  }

  async function retryCurrentStage() {
    if (
      !dropView ||
      (dropView.drop.status !== "failed" && dropView.drop.status !== "cancelled")
    ) {
      return;
    }
    await runAction("retry-stage", async () => {
      const retryStage = dropView.drop.currentStage ?? active.key;
      setManualStage(retryStage);
      await startNextStage({ dropId: dropView.drop._id });
    });
  }

  async function cancelActiveRun() {
    if (!cancellableRun?.sandboxRunId) {
      return;
    }
    await runAction("cancel-run", async () => {
      setManualStage(cancellableRun.stage);
      await cancelSandboxRun({ sandboxRunId: cancellableRun.sandboxRunId! });
    });
  }

  function toggleIdea(id: string) {
    setSelectedIdeasOverride((current) =>
      (current ?? selectedIdeas).includes(id)
        ? (current ?? selectedIdeas).filter((item) => item !== id)
        : [...(current ?? selectedIdeas), id].slice(0, 3),
    );
  }

  function toggleMock(id: string) {
    setSelectedMocksOverride((current) =>
      (current ?? selectedMocks).includes(id)
        ? (current ?? selectedMocks).filter((item) => item !== id)
        : [...(current ?? selectedMocks), id],
    );
  }

  function resetSelections() {
    setSelectedIdeasOverride(null);
    setSelectedMocksOverride(null);
  }

  function clearActiveDrop() {
    window.localStorage.removeItem(dropIdStorageKey);
    window.dispatchEvent(new Event(dropIdStorageEvent));
    router.replace("/campaign?new=1", { scroll: false });
    setManualStage(null);
    resetSelections();
  }

  function openHistoricalDrop(nextDropId: Id<"drops">) {
    writeStoredDropId(nextDropId);
    router.replace(`/campaign?drop=${nextDropId}`, { scroll: false });
    setManualStage(null);
    setError(null);
    resetSelections();
  }

  return (
    <main className="drip-shell flex h-svh flex-col overflow-hidden bg-white text-black">
      <header className="flex h-[64px] shrink-0 items-center justify-between gap-5 border-b-[3px] border-black px-5 py-2 lg:px-8">
        <Link className="drip-logo group relative" href="/">
          Drip
          <Sparkle className="absolute -right-6 top-1 size-7 fill-[#ffd400] stroke-black stroke-[1.5] transition group-hover:rotate-12" />
        </Link>

        <div className="hidden flex-1 items-center justify-end gap-4 md:flex">
          <SessionSelect
            activeDropId={activeDropId}
            currentName={dropView?.drop.name ?? campaignName}
            onOpenDrop={openHistoricalDrop}
            recentDrops={recentDrops}
          />
        </div>
      </header>

      {!started ? (
        <StartCampaignScreen
          campaignName={campaignName}
          campaignCity={campaignCity}
          error={error}
          isStarting={pendingAction === "begin-scouting"}
          onCampaignCityChange={setCampaignCity}
          onCampaignNameChange={setCampaignName}
          onStart={beginScouting}
        />
      ) : (
        <section className="drip-dot-bg min-h-0 flex-1 overflow-hidden px-5 py-4 lg:px-8">
          <div className="mx-auto grid h-full max-w-[1740px] gap-4 lg:grid-cols-[276px_minmax(0,1fr)]">
            <aside className="grid h-full min-h-0 content-start gap-2 overflow-hidden">
              <div className="rounded-[18px] border-[4px] border-black bg-white p-3 shadow-[4px_4px_0_#000]">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-500">
                  Active campaign
                </p>
                <h1 className="mt-1 text-[24px] font-black leading-none tracking-[-0.04em]">
                  {dropView?.drop.name ?? campaignName}
                </h1>
                <p className="mt-1 text-[12px] font-bold leading-tight text-neutral-500">
                  {dropView?.drop.dropDate ?? campaignDate} · four-teammate workflow
                </p>
                <div className="mt-2 rounded-[10px] border-[2px] border-black bg-neutral-50 px-2.5 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-neutral-500">
                      Workspace
                    </span>
                    <span
                      className="rounded-full border-[2px] border-black px-2 py-0.5 text-[9px] font-black uppercase"
                      style={{ backgroundColor: workspaceStatus.color }}
                    >
                      {workspaceStatus.label}
                    </span>
                  </div>
                  <p className="drip-clamp-1 mt-0.5 text-[10px] font-bold leading-tight text-neutral-600">
                    {workspaceStatus.detail}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    className="rounded-[10px] border-[3px] border-black bg-white px-2.5 py-1.5 text-[11px] font-black uppercase transition hover:bg-neutral-100"
                    onClick={clearActiveDrop}
                    type="button"
                  >
                    Remove
                  </button>
                  {cancellableRun?.sandboxRunId ? (
                    <button
                      className="rounded-[10px] border-[3px] border-black bg-[#ffefee] px-2.5 py-1.5 text-[11px] font-black uppercase text-[#b31310] transition hover:bg-[#ffd9d6] disabled:cursor-wait disabled:opacity-60"
                      disabled={Boolean(pendingAction)}
                      onClick={cancelActiveRun}
                      type="button"
                    >
                      Cancel
                    </button>
                  ) : null}
                  <button
                    className="rounded-[10px] border-[3px] border-black bg-[#f8ca00] px-2.5 py-1.5 text-[11px] font-black uppercase transition hover:brightness-95"
                    onClick={() => setShowArtifacts((value) => !value)}
                    type="button"
                  >
                    Artifacts
                  </button>
                </div>
              </div>

              <div className="grid gap-2">
                {stages.map((stage) => (
                  <StageRailCard
                    active={stage.key === active.key}
                    completed={isCampaignStageComplete(stage.key, dropView)}
                    key={stage.key}
                    onActivate={() => setManualStage(stage.key)}
                    progress={campaignStageProgress(stage.key, dropView)}
                    stage={stage}
                    unlocked={isCampaignStageUnlocked(stage.key, dropView)}
                  />
                ))}
              </div>

              {showArtifacts ? (
                <ArtifactPanel
                  dropView={dropView}
                  expanded={showArtifacts}
                  onToggle={() => setShowArtifacts((value) => !value)}
                />
              ) : null}
            </aside>

            <section className="min-h-0 min-w-0">
              <StageWorkspace
                active={active}
                activeIndex={activeIndex}
                builderUrl={builderUrl}
                designerMocks={designerMocks}
                dropView={dropView}
                error={cleanNullableError(error ?? dropView?.drop.error?.message)}
                isPending={isStageActionPending}
                marketerArtifact={artifacts.marketer}
                activityItems={activityItems}
                onGoToMarket={goToMarketer}
                onApproveIdeas={approveIdeasAndDesign}
                onApproveProducts={approveProductsAndBuild}
                onMarketDrop={marketDrop}
                onRetryStage={retryCurrentStage}
                onSelectIdea={toggleIdea}
                onSelectMock={toggleMock}
                scoutIdeas={scoutIdeas}
                selectedIdeas={selectedIdeas}
                selectedMocks={selectedMocks}
              />
            </section>
          </div>
        </section>
      )}
    </main>
  );
}

function readStoredDropId() {
  if (typeof window === "undefined") {
    return null;
  }
  return (
    (window.localStorage.getItem(dropIdStorageKey) as Id<"drops"> | null) ??
    null
  );
}

function readServerDropId() {
  return null;
}

function subscribeActiveDropId(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(dropIdStorageEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(dropIdStorageEvent, onChange);
  };
}

function writeStoredDropId(dropId: Id<"drops">) {
  window.localStorage.setItem(dropIdStorageKey, dropId);
  window.dispatchEvent(new Event(dropIdStorageEvent));
}

function SessionSelect({
  activeDropId,
  currentName,
  onOpenDrop,
  recentDrops,
}: {
  activeDropId: Id<"drops"> | null;
  currentName: string;
  onOpenDrop: (dropId: Id<"drops">) => void;
  recentDrops: DropSummary[];
}) {
  const activeDropInList = recentDrops.some((drop) => drop._id === activeDropId);
  const value = activeDropId
    ? activeDropInList
      ? activeDropId
      : "__current__"
    : "__none__";

  return (
    <label className="flex items-center gap-3">
      <span className="sr-only">Campaign</span>
      <select
        aria-label="Campaign"
        className="h-11 min-w-[250px] rounded-[10px] border-[3px] border-black bg-white px-3 text-sm font-black outline-none focus:bg-neutral-100"
        onChange={(event) => {
          if (
            event.target.value === "__current__" ||
            event.target.value === "__none__"
          ) {
            return;
          }
          onOpenDrop(event.target.value as Id<"drops">);
        }}
        value={value}
      >
        {!activeDropId && recentDrops.length > 0 ? (
          <option disabled value="__none__">
            Select campaign
          </option>
        ) : null}
        {activeDropId && !activeDropInList ? (
          <option value="__current__">{currentName}</option>
        ) : null}
        {recentDrops.length > 0 ? (
          recentDrops.map((drop) => (
            <option key={drop._id} value={drop._id}>
              {drop.name}
            </option>
          ))
        ) : (
          <option disabled value="__none__">
            No previous campaigns
          </option>
        )}
      </select>
    </label>
  );
}

function StartCampaignScreen({
  campaignCity,
  campaignName,
  error,
  isStarting,
  onCampaignCityChange,
  onCampaignNameChange,
  onStart,
}: {
  campaignCity: string;
  campaignName: string;
  error: string | null;
  isStarting: boolean;
  onCampaignCityChange: (value: string) => void;
  onCampaignNameChange: (value: string) => void;
  onStart: () => void;
}) {
  const [activeKey, setActiveKey] = useState<StageKey>("scout");
  const active = stages.find((stage) => stage.key === activeKey) ?? stages[0];

  return (
    <section className="drip-dot-bg h-[calc(100svh-64px)] overflow-hidden px-6 py-5 lg:px-10">
      <div className="mx-auto grid h-full max-w-[1500px] gap-8 lg:grid-cols-[minmax(340px,0.72fr)_minmax(520px,1fr)] lg:items-center">
        <div>
          <p className="mb-4 text-[12px] font-black uppercase tracking-[0.22em]">
            Campaign setup
          </p>
          <h1 className="drip-heading text-[62px] leading-[0.95] tracking-[-0.04em] sm:text-[86px] xl:text-[104px]">
            Start Drop
            <br />
            Campaign
          </h1>
          <p className="mt-6 max-w-[520px] text-[24px] leading-tight">
            Name the week, then let Scout begin the team run.
          </p>

          <div className="mt-8 grid max-w-[560px] gap-4 rounded-[20px] border-[4px] border-black bg-white p-5 shadow-[7px_7px_0_#000]">
            <label className="grid gap-2 text-[12px] font-black uppercase tracking-[0.18em]">
              Campaign name
              <input
                className="h-16 rounded-[10px] border-[3px] border-black bg-white px-4 text-2xl font-black outline-none transition focus:bg-neutral-100 focus:text-neutral-500"
                onChange={(event) => onCampaignNameChange(event.target.value)}
                value={campaignName}
              />
            </label>
            <label className="grid gap-2 text-[12px] font-black uppercase tracking-[0.18em]">
              City
              <input
                className="h-16 rounded-[10px] border-[3px] border-black bg-white px-4 text-2xl font-black outline-none transition focus:bg-neutral-100 focus:text-neutral-500"
                onChange={(event) => onCampaignCityChange(event.target.value)}
                value={campaignCity}
              />
            </label>
            {error ? (
              <div className="rounded-[12px] border-[3px] border-black bg-[#ffefee] px-4 py-3 text-sm font-black leading-tight text-[#b31310]">
                {error}
              </div>
            ) : null}
            <button
              className="drip-button mt-2 h-[68px] px-9 text-2xl disabled:cursor-wait disabled:opacity-70"
              disabled={isStarting}
              onClick={onStart}
              type="button"
            >
              {isStarting ? <Loader2 className="mr-2 size-6 animate-spin" /> : null}
              Begin scouting
            </button>
          </div>

        </div>

        <div className="grid gap-5 md:grid-cols-[260px_minmax(0,1fr)] md:items-center">
          <div className="grid gap-3">
            {stages.map((stage) => (
              <MiniTeamCard
                active={stage.key === activeKey}
                key={stage.key}
                onActivate={() => setActiveKey(stage.key)}
                stage={stage}
              />
            ))}
          </div>
          <TeamHero stage={active} />
        </div>
      </div>
    </section>
  );
}

function MiniTeamCard({
  active,
  onActivate,
  stage,
}: {
  active: boolean;
  onActivate: () => void;
  stage: Stage;
}) {
  const Icon = stage.icon;

  return (
    <button
      aria-pressed={active}
      className="group rounded-[18px] outline-none transition duration-200 hover:-translate-y-1 focus-visible:ring-4 focus-visible:ring-black/70"
      onClick={onActivate}
      onFocus={onActivate}
      onMouseEnter={onActivate}
      type="button"
    >
      <article
        className="overflow-hidden rounded-[18px] border-[4px] border-black bg-white shadow-[6px_6px_0_#000] transition duration-200"
        style={{ boxShadow: active ? `7px 7px 0 ${stage.color}` : undefined }}
      >
        <div
          className="relative aspect-[1/0.54]"
          style={{ backgroundColor: stage.color }}
        >
          <img
            alt={`${stage.name} portrait`}
            className="h-full w-full object-cover object-[center_32%]"
            src={stage.portrait}
          />
          <div className="absolute right-2.5 top-2.5 grid size-10 place-items-center rounded-full border-[3px] border-black bg-white">
            <Icon className="size-5" style={{ color: stage.color }} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t-[4px] border-black bg-white px-3 py-2">
          <span className="text-[16px] font-black">{stage.shortName}</span>
          <span className="size-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
        </div>
      </article>
    </button>
  );
}

function TeamHero({ stage }: { stage: Stage }) {
  return (
    <div className="overflow-hidden rounded-[26px] border-[4px] border-black bg-black shadow-[8px_8px_0_#000]">
      <div
        className="flex h-16 items-center justify-between px-6 text-white"
        style={{ backgroundColor: stage.color }}
      >
        <h2 className="text-[30px] font-black tracking-[-0.03em]">
          {stage.shortName}
        </h2>
        <span className="text-sm font-black uppercase">Ready</span>
      </div>
      <div className="relative aspect-[1/0.82]">
        <img
          alt={`${stage.name} campaign illustration`}
          className="h-full w-full object-cover"
          src={stage.focusImage}
        />
      </div>
      <div className="p-7 text-white">
        <h3 className="text-[34px] font-black tracking-[-0.04em]">
          {stage.title}
        </h3>
        <p className="mt-2 max-w-[430px] text-[22px] leading-tight">
          {stage.line}
        </p>
      </div>
    </div>
  );
}

function StageRailCard({
  active,
  completed,
  onActivate,
  progress,
  stage,
  unlocked,
}: {
  active: boolean;
  completed: boolean;
  onActivate: () => void;
  progress: number;
  stage: Stage;
  unlocked: boolean;
}) {
  const Icon = stage.icon;

  return (
    <button
      aria-pressed={active}
      className="group rounded-[18px] text-left outline-none transition duration-200 hover:-translate-y-1 focus-visible:ring-4 focus-visible:ring-black/70 disabled:cursor-not-allowed disabled:opacity-55"
      disabled={!unlocked}
      onClick={onActivate}
      type="button"
    >
      <article
        className={`overflow-hidden rounded-[18px] border-[4px] border-black bg-white shadow-[5px_5px_0_#000] transition-all duration-300 ${
          active ? "min-h-[124px]" : "min-h-[64px]"
        }`}
        style={{ boxShadow: active ? `7px 7px 0 ${stage.color}` : undefined }}
      >
        <div className="grid grid-cols-[56px_1fr]">
          <div className="relative h-[60px]" style={{ backgroundColor: stage.color }}>
            <img
              alt={`${stage.name} portrait`}
              className="h-full w-full object-cover object-[center_30%]"
              src={stage.portrait}
            />
          </div>
          <div className="p-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase text-neutral-500">
                  Teammate {stage.step}
                </p>
                <h3 className="text-[18px] font-black leading-none tracking-[-0.04em]">
                  {stage.shortName}
                </h3>
              </div>
              <div
                className="grid size-7 shrink-0 place-items-center rounded-full border-[3px] border-black bg-white"
                style={{ color: stage.color }}
              >
                {completed ? (
                  <Check className="size-4 stroke-[4]" />
                ) : (
                  <Icon className="size-4 stroke-[3]" />
                )}
              </div>
            </div>
          </div>
        </div>

        {active ? (
          <div className="border-t-[4px] border-black px-2 py-1.5">
            <div className="mb-1 flex items-center justify-between text-[9px] font-black uppercase">
              <span>{completed ? "Complete" : "In progress"}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full border-[2px] border-black bg-white">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ backgroundColor: stage.color, width: `${progress}%` }}
              />
            </div>
            <p className="drip-clamp-1 mt-1.5 text-[11px] font-bold leading-tight text-neutral-700">
              {completed ? "Output is ready." : stage.line}
            </p>
          </div>
        ) : null}
      </article>
    </button>
  );
}

function ArtifactPanel({
  dropView,
  expanded,
  onToggle,
}: {
  dropView?: DropView | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="rounded-[18px] border-[4px] border-black bg-white p-4 shadow-[5px_5px_0_#000]">
      <button
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={onToggle}
        type="button"
      >
        <span>
          <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-neutral-500">
            Artifacts
          </span>
          <span className="mt-1 block text-[22px] font-black leading-none tracking-[-0.04em]">
            Inspect outputs
          </span>
        </span>
        <ChevronDown
          className={`size-5 transition ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      <div className="mt-4 grid gap-2">
        {stages.map((stage) => {
          const artifact = latestArtifact(dropView, stage.key);
          const assets =
            dropView?.assets.filter((asset) => asset.stage === stage.key) ?? [];
          const stageRun = latestStageRun(dropView, stage.key);
          const selection = selectionForStage(dropView, stage.key);
          return (
            <div
              className="rounded-[12px] border-[3px] border-black bg-neutral-50 p-3"
              key={stage.key}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{stage.name}</p>
                  <p className="text-[11px] font-bold uppercase text-neutral-500">
                    {artifact
                      ? `schema ${artifact.schemaVersion}`
                      : stageRun?.error
                        ? "error captured"
                        : "waiting"}
                  </p>
                </div>
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-full border-[3px] border-black"
                  style={{ backgroundColor: artifact ? stage.color : "#fff" }}
                >
                  {artifact ? <Check className="size-4 stroke-[4]" /> : assets.length}
                </span>
              </div>

              {expanded ? (
                <div className="mt-3 grid gap-3 border-t-[2px] border-black/10 pt-3">
                  {stageRun?.error ? (
                    <p className="rounded-[10px] border-[2px] border-black bg-[#ffefee] p-2 text-xs font-bold text-[#b31310]">
                      {cleanActionError(stageRun.error.message)}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      ["Assets", String(assets.length)],
                      ["Attempts", String(stageRun?.attempt ?? 0)],
                      ["Selected", String(selectionCount(selection))],
                    ].map(([label, value]) => (
                      <div
                        className="rounded-[8px] border-[2px] border-black bg-white p-2"
                        key={label}
                      >
                        <p className="text-[9px] font-black uppercase text-neutral-500">
                          {label}
                        </p>
                        <p className="text-sm font-black">{value}</p>
                      </div>
                    ))}
                  </div>
                  {assets.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {assets.slice(0, 6).map((asset) => (
                        <a
                          className="grid aspect-square place-items-center overflow-hidden rounded-[10px] border-[2px] border-black bg-white text-[10px] font-black"
                          href={asset.url ?? undefined}
                          key={`${asset.sandboxPath}-${asset.fileName}`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {asset.url && isImageAsset(asset.fileName) ? (
                            <img
                              alt={asset.fileName}
                              className="h-full w-full object-cover"
                              src={asset.url}
                            />
                          ) : (
                            <span className="p-1 text-center">{asset.fileName}</span>
                          )}
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {artifact ? (
                    <pre className="max-h-40 overflow-auto rounded-[10px] border-[2px] border-black bg-white p-2 text-[10px] font-bold leading-tight">
                      {formatArtifactPreview(artifact)}
                    </pre>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StageWorkspace({
  active,
  activeIndex,
  activityItems,
  builderUrl,
  designerMocks,
  dropView,
  error,
  isPending,
  marketerArtifact,
  onApproveIdeas,
  onApproveProducts,
  onGoToMarket,
  onMarketDrop,
  onRetryStage,
  onSelectIdea,
  onSelectMock,
  scoutIdeas,
  selectedIdeas,
  selectedMocks,
}: {
  active: Stage;
  activeIndex: number;
  activityItems: ActivityItem[];
  builderUrl?: string;
  designerMocks: DesignerMock[];
  dropView?: DropView | null;
  error: string | null;
  isPending: boolean;
  marketerArtifact?: DropArtifact;
  onApproveIdeas: () => void;
  onApproveProducts: () => void;
  onGoToMarket: () => void;
  onMarketDrop: () => void;
  onRetryStage: () => void;
  onSelectIdea: (id: string) => void;
  onSelectMock: (id: string) => void;
  scoutIdeas: ScoutIdea[];
  selectedIdeas: string[];
  selectedMocks: string[];
}) {
  const Icon = active.icon;
  const [previewImage, setPreviewImage] = useState<ImagePreview | null>(null);
  const canRetry =
    (dropView?.drop.status === "failed" || dropView?.drop.status === "cancelled") &&
    dropView.drop.currentStage === active.key;
  const activeComplete = isCampaignStageComplete(active.key, dropView);
  const activeProgress = campaignStageProgress(active.key, dropView);
  const body =
    active.key === "scout" ? (
      <ScoutFocus
        activityItems={activityItems}
        dropView={dropView}
        isPending={isPending}
        onApproveIdeas={onApproveIdeas}
        onSelectIdea={onSelectIdea}
        scoutIdeas={scoutIdeas}
        selectedIdeas={selectedIdeas}
      />
    ) : active.key === "designer" ? (
      <DesignerFocus
        activityItems={activityItems}
        designerMocks={designerMocks}
        dropView={dropView}
        isPending={isPending}
        onApproveProducts={onApproveProducts}
        onOpenImage={setPreviewImage}
        onSelectMock={onSelectMock}
        selectedMocks={selectedMocks}
      />
    ) : active.key === "builder" ? (
      <BuilderFocus
        activityItems={activityItems}
        builderUrl={builderUrl}
        designerMocks={designerMocks}
        dropView={dropView}
        isPending={isPending}
        onGoToMarket={onGoToMarket}
        onOpenImage={setPreviewImage}
        selectedMocks={selectedMocks}
      />
    ) : (
      <MarketerFocus
        activityItems={activityItems}
        designerMocks={designerMocks}
        dropView={dropView}
        isPending={isPending}
        marketerArtifact={marketerArtifact}
        onMarketDrop={onMarketDrop}
        onOpenImage={setPreviewImage}
        selectedMocks={selectedMocks}
      />
    );

  return (
    <article className="flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border-[4px] border-black bg-white shadow-[8px_8px_0_#000]">
      {previewImage ? (
        <ImageLightbox
          image={previewImage}
          onClose={() => setPreviewImage(null)}
        />
      ) : null}
      <div
        className="grid shrink-0 gap-0 border-b-[4px] border-black lg:grid-cols-[286px_minmax(0,1fr)]"
        style={{ backgroundColor: active.color }}
      >
        <div className="relative min-h-[178px] border-b-[4px] border-black bg-black lg:border-b-0 lg:border-r-[4px]">
          <img
            alt={`${active.name} focus`}
            className="h-full w-full object-cover"
            src={active.focusImage}
          />
        </div>
        <div className="flex min-h-[178px] flex-col justify-between p-5 text-white">
          <div className="flex items-center justify-between gap-5">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-black uppercase tracking-[0.22em]">
                Step {active.step}
              </p>
              <h2 className="mt-1 text-[42px] font-black leading-none tracking-[-0.06em]">
                {active.shortName}
              </h2>
              <ActivityStreamBar
                active={active}
                activityItems={activityItems}
                progress={activeProgress}
              />
            </div>
            <div className="grid size-14 shrink-0 place-items-center rounded-[14px] border-[4px] border-black bg-white text-black">
              {activeComplete ? (
                <Check className="size-8 stroke-[4]" style={{ color: active.color }} />
              ) : (
                <Icon className="size-8" style={{ color: active.color }} />
              )}
            </div>
          </div>
          <div>
            <h3 className="flex flex-wrap items-baseline gap-2 text-[24px] font-black tracking-[-0.04em]">
              <span>{active.title}</span>
              <span className="rounded-full border-[2px] border-white/70 bg-white/15 px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.12em] text-white/85">
                {active.estimate}
              </span>
            </h3>
            <p className="mt-1 max-w-[660px] text-[16px] leading-tight">
              {active.line}
            </p>
            <div className="mt-3 flex items-center justify-between gap-3 text-[11px] font-black uppercase tracking-[0.12em] text-white/85">
              <span>{activeComplete ? "Complete" : "In progress"}</span>
              <span>{activeProgress}%</span>
            </div>
            <div
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={activeProgress}
              className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full border-[2px] border-black bg-black"
              role="progressbar"
            >
              <div
                className="h-full rounded-full bg-white transition-all duration-500"
                style={{ width: `${activeProgress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b-[3px] border-black bg-[#ffefee] px-5 py-2 text-sm font-black text-[#b31310]">
          <span>{error}</span>
          {canRetry ? (
            <button
              className="rounded-[10px] border-[3px] border-black bg-white px-3 py-1.5 text-[11px] font-black uppercase text-black transition hover:bg-neutral-100 disabled:opacity-50"
              disabled={isPending}
              onClick={onRetryStage}
              type="button"
            >
              Retry {active.shortName}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden p-3 lg:p-4">{body}</div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t-[3px] border-black/15 bg-neutral-50 px-5 py-1.5 lg:px-7">
        <div className="flex flex-wrap items-center gap-3 text-[12px] font-black uppercase">
          {stages.map((stage, index) => (
            <span
              className="flex items-center gap-2"
              key={stage.key}
              style={{ color: index === activeIndex ? stage.color : undefined }}
            >
              {isCampaignStageComplete(stage.key, dropView) ? (
                <CheckCircle2 className="size-5" />
              ) : (
                <Circle className="size-5" />
              )}
              {stage.shortName}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

function ActivityStreamBar({
  active,
  activityItems,
  progress,
}: {
  active: Stage;
  activityItems: ActivityItem[];
  progress: number;
}) {
  const items = activityItems.filter((item) => item.stage === active.key);
  const updateItems = items.filter(
    (item) => item.status === "complete" || item.status === "running",
  );
  const visibleItems = updateItems.slice(-2);

  if (progress <= 0 || progress >= 100 || visibleItems.length === 0) {
    return null;
  }

  return (
    <div
      aria-label={`${active.shortName} progress update`}
      className="drip-update-stream mt-2 max-w-[620px] overflow-hidden rounded-[9px] border-[2px] border-black bg-white/95 px-2.5 py-1 text-black shadow-[3px_3px_0_#000]"
    >
      <div
        className="drip-update-stack flex min-h-[38px] flex-col justify-end gap-0.5"
        key={visibleItems.map((item) => `${item.status}:${item.label}`).join("|")}
      >
        {visibleItems.map((item, index) => (
          <div
            className={`drip-update-row flex min-w-0 items-center gap-2 text-[13px] font-black leading-none ${
              index === visibleItems.length - 1 ? "text-black" : "text-black/65"
            }`}
            key={`${item.status}-${item.label}`}
          >
            <span
              className="size-2.5 shrink-0 rounded-full border-[2px] border-black"
              style={{ backgroundColor: active.color }}
            />
            <span className="drip-clamp-1 min-w-0">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveStageProgress({
  activityItems,
  dropView,
  previewLabels,
  stage,
}: {
  activityItems: ActivityItem[];
  dropView?: DropView | null;
  previewLabels: string[];
  stage: Stage;
}) {
  const items = activityItems.filter((item) => item.stage === stage.key);
  const visibleItems =
    items.length > 0
      ? items
      : [
          {
            stage: stage.key,
            label: "Preparing workspace",
            detail: stage.line,
            status: "running" as const,
          },
        ];
  const latestRun = latestStageRun(dropView, stage.key);
  const stageEvents =
    dropView?.sandboxEvents?.filter((event) => event.stage === stage.key) ?? [];
  const latestEvent = stageEvents[stageEvents.length - 1];
  const activeItem =
    [...visibleItems].reverse().find((item) => item.status === "running") ??
    [...visibleItems].reverse().find((item) => item.status === "complete") ??
    visibleItems[0];
  const statusLabel = stageRunStatusLabel(latestRun?.status ?? dropView?.drop.status);
  const signalLabel = latestEvent
    ? sandboxSignalLabel(latestEvent.type)
    : statusLabel;

  return (
    <div
      aria-live="polite"
      className="col-span-full grid h-full min-h-[360px] gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(260px,0.7fr)]"
      style={{ "--stage-color": stage.color } as CSSProperties}
    >
      <section className="drip-live-panel flex min-h-0 flex-col overflow-hidden rounded-[16px] border-[3px] border-black bg-white shadow-[4px_4px_0_#000]">
        <div className="border-b-[3px] border-black px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-neutral-500">
              Live run
            </p>
            <span className="rounded-full border-[2px] border-black bg-white px-2.5 py-1 text-[10px] font-black uppercase">
              {statusLabel}
            </span>
          </div>
          <h3 className="mt-2 text-[24px] font-black leading-none tracking-[-0.04em]">
            {stage.shortName} is working
          </h3>
          <p className="mt-1 text-sm font-bold leading-tight text-neutral-600">
            {activeItem?.detail ?? stage.line}
          </p>
        </div>

        <div className="grid gap-2 overflow-y-auto p-3">
          {visibleItems.map((item, index) => (
            <div
              className={`flex items-center gap-3 rounded-[12px] border-[2px] border-black px-3 py-2 ${
                item.status === "running"
                  ? "drip-live-scan bg-white"
                  : item.status === "complete"
                    ? "bg-neutral-50"
                    : "bg-white/70 text-neutral-500"
              }`}
              key={`${item.stage}-${item.label}-${index}`}
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full border-[3px] border-black text-xs font-black ${
                  item.status === "complete" ? "text-black" : "bg-white"
                }`}
                style={{
                  backgroundColor:
                    item.status === "complete" || item.status === "running"
                      ? stage.color
                      : "#fff",
                }}
              >
                {item.status === "complete" ? (
                  <Check className="size-4 stroke-[4]" />
                ) : item.status === "running" ? (
                  <Loader2 className="size-4 animate-spin stroke-[3]" />
                ) : (
                  index + 1
                )}
              </span>
              <span className="min-w-0">
                <span className="drip-clamp-1 block text-sm font-black leading-tight">
                  {item.label}
                </span>
                <span className="drip-clamp-1 mt-0.5 block text-[11px] font-bold leading-tight text-neutral-500">
                  {item.status === "running" ? signalLabel : item.detail}
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section
        className="flex min-h-0 flex-col rounded-[16px] border-[3px] border-black bg-black p-3 text-white"
        style={{ boxShadow: `4px 4px 0 ${stage.color}` }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/65">
            In progress
          </p>
          <span className="drip-live-pulse size-3 rounded-full border-[2px] border-white bg-[var(--stage-color)]" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-[10px] border border-white/20 p-2">
            <p className="text-[9px] font-black uppercase text-white/50">Attempt</p>
            <p className="mt-1 text-lg font-black">{latestRun?.attempt ?? 1}</p>
          </div>
          <div className="rounded-[10px] border border-white/20 p-2">
            <p className="text-[9px] font-black uppercase text-white/50">
              Live events
            </p>
            <p className="mt-1 text-lg font-black">{stageEvents.length}</p>
          </div>
        </div>

        <div className="mt-3 grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-hidden">
          {previewLabels.map((label, index) => (
            <div
              className="drip-live-slot drip-live-scan min-h-[78px] overflow-hidden rounded-[12px] border-[2px] border-white/25 bg-white text-black"
              key={label}
              style={{ animationDelay: `${index * 110}ms` }}
            >
              <div className="h-1.5 bg-[var(--stage-color)]" />
              <div className="grid h-[calc(100%-6px)] content-between p-2">
                <p className="drip-clamp-1 text-[11px] font-black leading-tight">
                  {label}
                </p>
                <div className="grid gap-1">
                  <span className="h-2 rounded-full bg-neutral-200" />
                  <span className="h-2 w-2/3 rounded-full bg-neutral-200" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[12px] font-bold leading-tight text-white/65">
          {stage.shortName} is still active; outputs will replace this board when
          the artifact is saved.
        </p>
      </section>
    </div>
  );
}

function StageHandoffPrompt({
  detail,
  stage,
  title,
}: {
  detail: string;
  stage: Stage;
  title: string;
}) {
  const Icon = stage.icon;

  return (
    <div
      className="col-span-full grid h-full min-h-[280px] place-items-center rounded-[16px] border-[3px] border-black bg-white p-5 text-center shadow-[4px_4px_0_#000]"
      style={{ "--stage-color": stage.color } as CSSProperties}
    >
      <div className="max-w-[430px]">
        <div
          className="mx-auto grid size-14 place-items-center rounded-[16px] border-[3px] border-black bg-white"
          style={{ boxShadow: `3px 3px 0 ${stage.color}` }}
        >
          <Icon className="size-7 stroke-[3]" style={{ color: stage.color }} />
        </div>
        <p className="mt-4 text-[11px] font-black uppercase tracking-[0.2em] text-neutral-500">
          {stage.shortName} idle
        </p>
        <h3 className="mt-2 text-[26px] font-black leading-none tracking-[-0.04em]">
          {title}
        </h3>
        <p className="mt-2 text-sm font-bold leading-tight text-neutral-600">
          {detail}
        </p>
      </div>
    </div>
  );
}

function ImageLightbox({
  image,
  onClose,
}: {
  image: ImagePreview;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      aria-label="Image preview"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="w-full max-w-[1120px] overflow-hidden rounded-[22px] border-[4px] border-black bg-white shadow-[8px_8px_0_#000]"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex items-center justify-between gap-4 border-b-[4px] border-black px-4 py-3 text-black"
          style={{ backgroundColor: image.color }}
        >
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-black/65">
              Preview
            </p>
            <h3 className="drip-clamp-1 text-[24px] font-black leading-none tracking-[-0.04em]">
              {image.title}
            </h3>
          </div>
          <button
            aria-label="Close image preview"
            className="grid size-11 shrink-0 place-items-center rounded-[12px] border-[3px] border-black bg-white transition hover:bg-neutral-100 focus-visible:ring-4 focus-visible:ring-white/70"
            onClick={onClose}
            type="button"
          >
            <X className="size-6 stroke-[3]" />
          </button>
        </div>
        <div className="grid bg-black p-2">
          <img
            alt={image.alt}
            className="max-h-[calc(100svh-190px)] w-full object-contain"
            src={image.src}
          />
        </div>
        {image.detail ? (
          <p className="drip-clamp-2 border-t-[4px] border-black bg-white px-4 py-3 text-sm font-bold leading-tight text-neutral-600">
            {image.detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ScoutFocus({
  activityItems,
  dropView,
  isPending,
  onApproveIdeas,
  onSelectIdea,
  scoutIdeas,
  selectedIdeas,
}: {
  activityItems: ActivityItem[];
  dropView?: DropView | null;
  isPending: boolean;
  onApproveIdeas: () => void;
  onSelectIdea: (id: string) => void;
  scoutIdeas: ScoutIdea[];
  selectedIdeas: string[];
}) {
  const waiting = dropView?.drop.status === "scouting" || scoutIdeas.length === 0;
  const [inspectedIdeaId, setInspectedIdeaId] = useState<string | null>(null);
  const inspectedIdea =
    scoutIdeas.find((idea) => idea.id === inspectedIdeaId) ??
    scoutIdeas.find((idea) => selectedIdeas.includes(idea.id)) ??
    scoutIdeas[0];
  const inspectedRows = inspectedIdea ? scoutInspectorRows(inspectedIdea) : [];

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto pr-1 md:grid-cols-2 lg:grid-cols-3">
          {waiting ? (
            <LiveStageProgress
              activityItems={activityItems}
              dropView={dropView}
              previewLabels={[
                "Trend brief",
                "X signal",
                "Exa context",
                "Source check",
                "Merch angle",
                "Proposal card",
              ]}
              stage={stages[0]}
            />
          ) : (
            scoutIdeas.map((idea) => {
              const selected = selectedIdeas.includes(idea.id);
              const inspected = inspectedIdea?.id === idea.id;
              return (
                <button
                  aria-pressed={selected}
                  className={`min-h-[154px] rounded-[14px] border-[3px] border-black p-2.5 text-left outline-none transition hover:-translate-y-1 focus-visible:ring-4 focus-visible:ring-[#55d12c]/70 ${
                    selected
                      ? "bg-[#eaffdf] shadow-[5px_5px_0_#55d12c]"
                      : inspected
                        ? "bg-neutral-50 shadow-[5px_5px_0_#000]"
                        : "bg-white shadow-[4px_4px_0_#000]"
                  }`}
                  key={idea.id}
                  onClick={() => {
                    setInspectedIdeaId(idea.id);
                    onSelectIdea(idea.id);
                  }}
                  onFocus={() => setInspectedIdeaId(idea.id)}
                  onMouseEnter={() => setInspectedIdeaId(idea.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="drip-clamp-2 min-w-0 text-[16px] font-black leading-none tracking-[-0.04em]">
                      {idea.title}
                    </h4>
                    <span
                      className={`grid size-6 shrink-0 place-items-center rounded-full border-[3px] border-black ${
                        selected ? "bg-[#55d12c]" : "bg-white"
                      }`}
                    >
                      {selected ? <Check className="size-3.5 stroke-[4]" /> : null}
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] font-black uppercase leading-tight text-neutral-500">
                    {idea.xSignal}
                  </p>
                  <p className="drip-clamp-3 mt-1.5 text-[11px] font-bold leading-tight">
                    {idea.signal}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </section>

      <section className="flex min-h-0 flex-col rounded-[18px] border-[3px] border-black bg-black p-3.5 text-white shadow-[5px_5px_0_#55d12c]">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#55d12c]">
            Scout detail
          </p>
          {inspectedIdea ? (
            <>
              <h4 className="drip-clamp-2 mt-2 text-[24px] font-black leading-none tracking-[-0.05em]">
                {inspectedIdea.title}
              </h4>
              <p className="mt-2 text-[10px] font-black uppercase leading-tight text-white/55">
                {inspectedIdea.xSignal}
              </p>
              <p className="mt-2 text-[12px] font-bold leading-snug text-white/80">
                {inspectedIdea.detail.description ?? inspectedIdea.signal}
              </p>

              {inspectedRows.length > 0 ? (
                <div className="mt-3 divide-y divide-white/15 border-y border-white/15">
                  {inspectedRows.map(([label, value]) => (
                    <div className="py-2" key={label}>
                      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/45">
                        {label}
                      </p>
                      <p className="mt-1 text-[12px] font-bold leading-snug text-white/80">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              <ScoutEvidenceHighlights highlights={inspectedIdea.detail.evidenceHighlights} />
              <ScoutSourceChips sources={inspectedIdea.detail.sources} />
            </>
          ) : (
            <p className="mt-3 text-sm font-bold leading-tight text-white/65">
              Scout ideas will appear here after the run completes.
            </p>
          )}

          <div className="mt-4 border-t border-white/15 pt-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/55">
                Output
              </p>
              <span className="rounded-full border border-white/25 px-2 py-0.5 text-[10px] font-black uppercase text-white/75">
                {selectedIdeas.length} selected
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {scoutIdeas
                .filter((idea) => selectedIdeas.includes(idea.id))
                .map((idea) => (
                  <button
                    className="max-w-full rounded-full border border-white/20 px-2.5 py-1 text-left text-[11px] font-black leading-tight text-white/85 transition hover:border-[#55d12c] hover:bg-white/10 focus-visible:border-[#55d12c] focus-visible:bg-white/10 focus-visible:outline-none"
                    key={idea.id}
                    onClick={() => setInspectedIdeaId(idea.id)}
                    onFocus={() => setInspectedIdeaId(idea.id)}
                    type="button"
                  >
                    <span className="drip-clamp-1">{idea.title}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
        <button
          className="drip-button mt-3 w-full px-5 py-3 text-base disabled:cursor-wait disabled:opacity-70"
          disabled={
            isPending ||
            dropView?.drop.status !== "awaiting_idea_selection" ||
            selectedIdeas.length === 0
          }
          onClick={onApproveIdeas}
          type="button"
        >
          {isPending ? <Loader2 className="mr-2 size-5 animate-spin" /> : null}
          Send to Designer
        </button>
      </section>
    </div>
  );
}

function ScoutEvidenceHighlights({
  highlights,
}: {
  highlights: ScoutEvidenceHighlight[];
}) {
  if (highlights.length === 0) {
    return null;
  }

  return (
    <div className="mt-3">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/45">
        Evidence
      </p>
      <div className="mt-2 grid gap-2">
        {highlights.slice(0, 3).map((highlight) => (
          <div className="border-l-2 border-[#55d12c] pl-2" key={highlight.id}>
            <p className="text-[10px] font-black uppercase leading-tight text-white/55">
              {highlight.url ? (
                <a
                  className="inline-flex max-w-full items-center gap-1.5 hover:text-[#55d12c]"
                  href={highlight.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className="drip-clamp-1">{highlight.label}</span>
                  <ExternalLink className="size-3 shrink-0 stroke-[3]" />
                </a>
              ) : (
                highlight.label
              )}
            </p>
            <p className="mt-1 text-[12px] font-bold leading-snug text-white/80">
              {highlight.detail}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoutSourceChips({ sources }: { sources: ScoutSource[] }) {
  if (sources.length === 0) {
    return null;
  }

  const visibleSources = sources.slice(0, 6);
  const remainingCount = sources.length - visibleSources.length;

  return (
    <div className="mt-3">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/45">
        Sources
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {visibleSources.map((source) =>
          source.url ? (
            <a
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/25 px-2.5 py-1 text-[11px] font-black leading-tight text-white/85 transition hover:border-[#55d12c] hover:bg-white/10"
              href={source.url}
              key={source.id}
              rel="noreferrer"
              target="_blank"
            >
              <span className="drip-clamp-1 min-w-0">{source.label}</span>
              <ExternalLink className="size-3 shrink-0 stroke-[3]" />
            </a>
          ) : (
            <span
              className="inline-flex max-w-full rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-black leading-tight text-white/65"
              key={source.id}
            >
              <span className="drip-clamp-1 min-w-0">{source.label}</span>
            </span>
          ),
        )}
        {remainingCount > 0 ? (
          <span className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-black leading-tight text-white/55">
            +{remainingCount} more
          </span>
        ) : null}
      </div>
    </div>
  );
}

function DesignerFocus({
  activityItems,
  designerMocks,
  dropView,
  isPending,
  onApproveProducts,
  onOpenImage,
  onSelectMock,
  selectedMocks,
}: {
  activityItems: ActivityItem[];
  designerMocks: DesignerMock[];
  dropView?: DropView | null;
  isPending: boolean;
  onApproveProducts: () => void;
  onOpenImage: (image: ImagePreview) => void;
  onSelectMock: (id: string) => void;
  selectedMocks: string[];
}) {
  const designerLive =
    isPending ||
    dropView?.drop.status === "designing" ||
    dropView?.drop.status === "ready_to_design" ||
    stageHasActiveRun(dropView, "designer");
  const waiting = designerMocks.length === 0;

  return (
    <div className="grid h-full min-h-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="flex min-h-0 flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="mb-3 text-[12px] font-black uppercase tracking-[0.18em] text-neutral-500">
            Generated products
          </p>
          <div className="min-h-0 flex-1 overflow-hidden">
            <div className="grid h-full content-start gap-3 md:grid-cols-2 lg:grid-cols-3">
              {waiting && designerLive ? (
                <LiveStageProgress
                  activityItems={activityItems}
                  dropView={dropView}
                  previewLabels={[
                    "Idea brief",
                    "Product direction",
                    "Image prompt",
                    "Mock image",
                    "Quality pass",
                    "Asset pack",
                  ]}
                  stage={stages[1]}
                />
              ) : waiting ? (
                <StageHandoffPrompt
                  detail="Select Scout ideas, then send them to Designer to generate product mockups."
                  stage={stages[1]}
                  title="Waiting for Scout selections"
                />
              ) : (
                designerMocks.map((mock, index) => {
                  const selected = selectedMocks.includes(mock.id);
                  return (
                    <article
                      className={`overflow-hidden rounded-[16px] border-[3px] border-black text-left transition hover:-translate-y-1 ${
                        selected ? "shadow-[5px_5px_0_#1264ff]" : "shadow-[4px_4px_0_#000]"
                      }`}
                      key={mock.id}
                    >
                      <button
                        aria-label={
                          mock.imageUrl ? `Preview ${mock.name}` : `Select ${mock.name}`
                        }
                        className={`group relative grid aspect-[1/0.58] w-full place-items-center overflow-hidden bg-neutral-100 outline-none focus-visible:ring-4 focus-visible:ring-[#1264ff]/70 ${
                          mock.imageUrl ? "cursor-zoom-in" : "cursor-pointer"
                        }`}
                        onClick={() => {
                          if (mock.imageUrl) {
                            onOpenImage({
                              alt: mock.name,
                              color: "#1264ff",
                              detail: mock.idea,
                              src: mock.imageUrl,
                              title: mock.name,
                            });
                            return;
                          }
                          onSelectMock(mock.id);
                        }}
                        type="button"
                      >
                        {mock.imageUrl ? (
                          <>
                            <img
                              alt={mock.name}
                              className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                              src={mock.imageUrl}
                            />
                            <span className="absolute right-2 top-2 grid size-8 place-items-center rounded-[10px] border-[3px] border-black bg-white opacity-0 shadow-[2px_2px_0_#000] transition group-hover:opacity-100 group-focus-visible:opacity-100">
                              <Maximize2 className="size-4 stroke-[3]" />
                            </span>
                          </>
                        ) : (
                          <div
                            className="grid size-20 place-items-center rounded-[18px] border-[4px] border-black text-[38px] font-black text-white"
                            style={{
                              backgroundColor:
                                index % 3 === 0
                                  ? "#111"
                                  : index % 3 === 1
                                    ? "#1264ff"
                                    : "#f8ca00",
                            }}
                          >
                            {mock.name.slice(0, 1)}
                          </div>
                        )}
                      </button>
                      <button
                        aria-pressed={selected}
                        className="w-full border-t-[3px] border-black bg-white p-3 text-left outline-none transition hover:bg-neutral-50 focus-visible:ring-4 focus-visible:ring-[#1264ff]/70"
                        onClick={() => onSelectMock(mock.id)}
                        type="button"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h4 className="drip-clamp-1 text-lg font-black leading-none">{mock.name}</h4>
                            <p className="drip-clamp-1 mt-1 text-sm text-neutral-500">{mock.idea}</p>
                          </div>
                          <span
                            className={`grid size-7 shrink-0 place-items-center rounded-full border-[3px] border-black ${
                              selected ? "bg-[#1264ff] text-white" : "bg-white"
                            }`}
                          >
                            {selected ? <Check className="size-4 stroke-[4]" /> : null}
                          </span>
                        </div>
                      </button>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="flex h-full min-h-0 flex-col rounded-[18px] border-[3px] border-black bg-black p-5 text-white shadow-[5px_5px_0_#1264ff]">
        <p className="text-[12px] font-black uppercase tracking-[0.2em] text-[#1264ff]">
          Output
        </p>
        <h4 className="mt-3 text-[32px] font-black leading-none tracking-[-0.05em]">
          {selectedMocks.length} products selected
        </h4>
        <p className="mt-4 text-white/75">
          {waiting && designerLive
            ? "Mockups will appear here as soon as Designer saves the output."
            : waiting
              ? "Scout selections become Designer's product brief."
            : "These selected images become the limited-drop website carousel."}
        </p>
        {waiting && designerLive ? (
          <div className="mt-5 rounded-[14px] border border-white/20 bg-white/5 p-3">
            <div className="flex items-center gap-2 text-sm font-black">
              <Loader2 className="size-4 animate-spin" />
              Designer is generating products
            </div>
            <p className="mt-2 text-[12px] font-bold leading-tight text-white/60">
              Images and concept data are still in the active run.
            </p>
          </div>
        ) : null}
        <button
          className="drip-button mt-auto w-full px-6 py-4 text-lg disabled:cursor-wait disabled:opacity-70"
          disabled={
            isPending ||
            dropView?.drop.status !== "awaiting_mock_selection" ||
            selectedMocks.length === 0
          }
          onClick={onApproveProducts}
          type="button"
        >
          {isPending ? <Loader2 className="mr-2 size-5 animate-spin" /> : null}
          Build website
        </button>
      </section>
    </div>
  );
}

function BuilderFocus({
  activityItems,
  builderUrl,
  designerMocks,
  dropView,
  isPending,
  onGoToMarket,
  onOpenImage,
  selectedMocks,
}: {
  activityItems: ActivityItem[];
  builderUrl?: string;
  designerMocks: DesignerMock[];
  dropView?: DropView | null;
  isPending: boolean;
  onGoToMarket: () => void;
  onOpenImage: (image: ImagePreview) => void;
  selectedMocks: string[];
}) {
  const selected = designerMocks.filter((mock) => selectedMocks.includes(mock.id));
  const heroMock = selected.find((mock) => mock.imageUrl) ?? selected[0];
  const building =
    dropView?.drop.status === "building" || dropView?.drop.status === "ready_to_build";
  const showLiveProgress =
    !builderUrl &&
    (isPending || building || stageHasActiveRun(dropView, "builder"));
  const canGoToMarket =
    isCampaignStageUnlocked("marketer", dropView) &&
    !isCampaignStageComplete("marketer", dropView);

  if (showLiveProgress) {
    return (
      <LiveStageProgress
        activityItems={activityItems}
        dropView={dropView}
        previewLabels={[
          "Selected assets",
          "Page layout",
          "Product carousel",
          "Buy CTA",
          "Visual review",
          "Deploy URL",
        ]}
        stage={stages[2]}
      />
    );
  }

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <section className="rounded-[18px] border-[3px] border-black bg-white p-4 shadow-[5px_5px_0_#000]">
        <p className="text-[12px] font-black uppercase tracking-[0.2em] text-neutral-500">
          Build status
        </p>
        <div className="mt-4 grid gap-3">
          {[
            "Selected products packaged",
            "Drop page art direction chosen",
            "Carousel generated",
            builderUrl ? "Preview ready" : "Preview pending",
          ].map((item, index) => (
            <div className="flex items-center gap-3" key={item}>
              <span
                className={`grid size-7 place-items-center rounded-full border-[3px] border-black text-xs font-black ${
                  index < (builderUrl ? 4 : 3) ? "bg-[#f8ca00]" : "bg-white"
                }`}
              >
                {index < (builderUrl ? 4 : 3) ? <Check className="size-4 stroke-[4]" /> : index + 1}
              </span>
              <span className="text-sm font-black leading-tight">{item}</span>
            </div>
          ))}
        </div>
        {builderUrl ? (
          <a
            className="drip-button mt-5 w-full px-6 py-3.5 text-base"
            href={builderUrl}
            rel="noreferrer"
            target="_blank"
          >
            Preview drop site <ExternalLink className="ml-2 size-5" />
          </a>
        ) : (
          <button className="drip-button mt-5 w-full px-6 py-3.5 text-base opacity-70" disabled type="button">
            {building ? <Loader2 className="mr-2 size-5 animate-spin" /> : null}
            Preview pending
          </button>
        )}
        {canGoToMarket ? (
          <button
            className="mt-3 w-full rounded-[12px] border-[4px] border-black bg-[#ff3c38] px-6 py-3.5 text-base font-black text-white shadow-[5px_5px_0_#000] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0_#000]"
            onClick={onGoToMarket}
            type="button"
          >
            Go to Marketer
          </button>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-[18px] border-[4px] border-black bg-black text-white shadow-[7px_7px_0_#f8ca00]">
        <div className="flex items-center justify-between border-b border-white/15 px-6 py-4">
          <p className="font-black uppercase tracking-[0.18em]">Drop preview</p>
          {builderUrl ? (
            <a
              aria-label="Open full drop site"
              className="grid size-8 place-items-center rounded-[10px] border border-white/20 text-white transition hover:bg-white hover:text-black"
              href={builderUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ArrowUpRight className="size-5" />
            </a>
          ) : (
            <ArrowUpRight className="size-6" />
          )}
        </div>
        {builderUrl ? (
          <MiniDropSitePreview builderUrl={builderUrl} />
        ) : (
          <div className="grid h-full min-h-0 gap-5 p-5 md:grid-cols-[1fr_0.78fr] md:items-center">
            <div>
              <p className="text-sm font-black uppercase text-[#f8ca00]">
                24 hours left
              </p>
              <h4 className="mt-2 text-[46px] font-black leading-[0.9] tracking-[-0.07em]">
                Drop
                <br />
                Of Week
              </h4>
              <p className="mt-4 max-w-[300px] text-base leading-tight text-white/75">
                Selected images become the limited carousel and buy link.
              </p>
              <div className="mt-5 inline-flex rounded-[10px] bg-[#f8ca00] px-6 py-3 text-base font-black text-black">
                Buy now
              </div>
            </div>
            <div className="grid aspect-square place-items-center overflow-hidden rounded-[24px] bg-neutral-900">
              {heroMock?.imageUrl ? (
                <button
                  aria-label={`Preview ${heroMock.name}`}
                  className="group relative h-full w-full cursor-zoom-in outline-none focus-visible:ring-4 focus-visible:ring-[#f8ca00]/70"
                  onClick={() =>
                    onOpenImage({
                      alt: heroMock.name,
                      color: "#f8ca00",
                      detail: heroMock.idea,
                      src: heroMock.imageUrl!,
                      title: heroMock.name,
                    })
                  }
                  type="button"
                >
                  <img
                    alt={heroMock.name}
                    className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                    src={heroMock.imageUrl}
                  />
                  <span className="absolute right-3 top-3 grid size-9 place-items-center rounded-[10px] border-[3px] border-black bg-white text-black opacity-0 shadow-[2px_2px_0_#000] transition group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Maximize2 className="size-4 stroke-[3]" />
                  </span>
                </button>
              ) : (
                <div className="size-48 rounded-[28px] border-[4px] border-white/25 bg-neutral-800 shadow-[0_0_80px_rgb(248_202_0_/_35%)]" />
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function MiniDropSitePreview({ builderUrl }: { builderUrl: string }) {
  return (
    <div className="h-full min-h-[360px] p-4">
      <div className="relative h-full min-h-[360px] overflow-hidden rounded-[16px] border-[3px] border-white/15 bg-[#f7f2e8] shadow-[inset_0_0_0_1px_rgb(255_255_255_/_12%)]">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[760px] w-[1180px] origin-center -translate-x-1/2 -translate-y-1/2 scale-[0.28] sm:scale-[0.36] lg:scale-[0.45] 2xl:scale-[0.52]">
          <iframe
            className="h-full w-full border-0 bg-white"
            loading="lazy"
            referrerPolicy="no-referrer"
            sandbox="allow-popups allow-same-origin allow-scripts"
            src={builderUrl}
            title="Generated drop site mini preview"
          />
        </div>
        <div className="pointer-events-none absolute inset-0 rounded-[16px] ring-1 ring-white/10" />
      </div>
    </div>
  );
}

function MarketerFocus({
  activityItems,
  designerMocks,
  dropView,
  isPending,
  marketerArtifact,
  onMarketDrop,
  onOpenImage,
  selectedMocks,
}: {
  activityItems: ActivityItem[];
  designerMocks: DesignerMock[];
  dropView?: DropView | null;
  isPending: boolean;
  marketerArtifact?: DropArtifact;
  onMarketDrop: () => void;
  onOpenImage: (image: ImagePreview) => void;
  selectedMocks: string[];
}) {
  const output = asRecord(marketerArtifact?.data);
  const campaign = asRecord(output.campaign);
  const verification = asRecord(output.verification);
  const safety = asRecord(output.safety);
  const issue = firstVerificationIssue(verification);
  const campaignCount = readNumber(verification.campaignCount, 0);
  const adSetCount = readNumber(verification.adSetCount, 0);
  const adCount = readNumber(verification.adCount, 0);
  const allCreatedPaused = safety.allCreatedPaused === true;
  const missingPausedObjects =
    campaignCount === 0 || adSetCount === 0 || adCount === 0;
  const metaReady = Boolean(
    marketerArtifact && allCreatedPaused && !issue && !missingPausedObjects,
  );
  const metaBlocked = Boolean(
    marketerArtifact && (!allCreatedPaused || missingPausedObjects || issue),
  );
  const dropStatus = dropView?.drop.status;
  const dropCurrentStage = dropView?.drop.currentStage;
  const marketerIsCurrent =
    dropCurrentStage === "marketer" ||
    dropStatus === "ready_to_market" ||
    dropStatus === "marketing";
  const canRunMeta =
    !isPending &&
    marketerIsCurrent &&
    (dropStatus === "ready_to_market" ||
      dropStatus === "failed" ||
      dropStatus === "cancelled" ||
      metaBlocked);
  const showLiveProgress =
    !marketerArtifact &&
    (dropStatus === "marketing" ||
      stageHasActiveRun(dropView, "marketer") ||
      (isPending && marketerIsCurrent));
  const actionLabel =
    metaReady
      ? "Ad ready"
      : dropStatus === "ready_to_market" && !metaBlocked
        ? "Create ad"
        : "Retry ad";
  const previewStatus = metaReady
    ? "Ad ready · no spend"
    : metaBlocked
      ? "Ad draft blocked"
      : "Ad draft · no spend";
  const adReviewUrl = metaReady ? metaAdsManagerUrl : null;
  const metaSetupRows = [
    {
      count: campaignCount,
      detail: "Campaign: the Meta container for this drop promotion.",
      title: "Campaign shell",
    },
    {
      count: adSetCount,
      detail: "Ad set: the audience and delivery setup inside the campaign.",
      title: "Audience setup",
    },
    {
      count: adCount,
      detail: "Ad: the selected product images and website link buyers see.",
      title: "Ad creative",
    },
  ];
  const previewProducts = designerMocks.filter((mock) => selectedMocks.includes(mock.id));
  const heroProduct = previewProducts.find((mock) => mock.imageUrl) ?? previewProducts[0];
  const previewCard = (
    <div className="mt-1.5 overflow-hidden rounded-[14px] border-[3px] border-white/30 bg-white text-black">
      <div className="relative grid h-[132px] place-items-center overflow-hidden bg-[#ff3c38]">
        {heroProduct?.imageUrl ? (
          <button
            aria-label={`Preview ${heroProduct.name}`}
            className="group h-full w-full cursor-zoom-in outline-none focus-visible:ring-4 focus-visible:ring-[#ff3c38]/70"
            onClick={() =>
              onOpenImage({
                alt: heroProduct.name,
                color: "#ff3c38",
                detail: heroProduct.idea,
                src: heroProduct.imageUrl!,
                title: heroProduct.name,
              })
            }
            type="button"
          >
            <img
              alt={heroProduct.name}
              className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
              src={heroProduct.imageUrl}
            />
            <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-[8px] border-[2px] border-black bg-white opacity-0 shadow-[2px_2px_0_#000] transition group-hover:opacity-100 group-focus-visible:opacity-100">
              <Maximize2 className="size-3.5 stroke-[3]" />
            </span>
          </button>
        ) : (
          <div className="px-5 text-center text-xl font-black">Drop of the week</div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 py-1.5 text-white">
          <p className="drip-clamp-1 text-sm font-black">
            {readString(campaign.name, "Website + selected images")}
          </p>
          <p className="drip-clamp-1 mt-0.5 text-[10px] font-bold text-white/80">
            {previewStatus}
          </p>
        </div>
      </div>
      {previewProducts.length > 1 ? (
        <div className="grid grid-cols-3 gap-1.5 border-t-[3px] border-black bg-white p-1">
          {previewProducts.slice(0, 3).map((mock) => (
            <button
              aria-label={
                mock.imageUrl ? `Preview ${mock.name}` : `${mock.name} preview`
              }
              className="h-10 overflow-hidden rounded-[8px] border-[2px] border-black bg-neutral-100"
              disabled={!mock.imageUrl}
              key={mock.id}
              onClick={() => {
                if (!mock.imageUrl) {
                  return;
                }
                onOpenImage({
                  alt: mock.name,
                  color: "#ff3c38",
                  detail: mock.idea,
                  src: mock.imageUrl,
                  title: mock.name,
                });
              }}
              type="button"
            >
              {mock.imageUrl ? (
                <img
                  alt={mock.name}
                  className="h-full w-full object-cover"
                  src={mock.imageUrl}
                />
              ) : (
                <div className="grid h-full place-items-center text-lg font-black">
                  {mock.name.slice(0, 1)}
                </div>
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  if (showLiveProgress) {
    return (
      <LiveStageProgress
        activityItems={activityItems}
        dropView={dropView}
        previewLabels={[
          "Builder URL",
          "Product images",
          "Ad copy",
          "Campaign shell",
          "Paused status",
          "Sanitized proof",
        ]}
        stage={stages[3]}
      />
    );
  }

  return (
    <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-w-0 overflow-hidden rounded-[18px] border-[3px] border-black bg-white shadow-[5px_5px_0_#000]">
        {metaBlocked ? (
          <div className="border-b-[3px] border-black bg-[#f8ca00] px-3 py-2.5">
            <p className="text-[12px] font-black uppercase tracking-[0.18em] text-black/60">
              Meta blocked
            </p>
            <p className="mt-1 text-sm font-black leading-tight">
              {issue || "Meta did not return created ad objects. Retry is required."}
            </p>
          </div>
        ) : null}
        <div className="border-b-[3px] border-black bg-neutral-50 px-3 py-2.5">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-500">
            Meta setup
          </p>
          <p className="mt-1 text-sm font-black leading-tight text-black">
            Campaign, audience, and ad creative are prepared in Meta.
          </p>
        </div>
        {metaSetupRows.map((row) => {
          const created = row.count > 0;
          return (
          <div
            className="grid grid-cols-[minmax(0,1fr)_104px] gap-3 border-b border-black/10 px-3 py-3 text-xs"
            key={row.title}
          >
            <span className="min-w-0">
              <span className="block text-[15px] font-black leading-tight">
                {row.title}
              </span>
              <span className="mt-0.5 block max-w-[560px] text-[12px] font-bold leading-snug text-neutral-500">
                {row.detail}
              </span>
            </span>
            <span className="justify-self-end text-right">
              <span
                className={`inline-flex rounded-full border-[2px] border-black px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                  created
                    ? "bg-[#eaffdf] text-black"
                    : "bg-white text-neutral-500"
                }`}
              >
                {created ? "Created" : "Pending"}
              </span>
              <span className="mt-1 block text-[10px] font-black uppercase tracking-[0.12em] text-neutral-400">
                {row.count} item{row.count === 1 ? "" : "s"}
              </span>
            </span>
          </div>
          );
        })}
      </section>

      <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border-[3px] border-black bg-black p-2.5 text-white shadow-[5px_5px_0_#ff3c38]">
        <div>
          {adReviewUrl ? (
            <a
              aria-label="Open Meta Ads Manager for ad preview"
              className="group flex w-full items-center justify-between gap-3 text-left"
              href={adReviewUrl}
              rel="noreferrer"
              target="_blank"
            >
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#ff3c38]">
                Ad preview
              </span>
              <span className="grid size-7 place-items-center rounded-[8px] border-[2px] border-white/30 text-white transition group-hover:bg-white group-hover:text-black">
                <ExternalLink className="size-3.5 stroke-[3]" />
              </span>
            </a>
          ) : (
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#ff3c38]">
              Ad preview
            </p>
          )}
        </div>
        {previewCard}
        <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-center">
          {[
            ["Spend", "0"],
            ["Delivery", "Paused"],
            ["Link", adReviewUrl ? "Ads Manager" : "Pending"],
          ].map(([label, value]) => (
            <div className="rounded-[10px] border border-white/20 p-1" key={label}>
              <p className="text-[9px] font-black uppercase text-white/60">{label}</p>
              <p className="mt-0.5 text-sm font-black">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2 rounded-[12px] border border-white/20 bg-white/5 p-2 text-white/80">
          <Info className="mt-0.5 size-3.5 shrink-0 stroke-[3] text-[#ff3c38]" />
          <p className="text-[11px] font-bold leading-snug">
            Created ads stay paused. Log in to Meta Business to review and start
            delivery.
          </p>
        </div>
        <button
          className="drip-button mt-1.5 w-full px-4 py-1.5 text-xs disabled:cursor-wait disabled:opacity-70"
          disabled={!canRunMeta}
          onClick={onMarketDrop}
          type="button"
        >
          {isPending ? <Loader2 className="mr-2 size-5 animate-spin" /> : null}
          {actionLabel}
        </button>
      </aside>
    </div>
  );
}

function latestStageRun(
  dropView: DropView | null | undefined,
  stage: StageKey,
) {
  return dropView?.stageRuns
    .filter((stageRun) => stageRun.stage === stage)
    .sort((left, right) => (right.startedAt ?? right.updatedAt ?? 0) - (left.startedAt ?? left.updatedAt ?? 0))[0];
}

function stageHasActiveRun(
  dropView: DropView | null | undefined,
  stage: StageKey,
) {
  const activeStatuses = new Set(["queued", "starting", "running", "collecting"]);
  const latest = latestStageRun(dropView, stage);
  return Boolean(latest && activeStatuses.has(latest.status));
}

function activeDropStageRun(dropView: DropView | null | undefined) {
  const activeStatuses = new Set(["queued", "starting", "running", "collecting"]);
  return dropView?.stageRuns
    .filter((stageRun) => activeStatuses.has(stageRun.status))
    .sort(
      (left, right) =>
        (right.startedAt ?? right.updatedAt ?? 0) -
        (left.startedAt ?? left.updatedAt ?? 0),
    )[0];
}

function workspaceLifecycleStatus(
  dropView: DropView | null | undefined,
  activeRun: ReturnType<typeof activeDropStageRun>,
) {
  if (!dropView) {
    return {
      label: "Loading",
      detail: "Reading the campaign workspace state.",
      color: "#fff",
    };
  }
  if (activeRun) {
    return {
      label: "Running",
      detail: `${stageLabel(activeRun.stage)} is ${activeRun.status}. Cancel is available.`,
      color: "#f8ca00",
    };
  }
  if (dropView.drop.status === "creating") {
    return {
      label: "Creating",
      detail: "Preparing the persistent drop workspace.",
      color: "#f8ca00",
    };
  }
  if (dropView.drop.status === "failed") {
    return {
      label: "Failed",
      detail: "The workspace stopped on an error. Retry is available on the active teammate.",
      color: "#ffefee",
    };
  }
  if (dropView.drop.status === "cancelled") {
    return {
      label: "Cancelled",
      detail: "The active workspace run was cancelled and can be retried.",
      color: "#ffefee",
    };
  }
  const latestRun = [...dropView.stageRuns].sort(
    (left, right) =>
      (right.startedAt ?? right.updatedAt ?? 0) -
      (left.startedAt ?? left.updatedAt ?? 0),
  )[0];
  if (latestRun) {
    return {
      label: "Idle",
      detail: `${stageLabel(latestRun.stage)} last ${latestRun.status}; history is preserved.`,
      color: "#eaffdf",
    };
  }
  return {
    label: "Ready",
    detail: "Persistent workspace is ready for the next teammate.",
    color: "#eaffdf",
  };
}

function stageLabel(stage: StageKey) {
  return stages.find((item) => item.key === stage)?.shortName ?? stage;
}

function stageRunStatusLabel(status: string | undefined) {
  switch (status) {
    case "queued":
      return "Queued";
    case "starting":
    case "creating":
      return "Starting";
    case "running":
    case "scouting":
    case "designing":
    case "building":
    case "marketing":
      return "Running";
    case "collecting":
      return "Collecting";
    case "succeeded":
      return "Saving output";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "ready_to_design":
    case "ready_to_build":
      return "Queued";
    default:
      return status ? status.replaceAll("_", " ") : "Preparing";
  }
}

function sandboxSignalLabel(type: string) {
  switch (type) {
    case "runner.started":
      return "Runner booted";
    case "runner.heartbeat":
      return "Run is still active";
    case "thread.started":
      return "Agent thread started";
    case "turn.started":
      return "Teammate is thinking";
    case "item.started":
      return "Work item started";
    case "item.completed":
      return "Work item completed";
    case "turn.completed":
      return "Turn completed";
    case "runner.finished":
      return "Runner finished";
    default:
      return type.replaceAll(".", " ");
  }
}

function latestArtifact(dropView: DropView | null | undefined, stage: StageKey) {
  return dropView?.artifacts
    .filter((artifact) => artifact.stage === stage)
    .sort((left, right) => right.createdAt - left.createdAt)[0];
}

function selectionForStage(
  dropView: DropView | null | undefined,
  stage: StageKey,
) {
  const kind =
    stage === "designer"
      ? "approvedIdeas"
      : stage === "builder" || stage === "marketer"
        ? "selectedMocks"
        : null;
  if (!kind) {
    return undefined;
  }
  return dropView?.selections.find((selection) => selection.kind === kind);
}

function selectionCount(selection: DropSelection | undefined) {
  if (!selection) {
    return 0;
  }
  if (Array.isArray(selection.value)) {
    return selection.value.length;
  }
  if (selection.value && typeof selection.value === "object") {
    return Object.keys(selection.value).length;
  }
  return 1;
}

function isImageAsset(fileName: string) {
  return /\.(png|jpe?g|webp|gif)$/i.test(fileName);
}

function formatArtifactPreview(artifact: DropArtifact) {
  const source = artifact.summary ?? artifact.data;
  try {
    const preview = JSON.stringify(source, null, 2);
    return preview.length > 2200 ? `${preview.slice(0, 2200)}\n...` : preview;
  } catch {
    return "Artifact preview unavailable.";
  }
}

function cleanActionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const parsedMessage = parseErrorMessage(message);
  if (/InternalServerError/i.test(message) || /Try again later/i.test(message)) {
    return "This teammate hit a temporary generation issue. Retry the stage when ready.";
  }
  if (parsedMessage && parsedMessage !== message) {
    return cleanActionError(parsedMessage);
  }
  const sandboxMessage = /Vercel Sandbox creation is [^.]+\.[^.]+\./.exec(message);
  if (sandboxMessage) {
    return "The drop workspace could not be created. Check the sandbox setup and retry.";
  }
  return message
    .replace(/\[Request ID:[^\]]+\]\s*/g, "")
    .replace(/^\[CONVEX [^\]]+\]\s*/g, "")
    .replace(/^Server Error\s*/i, "")
    .replace(/^Uncaught Error:\s*/i, "")
    .replace(/\s+at handler \([^)]*\)[\s\S]*$/, "")
    .replace(/\s+Called by client\s*$/i, "")
    .trim();
}

function cleanNullableError(error: unknown) {
  if (!error) {
    return null;
  }
  return cleanActionError(error);
}

function parseErrorMessage(message: string) {
  const trimmed = message.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const parsedMessage = (parsed as Record<string, unknown>).message;
      if (typeof parsedMessage === "string") {
        return parsedMessage;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function readScoutIdeas(data: unknown): ScoutIdea[] {
  const root = asRecord(data);
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  return candidates.map((candidate, index) => {
    const item = asRecord(candidate);
    const signals = asRecord(item.signals);
    const sources = Array.isArray(item.sources) ? item.sources : [];
    const detail = readScoutIdeaDetail(item);
    return {
      id: readString(item.id, readString(item.ideaRef, `idea_${index + 1}`)),
      title: readString(
        item.shortTitle,
        readString(
          item.shortEvent,
          readString(item.event, readString(item.title, `Idea ${index + 1}`)),
        ),
      ),
      signal: readString(
        item.whyImportant,
        `${readString(signals.xTrendNames, "Live signal")} · ${sources.length} sources`,
      ),
      xSignal: readString(item.xSignalLine, fallbackXSignal(signals, sources.length)),
      angle: readString(
        item.whyFashionMerch,
        readString(item.angle, readString(item.merchAngle, "Fashionable limited drop")),
      ),
      urgency: readString(item.urgency, "This week"),
      detail,
      raw: candidate,
    };
  });
}

function readScoutIdeaDetail(item: Record<string, unknown>): ScoutIdeaDetail {
  const signals = asRecord(item.signals);
  return {
    description: readOptionalString(
      item.description,
      item.summary,
      item.longDescription,
    ),
    whyNow: readOptionalString(item.whyNow, item.urgency),
    audience: readOptionalString(
      item.audience,
      item.targetAudience,
      item.customerAudience,
    ),
    localAnchor: readOptionalString(
      item.localAnchor,
      item.cityAnchor,
      item.localContext,
      item.location,
    ),
    angle: readOptionalString(item.whyFashionMerch, item.angle, item.merchAngle),
    uncertainty: readOptionalString(
      item.uncertainty,
      item.evidenceUncertainty,
      item.sourceUncertainty,
      signals.xMetricsUncertainty,
    ),
    evidenceHighlights: readScoutEvidenceHighlights(item.evidenceHighlights),
    sources: readScoutSources(item.sources),
  };
}

function scoutInspectorRows(idea: ScoutIdea): Array<[string, string]> {
  return [
    ["Why now", idea.detail.whyNow],
    ["Audience", idea.detail.audience],
    ["Local anchor", idea.detail.localAnchor],
    ["Merch angle", idea.detail.angle],
    ["Uncertainty", idea.detail.uncertainty],
  ].filter((row): row is [string, string] => Boolean(row[1]));
}

function readScoutSources(value: unknown): ScoutSource[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map<ScoutSource | null>((source, index) => {
      if (typeof source === "string") {
        const url = normalizeSourceUrl(source);
        const label = url ? sourceLabelForUrl(url) : source.trim();
        return label
          ? {
              id: `${index}-${label}`,
              label,
              ...(url ? { url } : {}),
            }
          : null;
      }

      const item = asRecord(source);
      const url = normalizeSourceUrl(
        readOptionalString(item.url, item.sourceUrl, item.link, item.href),
      );
      const type = readOptionalString(item.sourceType, item.type);
      const label =
        readOptionalString(
          item.title,
          item.name,
          item.headline,
          item.domain,
          item.publisher,
          item.siteName,
        ) ??
        (url ? sourceLabelForUrl(url) : undefined) ??
        (type ? `${type.toUpperCase()} source` : undefined) ??
        `Source ${index + 1}`;
      return {
        id: `${index}-${url ?? label}`,
        label,
        ...(url ? { url } : {}),
      };
    })
    .filter((source): source is ScoutSource => source !== null);
}

function readScoutEvidenceHighlights(value: unknown): ScoutEvidenceHighlight[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 3)
    .map<ScoutEvidenceHighlight | null>((highlight, index) => {
      if (typeof highlight === "string") {
        return highlight.trim()
          ? {
              id: `highlight-${index}`,
              label: `Evidence ${index + 1}`,
              detail: highlight.trim(),
            }
          : null;
      }

      const item = asRecord(highlight);
      const label = readOptionalString(item.label, item.title, item.source, item.type);
      const detail = readOptionalString(item.detail, item.summary, item.metric, item.text);
      const url = normalizeSourceUrl(readOptionalString(item.url, item.sourceUrl, item.link));

      if (!label && !detail) {
        return null;
      }

      return {
        id: `highlight-${index}-${label ?? detail}`,
        label: label ?? `Evidence ${index + 1}`,
        detail: detail ?? label ?? "Evidence signal",
        ...(url ? { url } : {}),
      };
    })
    .filter((highlight): highlight is ScoutEvidenceHighlight => highlight !== null);
}

function normalizeSourceUrl(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}

function sourceLabelForUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || "Source";
  } catch {
    return url.replace(/^https?:\/\//i, "").split(/[/?#]/)[0] || "Source";
  }
}

function fallbackXSignal(signals: Record<string, unknown>, sourceCount: number) {
  const names = Array.isArray(signals.xTrendNames)
    ? signals.xTrendNames.filter((name) => typeof name === "string")
    : [];
  const count = signals.xTweetCountMax;
  const countLabel = typeof count === "number" ? ` · ${count.toLocaleString()} posts` : "";
  if (names.length > 0) {
    return `X: ${names.slice(0, 2).join(", ")}${countLabel}`;
  }
  return `Sources: ${sourceCount}`;
}

function readDesignerMocks(data: unknown, assets: DropAsset[]): DesignerMock[] {
  const root = asRecord(data);
  const concepts = Array.isArray(root.concepts) ? root.concepts : [];
  return concepts.map((concept, index) => {
    const item = asRecord(concept);
    const imageAsset = firstImageAsset(item);
    const imagePath = readString(imageAsset.path, "");
    const asset = assets.find((candidate) => candidate.sandboxPath === imagePath);
    return {
      id: readString(
        item.candidateId,
        readString(imageAsset.candidateId, `${readString(item.ideaRef, "idea")}-${index}`),
      ),
      ideaRef: readString(item.ideaRef, "idea"),
      name: readString(item.conceptName, `Product ${index + 1}`),
      idea: readString(item.rationale, readString(item.styleDirection, "Selected concept")),
      productType: readString(item.productType, "product"),
      imagePath,
      imageUrl: asset?.url,
      raw: concept,
    };
  });
}

function firstImageAsset(concept: Record<string, unknown>) {
  const imageAssets = Array.isArray(concept.imageAssets) ? concept.imageAssets : [];
  return asRecord(imageAssets[0]);
}

function readBuilderUrl(data: unknown) {
  const root = asRecord(data);
  const site = asRecord(root.site);
  const deploymentUrl = readString(site.deploymentUrl, "");
  const historicalUrl = readString(site.canonicalHistoricalUrl, "");
  return deploymentUrl || historicalUrl || undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string").join(", ") || fallback;
  }
  return fallback;
}

function readOptionalString(...values: unknown[]) {
  for (const value of values) {
    const read = readString(value, "");
    if (read) {
      return read;
    }
  }
  return undefined;
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

function firstVerificationIssue(verification: Record<string, unknown>) {
  const issues = Array.isArray(verification.issues) ? verification.issues : [];
  if (issues.length === 0) {
    return null;
  }
  const first = issues[0];
  if (typeof first === "string") {
    return "Meta ad setup stopped before any objects were created.";
  }
  const issue = asRecord(first);
  const stage = readString(issue.stage, "");
  const message = readString(
    issue.errorMessage ?? issue.redactedErrorMessage,
    "Meta rejected the ad request.",
  );
  if (message.toLowerCase().includes("unknown error")) {
    return "Meta rejected campaign creation before any ad objects were created.";
  }
  return stage
    ? `Meta ad setup stopped at ${stage}.`
    : "Meta ad setup stopped before any objects were created.";
}
