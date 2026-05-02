#!/usr/bin/env node
/**
 * Pull scan(s) from S3 (or fixture), run HARD/SOFT consistency checks,
 * and emit the dashboard's `public/data/<scan_list>/<date>/` artifacts.
 * Invoked by the deploy workflow (mode=s3) and by developers (mode=fixture).
 *
 * Two scan lists ship with parallel artifact trees:
 *   public/data/federal-website-index/<date>/  ← federal, weekly
 *   public/data/top20k-sfw/<date>/             ← top-20k, monthly
 *
 * Per-scan layout:
 *   manifest.json           mirrored from S3 (includes scan_list,
 *                           metadata_s3_uri, failed_batches, etc.)
 *   index.json              DomainRow[] (table seed; carries per-target
 *                           organization/branch/OU/tags joined from the
 *                           sidecar)
 *   aggregates.json         summary cards + charts
 *   batch-NNN.jsonl.gz      raw NDJSON (detail view)
 *
 * Plus a global cross-list registry:
 *   public/data/scans/index.json  [{ date, scan_list, record_count }, ...]
 */

import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { gunzipSync, gzipSync } from "node:zlib";
import { Readable } from "node:stream";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { KemistScanResultSchemaV2 } from "../src/data/schema";
import type { DomainRow } from "../src/data/domainRow";
import { toDomainRow } from "../src/data/transform";
import {
  buildRecordValidator,
  expectedBatchKey,
  scanListS3Prefix,
  validateScan,
  type ParsedBatch,
  type ScanManifest,
} from "../src/data/validate";
import { buildAggregates } from "../src/data/aggregate";
import {
  ALL_SCAN_LISTS,
  DEFAULT_SCAN_LIST,
  isScanList,
  type ScanList,
} from "../src/data/scanList";
import {
  parseMetadataJsonl,
  type TargetMetadata,
} from "../src/data/metadata";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const schemaPath = path.join(repoRoot, "schemas", "output-v1.json");
const publicDataDir = path.join(repoRoot, "public", "data");

// ──────────────────────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────────────────────
type Mode =
  | { kind: "s3"; bucket: string; date?: string; scan_list?: ScanList }
  | { kind: "fixture"; date?: string; scan_list?: ScanList };

function parseArgs(argv: string[]): Mode {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg.startsWith("--")) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args.set(arg.slice(2), next);
        i++;
      } else {
        args.set(arg.slice(2), "true");
      }
    }
  }
  const listArg = args.get("list");
  const scan_list =
    listArg && isScanList(listArg) ? listArg : undefined;
  if (listArg && !scan_list) {
    throw new Error(
      `fetch-scan: --list ${listArg} is not one of ${ALL_SCAN_LISTS.join(", ")}`,
    );
  }
  if (args.get("mode") === "fixture") {
    return { kind: "fixture", date: args.get("date"), scan_list };
  }
  const bucket = args.get("bucket") ?? process.env.DATA_BUCKET;
  if (!bucket) {
    throw new Error(
      "fetch-scan: --bucket <name> or DATA_BUCKET env required in s3 mode",
    );
  }
  return { kind: "s3", bucket, date: args.get("date"), scan_list };
}

// ──────────────────────────────────────────────────────────────
// S3 helpers
// ──────────────────────────────────────────────────────────────
async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (body instanceof Buffer) return body;
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const c of body) {
      chunks.push(typeof c === "string" ? Buffer.from(c) : (c as Buffer));
    }
    return Buffer.concat(chunks);
  }
  // Newer SDK types expose .transformToByteArray()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyBody = body as any;
  if (anyBody && typeof anyBody.transformToByteArray === "function") {
    const bytes = (await anyBody.transformToByteArray()) as Uint8Array;
    return Buffer.from(bytes);
  }
  throw new Error("unsupported S3 body type");
}

