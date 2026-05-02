/**
 * Browser-side data loading + caching for the dashboard.
 *
 * Five entry points (every one is scan-list aware in v2):
 *   loadScansIndex()                          all available (date, scan_list) tuples
 *   loadScanManifest(date, list)              per-scan metadata
 *   ensureDomainsSeeded(date, list)           seed Dexie `domains` from index.json
 *   loadBatchAsRecords(date, list, batch_id)  decompress + parse one batch
 *   loadRecord(date, list, target)            full schema-v2 JSON for one target
 *
 * `loadRecord` is the hot path for the detail view. Flow:
 *   1. Check Dexie `records` for a cached entry → return immediately
 *      if present.
 *   2. Resolve the target's `batch_id` from `index.json` (cached in
 *      Dexie `domains` after first fetch).
 *   3. Fetch `batch-NNN.jsonl.gz`, stream through the browser's
 *      native `DecompressionStream('gzip')` → NDJSON text → parse.
 *   4. Bulk-insert every record from the batch into Dexie `records`
 *      so subsequent targets in the same batch are instant.
 *
 * URL convention: `${BASE_URL}data/<scan_list>/<date>/<file>`. Works
 * at `/kemist-dashboard/` on GitHub Pages and at `/` in `pnpm dev`.
 */

import { db, resetDatabase, type ScanEntry } from "./dexie";
import type { DomainRow } from "../data/domainRow";
import type { KemistScanResultSchemaV2 } from "../data/schema";
import type { ScanList } from "../data/scanList";
import { isScanList } from "../data/scanList";
import type { ScanManifest } from "../data/validate";

/** Entries in `public/data/scans/index.json`. */
export type ScansIndexEntry = {
  date: string;
  scan_list: ScanList;
  record_count: number;
};

const BUILD_META_KEY = "app-build-id";
const SCANS_INDEX_META_KEY = "scans-index-signature";
const MANIFEST_SIGNATURE_PREFIX = "manifest-signature:";

function basePrefix(): string {
  const base = import.meta.env.BASE_URL;
  return base.endsWith("/") ? base : base + "/";
}

/** Top-level URL for the scans registry (cross-list). */
function scansIndexUrl(): string {
  return `${basePrefix()}data/scans/index.json`;
}

/** Per-scan asset URL: `${BASE_URL}data/<scan_list>/<date>/<file>`. */
function scanAssetUrl(
  scan_list: ScanList,
  date: string,
  file: string,
): string {
  return `${basePrefix()}data/${scan_list}/${date}/${file}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
  });
  if (!res.ok) {
    throw new Error(`fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/**
 * Fetch a JSON payload that may arrive gzipped. Same dual-server
 * handling as `loadBatchAsRecords`:
 *   - Vite dev / hosts that decompress transparently → bytes are
 *     already plain JSON, gzip magic absent.
 *   - GitHub Pages / Cloudflare Pages serving the .gz file as-is →
 *     bytes carry the 1f 8b magic and must be gunzipped client-side.
 *
 * Used by the index.json seed (compressed at fetch time so the
 * largest cohort's row table stays under deploy size limits).
 */
async function fetchGzippedJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const text = isGzip
    ? await gunzipToText(buffer)
    : new TextDecoder("utf-8").decode(bytes);
  return JSON.parse(text) as T;
}

function manifestSignature(manifest: ScanManifest): string {
  return JSON.stringify({
    scan_date: manifest.scan_date,
    scan_list: manifest.scan_list ?? null,
    scan_start: manifest.scan_start,
    scan_end: manifest.scan_end ?? null,
    metadata_s3_uri: manifest.metadata_s3_uri ?? null,
    batch_count: manifest.batch_count,
    target_count: manifest.target_count,
    error_count: manifest.error_count ?? 0,
    failed_batches: manifest.failed_batches ?? [],
    batches: manifest.batches.map((batch) => ({
      key: batch.key,
      size_bytes: batch.size_bytes,
      record_count: batch.record_count,
      error_count: batch.error_count ?? 0,
      schema_version: batch.schema_version,
    })),
  });
}

