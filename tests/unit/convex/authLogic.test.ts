import { describe, expect, it } from "vitest";

import {
  bytesToHex,
  hashSecret,
  hexToBytes,
  readFlow,
  readPassword,
  readUsername,
  verifySecret,
} from "../../../src/convex/authLogic";

describe("auth logic", () => {
  it("normalizes valid usernames and rejects invalid usernames", () => {
    expect(readUsername("  Neil_S  ")).toEqual({
      display: "Neil_S",
      normalized: "neil_s",
    });

    expect(() => readUsername("ab")).toThrow(
      "Use 3-32 letters, numbers, underscores, or hyphens.",
    );
    expect(() => readUsername("bad name")).toThrow(
      "Use 3-32 letters, numbers, underscores, or hyphens.",
    );
    expect(() => readUsername(null)).toThrow("Enter a username.");
  });

  it("validates auth flow and password bounds", () => {
    expect(readFlow("signIn")).toBe("signIn");
    expect(readFlow("signUp")).toBe("signUp");
    expect(() => readFlow("reset")).toThrow("Choose log in or sign up.");

    expect(readPassword("12345678")).toBe("12345678");
    expect(() => readPassword("short")).toThrow("Use a password with 8-128 characters.");
    expect(() => readPassword("x".repeat(129))).toThrow(
      "Use a password with 8-128 characters.",
    );
  });

  it("hashes and verifies passwords using the stored hash format", async () => {
    const stored = await hashSecret("correct horse battery staple");

    expect(stored).toMatch(/^pbkdf2-sha256:150000:[0-9a-f]{32}:[0-9a-f]{64}$/);
    await expect(verifySecret("correct horse battery staple", stored)).resolves.toBe(
      true,
    );
    await expect(verifySecret("wrong password", stored)).resolves.toBe(false);
    await expect(verifySecret("correct horse battery staple", "bad:hash")).resolves.toBe(
      false,
    );
  });

  it("round-trips hex helpers and rejects malformed hex", () => {
    const bytes = new Uint8Array([0, 15, 16, 255]);

    expect(bytesToHex(bytes)).toBe("000f10ff");
    expect([...hexToBytes("000f10ff")]).toEqual([0, 15, 16, 255]);
    expect(() => hexToBytes("0")).toThrow("Invalid hex string.");
    expect(() => hexToBytes("zz")).toThrow("Invalid hex string.");
  });
});
