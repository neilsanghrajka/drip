import type { DropStage } from "./dropLogic";

export function collectWorkspaceImagePaths(value: unknown): string[] {
  if (typeof value === "string") {
    return value.startsWith("/vercel/sandbox/agent-workspace/") &&
      /\.(png|jpe?g|webp)$/i.test(value)
      ? [value]
      : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectWorkspaceImagePaths);
  }
  if (isRecord(value)) {
    return Object.values(value).flatMap(collectWorkspaceImagePaths);
  }
  return [];
}

export function summarizeStageOutput(stage: DropStage, outputJson: unknown) {
  const root = isRecord(outputJson) ? outputJson : {};
  switch (stage) {
    case "scout":
      return {
        candidateCount: Array.isArray(root.candidates) ? root.candidates.length : 0,
      };
    case "designer":
      return {
        ideaCount: Array.isArray(root.ideas) ? root.ideas.length : 0,
        conceptCount: Array.isArray(root.concepts) ? root.concepts.length : 0,
      };
    case "marketer":
      return {
        adSetCount: Array.isArray(root.adSets) ? root.adSets.length : 0,
        adCount: Array.isArray(root.ads) ? root.ads.length : 0,
      };
    case "builder": {
      const site = isRecord(root.site) ? root.site : {};
      return {
        deploymentUrl:
          typeof site.deploymentUrl === "string" ? site.deploymentUrl : null,
      };
    }
  }
}

export function contentTypeForPath(filePath: string) {
  if (/\.png$/i.test(filePath)) {
    return "image/png";
  }
  if (/\.webp$/i.test(filePath)) {
    return "image/webp";
  }
  return "image/jpeg";
}

export function normalizeError(error: unknown, code: string) {
  return {
    message: error instanceof Error ? error.message : String(error),
    code,
  };
}

export function normalizeSandboxProvisioningError(
  error: unknown,
  fallbackCode: string,
) {
  const status = httpStatus(error);
  if (status === 402) {
    return {
      message:
        "Vercel Sandbox creation is blocked for the configured team/project (HTTP 402). Check Sandbox entitlement, billing/quota, and VERCEL_TEAM_ID/VERCEL_PROJECT_ID scope, then retry.",
      code: "vercel_sandbox_scope_or_entitlement",
    };
  }
  if (status === 403) {
    return {
      message:
        "Vercel Sandbox creation is forbidden for the configured team/project (HTTP 403). Check the Vercel token permissions and sandbox scope, then retry.",
      code: "vercel_sandbox_forbidden",
    };
  }
  return normalizeError(error, fallbackCode);
}

export function httpStatus(error: unknown) {
  if (!isRecord(error)) {
    return null;
  }
  const response = error.response;
  if (!isRecord(response)) {
    return null;
  }
  if (typeof response.status === "number") {
    return response.status;
  }
  if (typeof response.statusCode === "number") {
    return response.statusCode;
  }
  return null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
