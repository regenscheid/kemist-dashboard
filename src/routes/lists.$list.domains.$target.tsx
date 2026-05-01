/**
 * Convenience alias: `/lists/$list/domains/$target` redirects to the
 * latest scan's detail view for that list. Useful for sharing a link
 * to a domain without having to look up the scan date.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { loadScansIndex } from "../db/loader";
import { isScanList, type ScanList } from "../data/scanList";

export const Route = createFileRoute("/lists/$list/domains/$target")({
  beforeLoad: async ({ params }) => {
    if (!isScanList(params.list)) return;
    const scanList = params.list as ScanList;
    const scans = await loadScansIndex();
    const latest = scans.find((s) => s.scan_list === scanList);
    if (!latest) {
      // No scans for this list yet (e.g. top-20k pre-first-monthly).
      // Fall through to the empty state.
      return;
    }
    throw redirect({
      to: "/lists/$list/scans/$date/domains/$target",
      params: {
        list: scanList,
        date: latest.date,
        target: params.target,
      },
    });
  },
  component: NoScansYet,
});

function NoScansYet() {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Domain detail</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        No scans have been published for this list yet. Come back after the
        next scheduled scan completes.
      </p>
    </section>
  );
}
