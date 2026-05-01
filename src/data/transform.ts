/**
 * Pure transform: schema-v1 record → denormalized `DomainRow`.
 *
 * Called from the Node-side fetch pipeline (`scripts/fetch-scan.ts`)
 * and potentially from client code if we ever need on-the-fly
 * re-denormalization from raw records. No Node APIs here — must
 * stay browser-safe.
 */

import type { KemistScanResultSchemaV2 } from "./schema";
import type { DomainRow, TriStateObservation } from "./domainRow";
import type { ScanList } from "./scanList";
import {
  extractTop20kRank,
  type TargetMetadata,
} from "./metadata";
import { inferScope } from "./scope";
import {
  deriveKxSupportTypes,
  ECC_GROUPS,
  PQC_HYBRID_GROUPS,
  PQC_STANDALONE_GROUPS,
} from "./kxSupport";
import {
  deriveMaxSupportedTlsVersion,
  deriveSupportedTlsVersions,
} from "./tlsVersions";
import {
  classify,
  extractValue,
  type TriStateInput,
} from "../lib/triState";

export { PQC_HYBRID_GROUPS, PQC_STANDALONE_GROUPS } from "./kxSupport";

/** Classical ECC groups kemist knows about. */
export const CLASSICAL_GROUPS = ECC_GROUPS;

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
  groups: KemistScanResultSchemaV2["tls"]["groups"]["tls1_3"],
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
 * Aggregate tri-state across hybrid AND pure PQC groups — answers
 * "did the server support any post-quantum key exchange at all?"
 *
 * Same rollup rules as `aggregateHybridGroups`; the only difference
 * is the input set. Cards and the domains-table column read this
 * to surface PQC adoption without forcing the viewer to inspect
 * pure-vs-hybrid separately.
 */
export function aggregatePqcGroups(
  groups: KemistScanResultSchemaV2["tls"]["groups"]["tls1_3"],
): TriStateObservation {
  const pqcNames = [...PQC_HYBRID_GROUPS, ...PQC_STANDALONE_GROUPS];
  const observed: TriStateInput[] = pqcNames.flatMap((name) => {
    const observation = groups[name];
    return observation ? [observation] : [];
  });

  if (observed.some((g) => classify(g) === "affirmative")) {
    return { value: true, method: "probe" };
  }

  const nonAffirmative = observed.filter(
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

  const priority = ["error", "not_probed", "not_applicable"] as const;
  for (const method of priority) {
    const match = observed.find((g) => g.method === method);
    if (match) {
      const reason = match.reason;
      return {
        value: null,
        method,
        ...(reason ? { reason } : {}),
      };
    }
  }

  return {
    value: null,
    method: "not_probed",
    reason: "no_pqc_groups_in_probe_set",
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

export function summarizeErrorCategories(
  errors: { category: string; context: string; timestamp: string }[],
): string | null {
  const unique = [...new Set(errors.map((error) => error.category))];
  return unique.length > 0 ? unique.join(", ") : null;
}

export type TransformContext = {
  scan_date: string;
  batch_id: string;
  /** The scan_list this batch belongs to. Stamped onto every row. */
  scan_list: ScanList;
  /**
   * Sidecar metadata, target-keyed by hostname. May be empty when
   * the orchestrator's metadata sidecar was unavailable; in that
   * case every row gets nulls for organization/branch/OU and
   * an empty `tags` array. Empty map is genuine "no signal," not
   * a scan failure.
   */
  metadata: Map<string, TargetMetadata>;
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
  record: KemistScanResultSchemaV2,
  ctx: TransformContext,
): DomainRow {
  const { scan, tls, certificates, validation, errors, scanner } = record;

  const leaf = certificates.leaf;
  const negotiated = tls.negotiated;
  const supportedTlsVersions = deriveSupportedTlsVersions(tls.versions_offered);
  const didRespond = supportedTlsVersions.length > 0;

  // Sidecar lookup is keyed by hostname (the orchestrator's contract).
  // Falls through to nulls + empty tags when the entry is absent —
  // distinct from "the entry exists but has no organization," which
  // produces { organization: undefined } and the same render result.
  const meta = ctx.metadata.get(scan.host);
  const tags = meta?.tags ?? [];

  return {
    target: scan.target,
    host: scan.host,
    port: scan.port,
    scan_date: ctx.scan_date,
    scope: inferScope(scan.host),
    scan_list: ctx.scan_list,
    batch_id: ctx.batch_id,

    handshake_succeeded: didRespond,
    tls_version: negotiated?.version ?? null,
    supported_tls_versions: supportedTlsVersions,
    max_supported_tls_version: deriveMaxSupportedTlsVersion(tls.versions_offered),
    cipher: negotiated?.cipher_suite ?? null,
    kx_group: negotiated?.group ?? null,
    kx_support_types: deriveKxSupportTypes(tls),
    alpn: negotiated?.alpn ?? null,

    pqc_hybrid: aggregateHybridGroups(tls.groups.tls1_3),
    pqc_support: aggregatePqcGroups(tls.groups.tls1_3),
    pqc_signature: leaf?.pqc_signature_family != null,

    cert_issuer_cn: leaf?.issuer_cn ?? null,
    cert_expiry: leaf?.not_after ?? null,
    cert_validity_days: leaf?.validity_days ?? null,

    chain_valid: normalizeObservation(validation.chain_valid_to_webpki_roots),
    name_matches_sni: normalizeObservation(validation.name_matches_sni),

    error_count: errors.length,
    top_error_category: topErrorCategory(errors),
    unreachable_summary: summarizeErrorCategories(errors),

    scanner_version: scanner.version,

    organization: meta?.organization ?? null,
    branch: meta?.branch ?? null,
    organizational_unit: meta?.organizational_unit ?? null,
    tags,
    top20k_rank: extractTop20kRank(tags),
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
