import { describe, expect, it } from "vitest";
import type { DomainRow } from "../../data/domainRow";
import {
  EMPTY_FILTERS,
  buildFacetOptions,
  isFilterActive,
  matchesFilters,
} from "./filters";

function row(overrides: Partial<DomainRow> = {}): DomainRow {
  return {
    target: "example.gov:443",
    host: "example.gov",
    port: 443,
    scan_date: "2026-04-19",
    scope: "federal-gov",
    scan_list: "federal-website-index",
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
    pqc_support: { value: false, method: "probe" },
    pqc_signature: false,
    cert_issuer_cn: "Let's Encrypt",
    cert_expiry: "2026-06-01T00:00:00Z",
    cert_validity_days: 90,
    chain_valid: { value: true, method: "probe" },
    name_matches_sni: { value: true, method: "probe" },
    error_count: 0,
    top_error_category: null,
    unreachable_summary: null,
    scanner_version: "0.1.0",
    organization: null,
    branch: null,
    organizational_unit: null,
    tags: [],
    top20k_rank: null,
    ...overrides,
  };
}

describe("matchesFilters", () => {
  it("passes responding rows when no filters are active", () => {
    const r = row();
    expect(matchesFilters(r, EMPTY_FILTERS)).toBe(true);
  });

  it("excludes unreachable hosts by default", () => {
    const unreachable = row({
      handshake_succeeded: false,
      tls_version: null,
      top_error_category: "dns_resolution_failed",
    });
    expect(matchesFilters(unreachable, EMPTY_FILTERS)).toBe(false);
    expect(
      matchesFilters(unreachable, { ...EMPTY_FILTERS, show_unreachable: true }),
    ).toBe(true);
  });

  it("substring-matches on target (case insensitive)", () => {
    const r = row({ target: "nist.gov:443" });
    expect(matchesFilters(r, { ...EMPTY_FILTERS, q: "NIST" })).toBe(true);
    expect(matchesFilters(r, { ...EMPTY_FILTERS, q: "nope" })).toBe(false);
  });

  it("respects ANY-of semantics within the supported-version facet", () => {
    const a = row({ supported_tls_versions: ["TLS 1.2", "TLS 1.3"] });
    const b = row({ supported_tls_versions: ["TLS 1.0"] });
    const filters = { ...EMPTY_FILTERS, tls_versions: ["TLS 1.2"] };
    expect(matchesFilters(a, filters)).toBe(true);
    expect(matchesFilters(b, filters)).toBe(false);
  });

  it("matches key-exchange support categories with ANY-of semantics", () => {
    const hybrid = row({ kx_support_types: ["pqc_hybrid", "ecc"] });
    const purePqc = row({ kx_support_types: ["pure_pqc"] });
    const rsa = row({ kx_support_types: ["rsa"] });

    const filters = {
      ...EMPTY_FILTERS,
      kx_support: ["pqc_hybrid", "rsa"] as typeof EMPTY_FILTERS.kx_support,
    };
    expect(matchesFilters(hybrid, filters)).toBe(true);
    expect(matchesFilters(rsa, filters)).toBe(true);
    expect(matchesFilters(purePqc, filters)).toBe(false);
  });

  it("matches supported-version filters even when the negotiated version is newer", () => {
    const r = row({
      tls_version: "TLSv1.3",
      supported_tls_versions: ["TLS 1.1", "TLS 1.2", "TLS 1.3"],
      max_supported_tls_version: "TLS 1.3",
    });
    expect(
      matchesFilters(r, { ...EMPTY_FILTERS, tls_versions: ["TLS 1.2"] }),
    ).toBe(true);
    expect(
      matchesFilters(r, { ...EMPTY_FILTERS, tls_versions: ["SSL 3.0"] }),
    ).toBe(false);
  });

  it("matches hosts by highest supported TLS version", () => {
    const r = row({
      supported_tls_versions: ["TLS 1.0", "TLS 1.1"],
      max_supported_tls_version: "TLS 1.1",
      tls_version: "TLSv1.1",
    });
    expect(
      matchesFilters(r, {
        ...EMPTY_FILTERS,
        max_supported_tls_version: "TLS 1.1",
      }),
    ).toBe(true);
    expect(
      matchesFilters(r, {
        ...EMPTY_FILTERS,
        max_supported_tls_version: "TLS 1.2",
      }),
    ).toBe(false);
  });

  it("treats absent support data as the (unknown) bucket", () => {
    const r = row({
      tls_version: null,
      supported_tls_versions: [],
      max_supported_tls_version: null,
    });
    const filters = {
      ...EMPTY_FILTERS,
      max_supported_tls_version: "(unknown)",
    };
    expect(matchesFilters(r, filters)).toBe(true);
  });

  it("applies cert-expiry windows", () => {
    const now = Date.now();
    const msPerDay = 86_400_000;
    const expired = row({
      cert_expiry: new Date(now - 5 * msPerDay).toISOString(),
    });
    const soon = row({
      cert_expiry: new Date(now + 10 * msPerDay).toISOString(),
    });
    const later = row({
      cert_expiry: new Date(now + 120 * msPerDay).toISOString(),
    });

    expect(matchesFilters(expired, { ...EMPTY_FILTERS, cert_expiry: "expired" })).toBe(true);
    expect(matchesFilters(soon, { ...EMPTY_FILTERS, cert_expiry: "expired" })).toBe(false);
    expect(matchesFilters(soon, { ...EMPTY_FILTERS, cert_expiry: "lt30" })).toBe(true);
    expect(matchesFilters(later, { ...EMPTY_FILTERS, cert_expiry: "lt30" })).toBe(false);
    expect(matchesFilters(later, { ...EMPTY_FILTERS, cert_expiry: "lt90" })).toBe(false);
  });
});

describe("isFilterActive", () => {
  it("returns false for an empty filter state", () => {
    expect(isFilterActive(EMPTY_FILTERS)).toBe(false);
  });

  it("returns true for any single non-empty facet", () => {
    expect(isFilterActive({ ...EMPTY_FILTERS, q: "nist" })).toBe(true);
    expect(
      isFilterActive({ ...EMPTY_FILTERS, kx_support: ["pqc_hybrid"] }),
    ).toBe(true);
    expect(isFilterActive({ ...EMPTY_FILTERS, cert_expiry: "lt30" })).toBe(true);
  });
});

describe("buildFacetOptions", () => {
  it("produces distinct counts per facet, sorted descending", () => {
    const rows = [
      row({ scope: "federal-gov", tls_version: "TLSv1.3" }),
      row({ scope: "federal-gov", tls_version: "TLSv1.2" }),
      row({ scope: "commercial", tls_version: "TLSv1.3", host: "a.com", target: "a.com:443" }),
    ];
    const options = buildFacetOptions(rows);
    const tlsCounts = Object.fromEntries(
      options.tls_versions.map((s) => [s.option, s.count]),
    );
    const kxCounts = Object.fromEntries(
      options.kx_support.map((s) => [s.option, s.count]),
    );
    expect(tlsCounts["TLS 1.3"]).toBe(3);
    expect(tlsCounts["TLS 1.2"]).toBe(3);
    expect(kxCounts["ecc"]).toBe(3);
  });

  it("treats absent fields as explicit buckets", () => {
    const rows = [
      row({
        tls_version: null,
        supported_tls_versions: [],
        max_supported_tls_version: null,
        organization: null,
      }),
    ];
    const options = buildFacetOptions(rows);
    expect(options.tls_versions.some((o) => o.option === "(unknown)")).toBe(true);
    expect(
      options.organizations.some((o) => o.option === "(none)"),
    ).toBe(true);
  });
});
