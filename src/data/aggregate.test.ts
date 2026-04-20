import { describe, expect, it } from "vitest";
import type { DomainRow } from "./domainRow";
import { buildAggregates } from "./aggregate";

// Compact factory for crafted DomainRows — saves boilerplate for the
// aggregator's edge cases.
function row(overrides: Partial<DomainRow> = {}): DomainRow {
  return {
    target: "example.gov:443",
    host: "example.gov",
    port: 443,
    scan_date: "2026-04-19",
    scope: "federal-gov",
    batch_id: "batch-001",
    handshake_succeeded: true,
    tls_version: "TLSv1.3",
    supported_tls_versions: ["TLS 1.2", "TLS 1.3"],
    max_supported_tls_version: "TLS 1.3",
    cipher: "TLS13_AES_256_GCM_SHA384",
    kx_group: "X25519",
    kx_support_types: ["ecc"],
    alpn: "h2",
    pqc_hybrid: { value: false, method: "probe" },
    pqc_signature: false,
    cert_issuer_cn: "Let's Encrypt",
    cert_expiry: "2026-06-01T00:00:00Z",
    cert_validity_days: 90,
    chain_valid: { value: true, method: "probe" },
    name_matches_sni: { value: true, method: "probe" },
    error_count: 0,
    top_error_category: null,
    scanner_version: "0.1.0",
    ...overrides,
  };
}

describe("buildAggregates — tri-state invariants", () => {
  it("always emits three-bucket counts per rate-like card", () => {
    const rows = [
      row({ pqc_hybrid: { value: true, method: "probe" } }),
      row({ pqc_hybrid: { value: false, method: "probe" } }),
      row({
        pqc_hybrid: {
          value: null,
          method: "not_probed",
          reason: "x",
        },
      }),
    ];
    const agg = buildAggregates(rows, "2026-04-19", []);
    const all = agg.by_scope.__all;
    expect(all).toBeDefined();
    expect(all?.pqc_hybrid_of_all.affirmative).toBe(1);
    expect(all?.pqc_hybrid_of_all.explicit_negative).toBe(1);
    expect(all?.pqc_hybrid_of_all.unknown).toBe(1);
    // Three counts sum to the total — no silent collapsing anywhere.
    expect(
      (all?.pqc_hybrid_of_all.affirmative ?? 0) +
        (all?.pqc_hybrid_of_all.explicit_negative ?? 0) +
        (all?.pqc_hybrid_of_all.unknown ?? 0),
    ).toBe(rows.length);
  });

  it("uses denominator_label to distinguish the two PQC hybrid cards", () => {
    const rows = [row()];
    const agg = buildAggregates(rows, "2026-04-19", []);
    const all = agg.by_scope.__all;
    expect(all?.pqc_hybrid_of_all.denominator_label).toBe("responding hosts");
    expect(all?.pqc_hybrid_of_tls13.denominator_label).toBe(
      "TLS 1.3 handshakes only",
    );
  });

  it("restricts the pqc_hybrid_of_tls13 denominator to TLS 1.3 handshakes", () => {
    const rows = [
      row({
        tls_version: "TLSv1.3",
        pqc_hybrid: { value: true, method: "probe" },
      }),
      row({
        tls_version: "TLSv1.2",
        pqc_hybrid: { value: true, method: "probe" },
      }),
      row({
        handshake_succeeded: false,
        tls_version: null,
        pqc_hybrid: { value: null, method: "error", reason: "x" },
      }),
    ];
    const agg = buildAggregates(rows, "2026-04-19", []);
    const all = agg.by_scope.__all;
    // pqc_hybrid_of_tls13 counts 1 of 1 TLS 1.3 handshake as hybrid.
    expect(all?.pqc_hybrid_of_tls13.affirmative).toBe(1);
    expect(all?.pqc_hybrid_of_tls13.explicit_negative).toBe(0);
    expect(all?.pqc_hybrid_of_tls13.unknown).toBe(0);
    // pqc_hybrid_of_all now uses only responding hosts as its denominator.
    expect(all?.pqc_hybrid_of_all.affirmative).toBe(2);
    expect(all?.pqc_hybrid_of_all.explicit_negative).toBe(0);
    expect(all?.pqc_hybrid_of_all.unknown).toBe(0);
    expect(all?.unreachable_count).toBe(1);
  });

  it("bucketizes rows by scope and emits __all as the cross-scope roll-up", () => {
    const rows = [
      row({ scope: "federal-gov", target: "a.gov:443" }),
      row({ scope: "commercial", target: "a.com:443", host: "a.com" }),
      row({ scope: "commercial", target: "b.com:443", host: "b.com" }),
    ];
    const agg = buildAggregates(rows, "2026-04-19", []);
    expect(agg.total_records).toBe(3);
    expect(agg.scopes_present).toEqual(["commercial", "federal-gov"]);
    expect(agg.by_scope.__all?.total).toBe(3);
    expect(agg.by_scope["federal-gov"]?.total).toBe(1);
    expect(agg.by_scope["commercial"]?.total).toBe(2);
  });

  it("propagates validation warnings verbatim into aggregates", () => {
    const warnings = ["mixed scanner versions: 0.1.0, 0.2.0"];
    const agg = buildAggregates([row()], "2026-04-19", warnings);
    expect(agg.warnings).toEqual(warnings);
  });

  it("renders unknown/absent fields in distributions rather than dropping rows", () => {
    const rows = [
      row({ tls_version: "TLSv1.3" }),
      row({ tls_version: null }),
    ];
    const agg = buildAggregates(rows, "2026-04-19", []);
    const all = agg.by_scope.__all;
    // Two rows: one "TLSv1.3" and one "(unknown)". Neither is dropped.
    expect(all?.tls_versions["TLSv1.3"]).toBe(1);
    expect(all?.tls_versions["(unknown)"]).toBe(1);
  });
});
