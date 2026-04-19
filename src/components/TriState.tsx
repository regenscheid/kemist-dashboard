/**
 * Pill variant — compact colored badge with glyph + label. Used in
 * tables, stat cards, and dense grids where space is tight but the
 * state must still be unmistakable.
 */
import type { TriStateInput, TriStateTone } from "../lib/triState";
import {
  glyphFor,
  reasonText,
  statusLabel,
  toneFor,
} from "../lib/triState";

type Props = {
  observation: TriStateInput;
  /** Override label; defaults to statusLabel(obs). */
  label?: string;
  className?: string;
};

const toneClasses: Record<TriStateTone, string> = {
  green:
    "bg-green-50 text-green-900 ring-green-500/30 dark:bg-green-900/30 dark:text-green-200",
  red: "bg-red-50 text-red-900 ring-red-500/30 dark:bg-red-900/30 dark:text-red-200",
  blue: "bg-blue-50 text-blue-900 ring-blue-500/30 dark:bg-blue-900/30 dark:text-blue-200",
  gray: "bg-slate-100 text-slate-700 ring-slate-400/30 dark:bg-slate-800 dark:text-slate-300",
  amber:
    "bg-amber-50 text-amber-900 ring-amber-500/40 dark:bg-amber-900/30 dark:text-amber-200",
};

export function TriState({ observation, label, className = "" }: Props) {
  const tone = toneFor(observation);
  const glyph = glyphFor(observation);
  const text = label ?? statusLabel(observation);
  const tooltip = reasonText(observation);
  return (
    <span
      role="status"
      aria-label={tooltip}
      title={tooltip}
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset " +
        toneClasses[tone] +
        (className ? " " + className : "")
      }
    >
      <span aria-hidden="true" className="font-mono">
        {glyph}
      </span>
      <span>{text}</span>
    </span>
  );
}
