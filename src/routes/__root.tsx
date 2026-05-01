import {
  Link,
  Outlet,
  createRootRoute,
  useMatches,
} from "@tanstack/react-router";
import {
  ALL_SCAN_LISTS,
  DEFAULT_SCAN_LIST,
  SCAN_LIST_LABELS,
  isScanList,
  type ScanList,
} from "../data/scanList";

// App shell — nav + list selector + router outlet. Every route renders
// below this so the shell persists across navigation.
export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const activeList = useActiveScanList();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <nav className="mx-auto flex w-full max-w-screen-2xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm sm:px-6">
          <Link to="/" className="font-semibold">
            kemist-dashboard
          </Link>
          <ListSelector active={activeList} />
          <Link
            to="/lists/$list"
            params={{ list: activeList }}
            className="hover:underline [&.active]:font-semibold"
            activeOptions={{ exact: true }}
          >
            Summary
          </Link>
          <Link
            to="/lists/$list/domains"
            params={{ list: activeList }}
            className="hover:underline [&.active]:font-semibold"
          >
            Domains
          </Link>
          <Link
            to="/about"
            className="ml-auto hover:underline [&.active]:font-semibold"
          >
            About
          </Link>
          {import.meta.env.DEV && (
            <Link
              to="/dev/tristate"
              className="text-slate-500 hover:underline [&.active]:font-semibold"
              title="Tri-state component gallery (dev only)"
            >
              dev
            </Link>
          )}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

/**
 * Read the currently active scan_list from the route match params.
 * Returns DEFAULT_SCAN_LIST on routes that don't have a $list segment
 * (About, the dev gallery), so cross-route Links land on a sensible
 * default rather than crashing on missing params.
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

function ListSelector({ active }: { active: ScanList }) {
  return (
    <div
      role="tablist"
      aria-label="Scan list"
      className="flex items-center gap-1 rounded-full border border-slate-300 bg-white p-0.5 text-xs dark:border-slate-700 dark:bg-slate-900"
    >
      {ALL_SCAN_LISTS.map((list) => {
        const label = SCAN_LIST_LABELS[list];
        const isActive = list === active;
        return (
          <Link
            key={list}
            role="tab"
            aria-selected={isActive}
            to="/lists/$list"
            params={{ list }}
            className={[
              "rounded-full px-3 py-1 transition-colors",
              isActive
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
            ].join(" ")}
            title={`${label.display} · ${label.cadence}`}
          >
            {label.display}{" "}
            <span className="text-[11px]">({label.cadence})</span>
          </Link>
        );
      })}
    </div>
  );
}
