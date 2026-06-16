import { describe, expect, it } from "vitest";

import {
  collectWorkspaceImagePaths,
  contentTypeForPath,
  httpStatus,
  normalizeError,
  normalizeSandboxProvisioningError,
  summarizeStageOutput,
} from "../../../src/convex/artifactLogic";

describe("artifact logic", () => {
  it("recursively collects only raster image paths from the sandbox workspace", () => {
    expect(
      collectWorkspaceImagePaths({
        keep: "/vercel/sandbox/agent-workspace/assets/a.PNG",
        nested: [
          "/vercel/sandbox/agent-workspace/assets/b.webp",
          "/tmp/ignore.jpg",
          "/vercel/sandbox/agent-workspace/assets/not-svg.svg",
        ],
      }),
    ).toEqual([
      "/vercel/sandbox/agent-workspace/assets/a.PNG",
      "/vercel/sandbox/agent-workspace/assets/b.webp",
    ]);
  });

  it("summarizes stage outputs", () => {
    expect(summarizeStageOutput("scout", { candidates: [{}, {}] })).toEqual({
      candidateCount: 2,
    });
    expect(summarizeStageOutput("designer", { ideas: [{}], concepts: [{}, {}] })).toEqual({
      ideaCount: 1,
      conceptCount: 2,
    });
    expect(summarizeStageOutput("marketer", { adSets: [{}], ads: [{}, {}] })).toEqual({
      adSetCount: 1,
      adCount: 2,
    });
    expect(
      summarizeStageOutput("builder", {
        site: { deploymentUrl: "https://drop.example" },
      }),
    ).toEqual({ deploymentUrl: "https://drop.example" });
  });

  it("maps content types by file extension", () => {
    expect(contentTypeForPath("image.png")).toBe("image/png");
    expect(contentTypeForPath("image.WEBP")).toBe("image/webp");
    expect(contentTypeForPath("image.jpeg")).toBe("image/jpeg");
    expect(contentTypeForPath("image.unknown")).toBe("image/jpeg");
  });

  it("normalizes sandbox provisioning errors", () => {
    expect(httpStatus({ response: { status: 402 } })).toBe(402);
    expect(httpStatus({ response: { statusCode: 403 } })).toBe(403);
    expect(normalizeSandboxProvisioningError({ response: { status: 402 } }, "fallback")).toEqual({
      message:
        "Vercel Sandbox creation is blocked for the configured team/project (HTTP 402). Check Sandbox entitlement, billing/quota, and VERCEL_TEAM_ID/VERCEL_PROJECT_ID scope, then retry.",
      code: "vercel_sandbox_scope_or_entitlement",
    });
    expect(normalizeSandboxProvisioningError({ response: { status: 403 } }, "fallback")).toEqual({
      message:
        "Vercel Sandbox creation is forbidden for the configured team/project (HTTP 403). Check the Vercel token permissions and sandbox scope, then retry.",
      code: "vercel_sandbox_forbidden",
    });
    expect(normalizeError(new Error("bad"), "artifact_collection_failed")).toEqual({
      message: "bad",
      code: "artifact_collection_failed",
    });
  });
});
