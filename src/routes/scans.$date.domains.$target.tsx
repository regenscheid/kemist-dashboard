import { createFileRoute } from "@tanstack/react-router";

// PR 4 fills this in. Route key is scan_date + url-encoded target
// (target includes host:port). Resolution flow:
//   1. read batch_id from Dexie row (seeded by /domains) or index.json
//   2. fetch the containing batch-NNN.jsonl.gz (cached in Dexie)
//   3. extract the matching record, render full schema-v1 detail view
//      via <DetailSection> + <TriStateText>
export const Route = createFileRoute("/scans/$date/domains/$target")({
  component: DetailRoute,
});

function DetailRoute() {
  const { date, target } = Route.useParams();
  return (
    <section aria-labelledby="detail-heading">
      <h1 id="detail-heading" className="text-2xl font-semibold tracking-tight">
        {decodeURIComponent(target)}
      </h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Scan date: {date}
      </p>
      <p className="mt-4 text-slate-600 dark:text-slate-400">
        Detail view. Populated by PR 4.
      </p>
    </section>
  );
}
