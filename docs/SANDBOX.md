# Sandbox

Last updated: 2026-06-04

This is the high-level map for Drip's Codex SDK execution layer. It names the
contracts, commands, and source files for the prepared Vercel Sandbox image and
runtime control plane.

## System Map

```mermaid
flowchart LR
  UI["Next.js UI"]
  Runs["Convex sandboxRuns API"]
  DB["Convex DB<br/>sandboxRuns + sandboxRunEvents"]
  Action["Convex action<br/>startSandboxRun"]
  Image["BASE_SANDBOX_IMAGE<br/>private snapshot id"]
  Sandbox["Vercel Sandbox"]
  Runner["TypeScript runner<br/>src/sandbox/runner"]
  SDK["OpenAI Codex SDK"]

  UI -->|"create/read/list/cancel"| Runs
  Runs <--> DB
  UI -->|"start run"| Action
  Image -->|"snapshot source"| Action
  Action -->|"Sandbox.create + runCommand"| Sandbox
  Sandbox -->|"node --import tsx"| Runner
  Runner -->|"startThread + runStreamed"| SDK
  SDK -->|"events"| Runner
  Runner -->|"ConvexHttpClient mutations"| Runs
```

## Run Sequence

```mermaid
sequenceDiagram
  participant UI
  participant CX as Convex
  participant SB as Vercel Sandbox
  participant R as Runner
  participant CDX as Codex SDK

  UI->>CX: createSandboxRun(task)
  CX-->>UI: sandboxRunId
  UI->>CX: startSandboxRun(sandboxRunId)

  CX->>SB: create sandbox from BASE_SANDBOX_IMAGE
  CX->>SB: pass run env + start detached runner
  CX->>CX: status = running

  SB->>R: runner starts
  R->>CX: load task with ingest token
  R->>CDX: startThread + runStreamed(task)
  CDX-->>R: streamed events
  R->>CX: ingest events + heartbeat
  CX-->>UI: realtime updates

  R->>CX: finish succeeded / failed / cancelled
```

There are two layers:

| Layer | Purpose | Stable source |
| --- | --- | --- |
| Control plane | Stores run state, event streams, cancellation, liveness, and terminal results. | `src/convex/sandboxRuns.ts` |
| Sandbox provisioner | Creates a Vercel Sandbox, starts the detached runner command, and records sandbox/command metadata privately in Convex. | `src/convex/sandboxRunActions.ts` |
| Runner | Loads the run task, streams Codex SDK events, sends heartbeats, observes cancellation, and finishes the run. | `src/sandbox/runner/*` |
| Base image | Reusable Vercel Sandbox snapshot used by runtime provisioning. | `pnpm run setup:base-snapshot` |

Product sandbox runs use Convex mutations for runner ingest. The custom HTTP
route in `src/convex/http.ts` belongs to the Phase A prototype only.

## Control-Plane Contracts

| Caller | Function | Contract |
| --- | --- | --- |
| UI | `sandboxRuns.createSandboxRun({ workspaceId, task })` | Insert `queued`; return `{ sandboxRunId }`. |
| UI | `sandboxRunActions.startSandboxRun({ sandboxRunId })` | Generate the runner token, provision Vercel Sandbox, start the detached runner. |
| UI | `sandboxRuns.getSandboxRun({ sandboxRunId })` | Return sanitized run state without `ingestTokenHash`. |
| UI | `sandboxRuns.listSandboxRunEvents({ sandboxRunId, afterSeq? })` | Return ordered events, paged at 100. |
| UI | `sandboxRuns.cancelSandboxRun({ sandboxRunId })` | Mark cancellation; queued runs become terminal immediately. |
| Runner | `sandboxRuns.getSandboxRunForRunner({ sandboxRunId, ingestToken })` | Verify token and return task plus cancellation state. |
| Runner | `sandboxRuns.ingestSandboxRunEvent({ sandboxRunId, ingestToken, seq, type, payload })` | Append the next event, accept idempotent retries, reject sequence gaps. |
| Runner | `sandboxRuns.heartbeatSandboxRun({ sandboxRunId, ingestToken })` | Update liveness and return whether cancellation was requested. |
| Runner | `sandboxRuns.finishSandboxRun({ sandboxRunId, ingestToken, status, result?, error? })` | Store a terminal runner status and output. |

Valid statuses are `queued`, `provisioning`, `running`, `succeeded`, `failed`,
`cancelled`, and `lost`. `lost` is reserved for a future watchdog.

## Runner Interface

The snapshot-mode command is:

```bash
node --import tsx src/sandbox/runner/index.ts
```

`src/sandbox/runner/config.ts` reads the command-time env contract:

| Name | Required | Purpose |
| --- | --- | --- |
| `CONVEX_URL` | Yes | Convex URL used by `ConvexHttpClient`. |
| `SANDBOX_RUN_ID` or `RUN_ID` | Yes | Run identifier scoped to this command. |
| `INGEST_TOKEN` | Yes | Plaintext runner token; Convex stores only its hash. |
| `OPENAI_API_KEY` | Yes | Codex SDK/OpenAI auth passed only at runtime. |
| `CODEX_MODEL` | No | Defaults to `gpt-5.5`. |
| `CODEX_REASONING_EFFORT` | No | Defaults to `low`; accepts `minimal`, `low`, `medium`, `high`, `xhigh`. |
| `DRIP_HEARTBEAT_MS` | No | Defaults to 5000 ms. |
| `WORKING_DIRECTORY` | No | Defaults to the sandbox process cwd. |

