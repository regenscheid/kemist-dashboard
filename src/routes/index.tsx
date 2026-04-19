import { createFileRoute } from "@tanstack/react-router";

// PR 6 fills this in with three-bucket cards + ECharts distribution
// widgets reading from aggregates.json.
export const Route = createFileRoute("/")({
  component: SummaryRoute,
});

function SummaryRoute() {
  return (
    <section aria-labelledby="summary-heading">
      <h1
        id="summary-heading"
        className="text-2xl font-semibold tracking-tight"
      >
        Summary
      </h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        Fleet-level observation summary. Populated by PR 6.
      </p>
    </section>
  );
}
