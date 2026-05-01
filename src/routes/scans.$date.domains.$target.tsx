/**
 * Legacy `/scans/$date/domains/$target` redirect — points at the
 * default-list detail view. Shareable links from before the
 * orchestrator-contract rev resolve via this redirect.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { DEFAULT_SCAN_LIST } from "../data/scanList";

export const Route = createFileRoute("/scans/$date/domains/$target")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/lists/$list/scans/$date/domains/$target",
      params: {
        list: DEFAULT_SCAN_LIST,
        date: params.date,
        target: params.target,
      },
      replace: true,
    });
  },
});
