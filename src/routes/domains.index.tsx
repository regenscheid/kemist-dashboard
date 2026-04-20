/**
 * `/domains` — filterable, virtualized table of scanned domains.
 *
 * URL search params are the source of truth for filter + sort
 * state, so links are shareable and a refresh preserves the view.
 * All filter mutations call `navigate({ search })` which updates
 * the URL in place (no full reload).
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
  type PqcHybridFilter,
} from "../components/domains/filters";
import type { Scope } from "../data/scope";
import { useDomains, useLatestScanDate } from "../db/useDomains";

// ── URL search schema ────────────────────────────────────────────

type DomainsSearch = {
  date?: string;
  q?: string;
  show_unreachable?: boolean;
  tls?: string[];
  scope?: Scope[];
  pqc?: PqcHybridFilter[];
  err?: string[];
  exp?: CertExpiryWindow;
  sort?: string;
  desc?: boolean;
};

export const Route = createFileRoute("/domains/")({
  validateSearch: (raw): DomainsSearch => {
    const s = raw as Record<string, unknown>;
    const arr = (x: unknown): string[] =>
      Array.isArray(x)
        ? x.map(String)
        : typeof x === "string" && x.length > 0
          ? x.split(",")
          : [];
    // Accept `error_category` as a more legible alias of the short
    // `err` key — lets operators hand out links like
    //   /domains?error_category=dns_resolution_failed
    // without having to know the internal param name.
    const errValues =
      s.error_category !== undefined ? s.error_category : s.err;
    const asScopes = (x: unknown): Scope[] =>
      arr(x).filter((v): v is Scope =>
        ["federal-gov", "mil", "edu", "commercial", "unknown-tld"].includes(v),
      );
    const asPqc = (x: unknown): PqcHybridFilter[] =>
      arr(x).filter((v): v is PqcHybridFilter =>
        ["affirmative", "explicit_negative", "unknown"].includes(v),
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
      scope: asScopes(s.scope),
      pqc: asPqc(s.pqc),
      err: arr(errValues),
      exp: asExpiry(s.exp),
      ...(typeof s.sort === "string" ? { sort: s.sort } : {}),
      ...(typeof s.desc === "boolean" ? { desc: s.desc } : {}),
    };
  },
  component: DomainsRoute,
});

// ── Translate URL search → Filters shape and back ────────────────

function searchToFilters(s: DomainsSearch): Filters {
  return {
    q: s.q ?? "",
    show_unreachable: s.show_unreachable ?? false,
    tls_versions: s.tls ?? [],
    scopes: s.scope ?? [],
    pqc_hybrid: s.pqc ?? [],
    error_categories: s.err ?? [],
    cert_expiry: s.exp ?? "any",
  };
}

/**
 * Build a sparse search-param patch — keys only exist when they
 * carry state. `exactOptionalPropertyTypes: true` forbids explicit
 * `undefined` values, so the patcher below spreads into the next
 * search object and clears unset keys separately.
 */
function filtersToSearch(f: Filters): Partial<DomainsSearch> {
  const out: Partial<DomainsSearch> = {};
  if (f.q) out.q = f.q;
  if (f.show_unreachable) out.show_unreachable = true;
  if (f.tls_versions.length) out.tls = f.tls_versions;
  if (f.scopes.length) out.scope = f.scopes;
  if (f.pqc_hybrid.length) out.pqc = f.pqc_hybrid;
  if (f.error_categories.length) out.err = f.error_categories;
  if (f.cert_expiry !== "any") out.exp = f.cert_expiry;
  return out;
}

function DomainsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const latest = useLatestScanDate();
  const scanDate = search.date ?? latest;
  const { rows, status } = useDomains(scanDate ?? null);

  const filters = useMemo(() => searchToFilters(search), [search]);
  const sorting = useMemo<SortingState>(
    () =>
      search.sort ? [{ id: search.sort, desc: !!search.desc }] : [],
    [search.sort, search.desc],
  );

  // Memoize the `rows ?? []` fallback so downstream memos have a
  // stable reference when `rows` is undefined (first render).
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
      // Preserve sort + date, overwrite filter keys.  We clear the
      // old filter keys first so a reset truly empties them — then
      // layer the new patch on top.
      search: (prev) => {
        const cleared: DomainsSearch = { ...prev };
        delete cleared.q;
        delete cleared.show_unreachable;
        delete cleared.tls;
        delete cleared.scope;
        delete cleared.pqc;
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
            Domains
          </h1>
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

// Prevent an "unused import" warning — `EMPTY_FILTERS` is re-exported
// for external callers (tests) even though this route doesn't use it
// directly.
export { EMPTY_FILTERS };
