import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { KemistScanResultSchemaV2 } from "./schema";
import type { DomainRow } from "./domainRow";
import type { TargetMetadata } from "./metadata";
import {
  PQC_HYBRID_GROUPS,
  aggregateHybridGroups,
  aggregatePqcGroups,
  toDomainRow,
  topErrorCategory,
  type TransformContext,
} from "./transform";
import { inferScope } from "./scope";

// Real nist.gov record captured from a live scan on 2026-04-19. Pinned
// in the repo so the transform's happy-path output stays stable across
// PRs — any regression in denormalization fails a snapshot here
// before reaching the UI layer.
const nistRecord: KemistScanResultSchemaV2 = JSON.parse(
  readFileSync(path.join(__dirname, "../../fixtures/nist-gov.jsonl"), "utf8"),
) as KemistScanResultSchemaV2;

function defaultCtx(
  overrides: Partial<TransformContext> = {},
): TransformContext {
  return {
    scan_date: "2026-04-19",
    batch_id: "batch-002",
    scan_list: "federal-website-index",
    metadata: new Map<string, TargetMetadata>(),
    ...overrides,
  };
}

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
    const row = toDomainRow(nistRecord, defaultCtx());
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
    const row = toDomainRow(nistRecord, defaultCtx());
    // nist.gov: chain_valid = probe+true, name_matches_sni = probe+true
    expect(row.chain_valid.method).toBe("probe");
    expect(row.chain_valid.value).toBe(true);
    expect(row.name_matches_sni.method).toBe("probe");
    expect(row.name_matches_sni.value).toBe(true);
  });

  it("surfaces certificate leaf facts to scalar columns", () => {
    const row = toDomainRow(nistRecord, defaultCtx());
    expect(row.cert_issuer_cn).toBe("E8");
    expect(row.cert_validity_days).toBeGreaterThan(0);
    expect(row.pqc_signature).toBe(false);
  });

  it("marks non-responders from versions_offered and joins distinct error categories", () => {
    const nonResponder = structuredClone(nistRecord);
    nonResponder.tls.versions_offered = {
      ssl2: { offered: false, method: "probe" },
      ssl3: { offered: false, method: "probe" },
      tls1_0: { offered: false, method: "probe" },
      tls1_1: { offered: false, method: "probe" },
      tls1_2: { offered: false, method: "probe" },
      tls1_3: { offered: false, method: "probe" },
    };
    delete nonResponder.tls.negotiated;
    nonResponder.errors = [
      { category: "connection_refused", context: "…", timestamp: "…" },
      { category: "dns_resolution_failed", context: "…", timestamp: "…" },
      { category: "connection_refused", context: "…", timestamp: "…" },
    ];

    const row = toDomainRow(nonResponder, defaultCtx({ batch_id: "batch-003" }));

    expect(row.handshake_succeeded).toBe(false);
    expect(row.supported_tls_versions).toEqual([]);
    expect(row.unreachable_summary).toBe("connection_refused, dns_resolution_failed");
  });
});

describe("aggregateHybridGroups", () => {
  type GroupsByName = KemistScanResultSchemaV2["tls"]["groups"]["tls1_3"];

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
});

describe("aggregatePqcGroups", () => {
  type GroupsByName = KemistScanResultSchemaV2["tls"]["groups"]["tls1_3"];

  it("returns affirmative when only a pure PQC group is supported", () => {
    // pqc_hybrid would say not_probed (no hybrid in map), but the
    // broader PQC rollup should detect pure PQC support.
    const groups: GroupsByName = {
      MLKEM768: { supported: true, method: "probe" },
    };
    const result = aggregatePqcGroups(groups);
    expect(result.value).toBe(true);
    expect(result.method).toBe("probe");
  });

  it("returns affirmative when a hybrid is supported and pure PQC isn't probed", () => {
    const groups: GroupsByName = {
      X25519MLKEM768: { supported: true, method: "probe" },
      MLKEM768: { supported: null, method: "not_probed", reason: "x" },
    };
    const result = aggregatePqcGroups(groups);
    expect(result.value).toBe(true);
  });

  it("returns explicit_negative only when every observed PQC group (hybrid + pure) is rejected", () => {
    const groups: GroupsByName = {
      X25519MLKEM768: { supported: false, method: "probe" },
      secp256r1MLKEM768: { supported: false, method: "probe" },
      secp384r1MLKEM1024: { supported: false, method: "probe" },
      MLKEM512: { supported: false, method: "probe" },
      MLKEM768: { supported: false, method: "probe" },
      MLKEM1024: { supported: false, method: "probe" },
    };
    const result = aggregatePqcGroups(groups);
    expect(result.value).toBe(false);
    expect(result.method).toBe("probe");
  });

  it("returns not_probed with clear reason when neither hybrid nor pure groups are in the probe set", () => {
    const result = aggregatePqcGroups({} as GroupsByName);
    expect(result.method).toBe("not_probed");
    expect(result.reason).toBe("no_pqc_groups_in_probe_set");
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

describe("toDomainRow — sidecar metadata join", () => {
  it("populates organization/branch/OU/tags from a federal sidecar entry", () => {
    const meta = new Map<string, TargetMetadata>([
      [
        "nist.gov",
        {
          target: "nist.gov",
          scan_list: "federal-website-index",
          organization: "National Institute of Standards and Technology",
          branch: "Executive",
          organizational_unit: "Information Technology Laboratory",
          tags: ["pulse", "eotw"],
        },
      ],
    ]);
    const row = toDomainRow(nistRecord, defaultCtx({ metadata: meta }));
    expect(row.organization).toBe(
      "National Institute of Standards and Technology",
    );
    expect(row.branch).toBe("Executive");
    expect(row.organizational_unit).toBe("Information Technology Laboratory");
    expect(row.tags).toEqual(["pulse", "eotw"]);
    expect(row.top20k_rank).toBeNull();
  });

  it("leaves metadata fields null/empty when sidecar entry is absent", () => {
    const row = toDomainRow(nistRecord, defaultCtx());
    expect(row.organization).toBeNull();
    expect(row.branch).toBeNull();
    expect(row.organizational_unit).toBeNull();
    expect(row.tags).toEqual([]);
    expect(row.top20k_rank).toBeNull();
  });

  it("lifts top20k rank from the rank:N tag", () => {
    const meta = new Map<string, TargetMetadata>([
      [
        "nist.gov",
        {
          target: "nist.gov",
          scan_list: "top20k-sfw",
          organization: "Mock Org",
          tags: ["rank:7"],
        },
      ],
    ]);
    const row = toDomainRow(
      nistRecord,
      defaultCtx({ metadata: meta, scan_list: "top20k-sfw" }),
    );
    expect(row.top20k_rank).toBe(7);
    expect(row.tags).toEqual(["rank:7"]);
    expect(row.scan_list).toBe("top20k-sfw");
  });
});

describe("DomainRow shape invariants", () => {
  it("never emits a bare boolean for tri-state columns", () => {
    const row: DomainRow = toDomainRow(nistRecord, defaultCtx());
    // These fields are TriStateObservation objects; a regression
    // that flattened them to bare booleans would break the
    // tri-state contract (unknown ≠ rejected).
    expect(typeof row.pqc_hybrid).toBe("object");
    expect(typeof row.chain_valid).toBe("object");
    expect(typeof row.name_matches_sni).toBe("object");
    expect("method" in row.pqc_hybrid).toBe(true);
  });
});
