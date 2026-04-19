/**
 * Minimal ECharts wrapper. Keeps the dashboard insulated from the
 * echarts-for-react package in case we need to swap it later; also
 * applies a consistent dark-mode-friendly theme setup.
 */

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import {
  BarChart,
  TreemapChart,
  type BarSeriesOption,
  type TreemapSeriesOption,
} from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  TitleComponent,
  DatasetComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ComposeOption } from "echarts/core";

// Register only the chart types + components we actually use so the
// bundle stays lean. Everything else is tree-shaken out.
echarts.use([
  BarChart,
  TreemapChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  TitleComponent,
  DatasetComponent,
  CanvasRenderer,
]);

export type EChartOption = ComposeOption<
  BarSeriesOption | TreemapSeriesOption
>;

type Props = {
  option: EChartOption;
  height?: string | number;
  ariaLabel?: string;
};

export function EChart({ option, height = 300, ariaLabel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    // Dark-mode detection for theme. We don't use ECharts' built-in
    // themes because they pull in extra weight; setting a minimal
    // theme inline matches the Tailwind palette used elsewhere.
    const isDark =
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark");
    instanceRef.current = echarts.init(
      containerRef.current,
      isDark ? "dark" : undefined,
    );
    return () => {
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    instanceRef.current?.setOption(option, true);
  }, [option]);

  useEffect(() => {
    function onResize() {
      instanceRef.current?.resize();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      style={{
        width: "100%",
        height: typeof height === "number" ? `${height}px` : height,
      }}
    />
  );
}
