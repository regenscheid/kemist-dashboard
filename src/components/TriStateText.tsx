/**
 * Inline text variant — structured prose suitable for detail views.
 * Reads better than a pill in dense labeled rows ("EMS: Supported
 * (probed)") and leaves more room for the reason string.
 */
import type { Method } from "../data/schema";
import type {
  Polarity,
  PolarityLabels,
  TriStateInput,
  TriStateTone,
} from "../lib/triState";
import { methodLabel, statusLabel, toneFor } from "../lib/triState";

type Props = {
  observation: TriStateInput;
  /**
   * When true (default), inline the method after the status in
   * parentheses. Set to false for contexts where the method is
   * already shown via a neighboring badge.
   */
  showMethod?: boolean;
  /**
   * Field polarity — "negative" when `value: true` is the worse posture.
   * Swaps the green/red treatment so the secure outcome reads as secure.
   * Defaults to "positive"; see `Polarity` in lib/triState.
   */
  polarity?: Polarity;
  /**
   * Per-field wording for the two definitive states. Negative-polarity
   * fields need this — the generic "Rejected" describes a server refusal,
   * which is the wrong sentence for "the extension was not negotiated".
   */
  labels?: PolarityLabels;
};

const toneTextClasses: Record<TriStateTone, string> = {
  green: "text-green-700 dark:text-green-300",
  red: "text-red-700 dark:text-red-300",
  blue: "text-blue-700 dark:text-blue-300",
  gray: "text-slate-500 dark:text-slate-400",
  amber: "text-amber-700 dark:text-amber-300",
};

export function TriStateText({
  observation,
  showMethod = true,
  polarity = "positive",
  labels,
}: Props) {
  const tone = toneFor(observation, polarity);
  const status = statusLabel(observation, labels);
  const method: Method = observation.method;
  const reason = observation.reason;
  return (
    // overflow-wrap: anywhere lets long unbroken reason tokens (e.g.
    // "rejected_via_mandated_alert:inappropriate_fallback_at_tls1_2")
    // wrap at any character when the cell is narrower than the string —
    // otherwise the value overflows the card on phones.
    <span className={`[overflow-wrap:anywhere] ${toneTextClasses[tone]}`}>
      <span className="font-medium">{status}</span>
      {showMethod && (
        <>
          {" "}
          <span className="text-slate-500 dark:text-slate-400">
            ({methodLabel(method)}
            {reason ? `; ${reason}` : ""})
          </span>
        </>
      )}
    </span>
  );
}
