/**
 * Tailwind-aligned breakpoint detection.
 *
 * Returns the largest named breakpoint at or below the current
 * viewport width. Used to filter table columns at narrow widths so
 * less-critical columns disappear instead of forcing a horizontal
 * scroll. The breakpoint thresholds match Tailwind v4 defaults.
 */

import { useEffect, useState } from "react";

export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

const BREAKPOINTS: Record<Breakpoint, number> = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

/** Order from smallest to largest. Used by `isAtLeast`. */
const ORDER: readonly Breakpoint[] = ["xs", "sm", "md", "lg", "xl", "2xl"];

function getCurrent(): Breakpoint {
  if (typeof window === "undefined") return "lg";
  const w = window.innerWidth;
  if (w >= BREAKPOINTS["2xl"]) return "2xl";
  if (w >= BREAKPOINTS.xl) return "xl";
  if (w >= BREAKPOINTS.lg) return "lg";
  if (w >= BREAKPOINTS.md) return "md";
  if (w >= BREAKPOINTS.sm) return "sm";
  return "xs";
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(getCurrent);
  useEffect(() => {
    const handler = () => setBp(getCurrent());
    window.addEventListener("resize", handler);
    // Also handle the initial mismatch when the SSR fallback differs
    // from the client viewport — fire once on mount.
    handler();
    return () => window.removeEventListener("resize", handler);
  }, []);
  return bp;
}

export function isAtLeast(current: Breakpoint, target: Breakpoint): boolean {
  return ORDER.indexOf(current) >= ORDER.indexOf(target);
}
