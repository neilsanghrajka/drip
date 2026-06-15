/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as dropActions from "../dropActions.js";
import type * as drops from "../drops.js";
import type * as http from "../http.js";
import type * as maintenance from "../maintenance.js";
import type * as sandboxPrototype from "../sandboxPrototype.js";
import type * as sandboxRunActions from "../sandboxRunActions.js";
import type * as sandboxRuns from "../sandboxRuns.js";
import type * as smoke from "../smoke.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  dropActions: typeof dropActions;
  drops: typeof drops;
  http: typeof http;
  maintenance: typeof maintenance;
  sandboxPrototype: typeof sandboxPrototype;
  sandboxRunActions: typeof sandboxRunActions;
  sandboxRuns: typeof sandboxRuns;
  smoke: typeof smoke;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
