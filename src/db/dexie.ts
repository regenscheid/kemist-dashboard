/**
 * IndexedDB cache — Dexie wrapper.
 *
 * Schema v1 is the shape committed-to for the life of this dashboard
 * iteration. Tables are designed so PR 5 can layer the domain table
 * onto the same schema without a migration:
 *
 *   meta        - key/value store for small singletons
 *   scans       - one entry per scan_date, holds manifest + summary
 *   domains     - one row per (target, scan_date); seeded from
 *                 `public/data/<date>/index.json` on first visit
 *   records     - full schema-v1 JSON for a target, lazily hydrated
 *                 from the containing batch on detail-view click
 *   aggregates  - pre-computed chart + card payloads per
 *                 (scan_date, scope)
 *
 * The composite primary keys `[target+scan_date]` are load-bearing —
 * v1 rolling-history writes will use the same shape, so don't
 * simplify them to `target` alone even while only one scan exists.
 */

import Dexie, { type Table } from "dexie";
import type { DomainRow } from "../data/domainRow";
import type { KemistScanResultSchemaV1 } from "../data/schema";
import type { ScanAggregates } from "../data/aggregate";
import type { ScanManifest } from "../data/validate";

/** Meta table rows. Used for small singletons (last-seen scan, etc.). */
export type MetaEntry = { key: string; value: unknown };

/** One row per scan, keyed by ISO date. */
export type ScanEntry = {
  date: string;
  manifest: ScanManifest;
  record_count: number;
};

/** Record cache row — full schema-v1 JSON. */
export type RecordEntry = {
  target: string;
  scan_date: string;
  record: KemistScanResultSchemaV1;
};

/** Aggregate cache row — one per (date, scope). */
export type AggregateEntry = {
  date: string;
  scope: string;
  payload: ScanAggregates;
};

export class KemistDatabase extends Dexie {
  meta!: Table<MetaEntry, string>;
  scans!: Table<ScanEntry, string>;
  domains!: Table<DomainRow, [string, string]>;
  records!: Table<RecordEntry, [string, string]>;
  aggregates!: Table<AggregateEntry, [string, string]>;

  constructor() {
    super("kemist-dashboard");
    this.version(1).stores({
      meta: "key",
      scans: "date",
      domains:
        "[target+scan_date], target, scan_date, scope, tls_version, error_count, pqc_signature, cert_expiry",
      records: "[target+scan_date], target, scan_date",
      aggregates: "[date+scope]",
    });
  }
}

/**
 * Module-level singleton so every call site shares one DB connection.
 * In tests, `resetDatabase()` clears all tables without closing — that
 * matches Dexie's recommended per-test hygiene.
 */
export const db = new KemistDatabase();

export async function resetDatabase(): Promise<void> {
  await Promise.all([
    db.meta.clear(),
    db.scans.clear(),
    db.domains.clear(),
    db.records.clear(),
    db.aggregates.clear(),
  ]);
}
