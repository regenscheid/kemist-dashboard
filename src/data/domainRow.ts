/**
 * The flat, denormalized shape one row per scanned target. Emitted
 * by `transform.ts` into `<date>/index.json` and seeded into the
 * Dexie `domains` table on first visit.
 *
 * Load-bearing details:
 * - Every tri-state observation keeps its full `{value, method,
 *   reason?}` shape — never collapsed to a bare boolean. The
 *   observation-only contract (unknowns stay distinguishable from
 *   rejected) depends on this.
 * - `batch_id` is embedded so the detail view can fetch just the
 *   containing batch without a separate lookup file.
 * - Types like `TriStateObservation` intentionally match the
 *   schema's `ObservationBool` at runtime; a separate alias keeps
 *   the domain model name legible in consumer code.
 */

import type { Method } from "./schema";
import type { Scope } from "./scope";

/**
 * A normalized tri-state observation. Matches the schema's
 * `observationBool` shape but named for the domain, not the schema.
 */
export type TriStateObservation = {
  value: boolean | null;
  method: Method;
  reason?: string;
};

export type DomainRow = {
  /** "example.gov:443" */
  target: string;
  host: string;
  port: number;
  scan_date: string;
  /** TLD-inferred cohort; v1 may override via scopes.yaml. */
  scope: Scope;
  /** Which batch file holds the full schema-v1 record. */
  batch_id: string;

  /** True if at least one TLS version probe observed support. */
  handshake_succeeded: boolean | null;
  /** Post-handshake negotiated version, e.g. "TLSv1_3". */
  tls_version: string | null;
  /** All protocol versions the target explicitly supported in probes. */
  supported_tls_versions: string[];
  /** Highest protocol version explicitly supported in probes. */
  max_supported_tls_version: string | null;
  cipher: string | null;
  kx_group: string | null;
  alpn: string | null;

  /**
   * Aggregate tri-state across all known hybrid groups
   * (X25519MLKEM768, secp256r1MLKEM768, secp384r1MLKEM1024). If any
   * hybrid is probed+true → affirmative; if all hybrids are
   * probed+false → explicit_negative; otherwise unknown with the
   * weakest unknown method (error > not_probed > not_applicable).
   */
  pqc_hybrid: TriStateObservation;

  /** `certificates.leaf.is_pqc_signature` verbatim (scalar bool). */
  pqc_signature: boolean;

  cert_issuer_cn: string | null;
  cert_expiry: string | null;
  cert_validity_days: number | null;

  chain_valid: TriStateObservation;
  name_matches_sni: TriStateObservation;

  error_count: number;
  top_error_category: string | null;

  scanner_version: string;
};