async function listLatestScanDate(
  s3: S3Client,
  bucket: string,
  prefix: string,
): Promise<string | null> {
  const out = await s3.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      Delimiter: "/",
    }),
  );
  const prefixes = (out.CommonPrefixes ?? []).map((p) => p.Prefix ?? "");
  // Prefixes look like "<prefix>dt=YYYY-MM-DD/". Extract the date and
  // pick the lex-max (= latest since it's ISO).
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}dt=(\\d{4}-\\d{2}-\\d{2})/$`);
  const dates = prefixes
    .map((p) => p.match(re)?.[1])
    .filter((d): d is string => !!d);
  if (dates.length === 0) {
    // Top-20k may legitimately have zero scans yet; let the caller
    // decide whether this is fatal or "skip this list."
    return null;
  }
  dates.sort();
  return dates[dates.length - 1]!;
}

async function s3GetText(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<string> {
  const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await streamToBuffer(out.Body);
  return body.toString("utf8");
}

type S3GetResult =
  | { kind: "ok"; text: string }
  | { kind: "absent"; reason: "missing" | "forbidden" };

/**
 * Fetch an S3 object as text, distinguishing four outcomes:
 *   - ok          : object existed and we read it.
 *   - absent/missing  : object isn't there (NoSuchKey / NotFound).
 *   - absent/forbidden: object may or may not exist but we can't read
 *                       it (AccessDenied). S3 deliberately returns 403
 *                       on un-listable prefixes to avoid leaking the
 *                       presence/absence of objects, so the bucket
 *                       owner shouldn't infer anything from this.
 *
 * Anything else is a genuine error and re-thrown.
 *
 * Splitting these is what lets the deploy ship gracefully when the
 * sidecar is permissionally unreachable while still surfacing a
 * loud warning so the operator notices and updates IAM.
 */
async function s3GetTextOptional(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<S3GetResult> {
  try {
    const text = await s3GetText(s3, bucket, key);
    return { kind: "ok", text };
  } catch (e) {
    const name = (e as { name?: string })?.name ?? "";
    if (name === "NoSuchKey" || name === "NotFound") {
      return { kind: "absent", reason: "missing" };
    }
    if (name === "AccessDenied") {
      return { kind: "absent", reason: "forbidden" };
    }
    throw e;
  }
}

async function s3GetBytes(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<Buffer> {
  const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return streamToBuffer(out.Body);
}

/**
 * Parse an `s3://bucket/key/path` URI. Returns null on malformed
 * input so callers can SOFT-warn rather than HARD-fail on a typo.
 */
function parseS3Uri(uri: string): { bucket: string; key: string } | null {
  const m = uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return { bucket: m[1]!, key: m[2]! };
}

// ──────────────────────────────────────────────────────────────
// Parse NDJSON from gzipped bytes (used by both S3 and fixture paths)
// ──────────────────────────────────────────────────────────────
function parseNdjson(gzBody: Buffer): KemistScanResultSchemaV2[] {
  const body = gzipSniff(gzBody) ? gunzipSync(gzBody) : gzBody;
  const text = body.toString("utf8");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  return lines.map((line, i) => {
    try {
      return JSON.parse(line) as KemistScanResultSchemaV2;
    } catch (e) {
      throw new Error(
        `malformed NDJSON line ${i}: ${(e as Error).message} — ${line.slice(0, 80)}…`,
      );
    }
  });
}

