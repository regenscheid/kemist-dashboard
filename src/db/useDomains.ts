/**
 * React hooks for loading + observing the Dexie `domains` table.
 *
 * `useDomains(date, scan_list)` handles the first-visit seed (from
 * `<scan_list>/<date>/index.json`) plus subsequent Dexie-backed
 * queries. It surfaces a simple progress state so the route can
 * render a bar instead of a blank page on cold loads.
 *
 * Using `useLiveQuery` from dexie-react-hooks means the table
 * re-renders automatically if any other code mutates the `domains`
 * store. No prop drilling needed.
 */

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./dexie";
import { ensureDomainsSeeded, loadScansIndex } from "./loader";
import type { DomainRow } from "../data/domainRow";
import type { ScanList } from "../data/scanList";

export type ScanProvenance = {
  scan_date: string | null;
  total_records: number | null;
  scanner_name: string | null;
  scanner_version: string | null;
  schema_version: string | null;
  build_timestamp: string;
};

export type SeedStatus =
  | { kind: "idle" }
  | { kind: "loading"; message: string }
  | { kind: "ready" }
  | { kind: "error"; message: string };

/**
 * Resolve the "latest" scan date for a specific scan_list. Returns
 * `null` before the list is fetched and again if that list has no
 * scans yet (e.g. top-20k before the first monthly run).
 */
export function useLatestScanDate(
  scan_list: ScanList | null,
): string | null {
  const [date, setDate] = useState<string | null>(null);
  useEffect(() => {
    if (!scan_list) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDate(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const scans = await loadScansIndex();
        if (cancelled) return;
        const forList = scans.filter((s) => s.scan_list === scan_list);
        setDate(forList[0]?.date ?? null);
      } catch {
        // Leave `date` null; upstream renders "no scans yet".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scan_list]);
  return date;
}

/**
 * Load-and-observe the domains for a given (scanDate, scan_list)
 * pair. Triggers the one-time Dexie seed on first visit, emitting a
 * `loading` status until the seed completes. Returns the rows as a
 * reactive view — any mutation to the `domains` table re-runs the
 * query.
 */
export function useDomains(
  scanDate: string | null,
  scan_list: ScanList | null,
): {
  rows: DomainRow[] | undefined;
  status: SeedStatus;
} {
  const [status, setStatus] = useState<SeedStatus>({ kind: "idle" });

  useEffect(() => {
    if (!scanDate || !scan_list) return;
    let cancelled = false;
    // Synchronously flip to loading so the route can render a
    // banner before the async bulk-put starts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus({ kind: "loading", message: "Loading scan…" });
    (async () => {
      try {
        await ensureDomainsSeeded(scanDate, scan_list);
        if (cancelled) return;
        setStatus({ kind: "ready" });
      } catch (e) {
        if (cancelled) return;
        setStatus({
          kind: "error",
          message: (e as Error).message,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scanDate, scan_list]);

  const rows = useLiveQuery(() => {
    if (!scanDate || !scan_list) return [];
    return db.domains
      .where("[scan_date+scan_list]")
      .equals([scanDate, scan_list])
      .toArray();
  }, [scanDate, scan_list]);

  return { rows, status };
}

/**
 * Header-strip provenance for the active scan list. Joins the latest
 * scan date, the manifest's record count + schema version, and a
 * sample domain row's scanner_version. Returns nullable fields so
 * the header can render placeholders before the seed completes.
 */
export function useScanProvenance(
  scan_list: ScanList | null,
): ScanProvenance {
  const scan_date = useLatestScanDate(scan_list);

  const scanEntry = useLiveQuery(() => {
    if (!scan_date || !scan_list) return undefined;
    return db.scans.get([scan_date, scan_list]);
  }, [scan_date, scan_list]);

  const sample = useLiveQuery(() => {
    if (!scan_date || !scan_list) return undefined;
    return db.domains
      .where("[scan_date+scan_list]")
      .equals([scan_date, scan_list])
      .first();
  }, [scan_date, scan_list]);

  return {
    scan_date,
    total_records: scanEntry?.record_count ?? null,
    // The scanner name is fixed by build-time identity; only the
    // version varies between runs. DomainRow carries `scanner_version`
    // verbatim from the schema's `scanner.version`.
    scanner_name: sample?.scanner_version ? "kemist" : null,
    scanner_version: sample?.scanner_version ?? null,
    schema_version: scanEntry?.manifest.batches[0]?.schema_version ?? null,
    build_timestamp: __APP_BUILD_ID__,
  };
}
