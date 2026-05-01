/**
 * Layout route for `/lists/$list/...`.
 *
 * Validates the path segment against the canonical scan-list literals.
 * Bad strings (typos in pasted URLs, abbreviations) get redirected
 * to the default list rather than crashing the route tree.
 */

import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { DEFAULT_SCAN_LIST, isScanList } from "../data/scanList";

export const Route = createFileRoute("/lists/$list")({
  beforeLoad: ({ params }) => {
    if (!isScanList(params.list)) {
      throw redirect({
        to: "/lists/$list",
        params: { list: DEFAULT_SCAN_LIST },
        replace: true,
      });
    }
  },
  component: ListLayout,
});

function ListLayout() {
  return <Outlet />;
}