function gzipSniff(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

// ──────────────────────────────────────────────────────────────
// Mode implementations — each returns a per-list "FetchedScan"
// ──────────────────────────────────────────────────────────────
type FetchedScan = {
  scan_list: ScanList;
  scan_date: string;
  manifestJson: string;
  manifest: ScanManifest;
  batchFiles: Array<{ batch_id: string; bytes: Buffer }>;
  metadata: Map<string, TargetMetadata>;
};

async function fetchFromS3ForList(
  s3: S3Client,
  bucket: string,
  scan_list: ScanList,
  pinnedDate: string | undefined,
): Promise<FetchedScan | null> {
  const prefix = scanListS3Prefix(scan_list);
  const scan_date =
    pinnedDate ?? (await listLatestScanDate(s3, bucket, prefix));
  if (!scan_date) {
    console.log(
      `fetch-scan: no scans found under s3://${bucket}/${prefix} for ${scan_list}; skipping`,
    );
    return null;
  }
  console.log(
    `fetch-scan: scan_list=${scan_list} scan_date=${scan_date} bucket=${bucket}`,
  );
  const manifestKey = `${prefix}dt=${scan_date}/manifest.json`;
  const manifestJson = await s3GetText(s3, bucket, manifestKey);
  const manifest = JSON.parse(manifestJson) as ScanManifest;

  const batchFiles: Array<{ batch_id: string; bytes: Buffer }> = [];
  for (const entry of manifest.batches) {
    const m = entry.key.match(/\/(batch-\d+)\.jsonl\.gz$/);
    if (!m) {
      throw new Error(`manifest batch entry has unexpected key: ${entry.key}`);
    }
    const batch_id = m[1]!;
    const bytes = await s3GetBytes(s3, bucket, entry.key);
    batchFiles.push({ batch_id, bytes });
  }

  // Sidecar fetch — best-effort. Absent or empty is a SOFT-warned
  // condition; rows just get null metadata fields.
  const metadata = await fetchSidecarFromS3(s3, manifest);

  return {
    scan_list,
    scan_date,
    manifestJson,
    manifest,
    batchFiles,
    metadata,
  };
}

async function fetchSidecarFromS3(
  s3: S3Client,
  manifest: ScanManifest,
): Promise<Map<string, TargetMetadata>> {
  if (!manifest.metadata_s3_uri) return new Map();
  const parsed = parseS3Uri(manifest.metadata_s3_uri);
  if (!parsed) {
    console.warn(
      `fetch-scan: malformed metadata_s3_uri ${manifest.metadata_s3_uri}; ignoring sidecar`,
    );
    return new Map();
  }
  const result = await s3GetTextOptional(s3, parsed.bucket, parsed.key);
  if (result.kind === "absent") {
    if (result.reason === "forbidden") {
      // The dashboard reader role's identity-based policy doesn't
      // grant s3:GetObject on the sidecar prefix. The role lives in
      // this repo (provisioned by scripts/bootstrap-dashboard.sh);
      // re-running that script picks up any policy edits. Don't
      // block the deploy — partial-data publication is more useful
      // than a 403 wall.
      console.warn(
        `fetch-scan: ⚠ AccessDenied reading metadata sidecar at ${manifest.metadata_s3_uri}.`,
      );
      console.warn(
        `fetch-scan:   The dashboard reader role needs s3:GetObject on this prefix. ` +
          `Re-run scripts/bootstrap-dashboard.sh to apply the latest inline policy.`,
      );
      console.warn(
        `fetch-scan:   Per-target organization/branch/tags will be empty until the ` +
          `policy is updated; TLS posture aggregates remain accurate.`,
      );
    } else {
      console.warn(
        `fetch-scan: metadata sidecar absent at ${manifest.metadata_s3_uri}; ` +
          `rows will have empty per-target metadata`,
      );
    }
    return new Map();
  }
  return parseMetadataJsonl(result.text);
}

async function fetchFromFixtureForList(
  scan_list: ScanList,
): Promise<FetchedScan | null> {
  // Deterministic per-list fixtures:
  //   federal-website-index → fixtures/nist-gov.jsonl + fixtures/metadata/federal.jsonl
  //   top20k-sfw            → fixtures/top20k-sample.jsonl + fixtures/metadata/top20k.jsonl
  const fixtureFile =
    scan_list === "federal-website-index"
      ? "nist-gov.jsonl"
      : "top20k-sample.jsonl";
  const sidecarFile =
    scan_list === "federal-website-index"
      ? "metadata/federal.jsonl"
      : "metadata/top20k.jsonl";
  const scan_date = "2026-01-02";
  const fixturePath = path.join(repoRoot, "fixtures", fixtureFile);
  let fixtureText: string;
  try {
    fixtureText = await fs.readFile(fixturePath, "utf8");
  } catch {
    // Top-20k fixture may be missing during incremental development;
    // skip the list rather than crash.
    console.log(
      `fetch-scan: fixture ${fixtureFile} not found; skipping ${scan_list}`,
    );
    return null;
  }

  const trimmed = fixtureText.trim();
  const records: KemistScanResultSchemaV2[] = (() => {
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as
        | KemistScanResultSchemaV2
        | KemistScanResultSchemaV2[];
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return trimmed
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as KemistScanResultSchemaV2);
    }
  })();

  const batchBody = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  const bytes = gzipSync(Buffer.from(batchBody, "utf8"));

  // Sidecar — optional; if missing, rows just get null metadata.
  let metadata = new Map<string, TargetMetadata>();
  let sidecarFixturePath: string | null = null;
  try {
    const fullPath = path.join(repoRoot, "fixtures", sidecarFile);
    const sidecarText = await fs.readFile(fullPath, "utf8");
    metadata = parseMetadataJsonl(sidecarText);
    sidecarFixturePath = fullPath;
  } catch {
    // Sidecar absent in fixture mode is fine — exercises the
    // "no metadata" code path for free.
  }

  const manifest: ScanManifest = {
    scan_date,
    scan_list,
    scan_start: "2026-01-02T02:00:00Z",
    scan_end: "2026-01-02T02:10:00Z",
    batch_count: 1,
    target_count: records.length,
    // Mirror the contract: when a sidecar is present, advertise it on
    // the manifest with a `fixture:` scheme. Suppresses the SOFT warn
    // for the "manifest has scan_list but no metadata_s3_uri" case
    // when the metadata is actually present.
    ...(sidecarFixturePath
      ? { metadata_s3_uri: `fixture://${sidecarFixturePath}` }
      : {}),
    batches: [
      {
        key: expectedBatchKey(scan_date, scan_list, "batch-001"),
        size_bytes: bytes.length,
        record_count: records.length,
        schema_version: "2.0.0",
      },
    ],
  };

  return {
    scan_list,
    scan_date,
    manifestJson: JSON.stringify(manifest, null, 2),
    manifest,
    batchFiles: [{ batch_id: "batch-001", bytes }],
    metadata,
  };
}

