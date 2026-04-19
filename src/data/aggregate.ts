/**
 * Build the `<date>/aggregates.json` payload the summary dashboard
 * reads. Pure function over `DomainRow[]`; no I/O.
 *
 * Every rate-like aggregate emits three buckets (affirmative /
 * explicit_negative / unknown). The three distinct counts are
 * published even when a bare percentage would be convenient — see
 * docs/AGGREGATION_RULES.md for the rationale.
 */

import type { DomainRow } from "./domainRow";
import type { Scope } from "./scope";
import type { TriStateObservation } from "./domainRow";
import {
  classify,
  type TriStateClass,
} from "../lib/triState";
import {
  emptyCounts,
  type TriStateCounts,
} from "../components/TriStateSegment";

export type ScanAggregates = {
  scan_date: string;
  generated_at: string;
  total_records: number;
  /** Always present, may be empty. Rendered in the provenance strip. */
  warnings: string[];
  /**
   * For each scope (including "__all"), counts + facets that power
   * the summary cards + ECharts distributions on that scope.
   */
  by_scope: Record<string, ScopeAggregates>;
  scopes_present: Scope[];
};

export type ScopeAggregates = {
  total: number;
  /** Per-card tri-state counts with a stated denominator. */
  handshake_success: ThreeBucket;
  tls_1_3_of_all: ThreeBucket;
  pqc_hybrid_of_tls13: ThreeBucket;
  pqc_hybrid_of_all: ThreeBucket;
  pqc_signature: { yes: number; no: number };
  /** Per-distribution breakdowns. */
  tls_versions: Record<string, number>;
  kx_groups: Record<string, number>;
  ciphers: Record<string, number>;
  cert_issuers: Record<string, number>;
  error_categories: Record<string, number>;
  /** TriStateCounts for server_enforces_order-style fields (if we
   *  expand this list later). Currently populated as empty-counts. */
  misc_observations: Record<string, TriStateCounts>;
};

export type ThreeBucket = {
  affirmative: number;
  explicit_negative: number;
  unknown: number;
  denominator_label: string;
};

const ALL_SCOPE_KEY = "__all" as const;

/**
 * Top-level aggregator. Walks rows once per scope dimension and
 * produces per-scope roll-ups; the "__all" key collapses across
 * scopes for the default view.
 */
export function buildAggregates(
  rows: DomainRow[],
  scan_date: string,
  warnings: string[],
): ScanAggregates {
  const scopes = new Set<Scope>(rows.map((r) => r.scope));
  const byScope: Record<string, ScopeAggregates> = {};

  byScope[ALL_SCOPE_KEY] = buildScopeAggregate(rows);
  for (const s of scopes) {
    byScope[s] = buildScopeAggregate(rows.filter((r) => r.scope === s));
  }

  return {
    scan_date,
    generated_at: new Date().toISOString(),
    total_records: rows.length,
    warnings,
    by_scope: byScope,
    scopes_present: [...scopes].sort(),
  };
}

function buildScopeAggregate(rows: DomainRow[]): ScopeAggregates {
  const tlsVersions: Record<string, number> = {};
  const kxGroups: Record<string, number> = {};
  const ciphers: Record<string, number> = {};
  const certIssuers: Record<string, number> = {};
  const errorCategories: Record<string, number> = {};

  let pqcSigYes = 0;
  let pqcSigNo = 0;

  let handshakeAffirm = 0;
  let handshakeNeg = 0;
  let handshakeUnk = 0;

  let tls13Affirm = 0;
  let tls13Explicit = 0;
  let tls13Unk = 0;

  let pqcHybridAllAffirm = 0;
  let pqcHybridAllExplicit = 0;
  let pqcHybridAllUnk = 0;

  let pqcHybridOfTls13Affirm = 0;
  let pqcHybridOfTls13Explicit = 0;
  let pqcHybridOfTls13Unk = 0;

  for (const row of rows) {
    // Handshake success (scalar-ish bool | null).
    if (row.handshake_succeeded === true) handshakeAffirm += 1;
    else if (row.handshake_succeeded === false) handshakeNeg += 1;
    else handshakeUnk += 1;

    // TLS 1.3 negotiated-of-all. Only probe-true if actually
    // negotiated; everything else is "not 1.3". We split on the
    // exact wire-level string kemist emits.
    if (row.tls_version === "TLSv1.3" || row.tls_version === "TLSv1_3") {
      tls13Affirm += 1;
    } else if (row.tls_version) {
      tls13Explicit += 1;
    } else {
      tls13Unk += 1;
    }

    // PQC hybrid is full tri-state.
    const hybridCls = classifyObservation(row.pqc_hybrid);
    if (hybridCls === "affirmative") pqcHybridAllAffirm += 1;
    else if (hybridCls === "explicit_negative") pqcHybridAllExplicit += 1;
    else pqcHybridAllUnk += 1;

    // PQC hybrid among TLS 1.3 handshakes (denominator-restricted).
    if (row.tls_version === "TLSv1.3" || row.tls_version === "TLSv1_3") {
      if (hybridCls === "affirmative") pqcHybridOfTls13Affirm += 1;
      else if (hybridCls === "explicit_negative")
        pqcHybridOfTls13Explicit += 1;
      else pqcHybridOfTls13Unk += 1;
    }

    if (row.pqc_signature) pqcSigYes += 1;
    else pqcSigNo += 1;

    // Distribution buckets — `?? "(unknown)"` so the Unknown bucket
    // is visible rather than dropping the row. Chart renderers can
    // style "(unknown)" distinctly.
    incr(tlsVersions, row.tls_version ?? "(unknown)");
    incr(kxGroups, row.kx_group ?? "(unknown)");
    incr(ciphers, row.cipher ?? "(unknown)");
    incr(certIssuers, row.cert_issuer_cn ?? "(unknown)");
    incr(errorCategories, row.top_error_category ?? "(none)");
  }

  return {
    total: rows.length,
    handshake_success: {
      affirmative: handshakeAffirm,
      explicit_negative: handshakeNeg,
      unknown: handshakeUnk,
      denominator_label: "all scanned targets",
    },
    tls_1_3_of_all: {
      affirmative: tls13Affirm,
      explicit_negative: tls13Explicit,
      unknown: tls13Unk,
      denominator_label: "all scanned targets",
    },
    pqc_hybrid_of_all: {
      affirmative: pqcHybridAllAffirm,
      explicit_negative: pqcHybridAllExplicit,
      unknown: pqcHybridAllUnk,
      denominator_label: "all scanned targets",
    },
    pqc_hybrid_of_tls13: {
      affirmative: pqcHybridOfTls13Affirm,
      explicit_negative: pqcHybridOfTls13Explicit,
      unknown: pqcHybridOfTls13Unk,
      denominator_label: "TLS 1.3 handshakes only",
    },
    pqc_signature: { yes: pqcSigYes, no: pqcSigNo },
    tls_versions: tlsVersions,
    kx_groups: kxGroups,
    ciphers,
    cert_issuers: certIssuers,
    error_categories: errorCategories,
    misc_observations: emptyMiscCounts(),
  };
}

function classifyObservation(obs: TriStateObservation): TriStateClass {
  return classify(obs);
}

function incr(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function emptyMiscCounts(): Record<string, TriStateCounts> {
  // Reserved for observation-specific distributions added later
  // (e.g. `server_enforces_order`). Kept in the shape so chart
  // readers don't have to special-case an absent key.
  return { __placeholder: emptyCounts() };
}
