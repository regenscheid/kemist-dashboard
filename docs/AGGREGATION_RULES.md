# Aggregation rules

The kemist-dashboard's load-bearing guarantee: summary numbers and
chart series never collapse unknown observations into negatives.
This document is the single canonical reference for *how* we
aggregate — each summary card's info-icon links here.

## The three-bucket rule

For any yes/no observation across N domains, every aggregate produces
three counts, not a single percentage:

| Bucket | Predicate (from `src/lib/triState.ts`) |
|---|---|
| **Affirmative** | `isAffirmative(obs)` — probe + true, or connection_state + true |
| **Explicit negative** | `isExplicitNegative(obs)` — probe + false, or connection_state + false |
| **Unknown** | `isUnknown(obs)` — any of `not_probed`, `not_applicable`, `error` |

A summary card displays all three: **"742 / 1200 supported, 89
unknown (52 error, 37 not_probed)"**. Never a bare "56% support PQC".

Every distribution chart renders the Unknown count as an explicit
stacked segment with its own legend entry. When the unknown bucket
would be dropped for visual reasons (e.g. a treemap), the card
beside the chart surfaces the unknown count in text so it's never
lost.

## Denominator policy

The numerator is always `affirmative`. The denominator is
question-dependent and MUST be stated on the card:

- **"Of TLS 1.3 handshakes, how many offer hybrid PQC?"** —
  denominator is the set of domains where
  `negotiated.version === "TLSv1_3"`. Best for "modern web PQC
  footprint" headlines. Excludes connection failures and non-TLS-1.3
  servers from both numerator and denominator.

- **"Of all scanned targets, how many negotiated TLS 1.3?"** —
  denominator is the full scanned set. Best for fleet posture.
  Connection failures drag the rate down, and that is a feature: the
  card shows the unknown count so viewers can see the drag
  explicitly.

A card always states its denominator in the subtitle. Never infer.

## Canonical field paths after schema unification

The scanner now publishes one canonical answer for cipher-suite and
KX-group support:

- cipher suites live under tls.cipher_suites.tls1_0 / tls1_1 /
  tls1_2 / tls1_3
- group support lives under tls.groups.tls1_2 and tls.groups.tls1_3
- each entry may carry a provider tag of aws_lc_rs or openssl for
  attribution

The dashboard currently uses those merged paths directly and keeps
summary counts provider-agnostic unless a future product requirement
calls for a provider split.

## Build-time consistency checks (hard fail / soft warn)

`scripts/fetch-scan.ts` (lands in PR 3) enforces these rules against
the freshly pulled S3 data before the Vite build runs. Failing a
check either aborts the deploy (HARD FAIL) or annotates the
aggregates with a warning banner (SOFT WARN).

### HARD FAIL (deploy aborts, SNS alert fires)

- `semver.major(record.schema_version) !== 1` on any record.
- `manifest.json` references a batch file that doesn't exist, or a
  batch file exists that isn't in the manifest.
- Duplicate `target` entries across batches for the same scan date.
- Malformed NDJSON (any un-parseable line).
- `capabilities.provider_kx_groups` differs between batches in the
  same scan. This is a per-scan invariant: when it drifts, the PQC
  aggregates become meaningless because different batches probed
  different group sets. Fail loudly rather than publish skewed
  numbers.

### SOFT WARN (deploy succeeds, `<ProvenanceStrip>` surfaces banner)

- Mixed `scanner.version` (including patch bumps) across batches.
- Differing `capabilities.enabled_features` across batches.
- Differing `capabilities.provider_cipher_suites` across batches.

Soft warnings land in `aggregates.warnings` and the
`<ProvenanceStrip>` renders a prominent banner.

## Never-emitted vocabulary

Copied from the scanner's [README](https://github.com/regenscheid/kemist-scanner),
preserved here to prevent drift.

The scanner — and by extension, this dashboard — will never emit:

- Compliance verdicts, grades, severity rankings, pass/fail judgments.
- Fields or labels named `weak`, `strong`, `compliant`,
  `recommended`, `insecure`, `secure`.

These words are not in the schema and must not appear in the UI. If
you catch yourself writing one, stop — the observation belongs in
the user's policy layer, not ours.

## Discipline

The [ESLint rule in `eslint.config.js`](../eslint.config.js) forbids
direct `.value` / `.offered` / `.supported` reads outside of the
helper module and generated code. The rule catches the most common
accidental tri-state collapse at code-review time.

Tests under `src/lib/triState.test.ts` exhaustively cover every
`TriStateClass` bucket across all four schema shapes. A regression in
the classifier shows up as a failed test, not a subtle aggregation
bug in production.
