import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useLatestScanDate } from "../db/useDomains";
import { useAggregates } from "../db/useAggregates";
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

export const Route = createFileRoute("/")({
  component: SummaryRoute,
});

function SummaryRoute() {
  const scanDate = useLatestScanDate();
  const { data, error, loading } = useAggregates(scanDate);

  // Scope selector — defaults to the cross-scope rollup.
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

  if (error) {
    return (
      <section aria-labelledby="summary-heading">
        <h1
          id="summary-heading"
          className="text-2xl font-semibold tracking-tight"
        >
          Summary
        </h1>
        <p className="mt-4 rounded border border-red-500/40 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-200">
          Failed to load aggregates: {error.message}
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
          Summary
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
          Summary
        </h1>
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
                // eslint-disable-next-line no-restricted-syntax -- DOM <select>.value, not a tri-state field
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
              className="rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              value={scanDate ?? ""}
              disabled
              title="Only the latest scan is available. Historical retention lands in v1."
            >
              <option value={scanDate ?? ""}>{scanDate ?? "—"}</option>
            </select>
          </label>
        </div>
      </header>

      {/* Cards row — every rate is three-bucket (supported / rejected / unknown). */}
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
          title="PQC hybrid (responding hosts)"
          bucket={selected.pqc_hybrid_of_all}
          caption="Excludes unreachable targets from the denominator."
        />
        <ThreeBucketStat
          title="PQC hybrid (TLS 1.3 only)"
          bucket={selected.pqc_hybrid_of_tls13}
          caption="Limited to successful TLS 1.3 handshakes."
        />
        <ScalarStat
          title="PQC signature"
          yes={selected.pqc_signature.yes}
          no={selected.pqc_signature.no}
          caption="Leaf certificate uses a PQC signature scheme."
        />
      </div>

      {/* Charts grid — all include explicit (unknown) buckets. */}
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
