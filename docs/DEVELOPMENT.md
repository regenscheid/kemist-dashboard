# Development

## Prerequisites

- **Node 20+** (ideally 20.19+ to match Vite's preferred baseline)
- **pnpm 10+** (enabled via `corepack enable` or `npm i -g pnpm`)
- **AWS CLI v2** only needed when running the data fetch pipeline
  against live S3. Unit tests, type-check, and build all run offline.

## First-time setup

```sh
git clone https://github.com/regenscheid/kemist-dashboard
cd kemist-dashboard
pnpm install
pnpm dev                      # http://localhost:5173/
```

## Project layout

| Path | What lives there |
|---|---|
| `src/main.tsx` | App entry. Registers the TanStack Router instance. |
| `src/routes/` | File-based routes. TanStack Router's Vite plugin emits `src/routeTree.gen.ts` from this directory on every build. |
| `src/routes/__root.tsx` | App shell: nav header + `<Outlet />`. Later holds `<ProvenanceStrip>`. |
| `src/components/` | Reusable UI (`TriState`, `TriStateText`, `TriStateSegment`, `ThreeBucketStat`, charts). Land in PR 2+. |
| `src/lib/triState.ts` | Canonical tri-state helpers. **Every observation rendering must route through these.** Lands in PR 2. |
| `src/data/` | Schema types, transform, scope inference. Lands in PRs 2–3. |
| `src/db/` | Dexie cache schema + aggregate lookups. Lands in PR 5. |
| `public/data/` | Scan artifacts pulled from S3 at deploy time. Never committed. |
| `scripts/` | Node scripts for bootstrapping IAM (`bootstrap-dashboard.sh`) and fetching/transforming scan data (`fetch-scan.ts`). Land in PR 3. |
| `fixtures/` | Canonical tri-state edge-case records for tests. Lands in PR 2. |

## Common tasks

```sh
pnpm dev                      # Vite dev server with HMR
pnpm build                    # Production build to dist/ (runs typecheck first)
pnpm preview                  # Serve dist/ locally

pnpm lint                     # ESLint
pnpm typecheck                # tsc -b --noEmit
pnpm test                     # Vitest (unit, run-once)
pnpm test:watch               # Vitest watch mode
pnpm test:ui                  # Vitest UI (browser-based runner)
pnpm e2e                      # Playwright end-to-end tests (land in PR 2+)
```

## Path prefix for GitHub Pages

The deployed site serves under `/kemist-dashboard/`. That prefix is
wired into `vite.config.ts`'s `base` option (applied at build time
only, not during `pnpm dev`) and into the router's `basepath` via
`import.meta.env.BASE_URL`. Relative asset URLs, `Link` components,
and `fetch("/data/...")` calls must respect `BASE_URL` — use the
router's `<Link>` or compute URLs via `import.meta.env.BASE_URL`
rather than hardcoding leading slashes.

## Adding a route

1. Create `src/routes/<segment>.tsx`. Use dots in filenames to nest
   (e.g. `scans.$date.domains.$target.tsx`).
2. Export a `Route` built with `createFileRoute("/<path>")`.
3. The TanStack Router Vite plugin updates `routeTree.gen.ts`
   automatically — no manual registration.

## Adding a dependency

```sh
pnpm add <pkg>                # runtime
pnpm add -D <pkg>             # dev-only
```

Keep `pnpm-lock.yaml` committed; CI installs with `--frozen-lockfile`.

## Testing philosophy

- **Vitest** for components + helpers. Every `TriState` variant and
  every aggregate function has a fixture-driven test.
- **Playwright** for route-level assertions and the deploy-time schema
  fixture round-trip.
- **ESLint rule** (PR 2) blocks direct `.value` reads on
  schema-observation types. This is the guardrail that prevents
  accidental tri-state collapsing.

## Pattern A

Never introduce words like `weak`, `strong`, `secure`, `insecure`,
`compliant`, `recommended` into any UI string. The dashboard records
observations; policy evaluation happens elsewhere. Copy from the
scanner's README (`records observations, not verdicts`) is
deliberate — reuse that language.
