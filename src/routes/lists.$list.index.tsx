/**
 * `/lists/$list/` redirects to the list's domains table. The
 * cross-cohort Summary view lives at `/`; per-list landing pages
 * are the domains tables. Old bookmarks to /lists/$list/ continue
 * to work via this redirect.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { isScanList, type ScanList } from "../data/scanList";

export const Route = createFileRoute("/lists/$list/")({
  beforeLoad: ({ params }) => {
    if (!isScanList(params.list)) return;
    throw redirect({
      to: "/lists/$list/domains",
      params: { list: params.list as ScanList },
    });
  },
});
