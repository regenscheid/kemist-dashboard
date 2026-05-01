/**
 * IndexedDB cache — Dexie wrapper.
 *
 * Schema v2 (orchestrator-contract rev) extends the keys with
 * `scan_list` so the federal weekly and top-20k monthly corpora
 * share one DB without colliding:
 *
 *   meta        - key/value store for small singletons
 *   scans       - one entry per (date, scan_list), holds manifest +
 *                 summary
 *   domains     - one row per (target, scan_date, scan_list); seeded
 *                 from `public/data/<scan_list>/<date>/index.json`
 *                 on first visit
 *   records     - full schema-v2 JSON for a target, lazily hydrated
 *                 from the containing batch on detail-view click
 *   aggregates  - pre-computed chart + card payloads per
 *                 (date, scan_list, scope)
 *
 * The composite keys are load-bearing: even if today's two lists are
 * disjoint, the schema reflects the scan's identity, not a coincidence
 * about the data. A v3 bump that further partitions (e.g. a third list)
 * just appends another segment.
 */

import Dexie, { type Table } from "dexie";
import type { DomainRow } from "../data/domainRow";
import type { KemistScanResultSchemaV2 } from "../data/schema";
import type { ScanAggregates } from "../data/aggregate";
import type { ScanList } from "../data/scanList";
import type { ScanManifest } from "../data/validate";

/** Meta table rows. Used for small singletons (last-seen scan, etc.). */
export type MetaEntry = { key: string; value: unknown };

/** One row per (scan_date, scan_list) pair. */
export type ScanEntry = {
  date: string;
  scan_list: ScanList;
  manifest: ScanManifest;
  record_count: number;
};

/** Record cache row — full schema-v2 JSON. */
export type RecordEntry = {
  target: string;
  scan_date: string;
  scan_list: ScanList;
  record: KemistScanResultSchemaV2;
};

/** Aggregate cache row — one per (date, scan_list, scope). */
export type AggregateEntry = {
  date: string;
  scan_list: ScanList;
  scope: string;
  payload: ScanAggregates;
};

export class KemistDatabase extends Dexie {
  meta!: Table<MetaEntry, string>;
  scans!: Table<ScanEntry, [string, string]>;
  domains!: Table<DomainRow, [string, string, string]>;
  records!: Table<RecordEntry, [string, string, string]>;
  aggregates!: Table<AggregateEntry, [string, string, string]>;

  constructor() {
    super("kemist-dashboard");

    // v1 — pre-orchestrator-contract shape. Retained as the
    // declarative starting point so Dexie applies the v2 upgrade path
    // for browsers that opened the dashboard before the bump.
    this.version(1).stores({
      meta: "key",
      scans: "date",
      domains:
        "[target+scan_date], target, scan_date, scope, tls_version, error_count, pqc_signature, cert_expiry",
      records: "[target+scan_date], target, scan_date",
      aggregates: "[date+scope]",
    });

    // v2 — composite keys gain `scan_list`. The build-id wipe in
    // loader.ts is a safety net; the explicit upgrade hook is the
    // contract: every legacy row gets cleared on first open at v2,
    // forcing a fresh re-seed from the (now list-aware) public/data
    // artifacts.
    this.version(2)
      .stores({
        meta: "key",
        scans: "[date+scan_list], date, scan_list",
        // Compound secondary indexes:
        //   [scan_date+scan_list]: list-scoped queries
        //                          (used by ensureDomainsSeeded, clearScanCaches)
        domains:
          "[target+scan_date+scan_list], [scan_date+scan_list], target, scan_date, scan_list, scope, tls_version, error_count, pqc_signature, cert_expiry, top20k_rank",
        records:
          "[target+scan_date+scan_list], [scan_date+scan_list], target, scan_date, scan_list",
        aggregates:
          "[date+scan_list+scope], [date+scan_list], date, scan_list",
      })
      .upgrade(async (tx) => {
        // Composite keys changed; legacy rows can't be migrated 1:1
        // because they lack scan_list. Clear and let the loader
        // re-seed from the published list-aware artifacts.
        await Promise.all([
          tx.table("scans").clear(),
          tx.table("domains").clear(),
          tx.table("records").clear(),
          tx.table("aggregates").clear(),
          // Drop manifest signatures + scans-index signature so the
          // freshness check in loader.ts notices the schema rev.
          tx.table("meta").clear(),
        ]);
      });
  }
}

/**
 * Module-level singleton so every call site shares one DB connection.
 * In tests, `resetDatabase()` clears all tables without closing — that
 * matches Dexie's recommended per-test hygiene.
 */
export const db = new KemistDatabase();

const DB_NAME = "kemist-dashboard";
const OPEN_TIMEOUT_MS = 5000;

function reloadPage(): void {
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}

/**
 * Recovery path for stuck IndexedDB upgrades. Every table in this DB is
 * a cache of artifacts under `public/data/`, so wiping it loses nothing —
 * the next page load reseeds. Used when a schema upgrade is blocked by
 * another tab, or `db.open()` doesn't resolve within `OPEN_TIMEOUT_MS`.
 */
function recoverFromStuckOpen(reason: string): void {
  console.warn(`kemist-dashboard: ${reason}; resetting IndexedDB.`);
  try {
    db.close();
  } catch {
    // Already closed or never opened — fine, we're about to delete it.
  }
  Dexie.delete(DB_NAME).finally(reloadPage);
}

// If a newer-schema tab opens, IndexedDB sends `versionchange` to this
// connection. Dexie installs a default handler, but we make it explicit
// + reload so any in-flight UI work doesn't hit a closed DB.
db.on("versionchange", () => {
  db.close();
  reloadPage();
});

// Our own upgrade is blocked by another connection that didn't release
// on `versionchange` (e.g., a backgrounded tab). Without this handler
// `db.open()` hangs forever and every Dexie call awaits it, freezing
// the page until the user clears storage.
db.on("blocked", () => {
  recoverFromStuckOpen("IndexedDB upgrade blocked by another tab");
});

// Backstop: even with the handlers above, a wedged transaction or
// browser-specific bug can keep `open()` from resolving. Force-recover
// after a short grace period rather than leaving the UI hung.
if (typeof window !== "undefined") {
  const timer = window.setTimeout(() => {
    recoverFromStuckOpen("IndexedDB open timed out");
  }, OPEN_TIMEOUT_MS);
  db.open()
    .then(() => window.clearTimeout(timer))
    .catch((err) => {
      window.clearTimeout(timer);
      recoverFromStuckOpen(`IndexedDB open failed: ${(err as Error).message}`);
    });
}

export async function resetDatabase(): Promise<void> {
  await Promise.all([
    db.meta.clear(),
    db.scans.clear(),
    db.domains.clear(),
    db.records.clear(),
    db.aggregates.clear(),
  ]);
}
