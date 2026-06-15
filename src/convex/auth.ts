import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import {
  convexAuth,
  createAccount,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

import type { DataModel } from "./_generated/dataModel";

const USERNAME_PROVIDER_ID = "username";
const PASSWORD_HASH_ITERATIONS = 150_000;

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

type Username = {
  display: string;
  normalized: string;
};

function readFlow(value: unknown) {
  if (value === "signIn" || value === "signUp") {
    return value;
  }
  throw new ConvexError("Choose log in or sign up.");
}

function readUsername(value: unknown): Username {
  if (typeof value !== "string") {
    throw new ConvexError("Enter a username.");
  }

  const display = value.trim();
  const normalized = display.toLowerCase();
  if (!/^[a-z0-9_-]{3,32}$/.test(normalized)) {
    throw new ConvexError(
      "Use 3-32 letters, numbers, underscores, or hyphens.",
    );
  }

  return { display, normalized };
}

function readPassword(value: unknown) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) {
    throw new ConvexError("Use a password with 8-128 characters.");
  }
  return value;
}

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

async function hashSecret(password: string) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const saltHex = bytesToHex(salt);
  const hashHex = await derivePasswordHash(
    password,
    saltHex,
    PASSWORD_HASH_ITERATIONS,
  );

  return [
    "pbkdf2-sha256",
    String(PASSWORD_HASH_ITERATIONS),
    saltHex,
    hashHex,
  ].join(":");
}

async function verifySecret(password: string, storedHash: string) {
  const [algorithm, iterationsRaw, saltHex, expectedHashHex] =
    storedHash.split(":");
  const iterations = Number(iterationsRaw);
  if (
    algorithm !== "pbkdf2-sha256" ||
    !Number.isSafeInteger(iterations) ||
    iterations < 1 ||
    !saltHex ||
    !expectedHashHex
  ) {
    return false;
  }

  const actualHashHex = await derivePasswordHash(password, saltHex, iterations);
  return timingSafeEqualHex(actualHashHex, expectedHashHex);
}

async function derivePasswordHash(
  password: string,
  saltHex: string,
  iterations: number,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: hexToBytes(saltHex),
      iterations,
    },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function hexToBytes(hex: string) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Invalid hex string.");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function timingSafeEqualHex(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
