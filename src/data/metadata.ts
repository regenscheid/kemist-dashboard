/**
 * Per-target metadata sidecar — parser + presentational helpers.
 *
 * The orchestrator writes one JSONL line per filtered target,
 * keyed by hostname. Each line carries scan_list (always present)
 * and a best-effort organization context — agency/branch/OU + GSA
 * provenance tags for federal records, homepage-scraped
 * organization + rank tag for top-20k records.
 *
 * Pure module; browser-safe. No I/O. The `resolveOrganization`
 * cascade currently does sidecar → hostname → "(unknown)" — the
 * cert-leaf O fallback is a documented follow-up that needs an
 * RFC 4514-aware DN parser.
 */

import type { ScanList } from "./scanList";
import { isScanList } from "./scanList";
import type { DomainRow } from "./domainRow";

export type Branch =
  | "Executive"
  | "Legislative"
  | "Judicial"
  | "Quasi-Judicial";

const BRANCH_VALUES: readonly Branch[] = [
  "Executive",
  "Legislative",
  "Judicial",
  "Quasi-Judicial",
] as const;

function isBranch(x: unknown): x is Branch {
  return typeof x === "string" && (BRANCH_VALUES as readonly string[]).includes(x);
}

export type TargetMetadata = {
  /** Hostname (lowercased), no port. Join key with `DomainRow.host`. */
  target: string;
  scan_list: ScanList;
  organization?: string;
  branch?: Branch;
  organizational_unit?: string;
  tags?: string[];
};

/**
 * Parse a JSONL string (one object per line) into a target-keyed
 * map. Last write wins on duplicate `target`. Blank lines and
 * malformed JSON lines are skipped — the orchestrator's contract is
 * that every line is a self-describing object, but real-world
 * sidecars get partial-write retries; tolerating noise here keeps
 * the deploy from breaking on a single corrupt line.
 *
 * Lines missing a recognized `scan_list` are dropped on the floor —
 * the discriminator is required to make the join meaningful.
 */
export function parseMetadataJsonl(text: string): Map<string, TargetMetadata> {
  const out = new Map<string, TargetMetadata>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const obj = parsed as Record<string, unknown>;
    const target = typeof obj["target"] === "string" ? obj["target"] : null;
    const scanList = obj["scan_list"];
    if (!target || !isScanList(scanList)) continue;
    const entry: TargetMetadata = { target, scan_list: scanList };
    if (typeof obj["organization"] === "string" && obj["organization"]) {
      entry.organization = obj["organization"];
    }
    if (isBranch(obj["branch"])) entry.branch = obj["branch"];
    if (
      typeof obj["organizational_unit"] === "string" &&
      obj["organizational_unit"]
    ) {
      entry.organizational_unit = obj["organizational_unit"];
    }
    if (Array.isArray(obj["tags"])) {
      entry.tags = obj["tags"].filter((t): t is string => typeof t === "string");
    }
    out.set(target, entry);
  }
  return out;
}

/**
 * Top-20k tags include a single "rank:N" entry where N is the
 * upstream rank (1 = most popular). Federal tags don't include
 * ranks. Returns null when no rank tag is present or the suffix
 * doesn't parse as a positive integer.
 */
export function extractTop20kRank(tags: readonly string[]): number | null {
  for (const tag of tags) {
    if (!tag.startsWith("rank:")) continue;
    const n = Number.parseInt(tag.slice("rank:".length), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Render-time fallback cascade for displaying the target's
 * organization. The brief specifies: sidecar → cert-leaf O (~30%
 * of remaining top-20k) → hostname → "(unknown)". Cert-leaf O
 * needs RFC 4514 DN parsing and is deferred; current cascade is
 * sidecar org → hostname → "(unknown)".
 */
export function resolveOrganization(row: DomainRow): string {
  if (row.organization && row.organization.trim()) return row.organization;
  if (row.host) return row.host;
  return "(unknown)";
}
