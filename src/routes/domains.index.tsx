/**
 * Legacy `/domains` route — redirects to the default-list domains
 * view. Old shareable links survive this rev so external bookmarks
 * don't 404.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { DEFAULT_SCAN_LIST } from "../data/scanList";

export const Route = createFileRoute("/domains/")({
  beforeLoad: () => {
    throw redirect({
      to: "/lists/$list/domains",
      params: { list: DEFAULT_SCAN_LIST },
      replace: true,
    });
  },
});
