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
