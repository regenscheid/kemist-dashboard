/**
 * `/` — federal-vs-top-20k comparison view.
 *
 * Loads each list's `aggregates.json` (latest scan date per list)
 * and renders side-by-side rate cards for the two posture metrics
 * the operator usually cares about across cohorts: TLS 1.3 adoption
 * and PQC support (hybrid OR pure). Per-list drill-down still lives
 * at `/lists/$list/`.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useLatestScanDate } from "../db/useDomains";
import { useAggregates } from "../db/useAggregates";
import { ThreeBucketStat } from "../components/summary/ThreeBucketStat";
import {
  ALL_SCAN_LISTS,
  SCAN_LIST_LABELS,
  type ScanList,
} from "../data/scanList";
import type { ScanAggregates, ScopeAggregates, ThreeBucket } from "../data/aggregate";

export const Route = createFileRoute("/")({
  component: CompareRoute,
});

function CompareRoute() {
  return (
    <section aria-labelledby="compare-heading" className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1
          id="compare-heading"
          className="text-2xl font-semibold tracking-tight"
        >
          Federal vs. top-20k posture
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Same metrics, two cohorts. Drill into a single list via the pills
          above.
        </p>
      </header>

      <ComparisonRow
        title="TLS 1.3 adoption"
        caption="Hosts whose probe set includes TLS 1.3 (denominator: responding hosts)."
        select={(s) => s.tls_1_3_of_all}
      />
      <ComparisonRow
        title="PQC support (hybrid + pure)"
        caption="Any post-quantum key exchange — hybrid (X25519MLKEM768, secp*MLKEM*) or pure (MLKEM512/768/1024)."
        select={(s) => s.pqc_support_of_all}
      />
      <ComparisonRow
        title="PQC support (TLS 1.3 only)"
        caption="Same metric, restricted to successful TLS 1.3 handshakes — useful when comparing across cohorts that have very different TLS 1.3 adoption."
        select={(s) => s.pqc_support_of_tls13}
      />
    </section>
  );
}

function ComparisonRow({
  title,
  caption,
  select,
}: {
  title: string;
  caption: string;
  select: (scope: ScopeAggregates) => ThreeBucket;
}) {
  return (
    <article className="space-y-3">
      <header>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">{caption}</p>
      </header>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {ALL_SCAN_LISTS.map((list) => (
          <ListSlice key={list} list={list} title={title} select={select} />
        ))}
      </div>
    </article>
  );
}

function ListSlice({
  list,
  title,
  select,
}: {
  list: ScanList;
  title: string;
  select: (scope: ScopeAggregates) => ThreeBucket;
}) {
  const date = useLatestScanDate(list);
  const { data, error, loading } = useAggregates(date, list);
  const label = SCAN_LIST_LABELS[list];

  return (
    <div className="rounded border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/30">
      <header className="mb-2 flex items-baseline gap-2">
        <Link
          to="/lists/$list"
          params={{ list }}
          className="text-sm font-semibold hover:underline"
        >
          {label.display}
        </Link>
        <span className="text-xs uppercase tracking-wide text-slate-500">
          {label.cadence}
        </span>
        {date && (
          <span className="ml-auto text-xs text-slate-500">{date}</span>
        )}
      </header>
      {renderSlice({ data, error, loading, title, select })}
    </div>
  );
}

function renderSlice({
  data,
  error,
  loading,
  title,
  select,
}: {
  data: ScanAggregates | null;
  error: Error | null;
  loading: boolean;
  title: string;
  select: (scope: ScopeAggregates) => ThreeBucket;
}): React.ReactNode {
  if (error) {
    return (
      <p className="text-xs text-red-700 dark:text-red-300">
        Failed to load aggregates: {error.message}
      </p>
    );
  }
  if (loading || !data) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">Loading…</p>
    );
  }
  const all = data.by_scope["__all"];
  if (!all) {
    return (
      <p className="text-xs text-slate-500">
        No cross-scope rollup in this scan.
      </p>
    );
  }
  return <ThreeBucketStat title={title} bucket={select(all)} />;
}
