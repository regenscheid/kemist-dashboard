/**
 * Tri-state pill — three visible classes (aff / neg / unk) with
 * `+`, `−`, `?` glyphs, oklch token palette. The seven-class
 * taxonomy from `lib/triState.ts` is preserved in the tooltip /
 * aria-label / Method columns elsewhere; this primitive is the
 * design's TriPill verbatim.
 */
import type { TriPillClass, TriStateInput } from "../lib/triState";
import {
  reasonText,
  triPillClass,
  triPillGlyph,
  triPillLabel,
} from "../lib/triState";

type Props = {
  observation: TriStateInput;
  /** Override the default generic label ("supported" / "rejected" / "unknown"). */
  label?: string;
  /** Compact size for table cells: smaller padding, 10.5px font. */
  compact?: boolean;
  className?: string;
};

const toneClasses: Record<TriPillClass, string> = {
  aff: "bg-aff-bg text-aff-fg ring-[color-mix(in_oklch,var(--aff),transparent_70%)]",
  neg: "bg-neg-bg text-neg-fg ring-[color-mix(in_oklch,var(--neg),transparent_70%)]",
  unk: "bg-unk-bg text-unk-fg ring-[color-mix(in_oklch,var(--unk),transparent_70%)]",
};

export function TriState({
  observation,
  label,
  compact = false,
  className = "",
}: Props) {
  const cls = triPillClass(observation);
  const glyph = triPillGlyph(cls);
  const text = label ?? triPillLabel(cls);
  const tooltip = reasonText(observation);

  const sizing = compact
    ? "px-1.5 py-0 text-[10.5px]"
    : "px-2 py-0.5 text-[11px]";

  return (
    <span
      role="status"
      aria-label={tooltip}
      title={tooltip}
      className={[
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full font-medium ring-1 ring-inset",
        sizing,
        toneClasses[cls],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span aria-hidden="true" className="font-mono font-bold">
        {glyph}
      </span>
      <span>{text}</span>
    </span>
  );
}
