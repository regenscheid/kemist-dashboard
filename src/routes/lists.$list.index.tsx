/**
 * `/lists/$list/` — Summary route. Reads scan_list from the path
 * segment and presents per-list summary cards + charts. Adds a
 * minimal per-list date picker — full historical UI is a follow-up.
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useLatestScanDate } from "../db/useDomains";
import { useAggregates } from "../db/useAggregates";
import { loadScansIndex, type ScansIndexEntry } from "../db/loader";
import {
  SCAN_LIST_LABELS,
  isScanList,
  type ScanList,
} from "../data/scanList";
import {
  ScalarStat,
  ThreeBucketStat,
} from "../components/summary/ThreeBucketStat";
import { EChart } from "../components/summary/EChart";
import {
  certIssuerTreemapOption,
  cipherDistributionOption,
  errorCategoryOption,
  kxGroupOption,
  tlsVersionOption,
} from "../components/summary/series";

const ALL_SCOPE_KEY = "__all";

type SummarySearch = { date?: string };

export const Route = createFileRoute("/lists/$list/")({
  validateSearch: (search): SummarySearch => {
    const date = search["date"];
    return typeof date === "string" && date.length > 0 ? { date } : {};
  },
  component: SummaryRoute,
});

function SummaryRoute() {
  const params = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const scanList = isScanList(params.list)
    ? (params.list as ScanList)
    : null;
  const latest = useLatestScanDate(scanList);
  const scanDate = search.date ?? latest;
  const { data, error, loading } = useAggregates(scanDate ?? null, scanList);
  const dates = useListDates(scanList);

  const [scope, setScope] = useState<string>(ALL_SCOPE_KEY);
  const selected = useMemo(() => {
    if (!data) return null;
    return data.by_scope[scope] ?? data.by_scope[ALL_SCOPE_KEY] ?? null;
  }, [data, scope]);

  const tlsOption = useMemo(
    () => (selected ? tlsVersionOption(selected.tls_versions) : null),
    [selected],
  );
  const cipherOption = useMemo(
    () => (selected ? cipherDistributionOption(selected.ciphers) : null),
    [selected],
  );
  const kxOption = useMemo(
    () => (selected ? kxGroupOption(selected.kx_groups) : null),
    [selected],
  );
  const issuerOption = useMemo(
    () => (selected ? certIssuerTreemapOption(selected.cert_issuers) : null),
    [selected],
  );
  const errorsOption = useMemo(
    () => (selected ? errorCategoryOption(selected.error_categories) : null),
    [selected],
  );

  if (!scanList) return null;

  if (error) {
    return (
      <section aria-labelledby="summary-heading">
        <h1
          id="summary-heading"
          className="text-2xl font-semibold tracking-tight"
        >
          {SCAN_LIST_LABELS[scanList].display}
        </h1>
        <p className="mt-4 rounded border border-red-500/40 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-200">
          Failed to load aggregates: {error.message}
        </p>
      </section>
    );
  }

  if (!latest) {
    return (
      <section aria-labelledby="summary-heading">
        <h1
          id="summary-heading"
          className="text-2xl font-semibold tracking-tight"
        >
          {SCAN_LIST_LABELS[scanList].display}
        </h1>
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          No scans published for this list yet.
        </p>
      </section>
    );
  }

  if (loading || !data || !selected) {
    return (
      <section aria-labelledby="summary-heading">
        <h1
          id="summary-heading"
          className="text-2xl font-semibold tracking-tight"
        >
          {SCAN_LIST_LABELS[scanList].display}
        </h1>
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          Loading scan…
        </p>
      </section>
    );
  }

  const scopeOptions = [
    { key: ALL_SCOPE_KEY, label: "All scopes" },
    ...data.scopes_present.map((s) => ({ key: s, label: s })),
  ];

  return (
    <section aria-labelledby="summary-heading" className="space-y-6">
      <header className="flex flex-wrap items-baseline gap-3">
        <h1
          id="summary-heading"
          className="text-2xl font-semibold tracking-tight"
        >
          {SCAN_LIST_LABELS[scanList].display}
        </h1>
        <span className="text-xs uppercase tracking-wide text-slate-500">
          {SCAN_LIST_LABELS[scanList].cadence}
        </span>
        {scanDate && (
          <span className="text-sm text-slate-500">scan {scanDate}</span>
        )}
        <div className="ml-auto flex items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-slate-500">Scope</span>
            <select
              className="rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              value={scope}
              onChange={(e) =>
                // eslint-disable-next-line no-restricted-syntax -- DOM <select>.value
                setScope(e.target.value)
              }
            >
              {scopeOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-slate-500">Scan date</span>
            <select
              className="rounded border border-slate-300 bg-white px-2 py-1 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
              value={scanDate ?? ""}
              disabled={dates.length <= 1}
              onChange={(e) => {
                // eslint-disable-next-line no-restricted-syntax -- DOM <select>.value
                const next = e.target.value;
                navigate({
                  to: "/lists/$list",
                  params: { list: scanList },
                  search: next ? { date: next } : {},
                });
              }}
            >
              {dates.length === 0 ? (
                <option value={scanDate ?? ""}>{scanDate ?? "—"}</option>
              ) : (
                dates.map((d) => (
                  <option key={d.date} value={d.date}>
                    {d.date} ({d.record_count.toLocaleString()})
                  </option>
                ))
              )}
            </select>
          </label>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <ThreeBucketStat
          title="Handshake success"
          bucket={selected.handshake_success}
          caption="Shows how many scanned targets responded at all."
        />
        <ScalarStat
          title="Unreachable"
          yes={selected.unreachable_count}
          no={selected.responding_total}
          caption="Absolute count excluded from posture denominators."
        />
        <ThreeBucketStat
          title="TLS 1.3 adoption"
          bucket={selected.tls_1_3_of_all}
        />
        <ThreeBucketStat
          title="PQC support (responding hosts)"
          bucket={selected.pqc_support_of_all}
          caption="Hybrid OR pure post-quantum kx. Excludes unreachable targets."
        />
        <ThreeBucketStat
          title="PQC support (TLS 1.3 only)"
          bucket={selected.pqc_support_of_tls13}
          caption="Hybrid OR pure PQC, restricted to TLS 1.3 handshakes."
        />
        <ThreeBucketStat
          title="PQC hybrid (responding hosts)"
          bucket={selected.pqc_hybrid_of_all}
          caption="Hybrid-only — narrower than PQC support above."
        />
        <ScalarStat
          title="PQC signature"
          yes={selected.pqc_signature.yes}
          no={selected.pqc_signature.no}
          caption="Leaf certificate uses a PQC signature scheme."
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {tlsOption && (
          <ChartCard>
            <EChart option={tlsOption} ariaLabel="TLS version distribution" />
          </ChartCard>
        )}
        {cipherOption && (
          <ChartCard>
            <EChart option={cipherOption} ariaLabel="Cipher suite distribution" />
          </ChartCard>
        )}
        {kxOption && (
          <ChartCard>
            <EChart option={kxOption} ariaLabel="Key-exchange group distribution" />
          </ChartCard>
        )}
        {issuerOption && (
          <ChartCard>
            <EChart option={issuerOption} ariaLabel="Certificate issuer share" />
          </ChartCard>
        )}
        {errorsOption && (
          <ChartCard>
            <EChart option={errorsOption} ariaLabel="Top error categories" />
          </ChartCard>
        )}
      </div>
    </section>
  );
}

function ChartCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/30">
      {children}
    </div>
  );
}

/**
 * Per-list scan history. Filters the cross-list scans index down to
 * the active list and returns dates newest-first. Returns empty array
 * until the index is fetched (initial render).
 */
function useListDates(scan_list: ScanList | null): ScansIndexEntry[] {
  const [dates, setDates] = useState<ScansIndexEntry[]>([]);
  useEffect(() => {
    if (!scan_list) return;
    let cancelled = false;
    (async () => {
      try {
        const all = await loadScansIndex();
        if (cancelled) return;
        setDates(all.filter((s) => s.scan_list === scan_list));
      } catch {
        // ignore — picker degrades to read-only
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scan_list]);
  return dates;
}
