"use client";

import {
  ArrowUpRight,
  BarChart3,
  Box,
  Check,
  CheckCircle2,
  Circle,
  Crosshair,
  ExternalLink,
  Loader2,
  PenLine,
  Search,
  Sparkle,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ComponentType, CSSProperties } from "react";
import { useMemo, useState } from "react";

type StageKey = "scout" | "designer" | "marketer" | "builder";

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
  progress: number;
  current: string;
};

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
    line: "Turns cultural signals into five merchable drop ideas.",
    progress: 68,
    current: "Synthesizing X trends, web signals, and your notes",
  },
  {
    key: "designer",
    step: "02",
    name: "Designer",
    shortName: "Designer",
    color: "#1264ff",
    icon: PenLine,
    portrait: "/drip-team/designer-portrait.png",
    focusImage: "/drip-campaign/designer-focus.png",
    title: "Creates the mocks",
    line: "Converts approved ideas into fashion concepts and images.",
    progress: 34,
    current: "Waiting for approved Scout ideas",
  },
  {
    key: "marketer",
    step: "03",
    name: "Performance Marketer",
    shortName: "Marketer",
    color: "#ff3c38",
    icon: BarChart3,
    portrait: "/drip-team/meta-portrait.png",
    focusImage: "/drip-campaign/marketer-focus.png",
    title: "Tests demand",
    line: "Creates paused Meta tests and explains the winner.",
    progress: 12,
    current: "Queued for selected mock images",
  },
  {
    key: "builder",
    step: "04",
    name: "Builder",
    shortName: "Builder",
    color: "#f8ca00",
    icon: Box,
    portrait: "/drip-team/builder-portrait.png",
    focusImage: "/drip-campaign/builder-focus.png",
    title: "Builds the page",
    line: "Turns the winning brief into a shareable drop website.",
    progress: 0,
    current: "Queued for the winning drop",
  },
];

const scoutIdeas = [
  {
    id: "speed",
    title: "Midnight Racing Club",
    signal: "F1 edits, night drives, black/yellow utility",
    angle: "Oversized tee + cap for street-race watch parties",
    urgency: "3 day window",
  },
  {
    id: "monsoon",
    title: "Rainproof City Uniform",
    signal: "Late monsoon complaints and commuter memes",
    angle: "Washed hoodie with reflective pocket graphics",
    urgency: "This week",
  },
  {
    id: "album",
    title: "Tour Bootleg Revival",
    signal: "Fan-made poster accounts are spiking",
    angle: "Bootleg-style tee with city-date back print",
    urgency: "48 hours",
  },
  {
    id: "cricket",
    title: "Finals Afterparty",
    signal: "Cricket celebration posts and neighborhood chants",
    angle: "Cap + socks bundle for finals week",
    urgency: "Sunday",
  },
  {
    id: "metro",
    title: "Metro Line Drop",
    signal: "New commute route screenshots and jokes",
    angle: "Transit-map inspired long sleeve",
    urgency: "5 day window",
  },
];

const designMocks = [
  { id: "hoodie-black", name: "Shadow Hoodie", idea: "Rainproof City" },
  { id: "tee-race", name: "Racing Tee", idea: "Midnight Club" },
  { id: "cap-final", name: "Finals Cap", idea: "Afterparty" },
  { id: "sock-metro", name: "Metro Socks", idea: "Line Drop" },
  { id: "vest-black", name: "Utility Vest", idea: "Rainproof City" },
  { id: "tee-bootleg", name: "Bootleg Tee", idea: "Tour Revival" },
];

const marketerRows = [
  {
    mock: "Shadow Hoodie",
    audience: "Streetwear, 18-34",
    status: "Paused draft",
    cpc: "$0.74",
  },
  {
    mock: "Racing Tee",
    audience: "F1 reels engagers",
    status: "Creative ready",
    cpc: "$0.88",
  },
  {
    mock: "Finals Cap",
    audience: "Cricket fans",
    status: "Copy ready",
    cpc: "$0.92",
  },
];