/** Composite key for the manifest signature in the meta table. */
function manifestSignatureKey(date: string, scan_list: ScanList): string {
  return `${MANIFEST_SIGNATURE_PREFIX}${scan_list}:${date}`;
}

async function clearAllCachedData(): Promise<void> {
  await resetDatabase();
}

async function clearScanCaches(
  date: string,
  scan_list: ScanList,
): Promise<void> {
  // Dexie's compound `where` uses the array form of the index.
  await Promise.all([
    db.scans.delete([date, scan_list]),
    db.domains
      .where("[scan_date+scan_list]")
      .equals([date, scan_list])
      .delete(),
    db.records
      .where("[scan_date+scan_list]")
      .equals([date, scan_list])
      .delete(),
    db.aggregates
      .where("[date+scan_list]")
      .equals([date, scan_list])
      .delete(),
    db.meta.delete(manifestSignatureKey(date, scan_list)),
  ]);
}

async function ensureBuildFreshness(): Promise<void> {
  const cached = await db.meta.get(BUILD_META_KEY);
  if (cached?.["value"] === __APP_BUILD_ID__) return;

  await clearAllCachedData();
  await db.meta.put({ key: BUILD_META_KEY, value: __APP_BUILD_ID__ });
}

/**
 * Cross-list scans registry. Ordered newest-first across both lists;
 * UI callers filter to a specific scan_list to drive list-scoped
 * date pickers / "latest" lookups.
 *
 * Always fetched with `cache: "no-store"` and treated as the
 * freshness oracle for the rest of the local IndexedDB cache. If the
 * published list changes, every derived table is dropped so the next
 * view reseeds from the current JSON.
 */
export async function loadScansIndex(): Promise<ScansIndexEntry[]> {
  await ensureBuildFreshness();

  const raw = await fetchJson<unknown>(scansIndexUrl());
  // Tolerate legacy single-list shape (no scan_list field) by filtering
  // it out — those entries are stale by construction once the orchestrator
  // ships v0.4.0 manifests.
  const scans: ScansIndexEntry[] = Array.isArray(raw)
    ? raw.filter(
        (e): e is ScansIndexEntry =>
          !!e &&
          typeof e === "object" &&
          isScanList((e as { scan_list: unknown }).scan_list),
      )
    : [];

  const signature = JSON.stringify(scans);
  const cachedSignature = await db.meta.get(SCANS_INDEX_META_KEY);

  if (cachedSignature?.["value"] !== signature) {
    await Promise.all([
      db.scans.clear(),
      db.domains.clear(),
      db.records.clear(),
      db.aggregates.clear(),
    ]);
    await db.meta.put({ key: SCANS_INDEX_META_KEY, value: signature });
  }

  return scans;
}

/**
 * Load the per-scan manifest and revalidate it on every visit. If the
 * published manifest changes for an existing (date, list), the per-scope
 * domain, record, and aggregate caches are discarded so the UI doesn't
 * keep serving stale data out of IndexedDB.
 */
export async function loadScanManifest(
  date: string,
  scan_list: ScanList,
): Promise<ScanEntry> {
  await ensureBuildFreshness();

  const manifest = await fetchJson<ScanManifest>(
    scanAssetUrl(scan_list, date, "manifest.json"),
  );
  const signature = manifestSignature(manifest);
  const signatureKey = manifestSignatureKey(date, scan_list);
  const cachedSignature = await db.meta.get(signatureKey);

  if (cachedSignature && cachedSignature["value"] !== signature) {
    await clearScanCaches(date, scan_list);
  }

  await db.meta.put({ key: signatureKey, value: signature });

  const entry: ScanEntry = {
    date,
    scan_list,
    manifest,
    record_count: manifest.target_count,
  };
  await db.scans.put(entry);
  return entry;
}

