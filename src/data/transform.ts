/**
 * Pure transform: schema-v1 record → denormalized `DomainRow`.
 *
 * Called from the Node-side fetch pipeline (`scripts/fetch-scan.ts`)
 * and potentially from client code if we ever need on-the-fly
 * re-denormalization from raw records. No Node APIs here — must
 * stay browser-safe.
 */

import type { KemistScanResultSchemaV1 } from "./schema";
import type { DomainRow, TriStateObservation } from "./domainRow";
import { inferScope } from "./scope";
import {
  classify,
  extractValue,
  type TriStateInput,
} from "../lib/triState";

/**
 * The set of PQC hybrid groups we consider "PQC hybrid support"
 * across. Kept as a committed set so the aggregate semantics are
 * stable and reviewable.
 *
 * ML-KEM-only groups (MLKEM512 / MLKEM768 / MLKEM1024) are
 * separately trackable as `pqc_signature`-style scalar fields in
 * future iterations; we bucket hybrids separately because they
 * represent the "classical + PQC" deployment posture most orgs
 * describe as their first-wave rollout.
 */
export const PQC_HYBRID_GROUPS = [
  "X25519MLKEM768",
  "secp256r1MLKEM768",
  "secp384r1MLKEM1024",
] as const;

/** Standalone ML-KEM groups (no classical component). */
export const PQC_STANDALONE_GROUPS = [
  "MLKEM512",
  "MLKEM768",
  "MLKEM1024",
] as const;

/** Classical ECDH/FFDHE groups kemist knows about. */
export const CLASSICAL_GROUPS = [
  "X25519",
  "X448",
  "secp256r1",
  "secp384r1",
  "secp521r1",
] as const;

/**
 * High-level classification of the negotiated KX scheme for a one-
 * word table column. Returns `null` when no handshake completed.
 */
export type KxScheme = "hybrid" | "pq" | "classical" | "other";

export function classifyKxScheme(group: string | null): KxScheme | null {
  if (!group) return null;
  if ((PQC_HYBRID_GROUPS as readonly string[]).includes(group)) return "hybrid";
  if ((PQC_STANDALONE_GROUPS as readonly string[]).includes(group)) return "pq";
  if ((CLASSICAL_GROUPS as readonly string[]).includes(group)) return "classical";
  // Unknown group name — e.g. a non-standard experimental hybrid.
  // Surface it as "other" so the user can see something was
  // negotiated but our classifier didn't recognize it.
  return "other";
}

/**
 * Aggregate tri-state across several group observations to a single
 * hybrid-support summary.
 *
 * Rules (never collapse null into false):
 *   1. Any probed+true → affirmative
 *   2. All present groups probed+false → explicit_negative
 *   3. Otherwise (any unknown / connection_state) → unknown,
 *      preferring the most informative method in this order:
 *      error > not_probed > not_applicable
 */
export function aggregateHybridGroups(
  groups: KemistScanResultSchemaV1["tls"]["groups"]["tls1_3"],
): TriStateObservation {
  const hybrids: TriStateInput[] = PQC_HYBRID_GROUPS.flatMap((name) => {
    const observation = groups[name];
    return observation ? [observation] : [];
  });

  if (hybrids.some((g) => classify(g) === "affirmative")) {
    return { value: true, method: "probe" };
  }

  // All observed + all explicit_negative → return an explicit
  // negative with method=probe. We also treat backend-declared
  // “not probed because this provider has no support for the group”
  // as an effective negative for the dashboard rollup.
  const nonAffirmative = hybrids.filter(
    (g) => classify(g) !== "affirmative",
  );
  const allEffectivelyNegative =
    nonAffirmative.length > 0 &&
    nonAffirmative.every(
      (g) =>
        classify(g) === "explicit_negative" || isProviderNoSupport(g),
    );
  if (allEffectivelyNegative) {
    return { value: false, method: "probe" };
  }

  // Surface the "worst" unknown reason — error > not_probed > not_applicable.
  const priority = ["error", "not_probed", "not_applicable"] as const;
  for (const method of priority) {
    const match = hybrids.find((g) => g.method === method);
    if (match) {
      // Pull the reason via our helper to avoid direct field reads;
      // the raw value is always null for these cases by schema.
      const reason = match.reason;
      return {
        value: null,
        method,
        ...(reason ? { reason } : {}),
      };
    }
  }

  // No hybrids were even emitted (schema allows the
  // `tls.groups.tls1_3` map to be empty when aws-lc-rs ships zero
  // hybrids). Treat as not_probed with a clear reason.
  return {
    value: null,
    method: "not_probed",
    reason: "no_hybrid_groups_in_probe_set",
  };
}

/**
 * Pick a single error category to surface in the compact column.
 * Returns the first error's category, or null if errors is empty.
 *
 * Rationale: `errors` is ordered by time. The first error is usually
 * the one that cascaded into later ones (e.g. DNS failure → no TCP
 * → no TLS), so surfacing it is a stable proxy for "root cause".
 */
export function topErrorCategory(
  errors: { category: string; context: string; timestamp: string }[],
): string | null {
  if (errors.length === 0) return null;
  return errors[0]?.category ?? null;
}

export type TransformContext = {
  scan_date: string;
  batch_id: string;
};

/**
 * Transform a single schema-v1 record into a flat DomainRow.
 *
 * Throws only on structural schema violations (missing required
 * fields beyond what json-schema-to-typescript enforces). Partial
 * observations with `method=error` don't throw — they produce
 * tri-state-correct rows with `unknown_error` values.
 */
export function toDomainRow(
  record: KemistScanResultSchemaV1,
  ctx: TransformContext,
): DomainRow {
  const { scan, tls, certificates, validation, errors, scanner } = record;

  const leaf = certificates.leaf;
  const negotiated = tls.negotiated;

  return {
    target: scan.target,
    host: scan.host,
    port: scan.port,
    scan_date: ctx.scan_date,
    scope: inferScope(scan.host),
    batch_id: ctx.batch_id,

    handshake_succeeded: negotiated ? true : false,
    tls_version: negotiated?.version ?? null,
    cipher: negotiated?.cipher_suite ?? null,
    kx_group: negotiated?.group ?? null,
    alpn: negotiated?.alpn ?? null,

    pqc_hybrid: aggregateHybridGroups(tls.groups.tls1_3),
    pqc_signature: leaf?.is_pqc_signature ?? false,

    cert_issuer_cn: leaf?.issuer_cn ?? null,
    cert_expiry: leaf?.not_after ?? null,
    cert_validity_days: leaf?.validity_days ?? null,

    chain_valid: normalizeObservation(validation.chain_valid_to_webpki_roots),
    name_matches_sni: normalizeObservation(validation.name_matches_sni),

    error_count: errors.length,
    top_error_category: topErrorCategory(errors),

    scanner_version: scanner.version,
  };
}

/**
 * Normalize a schema `ObservationBool` to the domain's clean
 * `TriStateObservation`. Identity except that optional `reason` is
 * preserved verbatim and the `{[k: string]: unknown}` intersection
 * from json-schema-to-typescript is shed.
 */
function isProviderNoSupport(obs: TriStateInput): boolean {
  return (
    obs.method === "not_probed" &&
    typeof obs.reason === "string" &&
    /^(aws_lc_rs|openssl)_no_.*_support$/.test(obs.reason)
  );
}

function normalizeObservation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obs: any,
): TriStateObservation {
  const value = extractValue(obs);
  return {
    value,
    method: obs.method,
    ...(obs.reason ? { reason: obs.reason } : {}),
  };
}
