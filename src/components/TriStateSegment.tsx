/**
 * Stacked-bar segment variant. Intended for distribution charts
 * (ECharts "bar" series) — provides the color + label mapping so
 * that every chart uses the same palette and the "Unknown" segment
 * is always explicit.
 *
 * Exports `triStateBarSeries()` which converts counts-by-class into
 * ECharts series data. Components don't render anything; ECharts
 * handles that. The palette is exposed so charts that aren't
 * bar-shaped (e.g. treemap, pie) can reuse the same colors.
 */
import type { TriStateClass } from "../lib/triState";

/**
 * Counts for every tri-state class. Callers aggregate their dataset
 * into this shape before handing it to the bar series builder.
 */
export type TriStateCounts = Record<TriStateClass, number>;

export const emptyCounts = (): TriStateCounts => ({
  affirmative: 0,
  explicit_negative: 0,
  connection_state_affirmative: 0,
  connection_state_negative: 0,
  unknown_not_probed: 0,
  unknown_not_applicable: 0,
  unknown_error: 0,
});

/**
 * Chart-facing palette. Matches the component tone palette in the
 * pill + text variants so the three views look coherent. Values are
 * oklch literals — ECharts accepts CSS color strings, so the same
 * tokens used in component CSS apply here too.
 *
 * Exported so a non-bar chart (treemap, pie) can reuse the same
 * colors for the same classes. Keep this as the single source of
 * truth for color-by-class decisions.
 */
export const triStateColors: Record<TriStateClass, string> = {
  affirmative: "oklch(0.55 0.10 150)",
  explicit_negative: "oklch(0.55 0.06 30)",
  connection_state_affirmative: "oklch(0.45 0.10 150)",
  connection_state_negative: "oklch(0.65 0.08 150)",
  unknown_not_probed: "oklch(0.65 0.005 250)",
  unknown_not_applicable: "oklch(0.55 0.005 250)",
  unknown_error: "oklch(0.60 0.10 60)",
};

/**
 * Human-readable legend labels for each class. Critical: every
 * unknown sub-bucket is named explicitly — we never collapse them
 * into a single "unknown" bucket in charts, because the method tells
 * you why (probe limit vs scanner error vs protocol n/a).
 */
export const triStateLegendLabels: Record<TriStateClass, string> = {
  affirmative: "Supported (probe)",
  explicit_negative: "Rejected (probe)",
  connection_state_affirmative: "Present (handshake)",
  connection_state_negative: "Absent (handshake)",
  unknown_not_probed: "Not probed",
  unknown_not_applicable: "Not applicable",
  unknown_error: "Probe errored",
};

/**
 * Presentation order used by chart legends — affirmative first,
 * unknowns last. Ordering matters: stacked bars read left-to-right
 * with the user's eye expecting "positive → negative → unknown".
 */
export const triStateDisplayOrder: TriStateClass[] = [
  "affirmative",
  "connection_state_affirmative",
  "explicit_negative",
  "connection_state_negative",
  "unknown_not_probed",
  "unknown_not_applicable",
  "unknown_error",
];

/**
 * Convert counts to ECharts series definitions (one series per
 * class). Each series renders one segment of a stacked bar. Zero
 * counts are retained so the legend is stable across filter changes.
 *
 * Shape is ECharts-agnostic within reason — the returned object
 * matches the common "bar series" contract and can be spread into
 * an ECharts option.
 */
export function triStateBarSeries(
  countsByBar: Record<string, TriStateCounts>,
  stackId = "obs",
) {
  const bars = Object.keys(countsByBar);
  return triStateDisplayOrder.map((clazz) => ({
    type: "bar" as const,
    stack: stackId,
    name: triStateLegendLabels[clazz],
    itemStyle: { color: triStateColors[clazz] },
    data: bars.map((bar) => countsByBar[bar]?.[clazz] ?? 0),
  }));
}
