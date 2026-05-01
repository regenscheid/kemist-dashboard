/**
 * Legacy `/domains/$target` alias — redirects to the default-list
 * detail view via /lists/$list/domains/$target (which itself
 * redirects to the latest scan date for that list).
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { DEFAULT_SCAN_LIST } from "../data/scanList";

export const Route = createFileRoute("/domains/$target")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/lists/$list/domains/$target",
      params: { list: DEFAULT_SCAN_LIST, target: params.target },
      replace: true,
    });
  },
});
