# Changelog

All notable changes to kemist-dashboard are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); version
numbers follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Negative-polarity observations no longer render the secure outcome as a
  red "Rejected".** `statusLabel()` and `toneFor()` mapped `value: true` to
  green/"Supported" and `value: false` to red/"Rejected" for every field. That
  holds only where `true` is the better posture. For renegotiation and two
  deprecated extensions `true` is the *worse* posture, so the compliant result
  — which is what nearly every host returns — was painted as a finding:

  | Field | Was | Now |
  |---|---|---|
  | `renegotiation_behavior.client_initiated.accepted` | red "Rejected" | green "Refused by server" |
  | `renegotiation_behavior.server_initiated.observed` | red "Rejected" | green "Not observed" |
  | `extensions.truncated_hmac` | red "Rejected" | green "Not negotiated" |
  | `extensions.heartbeat_present` | red "Rejected" | green "Absent" |

  `<TriStateText>` takes `polarity` and `labels` props; `toneFor()` and
  `statusLabel()` take optional polarity arguments. Both default to the
  previous behavior, so positive-polarity call sites are unchanged. This
  extends the per-field treatment `BehavioralProbesSection` already applied
  to HRR, ROBOT, and Raccoon to the fields that were missed.

  "Server-initiated observed → Rejected" was doubly wrong: nothing was
  rejected, and the probe is passive — it only watches for a HelloRequest.
  Both renegotiation rows are relabeled accordingly.

### Added

- Repository scaffold: Vite + React + TypeScript, TanStack Router file-based
  routing, Tailwind CSS v4, Vitest + Playwright test runners, ESLint. Four stub
  routes: `/`, `/domains`, `/scans/$date/domains/$target`, `/about`.
- CI workflow (lint, typecheck, unit tests, build) on pull requests and pushes
  to main.
- Dual MIT / Apache-2.0 licensing matching sibling projects.
