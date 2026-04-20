/**
 * Filter state shape + pure filtering logic for the domain table.
 *
 * Mirrors the URL search params schema so route-level code can
 * round-trip state through the URL and pass it here verbatim.
 *
 * Every facet preserves the tri-state contract — unknowns stay
 * distinguishable from rejected:
 *   - `pqc_hybrid: ["affirmative"]` selects ONLY probe+true rows
 *   - `pqc_hybrid: ["unknown"]` selects rows where
 *     isUnknown(row.pqc_hybrid) — never silently includes negatives
 */

import { classify, type TriStateClass } from "../../lib/triState";
import type { DomainRow } from "../../data/domainRow";
import type { Scope } from "../../data/scope";
import {
  compareTlsVersionLabels,
  normalizeTlsVersionLabel,
} from "../../data/tlsVersions";

export type CertExpiryWindow =
  | "expired"
  | "lt30"
  | "lt90"
  | "any";

export type PqcHybridFilter =
  | "affirmative"
  | "explicit_negative"
  | "unknown";

export type Filters = {
  /** Free-text substring match on target (host:port). */
  q: string;
  /** Show rows where the scan never observed any supported TLS version. */
  show_unreachable: boolean;
  /** ANY-of semantics within a facet. Empty = no filter on that facet. */
  tls_versions: string[];
  /** Single-select highest-supported-version facet. Empty = no filter. */
  max_supported_tls_version: string;
  scopes: Scope[];
  pqc_hybrid: PqcHybridFilter[];
  error_categories: string[];
  cert_expiry: CertExpiryWindow;
};

export const EMPTY_FILTERS: Filters = {
  q: "",
  show_unreachable: false,
  tls_versions: [],
  max_supported_tls_version: "",
  scopes: [],
  pqc_hybrid: [],
  error_categories: [],
  cert_expiry: "any",
};

export function isFilterActive(f: Filters): boolean {
  return (
    f.q.length > 0 ||
    f.show_unreachable ||
    f.tls_versions.length > 0 ||
    f.max_supported_tls_version.length > 0 ||
    f.scopes.length > 0 ||
    f.pqc_hybrid.length > 0 ||
    f.error_categories.length > 0 ||
    f.cert_expiry !== "any"
  );
}

export function isRespondingHost(row: DomainRow): boolean {
  return row.handshake_succeeded === true;
}

/**
 * Pure predicate — `true` if the row matches all active facets.
 */
export function matchesFilters(row: DomainRow, f: Filters): boolean {
  if (!f.show_unreachable && !isRespondingHost(row)) {
    return false;
  }
  if (f.q && !row.target.toLowerCase().includes(f.q.toLowerCase())) {
    return false;
  }
  if (f.tls_versions.length > 0) {
    const supported = getSupportedTlsVersions(row);
    if (supported.length === 0) {
      if (!f.tls_versions.includes("(unknown)")) return false;
    } else if (!f.tls_versions.some((v) => supported.includes(v))) {
      return false;
    }
  }
  if (f.max_supported_tls_version.length > 0) {
    const maxSupported = getMaxSupportedTlsVersion(row) ?? "(unknown)";
    if (f.max_supported_tls_version !== maxSupported) return false;
  }
  if (f.scopes.length > 0 && !f.scopes.includes(row.scope)) {
    return false;
  }
  if (f.pqc_hybrid.length > 0) {
    const bucket = tristateBucket(classify(row.pqc_hybrid));
    if (!f.pqc_hybrid.includes(bucket)) return false;
  }
  if (f.error_categories.length > 0) {
    const cat = row.top_error_category ?? "(none)";
    if (!f.error_categories.includes(cat)) return false;
  }
  if (f.cert_expiry !== "any") {
    if (!matchesCertExpiry(row.cert_expiry, f.cert_expiry)) return false;
  }
  return true;
}

function tristateBucket(clazz: TriStateClass): PqcHybridFilter {
  if (clazz === "affirmative" || clazz === "connection_state_affirmative") {
    return "affirmative";
  }
  if (clazz === "explicit_negative" || clazz === "connection_state_negative") {
    return "explicit_negative";
  }
  return "unknown";
}

function matchesCertExpiry(
  expiry: string | null,
  window: CertExpiryWindow,
): boolean {
  if (window === "any") return true;
  if (!expiry) return false;
  const t = Date.parse(expiry);
  if (Number.isNaN(t)) return false;
  const now = Date.now();
  const msPerDay = 86_400_000;
  const daysUntilExpiry = (t - now) / msPerDay;
  switch (window) {
    case "expired":
      return daysUntilExpiry < 0;
    case "lt30":
      return daysUntilExpiry >= 0 && daysUntilExpiry < 30;
    case "lt90":
      return daysUntilExpiry >= 0 && daysUntilExpiry < 90;
  }
}

/**
 * Facet option descriptor. Field is named `option` (not `value`) so
 * the tri-state ESLint rule that bans `.value` reads doesn't
 * false-positive in the filter-panel rendering code.
 */
export type FacetOption<T> = { option: T; count: number };

/**
 * Derive facet option lists (distinct values + counts) from the
 * full row set. Used to populate filter UIs — every option matches
 * something in the current dataset, and the count helps users see
 * which facets will narrow the list.
 */
export function buildFacetOptions(rows: DomainRow[]): {
  tls_versions: FacetOption<string>[];
  max_supported_tls_versions: FacetOption<string>[];
  scopes: FacetOption<Scope>[];
  error_categories: FacetOption<string>[];
} {
  const tls = new Map<string, number>();
  const maxTls = new Map<string, number>();
  const scopes = new Map<Scope, number>();
  const errs = new Map<string, number>();
  for (const row of rows) {
    const supported = getSupportedTlsVersions(row);
    if (supported.length === 0) {
      incr(tls, "(unknown)");
    } else {
      for (const version of supported) incr(tls, version);
    }
    incr(maxTls, getMaxSupportedTlsVersion(row) ?? "(unknown)");
    incr(scopes, row.scope);
    incr(errs, row.top_error_category ?? "(none)");
  }
  return {
    tls_versions: [...tls.entries()]
      .sort((a, b) => compareTlsVersionLabels(a[0], b[0]))
      .map(([option, count]) => ({ option, count })),
    max_supported_tls_versions: [...maxTls.entries()]
      .sort((a, b) => compareTlsVersionLabels(a[0], b[0]))
      .map(([option, count]) => ({ option, count })),
    scopes: [...scopes.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([option, count]) => ({ option, count })),
    error_categories: [...errs.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([option, count]) => ({ option, count })),
  };
}

function getSupportedTlsVersions(row: DomainRow): string[] {
  if (Array.isArray(row.supported_tls_versions) && row.supported_tls_versions.length > 0) {
    return [...row.supported_tls_versions].sort(compareTlsVersionLabels);
  }
  const negotiated = normalizeTlsVersionLabel(row.tls_version);
  return negotiated ? [negotiated] : [];
}

function getMaxSupportedTlsVersion(row: DomainRow): string | null {
  if (typeof row.max_supported_tls_version === "string" && row.max_supported_tls_version.length > 0) {
    return row.max_supported_tls_version;
  }
  const supported = getSupportedTlsVersions(row);
  return supported.at(-1) ?? null;
}

function incr<K>(map: Map<K, number>, key: K): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}
