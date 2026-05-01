/**
 * Accessibility smoke test — runs axe-core against each primary
 * route and fails on any critical or serious WCAG 2.1 AA violation.
 *
 * The test uses `.include("main")` to scope axe to the route's main
 * content so we aren't reporting on third-party widgets or the
 * generated Vite dev HUD. Nav + provenance strip land in the
 * selector when we explicitly add them below.
 *
 * Runnable via `pnpm e2e`. First run needs
 * `pnpm exec playwright install chromium` to download the headless
 * browser.
 */

import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROUTES = [
  { path: "/", label: "Federal-vs-top-20k comparison" },
  { path: "/about", label: "About" },
  {
    path: "/lists/federal-website-index",
    label: "Federal summary",
  },
  {
    path: "/lists/federal-website-index/domains",
    label: "Federal domains table",
  },
  {
    path: "/lists/top20k-sfw",
    label: "Top-20k summary",
  },
  {
    path: "/lists/top20k-sfw/domains",
    label: "Top-20k domains table",
  },
  {
    path: "/lists/federal-website-index/scans/2026-01-02/domains/nist.gov%3A443",
    label: "Detail — nist.gov",
  },
  {
    path: "/lists/top20k-sfw/scans/2026-01-02/domains/github.com%3A443",
    label: "Detail — github.com (top-20k)",
  },
];

for (const { path, label } of ROUTES) {
  test(`${label} (${path}) has no critical or serious axe violations`, async ({
    page,
  }) => {
    await page.goto(path);
    // Let any async route data settle before the scan.
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      // Exclude ECharts' canvas nodes — axe can't introspect canvas
      // content, and we assert chart accessibility via explicit
      // aria-label props on the wrapper div.
      .exclude("canvas")
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    if (blocking.length > 0) {
      console.error(
        JSON.stringify(
          blocking.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            nodes: v.nodes.map((n) => n.target),
          })),
          null,
          2,
        ),
      );
    }
    expect(blocking).toEqual([]);
  });
}
