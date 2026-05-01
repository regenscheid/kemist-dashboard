/**
 * Build-time consistency checks on a freshly pulled scan.
 *
 * Enforces the severity split codified in
 * `docs/AGGREGATION_RULES.md`:
 *
 *   HARD FAIL  — throws. Deploy aborts, SNS alert fires.
 *   SOFT WARN  — added to `aggregates.warnings`. Deploy succeeds.
 *
 * Pure module; no I/O. Callers hand in the parsed manifest + the
 * list of (batch_id, records[]) tuples; this module decides what's
 * fatal vs noteworthy. Ajv-based per-record schema validation lives
 * here too; the exported `validateRecord` is cached.
 */

// The output schema uses JSON Schema draft 2020-12; stock `Ajv` from
// the default entry uses draft-07 and refuses to load the 2020-12
// meta-schema. The draft-2020 variant from ajv/dist/2020 is required.
import Ajv2020 from "ajv/dist/2020";
import type { ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import type { KemistScanResultSchemaV2 } from "./schema";

export type ScanManifest = {
  scan_date: string;
  scan_start: string;
  scan_end?: string;
  kemist_image_digest?: string | null;
  batch_count: number;
  target_count: number;
  error_count?: number;
  failed_batches?: string[];
  batches: ManifestBatchEntry[];
};

export type ManifestBatchEntry = {
  key: string;
  size_bytes: number;
  record_count: number;
  error_count?: number;
  schema_version: string;
};

export type ParsedBatch = {
  batch_id: string;
  records: KemistScanResultSchemaV2[];
};

export type ValidationResult = {
  ok: boolean;
  hardFailures: string[];
  softWarnings: string[];
};

const SUPPORTED_SCHEMA_MAJOR = "2";

/**
 * Build the Ajv validator once per Node process. The schema is the
 * vendored copy under `schemas/output-v1.json` — callers pass it in
 * as a parsed JSON object so this module stays filesystem-free and
 * browser-safe.
 */
export function buildRecordValidator(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  outputSchema: Record<string, any>,
): ValidateFunction<KemistScanResultSchemaV2> {
  const ajv = new Ajv2020({
    // strict:false because the schema uses draft-2020 features that
    // Ajv's strict mode doesn't fully enforce on $defs. Format
    // checks still run.
    strict: false,
    allErrors: true,
  });
  addFormats(ajv);
  return ajv.compile<KemistScanResultSchemaV2>(outputSchema);
}

/**
 * Apply the HARD / SOFT checks. Caller must have already parsed
 * batches and their records.
 */
export function validateScan(
  manifest: ScanManifest,
  batches: ParsedBatch[],
  validateRecord: ValidateFunction<KemistScanResultSchemaV2>,
): ValidationResult {
  const hardFailures: string[] = [];
  const softWarnings: string[] = [];

  // ── HARD: schema major version pin ─────────────────────────────
  for (const batch of batches) {
    for (let i = 0; i < batch.records.length; i++) {
      const record = batch.records[i];
      if (!record) continue;
      const major = record.schema_version.split(".")[0];
      if (major !== SUPPORTED_SCHEMA_MAJOR) {
        hardFailures.push(
          `batch ${batch.batch_id} record ${i}: schema_version "${record.schema_version}" — only v${SUPPORTED_SCHEMA_MAJOR}.x is supported`,
        );
      }
    }
  }

  // ── HARD: manifest ↔ batch consistency ────────────────────────
  const manifestBatchKeys = new Set(manifest.batches.map((b) => b.key));
  const batchFileKeys = new Set(
    batches.map((b) => expectedBatchKey(manifest.scan_date, b.batch_id)),
  );
  for (const k of manifestBatchKeys) {
    if (!batchFileKeys.has(k)) {
      hardFailures.push(
        `manifest references batch "${k}" that wasn't fetched/parsed`,
      );
    }
  }
  for (const k of batchFileKeys) {
    if (!manifestBatchKeys.has(k)) {
      hardFailures.push(`batch "${k}" fetched but not referenced in manifest`);
    }
  }

  // ── HARD: malformed NDJSON (caller flags if parse fails; this
  //    pass just flags Ajv-level schema violations per record).
  for (const batch of batches) {
    for (let i = 0; i < batch.records.length; i++) {
      const record = batch.records[i];
      if (!record) continue;
      if (!validateRecord(record)) {
        // Ajv's type predicate narrows `record` to `never` inside the
        // negative branch — but we still want to read scan.target for
        // the error message. Cast back to a loose shape for the read.
        const asLoose = record as unknown as {
          scan?: { target?: string };
        };
        const errs = validateRecord.errors
          ?.slice(0, 3)
          .map((e) => `${e.instancePath} ${e.message}`)
          .join(", ");
        hardFailures.push(
          `batch ${batch.batch_id} record ${i} (${
            asLoose.scan?.target ?? "unknown"
          }) failed schema validation: ${errs ?? "unknown"}`,
        );
      }
    }
  }

  // ── HARD: duplicate target across batches in the same scan ────
  const targetToBatch = new Map<string, string>();
  for (const batch of batches) {
    for (const record of batch.records) {
      const t = record.scan.target;
      const existing = targetToBatch.get(t);
      if (existing && existing !== batch.batch_id) {
        hardFailures.push(
          `target "${t}" appears in both ${existing} and ${batch.batch_id}`,
        );
      } else if (!existing) {
        targetToBatch.set(t, batch.batch_id);
      }
    }
  }

  // ── HARD: capabilities.probed_kx_groups must match across
  //    batches (per-scan invariant — divergence distorts PQC
  //    aggregates). Reference is the first batch's list.
  const firstKxGroups = batches[0]?.records[0]?.capabilities.probed_kx_groups;
  if (firstKxGroups) {
    const firstJoined = [...firstKxGroups].sort().join(",");
    for (const batch of batches) {
      for (let i = 0; i < batch.records.length; i++) {
        const record = batch.records[i];
        if (!record) continue;
        const joined = [...record.capabilities.probed_kx_groups].sort().join(",");
        if (joined !== firstJoined) {
          hardFailures.push(
            `batch ${batch.batch_id} record ${i} has different probed_kx_groups than the reference batch — PQC aggregates would be inconsistent`,
          );
          // One flag per batch is enough; breaking out avoids flooding
          // the log with one entry per record.
          break;
        }
      }
    }
  }

  // ── SOFT: mixed scanner patch versions ────────────────────────
  const scannerVersions = new Set<string>();
  for (const batch of batches) {
    for (const record of batch.records) {
      scannerVersions.add(record.scanner.version);
    }
  }
  if (scannerVersions.size > 1) {
    softWarnings.push(
      `mixed scanner versions across batches: ${[...scannerVersions].sort().join(", ")}`,
    );
  }

  // ── SOFT: differing enabled_features ──────────────────────────
  const firstFeatures = batches[0]?.records[0]?.capabilities.enabled_features;
  if (firstFeatures) {
    const firstJoined = [...firstFeatures].sort().join(",");
    for (const batch of batches) {
      for (const record of batch.records) {
        const joined = [...record.capabilities.enabled_features].sort().join(",");
        if (joined !== firstJoined) {
          softWarnings.push(
            `batch ${batch.batch_id} has different enabled_features than the reference batch`,
          );
          break;
        }
      }
    }
  }

  // ── SOFT: differing probed_cipher_suites ──────────────────────
  const firstCipherSuites =
    batches[0]?.records[0]?.capabilities.probed_cipher_suites;
  if (firstCipherSuites) {
    const firstJoined = [...firstCipherSuites].sort().join(",");
    for (const batch of batches) {
      for (const record of batch.records) {
        const joined = [...record.capabilities.probed_cipher_suites]
          .sort()
          .join(",");
        if (joined !== firstJoined) {
          softWarnings.push(
            `batch ${batch.batch_id} has different probed_cipher_suites than the reference batch`,
          );
          break;
        }
      }
    }
  }

  return {
    ok: hardFailures.length === 0,
    hardFailures,
    softWarnings,
  };
}

/**
 * Canonical S3-style key for a batch within a scan partition. Used
 * to reconcile manifest listings against what we actually fetched.
 */
export function expectedBatchKey(scan_date: string, batch_id: string): string {
  return `raw/dt=${scan_date}/${batch_id}.jsonl.gz`;
}
