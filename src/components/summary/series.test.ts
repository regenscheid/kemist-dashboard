import { describe, expect, it } from "vitest";
import {
  certIssuerTreemapOption,
  cipherDistributionOption,
  distributionBarOption,
  errorCategoryOption,
  kxGroupOption,
  stripPlaceholders,
  tlsVersionOption,
} from "./series";

describe("distributionBarOption", () => {
  it("sorts bars by count descending by default", () => {
    const opt = distributionBarOption(
      { a: 1, b: 5, c: 3 },
      { title: "x" },
    );
    // xAxis.data is the category label list in render order.
    const xAxis = opt.xAxis as { data: string[] };
    expect(xAxis.data).toEqual(["b", "c", "a"]);
  });

  it("renders (unknown) as an explicit bar labeled from emptyLabel", () => {
    const opt = distributionBarOption(
      { "TLSv1.3": 5, "(unknown)": 2 },
      { title: "x", emptyLabel: "no handshake" },
    );
    const xAxis = opt.xAxis as { data: string[] };
    expect(xAxis.data).toContain("no handshake");
    expect(xAxis.data).not.toContain("(unknown)");
  });

  it("allows a highlight function to override a single bar's color", () => {
    const opt = distributionBarOption(
      { a: 5, b: 3 },
      {
        title: "x",
        highlight: (k) => (k === "a" ? "#000000" : null),
      },
    );
    const series = opt.series as Array<{
      data: Array<{ itemStyle: { color: string } }>;
    }>;
    expect(series[0]?.data[0]?.itemStyle.color).toBe("#000000");
  });
});

describe("kxGroupOption", () => {
  it("highlights PQC hybrid groups", () => {
    const opt = kxGroupOption({
      X25519MLKEM768: 10,
      X25519: 5,
    });
    const xAxis = opt.xAxis as { data: string[]; axisLabel?: { interval?: number } };
    const series = opt.series as Array<{
      data: Array<{ itemStyle: { color: string } }>;
    }>;
    const hybridIdx = xAxis.data.indexOf("X25519MLKEM768");
    const classicalIdx = xAxis.data.indexOf("X25519");
    expect(series[0]?.data[hybridIdx]?.itemStyle.color).toBe("#2563eb");
    expect(series[0]?.data[classicalIdx]?.itemStyle.color).not.toBe("#2563eb");
    expect(xAxis.axisLabel?.interval).toBe(0);
  });
});

describe("cipherDistributionOption", () => {
  it("includes both TLS 1.3 and TLS 1.2 suites", () => {
    const opt = cipherDistributionOption({
      TLS13_AES_256_GCM_SHA384: 10,
      TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384: 3,
    });
    const xAxis = opt.xAxis as { data: string[]; axisLabel?: { show?: boolean } };
    expect(xAxis.data).toContain("TLS13_AES_256_GCM_SHA384");
    expect(xAxis.data).toContain("TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384");
    expect(xAxis.axisLabel?.show).toBe(false);
  });
});

describe("tlsVersionOption", () => {
  it("highlights TLS 1.3 in the affirmative palette", () => {
    const opt = tlsVersionOption({ "TLSv1.3": 8, "TLSv1.2": 4 });
    const xAxis = opt.xAxis as { data: string[] };
    const series = opt.series as Array<{
      data: Array<{ itemStyle: { color: string } }>;
    }>;
    const idx13 = xAxis.data.indexOf("TLSv1.3");
    expect(series[0]?.data[idx13]?.itemStyle.color).toBe("#16a34a");
  });
});

describe("errorCategoryOption", () => {
  it("labels (none) as '(clean scan)'", () => {
    const opt = errorCategoryOption({ "(none)": 9, dns_resolution_failed: 2 });
    const xAxis = opt.xAxis as { data: string[] };
    expect(xAxis.data).toContain("(clean scan)");
    expect(xAxis.data).not.toContain("(none)");
  });
});

describe("certIssuerTreemapOption", () => {
  it("renames (unknown) to '(no cert observed)' for the treemap", () => {
    const opt = certIssuerTreemapOption({
      "Let's Encrypt": 5,
      "(unknown)": 2,
    });
    const series = opt.series as Array<{ data: Array<{ name: string }> }>;
    const names = series[0]?.data.map((d) => d.name) ?? [];
    expect(names).toContain("(no cert observed)");
    expect(names).not.toContain("(unknown)");
  });
});

describe("stripPlaceholders", () => {
  it("removes (unknown) and (none) keys", () => {
    expect(
      stripPlaceholders({ "TLSv1.3": 5, "(unknown)": 3, "(none)": 1 }),
    ).toEqual({ "TLSv1.3": 5 });
  });
});
