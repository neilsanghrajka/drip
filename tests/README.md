# Tests

Drip keeps test code in this top-level `tests/` directory so the test surface is
obvious at a glance.

## Unit Tests

`tests/unit/` contains fast, deterministic Vitest tests for pure logic. These
tests are safe to run for every code change:

```bash
pnpm test
pnpm test:unit
pnpm test:watch
```

## Smoke Tests

`tests/smoke/` contains stateful smoke harnesses that may call Convex, Vercel
Sandbox, and private runtime configuration from `.env`. They are intentionally
not part of the default `pnpm test` command.

Run the sandbox smoke explicitly:

```bash
pnpm test:smoke:sandbox -- --scenario fashion-designer-product
```

The historical alias still works:

```bash
pnpm e2e:sandbox -- --scenario fashion-designer-product
```
