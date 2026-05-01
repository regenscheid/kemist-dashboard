/**
 * `/` — Summary view. Cross-cohort: PQC support for both Federal
 * and Top-20k side-by-side, a TLS 1.3 cohort-comparison row, and
 * three distribution sections. Replaces the old per-list summary
 * URL `/lists/$list/` (which now redirects to that list's domains
 * table).
 */

import { createFileRoute } from "@tanstack/react-router";
import { useLatestScanDate } from "../db/useDomains";
import { useAggregates } from "../db/useAggregates";
import {
  ALL_SCAN_LISTS,
  SCAN_LIST_LABELS,
  type ScanList,
} from "../data/scanList";
import type { ScanAggregates, ScopeAggregates } from "../data/aggregate";
import { PqcHero } from "../components/summary/PqcHero";
import { CohortCompareBar } from "../components/summary/CohortCompareBar";
import { IssuerList } from "../components/summary/IssuerList";

const ALL_SCOPE_KEY = "__all";

export const Route = createFileRoute("/")({
  component: SummaryRoute,
});

function SummaryRoute() {
  const cohorts = useCohorts();
  // Eyebrow scan-date — pick the first cohort that has a date so the
  // header shows a real timestamp once *any* scan has loaded.
  const headerScanDate =
    cohorts.find((c) => c.scanDate)?.scanDate ?? null;

  return (
    <section aria-labelledby="summary-heading" className="space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
          Summary{headerScanDate ? ` · ${headerScanDate}` : ""}
        </p>
        <h1
          id="summary-heading"
          className="text-[28px] font-semibold leading-tight tracking-[-0.01em]"
        >
          TLS Dashboard
        </h1>
        <p className="max-w-prose text-[14px] text-ink-2">
          Federal domains and subdomains, and Top 20k Websites based on the
          Tranco ranking.
        </p>
      </header>

      <PqcSupportSection cohorts={cohorts} />

      <Tls13Section cohorts={cohorts} />

      <DistributionsSection cohorts={cohorts} />
    </section>
  );
}

type CohortData = {
  scanList: ScanList;
  scanDate: string | null;
  aggregates: ScanAggregates | null;
  scope: ScopeAggregates | null;
  loading: boolean;
  error: Error | null;
};

/**
 * Load aggregates for every scan list, returning a uniform array
 * regardless of which lists are populated. The Summary view always
 * renders both cohort columns so missing data shows a graceful
 * placeholder rather than a layout shift.
 */
function useCohorts(): CohortData[] {
  // Hooks must be called in the same order on every render — call
  // each one explicitly per known list.
  const federalDate = useLatestScanDate("federal-website-index");
  const top20kDate = useLatestScanDate("top20k-sfw");
  const federalAgg = useAggregates(federalDate, "federal-website-index");
  const top20kAgg = useAggregates(top20kDate, "top20k-sfw");

  const byList: Record<ScanList, CohortData> = {
    "federal-website-index": {
      scanList: "federal-website-index",
      scanDate: federalDate,
      aggregates: federalAgg.data,
      scope: federalAgg.data?.by_scope[ALL_SCOPE_KEY] ?? null,
      loading: federalAgg.loading,
      error: federalAgg.error,
    },
    "top20k-sfw": {
      scanList: "top20k-sfw",
      scanDate: top20kDate,
      aggregates: top20kAgg.data,
      scope: top20kAgg.data?.by_scope[ALL_SCOPE_KEY] ?? null,
      loading: top20kAgg.loading,
      error: top20kAgg.error,
    },
  };
  return ALL_SCAN_LISTS.map((l) => byList[l]);
}

function PqcSupportSection({ cohorts }: { cohorts: CohortData[] }) {
  return (
    <section
      aria-labelledby="pqc-support-heading"
      className="space-y-4 rounded-lg border border-line bg-surface-2 p-5"
    >
      <header className="space-y-1">
        <h2
          id="pqc-support-heading"
          className="text-[18px] font-semibold tracking-[-0.005em]"
        >
          PQC Support
        </h2>
        <p className="max-w-prose text-[13px] text-ink-2">
          Share of responding hosts that offered a post-quantum key-exchange
          group (e.g.{" "}
          <code className="font-mono text-[12px]">X25519MLKEM768</code>,{" "}
          <code className="font-mono text-[12px]">MLKEM768</code>).
        </p>
      </header>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {cohorts.map((c) => (
          <CohortSlot key={c.scanList} cohort={c}>
            {c.scope ? (
              <PqcHero
                scanList={c.scanList}
                bucket={c.scope.pqc_support_of_all}
              />
            ) : null}
          </CohortSlot>
        ))}
      </div>
    </section>
  );
}

