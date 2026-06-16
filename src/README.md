# Source

Drip app source. The sandbox runtime payload lives in the top-level `sandbox/` folder, not here.

- `app/` - Next.js App Router pages: landing page, dashboard, and campaign cockpit.
- `components/` - Shared React components (`ui/` primitives).
- `convex/` - Convex schema and functions, including the sandbox run control plane; see `docs/CONVEX.md` and `docs/BACKEND.md`.
- `lib/` - Shared utilities.
- `sandbox/`, `codex-agent/` - Empty legacy locations; their contents moved to top-level `sandbox/`, the sandbox runner integration described in `docs/SANDBOX.md`.
