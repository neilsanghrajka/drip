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
  Loader2,
  PenLine,
  Sparkle,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType, CSSProperties } from "react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useAction, useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

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
  line: string;
};

type DropView = {
  drop: {
    _id: Id<"drops">;
    workspaceId: string;
    createdAt?: number;
    name: string;
    dropDate: string;
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
  signal: string;
  angle: string;
  urgency: string;
  raw: unknown;
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

const workspaceId = "drip-campaign-default";
const dropIdStorageKey = "drip.activeDropId";
const dropIdStorageEvent = "drip-active-drop-change";

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
    line: "Turns selected products into a one-page limited-drop site.",
  },
  {
    key: "marketer",
    step: "04",
    name: "Performance Marketer",
    shortName: "Marketer",
    color: "#ff3c38",
    icon: BarChart3,
    portrait: "/drip-team/meta-portrait.png",
    focusImage: "/drip-campaign/marketer-focus.png",
    title: "Drafts the ad",
    line: "Creates one paused Facebook ad from the site link and images.",
  },
];

export default function CampaignPage() {
  const createDrop = useAction(api.dropActions.createDrop);
  const startNextStage = useAction(api.dropActions.startNextStage);
  const selectScoutIdeas = useMutation(api.drops.selectScoutIdeas);
  const selectDesignerMocks = useMutation(api.drops.selectDesignerMocks);
  const cancelSandboxRun = useMutation(api.sandboxRuns.cancelSandboxRun);

  const [campaignName, setCampaignName] = useState("Week 52 Drop");
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

  const rawDropView = useQuery(
    api.drops.getDropReplay,
    dropId ? { dropId } : "skip",
  );
  const dropView = rawDropView as DropView | null | undefined;
  const rawRecentDrops = useQuery(api.drops.listDrops, {
    workspaceId,
    limit: 8,
  });
  const recentDrops = (rawRecentDrops ?? []) as DropSummary[];
  const started = Boolean(dropId);

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
  const activeKey = manualStage ?? stageForDrop(dropView);
  const activeIndex = Math.max(
    0,
    stages.findIndex((stage) => stage.key === activeKey),
  );
  const active = stages[activeIndex] ?? stages[0];
  const activityItems = dropView?.activity ?? [];
  const cancellableRun = useMemo(() => activeDropStageRun(dropView), [dropView]);
  const workspaceStatus = workspaceLifecycleStatus(dropView, cancellableRun);

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
        workspaceId,
        name: campaignName,
        dropDate: campaignDate,
        startingMode: "weekly-scout",
        topics: ["Mumbai streetwear", "cricket finals", "late monsoon utility"],
        productCategories: ["caps", "socks", "tees", "hoodies"],
        tasteConstraints: ["premium streetwear", "collectible weekly drop"],
      });
      writeStoredDropId(created.dropId);
      setSelectedIdeasOverride(null);
      setSelectedMocksOverride(null);
      setManualStage("scout");
      await startNextStage({ dropId: created.dropId });
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

  async function cloneActiveDrop() {
    if (!dropView) {
      return;
    }
    await runAction("clone-drop", async () => {
      const cloned = await createDrop({
        workspaceId: dropView.drop.workspaceId,
        name: `${dropView.drop.name} copy`,
        dropDate: dropView.drop.dropDate,
        startingMode: dropView.drop.startingMode ?? "weekly-scout",
        topics: dropView.drop.topics,
        productCategories: dropView.drop.productCategories,
        tasteConstraints: dropView.drop.tasteConstraints,
      });
      writeStoredDropId(cloned.dropId);
      setCampaignName(`${dropView.drop.name} copy`);
      setManualStage("scout");
      resetSelections();
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
    setManualStage(null);
    resetSelections();
  }

  function openHistoricalDrop(nextDropId: Id<"drops">) {
    writeStoredDropId(nextDropId);
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
            activeDropId={dropId}
            currentName={dropView?.drop.name ?? campaignName}
            onNewDrop={clearActiveDrop}
            onOpenDrop={openHistoricalDrop}
            recentDrops={recentDrops}
          />
        </div>
      </header>

      {!started ? (
        <StartCampaignScreen
          campaignName={campaignName}
          error={error}
          isStarting={pendingAction === "begin-scouting"}
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
                  <button
                    className="rounded-[10px] border-[3px] border-black bg-white px-2.5 py-1.5 text-[11px] font-black uppercase transition hover:bg-neutral-100 disabled:cursor-wait disabled:opacity-60"
                    disabled={Boolean(pendingAction)}
                    onClick={cloneActiveDrop}
                    type="button"
                  >
                    Clone
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
                {stages.map((stage, index) => (
                  <StageRailCard
                    active={stage.key === active.key}
                    completed={isStageComplete(stage.key, dropView)}
                    key={stage.key}
                    onActivate={() => setManualStage(stage.key)}
                    progress={stageProgress(stage.key, dropView)}
                    stage={stage}
                    unlocked={index <= activeIndex || isStageComplete(stage.key, dropView)}
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
                isPending={Boolean(pendingAction)}
                marketerArtifact={artifacts.marketer}
                activityItems={activityItems}
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
  onNewDrop,
  onOpenDrop,
  recentDrops,
}: {
  activeDropId: Id<"drops"> | null;
  currentName: string;
  onNewDrop: () => void;
  onOpenDrop: (dropId: Id<"drops">) => void;
  recentDrops: DropSummary[];
}) {
  const activeDropInList = recentDrops.some((drop) => drop._id === activeDropId);
  const value = activeDropId && activeDropInList ? activeDropId : "__current__";

  return (
    <label className="flex items-center gap-3">
      <span className="sr-only">Campaign session</span>
      <select
        aria-label="Campaign session"
        className="h-11 min-w-[250px] rounded-[10px] border-[3px] border-black bg-white px-3 text-sm font-black outline-none focus:bg-neutral-100"
        onChange={(event) => {
          if (event.target.value === "__new__") {
            onNewDrop();
            return;
          }
          if (event.target.value === "__current__") {
            return;
          }
          onOpenDrop(event.target.value as Id<"drops">);
        }}
        value={value}
      >
        {activeDropId && !activeDropInList ? (
          <option value="__current__">{currentName}</option>
        ) : null}
        {!activeDropId ? <option value="__current__">{currentName}</option> : null}
        {recentDrops.map((drop) => (
          <option key={drop._id} value={drop._id}>
            {drop.name}
          </option>
        ))}
        <option value="__new__">Clear session</option>
      </select>
    </label>
  );
}

function StartCampaignScreen({
  campaignName,
  error,
  isStarting,
  onCampaignNameChange,
  onStart,
}: {
  campaignName: string;
  error: string | null;
  isStarting: boolean;
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
  onMarketDrop: () => void;
  onRetryStage: () => void;
  onSelectIdea: (id: string) => void;
  onSelectMock: (id: string) => void;
  scoutIdeas: ScoutIdea[];
  selectedIdeas: string[];
  selectedMocks: string[];
}) {
  const Icon = active.icon;
  const canRetry =
    (dropView?.drop.status === "failed" || dropView?.drop.status === "cancelled") &&
    dropView.drop.currentStage === active.key;
  const body =
    active.key === "scout" ? (
      <ScoutFocus
        dropView={dropView}
        isPending={isPending}
        onApproveIdeas={onApproveIdeas}
        onSelectIdea={onSelectIdea}
        scoutIdeas={scoutIdeas}
        selectedIdeas={selectedIdeas}
      />
    ) : active.key === "designer" ? (
      <DesignerFocus
        designerMocks={designerMocks}
        dropView={dropView}
        isPending={isPending}
        onApproveProducts={onApproveProducts}
        onSelectMock={onSelectMock}
        selectedMocks={selectedMocks}
      />
    ) : active.key === "builder" ? (
      <BuilderFocus
        builderUrl={builderUrl}
        designerMocks={designerMocks}
        dropView={dropView}
        selectedMocks={selectedMocks}
      />
    ) : (
      <MarketerFocus
        builderUrl={builderUrl}
        designerMocks={designerMocks}
        dropView={dropView}
        isPending={isPending}
        marketerArtifact={marketerArtifact}
        onMarketDrop={onMarketDrop}
        selectedMocks={selectedMocks}
      />
    );

  return (
    <article className="flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border-[4px] border-black bg-white shadow-[8px_8px_0_#000]">
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
            <div>
              <p className="text-[12px] font-black uppercase tracking-[0.22em]">
                Step {active.step}
              </p>
              <h2 className="mt-1 text-[42px] font-black leading-none tracking-[-0.06em]">
                {active.shortName}
              </h2>
            </div>
            <div className="grid size-14 shrink-0 place-items-center rounded-[14px] border-[4px] border-black bg-white text-black">
              <Icon className="size-8" style={{ color: active.color }} />
            </div>
          </div>
          <div>
            <h3 className="text-[24px] font-black tracking-[-0.04em]">
              {active.title}
            </h3>
            <p className="mt-1 max-w-[660px] text-[16px] leading-tight">
              {active.line}
            </p>
            <div className="mt-3 h-2.5 max-w-[560px] overflow-hidden rounded-full border-[2px] border-black bg-white">
              <div
                className="h-full bg-black"
                style={{ width: `${stageProgress(active.key, dropView)}%` }}
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

      <InlineActivitySummary active={active} activityItems={activityItems} />

      <div className="min-h-0 flex-1 overflow-hidden p-3 lg:p-4">{body}</div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t-[3px] border-black/15 bg-neutral-50 px-5 py-1.5 lg:px-7">
        <div className="flex flex-wrap items-center gap-3 text-[12px] font-black uppercase">
          {stages.map((stage, index) => (
            <span
              className="flex items-center gap-2"
              key={stage.key}
              style={{ color: index === activeIndex ? stage.color : undefined }}
            >
              {isStageComplete(stage.key, dropView) ? (
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

function InlineActivitySummary({
  active,
  activityItems,
}: {
  active: Stage;
  activityItems: ActivityItem[];
}) {
  const items = activityItems.filter((item) => item.stage === active.key);
  const current =
    items.find((item) => item.status === "failed") ??
    items.find((item) => item.status === "running") ??
    [...items].reverse().find((item) => item.status === "complete") ??
    items[0];

  return (
    <div className="grid items-center gap-2 border-b-[3px] border-black/10 bg-white px-5 py-1.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:px-7">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: active.color }}
        />
        <p className="truncate text-[13px] font-black">
          {current?.label ?? `${active.shortName} ready`}
        </p>
      </div>
      <div className="hidden flex-wrap items-center gap-1.5 md:flex">
        {items.slice(0, 3).map((item) => (
          <span
            className={`inline-flex items-center gap-1 rounded-full border-[2px] border-black px-2 py-0.5 text-[9px] font-black uppercase ${
              item.status === "complete"
                ? "bg-[#eaffdf]"
                : item.status === "running"
                  ? "bg-[#fff7c9]"
                  : item.status === "failed"
                    ? "bg-[#ffefee]"
                    : "bg-white"
            }`}
            key={`${item.stage}-${item.label}`}
          >
            {item.status === "running" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : item.status === "complete" ? (
              <Check className="size-3 stroke-[4]" />
            ) : (
              <Circle className="size-3" />
            )}
            <span className="max-w-[150px] truncate">{item.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ScoutFocus({
  dropView,
  isPending,
  onApproveIdeas,
  onSelectIdea,
  scoutIdeas,
  selectedIdeas,
}: {
  dropView?: DropView | null;
  isPending: boolean;
  onApproveIdeas: () => void;
  onSelectIdea: (id: string) => void;
  scoutIdeas: ScoutIdea[];
  selectedIdeas: string[];
}) {
  const waiting = dropView?.drop.status === "scouting" || scoutIdeas.length === 0;

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="grid min-h-0 flex-1 gap-2 overflow-hidden md:grid-cols-2 lg:grid-cols-3">
          {waiting ? (
            <LoadingTiles label="Scout" />
          ) : (
            scoutIdeas.map((idea) => {
              const selected = selectedIdeas.includes(idea.id);
              return (
                <button
                  className={`rounded-[14px] border-[3px] border-black p-2 text-left transition hover:-translate-y-1 ${
                    selected
                      ? "bg-[#eaffdf] shadow-[5px_5px_0_#55d12c]"
                      : "bg-white shadow-[4px_4px_0_#000]"
                  }`}
                  key={idea.id}
                  onClick={() => onSelectIdea(idea.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="drip-clamp-2 text-[16px] font-black leading-[0.95] tracking-[-0.04em]">
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
                  <p className="drip-clamp-2 mt-2 text-[11px] font-bold leading-tight">
                    {idea.signal}
                  </p>
                  <p className="drip-clamp-1 mt-2 text-[10px] leading-tight text-neutral-600">
                    {idea.angle}
                  </p>
                  <p className="mt-1 inline-flex rounded-full bg-black px-2.5 py-0.5 text-[9px] font-black uppercase text-white">
                    {idea.urgency}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </section>

      <section className="flex min-h-0 flex-col rounded-[18px] border-[3px] border-black bg-black p-3.5 text-white shadow-[5px_5px_0_#55d12c]">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#55d12c]">
          Output
        </p>
        <h4 className="mt-2 text-[24px] font-black leading-none tracking-[-0.05em]">
          {selectedIdeas.length} ideas selected
        </h4>
        <div className="mt-3 grid min-h-0 flex-1 content-start gap-2 overflow-hidden">
          {scoutIdeas
            .filter((idea) => selectedIdeas.includes(idea.id))
            .map((idea) => (
              <div className="rounded-[12px] border border-white/20 p-2" key={idea.id}>
                <p className="drip-clamp-1 text-sm font-black">{idea.title}</p>
                <p className="mt-0.5 text-xs text-white/70">{idea.urgency}</p>
              </div>
            ))}
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

function DesignerFocus({
  designerMocks,
  dropView,
  isPending,
  onApproveProducts,
  onSelectMock,
  selectedMocks,
}: {
  designerMocks: DesignerMock[];
  dropView?: DropView | null;
  isPending: boolean;
  onApproveProducts: () => void;
  onSelectMock: (id: string) => void;
  selectedMocks: string[];
}) {
  const waiting =
    dropView?.drop.status === "designing" ||
    dropView?.drop.status === "ready_to_design" ||
    designerMocks.length === 0;

  return (
    <div className="grid h-full min-h-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="flex min-h-0 flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="mb-3 text-[12px] font-black uppercase tracking-[0.18em] text-neutral-500">
            Generated products
          </p>
          <div className="min-h-0 flex-1 overflow-hidden">
            <div className="grid h-full content-start gap-3 md:grid-cols-2 lg:grid-cols-3">
              {waiting ? null : (
                designerMocks.map((mock, index) => {
                  const selected = selectedMocks.includes(mock.id);
                  return (
                    <button
                      className={`overflow-hidden rounded-[16px] border-[3px] border-black text-left transition hover:-translate-y-1 ${
                        selected ? "shadow-[5px_5px_0_#1264ff]" : "shadow-[4px_4px_0_#000]"
                      }`}
                      key={mock.id}
                      onClick={() => onSelectMock(mock.id)}
                      type="button"
                    >
                      <div className="grid aspect-[1/0.58] place-items-center overflow-hidden bg-neutral-100">
                        {mock.imageUrl ? (
                          <img
                            alt={mock.name}
                            className="h-full w-full object-cover"
                            src={mock.imageUrl}
                          />
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
                      </div>
                      <div className="border-t-[3px] border-black bg-white p-3">
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
                      </div>
                    </button>
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
          These selected images become the limited-drop website carousel.
        </p>
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
  builderUrl,
  designerMocks,
  dropView,
  selectedMocks,
}: {
  builderUrl?: string;
  designerMocks: DesignerMock[];
  dropView?: DropView | null;
  selectedMocks: string[];
}) {
  const selected = designerMocks.filter((mock) => selectedMocks.includes(mock.id));
  const building =
    dropView?.drop.status === "building" || dropView?.drop.status === "ready_to_build";

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
      </section>

      <section className="overflow-hidden rounded-[18px] border-[4px] border-black bg-black text-white shadow-[7px_7px_0_#f8ca00]">
        <div className="flex items-center justify-between border-b border-white/15 px-6 py-4">
          <p className="font-black uppercase tracking-[0.18em]">Drop preview</p>
          <ArrowUpRight className="size-6" />
        </div>
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
            {selected[0]?.imageUrl ? (
              <img
                alt={selected[0].name}
                className="h-full w-full object-cover"
                src={selected[0].imageUrl}
              />
            ) : (
              <div className="size-48 rounded-[28px] border-[4px] border-white/25 bg-neutral-800 shadow-[0_0_80px_rgb(248_202_0_/_35%)]" />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function MarketerFocus({
  builderUrl,
  designerMocks,
  dropView,
  isPending,
  marketerArtifact,
  onMarketDrop,
  selectedMocks,
}: {
  builderUrl?: string;
  designerMocks: DesignerMock[];
  dropView?: DropView | null;
  isPending: boolean;
  marketerArtifact?: DropArtifact;
  onMarketDrop: () => void;
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
  const metaBlocked = Boolean(marketerArtifact && (!allCreatedPaused || issue));
  const canRetryMeta =
    !isPending &&
    dropView?.drop.currentStage === "marketer" &&
    (dropView.drop.status === "ready_to_market" ||
      dropView.drop.status === "completed" ||
      dropView.drop.status === "failed" ||
      dropView.drop.status === "cancelled");
  const actionLabel =
    dropView?.drop.status === "ready_to_market"
      ? "Create paused ad"
      : metaBlocked
        ? "Retry paused ad"
        : "Create paused ad";
  const previewStatus = metaBlocked ? "Paused draft blocked" : "Paused draft · no spend";
  const previewProducts = designerMocks.filter((mock) => selectedMocks.includes(mock.id));
  const heroProduct = previewProducts.find((mock) => mock.imageUrl) ?? previewProducts[0];
  const previewCard = (
    <div className="mt-2 overflow-hidden rounded-[14px] border-[3px] border-white/30 bg-white text-black">
      <div className="relative grid aspect-[1/0.56] place-items-center overflow-hidden bg-[#ff3c38]">
        {heroProduct?.imageUrl ? (
          <img
            alt={heroProduct.name}
            className="h-full w-full object-cover"
            src={heroProduct.imageUrl}
          />
        ) : (
          <div className="px-5 text-center text-xl font-black">Drop of the week</div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2.5 text-white">
          <p className="drip-clamp-1 text-base font-black">
            {readString(campaign.name, "Website + selected images")}
          </p>
          <p className="mt-0.5 text-xs font-bold text-white/80">{previewStatus}</p>
        </div>
      </div>
      {previewProducts.length > 1 ? (
        <div className="grid grid-cols-3 gap-1.5 border-t-[3px] border-black bg-white p-1.5">
          {previewProducts.slice(0, 3).map((mock) => (
            <div
              className="aspect-square overflow-hidden rounded-[8px] border-[2px] border-black bg-neutral-100"
              key={mock.id}
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
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-w-0 overflow-hidden rounded-[18px] border-[3px] border-black bg-white shadow-[5px_5px_0_#000]">
        {metaBlocked ? (
          <div className="border-b-[3px] border-black bg-[#f8ca00] px-3 py-2.5">
            <p className="text-[12px] font-black uppercase tracking-[0.18em] text-black/60">
              Meta blocked
            </p>
            <p className="mt-1 text-sm font-black leading-tight">
              {issue || "Meta did not return created paused objects. Nothing is spending."}
            </p>
          </div>
        ) : null}
        <div className="grid grid-cols-[minmax(0,1fr)_92px_46px] border-b-[3px] border-black bg-neutral-50 px-3 py-2.5 text-[11px] font-black uppercase text-neutral-500">
          <span>Artifact</span>
          <span>Status</span>
          <span>Count</span>
        </div>
        {[
          ["Campaign", readString(campaign.name, "Drop of the week"), readString(campaign.configuredStatus, metaBlocked ? "NOT CREATED" : "PAUSED"), String(campaignCount)],
          ["Ad set", "Drop audience", metaBlocked && adSetCount === 0 ? "NOT CREATED" : "PAUSED", String(adSetCount)],
          ["Ad", "Website + selected images", metaBlocked && adCount === 0 ? "NOT CREATED" : "DRAFT", String(adCount)],
        ].map(([kind, name, status, count]) => (
          <div
            className="grid grid-cols-[minmax(0,1fr)_92px_46px] items-center border-b border-black/10 px-3 py-2.5 text-xs"
            key={kind}
          >
            <span className="min-w-0">
              <span className="font-black">{kind}</span>
              <span className="ml-2 inline-block max-w-[70%] truncate align-bottom text-neutral-500">
                {name}
              </span>
            </span>
            <span className="font-bold text-[#ff3c38]">{status}</span>
            <span className="font-black">{count}</span>
          </div>
        ))}
      </section>

      <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border-[3px] border-black bg-black p-3 text-white shadow-[5px_5px_0_#ff3c38]">
        <p className="text-[12px] font-black uppercase tracking-[0.2em] text-[#ff3c38]">
          Ad preview
        </p>
        {builderUrl ? (
          <a
            aria-label="Open drop site from ad preview"
            href={builderUrl}
            rel="noreferrer"
            target="_blank"
          >
            {previewCard}
          </a>
        ) : (
          previewCard
        )}
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
          {[
            ["Spend", "0"],
            ["Status", "Paused"],
            ["Link", builderUrl ? "Site" : "Pending"],
          ].map(([label, value]) => (
            <div className="rounded-[10px] border border-white/20 p-1.5" key={label}>
              <p className="text-[10px] font-black uppercase text-white/60">{label}</p>
              <p className="mt-0.5 text-lg font-black">{value}</p>
            </div>
          ))}
        </div>
        <button
          className="drip-button mt-2 w-full px-5 py-2.5 text-sm disabled:cursor-wait disabled:opacity-70"
          disabled={!canRetryMeta}
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

function LoadingTiles({ label }: { label: string }) {
  return Array.from({ length: 6 }, (_, index) => (
    <div
      className="min-h-[96px] rounded-[14px] border-[3px] border-black bg-white p-3 shadow-[4px_4px_0_#000]"
      key={index}
    >
      <Loader2 className="size-5 animate-spin" />
      <p className="drip-clamp-1 mt-2 text-base font-black leading-tight">{label}</p>
      <p className="mt-1 text-[11px] font-bold uppercase text-neutral-500">
        Live output
      </p>
    </div>
  ));
}

function latestStageRun(
  dropView: DropView | null | undefined,
  stage: StageKey,
) {
  return dropView?.stageRuns
    .filter((stageRun) => stageRun.stage === stage)
    .sort((left, right) => (right.startedAt ?? right.updatedAt ?? 0) - (left.startedAt ?? left.updatedAt ?? 0))[0];
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

function stageForDrop(dropView: DropView | null | undefined): StageKey {
  const status = dropView?.drop.status;
  if (!status) {
    return "scout";
  }
  if (status === "completed" && dropView?.drop.currentStage) {
    return dropView.drop.currentStage;
  }
  if (status === "failed" && dropView?.drop.currentStage) {
    return dropView.drop.currentStage;
  }
  if (status === "cancelled" && dropView?.drop.currentStage) {
    return dropView.drop.currentStage;
  }
  if (status === "ready_to_market" || status === "marketing" || status === "completed") {
    return "marketer";
  }
  if (status === "ready_to_build" || status === "building") {
    return "builder";
  }
  if (status === "ready_to_design" || status === "designing" || status === "awaiting_mock_selection") {
    return "designer";
  }
  return "scout";
}

function isStageComplete(stage: StageKey, dropView: DropView | null | undefined) {
  if (!dropView) {
    return false;
  }
  if (stage === "marketer") {
    return dropView.drop.status === "completed";
  }
  return dropView.artifacts.some((artifact) => artifact.stage === stage);
}

function stageProgress(stage: StageKey, dropView: DropView | null | undefined) {
  if (isStageComplete(stage, dropView)) {
    return 100;
  }
  if (dropView?.drop.currentStage === stage) {
    return dropView.drop.status.startsWith("awaiting") ? 86 : 58;
  }
  return 0;
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
    return {
      id: readString(item.id, readString(item.ideaRef, `idea_${index + 1}`)),
      title: readString(item.event, readString(item.title, `Idea ${index + 1}`)),
      signal: readString(
        item.whyImportant,
        `${readString(signals.xTrendNames, "Live signal")} · ${sources.length} sources`,
      ),
      angle: readString(item.whyFashionMerch, readString(item.merchAngle, "Fashionable limited drop")),
      urgency: readString(item.urgency, "This week"),
      raw: candidate,
    };
  });
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
  const first = issues[0];
  if (typeof first === "string") {
    return "Meta paused-ad setup stopped before any objects were created. Nothing is spending.";
  }
  const issue = asRecord(first);
  const stage = readString(issue.stage, "");
  const message = readString(
    issue.errorMessage ?? issue.redactedErrorMessage,
    "Meta rejected the paused object request.",
  );
  if (message.toLowerCase().includes("unknown error")) {
    return "Meta rejected campaign creation before any paused objects were created. Nothing is spending.";
  }
  return stage
    ? `Meta paused-ad setup stopped at ${stage}. Nothing is spending.`
    : "Meta paused-ad setup stopped before any objects were created. Nothing is spending.";
}
