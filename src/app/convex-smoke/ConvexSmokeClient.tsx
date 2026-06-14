"use client";

import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexSmokeClient() {
  return (
    <ConvexProvider client={convex}>
      <ConvexSmokeStatus />
    </ConvexProvider>
  );
}

function ConvexSmokeStatus() {
  const smoke = useQuery(api.smoke.ping, { label: "browser" });

  if (smoke === undefined) {
    return (
      <p
        className="rounded-md border px-3 py-2 text-sm text-muted-foreground"
        data-testid="convex-smoke-status"
      >
        loading
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p
        className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950"
        data-testid="convex-smoke-status"
      >
        {smoke.ok ? "ok" : "not-ok"}
      </p>
      <dl className="grid gap-2 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">Function</dt>
          <dd className="font-mono">{smoke.name}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">Label</dt>
          <dd className="font-mono">{smoke.label}</dd>
        </div>
      </dl>
    </div>
  );
}
