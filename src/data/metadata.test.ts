import { describe, expect, it } from "vitest";
import type { DomainRow } from "./domainRow";
import {
  extractTop20kRank,
  parseMetadataJsonl,
  resolveOrganization,
} from "./metadata";

describe("parseMetadataJsonl", () => {
  it("parses a federal entry with all four fields", () => {
    const text = JSON.stringify({
      target: "nist.gov",
      scan_list: "federal-website-index",
      organization: "NIST",
      branch: "Executive",
      organizational_unit: "ITL",
      tags: ["pulse"],
    });
    const map = parseMetadataJsonl(text);
    const entry = map.get("nist.gov");
    expect(entry).toBeDefined();
    expect(entry?.organization).toBe("NIST");
    expect(entry?.branch).toBe("Executive");
    expect(entry?.organizational_unit).toBe("ITL");
    expect(entry?.tags).toEqual(["pulse"]);
  });

  it("parses a top-20k entry with rank tag and missing branch/OU", () => {
    const text = JSON.stringify({
      target: "github.com",
      scan_list: "top20k-sfw",
      organization: "GitHub",
      tags: ["rank:33"],
    });
    const map = parseMetadataJsonl(text);
    const entry = map.get("github.com");
    expect(entry?.organization).toBe("GitHub");
    expect(entry?.branch).toBeUndefined();
    expect(entry?.organizational_unit).toBeUndefined();
    expect(entry?.tags).toEqual(["rank:33"]);
  });

  it("skips blank lines and malformed JSON without throwing", () => {
    const text = [
      '{"target":"a.gov","scan_list":"federal-website-index"}',
      "",
      "this is not json",
      '{"target":"b.gov","scan_list":"federal-website-index"}',
    ].join("\n");
    const map = parseMetadataJsonl(text);
    expect(map.size).toBe(2);
    expect(map.has("a.gov")).toBe(true);
    expect(map.has("b.gov")).toBe(true);
  });

  it("drops lines missing the scan_list discriminator", () => {
    const text = JSON.stringify({ target: "x.gov", organization: "X" });
    const map = parseMetadataJsonl(text);
    expect(map.size).toBe(0);
  });

  it("drops lines with a non-canonical scan_list value", () => {
    const text = JSON.stringify({ target: "x.gov", scan_list: "federal" });
    const map = parseMetadataJsonl(text);
    expect(map.size).toBe(0);
  });

  it("last write wins on duplicate target", () => {
    const text = [
      '{"target":"x.gov","scan_list":"federal-website-index","organization":"first"}',
      '{"target":"x.gov","scan_list":"federal-website-index","organization":"second"}',
    ].join("\n");
    const map = parseMetadataJsonl(text);
    expect(map.get("x.gov")?.organization).toBe("second");
  });
});

describe("extractTop20kRank", () => {
  it("returns the integer when a rank:N tag is present", () => {
    expect(extractTop20kRank(["rank:42"])).toBe(42);
    expect(extractTop20kRank(["rank:1"])).toBe(1);
  });
  it("returns null when no rank tag is present", () => {
    expect(extractTop20kRank([])).toBeNull();
    expect(extractTop20kRank(["pulse", "eotw"])).toBeNull();
  });
  it("returns null on malformed rank tags", () => {
    expect(extractTop20kRank(["rank:foo"])).toBeNull();
    expect(extractTop20kRank(["rank:"])).toBeNull();
    expect(extractTop20kRank(["rank:0"])).toBeNull();
    expect(extractTop20kRank(["rank:-5"])).toBeNull();
  });
});

describe("resolveOrganization", () => {
  function row(overrides: Partial<DomainRow> = {}): DomainRow {
    return {
      target: "x.com:443",
      host: "x.com",
      port: 443,
      scan_date: "2026-01-02",
      scope: "commercial",
      scan_list: "top20k-sfw",
      batch_id: "batch-001",
      handshake_succeeded: true,
      tls_version: null,
      supported_tls_versions: [],
      max_supported_tls_version: null,
      cipher: null,
      kx_group: null,
      kx_support_types: [],
      alpn: null,
      pqc_hybrid: { value: null, method: "not_probed" },
      pqc_support: { value: null, method: "not_probed" },
      pqc_signature: false,
      cert_issuer_cn: null,
      cert_expiry: null,
      cert_validity_days: null,
      chain_valid: { value: null, method: "not_probed" },
      name_matches_sni: { value: null, method: "not_probed" },
      error_count: 0,
      top_error_category: null,
      unreachable_summary: null,
      scanner_version: "0.4.0",
      organization: null,
      branch: null,
      organizational_unit: null,
      tags: [],
      top20k_rank: null,
      ...overrides,
    };
  }

  it("returns the sidecar organization when present", () => {
    expect(resolveOrganization(row({ organization: "GitHub" }))).toBe("GitHub");
  });
  it("falls back to hostname when sidecar org is missing", () => {
    expect(resolveOrganization(row({ organization: null }))).toBe("x.com");
  });
  it("falls back to (unknown) only if hostname is somehow empty", () => {
    expect(resolveOrganization(row({ organization: null, host: "" }))).toBe(
      "(unknown)",
    );
  });
});
