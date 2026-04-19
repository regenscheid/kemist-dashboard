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

## Quickstart

```sh
pnpm install
pnpm dev                      # http://localhost:5173/
```

Other scripts:

```sh
pnpm test                     # Vitest (unit tests)
pnpm test:ui                  # Vitest UI mode
pnpm lint                     # ESLint
pnpm typecheck                # tsc --noEmit
pnpm build                    # Vite production build to dist/
pnpm preview                  # Serve dist/ locally
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full toolchain, data
pipeline, and how to add a route or component.

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
