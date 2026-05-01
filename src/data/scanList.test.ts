import { describe, expect, it } from "vitest";
import {
  ALL_SCAN_LISTS,
  DEFAULT_SCAN_LIST,
  SCAN_LIST_LABELS,
  isScanList,
} from "./scanList";

describe("isScanList", () => {
  it("accepts the two canonical literals", () => {
    expect(isScanList("federal-website-index")).toBe(true);
    expect(isScanList("top20k-sfw")).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isScanList("federal")).toBe(false);
    expect(isScanList("top20k")).toBe(false);
    expect(isScanList("")).toBe(false);
    expect(isScanList(null)).toBe(false);
    expect(isScanList(undefined)).toBe(false);
    expect(isScanList(42)).toBe(false);
  });
});

describe("ALL_SCAN_LISTS / DEFAULT_SCAN_LIST", () => {
  it("contains exactly the two canonical lists", () => {
    expect([...ALL_SCAN_LISTS].sort()).toEqual([
      "federal-website-index",
      "top20k-sfw",
    ]);
  });
  it("default is federal", () => {
    expect(DEFAULT_SCAN_LIST).toBe("federal-website-index");
  });
});

describe("SCAN_LIST_LABELS", () => {
  it("provides display + cadence + short labels for every list", () => {
    for (const list of ALL_SCAN_LISTS) {
      const label = SCAN_LIST_LABELS[list];
      expect(label).toBeDefined();
      expect(label.display).toBeTruthy();
      expect(label.cadence).toBeTruthy();
      expect(label.short).toBeTruthy();
    }
  });
});
