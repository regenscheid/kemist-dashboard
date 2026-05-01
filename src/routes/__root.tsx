import {
  Link,
  Outlet,
  createRootRoute,
  useMatches,
} from "@tanstack/react-router";
import {
  ALL_SCAN_LISTS,
  DEFAULT_SCAN_LIST,
  isScanList,
  type ScanList,
} from "../data/scanList";
import { useScanProvenance } from "../db/useDomains";

// App shell — sticky header (logo / 3-tab pill nav / provenance strip)
// + router outlet. Every route renders below this.
export const Route = createRootRoute({
  component: RootLayout,
});

const TABS: ReadonlyArray<{ id: "summary" | ScanList; label: string }> = [
  { id: "summary", label: "Summary" },
  { id: "federal-website-index", label: "Federal Websites" },
  { id: "top20k-sfw", label: "Top 20k Websites" },
] as const;

function RootLayout() {
  const activeList = useActiveScanList();
  const activeTab = useActiveTab();
  const provenance = useScanProvenance(activeList);

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur">
        {/* items-end + per-element bottom-margin. Margins differ
            between the nav (taller, internal padding) and the bare-text
            spans so that all *text baselines* line up, not the box
            bottoms. */}
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-end gap-x-6 gap-y-3 px-2 py-3 sm:px-4">
          <Link
            to="/"
            className="flex items-end gap-3 text-ink hover:no-underline"
            aria-label="Kemist dashboard home"
          >
            <img
              src={`${import.meta.env.BASE_URL}kemist-logo.svg`}
              alt=""
              className="h-[72px] w-auto"
            />
            <span className="mb-5 font-mono text-[13px] uppercase tracking-[0.08em] text-ink-3">
              / Dashboard
            </span>
          </Link>

          <nav
            role="tablist"
            aria-label="Top sections"
            className="mb-4 flex items-center gap-1 rounded-md border border-line bg-surface-2 p-0.5 text-sm"
          >
            {TABS.map((tab) => (
              <TabButton
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTab}
              />
            ))}
          </nav>

          <ProvenanceMeta provenance={provenance} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-screen-2xl px-2 py-6 sm:px-4">
        <Outlet />
      </main>
    </div>
  );
}

function TabButton({
  tab,
  isActive,
}: {
  tab: (typeof TABS)[number];
  isActive: boolean;
}) {
  const className = [
    "rounded px-3 py-1 transition-colors",
    isActive
      ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      : "text-ink-2 hover:text-ink",
  ].join(" ");

  if (tab.id === "summary") {
    return (
      <Link
        role="tab"
        aria-selected={isActive}
        to="/"
        activeOptions={{ exact: true }}
        className={className}
      >
        {tab.label}
      </Link>
    );
  }

  return (
    <Link
      role="tab"
      aria-selected={isActive}
      to="/lists/$list/domains"
      params={{ list: tab.id }}
      className={className}
    >
      {tab.label}
    </Link>
  );
}

function ProvenanceMeta({
  provenance,
}: {
  provenance: ReturnType<typeof useScanProvenance>;
}) {
  // `text` rather than `value` — the no-restricted-syntax rule
  // disallows reading `.value` on objects (it's how the codebase
  // forces tri-state observations to route through the helpers).
  const items: Array<{ label: string; text: string }> = [
    { label: "Scan", text: provenance.scan_date ?? "—" },
    {
      label: "Records",
      text:
        provenance.total_records != null
          ? provenance.total_records.toLocaleString()
          : "—",
    },
    {
      label: "Scanner",
      text:
        provenance.scanner_name && provenance.scanner_version
          ? `${provenance.scanner_name} ${provenance.scanner_version}`
          : "—",
    },
    {
      label: "Schema",
      text: provenance.schema_version ? `v${provenance.schema_version}` : "—",
    },
    { label: "Built", text: formatBuilt(provenance.build_timestamp) },
  ];

  return (
    <dl className="mb-5 ml-auto flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono text-[11px]">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-1.5">
          <dt className="uppercase tracking-[0.05em] text-ink-3">
            {item.label}
          </dt>
          <dd className="text-ink">{item.text}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatBuilt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace("T", " ") + "Z";
}

/**
 * Read the currently active scan_list from the route match params.
 * Routes without a $list segment (e.g. About, the dev gallery) fall
 * back to DEFAULT_SCAN_LIST so cross-route Links land somewhere sane.
 */
function useActiveScanList(): ScanList {
  const matches = useMatches();
  for (const match of matches) {
    const params = match.params as Record<string, unknown> | undefined;
    const list = params?.["list"];
    if (isScanList(list)) return list;
  }
  return DEFAULT_SCAN_LIST;
}

/**
 * Identify which top-tab is "active" given the current route.
 *   - Summary tab: the bare `/` (the canonical Summary location).
 *   - Federal/Top-20k: /lists/$list/* routes pinned to that list.
 *
 * Other routes (About, dev gallery) leave no tab highlighted.
 */
function useActiveTab(): "summary" | ScanList | null {
  const matches = useMatches();
  let listParam: ScanList | null = null;
  let onIndexRoute = false;
  for (const match of matches) {
    const params = match.params as Record<string, unknown> | undefined;
    const list = params?.["list"];
    if (isScanList(list)) listParam = list;
    if (match.routeId === "/") onIndexRoute = true;
  }
  if (listParam && ALL_SCAN_LISTS.includes(listParam)) return listParam;
  if (onIndexRoute) return "summary";
  return null;
}
