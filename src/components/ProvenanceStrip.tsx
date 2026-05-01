/**
 * Global provenance strip — scan date, record count, scanner and
 * schema versions, build timestamp, and a warnings banner when
 * aggregates reports any SOFT WARNs.
 *
 * Rationale: every card/chart on the dashboard is only meaningful
 * against a specific scanner build + scan date. Putting this info
 * at the top of every page means a screenshot-quoted number carries
 * its provenance with it.
 *
 * Data source: `public/data/<date>/aggregates.json` (for warnings +
 * total count) and the fetched scanner metadata from any record.
 * For now, the strip accepts pre-computed props; the summary route
 * (PR 6) will wire them in, and PR 4 passes them from the detail
 * view's loader.
 */

import type { ScanList } from "../data/scanList";
import { SCAN_LIST_LABELS } from "../data/scanList";

export type Provenance = {
  scan_date: string | null;
  /**
   * Which scan list produced this scan. Null when the strip is
   * rendered on a list-agnostic view (e.g. About). Display logic
   * surfaces the list label + cadence next to the scan date.
   */
  scan_list: ScanList | null;
  total_records: number | null;
  scanner_name: string | null;
  scanner_version: string | null;
  schema_version: string | null;
  warnings: string[];
};

type Props = {
  provenance: Provenance;
  /** Rendered somewhere with a stable build-time value. */
  buildTimestamp?: string;
};

export function ProvenanceStrip({ provenance, buildTimestamp }: Props) {
  const {
    scan_date,
    scan_list,
    total_records,
    scanner_name,
    scanner_version,
    schema_version,
    warnings,
  } = provenance;

  return (
    <div
      className="border-b border-slate-200 bg-slate-100/70 dark:border-slate-800 dark:bg-slate-900/50"
      role="complementary"
      aria-label="Scan provenance"
    >
      <div className="mx-auto max-w-6xl px-6 py-2 text-xs text-slate-600 dark:text-slate-400">
        <dl className="flex flex-wrap gap-x-6 gap-y-1">
          {scan_list && (
            <Datum
              label="List"
              value={`${SCAN_LIST_LABELS[scan_list].display} · ${SCAN_LIST_LABELS[scan_list].cadence}`}
            />
          )}
          <Datum label="Scan" value={scan_date ? formatDate(scan_date) : "—"} />
          <Datum
            label="Records"
            value={
              total_records != null ? total_records.toLocaleString() : "—"
            }
          />
          <Datum
            label="Scanner"
            value={
              scanner_name && scanner_version
                ? `${scanner_name} ${scanner_version}`
                : "—"
            }
          />
          <Datum
            label="Schema"
            value={schema_version ? `v${schema_version}` : "—"}
          />
          {buildTimestamp && (
            <Datum label="Built" value={formatRelative(buildTimestamp)} />
          )}
        </dl>
        {warnings.length > 0 && (
          <div
            role="alert"
            className="mt-2 rounded border border-amber-500/40 bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
          >
            <div className="font-semibold">Scan warnings</div>
            <ul className="mt-1 list-disc pl-5">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Datum({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="uppercase tracking-wide text-slate-700 dark:text-slate-300">
        {label}
      </dt>
      <dd className="font-medium text-slate-900 dark:text-slate-100">
        {value}
      </dd>
    </div>
  );
}

function formatDate(iso: string): string {
  // YYYY-MM-DD — leave as-is; users who want a localized format can
  // hover the UTC tooltip on the detail view.
  return iso;
}

function formatRelative(iso: string): string {
  // Render absolute date to keep behavior deterministic across
  // timezones — the whole point of the provenance strip is
  // reproducibility, which "3 hours ago" would undermine.
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace("T", " ") + "Z";
}
