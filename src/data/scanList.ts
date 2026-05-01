/**
 * Scan-list discriminator.
 *
 * The orchestrator emits two distinct scan corpora that share the
 * scanner output schema but differ in target population, cadence,
 * and per-target metadata shape:
 *
 *   federal-website-index  weekly Sun 02:00 UTC, GSA-derived agency list
 *   top20k-sfw             monthly 1st 02:00 UTC, top-20k commercial
 *
 * Discriminator strings are preserved verbatim from the orchestrator —
 * dashboards that try to abbreviate them tend to drift from the wire.
 * Display labels are a separate concern and live in SCAN_LIST_LABELS.
 */

export type ScanList = "federal-website-index" | "top20k-sfw";

export const ALL_SCAN_LISTS: readonly ScanList[] = [
  "federal-website-index",
  "top20k-sfw",
] as const;

export const DEFAULT_SCAN_LIST: ScanList = "federal-website-index";

export const SCAN_LIST_LABELS: Record<
  ScanList,
  { display: string; cadence: string; short: string }
> = {
  "federal-website-index": {
    display: "Federal websites",
    cadence: "weekly",
    short: "federal",
  },
  "top20k-sfw": {
    display: "Top 20k commercial",
    cadence: "monthly",
    short: "top-20k",
  },
};

export function isScanList(x: unknown): x is ScanList {
  return (
    typeof x === "string" &&
    (ALL_SCAN_LISTS as readonly string[]).includes(x)
  );
}
