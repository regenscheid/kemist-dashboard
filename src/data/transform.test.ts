import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { KemistScanResultSchemaV1 } from "./schema";
import type { DomainRow } from "./domainRow";
import {
  PQC_HYBRID_GROUPS,
  aggregateHybridGroups,
  toDomainRow,
  topErrorCategory,
} from "./transform";
import { inferScope } from "./scope";

// Real nist.gov record captured from a live scan on 2026-04-19. Pinned
// in the repo so the transform's happy-path output stays stable across
// PRs — any regression in denormalization fails a snapshot here
// before reaching the UI layer.
const nistRecord: KemistScanResultSchemaV1 = JSON.parse(
  readFileSync(path.join(__dirname, "../../fixtures/nist-gov.jsonl"), "utf8"),
) as KemistScanResultSchemaV1;

describe("inferScope (TLD-based v0)", () => {
  it("maps .gov to federal-gov", () => {
    expect(inferScope("nist.gov")).toBe("federal-gov");
    expect(inferScope("www.state.ca.gov")).toBe("federal-gov");
  });

  it("distinguishes .mil, .edu, commercial TLDs", () => {
    expect(inferScope("army.mil")).toBe("mil");
    expect(inferScope("mit.edu")).toBe("edu");
    expect(inferScope("example.com")).toBe("commercial");
    expect(inferScope("example.org")).toBe("commercial");
  });

  it("falls back to unknown-tld for unrecognized TLDs", () => {
    expect(inferScope("example.xyz")).toBe("unknown-tld");
    expect(inferScope("somewhere.invalid")).toBe("unknown-tld");
  });
});

describe("toDomainRow", () => {
  it("produces a stable row for the real nist.gov record", () => {
    const row = toDomainRow(nistRecord, {
      scan_date: "2026-04-19",
      batch_id: "batch-002",
    });
    expect(row.target).toBe("nist.gov:443");
    expect(row.host).toBe("nist.gov");
    expect(row.port).toBe(443);
    expect(row.scope).toBe("federal-gov");
    expect(row.batch_id).toBe("batch-002");
    expect(row.scan_date).toBe("2026-04-19");
    expect(row.handshake_succeeded).toBe(true);
    expect(row.tls_version).toBe("TLSv1.3");
    expect(row.supported_tls_versions).toContain("TLS 1.2");
    expect(row.supported_tls_versions).toContain("TLS 1.3");
    expect(row.max_supported_tls_version).toBe("TLS 1.3");
    expect(row.kx_support_types).toContain("ecc");
    expect(row.error_count).toBe(0);
    expect(row.top_error_category).toBeNull();
  });

  it("preserves tri-state on chain_valid / name_matches_sni", () => {
    const row = toDomainRow(nistRecord, {
      scan_date: "2026-04-19",
      batch_id: "batch-002",
    });
    // nist.gov: chain_valid = probe+true, name_matches_sni = probe+true
    expect(row.chain_valid.method).toBe("probe");
    expect(row.chain_valid.value).toBe(true);
    expect(row.name_matches_sni.method).toBe("probe");
    expect(row.name_matches_sni.value).toBe(true);
  });

  it("surfaces certificate leaf facts to scalar columns", () => {
    const row = toDomainRow(nistRecord, {
      scan_date: "2026-04-19",
      batch_id: "batch-002",
    });
    expect(row.cert_issuer_cn).toBe("E8");
    expect(row.cert_validity_days).toBeGreaterThan(0);
    expect(row.pqc_signature).toBe(false);
  });
});

