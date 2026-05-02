/**
 * Inline text variant — structured prose suitable for detail views.
 * Reads better than a pill in dense labeled rows ("EMS: Supported
 * (probed)") and leaves more room for the reason string.
 */
import type { Method } from "../data/schema";
import type { TriStateInput } from "../lib/triState";
import { classify, methodLabel, statusLabel } from "../lib/triState";

type Props = {
  observation: TriStateInput;
  /**
   * When true (default), inline the method after the status in
   * parentheses. Set to false for contexts where the method is
   * already shown via a neighboring badge.
   */
  showMethod?: boolean;
};

const toneTextClasses: Record<ReturnType<typeof classify>, string> = {
  affirmative: "text-green-700 dark:text-green-300",
  explicit_negative: "text-red-700 dark:text-red-300",
  connection_state_affirmative: "text-blue-700 dark:text-blue-300",
  connection_state_negative: "text-blue-700 dark:text-blue-300",
  unknown_not_probed: "text-slate-500 dark:text-slate-400",
  unknown_not_applicable: "text-slate-500 dark:text-slate-400",
  unknown_error: "text-amber-700 dark:text-amber-300",
};

export function TriStateText({ observation, showMethod = true }: Props) {
  const clazz = classify(observation);
  const status = statusLabel(observation);
  const method: Method = observation.method;
  const reason = observation.reason;
  return (
    // overflow-wrap: anywhere lets long unbroken reason tokens (e.g.
    // "inappropriate_fallback_alert_at_change_cipher_spec") wrap at
    // any character when the cell is narrower than the string —
    // otherwise the value overflows the card on phones.
    <span
      className={`[overflow-wrap:anywhere] ${toneTextClasses[clazz]}`}
    >
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
