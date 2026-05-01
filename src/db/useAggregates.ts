/**
 * React hook for loading + caching the pre-computed
 * `public/data/<scan_list>/<date>/aggregates.json` produced by the
 * fetch-scan pipeline.
 *
 * Data is static per (scan_date, scan_list), so we cache via Dexie
 * keyed on `[date+scan_list+"__all"]`. The summary route holds the
 * fully loaded payload in React state since every card and chart
 * reads from it.
 */

import { useEffect, useState } from "react";
import { db } from "./dexie";
import type { ScanAggregates } from "../data/aggregate";
import type { ScanList } from "../data/scanList";

function aggregatesUrl(scan_list: ScanList, date: string): string {
  const base = import.meta.env.BASE_URL;
  const prefix = base.endsWith("/") ? base : base + "/";
  return `${prefix}data/${scan_list}/${date}/aggregates.json`;
}

export function useAggregates(
  scanDate: string | null,
  scan_list: ScanList | null,
): {
  data: ScanAggregates | null;
  error: Error | null;
  loading: boolean;
} {
  const [data, setData] = useState<ScanAggregates | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!scanDate || !scan_list) {
      // Clear state if the caller switches away.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const cached = await db.aggregates.get([scanDate, scan_list, "__all"]);
        if (cached) {
          if (cancelled) return;
          setData(cached.payload);
          setLoading(false);
          return;
        }
        const res = await fetch(aggregatesUrl(scan_list, scanDate), {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(
            `fetch aggregates.json: ${res.status} ${res.statusText}`,
          );
        }
        const payload = (await res.json()) as ScanAggregates;
        await db.aggregates.put({
          date: scanDate,
          scan_list,
          scope: "__all",
          payload,
        });
        if (cancelled) return;
        setData(payload);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e as Error);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scanDate, scan_list]);

  return { data, error, loading };
}
