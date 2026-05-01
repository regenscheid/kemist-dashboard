import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DomainRow } from "../data/domainRow";
import type { ScanAggregates } from "../data/aggregate";
import type { ScanList } from "../data/scanList";
import type { ScanManifest } from "../data/validate";
import type { KemistScanResultSchemaV2 } from "../data/schema";

// Minimal Dexie shim. Tracks the v2 composite-key shape:
//   scans      → key [date, scan_list]
//   domains    → key [target, scan_date, scan_list]
//   records    → key [target, scan_date, scan_list]
//   aggregates → key [date, scan_list, scope]
// All keys are string-joined with "::" for Map storage; query helpers
// (`where("[scan_date+scan_list]").equals([date, list])`) project rows
// against per-shape filter logic.
const stores = vi.hoisted(() => ({
  meta: new Map<string, { key: string; value: unknown }>(),
  scans: new Map<
    string,
    {
      date: string;
      scan_list: ScanList;
      manifest: ScanManifest;
      record_count: number;
    }
  >(),
  domains: new Map<string, DomainRow>(),
  records: new Map<
    string,
    {
      target: string;
      scan_date: string;
      scan_list: ScanList;
      record: KemistScanResultSchemaV2;
    }
  >(),
  aggregates: new Map<
    string,
    { date: string; scan_list: ScanList; scope: string; payload: ScanAggregates }
  >(),
  joinKey: (...parts: string[]) => parts.join("::"),
  reset() {
    this.meta.clear();
    this.scans.clear();
    this.domains.clear();
    this.records.clear();
    this.aggregates.clear();
  },
}));

vi.mock("./dexie", () => {
  function compoundEquals<T extends Record<string, unknown>>(
    map: Map<string, T>,
    field: string,
    value: string | readonly unknown[],
  ): T[] {
    if (field === "[scan_date+scan_list]" && Array.isArray(value)) {
      const [d, l] = value as [string, ScanList];
      return [...map.values()].filter(
        (row) =>
          (row as unknown as { scan_date: string }).scan_date === d &&
          (row as unknown as { scan_list: ScanList }).scan_list === l,
      );
    }
    if (field === "[date+scan_list]" && Array.isArray(value)) {
      const [d, l] = value as [string, ScanList];
      return [...map.values()].filter(
        (row) =>
          (row as unknown as { date: string }).date === d &&
          (row as unknown as { scan_list: ScanList }).scan_list === l,
      );
    }
    return [...map.values()].filter(
      (row) => (row as unknown as Record<string, unknown>)[field] === value,
    );
  }

  return {
    db: {
      meta: {
        get: async (key: string) => stores.meta.get(key),
        put: async (entry: { key: string; value: unknown }) => {
          stores.meta.set(entry.key, entry);
        },
        delete: async (key: string) => {
          stores.meta.delete(key);
        },
        clear: async () => {
          stores.meta.clear();
        },
      },
      scans: {
        get: async ([date, scan_list]: [string, ScanList]) =>
          stores.scans.get(stores.joinKey(date, scan_list)),
        put: async (entry: {
          date: string;
          scan_list: ScanList;
          manifest: ScanManifest;
          record_count: number;
        }) => {
          stores.scans.set(stores.joinKey(entry.date, entry.scan_list), entry);
        },
        delete: async ([date, scan_list]: [string, ScanList]) => {
          stores.scans.delete(stores.joinKey(date, scan_list));
        },
        clear: async () => {
          stores.scans.clear();
        },
      },
      domains: {
        put: async (row: DomainRow) => {
          stores.domains.set(
            stores.joinKey(row.target, row.scan_date, row.scan_list),
            row,
          );
        },
        bulkPut: async (rows: DomainRow[]) => {
          for (const row of rows) {
            stores.domains.set(
              stores.joinKey(row.target, row.scan_date, row.scan_list),
              row,
            );
          }
        },
        get: async ([target, date, scan_list]: [string, string, ScanList]) =>
          stores.domains.get(stores.joinKey(target, date, scan_list)),
        count: async () => stores.domains.size,
        clear: async () => {
          stores.domains.clear();
        },
        where: (field: string) => ({
          equals: (value: string | readonly unknown[]) => ({
            count: async () => compoundEquals(stores.domains, field, value).length,
            delete: async () => {
              for (const [key, row] of stores.domains.entries()) {
                if (
                  compoundEquals(
                    new Map([["row", row]]),
                    field,
                    value,
                  ).length > 0
                ) {
                  stores.domains.delete(key);
                }
              }
            },
            toArray: async () => compoundEquals(stores.domains, field, value),
          }),
        }),
      },
      records: {
        put: async (entry: {
          target: string;
          scan_date: string;
          scan_list: ScanList;
          record: KemistScanResultSchemaV2;
        }) => {
          stores.records.set(
            stores.joinKey(entry.target, entry.scan_date, entry.scan_list),
            entry,
          );
        },
        bulkPut: async (
          entries: Array<{
            target: string;
            scan_date: string;
            scan_list: ScanList;
            record: KemistScanResultSchemaV2;
          }>,
        ) => {
          for (const entry of entries) {
            stores.records.set(
              stores.joinKey(entry.target, entry.scan_date, entry.scan_list),
              entry,
            );
          }
        },
        get: async ([target, date, scan_list]: [string, string, ScanList]) =>
          stores.records.get(stores.joinKey(target, date, scan_list)),
        clear: async () => {
          stores.records.clear();
        },
        where: (field: string) => ({
          equals: (value: string | readonly unknown[]) => ({
            count: async () => compoundEquals(stores.records, field, value).length,
            delete: async () => {
              for (const [key, row] of stores.records.entries()) {
                if (
                  compoundEquals(
                    new Map([["row", row]]),
                    field,
                    value,
                  ).length > 0
                ) {
                  stores.records.delete(key);
                }
              }
            },
          }),
        }),
      },
      aggregates: {
        put: async (entry: {
          date: string;
          scan_list: ScanList;
          scope: string;
          payload: ScanAggregates;
        }) => {
          stores.aggregates.set(
            stores.joinKey(entry.date, entry.scan_list, entry.scope),
            entry,
          );
        },
        get: async ([date, scan_list, scope]: [string, ScanList, string]) =>
          stores.aggregates.get(stores.joinKey(date, scan_list, scope)),
        clear: async () => {
          stores.aggregates.clear();
        },
        where: (field: string) => ({
          equals: (value: string | readonly unknown[]) => ({
            count: async () => compoundEquals(stores.aggregates, field, value).length,
            delete: async () => {
              for (const [key, row] of stores.aggregates.entries()) {
                if (
                  compoundEquals(
                    new Map([["row", row]]),
                    field,
                    value,
                  ).length > 0
                ) {
                  stores.aggregates.delete(key);
                }
              }
            },
          }),
        }),
      },
    },
    resetDatabase: async () => {
      stores.reset();
    },
  };
});

