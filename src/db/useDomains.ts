/**
 * React hooks for loading + observing the Dexie `domains` table.
 *
 * `useDomains(date)` handles the first-visit seed (from
 * `<date>/index.json`) plus subsequent Dexie-backed queries. It
 * surfaces a simple progress state so the route can render a bar
 * instead of a blank page on cold loads.
 *
 * Using `useLiveQuery` from dexie-react-hooks means the table
 * re-renders automatically if any other code mutates the `domains`
 * store (e.g. a future data-refresh handler). No prop drilling
 * needed.
 */

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./dexie";
import { ensureDomainsSeeded, loadScansIndex } from "./loader";
import type { DomainRow } from "../data/domainRow";

export type SeedStatus =
  | { kind: "idle" }
  | { kind: "loading"; message: string }
  | { kind: "ready" }
  | { kind: "error"; message: string };

/**
 * Resolve the "latest" scan date from the published index. Returns
 * `null` before the list is fetched and again if no scans exist.
 */
export function useLatestScanDate(): string | null {
  const [date, setDate] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const scans = await loadScansIndex();
        if (cancelled) return;
        setDate(scans[0]?.date ?? null);
      } catch {
        // Leave `date` null; upstream renders "no scans yet".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return date;
}

/**
 * Load-and-observe the domains for a given scan date. Triggers the
 * one-time Dexie seed on first visit, emitting a `loading` status
 * until the seed completes. Returns the rows as a reactive view —
 * any mutation to the `domains` table re-runs the query.
 */
export function useDomains(scanDate: string | null): {
  rows: DomainRow[] | undefined;
  status: SeedStatus;
} {
  const [status, setStatus] = useState<SeedStatus>({ kind: "idle" });

  useEffect(() => {
    if (!scanDate) return;
    let cancelled = false;
    // Synchronously flip to loading so the route can render a
    // banner before the async bulk-put starts. Re-fires only when
    // the scanDate dep changes, so the "cascading renders" concern
    // the rule warns about doesn't apply here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus({ kind: "loading", message: "Loading scan…" });
    (async () => {
      try {
        await ensureDomainsSeeded(scanDate);
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
  }, [scanDate]);

  const rows = useLiveQuery(() => {
    if (!scanDate) return [];
    return db.domains.where("scan_date").equals(scanDate).toArray();
  }, [scanDate]);

  return { rows, status };
}