The runner starts Codex SDK with approval policy `never`, web search disabled,
SDK network access disabled, and `sandboxMode: "danger-full-access"` inside
the outer Vercel Sandbox isolation boundary.

## Env Contract

Never commit or print real values for these names.

| Name | Owner | Purpose |
| --- | --- | --- |
| `BASE_SANDBOX_IMAGE` | Private local/Convex runtime config | Active Vercel Sandbox snapshot ID. Updated by the base snapshot setup command. |
| `DRIP_RUNNER_CONVEX_URL` | Convex action | Convex URL passed into the runner; usually matches the public Convex client URL. |
| `OPENAI_API_KEY` or `CODEX_API_KEY` | Convex action/runtime | OpenAI auth source. The action passes `OPENAI_API_KEY` into the runner command. |
| `VERCEL_TOKEN` or `VERCEL_OIDC_TOKEN` | Vercel Sandbox SDK | Sandbox auth. Access-token auth is passed explicitly; OIDC is read from env. |
| `VERCEL_TEAM_ID` | Vercel Sandbox SDK | Required alongside sandbox auth. |
| `VERCEL_PROJECT_ID` | Vercel Sandbox SDK | Required alongside sandbox auth. |
| `DRIP_SANDBOX_RUNTIME` | Vercel Sandbox SDK | Runtime override; default `node24`. |
| `DRIP_SANDBOX_VCPUS` | Vercel Sandbox SDK | CPU setting; default 2. |
| `DRIP_SANDBOX_TIMEOUT_MS` | Vercel Sandbox SDK | Sandbox lifetime timeout. |
| `DRIP_SANDBOX_RUNNER_TIMEOUT_MS` | Convex action | Detached runner command timeout. |
| `DRIP_SANDBOX_BOOTSTRAP` | Convex action | Set `1` to force embedded fallback bootstrap even when a base snapshot exists. |
| `DRIP_SANDBOX_INSTALL_TIMEOUT_MS` | Convex action and setup script | Dependency install timeout for fallback/setup installs. |
| `DRIP_HEARTBEAT_MS` | Runner | Heartbeat interval. |

Prototype-only env belongs to `docs/prototypes/sandbox-codex-sdk/*` and
`src/convex/sandboxPrototype.ts`; it is not part of the product run contract.

## Base Image And Setup Command

```bash
pnpm run setup:base-snapshot
```

The base image is a prepared Vercel Sandbox snapshot for Codex SDK runs. It is
the runtime starting point, not a place for task-specific state.

It exists so every run starts from the same known-good environment with source
code, runner code, and dependencies already present. That keeps the per-run
path focused on task execution: create an isolated sandbox from the snapshot,
pass only run-specific env, start the runner, and stream results back to Convex.

At a high level, the setup command copies the git-listed, non-ignored repo
inputs needed to run Codex inside the sandbox:

- App and Convex source under `src/`.
- The sandbox runner under `src/sandbox/runner/`.
- Package manifests, lockfile, and TypeScript/tooling config needed to install
  and run the runner.
- Public docs and read-only reference files that are tracked as repo context.

Ignored private/runtime files stay out of the image, including `.env*`,
`.vercel/`, `.convex/`, `node_modules/`, `.next/`, `.pnpm-store/`, `build/`,
and `out/`.

```mermaid
flowchart LR
  Setup["Local setup command"]
  Image["Prepared base image<br/>code + deps + runner"]
  Env["Runtime env<br/>run id + ingest token + secrets"]
  RunA["Sandbox run A"]
  RunB["Sandbox run B"]
  Convex["Convex<br/>events + result"]

  Setup -->|"refreshes"| Image
  Image -->|"forks"| RunA
  Image -->|"forks"| RunB
  Env -->|"passed at command start"| RunA
  Env -->|"passed at command start"| RunB
  RunA --> Convex
  RunB --> Convex
```

The boundary is intentional: reusable code and dependency state live in the
base image; secrets, prompts, ingest tokens, and model settings are injected
only when a specific run starts.

## Security Boundaries

| Boundary | Rule |
| --- | --- |
| Runner token | Plaintext exists only in the runner command env; Convex stores only the hash. |
| Public reads | `sandboxRuns.getSandboxRun` removes `ingestTokenHash`. |
| Event stream | Events are currently loose and SDK-shaped; broader exposure needs a future redaction/visibility policy. |
| Snapshot ID | `BASE_SANDBOX_IMAGE` is private runtime config, never source code or docs. |
| Prototype ingest | `src/convex/http.ts` is not used for product sandbox runs. |

## File Map

| Path | What to inspect |
| --- | --- |
| `src/convex/schema.ts` | `sandboxRuns` and `sandboxRunEvents` table shape. |
| `src/convex/sandboxRuns.ts` | Control-plane queries/mutations and runner token checks. |
| `src/convex/sandboxRunActions.ts` | Vercel Sandbox provisioning and runner command startup. |
| `src/sandbox/runner/config.ts` | Runner env parsing and defaults. |
| `src/sandbox/runner/codex.ts` | Codex SDK loop, event forwarding, cancellation, and finish handling. |
| `src/sandbox/runner/convex.ts` | Runner-side Convex client and function references. |
| `src/sandbox/runner/embedded.ts` | Bootstrap fallback used when no base snapshot is configured or bootstrap is forced. |
| `docs/prototypes/sandbox-codex-sdk/` | Prototype-only tutorial code and env surface. |
