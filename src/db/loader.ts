/**
 * Browser-side data loading + caching for the dashboard.
 *
 * Three entry points:
 *   loadScansIndex()          list of available scans
 *   loadScanManifest(date)    per-scan metadata
 *   loadRecord(date, target)  full schema-v1 JSON for one target
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
 * All URLs are resolved relative to `import.meta.env.BASE_URL` so
 * the dashboard works at `/kemist-dashboard/` on GitHub Pages and at
 * `/` in `pnpm dev`.
 */

import { db, type ScanEntry } from "./dexie";
import type { DomainRow } from "../data/domainRow";
import type { KemistScanResultSchemaV1 } from "../data/schema";
import type { ScanManifest } from "../data/validate";

/** Entries in `public/data/scans/index.json`. */
export type ScansIndexEntry = {
  date: string;
  record_count: number;
};

function dataUrl(relative: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith("/") ? base : base + "/"}data/${relative}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/**
 * List of scans available on the published site. Ordered
 * newest-first by the fetch pipeline; callers can rely on
 * `result[0]` being the latest.
 */
export async function loadScansIndex(): Promise<ScansIndexEntry[]> {
  return fetchJson<ScansIndexEntry[]>(dataUrl("scans/index.json"));
}

/**
 * Load the per-scan manifest + cache it in Dexie's `scans` table.
 * Subsequent calls for the same date return the cached value.
 */
export async function loadScanManifest(date: string): Promise<ScanEntry> {
  const cached = await db.scans.get(date);
  if (cached) return cached;
  const manifest = await fetchJson<ScanManifest>(
    dataUrl(`${date}/manifest.json`),
  );
  const entry: ScanEntry = {
    date,
    manifest,
    record_count: manifest.target_count,
  };
  await db.scans.put(entry);
  return entry;
}

/**
 * Seed the Dexie `domains` table from `index.json` for a given
 * scan date. Only runs when the table is empty for that date —
 * subsequent calls short-circuit. Chunked inserts yield to the
 * event loop so the first load doesn't stall the main thread on
 * large scans.
 */
export async function ensureDomainsSeeded(date: string): Promise<void> {
  const existing = await db.domains
    .where("scan_date")
    .equals(date)
    .count();
  if (existing > 0) return;
  const rows = await fetchJson<DomainRow[]>(dataUrl(`${date}/index.json`));
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
  batch_id: string,
): Promise<KemistScanResultSchemaV1[]> {
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
  const url = dataUrl(`${date}/${batch_id}.jsonl.gz`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const text = isGzip
    ? await gunzipToText(buffer)
    : new TextDecoder("utf-8").decode(bytes);

  const records: KemistScanResultSchemaV1[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    records.push(JSON.parse(line) as KemistScanResultSchemaV1);
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
 * Load the full schema-v1 record for a single target, using Dexie
 * as a cache. On a miss, fetches the containing batch (which also
 * caches every other target in the batch for cheap subsequent
 * detail-view navigations).
 */
export async function loadRecord(
  date: string,
  target: string,
): Promise<KemistScanResultSchemaV1> {
  const cached = await db.records.get([target, date]);
  if (cached) return cached.record;

  // Need batch_id. The `domains` table has it as a column; seed
  // if not yet.
  await ensureDomainsSeeded(date);
  const row = await db.domains.get([target, date]);
  if (!row) {
    throw new Error(`target ${target} not found in scan ${date}`);
  }

  const records = await loadBatchAsRecords(date, row.batch_id);

  // Cache every record from this batch — they all share the same
  // batch fetch cost, so the dictionary update is free.
  await db.records.bulkPut(
    records.map((record) => ({
      target: record.scan.target,
      scan_date: date,
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