// ──────────────────────────────────────────────────────────────
// Emit artifacts
// ──────────────────────────────────────────────────────────────
async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function writeScanArtifacts(
  scan_list: ScanList,
  scan_date: string,
  manifestJson: string,
  rows: DomainRow[],
  aggregates: unknown,
  batchFiles: Array<{ batch_id: string; bytes: Buffer }>,
): Promise<void> {
  const scanDir = path.join(publicDataDir, scan_list, scan_date);
  await ensureDir(scanDir);
  await fs.writeFile(path.join(scanDir, "manifest.json"), manifestJson);
  // index.json carries the full DomainRow table seed for one scan
  // and grows with cohort size — top-20k crosses Cloudflare Pages'
  // 25 MiB per-file deploy limit uncompressed. Gzip it on disk; the
  // loader handles `.json.gz` transparently (same magic-byte sniffing
  // as batch files).
  const indexBytes = gzipSync(
    Buffer.from(JSON.stringify(rows, null, 0), "utf8"),
  );
  await fs.writeFile(path.join(scanDir, "index.json.gz"), indexBytes);
  await fs.writeFile(
    path.join(scanDir, "aggregates.json"),
    JSON.stringify(aggregates, null, 2),
  );
  for (const { batch_id, bytes } of batchFiles) {
    await fs.writeFile(path.join(scanDir, `${batch_id}.jsonl.gz`), bytes);
  }
}

type ScansIndexEntry = {
  date: string;
  scan_list: ScanList;
  record_count: number;
};

async function updateScansIndex(
  scan_list: ScanList,
  scan_date: string,
  total: number,
): Promise<void> {
  const scansDir = path.join(publicDataDir, "scans");
  await ensureDir(scansDir);
  const indexPath = path.join(scansDir, "index.json");
  let existing: ScansIndexEntry[] = [];
  try {
    const raw = await fs.readFile(indexPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      // Filter to rows that look like the new shape; legacy single-list
      // entries (no scan_list field) are dropped — they'll be
      // regenerated on the next deploy.
      existing = parsed.filter(
        (e): e is ScansIndexEntry =>
          !!e &&
          typeof e === "object" &&
          isScanList((e as { scan_list: unknown }).scan_list),
      );
    }
  } catch {
    // First run; leave the array empty.
  }
  const without = existing.filter(
    (e) => !(e.date === scan_date && e.scan_list === scan_list),
  );
  without.push({ date: scan_date, scan_list, record_count: total });
  // Newest scan first, then break ties by scan_list for stable output.
  without.sort(
    (a, b) =>
      b.date.localeCompare(a.date) || a.scan_list.localeCompare(b.scan_list),
  );
  await fs.writeFile(indexPath, JSON.stringify(without, null, 2));
}

