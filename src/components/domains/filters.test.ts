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
    batch_id: "batch-001",
    handshake_succeeded: true,
    tls_version: "TLSv1.3",
    supported_tls_versions: ["TLS 1.2", "TLS 1.3"],
    max_supported_tls_version: "TLS 1.3",
    cipher: "TLS13_AES_256_GCM_SHA384",
    kx_group: "X25519",
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

  it("respects ANY-of semantics within a facet", () => {
    const a = row({ scope: "federal-gov" });
    const b = row({ scope: "commercial" });
    const filters = { ...EMPTY_FILTERS, scopes: ["federal-gov" as const] };
    expect(matchesFilters(a, filters)).toBe(true);
    expect(matchesFilters(b, filters)).toBe(false);
  });

  it("routes tri-state filter through classifier (unknown ≠ rejected)", () => {
    const affirm = row({ pqc_hybrid: { value: true, method: "probe" } });
    const negative = row({ pqc_hybrid: { value: false, method: "probe" } });
    const unknown = row({
      pqc_hybrid: {
        value: null,
        method: "not_probed",
        reason: "aws_lc_rs_no_support",
      },
    });

    // "unknown" selector must not match probe+false — the tri-state
    // contract forbids collapsing null into false or vice versa.
    const filters = { ...EMPTY_FILTERS, pqc_hybrid: ["unknown" as const] };
    expect(matchesFilters(affirm, filters)).toBe(false);
    expect(matchesFilters(negative, filters)).toBe(false);
    expect(matchesFilters(unknown, filters)).toBe(true);
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
      isFilterActive({ ...EMPTY_FILTERS, pqc_hybrid: ["affirmative"] }),
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
    const scopeCounts = Object.fromEntries(
      options.scopes.map((s) => [s.option, s.count]),
    );
    expect(scopeCounts["federal-gov"]).toBe(2);
    expect(scopeCounts["commercial"]).toBe(1);
    // Sort order: federal-gov first (count 2).
    expect(options.scopes[0]?.option).toBe("federal-gov");
  });

  it("treats absent fields as explicit buckets", () => {
    const rows = [
      row({
        tls_version: null,
        supported_tls_versions: [],
        max_supported_tls_version: null,
        top_error_category: null,
      }),
    ];
    const options = buildFacetOptions(rows);
    expect(options.tls_versions.some((o) => o.option === "(unknown)")).toBe(true);
    expect(
      options.error_categories.some((o) => o.option === "(none)"),
    ).toBe(true);
  });
});