describe("aggregateHybridGroups", () => {
  type GroupsByName = KemistScanResultSchemaV1["tls"]["groups"]["tls1_3"];

  const baseNotProbed = {
    method: "not_probed" as const,
    reason: "probe_skipped_for_this_scan",
  };

  it("returns affirmative if any known hybrid is probe+true", () => {
    const groups: GroupsByName = {
      X25519MLKEM768: { supported: true, method: "probe" },
      secp256r1MLKEM768: { supported: false, method: "probe" },
      secp384r1MLKEM1024: { supported: null, ...baseNotProbed },
    };
    const result = aggregateHybridGroups(groups);
    expect(result.value).toBe(true);
    expect(result.method).toBe("probe");
  });

  it("returns explicit_negative only when every observed hybrid is probe+false", () => {
    const groups: GroupsByName = {
      X25519MLKEM768: { supported: false, method: "probe" },
      secp256r1MLKEM768: { supported: false, method: "probe" },
      secp384r1MLKEM1024: { supported: false, method: "probe" },
    };
    const result = aggregateHybridGroups(groups);
    expect(result.value).toBe(false);
    expect(result.method).toBe("probe");
  });

  it("treats provider no-support not_probed hybrids as explicit negatives", () => {
    const groups: GroupsByName = {
      X25519MLKEM768: { supported: false, method: "probe" },
      secp256r1MLKEM768: { supported: false, method: "probe" },
      secp384r1MLKEM1024: {
        supported: null,
        method: "not_probed",
        reason: "aws_lc_rs_no_secp384r1mlkem1024_support",
      },
    };
    const result = aggregateHybridGroups(groups);
    expect(result.value).toBe(false);
    expect(result.method).toBe("probe");
  });

  it("returns unknown when at least one hybrid is unknown (no collapsing into rejected)", () => {
    const groups: GroupsByName = {
      X25519MLKEM768: { supported: false, method: "probe" },
      secp256r1MLKEM768: { supported: false, method: "probe" },
      secp384r1MLKEM1024: { supported: null, ...baseNotProbed },
    };
    const result = aggregateHybridGroups(groups);
    expect(result.value).toBeNull();
    expect(result.method).toBe("not_probed");
    expect(result.reason).toBe("probe_skipped_for_this_scan");
  });

  it("prefers error > not_probed > not_applicable when mixed unknowns", () => {
    const groups: GroupsByName = {
      X25519MLKEM768: { supported: null, method: "error", reason: "boom" },
      secp256r1MLKEM768: { supported: null, method: "not_probed", reason: "x" },
      secp384r1MLKEM1024: {
        supported: null,
        method: "not_applicable",
        reason: "y",
      },
    };
    const result = aggregateHybridGroups(groups);
    expect(result.method).toBe("error");
    expect(result.reason).toBe("boom");
  });

  it("returns not_probed with clear reason when none of the hybrids are in the groups map", () => {
    const result = aggregateHybridGroups({} as GroupsByName);
    expect(result.method).toBe("not_probed");
    expect(result.reason).toBe("no_hybrid_groups_in_probe_set");
  });

  it("exports the hybrid group set so PRs that change it are visible in diffs", () => {
    expect(PQC_HYBRID_GROUPS).toContain("X25519MLKEM768");
    expect(PQC_HYBRID_GROUPS).toContain("secp256r1MLKEM768");
    expect(PQC_HYBRID_GROUPS).toContain("secp384r1MLKEM1024");
  });
});

describe("topErrorCategory", () => {
  it("returns null for zero errors", () => {
    expect(topErrorCategory([])).toBeNull();
  });

  it("returns the first error's category (root cause proxy)", () => {
    const errs = [
      { category: "dns_resolution_failed", context: "…", timestamp: "…" },
      { category: "tcp_connect_failed", context: "…", timestamp: "…" },
    ];
    expect(topErrorCategory(errs)).toBe("dns_resolution_failed");
  });
});

describe("DomainRow shape invariants", () => {
  it("never emits a bare boolean for tri-state columns", () => {
    const row: DomainRow = toDomainRow(nistRecord, {
      scan_date: "2026-04-19",
      batch_id: "batch-002",
    });
    // These fields are TriStateObservation objects; a regression
    // that flattened them to bare booleans would break the
    // tri-state contract (unknown ≠ rejected).
    expect(typeof row.pqc_hybrid).toBe("object");
    expect(typeof row.chain_valid).toBe("object");
    expect(typeof row.name_matches_sni).toBe("object");
    expect("method" in row.pqc_hybrid).toBe(true);
  });
});