// ──────────────────────────────────────────────────────────────
// Main — process one or both scan lists
// ──────────────────────────────────────────────────────────────
async function processScan(
  fetched: FetchedScan,
  validateRecord: ReturnType<typeof buildRecordValidator>,
): Promise<void> {
  const parsedBatches: ParsedBatch[] = fetched.batchFiles.map(
    ({ batch_id, bytes }) => ({
      batch_id,
      records: parseNdjson(bytes),
    }),
  );

  const validation = validateScan(
    fetched.manifest,
    parsedBatches,
    validateRecord,
  );

  if (!validation.ok) {
    console.error(
      `fetch-scan: HARD FAIL on ${fetched.scan_list} ${fetched.scan_date} — aborting deploy`,
    );
    for (const msg of validation.hardFailures) {
      console.error("  -", msg);
    }
    process.exit(2);
  }
  if (validation.softWarnings.length > 0) {
    console.warn(
      `fetch-scan: SOFT WARNINGS for ${fetched.scan_list} ${fetched.scan_date} (deploy continues):`,
    );
    for (const msg of validation.softWarnings) {
      console.warn("  -", msg);
    }
  }

  const rows: DomainRow[] = [];
  for (const batch of parsedBatches) {
    for (const record of batch.records) {
      rows.push(
        toDomainRow(record, {
          scan_date: fetched.scan_date,
          batch_id: batch.batch_id,
          scan_list: fetched.scan_list,
          metadata: fetched.metadata,
        }),
      );
    }
  }

  const aggregates = buildAggregates(
    rows,
    fetched.scan_date,
    fetched.scan_list,
    validation.softWarnings,
  );

  await writeScanArtifacts(
    fetched.scan_list,
    fetched.scan_date,
    fetched.manifestJson,
    rows,
    aggregates,
    fetched.batchFiles,
  );
  await updateScansIndex(fetched.scan_list, fetched.scan_date, rows.length);

  console.log(
    `fetch-scan: wrote ${rows.length} records to public/data/${fetched.scan_list}/${fetched.scan_date}/`,
  );
}

async function main(): Promise<void> {
  const mode = parseArgs(process.argv.slice(2));
  const schemaJson = JSON.parse(await fs.readFile(schemaPath, "utf8"));
  const validateRecord = buildRecordValidator(schemaJson);

  // When --list isn't passed, process every list. When the explicit
  // list has no scans (top-20k may not have run yet), skip silently.
  const scanLists: readonly ScanList[] = mode.scan_list
    ? [mode.scan_list]
    : ALL_SCAN_LISTS;

  if (mode.kind === "s3") {
    const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
    let any = false;
    for (const list of scanLists) {
      const fetched = await fetchFromS3ForList(s3, mode.bucket, list, mode.date);
      if (!fetched) continue;
      await processScan(fetched, validateRecord);
      any = true;
    }
    if (!any) {
      throw new Error(
        "fetch-scan: no scans found for any list; nothing written",
      );
    }
    return;
  }

  // Fixture mode.
  let any = false;
  for (const list of scanLists) {
    const fetched = await fetchFromFixtureForList(list);
    if (!fetched) continue;
    await processScan(fetched, validateRecord);
    any = true;
  }
  if (!any) {
    // Single-list invocation that found nothing — degrade to default.
    const fallback = await fetchFromFixtureForList(DEFAULT_SCAN_LIST);
    if (!fallback) {
      throw new Error(
        "fetch-scan: no fixtures available; expected fixtures/nist-gov.jsonl",
      );
    }
    await processScan(fallback, validateRecord);
  }
}

await main();
