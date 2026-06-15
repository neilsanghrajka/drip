import { mutation } from "./_generated/server";

const legacyDemoWorkspaceId = "drip-campaign-default";
const demoUsernameNormalized = "drip-demo";

export const claimLegacyDemoDropsForDemoUser = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_usernameNormalized", (q) =>
        q.eq("usernameNormalized", demoUsernameNormalized),
      )
      .first();
    if (!user) {
      throw new Error("Demo user does not exist.");
    }

    const workspaceId = `user:${user._id}`;
    const drops = await ctx.db
      .query("drops")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", legacyDemoWorkspaceId),
      )
      .collect();

    let sandboxRunCount = 0;
    const timestamp = Date.now();
    for (const drop of drops) {
      await ctx.db.patch(drop._id, {
        workspaceId,
        updatedAt: timestamp,
      });

      const sandboxRuns = await ctx.db
        .query("sandboxRuns")
        .withIndex("by_drop_stage_created", (q) => q.eq("dropId", drop._id))
        .collect();
      for (const sandboxRun of sandboxRuns) {
        await ctx.db.patch(sandboxRun._id, {
          workspaceId,
          updatedAt: timestamp,
        });
        sandboxRunCount += 1;
      }
    }

    return {
      movedDropCount: drops.length,
      movedSandboxRunCount: sandboxRunCount,
    };
  },
});
