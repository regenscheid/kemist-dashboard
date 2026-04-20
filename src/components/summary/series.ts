/**
 * Pure builders that translate `ScopeAggregates` into ECharts option
 * objects. Keeping these as functions (not components) makes them
 * trivial to unit-test without touching the chart library.
 */

import type { EChartOption } from "./EChart";
import { PQC_HYBRID_GROUPS } from "../../data/transform";

const TONE = {
  // Align with the TriStateSegment palette so all three views of
  // the data share a colour language.
  affirmative: "#16a34a",
  negative: "#dc2626",
  unknown: "#94a3b8",
  pqcHighlight: "#2563eb",
  generic: "#0ea5e9",
};

/**
 * Distribution bar: each key in the record becomes one labeled bar.
 * `(unknown)` entries render with a muted grey to signal "no data"
 * rather than collapsing them into something else.
 */
export function distributionBarOption(
  record: Record<string, number>,
  opts: {
    title: string;
    emptyLabel?: string;
    highlight?: (key: string) => string | null;
    sortDescending?: boolean;
    hideXAxisLabels?: boolean;
    forceAllXAxisLabels?: boolean;
    xAxisLabelRotate?: number;
  },
): EChartOption {
  const sortDesc = opts.sortDescending ?? true;
  const entries = Object.entries(record);
  entries.sort((a, b) => (sortDesc ? b[1] - a[1] : a[1] - b[1]));
  const categories = entries.map(([key]) =>
    key === "(unknown)" || key === "(none)"
      ? (opts.emptyLabel ?? key)
      : key,
  );
  const data = entries.map(([key, count]) => {
    let color = TONE.generic;
    if (key === "(unknown)" || key === "(none)") color = TONE.unknown;
    const override = opts.highlight?.(key);
    if (override) color = override;
    return { value: count, itemStyle: { color } };
  });
  return {
    title: { text: opts.title, left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: "4%", right: "4%", top: 40, bottom: 40, containLabel: true },
    xAxis: {
      type: "category",
      data: categories,
      axisLabel: {
        show: opts.hideXAxisLabels ? false : true,
        interval: opts.forceAllXAxisLabels ? 0 : "auto",
        rotate: opts.xAxisLabelRotate ?? (categories.length > 6 ? 30 : 0),
      },
    },
    yAxis: { type: "value", minInterval: 1 },
    series: [
      {
        type: "bar",
        data,
        barMaxWidth: 48,
      },
    ],
  };
}

/**
 * KX-group bar highlighting PQC hybrids in a distinct color.
 * Hybrids appear first in sort order so they're easy to spot.
 */
export function kxGroupOption(groups: Record<string, number>): EChartOption {
  const hybridSet = new Set(PQC_HYBRID_GROUPS as readonly string[]);
  return distributionBarOption(groups, {
    title: "Negotiated KX groups",
    highlight: (k) => (hybridSet.has(k) ? TONE.pqcHighlight : null),
    forceAllXAxisLabels: true,
    xAxisLabelRotate: 0,
  });
}

/**
 * Two bar series side-by-side — one for TLS 1.3 suites, one for
 * TLS 1.2. Sharing a grid keeps the visual weight comparable.
 */
export function cipherDistributionOption(
  ciphers: Record<string, number>,
): EChartOption {
  // Partition by "TLS13_" prefix.
  const tls13: Record<string, number> = {};
  const tls12: Record<string, number> = {};
  for (const [key, count] of Object.entries(ciphers)) {
    if (key.startsWith("TLS13_")) tls13[key] = count;
    else if (key === "(unknown)") tls13[key] = count;
    else tls12[key] = count;
  }
  const all = { ...tls13, ...tls12 };
  return distributionBarOption(all, {
    title: "Negotiated cipher suites",
    hideXAxisLabels: true,
  });
}

/**
 * Cert-issuer treemap. Treemap is better than bar when issuer
 * names are long and there's a long-ish tail — the relative area
 * conveys share at a glance.
 */
export function certIssuerTreemapOption(
  issuers: Record<string, number>,
): EChartOption {
  const data = Object.entries(issuers)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({
      name: name === "(unknown)" ? "(no cert observed)" : name,
      value,
    }));
  return {
    title: {
      text: "Certificate issuers",
      left: "center",
      textStyle: { fontSize: 14 },
    },
    tooltip: {
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number };
        // eslint-disable-next-line no-restricted-syntax -- ECharts tooltip param `.value`, not tri-state
        return `${p.name}: ${p.value}`;
      },
    },
    series: [
      {
        type: "treemap",
        data,
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        label: {
          show: true,
          formatter: "{b}",
        },
        upperLabel: { show: false },
        itemStyle: { borderColor: "#fff", borderWidth: 1, gapWidth: 1 },
      },
    ],
  };
}

export function tlsVersionOption(
  versions: Record<string, number>,
): EChartOption {
  return distributionBarOption(versions, {
    title: "TLS versions negotiated",
    highlight: (k) => (k === "TLSv1.3" ? TONE.affirmative : null),
  });
}

export function errorCategoryOption(
  categories: Record<string, number>,
): EChartOption {
  return distributionBarOption(categories, {
    title: "Top error categories",
    emptyLabel: "(clean scan)",
  });
}

/**
 * Return aggregate counts stripped of the placeholder `(none)` /
 * `(unknown)` keys — used when the caller wants only real values.
 * Exposed for tests.
 */
export function stripPlaceholders(
  record: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(record)) {
    if (k === "(unknown)" || k === "(none)") continue;
    out[k] = v;
  }
  return out;
}
