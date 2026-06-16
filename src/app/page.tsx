"use client";

import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useAction, useQuery } from "convex/react";
import {
  BarChart3,
  Box,
  Crosshair,
  Loader2,
  PenLine,
  Sparkle,
  Star,
  X,
} from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ComponentType,
  CSSProperties,
  FormEvent,
  MouseEvent,
} from "react";
import { useState } from "react";

import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

type TeamKey = "scout" | "designer" | "builder" | "marketer";
type AuthMode = "signIn" | "signUp";
type BrandKey = "x" | "openai" | "codex" | "vercel" | "meta";
type SetupMode = "create" | "resume";

type PoweredBy = {
  brand: BrandKey;
  label: string;
};

const brandColors: Record<BrandKey, string> = {
  codex: "#111111",
  meta: "#0866ff",
  openai: "#10a37f",
  vercel: "#000000",
  x: "#000000",
};

type TeamMember = {
  key: TeamKey;
  name: string;
  color: string;
  bg: string;
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  portrait: string;
  heroObjectPosition: string;
  title: string;
  subtitle: string;
  poweredBy: PoweredBy[];
};

type DropSummary = {
  _id: Id<"drops">;
  name: string;
  dropDate: string;
  status: string;
  currentStage?: TeamKey;
  createdAt: number;
  updatedAt: number;
};

const dropIdStorageKey = "drip.activeDropId";
const dropIdStorageEvent = "drip-active-drop-change";

const team: TeamMember[] = [
  {
    key: "scout",
    name: "Scout",
    color: "#55d12c",
    bg: "bg-[#55d12c]",
    icon: Crosshair,
    portrait: "/drip-team/scout-portrait.png",
    heroObjectPosition: "center 16%",
    title: "Finds trends",
    subtitle:
      "Scans X for trending topics and fashion signals before they peak.",
    poweredBy: [{ brand: "x", label: "X" }],
  },
  {
    key: "designer",
    name: "Designer",
    color: "#1264ff",
    bg: "bg-[#1264ff]",
    icon: PenLine,
    portrait: "/drip-team/designer-portrait.png",
    heroObjectPosition: "center 14%",
    title: "Creates mockups",
    subtitle: "Uses GPT Image 2.0 to create product mockups for approved ideas.",
    poweredBy: [{ brand: "openai", label: "GPT Image 2.0" }],
  },
  {
    key: "builder",
    name: "Builder",
    color: "#f8ca00",
    bg: "bg-[#f8ca00]",
    icon: Box,
    portrait: "/drip-team/builder-portrait.png",
    heroObjectPosition: "center 18%",
    title: "Builds sites",
    subtitle: "Turns selected products into a one-page store for the drop.",
    poweredBy: [
      { brand: "codex", label: "Codex SDK" },
      { brand: "vercel", label: "Vercel Agent Browser" },
    ],
  },
  {
    key: "marketer",
    name: "Marketer",
    color: "#ff3c38",
    bg: "bg-[#ff3c38]",
    icon: BarChart3,
    portrait: "/drip-team/meta-portrait.png",
    heroObjectPosition: "center 15%",
    title: "Creates ads",
    subtitle: "Uses Meta Ads CLI to create the campaign for the drop.",
    poweredBy: [{ brand: "meta", label: "Meta Ads CLI" }],
  },
];

