import {
  httpRouter,
  makeFunctionReference,
} from "convex/server";
import type { FunctionReference } from "convex/server";

import { auth } from "./auth";
import { httpAction } from "./_generated/server";

const http = httpRouter();
const ingestInternal = makeFunctionReference<"mutation">(
  "sandboxPrototype:ingestInternal",
) as unknown as FunctionReference<"mutation", "internal">;

auth.addHttpRoutes(http);

http.route({
  path: "/sandbox-prototype/ingest",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expectedToken = process.env.SANDBOX_PROTOTYPE_INGEST_TOKEN;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
    }

    const authorization = request.headers.get("authorization");
    const bearerToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : undefined;
    const hostAuthorized = Boolean(
      expectedToken && authorization === `Bearer ${expectedToken}`,
    );

    if (!hostAuthorized && !bearerToken) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    try {
      await ctx.runMutation(ingestInternal, {
        ...(body as Record<string, unknown>),
        runnerIngestToken: hostAuthorized ? undefined : bearerToken,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown ingest failure";
      if (message === "Unauthorized runner ingest") {
        return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
      }
      return jsonResponse({ ok: false, error: message }, 400);
    }

    return jsonResponse({ ok: true }, 200);
  }),
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

export default http;