/**
 * Seed the Dexie `domains` table from `index.json` for a given
 * (scan_date, scan_list) pair. Only runs when the table is empty for
 * that pair — subsequent calls short-circuit. Chunked inserts yield
 * to the event loop so the first load doesn't stall the main thread
 * on large scans.
 */
export async function ensureDomainsSeeded(
  date: string,
  scan_list: ScanList,
): Promise<void> {
  const existing = await db.domains
    .where("[scan_date+scan_list]")
    .equals([date, scan_list])
    .count();
  if (existing > 0) return;
  const rows = await fetchGzippedJson<DomainRow[]>(
    scanAssetUrl(scan_list, date, "index.json.gz"),
  );
  const chunkSize = 5000;
  for (let i = 0; i < rows.length; i += chunkSize) {
    await db.domains.bulkPut(rows.slice(i, i + chunkSize));
    // Yield so a huge index doesn't block a click handler.
    if (i + chunkSize < rows.length) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}

export async function loadBatchAsRecords(
  date: string,
  scan_list: ScanList,
  batch_id: string,
): Promise<KemistScanResultSchemaV2[]> {
  // Batches are stored gzipped on disk. Two server behaviors to
  // accommodate:
  //   * Vite dev server: detects the .gz extension, returns
  //     `Content-Encoding: gzip`, the browser auto-decompresses —
  //     we get plain NDJSON from res.text().
  //   * GitHub Pages: serves .gz files as raw octets without
  //     Content-Encoding — we get the gzipped bytes verbatim and
  //     must decompress manually.
  //
  // Sniffing the first two bytes for the gzip magic (1f 8b) is the
  // reliable way to tell which case we're in without guessing from
  // response headers, which Pages strips.
  const url = scanAssetUrl(scan_list, date, `${batch_id}.jsonl.gz`);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const text = isGzip
    ? await gunzipToText(buffer)
    : new TextDecoder("utf-8").decode(bytes);

  const records: KemistScanResultSchemaV2[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    records.push(JSON.parse(line) as KemistScanResultSchemaV2);
  }
  return records;
}

/**
 * Stream raw gzip bytes through the browser's native
 * DecompressionStream and return the decompressed UTF-8 text.
 *
 * Uses `new Response(bytes).body` to let the browser produce a
 * properly-typed ReadableStream from the Uint8Array — building one
 * by hand runs into `ArrayBufferLike` vs `ArrayBuffer` narrowing
 * friction in current DOM lib types.
 */
async function gunzipToText(buffer: ArrayBuffer): Promise<string> {
  const source = new Response(buffer).body;
  if (!source) {
    throw new Error("gunzipToText: synthetic Response body is empty");
  }
  const decompressed = source.pipeThrough(new DecompressionStream("gzip"));
  return new Response(decompressed).text();
}

/**
 * Load the full schema-v2 record for a single target, using Dexie
 * as a cache. On a miss, fetches the containing batch (which also
 * caches every other target in the batch for cheap subsequent
 * detail-view navigations).
 */
export async function loadRecord(
  date: string,
  scan_list: ScanList,
  target: string,
): Promise<KemistScanResultSchemaV2> {
  await loadScanManifest(date, scan_list);

  const cached = await db.records.get([target, date, scan_list]);
  if (cached) return cached.record;

  // Need batch_id. The `domains` table has it as a column; seed
  // if not yet.
  await ensureDomainsSeeded(date, scan_list);
  const row = await db.domains.get([target, date, scan_list]);
  if (!row) {
    throw new Error(
      `target ${target} not found in scan ${scan_list} ${date}`,
    );
  }

  const records = await loadBatchAsRecords(date, scan_list, row.batch_id);

  // Cache every record from this batch — they all share the same
  // batch fetch cost, so the dictionary update is free.
  await db.records.bulkPut(
    records.map((record) => ({
      target: record.scan.target,
      scan_date: date,
      scan_list,
      record,
    })),
  );

  const match = records.find((r) => r.scan.target === target);
  if (!match) {
    throw new Error(
      `target ${target} present in index but missing from batch ${row.batch_id}`,
    );
  }
  return match;
}
