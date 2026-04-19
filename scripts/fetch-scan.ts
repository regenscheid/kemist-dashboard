#!/usr/bin/env node
/**
 * Pull a scan from S3 (or a local fixture), run HARD/SOFT
 * consistency checks, and emit the dashboard's
 * `public/data/<date>/` artifacts. Invoked by the deploy workflow
 * (mode=s3) and by developers (mode=fixture).
 *
 * Artifacts produced per scan date:
 *   public/data/<date>/manifest.json         mirrored from S3
 *   public/data/<date>/index.json            DomainRow[] (table seed)
 *   public/data/<date>/aggregates.json       summary cards + charts
 *   public/data/<date>/batch-NNN.jsonl.gz    raw NDJSON (detail view)
 * Plus the global index:
 *   public/data/scans/index.json             [{ date, ... }, ...]
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

import type { KemistScanResultSchemaV1 } from "../src/data/schema";
import type { DomainRow } from "../src/data/domainRow";
import { toDomainRow } from "../src/data/transform";
import {
  buildRecordValidator,
  expectedBatchKey,
  validateScan,
  type ParsedBatch,
  type ScanManifest,
} from "../src/data/validate";
import { buildAggregates } from "../src/data/aggregate";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const schemaPath = path.join(repoRoot, "schemas", "output-v1.json");
const publicDataDir = path.join(repoRoot, "public", "data");

// ──────────────────────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────────────────────
type Mode = { kind: "s3"; bucket: string; date?: string } | {
  kind: "fixture";
  date?: string;
};

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
  if (args.get("mode") === "fixture") {
    return { kind: "fixture", date: args.get("date") };
  }
  const bucket = args.get("bucket") ?? process.env.DATA_BUCKET;
  if (!bucket) {
    throw new Error(
      "fetch-scan: --bucket <name> or DATA_BUCKET env required in s3 mode",
    );
  }
  return { kind: "s3", bucket, date: args.get("date") };
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
): Promise<string> {
  const out = await s3.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: "raw/",
      Delimiter: "/",
    }),
  );
  const prefixes = (out.CommonPrefixes ?? []).map((p) => p.Prefix ?? "");
  // Prefixes look like "raw/dt=YYYY-MM-DD/". Extract the date and
  // pick the lex-max (= latest since it's ISO).
  const dates = prefixes
    .map((p) => p.match(/^raw\/dt=(\d{4}-\d{2}-\d{2})\/$/)?.[1])
    .filter((d): d is string => !!d);
  if (dates.length === 0) {
    throw new Error(`no scan partitions found under s3://${bucket}/raw/`);
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

async function s3GetBytes(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<Buffer> {
  const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return streamToBuffer(out.Body);
}

// ──────────────────────────────────────────────────────────────
// Parse NDJSON from gzipped bytes (used by both S3 and fixture paths)
// ──────────────────────────────────────────────────────────────
function parseNdjson(gzBody: Buffer): KemistScanResultSchemaV1[] {
  const body = gzipSniff(gzBody) ? gunzipSync(gzBody) : gzBody;
  const text = body.toString("utf8");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  return lines.map((line, i) => {
    try {
      return JSON.parse(line) as KemistScanResultSchemaV1;
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
// Mode implementations
// ──────────────────────────────────────────────────────────────
async function fetchFromS3(mode: {
  kind: "s3";
  bucket: string;
  date?: string;
}): Promise<{
  scan_date: string;
  manifestJson: string;
  manifest: ScanManifest;
  batchFiles: Array<{ batch_id: string; bytes: Buffer }>;
}> {
  const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
  const scan_date = mode.date ?? (await listLatestScanDate(s3, mode.bucket));
  console.log(`fetch-scan: scan_date=${scan_date} bucket=${mode.bucket}`);
  const manifestKey = `raw/dt=${scan_date}/manifest.json`;
  const manifestJson = await s3GetText(s3, mode.bucket, manifestKey);
  const manifest = JSON.parse(manifestJson) as ScanManifest;

  const batchFiles: Array<{ batch_id: string; bytes: Buffer }> = [];
  for (const entry of manifest.batches) {
    const m = entry.key.match(/\/(batch-\d+)\.jsonl\.gz$/);
    if (!m) {
      throw new Error(`manifest batch entry has unexpected key: ${entry.key}`);
    }
    const batch_id = m[1]!;
    const bytes = await s3GetBytes(s3, mode.bucket, entry.key);
    batchFiles.push({ batch_id, bytes });
  }
  return { scan_date, manifestJson, manifest, batchFiles };
}

async function fetchFromFixture(): Promise<{
  scan_date: string;
  manifestJson: string;
  manifest: ScanManifest;
  batchFiles: Array<{ batch_id: string; bytes: Buffer }>;
}> {
  // Uses the real nist.gov record + crafted tri-state edge-case
  // record to simulate a tiny two-record scan. Deterministic.
  const scan_date = "2026-01-02";
  const fixtureJsonl = await fs.readFile(
    path.join(repoRoot, "fixtures", "nist-gov.jsonl"),
    "utf8",
  );

  const records: KemistScanResultSchemaV1[] = fixtureJsonl
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as KemistScanResultSchemaV1);

  const batchBody = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  const bytes = gzipSync(Buffer.from(batchBody, "utf8"));

  const manifest: ScanManifest = {
    scan_date,
    scan_start: "2026-01-02T02:00:00Z",
    scan_end: "2026-01-02T02:10:00Z",
    batch_count: 1,
    target_count: records.length,
    batches: [
      {
        key: expectedBatchKey(scan_date, "batch-001"),
        size_bytes: bytes.length,
        record_count: records.length,
        schema_version: "1.0.0",
      },
    ],
  };

  return {
    scan_date,
    manifestJson: JSON.stringify(manifest, null, 2),
    manifest,
    batchFiles: [{ batch_id: "batch-001", bytes }],
  };
}

// ──────────────────────────────────────────────────────────────
// Emit artifacts
// ──────────────────────────────────────────────────────────────
async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function writeScanArtifacts(
  scan_date: string,
  manifestJson: string,
  rows: DomainRow[],
  aggregates: unknown,
  batchFiles: Array<{ batch_id: string; bytes: Buffer }>,
): Promise<void> {
  const scanDir = path.join(publicDataDir, scan_date);
  await ensureDir(scanDir);
  await fs.writeFile(path.join(scanDir, "manifest.json"), manifestJson);
  await fs.writeFile(
    path.join(scanDir, "index.json"),
    JSON.stringify(rows, null, 0),
  );
  await fs.writeFile(
    path.join(scanDir, "aggregates.json"),
    JSON.stringify(aggregates, null, 2),
  );
  for (const { batch_id, bytes } of batchFiles) {
    await fs.writeFile(path.join(scanDir, `${batch_id}.jsonl.gz`), bytes);
  }
}

async function updateScansIndex(scan_date: string, total: number): Promise<void> {
  const scansDir = path.join(publicDataDir, "scans");
  await ensureDir(scansDir);
  const indexPath = path.join(scansDir, "index.json");
  let existing: Array<{ date: string; record_count: number }> = [];
  try {
    const raw = await fs.readFile(indexPath, "utf8");
    existing = JSON.parse(raw) as typeof existing;
  } catch {
    // First run; leave the array empty.
  }
  const without = existing.filter((e) => e.date !== scan_date);
  without.push({ date: scan_date, record_count: total });
  without.sort((a, b) => b.date.localeCompare(a.date));
  await fs.writeFile(indexPath, JSON.stringify(without, null, 2));
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const mode = parseArgs(process.argv.slice(2));
  const fetched =
    mode.kind === "s3" ? await fetchFromS3(mode) : await fetchFromFixture();

  // Parse every batch up-front so we can run consistency checks on
  // the full set before writing artifacts.
  const parsedBatches: ParsedBatch[] = fetched.batchFiles.map(
    ({ batch_id, bytes }) => ({
      batch_id,
      records: parseNdjson(bytes),
    }),
  );

  const schemaJson = JSON.parse(await fs.readFile(schemaPath, "utf8"));
  const validateRecord = buildRecordValidator(schemaJson);
  const validation = validateScan(
    fetched.manifest,
    parsedBatches,
    validateRecord,
  );

  if (!validation.ok) {
    console.error("fetch-scan: HARD FAIL — aborting deploy");
    for (const msg of validation.hardFailures) {
      console.error("  -", msg);
    }
    process.exit(2);
  }
  if (validation.softWarnings.length > 0) {
    console.warn("fetch-scan: SOFT WARNINGS (deploy continues):");
    for (const msg of validation.softWarnings) {
      console.warn("  -", msg);
    }
  }

  // Flatten to DomainRow[]; preserve order for stable diffs.
  const rows: DomainRow[] = [];
  for (const batch of parsedBatches) {
    for (const record of batch.records) {
      rows.push(
        toDomainRow(record, {
          scan_date: fetched.scan_date,
          batch_id: batch.batch_id,
        }),
      );
    }
  }

  const aggregates = buildAggregates(
    rows,
    fetched.scan_date,
    validation.softWarnings,
  );

  await writeScanArtifacts(
    fetched.scan_date,
    fetched.manifestJson,
    rows,
    aggregates,
    fetched.batchFiles,
  );
  await updateScansIndex(fetched.scan_date, rows.length);

  console.log(
    `fetch-scan: wrote ${rows.length} records to public/data/${fetched.scan_date}/`,
  );
}

await main();