import { db, resetDatabase } from "./dexie";
import { loadScansIndex, loadScanManifest } from "./loader";

const DATE = "2026-01-02";
const LIST: ScanList = "federal-website-index";

function makeManifest(target_count: number): ScanManifest {
  return {
    scan_date: DATE,
    scan_list: LIST,
    metadata_s3_uri: "s3://bucket/path/metadata.jsonl",
    scan_start: "2026-01-02T02:00:00Z",
    scan_end: target_count === 1 ? "2026-01-02T02:10:00Z" : "2026-01-02T03:10:00Z",
    batch_count: 1,
    target_count,
    batches: [
      {
        key: `raw/dt=${DATE}/batch-001.jsonl.gz`,
        size_bytes: 1024,
        record_count: target_count,
        schema_version: "2.0.0",
      },
    ],
  };
}

function makeRow(): DomainRow {
  return {
    target: "example.gov:443",
    host: "example.gov",
    port: 443,
    scan_date: DATE,
    scope: "federal-gov",
    scan_list: LIST,
    batch_id: "batch-001",
    handshake_succeeded: true,
    tls_version: "TLSv1.3",
    supported_tls_versions: ["TLS 1.2", "TLS 1.3"],
    max_supported_tls_version: "TLS 1.3",
    cipher: "TLS_AES_128_GCM_SHA256",
    kx_group: "X25519",
    kx_support_types: ["ecc"],
    alpn: "h2",
    pqc_hybrid: { value: false, method: "probe" },
    pqc_support: { value: false, method: "probe" },
    pqc_signature: false,
    cert_issuer_cn: "Example CA",
    cert_expiry: "2027-01-02T00:00:00Z",
    cert_validity_days: 365,
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
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("loader cache invalidation", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("drops stale IndexedDB rows when a new publish is fetched", async () => {
    await db.meta.put({ key: "app-build-id", value: "old-build" });
    await db.domains.put(makeRow());

    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse([{ date: DATE, scan_list: LIST, record_count: 1 }]),
    );

    const scans = await loadScansIndex();

    expect(scans).toEqual([{ date: DATE, scan_list: LIST, record_count: 1 }]);
    expect(await db.domains.count()).toBe(0);
  });

  it("filters out legacy entries missing scan_list (back-compat)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse([{ date: DATE, record_count: 1 }]),
    );
    const scans = await loadScansIndex();
    expect(scans).toEqual([]);
  });

  it("clears cached per-(date, list) payloads when the manifest changes", async () => {
    await db.meta.put({ key: "app-build-id", value: __APP_BUILD_ID__ });
    await db.meta.put({
      key: `manifest-signature:${LIST}:${DATE}`,
      value: JSON.stringify(makeManifest(1)),
    });
    await db.scans.put({
      date: DATE,
      scan_list: LIST,
      manifest: makeManifest(1),
      record_count: 1,
    });
    await db.domains.put(makeRow());
    await db.records.put({
      target: "example.gov:443",
      scan_date: DATE,
      scan_list: LIST,
      record: {} as unknown as KemistScanResultSchemaV2,
    });
    await db.aggregates.put({
      date: DATE,
      scan_list: LIST,
      scope: "__all",
      payload: {} as unknown as ScanAggregates,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse(makeManifest(2)),
    );

    const scan = await loadScanManifest(DATE, LIST);

    expect(scan.record_count).toBe(2);
    expect(
      await db.domains
        .where("[scan_date+scan_list]")
        .equals([DATE, LIST])
        .count(),
    ).toBe(0);
    expect(
      await db.records
        .where("[scan_date+scan_list]")
        .equals([DATE, LIST])
        .count(),
    ).toBe(0);
    expect(
      await db.aggregates
        .where("[date+scan_list]")
        .equals([DATE, LIST])
        .count(),
    ).toBe(0);
  });
});
