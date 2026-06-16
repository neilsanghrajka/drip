import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import {
  convexAuth,
  createAccount,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

import type { DataModel } from "./_generated/dataModel";
import { hashSecret, readFlow, readPassword, readUsername, verifySecret } from "./authLogic";

const USERNAME_PROVIDER_ID = "username";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    ConvexCredentials<DataModel>({
      id: USERNAME_PROVIDER_ID,
      authorize: async (credentials, ctx) => {
        const flow = readFlow(credentials.flow);
        const username = readUsername(credentials.username);
        const password = readPassword(credentials.password);

        if (flow === "signUp") {
          const existing = await findExistingAccount(ctx, username.normalized);
          if (existing !== null) {
            throw new ConvexError("Username is already taken.");
          }

          const { user } = await createAccount<DataModel>(ctx, {
            provider: USERNAME_PROVIDER_ID,
            account: {
              id: username.normalized,
              secret: password,
            },
            profile: {
              name: username.display,
              username: username.display,
              usernameNormalized: username.normalized,
            },
            shouldLinkViaEmail: false,
            shouldLinkViaPhone: false,
          });

          return { userId: user._id };
        }

        const account = await findExistingAccount(
          ctx,
          username.normalized,
          password,
        );
        if (account === null) {
          throw new ConvexError("Invalid username or password.");
        }

        return { userId: account.user._id };
      },
      crypto: {
        hashSecret,
        verifySecret,
      },
    }),
  ],
});

async function findExistingAccount(
  ctx: Parameters<typeof retrieveAccount<DataModel>>[0],
  usernameNormalized: string,
  password?: string,
) {
  try {
    return await retrieveAccount<DataModel>(ctx, {
      provider: USERNAME_PROVIDER_ID,
      account: {
        id: usernameNormalized,
        secret: password,
      },
    });
  } catch {
    return null;
  }
}
