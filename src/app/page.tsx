"use client";

import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import {
  BarChart3,
  Box,
  Check,
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

type TeamKey = "scout" | "designer" | "builder" | "marketer";
type AuthMode = "signIn" | "signUp";

type TeamMember = {
  key: TeamKey;
  name: string;
  color: string;
  bg: string;
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  portrait: string;
  title: string;
  subtitle: string;
  bullets: string[];
};

const team: TeamMember[] = [
  {
    key: "scout",
    name: "Scout",
    color: "#55d12c",
    bg: "bg-[#55d12c]",
    icon: Crosshair,
    portrait: "/drip-team/scout-portrait.png",
    title: "Finds signals",
    subtitle: "Cultural moments before they peak.",
    bullets: [
      "Trending topics",
      "Cultural moments",
      "Audience pull",
      "Urgency window",
    ],
  },
  {
    key: "designer",
    name: "Designer",
    color: "#1264ff",
    bg: "bg-[#1264ff]",
    icon: PenLine,
    portrait: "/drip-team/designer-portrait.png",
    title: "Creates mock images",
    subtitle: "Approved ideas in, fashion concepts out.",
    bullets: [
      "Original fashion mockups",
      "Graphics, fits, and variants",
      "Ready-to-test concepts",
    ],
  },
  {
    key: "builder",
    name: "Builder",
    color: "#f8ca00",
    bg: "bg-[#f8ca00]",
    icon: Box,
    portrait: "/drip-team/builder-portrait.png",
    title: "Builds pages",
    subtitle: "Turns selected products into a limited drop page.",
    bullets: ["Drop website preview", "Product carousel", "Dummy buy CTA"],
  },
  {
    key: "marketer",
    name: "Performance Marketer",
    color: "#ff3c38",
    bg: "bg-[#ff3c38]",
    icon: BarChart3,
    portrait: "/drip-team/meta-portrait.png",
    title: "Drafts ads",
    subtitle: "Promotes the drop page with selected product images.",
    bullets: ["One paused Facebook ad", "Website link", "No experiments"],
  },
];

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

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [activeKey, setActiveKey] = useState<TeamKey>("designer");
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const visibleAuthMode =
    authMode ?? (searchParams.get("auth") === "login" ? "signIn" : null);
  const active = team.find((member) => member.key === activeKey) ?? team[1];
  const ActiveIcon = active.icon;

  function openAuth(mode: AuthMode) {
    setAuthMode(mode);
  }

  function handleStartScouting(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (isLoading) {
      return;
    }
    if (isAuthenticated) {
      router.push("/campaign");
      return;
    }
    window.history.pushState(null, "", "/?auth=login");
    openAuth("signIn");
  }

  return (
    <main className="drip-shell min-h-svh bg-white text-black" id="top">
      <header className="flex h-[92px] items-center justify-between border-b-[3px] border-black px-8 lg:px-12">
        <a className="drip-logo group relative" href="#top">
          Drip
          <Sparkle className="absolute -right-6 top-1 size-7 fill-[#ffd400] stroke-black stroke-[1.5] transition group-hover:rotate-12" />
        </a>
      </header>

      {visibleAuthMode !== null && !isAuthenticated ? (
        <AuthPanel
          mode={visibleAuthMode}
          onClose={() => {
            setAuthMode(null);
            clearAuthQueryParam();
          }}
          onModeChange={setAuthMode}
          onSuccess={() => {
            setAuthMode(null);
            clearAuthQueryParam();
            router.push("/campaign");
          }}
        />
      ) : null}

      <section className="drip-dot-bg overflow-hidden px-8 pb-0 pt-10 lg:px-12 lg:pt-14">
        <div className="mx-auto grid max-w-[1720px] gap-8 min-[900px]:grid-cols-[minmax(300px,0.9fr)_minmax(165px,0.45fr)_minmax(250px,0.68fr)] min-[900px]:items-center xl:grid-cols-[0.83fr_0.52fr_0.76fr] xl:gap-9">
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

          <section className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(330px,520px)_minmax(230px,280px)] 2xl:items-center">
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
                className="relative aspect-[1/0.82]"
                style={{ backgroundColor: active.color }}
              >
                <Image
                  alt={`${active.name} dominant portrait`}
                  className="h-full w-full object-cover object-center"
                  fill
                  sizes="520px"
                  src={active.portrait}
                  unoptimized
                />
              </div>
              <div className="px-8 py-7 text-white">
                <h3 className="text-[34px] font-black tracking-[-0.04em]">
                  {active.title}
                </h3>
                <p className="mt-3 max-w-[380px] text-[24px] font-medium leading-tight">
                  {active.subtitle}
                </p>
              </div>
            </article>

            <aside
              className="hidden rounded-[20px] border-[4px] bg-white p-7 shadow-[7px_7px_0_#000] 2xl:block"
              style={{ borderColor: active.color }}
            >
              <div className="mb-7 grid size-16 place-items-center rounded-[12px] border-[3px] border-black">
                <ActiveIcon
                  className="size-9"
                  style={{ color: active.color }}
                />
              </div>
              <ul className="space-y-5">
                {active.bullets.map((bullet) => (
                  <li
                    className="flex gap-3 text-[16px] leading-tight"
                    key={bullet}
                  >
                    <span
                      className="grid size-6 shrink-0 place-items-center rounded-full text-white"
                      style={{ backgroundColor: active.color }}
                    >
                      <Check className="size-4 stroke-[4]" />
                    </span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </aside>
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
