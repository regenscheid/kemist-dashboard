/**
 * Scope inference for observed domains.
 *
 * v0 rule: derive from TLD alone. v1 will add a committed
 * `scopes.yaml` that overrides this for specific domains (e.g. to
 * distinguish federal vs state .gov cohorts, or to mark a private
 * operator-monitored set).
 *
 * The `scope` column exists on every `DomainRow` from day one, and
 * all filter UIs key off it; v1 only replaces the resolver function,
 * not the schema.
 */

/**
 * Closed set of recognized scopes. `unknown-tld` is the catch-all
 * for hosts whose TLD doesn't match any above. Never collapse new
 * TLDs into an existing scope silently — add a bucket and update
 * the filter UI.
 */
export type Scope =
  | "federal-gov"
  | "mil"
  | "edu"
  | "commercial"
  | "unknown-tld";

export const ALL_SCOPES: readonly Scope[] = [
  "federal-gov",
  "mil",
  "edu",
  "commercial",
  "unknown-tld",
] as const;

/**
 * Infer scope from a hostname (no port). The hostname passed in is
 * already lowercased by the scanner.
 *
 * v0 treats all `.gov` as `federal-gov`. State-level `.gov`
 * subdomains (e.g. `*.state.ca.gov`) land in the same bucket until
 * v1 ships a registry that can split them — we don't want to fake
 * precision we don't have.
 */
export function inferScope(host: string): Scope {
  const h = host.toLowerCase();
  if (h.endsWith(".gov") || h === "gov") return "federal-gov";
  if (h.endsWith(".mil") || h === "mil") return "mil";
  if (h.endsWith(".edu") || h === "edu") return "edu";
  if (
    h.endsWith(".com") ||
    h.endsWith(".org") ||
    h.endsWith(".net") ||
    h.endsWith(".io") ||
    h.endsWith(".co")
  ) {
    return "commercial";
  }
  return "unknown-tld";
}