export default function CampaignPage() {
  const [campaignName, setCampaignName] = useState("Week 52 Drop");
  const [campaignDate, setCampaignDate] = useState("This Week Sunday");
  const [started, setStarted] = useState(false);
  const [activeKey, setActiveKey] = useState<StageKey>("scout");
  const [selectedIdeas, setSelectedIdeas] = useState<string[]>([
    "speed",
    "monsoon",
    "cricket",
  ]);
  const [selectedMocks, setSelectedMocks] = useState<string[]>([
    "hoodie-black",
    "tee-race",
    "cap-final",
  ]);

  const activeIndex = stages.findIndex((stage) => stage.key === activeKey);
  const active = stages[activeIndex] ?? stages[0];

  function advance() {
    const next = stages[Math.min(activeIndex + 1, stages.length - 1)];
    setActiveKey(next.key);
  }

  function toggleIdea(id: string) {
    setSelectedIdeas((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleMock(id: string) {
    setSelectedMocks((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  return (
    <main className="drip-shell flex h-svh flex-col overflow-hidden bg-white text-black">
      <header className="flex h-[92px] shrink-0 items-center justify-between gap-5 border-b-[3px] border-black px-6 py-4 lg:px-10">
        <Link className="drip-logo group relative" href="/">
          Drip
          <Sparkle className="absolute -right-6 top-1 size-7 fill-[#ffd400] stroke-black stroke-[1.5] transition group-hover:rotate-12" />
        </Link>

        <div className="hidden flex-1 items-center justify-end gap-4 md:flex">
          <input
            aria-label="Campaign name"
            className="max-w-[320px] rounded-[8px] border-0 bg-transparent px-3 py-2 text-right text-[22px] font-black tracking-[-0.03em] text-black outline-none transition focus:bg-neutral-100 focus:text-neutral-500"
            onChange={(event) => setCampaignName(event.target.value)}
            value={campaignName}
          />
          <select
            aria-label="Campaign date"
            className="h-12 rounded-[10px] border-[3px] border-black bg-white px-3 text-sm font-black outline-none focus:bg-neutral-100"
            onChange={(event) => setCampaignDate(event.target.value)}
            value={campaignDate}
          >
            <option>This Week Sunday</option>
            <option>Next Friday</option>
            <option>Launch Weekend</option>
          </select>
        </div>
      </header>

      {!started ? (
        <StartCampaignScreen
          campaignDate={campaignDate}
          campaignName={campaignName}
          onCampaignDateChange={setCampaignDate}
          onCampaignNameChange={setCampaignName}
          onStart={() => setStarted(true)}
        />
      ) : (
        <section
          className="drip-dot-bg min-h-0 flex-1 overflow-hidden px-5 py-5 lg:px-8"
        >
          <div className="mx-auto grid h-full max-w-[1740px] gap-6 xl:grid-cols-[330px_minmax(0,1fr)]">
            <aside className="grid gap-4 xl:sticky xl:top-6 xl:self-start">
              <div className="rounded-[18px] border-[4px] border-black bg-white p-5 shadow-[6px_6px_0_#000]">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-500">
                  Active campaign
                </p>
                <input
                  aria-label="Edit campaign title"
                  className="mt-2 w-full rounded-[8px] bg-transparent px-1 py-1 text-[32px] font-black leading-none tracking-[-0.04em] outline-none transition focus:bg-neutral-100 focus:text-neutral-500"
                  onChange={(event) => setCampaignName(event.target.value)}
                  value={campaignName}
                />
                <p className="mt-2 text-sm font-bold text-neutral-500">
                  {campaignDate} · four-teammate workflow
                </p>
              </div>

              <div className="grid gap-3">
                {stages.map((stage, index) => (
                  <StageRailCard
                    active={stage.key === activeKey}
                    completed={index < activeIndex}
                    key={stage.key}
                    onActivate={() => setActiveKey(stage.key)}
                    stage={stage}
                  />
                ))}
              </div>
            </aside>

            <section className="min-h-0 min-w-0">
              <StageWorkspace
                active={active}
                activeIndex={activeIndex}
                onAdvance={advance}
                onSelectIdea={toggleIdea}
                onSelectMock={toggleMock}
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

function StartCampaignScreen({
  campaignDate,
  campaignName,
  onCampaignDateChange,
  onCampaignNameChange,
  onStart,
}: {
  campaignDate: string;
  campaignName: string;
  onCampaignDateChange: (value: string) => void;
  onCampaignNameChange: (value: string) => void;
  onStart: () => void;
}) {
  const [activeKey, setActiveKey] = useState<StageKey>("scout");
  const active = stages.find((stage) => stage.key === activeKey) ?? stages[0];

  return (
    <section className="drip-dot-bg min-h-[calc(100svh-92px)] px-6 py-10 lg:px-12">
      <div className="mx-auto grid max-w-[1500px] gap-10 lg:grid-cols-[minmax(360px,0.75fr)_minmax(520px,1fr)] lg:items-center">
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
            Name the week, choose the run date, then let the team take the first
            pass.
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
              Campaign date
              <select
                className="h-16 rounded-[10px] border-[3px] border-black bg-white px-4 text-xl font-black outline-none transition focus:bg-neutral-100"
                onChange={(event) => onCampaignDateChange(event.target.value)}
                value={campaignDate}
              >
                <option>This Week Sunday</option>
                <option>Next Friday</option>
                <option>Launch Weekend</option>
              </select>
            </label>
            <button
              className="drip-button mt-2 h-[68px] px-9 text-2xl"
              onClick={onStart}
              type="button"
            >
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
          <div className="overflow-hidden rounded-[26px] border-[4px] border-black bg-black shadow-[8px_8px_0_#000]">
            <div
              className="flex h-16 items-center justify-between px-6 text-white"
              style={{ backgroundColor: active.color }}
            >
              <h2 className="text-[30px] font-black tracking-[-0.03em]">
                {active.shortName}
              </h2>
              <span className="text-sm font-black uppercase">Ready</span>
            </div>
            <div className="relative aspect-[1/0.82]">
              <Image
                alt={`${active.name} campaign illustration`}
                className="h-full w-full object-cover"
                fill
                sizes="620px"
                src={active.focusImage}
                unoptimized
              />
            </div>
            <div className="p-7 text-white">
              <h3 className="text-[34px] font-black tracking-[-0.04em]">
                {active.title}
              </h3>
              <p className="mt-2 max-w-[430px] text-[22px] leading-tight">
                {active.line}
              </p>
            </div>
          </div>
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
        <div className="relative aspect-[1/0.54]" style={{ backgroundColor: stage.color }}>
          <Image
            alt={`${stage.name} portrait`}
            className="h-full w-full object-cover object-[center_32%]"
            fill
            sizes="260px"
            src={stage.portrait}
            unoptimized
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

function StageRailCard({
  active,
  completed,
  onActivate,
  stage,
}: {
  active: boolean;
  completed: boolean;
  onActivate: () => void;
  stage: Stage;
}) {
  const Icon = stage.icon;
  const progress = completed ? 100 : active ? stage.progress : 0;

  return (
    <button
      aria-pressed={active}
      className="group rounded-[18px] text-left outline-none transition duration-200 hover:-translate-y-1 focus-visible:ring-4 focus-visible:ring-black/70"
      onClick={onActivate}
      onFocus={onActivate}
      onMouseEnter={onActivate}
      type="button"
    >
      <article
        className={`overflow-hidden rounded-[18px] border-[4px] border-black bg-white shadow-[5px_5px_0_#000] transition-all duration-300 ${
          active ? "min-h-[250px]" : "min-h-[106px]"
        }`}
        style={{ boxShadow: active ? `7px 7px 0 ${stage.color}` : undefined }}
      >
        <div className="grid grid-cols-[82px_1fr]">
          <div className="relative h-[102px]" style={{ backgroundColor: stage.color }}>
            <Image
              alt={`${stage.name} portrait`}
              className="h-full w-full object-cover object-[center_30%]"
              fill
              sizes="100px"
              src={stage.portrait}
              unoptimized
            />
          </div>
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase text-neutral-500">
                  Teammate {stage.step}
                </p>
                <h3 className="text-[24px] font-black leading-none tracking-[-0.04em]">
                  {stage.shortName}
                </h3>
              </div>
              <div
                className="grid size-10 shrink-0 place-items-center rounded-full border-[3px] border-black bg-white"
                style={{ color: stage.color }}
              >
                {completed ? (
                  <Check className="size-5 stroke-[4]" />
                ) : (
                  <Icon className="size-5 stroke-[3]" />
                )}
              </div>
            </div>
          </div>
        </div>

        {active ? (
          <div className="border-t-[4px] border-black p-4">
            <div className="mb-3 flex items-center justify-between text-[12px] font-black uppercase">
              <span>{completed ? "Complete" : "In progress"}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full border-[2px] border-black bg-white">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ backgroundColor: stage.color, width: `${progress}%` }}
              />
            </div>
            <p className="mt-4 text-[14px] font-bold leading-tight text-neutral-700">
              {completed ? "Output is ready for the next teammate." : stage.current}
            </p>
          </div>
        ) : null}
      </article>
    </button>
  );
}

function StageWorkspace({
  active,
  activeIndex,
  onAdvance,
  onSelectIdea,
  onSelectMock,
  selectedIdeas,
  selectedMocks,
}: {
  active: Stage;
  activeIndex: number;
  onAdvance: () => void;
  onSelectIdea: (id: string) => void;
  onSelectMock: (id: string) => void;
  selectedIdeas: string[];
  selectedMocks: string[];
}) {
  const Icon = active.icon;
  const body = useMemo(() => {
    if (active.key === "scout") {
      return (
        <ScoutFocus
          onAdvance={onAdvance}
          onSelectIdea={onSelectIdea}
          selectedIdeas={selectedIdeas}
        />
      );
    }
    if (active.key === "designer") {
      return (
        <DesignerFocus
          onAdvance={onAdvance}
          onSelectMock={onSelectMock}
          selectedMocks={selectedMocks}
        />
      );
    }
    if (active.key === "marketer") {
      return <MarketerFocus onAdvance={onAdvance} />;
    }
    return <BuilderFocus />;
  }, [active.key, onAdvance, onSelectIdea, onSelectMock, selectedIdeas, selectedMocks]);

  return (
    <article className="flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border-[4px] border-black bg-white shadow-[8px_8px_0_#000]">
      <div
        className="grid shrink-0 gap-0 border-b-[4px] border-black lg:grid-cols-[360px_minmax(0,1fr)]"
        style={{ backgroundColor: active.color }}
      >
        <div className="relative min-h-[260px] border-b-[4px] border-black bg-black lg:border-b-0 lg:border-r-[4px]">
          <Image
            alt={`${active.name} focus`}
            className="h-full w-full object-cover"
            fill
            sizes="480px"
            src={active.focusImage}
            unoptimized
          />
        </div>
        <div className="flex min-h-[260px] flex-col justify-between p-7 text-white">
          <div className="flex items-center justify-between gap-5">
            <div>
              <p className="text-[12px] font-black uppercase tracking-[0.22em]">
                Step {active.step}
              </p>
              <h2 className="mt-2 text-[58px] font-black leading-none tracking-[-0.06em]">
                {active.name}
              </h2>
            </div>
            <div className="grid size-16 shrink-0 place-items-center rounded-[14px] border-[4px] border-black bg-white text-black">
              <Icon className="size-9" style={{ color: active.color }} />
            </div>
          </div>
          <div>
            <h3 className="text-[34px] font-black tracking-[-0.04em]">
              {active.title}
            </h3>
            <p className="mt-2 max-w-[660px] text-[22px] leading-tight">
              {active.line}
            </p>
            <div className="mt-5 h-3 max-w-[560px] overflow-hidden rounded-full border-[2px] border-black bg-white">
              <div
                className="h-full bg-black"
                style={{ width: `${active.progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-5 lg:p-5">{body}</div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t-[3px] border-black/15 bg-neutral-50 px-5 py-3 lg:px-7">
        <div className="flex flex-wrap items-center gap-3 text-sm font-black uppercase">
          {stages.map((stage, index) => (
            <span
              className="flex items-center gap-2"
              key={stage.key}
              style={{ color: index === activeIndex ? stage.color : undefined }}
            >
              {index < activeIndex ? (
                <CheckCircle2 className="size-5" />
              ) : (
                <Circle className="size-5" />
              )}
              {stage.shortName}
            </span>
          ))}
        </div>
        <p className="text-sm font-bold text-neutral-500">
          Outputs stay in the campaign history as each teammate hands off.
        </p>
      </div>
    </article>
  );
}

function ScoutFocus({
  onAdvance,
  onSelectIdea,
  selectedIdeas,
}: {
  onAdvance: () => void;
  onSelectIdea: (id: string) => void;
  selectedIdeas: string[];
}) {
  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="flex flex-wrap items-center gap-2">
          {["X trend scan", "Exa sources", "Creator notes"].map((item, index) => (
            <div
              className="inline-flex items-center gap-2 rounded-full border-[3px] border-black bg-white px-3 py-1.5 text-xs font-black"
              key={item}
            >
              {index === 0 ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4 stroke-[4]" />
              )}
              {item}
            </div>
          ))}
        </div>

        <div className="mt-3 flex min-h-12 items-center gap-3 rounded-[14px] border-[3px] border-black bg-white px-4 shadow-[4px_4px_0_#000]">
          <Search className="size-5 shrink-0" />
          <input
            className="h-10 min-w-0 flex-1 bg-transparent text-base font-bold outline-none placeholder:text-neutral-400"
            defaultValue="Search: Mumbai streetwear, cricket finals, late monsoon utility"
          />
          <button className="rounded-[10px] bg-black px-4 py-2 text-sm font-black text-white" type="button">
            Ask Scout
          </button>
        </div>

        <div className="mt-4 grid min-h-0 flex-1 gap-2 overflow-hidden md:grid-cols-2 xl:grid-cols-3">
          {scoutIdeas.map((idea) => {
            const selected = selectedIdeas.includes(idea.id);
            return (
              <button
                className={`rounded-[16px] border-[3px] border-black p-2.5 text-left transition hover:-translate-y-1 ${
                  selected ? "bg-[#eaffdf] shadow-[5px_5px_0_#55d12c]" : "bg-white shadow-[4px_4px_0_#000]"
                }`}
                key={idea.id}
                onClick={() => onSelectIdea(idea.id)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <h4 className="text-[16px] font-black leading-[0.95] tracking-[-0.04em]">
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
                <p className="mt-1.5 text-[9px] font-black uppercase text-neutral-500">
                  Signal
                </p>
                <p className="mt-0.5 text-[11px] font-bold leading-tight">{idea.signal}</p>
                <p className="mt-1.5 text-[9px] font-black uppercase text-neutral-500">
                  Merch angle
                </p>
                <p className="mt-0.5 text-[11px] leading-tight">{idea.angle}</p>
                <p className="mt-1.5 inline-flex rounded-full bg-black px-2.5 py-0.5 text-[10px] font-black uppercase text-white">
                  {idea.urgency}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[18px] border-[3px] border-black bg-black p-4 text-white shadow-[5px_5px_0_#55d12c]">
        <p className="text-[12px] font-black uppercase tracking-[0.2em] text-[#55d12c]">
          Output
        </p>
        <h4 className="mt-2 text-[28px] font-black leading-none tracking-[-0.05em]">
          {selectedIdeas.length} ideas selected
        </h4>
        <div className="mt-4 grid gap-2">
          {scoutIdeas
            .filter((idea) => selectedIdeas.includes(idea.id))
            .map((idea) => (
              <div className="rounded-[12px] border border-white/20 p-2.5" key={idea.id}>
                <p className="font-black">{idea.title}</p>
                <p className="mt-1 text-sm text-white/70">{idea.urgency}</p>
              </div>
            ))}
        </div>
        <button
          className="drip-button mt-4 w-full px-6 py-3.5 text-lg"
          onClick={onAdvance}
          type="button"
        >
          Send to Designer
        </button>
      </section>
    </div>
  );
}

function DesignerFocus({
  onAdvance,
  onSelectMock,
  selectedMocks,
}: {
  onAdvance: () => void;
  onSelectMock: (id: string) => void;
  selectedMocks: string[];
}) {
  return (
    <div className="grid h-full min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
      <section className="flex min-h-0 flex-col">
        <div className="grid gap-3 md:grid-cols-3">
          {["Briefing product lanes", "Generating image pool", "Reviewer curating"].map(
            (item, index) => (
              <div
                className="rounded-[16px] border-[3px] border-black bg-white p-4 shadow-[4px_4px_0_#000]"
                key={item}
              >
                <p className="text-[12px] font-black uppercase text-neutral-500">
                  Lane {index + 1}
                </p>
                <p className="mt-2 text-[20px] font-black leading-none tracking-[-0.03em]">
                  {item}
                </p>
                <div className="mt-4 h-3 overflow-hidden rounded-full border-[2px] border-black">
                  <div
                    className="h-full bg-[#1264ff]"
                    style={{ width: `${index === 0 ? 100 : index === 1 ? 72 : 48}%` }}
                  />
                </div>
              </div>
            ),
          )}
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          <p className="mb-3 text-[12px] font-black uppercase tracking-[0.18em] text-neutral-500">
            Generated mocks
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto pr-2">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {designMocks.map((mock, index) => {
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
                    <div className="grid aspect-[1/0.72] place-items-center bg-neutral-100">
                      <div
                        className="grid size-24 place-items-center rounded-[18px] border-[4px] border-black text-[42px] font-black text-white"
                        style={{
                          backgroundColor:
                            index % 3 === 0 ? "#111" : index % 3 === 1 ? "#1264ff" : "#f8ca00",
                        }}
                      >
                        {mock.name.slice(0, 1)}
                      </div>
                    </div>
                    <div className="border-t-[3px] border-black bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-xl font-black leading-none">{mock.name}</h4>
                          <p className="mt-1 text-sm text-neutral-500">{mock.idea}</p>
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
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="h-full rounded-[18px] border-[3px] border-black bg-black p-5 text-white shadow-[5px_5px_0_#1264ff]">
        <p className="text-[12px] font-black uppercase tracking-[0.2em] text-[#1264ff]">
          Output
        </p>
        <h4 className="mt-3 text-[32px] font-black leading-none tracking-[-0.05em]">
          {selectedMocks.length} mocks selected
        </h4>
        <p className="mt-4 text-white/75">
          The selection becomes the creative set for paused Meta testing.
        </p>
        <button
          className="drip-button mt-6 w-full px-6 py-4 text-lg"
          onClick={onAdvance}
          type="button"
        >
          Send to Marketer
        </button>
      </section>
    </div>
  );
}

function MarketerFocus({ onAdvance }: { onAdvance: () => void }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-[18px] border-[3px] border-black bg-white shadow-[5px_5px_0_#000]">
        <div className="grid grid-cols-[1fr_130px_120px_90px] border-b-[3px] border-black bg-neutral-50 px-4 py-3 text-[12px] font-black uppercase text-neutral-500">
          <span>Mock</span>
          <span>Audience</span>
          <span>Status</span>
          <span>CPC</span>
        </div>
        {marketerRows.map((row) => (
          <div
            className="grid grid-cols-[1fr_130px_120px_90px] items-center border-b border-black/10 px-4 py-4 text-sm"
            key={row.mock}
          >
            <span className="font-black">{row.mock}</span>
            <span>{row.audience}</span>
            <span className="font-bold text-[#ff3c38]">{row.status}</span>
            <span className="font-black">{row.cpc}</span>
          </div>
        ))}
      </section>

      <aside className="rounded-[18px] border-[3px] border-black bg-black p-5 text-white shadow-[5px_5px_0_#ff3c38]">
        <p className="text-[12px] font-black uppercase tracking-[0.2em] text-[#ff3c38]">
          Ad preview
        </p>
        <div className="mt-4 overflow-hidden rounded-[14px] border-[3px] border-white/30 bg-white text-black">
          <div className="aspect-[1/0.74] bg-[#ff3c38]" />
          <div className="p-4">
            <p className="text-lg font-black">Shadow Hoodie</p>
            <p className="mt-1 text-sm">Paused campaign draft</p>
          </div>
        </div>
        <a
          className="mt-5 inline-flex items-center gap-2 text-sm font-black uppercase underline decoration-[3px] underline-offset-4"
          href="#ad-preview"
        >
          Open ad preview <ExternalLink className="size-4" />
        </a>
        <div className="mt-6 grid grid-cols-3 gap-2 text-center">
          {[
            ["CTR", "2.8%"],
            ["CPC", "$0.74"],
            ["Saves", "1.2K"],
          ].map(([label, value]) => (
            <div className="rounded-[10px] border border-white/20 p-3" key={label}>
              <p className="text-[11px] font-black uppercase text-white/60">{label}</p>
              <p className="mt-1 text-xl font-black">{value}</p>
            </div>
          ))}
        </div>
        <button
          className="drip-button mt-6 w-full px-6 py-4 text-lg"
          onClick={onAdvance}
          type="button"
        >
          Approve winner
        </button>
      </aside>
    </div>
  );
}

function BuilderFocus() {
  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <section className="rounded-[18px] border-[3px] border-black bg-white p-5 shadow-[5px_5px_0_#000]">
        <p className="text-[12px] font-black uppercase tracking-[0.2em] text-neutral-500">
          Build status
        </p>
        <div className="mt-5 grid gap-4">
          {[
            "Winning brief packaged",
            "Drop page art direction chosen",
            "Product carousel generated",
            "Preview ready for review",
          ].map((item, index) => (
            <div className="flex items-center gap-3" key={item}>
              <span
                className={`grid size-8 place-items-center rounded-full border-[3px] border-black ${
                  index < 3 ? "bg-[#f8ca00]" : "bg-white"
                }`}
              >
                {index < 3 ? <Check className="size-4 stroke-[4]" /> : index + 1}
              </span>
              <span className="font-black">{item}</span>
            </div>
          ))}
        </div>
        <button className="drip-button mt-7 w-full px-6 py-4 text-lg" type="button">
          Preview drop site
        </button>
      </section>

      <section className="overflow-hidden rounded-[18px] border-[4px] border-black bg-black text-white shadow-[7px_7px_0_#f8ca00]">
        <div className="flex items-center justify-between border-b border-white/15 px-6 py-4">
          <p className="font-black uppercase tracking-[0.18em]">Drop preview</p>
          <ArrowUpRight className="size-6" />
        </div>
        <div className="grid min-h-[420px] gap-6 p-7 md:grid-cols-[1fr_0.85fr] md:items-center">
          <div>
            <p className="text-sm font-black uppercase text-[#f8ca00]">
              48 hours left
            </p>
            <h4 className="mt-3 text-[58px] font-black leading-[0.9] tracking-[-0.07em]">
              Shadow
              <br />
              Circuit
            </h4>
            <p className="mt-5 max-w-[320px] text-lg text-white/75">
              Washed black utility hoodie. Built from the week&apos;s strongest
              signal.
            </p>
            <div className="mt-7 inline-flex rounded-[10px] bg-[#f8ca00] px-6 py-4 text-lg font-black text-black">
              Join waitlist
            </div>
          </div>
          <div className="grid aspect-square place-items-center rounded-[24px] bg-neutral-900">
            <div className="size-48 rounded-[28px] border-[4px] border-white/25 bg-neutral-800 shadow-[0_0_80px_rgb(248_202_0_/_35%)]" />
          </div>
        </div>
      </section>
    </div>
  );
}
