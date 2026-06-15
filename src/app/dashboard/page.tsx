"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { ArrowLeft, ArrowRight, LogOut, Sparkle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "../../convex/_generated/api";

export default function DashboardPage() {
  const router = useRouter();
  const { signOut } = useAuthActions();
  const me = useQuery(api.users.me, {});
  const drops = useQuery(api.drops.listDrops, { limit: 6 });
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    await signOut();
    router.push("/");
  }

  return (
    <main className="drip-shell min-h-svh bg-white text-black">
      <header className="flex h-[92px] items-center justify-between border-b-[3px] border-black px-8 lg:px-12">
        <Link className="drip-logo group relative" href="/">
          Drip
          <Sparkle className="absolute -right-6 top-1 size-7 fill-[#ffd400] stroke-black stroke-[1.5]" />
        </Link>
        <div className="flex items-center gap-4 text-[16px] font-black">
          <span className="hidden items-center gap-2 rounded-full border-[3px] border-black px-4 py-2 sm:inline-flex">
            <span className="size-3 rounded-full bg-[#31c767]" />
            Logged in
            {me?.username ? (
              <span className="text-black/55">{me.username}</span>
            ) : null}
          </span>
          <button
            className="inline-flex h-12 items-center gap-2 rounded-[10px] border-[3px] border-black bg-white px-4 transition hover:bg-[#ffd400]"
            disabled={isSigningOut}
            onClick={handleSignOut}
            type="button"
          >
            <LogOut className="size-5 stroke-[3]" />
            Log out
          </button>
        </div>
      </header>

      <section className="drip-dot-bg min-h-[calc(100svh-92px)] px-8 py-12 lg:px-12">
        <div className="mx-auto flex min-h-[calc(100svh-188px)] max-w-[1120px] flex-col justify-center">
          <Link
            className="mb-10 inline-flex w-fit items-center gap-2 text-[16px] font-black uppercase"
            href="/"
          >
            <ArrowLeft className="size-5 stroke-[3]" />
            Landing
          </Link>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(320px,0.65fr)] lg:items-start">
            <section className="border-y-[3px] border-black py-10">
            <p className="text-[13px] font-black uppercase tracking-wide">
              Dashboard
            </p>
            <h1 className="drip-heading mt-3 text-[64px] leading-[0.94] sm:text-[96px]">
              Start scouting
            </h1>
            <p className="mt-7 text-[24px] font-black leading-tight">
              Logged in{me?.username ? ` as ${me.username}` : ""}.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link className="drip-button inline-flex px-8 py-4 text-xl" href="/campaign">
                Start campaign
                <ArrowRight className="size-5 stroke-[3]" />
              </Link>
              <Link
                className="inline-flex items-center gap-2 rounded-[10px] border-[3px] border-black bg-white px-6 py-4 text-[16px] font-black uppercase transition hover:bg-[#ffd400]"
                href="/"
              >
                <ArrowLeft className="size-5 stroke-[3]" />
                Landing
              </Link>
            </div>
            </section>

            <section className="rounded-[18px] border-[4px] border-black bg-white p-4 shadow-[6px_6px_0_#000]">
              <div className="flex items-center justify-between gap-4 border-b-[3px] border-black pb-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-black/50">
                    Your history
                  </p>
                  <h2 className="text-[24px] font-black leading-none">Drop sessions</h2>
                </div>
                <span className="rounded-full border-[3px] border-black bg-[#ffd400] px-3 py-1 text-[12px] font-black">
                  {drops?.length ?? 0}
                </span>
              </div>
              <div className="mt-3 grid gap-2">
                {drops === undefined ? (
                  <p className="rounded-[12px] border-[3px] border-black bg-neutral-50 p-4 text-sm font-black">
                    Loading campaigns...
                  </p>
                ) : drops.length === 0 ? (
                  <p className="rounded-[12px] border-[3px] border-black bg-neutral-50 p-4 text-sm font-black">
                    No drops yet.
                  </p>
                ) : (
                  drops.map((drop) => (
                    <Link
                      className="grid gap-1 rounded-[12px] border-[3px] border-black bg-white p-3 text-left transition hover:-translate-y-0.5 hover:bg-neutral-50"
                      href={`/campaign?drop=${drop._id}`}
                      key={drop._id}
                    >
                      <span className="text-[16px] font-black leading-tight">{drop.name}</span>
                      <span className="text-[11px] font-black uppercase text-black/50">
                        {drop.dropDate} · {drop.status.replaceAll("_", " ")}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
