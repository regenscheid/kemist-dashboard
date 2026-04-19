# kemist-dashboard

Static site that publishes observations from the
[kemist](https://github.com/regenscheid/kemist-scanner) TLS + PQC scanner.
Deployed as a GitHub Pages project site at
`https://regenscheid.github.io/kemist-dashboard/`, with data produced by the
weekly [kemist-orchestrator](https://github.com/regenscheid/kemist-orchestrator)
Fargate scan pipeline.

Three views:

- **Summary** — fleet-level posture: TLS version adoption, PQC hybrid support,
  certificate issuer distribution. Three-bucket reporting (affirmative /
  explicit-negative / unknown) — never collapses unknowns into negatives.
- **Domains** — filterable, virtualized table of every scanned target. Click a
  row to drill into the full record.
- **Per-domain detail** — rendered schema-v1 record with tri-state fidelity:
  protocol versions probed, cipher suites, key-exchange groups (classical and
  PQC hybrids), extensions, certificate chain, validation, errors.

## Pattern A

This dashboard visualizes observations. It does not grade, rank, or judge.
Words like "weak", "strong", "insecure", "compliant" never appear in the UI.
Policy evaluation lives in downstream projects that consume the scanner's JSON
output.

## Stack

- Vite + React 19 + TypeScript (strict)
- [TanStack Router](https://tanstack.com/router) — file-based routing, URL
  state for filters
- [TanStack Table](https://tanstack.com/table) + [TanStack Virtual](https://tanstack.com/virtual)
  — virtualized filterable domain table
- [Dexie](https://dexie.org/) — IndexedDB client-side cache of scan data
- [ECharts](https://echarts.apache.org/) — summary charts
- [Tailwind CSS v4](https://tailwindcss.com/) — utility-first styling
- Vitest + Playwright — unit + e2e tests

## Quickstart — local dev

```sh
nvm use                       # activates Node pinned in .nvmrc
pnpm install
pnpm fetch:local              # populates public/data/ from fixture
pnpm dev                      # http://localhost:5173/
```

Other scripts:

```sh
pnpm test                     # Vitest (unit tests)
pnpm test:ui                  # Vitest UI mode
pnpm e2e                      # Playwright + axe-core a11y tests
pnpm lint                     # ESLint
pnpm typecheck                # tsc --noEmit
pnpm build                    # Vite production build to dist/
pnpm preview                  # Serve dist/ locally
pnpm schema:generate          # Regenerate src/data/schema.ts from schemas/output-v1.json
pnpm fetch:s3                 # Pull latest scan from S3 (needs AWS creds)
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full toolchain, data
pipeline, and how to add a route or component.

## Deployment — one-time setup

The site deploys automatically via
[.github/workflows/deploy.yml](.github/workflows/deploy.yml) every Sunday
at 04:00 UTC (two hours after the orchestrator scan fires). Setup needed
once per AWS account:

1. **Provision the reader IAM role** against the orchestrator's AWS
   account:
   ```sh
   ./scripts/bootstrap-dashboard.sh
   ```
   Idempotent. Creates `kemist-dashboard-reader` with read-only S3
   access to the scan corpus and `sns:Publish` on the alerts topic.
   Prints the role ARN when done.

2. **Enable GitHub Pages** for this repo:
   - Settings → Pages → Build and deployment → Source: **GitHub Actions**.

3. **Add repo secrets** at
   `https://github.com/regenscheid/kemist-dashboard/settings/secrets/actions`:
   - `AWS_DASHBOARD_READER_ROLE_ARN` — ARN from step 1.
   - `DATA_BUCKET` — e.g.
     `kemist-fleet-data-<account>-us-east-1`.

4. **Push a commit to main** (or run the workflow manually) to trigger
   the first deploy.

Build failures (schema mismatch, manifest drift, etc.) publish to the
`kemist-fleet-alerts` SNS topic — same path as orchestrator failures,
so on-call operators see them through their existing subscription.

## Scope expansion

v0 scans the CISA federal `.gov` feed only (scope tagging from TLD).
Adding cohorts is a two-step change:

1. Upstream — update the orchestrator's `refresh_targets` Lambda to
   pull additional lists into its target set (commercial top-1M,
   HSTS preload, etc.).
2. Here — extend `src/data/scope.ts` with a new `Scope` value and
   update `inferScope()` to map domains to it, OR layer a committed
   `scopes.yaml` on top of the TLD inference for specific
   overrides. Filter UIs and charts pick up the new scope
   automatically from `ScopeAggregates`.

## Opt-out

Domain owners who would like their domain removed from future scans can file an
issue in the kemist-orchestrator repository or email the operator. The
orchestrator honors an opt-out list at
`s3://kemist-fleet-data-…/targets/opt-out.txt`; additions take effect on the
next weekly scan. The opt-out process is documented further in
[docs/OPT_OUT.md](docs/OPT_OUT.md) (added in PR 7).

## License

Dual-licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT license ([LICENSE-MIT](LICENSE-MIT))

at your option. Matches the kemist scanner's license.
