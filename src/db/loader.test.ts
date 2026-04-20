import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DomainRow } from "../data/domainRow";
import type { ScanAggregates } from "../data/aggregate";
import type { ScanManifest } from "../data/validate";
import type { KemistScanResultSchemaV1 } from "../data/schema";

const stores = vi.hoisted(() => ({
  meta: new Map<string, { key: string; value: unknown }>(),
  scans: new Map<string, { date: string; manifest: ScanManifest; record_count: number }>(),
  domains: new Map<string, DomainRow>(),
  records: new Map<string, { target: string; scan_date: string; record: KemistScanResultSchemaV1 }>(),
  aggregates: new Map<string, { date: string; scope: string; payload: ScanAggregates }>(),
  key: (left: string, right: string) => `${left}::${right}`,
  reset() {
    this.meta.clear();
    this.scans.clear();
    this.domains.clear();
    this.records.clear();
    this.aggregates.clear();
  },
}));

vi.mock("./dexie", () => ({
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
      get: async (date: string) => stores.scans.get(date),
      put: async (entry: { date: string; manifest: ScanManifest; record_count: number }) => {
        stores.scans.set(entry.date, entry);
      },
      delete: async (date: string) => {
        stores.scans.delete(date);
      },
      clear: async () => {
        stores.scans.clear();
      },
    },
    domains: {
      put: async (row: DomainRow) => {
        stores.domains.set(stores.key(row.target, row.scan_date), row);
      },
      bulkPut: async (rows: DomainRow[]) => {
        for (const row of rows) {
          stores.domains.set(stores.key(row.target, row.scan_date), row);
        }
      },
      get: async ([target, date]: [string, string]) =>
        stores.domains.get(stores.key(target, date)),
      count: async () => stores.domains.size,
      clear: async () => {
        stores.domains.clear();
      },
      where: (field: "scan_date") => ({
        equals: (value: string) => ({
          count: async () =>
            [...stores.domains.values()].filter((row) => row[field] === value).length,
          delete: async () => {
            for (const [key, row] of stores.domains.entries()) {
              if (row[field] === value) stores.domains.delete(key);
            }
          },
          toArray: async () =>
            [...stores.domains.values()].filter((row) => row[field] === value),
        }),
      }),
    },
    records: {
      put: async (entry: { target: string; scan_date: string; record: KemistScanResultSchemaV1 }) => {
        stores.records.set(stores.key(entry.target, entry.scan_date), entry);
      },
      bulkPut: async (
        entries: { target: string; scan_date: string; record: KemistScanResultSchemaV1 }[],
      ) => {
        for (const entry of entries) {
          stores.records.set(stores.key(entry.target, entry.scan_date), entry);
        }
      },
      get: async ([target, date]: [string, string]) =>
        stores.records.get(stores.key(target, date)),
      clear: async () => {
        stores.records.clear();
      },
      where: (field: "scan_date") => ({
        equals: (value: string) => ({
          count: async () =>
            [...stores.records.values()].filter((row) => row[field] === value).length,
          delete: async () => {
            for (const [key, row] of stores.records.entries()) {
              if (row[field] === value) stores.records.delete(key);
            }
          },
        }),
      }),
    },
    aggregates: {
      put: async (entry: { date: string; scope: string; payload: ScanAggregates }) => {
        stores.aggregates.set(stores.key(entry.date, entry.scope), entry);
      },
      get: async ([date, scope]: [string, string]) =>
        stores.aggregates.get(stores.key(date, scope)),
      clear: async () => {
        stores.aggregates.clear();
      },
      where: (field: "date") => ({
        equals: (value: string) => ({
          count: async () =>
            [...stores.aggregates.values()].filter((row) => row[field] === value).length,
          delete: async () => {
            for (const [key, row] of stores.aggregates.entries()) {
              if (row[field] === value) stores.aggregates.delete(key);
            }
          },
        }),
      }),
    },
  },
  resetDatabase: async () => {
    stores.reset();
  },
}));

import { db, resetDatabase } from "./dexie";
import { loadScansIndex, loadScanManifest } from "./loader";

const DATE = "2026-01-02";

function makeManifest(target_count: number): ScanManifest {
  return {
    scan_date: DATE,
    scan_start: "2026-01-02T02:00:00Z",
    scan_end: target_count === 1 ? "2026-01-02T02:10:00Z" : "2026-01-02T03:10:00Z",
    batch_count: 1,
    target_count,
    batches: [
      {
        key: `raw/dt=${DATE}/batch-001.jsonl.gz`,
        size_bytes: 1024,
        record_count: target_count,
        schema_version: "1.0.0",
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
    pqc_signature: false,
    cert_issuer_cn: "Example CA",
    cert_expiry: "2027-01-02T00:00:00Z",
    cert_validity_days: 365,
    chain_valid: { value: true, method: "probe" },
    name_matches_sni: { value: true, method: "probe" },
    error_count: 0,
    top_error_category: null,
    scanner_version: "0.1.0",
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
      jsonResponse([{ date: DATE, record_count: 1 }]),
    );

    const scans = await loadScansIndex();

    expect(scans).toEqual([{ date: DATE, record_count: 1 }]);
    expect(await db.domains.count()).toBe(0);
  });

  it("clears cached per-date payloads when the manifest changes", async () => {
    await db.meta.put({ key: "app-build-id", value: __APP_BUILD_ID__ });
    await db.meta.put({
      key: `manifest-signature:${DATE}`,
      value: JSON.stringify(makeManifest(1)),
    });
    await db.scans.put({ date: DATE, manifest: makeManifest(1), record_count: 1 });
    await db.domains.put(makeRow());
    await db.records.put({
      target: "example.gov:443",
      scan_date: DATE,
      record: {} as unknown as KemistScanResultSchemaV1,
    });
    await db.aggregates.put({
      date: DATE,
      scope: "__all",
      payload: {} as unknown as ScanAggregates,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse(makeManifest(2)),
    );

    const scan = await loadScanManifest(DATE);

    expect(scan.record_count).toBe(2);
    expect(await db.domains.where("scan_date").equals(DATE).count()).toBe(0);
    expect(await db.records.where("scan_date").equals(DATE).count()).toBe(0);
    expect(await db.aggregates.where("date").equals(DATE).count()).toBe(0);
  });
});
