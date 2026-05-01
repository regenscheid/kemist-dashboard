/**
 * Filter sidebar — multi-select chips per facet + free-text search
 * + cert-expiry window radio group.
 *
 * The component is controlled: state lives in the route, URL
 * search params are the source of truth, and the panel just
 * emits `onChange(nextFilters)` on every interaction so the route
 * can persist to the URL.
 */

import { KX_SUPPORT_LABELS } from "../../data/kxSupport";
import type {
  CertExpiryWindow,
  FacetOption,
  Filters,
  KxSupportFilter,
} from "./filters";
import { EMPTY_FILTERS, isFilterActive } from "./filters";

type Props = {
  filters: Filters;
  onChange: (next: Filters) => void;
  options: {
    tls_versions: FacetOption<string>[];
    max_supported_tls_versions: FacetOption<string>[];
    kx_support: FacetOption<KxSupportFilter>[];
    organizations: FacetOption<string>[];
  };
  totalResponding: number;
  matchedResponding: number;
  unreachableCount: number;
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
  totalResponding,
  matchedResponding,
  unreachableCount,
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
    <aside
      className="space-y-5 rounded-md border border-line bg-surface p-4"
      aria-label="Table filters"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">
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
      <p className="text-xs text-ink-2">
        {matchedResponding.toLocaleString()} of {totalResponding.toLocaleString()} responding hosts
        {` · ${unreachableCount.toLocaleString()} unreachable`}
      </p>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={filters.show_unreachable}
          onChange={(e) =>
            onChange({ ...filters, show_unreachable: e.currentTarget.checked })
          }
        />
        <span>Show unreachable hosts</span>
      </label>

      {/* Free-text search */}
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">
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
          className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">
          Organization
        </span>
        {/* Typeable combobox: <input list="..."> + <datalist> gives a
            native dropdown of suggestions while letting users keep
            typing to narrow the table. Substring-matched in the
            predicate, so mid-type values still filter. */}
        <input
          type="search"
          list="filters-organization-options"
          value={filters.organization}
          // eslint-disable-next-line no-restricted-syntax -- DOM input value, not a tri-state field
          onChange={(e) => onChange({ ...filters, organization: e.target.value })}
          placeholder="Any organization"
          autoComplete="off"
          className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
        />
        <datalist id="filters-organization-options">
          {options.organizations.map((opt) => (
            <option key={opt.option} value={opt.option}>
              {opt.count > 0 ? `${opt.count}` : ""}
            </option>
          ))}
        </datalist>
      </label>

      <FacetBlock
        title="Supports version"
        options={options.tls_versions}
        selected={filters.tls_versions}
        onToggle={(v) => toggle("tls_versions", v)}
      />

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">
          Highest supported version
        </span>
        <select
          value={filters.max_supported_tls_version}
          onChange={(e) => {
            const selected =
              e.currentTarget.selectedOptions.item(0)?.getAttribute("value") ?? "";
            onChange({
              ...filters,
              max_supported_tls_version: selected,
            });
          }}
          className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none"
        >
          <option value="">Any</option>
          {options.max_supported_tls_versions.map((opt) => (
            <option key={opt.option} value={opt.option}>
              {opt.option}
              {opt.count > 0 ? ` (${opt.count})` : ""}
            </option>
          ))}
        </select>
      </label>

      <FacetBlock
        title="Key exchange support"
        options={options.kx_support}
        selected={filters.kx_support}
        onToggle={(v) => toggle("kx_support", v)}
        labelFor={(v) => KX_SUPPORT_LABELS[v]}
      />

      <fieldset className="space-y-1">
        <legend className="text-xs font-semibold uppercase tracking-wide text-ink-3">
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
      <legend className="text-xs font-semibold uppercase tracking-wide text-ink-3">
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
                <span className="text-xs text-ink-3">{opt.count}</span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
