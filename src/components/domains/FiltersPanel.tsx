/**
 * Filter sidebar — multi-select chips per facet + free-text search
 * + cert-expiry window radio group.
 *
 * The component is controlled: state lives in the route, URL
 * search params are the source of truth, and the panel just
 * emits `onChange(nextFilters)` on every interaction so the route
 * can persist to the URL.
 */

import type { Scope } from "../../data/scope";
import type {
  CertExpiryWindow,
  FacetOption,
  Filters,
  PqcHybridFilter,
} from "./filters";
import { EMPTY_FILTERS, isFilterActive } from "./filters";

type Props = {
  filters: Filters;
  onChange: (next: Filters) => void;
  options: {
    tls_versions: FacetOption<string>[];
    scopes: FacetOption<Scope>[];
    error_categories: FacetOption<string>[];
  };
  totalRows: number;
  matchedRows: number;
};

const PQC_OPTIONS: FacetOption<PqcHybridFilter>[] = [
  { option: "affirmative", count: 0 },
  { option: "explicit_negative", count: 0 },
  { option: "unknown", count: 0 },
];
const PQC_LABELS: Record<PqcHybridFilter, string> = {
  affirmative: "Supported",
  explicit_negative: "Rejected",
  unknown: "Unknown",
};

const EXPIRY_OPTIONS: Array<{ key: CertExpiryWindow; label: string }> = [
  { key: "any", label: "Any" },
  { key: "lt30", label: "< 30 days" },
  { key: "lt90", label: "< 90 days" },
  { key: "expired", label: "Expired" },
];

export function FiltersPanel({
  filters,
  onChange,
  options,
  totalRows,
  matchedRows,
}: Props) {
  function toggle<K extends keyof Filters>(
    key: K,
    value: Filters[K] extends Array<infer V> ? V : never,
  ) {
    const current = filters[key] as unknown as Array<unknown>;
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({ ...filters, [key]: next });
  }

  return (
    <aside className="space-y-6" aria-label="Table filters">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Filters
        </h2>
        {isFilterActive(filters) && (
          <button
            type="button"
            className="text-xs text-slate-600 underline-offset-2 hover:underline dark:text-slate-400"
            onClick={() => onChange(EMPTY_FILTERS)}
          >
            Reset
          </button>
        )}
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        {matchedRows.toLocaleString()} of {totalRows.toLocaleString()} rows
      </p>

      {/* Free-text search */}
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Target contains
        </span>
        <input
          type="search"
          value={filters.q}
          onChange={(e) =>
            // eslint-disable-next-line no-restricted-syntax -- DOM input .value, not a tri-state field
            onChange({ ...filters, q: e.target.value })
          }
          placeholder="example.gov"
          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </label>

      <FacetBlock
        title="TLS version"
        options={options.tls_versions}
        selected={filters.tls_versions}
        onToggle={(v) => toggle("tls_versions", v)}
      />

      <FacetBlock
        title="Scope"
        options={options.scopes}
        selected={filters.scopes}
        onToggle={(v) => toggle("scopes", v)}
      />

      <FacetBlock
        title="PQC hybrid"
        options={PQC_OPTIONS}
        selected={filters.pqc_hybrid}
        onToggle={(v) => toggle("pqc_hybrid", v)}
        labelFor={(v) => PQC_LABELS[v]}
      />

      <FacetBlock
        title="Top error"
        options={options.error_categories}
        selected={filters.error_categories}
        onToggle={(v) => toggle("error_categories", v)}
      />

      <fieldset className="space-y-1">
        <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Cert expiry window
        </legend>
        {EXPIRY_OPTIONS.map((opt) => (
          <label
            key={opt.key}
            className="flex items-center gap-2 text-sm"
          >
            <input
              type="radio"
              name="cert_expiry"
              value={opt.key}
              checked={filters.cert_expiry === opt.key}
              onChange={() =>
                onChange({ ...filters, cert_expiry: opt.key })
              }
            />
            {opt.label}
          </label>
        ))}
      </fieldset>
    </aside>
  );
}

function FacetBlock<T extends string>({
  title,
  options,
  selected,
  onToggle,
  labelFor,
}: {
  title: string;
  options: FacetOption<T>[];
  selected: T[];
  onToggle: (value: T) => void;
  labelFor?: (v: T) => string;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </legend>
      <div className="flex flex-col gap-1">
        {options.map((opt) => {
          const isSelected = selected.includes(opt.option);
          return (
            <label
              key={opt.option}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(opt.option)}
                />
                <span>
                  {labelFor ? labelFor(opt.option) : opt.option}
                </span>
              </span>
              {opt.count > 0 && (
                <span className="text-xs text-slate-500">{opt.count}</span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
