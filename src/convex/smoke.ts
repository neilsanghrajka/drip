import { v } from "convex/values";

import { query } from "./_generated/server";

export const ping = query({
  args: {
    label: v.optional(v.string()),
  },
  handler: async (_ctx, { label }) => {
    return {
      ok: true,
      name: "drip-convex-smoke",
      label: label ?? null,
    };
  },
});