function BrandLogo({
  brand,
  className,
}: {
  brand: BrandKey;
  className?: string;
}) {
  if (brand === "x") {
    return (
      <svg
        aria-hidden="true"
        className={className}
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M13.95 10.32 21.68 1.5h-1.83l-6.72 7.66L7.78 1.5H1.6l8.1 11.58-8.1 9.42h1.83l7.08-8.24 5.66 8.24h6.18l-8.4-12.18Zm-2.51 2.93-.82-1.15L4.1 2.86h2.8l5.27 7.47.82 1.15 6.86 9.71h-2.8l-5.61-7.94Z" />
      </svg>
    );
  }

  if (brand === "openai") {
    return (
      <svg
        aria-hidden="true"
        className={className}
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M12 3.2c1.6 0 2.8.7 3.6 1.8 1.3-.1 2.6.4 3.5 1.6.8 1.1 1 2.5.6 3.8.8 1 .9 2.5.3 3.9-.7 1.3-1.9 2.2-3.3 2.4-.6 1.2-1.8 2.1-3.3 2.3-1.4.2-2.7-.3-3.6-1.2-1.4.1-2.8-.5-3.6-1.7-.8-1.1-1-2.5-.6-3.8-.8-1.1-.9-2.6-.2-3.9.6-1.2 1.8-2 3.2-2.2.6-1.6 1.9-3 3.4-3Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
        <path
          d="m8.6 6.2 6.6 3.8v7M19.7 10.4 13 14.2l-6.8-3.9M9.8 17.8v-7.6l5.8-3.4"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </svg>
    );
  }

  if (brand === "codex") {
    return (
      <svg
        aria-hidden="true"
        className={className}
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="m9.2 7.8-4.1 4.1 4.1 4.1M14.8 7.8l4.1 4.1-4.1 4.1M13.2 5.7l-2.4 12.6"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.4"
        />
      </svg>
    );
  }

  if (brand === "vercel") {
    return (
      <svg
        aria-hidden="true"
        className={className}
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M12 3 22 20H2L12 3Z" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M2.7 12.2c0-3.1 1.8-6.2 4.4-6.2 2.1 0 3.5 2 4.9 4.3C13.4 8 14.8 6 16.9 6c2.6 0 4.4 3.1 4.4 6.2 0 2.3-1.2 4-3.2 4-2.1 0-3.6-1.8-6.1-5.9-2.5 4.1-4 5.9-6.1 5.9-2 0-3.2-1.7-3.2-4Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.1"
      />
    </svg>
  );
}

function PoweredByStrip({ member }: { member: TeamMember }) {
  return (
    <div className="mt-2.5 flex min-w-0 items-center gap-3 border-t border-white/15 pt-2">
      <p className="shrink-0 text-[10px] font-black uppercase tracking-[0.22em] text-white/55">
        Powered by
      </p>
      <div className="flex min-w-0 flex-nowrap items-center gap-2">
        {member.poweredBy.map((item) => (
          <div
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] border-[2px] border-black bg-white px-2.5 text-black shadow-[2px_2px_0_rgba(255,255,255,0.16)]"
            key={`${item.brand}-${item.label}`}
          >
            <span
              className="grid size-5 shrink-0 place-items-center rounded-[6px] text-white"
              style={{ backgroundColor: brandColors[item.brand] }}
            >
              <BrandLogo brand={item.brand} className="size-3.5" />
            </span>
            <span className="whitespace-nowrap text-[11px] font-black leading-none">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamCard({
  member,
  active,
  onActivate,
}: {
  member: TeamMember;
  active: boolean;
  onActivate: () => void;
}) {
  const Icon = member.icon;

  return (
    <button
      aria-pressed={active}
      className="group min-w-0 rounded-[18px] outline-none transition duration-200 hover:-translate-y-1 focus-visible:ring-4 focus-visible:ring-black/70"
      onClick={onActivate}
      onFocus={onActivate}
      onMouseEnter={onActivate}
      type="button"
    >
      <article
        className={`overflow-hidden rounded-[18px] border-[4px] border-black bg-white shadow-[6px_6px_0_#000] transition duration-200 ${
          active ? "scale-[1.03]" : "scale-100"
        }`}
        style={{ boxShadow: active ? `7px 7px 0 ${member.color}` : undefined }}
      >
        <div className={`relative aspect-[1/0.54] ${member.bg}`}>
          <Image
            alt={`${member.name} portrait`}
            className="h-full w-full object-cover object-[center_32%]"
            fill
            sizes="260px"
            src={member.portrait}
            unoptimized
          />
          <div className="absolute right-2.5 top-2.5 grid size-10 place-items-center rounded-full border-[3px] border-black bg-white">
            <Icon className="size-5" style={{ color: member.color }} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t-[4px] border-black bg-white px-3 py-2">
          <span className="text-[16px] font-black">{member.name}</span>
          <span className="flex items-center gap-1.5 text-[12px] font-black uppercase">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: member.color }}
            />
            Active
          </span>
        </div>
      </article>
    </button>
  );
}

function AuthPanel({
  mode,
  onClose,
  onModeChange,
  onSuccess,
}: {
  mode: AuthMode;
  onClose: () => void;
  onModeChange: (mode: AuthMode) => void;
  onSuccess: () => void;
}) {
  const { signIn } = useAuthActions();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    formData.set("flow", mode);

    try {
      await signIn("username", formData);
      onSuccess();
    } catch (caught) {
      setError(readAuthError(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  const title = mode === "signIn" ? "Log in" : "Sign up";
  const otherMode = mode === "signIn" ? "signUp" : "signIn";

  return (
    <section
      aria-label="Drip authentication"
      className="drip-dot-bg fixed inset-0 z-50 grid min-h-svh place-items-center overflow-y-auto bg-white p-4 sm:p-8"
      data-testid="auth-panel"
    >
      <div className="relative w-full max-w-[520px]">
        <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-[22px] bg-black sm:translate-x-4 sm:translate-y-4" />
        <div className="relative rounded-[22px] border-[4px] border-black bg-white p-6 shadow-[0_0_0_1px_#000] sm:p-8">
          <div className="mb-7 flex items-start justify-between gap-4">
            <div>
              <p className="drip-heading text-[58px] leading-none sm:text-[68px]">
                Drip
              </p>
              <p className="mt-2 text-[13px] font-black uppercase sm:text-[15px]">
                Username and password
              </p>
            </div>
            <button
              aria-label="Close login"
              className="grid size-12 shrink-0 place-items-center rounded-[12px] border-[3px] border-black bg-white transition hover:bg-[#ffd400] sm:size-14"
              onClick={onClose}
              type="button"
            >
              <X className="size-7 stroke-[3]" />
            </button>
          </div>

          <div className="mb-7 grid grid-cols-2 overflow-hidden rounded-[10px] border-[3px] border-black">
            <button
              className={`h-14 text-[16px] font-black uppercase sm:h-16 sm:text-[18px] ${
                mode === "signIn" ? "bg-[#ffd400]" : "bg-white"
              }`}
              onClick={() => {
                setError(null);
                onModeChange("signIn");
              }}
              type="button"
            >
              Log in
            </button>
            <button
              className={`h-14 border-l-[3px] border-black text-[16px] font-black uppercase sm:h-16 sm:text-[18px] ${
                mode === "signUp" ? "bg-[#ffd400]" : "bg-white"
              }`}
              onClick={() => {
                setError(null);
                onModeChange("signUp");
              }}
              type="button"
            >
              Sign up
            </button>
          </div>

          <form className="grid gap-5" onSubmit={handleSubmit}>
            <label className="grid gap-2 text-[13px] font-black uppercase sm:text-[15px]">
              Username
              <input
                autoComplete="username"
                className="h-14 rounded-[8px] border-[3px] border-black bg-white px-4 text-lg font-bold outline-none focus:ring-4 focus:ring-[#ffd400]/60 sm:h-16"
                data-testid="auth-username"
                name="username"
                required
                type="text"
              />
            </label>
            <label className="grid gap-2 text-[13px] font-black uppercase sm:text-[15px]">
              Password
              <input
                autoComplete={
                  mode === "signIn" ? "current-password" : "new-password"
                }
                className="h-14 rounded-[8px] border-[3px] border-black bg-white px-4 text-lg font-bold outline-none focus:ring-4 focus:ring-[#ffd400]/60 sm:h-16"
                data-testid="auth-password"
                minLength={8}
                name="password"
                required
                type="password"
              />
            </label>
            {error ? (
              <p
                className="rounded-[8px] border-[3px] border-[#ff3c38] bg-[#ffefee] px-4 py-3 text-sm font-black text-[#b31310]"
                data-testid="auth-error"
              >
                {error}
              </p>
            ) : null}
            <button
              className="drip-button mt-1 h-16 px-7 text-xl disabled:translate-x-0 disabled:translate-y-0 disabled:cursor-wait disabled:opacity-70 sm:h-[68px] sm:text-2xl"
              data-testid="auth-submit"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 size-5 animate-spin stroke-[3]" />
              ) : null}
              {title}
            </button>
          </form>

          <button
            className="mx-auto mt-7 block text-[13px] font-black uppercase underline decoration-[3px] underline-offset-4 sm:text-[15px]"
            onClick={() => {
              setError(null);
              onModeChange(otherMode);
            }}
            type="button"
          >
            {mode === "signIn" ? "New here? Sign up" : "Already in? Log in"}
          </button>
        </div>
      </div>
    </section>
  );
}

function StartDropModal({
  campaignName,
  error,
  isSubmitting,
  onCampaignNameChange,
  onClose,
  onCreate,
  onResume,
  recentDrops,
}: {
  campaignName: string;
  error: string | null;
  isSubmitting: boolean;
  onCampaignNameChange: (value: string) => void;
  onClose: () => void;
  onCreate: () => void;
  onResume: (dropId: Id<"drops">) => void;
  recentDrops: DropSummary[];
}) {
  const [mode, setMode] = useState<SetupMode>("create");
  const [selectedDropId, setSelectedDropId] = useState<string>("");
  const selectedResumeDropId = recentDrops.some(
    (drop) => drop._id === selectedDropId,
  )
    ? selectedDropId
    : (recentDrops[0]?._id ?? "");
  const selectedDrop = recentDrops.find(
    (drop) => drop._id === selectedResumeDropId,
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "create") {
      onCreate();
      return;
    }
    if (selectedResumeDropId) {
      onResume(selectedResumeDropId as Id<"drops">);
    }
  }

  return (
    <section
      aria-label="Start drop campaign"
      className="drip-dot-bg fixed inset-0 z-40 grid min-h-svh place-items-center overflow-y-auto bg-white/95 p-4 sm:p-8"
      data-testid="start-drop-modal"
    >
      <div className="relative w-full max-w-[620px]">
        <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-[22px] bg-black sm:translate-x-4 sm:translate-y-4" />
        <form
          className="relative rounded-[22px] border-[4px] border-black bg-white p-5 shadow-[0_0_0_1px_#000] sm:p-7"
          onSubmit={handleSubmit}
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-neutral-500">
                Campaign setup
              </p>
              <h2 className="drip-heading mt-2 text-[52px] leading-[0.9] tracking-[-0.04em] sm:text-[66px]">
                Start scouting
              </h2>
              <p className="mt-3 max-w-[430px] text-[18px] font-bold leading-tight text-neutral-700">
                Create a new drop or resume a previous campaign.
              </p>
            </div>
            <button
              aria-label="Close start scouting"
              className="grid size-11 shrink-0 place-items-center rounded-[12px] border-[3px] border-black bg-white transition hover:bg-[#ffd400]"
              onClick={onClose}
              type="button"
            >
              <X className="size-6 stroke-[3]" />
            </button>
          </div>

          <div className="mb-5 grid grid-cols-2 overflow-hidden rounded-[12px] border-[3px] border-black">
            <button
              className={`h-[52px] px-3 text-[13px] font-black uppercase tracking-[0.04em] transition ${
                mode === "create" ? "bg-[#ffd400]" : "bg-white hover:bg-neutral-100"
              }`}
              onClick={() => setMode("create")}
              type="button"
            >
              Create campaign
            </button>
            <button
              className={`h-[52px] border-l-[3px] border-black px-3 text-[13px] font-black uppercase tracking-[0.04em] transition ${
                mode === "resume" ? "bg-[#ffd400]" : "bg-white hover:bg-neutral-100"
              }`}
              onClick={() => setMode("resume")}
              type="button"
            >
              View previous
            </button>
          </div>

          {mode === "create" ? (
            <div className="grid gap-4 rounded-[16px] border-[3px] border-black bg-white p-4 shadow-[5px_5px_0_#000]">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-500">
                  About to create new drop
                </p>
                <p className="mt-1 text-sm font-bold text-neutral-600">
                  Name the campaign, then Scout starts the first run.
                </p>
              </div>
              <label className="grid gap-2 text-[12px] font-black uppercase tracking-[0.18em]">
                Campaign name
                <input
                  className="h-14 rounded-[10px] border-[3px] border-black bg-white px-4 text-xl font-black outline-none transition focus:bg-neutral-100"
                  onChange={(event) => onCampaignNameChange(event.target.value)}
                  value={campaignName}
                />
              </label>
            </div>
          ) : (
            <div className="grid gap-4 rounded-[16px] border-[3px] border-black bg-white p-4 shadow-[5px_5px_0_#000]">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-500">
                  Resume drop
                </p>
                <p className="mt-1 text-sm font-bold text-neutral-600">
                  Select a previous campaign and continue the team run.
                </p>
              </div>
              <label className="grid gap-2 text-[12px] font-black uppercase tracking-[0.18em]">
                Previous campaign
                <select
                  className="h-14 rounded-[10px] border-[3px] border-black bg-white px-4 text-base font-black outline-none transition focus:bg-neutral-100"
                  disabled={recentDrops.length === 0}
                  onChange={(event) => setSelectedDropId(event.target.value)}
                  value={selectedResumeDropId}
                >
                  {recentDrops.length > 0 ? (
                    recentDrops.map((drop) => (
                      <option key={drop._id} value={drop._id}>
                        {drop.name}
                      </option>
                    ))
                  ) : (
                    <option>No previous campaigns</option>
                  )}
                </select>
              </label>
              {selectedDrop ? (
                <div className="rounded-[12px] border-[2px] border-black bg-neutral-50 px-3 py-2">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-neutral-500">
                    Last status
                  </p>
                  <p className="mt-1 text-sm font-black">
                    {selectedDrop.status.replaceAll("_", " ")}
                  </p>
                </div>
              ) : null}
            </div>
          )}

          {error ? (
            <p className="mt-4 rounded-[10px] border-[3px] border-[#ff3c38] bg-[#ffefee] px-4 py-3 text-sm font-black text-[#b31310]">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              className="drip-button min-h-14 flex-1 px-7 text-lg disabled:translate-x-0 disabled:translate-y-0 disabled:cursor-wait disabled:opacity-70"
              disabled={
                isSubmitting ||
                (mode === "create" && campaignName.trim().length === 0) ||
                (mode === "resume" && !selectedResumeDropId)
              }
              type="submit"
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 size-5 animate-spin stroke-[3]" />
              ) : null}
              {mode === "create" ? "Create campaign" : "Resume campaign"}
            </button>
            <button
              className="min-h-14 rounded-[12px] border-[3px] border-black bg-white px-5 text-sm font-black uppercase transition hover:bg-neutral-100"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function readAuthError(caught: unknown) {
  const message =
    caught instanceof Error ? caught.message : "Could not authenticate.";
  return message
    .replace(/^.*ConvexError:\s*/, "")
    .replace(/^.*Error:\s*/, "")
    .trim();
}

function clearAuthQueryParam() {
  const url = new URL(window.location.href);
  if (url.searchParams.has("auth")) {
    url.searchParams.delete("auth");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }
}

function writeStoredDropId(dropId: Id<"drops">) {
  window.localStorage.setItem(dropIdStorageKey, dropId);
  window.dispatchEvent(new Event(dropIdStorageEvent));
}

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const createDrop = useAction(api.dropActions.createDrop);
  const startNextStage = useAction(api.dropActions.startNextStage);
  const rawRecentDrops = useQuery(
    api.drops.listDrops,
    isAuthenticated ? { limit: 8 } : "skip",
  );
  const recentDrops = (rawRecentDrops ?? []) as DropSummary[];
  const [activeKey, setActiveKey] = useState<TeamKey>("designer");
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [startAfterLogin, setStartAfterLogin] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [campaignName, setCampaignName] = useState("Week 52 Drop");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupSubmitting, setSetupSubmitting] = useState(false);
  const visibleAuthMode =
    authMode ?? (searchParams.get("auth") === "login" ? "signIn" : null);
  const active = team.find((member) => member.key === activeKey) ?? team[1];

  function openAuth(mode: AuthMode) {
    setAuthMode(mode);
  }

  function handleStartScouting(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (isLoading) {
      return;
    }
    if (isAuthenticated) {
      setSetupError(null);
      setSetupOpen(true);
      return;
    }
    setStartAfterLogin(true);
    window.history.pushState(null, "", "/?auth=login");
    openAuth("signIn");
  }

  async function handleCreateCampaign() {
    setSetupSubmitting(true);
    setSetupError(null);
    try {
      const created = await createDrop({
        name: campaignName.trim(),
        dropDate: "This Week Sunday",
        startingMode: "weekly-scout",
        topics: ["Mumbai streetwear", "cricket finals", "late monsoon utility"],
        productCategories: ["caps", "socks", "tees", "hoodies"],
        tasteConstraints: ["premium streetwear", "collectible weekly drop"],
      });
      writeStoredDropId(created.dropId);
      await startNextStage({ dropId: created.dropId });
      setSetupOpen(false);
      router.push("/campaign");
    } catch (caught) {
      setSetupError(readAuthError(caught));
    } finally {
      setSetupSubmitting(false);
    }
  }

  function handleResumeCampaign(dropId: Id<"drops">) {
    writeStoredDropId(dropId);
    setSetupOpen(false);
    setSetupError(null);
    router.push("/campaign");
  }

  return (
    <main className="drip-shell min-h-svh bg-white text-black" id="top">
      <header className="flex h-[92px] items-center justify-between border-b-[3px] border-black px-8 lg:px-12">
        <a className="drip-logo group relative" href="#top">
          Drip
          <Sparkle className="absolute -right-6 top-1 size-7 fill-[#ffd400] stroke-black stroke-[1.5] transition group-hover:rotate-12" />
        </a>
        <a className="drip-button h-[52px] px-6 text-lg" href="/slides">
          How it works
        </a>
      </header>

      {visibleAuthMode !== null && !isAuthenticated ? (
        <AuthPanel
          mode={visibleAuthMode}
          onClose={() => {
            setAuthMode(null);
            setStartAfterLogin(false);
            clearAuthQueryParam();
          }}
          onModeChange={setAuthMode}
          onSuccess={() => {
            setAuthMode(null);
            clearAuthQueryParam();
            if (startAfterLogin) {
              setSetupOpen(true);
            } else {
              router.push("/campaign");
            }
            setStartAfterLogin(false);
          }}
        />
      ) : null}

      {setupOpen && isAuthenticated ? (
        <StartDropModal
          campaignName={campaignName}
          error={setupError}
          isSubmitting={setupSubmitting}
          onCampaignNameChange={setCampaignName}
          onClose={() => {
            setSetupOpen(false);
            setSetupError(null);
          }}
          onCreate={handleCreateCampaign}
          onResume={handleResumeCampaign}
          recentDrops={recentDrops}
        />
      ) : null}

      <section className="drip-dot-bg overflow-hidden px-8 pb-0 pt-10 lg:px-12 lg:pt-14">
        <div className="mx-auto grid max-w-[1720px] gap-8 min-[900px]:grid-cols-[minmax(300px,0.86fr)_minmax(165px,0.42fr)_minmax(330px,0.86fr)] min-[900px]:items-center xl:grid-cols-[0.78fr_0.45fr_0.88fr] xl:gap-9">
          <section className="min-w-0">
            <div className="mb-6 ml-2 flex gap-1">
              <span className="block h-4 w-1 rotate-[-30deg] rounded-full bg-black" />
              <span className="mt-4 block h-4 w-1 rotate-[-58deg] rounded-full bg-black" />
              <span className="mt-8 block h-4 w-1 rotate-[-78deg] rounded-full bg-black" />
            </div>

            <h1 className="drip-heading max-w-[640px] text-[68px] leading-[0.96] tracking-[-0.035em] sm:text-[82px] md:text-[72px] lg:text-[84px] xl:text-[104px] 2xl:text-[112px]">
              Meet your
              <br />
              <span>AI fashion team</span>
            </h1>

            <p className="mt-8 text-[28px] font-medium tracking-[-0.02em]">
              Find the next drop before it peaks
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-8">
              <button
                className="drip-button px-11 py-5 text-2xl"
                data-testid="start-scouting"
                onClick={handleStartScouting}
                type="button"
              >
                Start scouting
              </button>
              <div className="hidden items-center gap-5 text-[22px] font-black italic leading-none sm:flex">
                <span className="drip-arrow" aria-hidden="true" />
                <span className="-rotate-6 font-[cursive]">
                  Let&apos;s find
                  <br />
                  your next drop
                </span>
              </div>
            </div>
          </section>

          <section className="relative mx-auto grid w-full max-w-[210px] gap-3 xl:max-w-[218px] xl:gap-3.5">
            <div className="absolute -left-14 top-12 hidden h-[73%] w-10 xl:block">
              <div className="absolute left-6 top-6 h-[86%] w-px bg-black" />
              <span className="absolute -top-1 left-1 text-5xl">↗</span>
              <span className="absolute bottom-2 left-1 text-5xl">↘</span>
              <span className="absolute left-0 top-[42%] grid size-10 place-items-center rounded-full border-[3px] border-black bg-[#1264ff] text-2xl font-black text-white shadow-[3px_3px_0_#000]">
                →
              </span>
            </div>

            {team.map((member) => (
              <TeamCard
                active={member.key === activeKey}
                key={member.key}
                member={member}
                onActivate={() => setActiveKey(member.key)}
              />
            ))}
          </section>

          <section className="grid min-w-0 min-[900px]:w-full min-[900px]:max-w-[520px] min-[900px]:justify-self-start">
            <article className="overflow-hidden rounded-[24px] border-[4px] border-black bg-black shadow-[8px_8px_0_#000]">
              <div
                className="flex h-16 items-center justify-between px-7 text-white"
                style={{ backgroundColor: active.color }}
              >
                <h2 className="text-[30px] font-black tracking-[-0.03em]">
                  {active.name}
                </h2>
                <span className="flex items-center gap-2 text-sm font-black uppercase">
                  <span className="size-3 rounded-full bg-white" />
                  Active
                </span>
              </div>
              <div
                className="relative aspect-[1/0.60]"
                style={{ backgroundColor: active.color }}
              >
                <Image
                  alt={`${active.name} dominant portrait`}
                  className="h-full w-full object-cover"
                  fill
                  sizes="680px"
                  src={active.portrait}
                  style={{ objectPosition: active.heroObjectPosition }}
                  unoptimized
                />
              </div>
              <div className="px-7 pb-3 pt-6 text-white sm:px-8 sm:pb-3 sm:pt-7">
                <h3 className="whitespace-nowrap text-[30px] font-black leading-[0.98] tracking-[-0.04em] sm:text-[34px] xl:text-[38px]">
                  {active.title}
                </h3>
                <p className="mt-3 max-w-[520px] text-[20px] font-medium leading-tight sm:text-[23px]">
                  {active.subtitle}
                </p>
                <PoweredByStrip member={active} />
              </div>
            </article>
          </section>
        </div>

        <div className="mx-auto mt-20 grid max-w-[1720px] gap-6 border-t border-black/20 py-6 md:grid-cols-[1fr_auto] md:items-center 2xl:mt-10">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex -space-x-3">
              {["N", "A", "K", "S"].map((initial) => (
                <div
                  className="grid size-12 place-items-center rounded-full border-2 border-white bg-black text-sm font-black text-white"
                  key={initial}
                >
                  {initial}
                </div>
              ))}
            </div>
            <div className="grid size-14 place-items-center rounded-full bg-black text-lg font-black text-white">
              40K+
            </div>
            <p className="text-[16px] leading-tight">
              Founders, marketers, and creators trust Drip
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-full bg-[#f8ca00]">
                <Star className="size-6 fill-white stroke-white" />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide">
                  Product Hunt
                </p>
                <p className="text-xl font-black">#1 Product of the Day</p>
              </div>
            </div>
            <div className="hidden h-10 w-px bg-black/20 sm:block" />
            <div>
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, index) => (
                  <span
                    className="grid size-6 place-items-center rounded-sm bg-[#31c767]"
                    key={index}
                  >
                    <Star className="size-4 fill-white stroke-white" />
                  </span>
                ))}
              </div>
              <p className="mt-1 text-[15px]">4.9 rating from 1,200+ reviews</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
