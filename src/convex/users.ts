import { getAuthUserId } from "@convex-dev/auth/server";

import { query } from "./_generated/server";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }

    const user = await ctx.db.get(userId);
    if (user === null) {
      return null;
    }

    return {
      id: user._id,
      username: user.username,
      usernameNormalized: user.usernameNormalized,
    };
  },
});
