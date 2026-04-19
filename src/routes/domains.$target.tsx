/**
 * Convenience alias: `/domains/$target` redirects to the latest
 * scan's detail view at `/scans/<latest>/domains/$target`. Useful
 * for linking to a domain without having to know the scan date.
 *
 * Redirect runs in the route's `beforeLoad` hook so it happens
 * before any UI paints.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { loadScansIndex } from "../db/loader";

export const Route = createFileRoute("/domains/$target")({
  beforeLoad: async ({ params }) => {
    const scans = await loadScansIndex();
    const latest = scans[0];
    if (!latest) {
      // No scans published yet; fall through and render an empty
      // state rather than redirecting into a 404.
      return;
    }
    throw redirect({
      to: "/scans/$date/domains/$target",
      params: { date: latest.date, target: params.target },
    });
  },
  component: NoScansYet,
});

function NoScansYet() {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Domain detail</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        No scans have been published yet. Come back after the first weekly
        scan completes.
      </p>
    </section>
  );
}