function Tls13Section({ cohorts }: { cohorts: CohortData[] }) {
  const ready = cohorts.filter((c) => c.scope);
  if (ready.length === 0) return null;
  return (
    <section
      aria-labelledby="tls13-heading"
      className="space-y-4 rounded-lg border border-line bg-surface p-5"
    >
      <header className="space-y-1">
        <h2
          id="tls13-heading"
          className="text-[18px] font-semibold tracking-[-0.005em]"
        >
          TLS 1.3 negotiated
        </h2>
        <p className="text-[13px] text-ink-2">
          Server actually negotiated TLSv1_3 — not merely advertised it.
        </p>
      </header>
      <CohortCompareBar
        rows={ready.map((c) => ({
          scanList: c.scanList,
          // tls_1_3_of_all reads "of all responding hosts" per ScopeAggregates.
          bucket: c.scope!.tls_1_3_of_all,
        }))}
      />
    </section>
  );
}

function DistributionsSection({ cohorts }: { cohorts: CohortData[] }) {
  return (
    <section className="space-y-6">
      <DistributionCard
        title="Top issuers"
        hint="From leaf cert issuer_cn — top 10 by record count, per cohort."
        cohorts={cohorts}
        render={(scope) => <IssuerList issuers={scope.cert_issuers} />}
      />
      <DistributionCard
        title="Key-exchange family support"
        hint="Top 10 named groups observed across TLS 1.2 + 1.3 supported_groups."
        cohorts={cohorts}
        render={(scope) => <KeyValueList values={scope.kx_groups} />}
      />
      <DistributionCard
        title="TLS Version Support"
        hint="Negotiated TLS version across responding hosts."
        cohorts={cohorts}
        render={(scope) => <KeyValueList values={scope.tls_versions} />}
      />
    </section>
  );
}

function DistributionCard({
  title,
  hint,
  cohorts,
  render,
}: {
  title: string;
  hint: string;
  cohorts: CohortData[];
  render: (scope: ScopeAggregates) => React.ReactNode;
}) {
  return (
    <article className="rounded-lg border border-line bg-surface p-5">
      <header className="mb-4 space-y-1">
        <h2 className="text-[18px] font-semibold tracking-[-0.005em]">
          {title}
        </h2>
        <p className="text-[13px] text-ink-2">{hint}</p>
      </header>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {cohorts.map((c) => (
          <div key={c.scanList} className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full bg-accent-2"
              />
              <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-ink-3">
                {SCAN_LIST_LABELS[c.scanList].display}
              </span>
            </div>
            <CohortSlot cohort={c}>
              {c.scope ? render(c.scope) : null}
            </CohortSlot>
          </div>
        ))}
      </div>
    </article>
  );
}

function KeyValueList({ values }: { values: Record<string, number> }) {
  const rows = Object.entries(values)
    .map(([k, v]) => ({ label: k, count: v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  if (rows.length === 0) {
    return <p className="text-[12px] italic text-ink-3">No data.</p>;
  }
  const max = rows[0]?.count ?? 1;

  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div
          key={r.label}
          className="grid grid-cols-[1fr_minmax(80px,180px)_60px] items-center gap-3 text-[12px]"
        >
          <div className="truncate font-mono" title={r.label}>
            {r.label}
          </div>
          <div className="h-2 overflow-hidden rounded-sm bg-line-2">
            <div
              className="h-full bg-accent-2"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
          <div className="text-right font-mono text-[11px] text-ink-2">
            {r.count.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Renders a placeholder when the cohort's data is not yet loaded;
 * otherwise renders the children. Keeps the grid layout stable
 * across loading/error/missing-list states.
 */
function CohortSlot({
  cohort,
  children,
}: {
  cohort: CohortData;
  children: React.ReactNode;
}) {
  if (cohort.error) {
    return (
      <p className="rounded-md border border-neg/30 bg-neg-bg p-3 text-[12px] text-neg-fg">
        Failed to load {SCAN_LIST_LABELS[cohort.scanList].display}:{" "}
        {cohort.error.message}
      </p>
    );
  }
  if (!cohort.scanDate) {
    return (
      <p className="rounded-md border border-line bg-surface-2 p-3 text-[12px] italic text-ink-3">
        No scans published for{" "}
        {SCAN_LIST_LABELS[cohort.scanList].display} yet.
      </p>
    );
  }
  if (cohort.loading || !cohort.scope) {
    return (
      <p className="rounded-md border border-line bg-surface-2 p-3 text-[12px] italic text-ink-3">
        Loading {SCAN_LIST_LABELS[cohort.scanList].display}…
      </p>
    );
  }
  return <>{children}</>;
}
