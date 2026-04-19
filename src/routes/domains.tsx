import { createFileRoute } from "@tanstack/react-router";

// PR 5 replaces this with the TanStack Table + TanStack Virtual
// filterable domain table. Clicking a row navigates to
// /scans/$date/domains/$target.
export const Route = createFileRoute("/domains")({
  component: DomainsRoute,
});

function DomainsRoute() {
  return (
    <section aria-labelledby="domains-heading">
      <h1 id="domains-heading" className="text-2xl font-semibold tracking-tight">
        Domains
      </h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        Filterable virtualized table of scanned domains. Populated by PR 5.
      </p>
    </section>
  );
}
