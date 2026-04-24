import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { KemistScanResultSchemaV1 } from "./schema";
import {
  buildRecordValidator,
  expectedBatchKey,
  validateScan,
  type ParsedBatch,
  type ScanManifest,
} from "./validate";

// Load the vendored schema + a real record for driving the checks.
const schema = JSON.parse(
  readFileSync(
    path.join(__dirname, "../../schemas/output-v1.json"),
    "utf8",
  ),
) as Record<string, unknown>;
const nistRecord: KemistScanResultSchemaV1 = JSON.parse(
  readFileSync(path.join(__dirname, "../../fixtures/nist-gov.jsonl"), "utf8"),
) as KemistScanResultSchemaV1;

function makeManifest(batches: { batch_id: string; count: number }[]): ScanManifest {
  return {
    scan_date: "2026-04-19",
    scan_start: "2026-04-19T02:00:00Z",
    batch_count: batches.length,
    target_count: batches.reduce((s, b) => s + b.count, 0),
    batches: batches.map((b) => ({
      key: expectedBatchKey("2026-04-19", b.batch_id),
      size_bytes: 1024,
      record_count: b.count,
      schema_version: "1.0.0",
    })),
  };
}

function clone(record: KemistScanResultSchemaV1): KemistScanResultSchemaV1 {
  return JSON.parse(JSON.stringify(record)) as KemistScanResultSchemaV1;
}

describe("buildRecordValidator", () => {
  it("accepts the real nist.gov record", () => {
    const validate = buildRecordValidator(schema);
    expect(validate(nistRecord)).toBe(true);
  });

  it("rejects records with schema_version !== 1.0.0 (Ajv const check)", () => {
    const validate = buildRecordValidator(schema);
    const bad = clone(nistRecord);
    (bad as unknown as { schema_version: string }).schema_version = "2.0.0";
    expect(validate(bad)).toBe(false);
  });
});

describe("validateScan — HARD FAIL branches", () => {
  const validate = buildRecordValidator(schema);

  it("passes on a consistent single-batch scan", () => {
    const manifest = makeManifest([{ batch_id: "batch-001", count: 1 }]);
    const batches: ParsedBatch[] = [
      { batch_id: "batch-001", records: [clone(nistRecord)] },
    ];
    const result = validateScan(manifest, batches, validate);
    expect(result.ok).toBe(true);
    expect(result.hardFailures).toEqual([]);
  });

  it("flags schema major mismatch as HARD", () => {
    const manifest = makeManifest([{ batch_id: "batch-001", count: 1 }]);
    const bad = clone(nistRecord);
    (bad as unknown as { schema_version: string }).schema_version = "2.0.0";
    const batches: ParsedBatch[] = [{ batch_id: "batch-001", records: [bad] }];
    const result = validateScan(manifest, batches, validate);
    expect(result.ok).toBe(false);
    expect(result.hardFailures.some((m) => m.includes("schema_version"))).toBe(
      true,
    );
  });

  it("flags manifest ↔ batch file mismatch", () => {
    const manifest = makeManifest([
      { batch_id: "batch-001", count: 1 },
      { batch_id: "batch-002", count: 1 }, // referenced but missing
    ]);
    const batches: ParsedBatch[] = [
      { batch_id: "batch-001", records: [clone(nistRecord)] },
    ];
    const result = validateScan(manifest, batches, validate);
    expect(result.ok).toBe(false);
    expect(result.hardFailures.some((m) => m.includes("batch-002"))).toBe(true);
  });

  it("flags duplicate targets across batches", () => {
    const manifest = makeManifest([
      { batch_id: "batch-001", count: 1 },
      { batch_id: "batch-002", count: 1 },
    ]);
    const copy = clone(nistRecord);
    const batches: ParsedBatch[] = [
      { batch_id: "batch-001", records: [clone(nistRecord)] },
      { batch_id: "batch-002", records: [copy] },
    ];
    const result = validateScan(manifest, batches, validate);
    expect(result.ok).toBe(false);
    expect(
      result.hardFailures.some(
        (m) => m.includes("nist.gov:443") && m.includes("both"),
      ),
    ).toBe(true);
  });

  it("flags probed_kx_groups divergence across batches", () => {
    const manifest = makeManifest([
      { batch_id: "batch-001", count: 1 },
      { batch_id: "batch-002", count: 1 },
    ]);
    const divergent = clone(nistRecord);
    divergent.capabilities.probed_kx_groups = [
      ...divergent.capabilities.probed_kx_groups,
      "NonStandardGroup",
    ];
    divergent.scan = { ...divergent.scan, target: "other.gov:443", host: "other.gov" };
    const batches: ParsedBatch[] = [
      { batch_id: "batch-001", records: [clone(nistRecord)] },
      { batch_id: "batch-002", records: [divergent] },
    ];
    const result = validateScan(manifest, batches, validate);
    expect(result.ok).toBe(false);
    expect(
      result.hardFailures.some((m) => m.includes("probed_kx_groups")),
    ).toBe(true);
  });
});

describe("validateScan — SOFT WARN branches", () => {
  const validate = buildRecordValidator(schema);

  it("warns on mixed scanner versions without aborting", () => {
    const manifest = makeManifest([
      { batch_id: "batch-001", count: 1 },
      { batch_id: "batch-002", count: 1 },
    ]);
    const other = clone(nistRecord);
    other.scanner = { ...other.scanner, version: "0.2.1" };
    other.scan = { ...other.scan, target: "other.gov:443", host: "other.gov" };
    const batches: ParsedBatch[] = [
      { batch_id: "batch-001", records: [clone(nistRecord)] },
      { batch_id: "batch-002", records: [other] },
    ];
    const result = validateScan(manifest, batches, validate);
    expect(result.ok).toBe(true);
    expect(result.hardFailures).toEqual([]);
    expect(
      result.softWarnings.some((m) => m.includes("mixed scanner versions")),
    ).toBe(true);
  });

  it("warns on differing enabled_features without aborting", () => {
    const manifest = makeManifest([
      { batch_id: "batch-001", count: 1 },
      { batch_id: "batch-002", count: 1 },
    ]);
    const other = clone(nistRecord);
    other.capabilities.enabled_features = ["http-checks"];
    other.scan = { ...other.scan, target: "other.gov:443", host: "other.gov" };
    const batches: ParsedBatch[] = [
      { batch_id: "batch-001", records: [clone(nistRecord)] },
      { batch_id: "batch-002", records: [other] },
    ];
    const result = validateScan(manifest, batches, validate);
    expect(result.ok).toBe(true);
    expect(
      result.softWarnings.some((m) => m.includes("enabled_features")),
    ).toBe(true);
  });
});
