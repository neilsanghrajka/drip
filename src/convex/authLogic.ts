import { ConvexError } from "convex/values";

export const PASSWORD_HASH_ITERATIONS = 150_000;

export type Username = {
  display: string;
  normalized: string;
};

export function readFlow(value: unknown) {
  if (value === "signIn" || value === "signUp") {
    return value;
  }
  throw new ConvexError("Choose log in or sign up.");
}

export function readUsername(value: unknown): Username {
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

export function readPassword(value: unknown) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) {
    throw new ConvexError("Use a password with 8-128 characters.");
  }
  return value;
}

export async function hashSecret(password: string) {
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

export async function verifySecret(password: string, storedHash: string) {
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

export function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function hexToBytes(hex: string) {
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
