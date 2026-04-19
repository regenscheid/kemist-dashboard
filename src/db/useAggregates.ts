/**
 * React hook for loading + caching the pre-computed
 * `public/data/<date>/aggregates.json` produced by the
 * fetch-scan pipeline.
 *
 * The data is static per scan date, so we cache via Dexie keyed on
 * `[date+"__all"]`. The summary route holds the fully loaded
 * payload in React state since every card and chart reads from it.
 */

import { useEffect, useState } from "react";
import { db } from "./dexie";
import type { ScanAggregates } from "../data/aggregate";

function dataUrl(relative: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith("/") ? base : base + "/"}data/${relative}`;
}

export function useAggregates(scanDate: string | null): {
  data: ScanAggregates | null;
  error: Error | null;
  loading: boolean;
} {
  const [data, setData] = useState<ScanAggregates | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!scanDate) {
      // Clear state if the caller switches away from a scan. The
      // effect dep is `scanDate` only, so this runs once per change.
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
        // Check Dexie first. The payload is small (~KBs), so we
        // cache the whole blob in the `aggregates` store.
        const cached = await db.aggregates.get([scanDate, "__all"]);
        if (cached) {
          if (cancelled) return;
          setData(cached.payload);
          setLoading(false);
          return;
        }
        const res = await fetch(dataUrl(`${scanDate}/aggregates.json`));
        if (!res.ok) {
          throw new Error(
            `fetch aggregates.json: ${res.status} ${res.statusText}`,
          );
        }
        const payload = (await res.json()) as ScanAggregates;
        await db.aggregates.put({
          date: scanDate,
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
  }, [scanDate]);

  return { data, error, loading };
}
