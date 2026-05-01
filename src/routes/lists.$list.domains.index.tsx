/**
 * `/lists/$list/domains/` — filterable, virtualized table of scanned
 * domains scoped to one scan_list. Path-segment carries the list;
 * URL search params still carry filter + sort state for shareability.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import type { SortingState } from "@tanstack/react-table";
import { DomainsTable } from "../components/domains/DomainsTable";
import { FiltersPanel } from "../components/domains/FiltersPanel";
import {
  EMPTY_FILTERS,
  buildFacetOptions,
  isRespondingHost,
  matchesFilters,
  type CertExpiryWindow,
  type Filters,
  type KxSupportFilter,
} from "../components/domains/filters";
import { useDomains, useLatestScanDate } from "../db/useDomains";
import {
  isScanList,
  SCAN_LIST_LABELS,
  type ScanList,
} from "../data/scanList";

type DomainsSearch = {
  date?: string;
  q?: string;
  show_unreachable?: boolean;
  tls?: string[];
  max_tls?: string;
  kx?: KxSupportFilter[];
  err?: string[];
  exp?: CertExpiryWindow;
  sort?: string;
  desc?: boolean;
};

export const Route = createFileRoute("/lists/$list/domains/")({
  validateSearch: (raw): DomainsSearch => {
    const s = raw as Record<string, unknown>;
    const arr = (x: unknown): string[] =>
      Array.isArray(x)
        ? x.map(String)
        : typeof x === "string" && x.length > 0
          ? x.split(",")
          : [];
    const errValues =
      s.error_category !== undefined ? s.error_category : s.err;
    const asKx = (x: unknown): KxSupportFilter[] =>
      arr(x).filter((v): v is KxSupportFilter =>
        ["pure_pqc", "pqc_hybrid", "ecc", "rsa", "ffdh"].includes(v),
      );
    const asExpiry = (x: unknown): CertExpiryWindow => {
      if (x === "expired" || x === "lt30" || x === "lt90") return x;
      return "any";
    };
    const asBool = (x: unknown): boolean =>
      x === true || x === "true" || x === "1";
    return {
      ...(typeof s.date === "string" ? { date: s.date } : {}),
      ...(typeof s.q === "string" && s.q.length > 0 ? { q: s.q } : {}),
      ...(asBool(s.show_unreachable) ? { show_unreachable: true } : {}),
      tls: arr(s.tls),
      ...(typeof s.max_tls === "string" && s.max_tls.length > 0
        ? { max_tls: s.max_tls }
        : {}),
      kx: asKx(s.kx),
      err: arr(errValues),
      exp: asExpiry(s.exp),
      ...(typeof s.sort === "string" ? { sort: s.sort } : {}),
      ...(typeof s.desc === "boolean" ? { desc: s.desc } : {}),
    };
  },
  component: DomainsRoute,
});

function searchToFilters(s: DomainsSearch): Filters {
  return {
    q: s.q ?? "",
    show_unreachable: s.show_unreachable ?? false,
    tls_versions: s.tls ?? [],
    max_supported_tls_version: s.max_tls ?? "",
    kx_support: s.kx ?? [],
    error_categories: s.err ?? [],
    cert_expiry: s.exp ?? "any",
  };
}

function filtersToSearch(f: Filters): Partial<DomainsSearch> {
  const out: Partial<DomainsSearch> = {};
  if (f.q) out.q = f.q;
  if (f.show_unreachable) out.show_unreachable = true;
  if (f.tls_versions.length) out.tls = f.tls_versions;
  if (f.max_supported_tls_version) out.max_tls = f.max_supported_tls_version;
  if (f.kx_support.length) out.kx = f.kx_support;
  if (f.error_categories.length) out.err = f.error_categories;
  if (f.cert_expiry !== "any") out.exp = f.cert_expiry;
  return out;
}

function DomainsRoute() {
  const params = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const scanList = isScanList(params.list)
    ? (params.list as ScanList)
    : null;

  const latest = useLatestScanDate(scanList);
  const scanDate = search.date ?? latest;
  const { rows, status } = useDomains(scanDate ?? null, scanList);

  const filters = useMemo(() => searchToFilters(search), [search]);
  const sorting = useMemo<SortingState>(
    () =>
      search.sort ? [{ id: search.sort, desc: !!search.desc }] : [],
    [search.sort, search.desc],
  );

  const all = useMemo(() => rows ?? [], [rows]);
  const responding = useMemo(
    () => all.filter((r) => isRespondingHost(r)),
    [all],
  );
  const matched = useMemo(
    () => all.filter((r) => matchesFilters(r, filters)),
    [all, filters],
  );
  const matchedResponding = useMemo(
    () => matched.filter((r) => isRespondingHost(r)).length,
    [matched],
  );
  const unreachableCount = all.length - responding.length;
  const facetBase = filters.show_unreachable ? all : responding;
  const facetOptions = useMemo(
    () => buildFacetOptions(facetBase),
    [facetBase],
  );

  function setFilters(next: Filters) {
    const patch = filtersToSearch(next);
    navigate({
      search: (prev) => {
        const cleared: DomainsSearch = { ...prev };
        delete cleared.q;
        delete cleared.show_unreachable;
        delete cleared.tls;
        delete cleared.max_tls;
        delete cleared.kx;
        delete cleared.err;
        delete cleared.exp;
        return { ...cleared, ...patch };
      },
    });
  }

  function setSorting(next: SortingState) {
    const first = next[0];
    navigate({
      search: (prev) => {
        const out: DomainsSearch = { ...prev };
        if (first) {
          out.sort = first.id;
          out.desc = first.desc;
        } else {
          delete out.sort;
          delete out.desc;
        }
        return out;
      },
    });
  }

  if (!scanList) return null;

  return (
    <section
      aria-labelledby="domains-heading"
      className="grid grid-cols-1 gap-6 md:grid-cols-[14rem_1fr]"
    >
      <div className="md:order-first">
        <FiltersPanel
          filters={filters}
          onChange={setFilters}
          options={facetOptions}
          totalResponding={responding.length}
          matchedResponding={matchedResponding}
          unreachableCount={unreachableCount}
        />
      </div>
      <div className="space-y-3">
        <header className="flex items-baseline gap-3">
          <h1
            id="domains-heading"
            className="text-2xl font-semibold tracking-tight"
          >
            {SCAN_LIST_LABELS[scanList].display} domains
          </h1>
          <span className="text-xs uppercase tracking-wide text-slate-500">
            {SCAN_LIST_LABELS[scanList].cadence}
          </span>
          {scanDate && (
            <span className="text-sm text-slate-500">scan {scanDate}</span>
          )}
        </header>
        {renderStatusBanner(status)}
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {matchedResponding.toLocaleString()} of {responding.length.toLocaleString()} responding hosts
          {` · ${unreachableCount.toLocaleString()} unreachable`}
        </p>
        {(status.kind === "ready" || rows !== undefined) && (
          <DomainsTable
            rows={matched}
            sorting={sorting}
            onSortingChange={setSorting}
            scanList={scanList}
          />
        )}
      </div>
    </section>
  );
}

function renderStatusBanner(status: ReturnType<typeof useDomains>["status"]) {
  if (status.kind === "loading") {
    return (
      <div
        role="status"
        className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300"
      >
        {status.message} Seeding IndexedDB — large scans may take a few
        seconds on first visit.
      </div>
    );
  }
  if (status.kind === "error") {
    return (
      <div
        role="alert"
        className="rounded border border-red-500/40 bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-200"
      >
        Failed to load scan: {status.message}
      </div>
    );
  }
  return null;
}

export { EMPTY_FILTERS };
