/**
 * Canonical tri-state helpers for kemist schema-v1 observations.
 *
 * This module is the single load-bearing abstraction that keeps the
 * dashboard's tri-state contract intact: affirmative, explicit
 * negative, and unknown stay distinguishable everywhere. Raw
 * `.value` / `.offered` / `.supported` reads elsewhere in the
 * codebase are banned by lint rule — route through these helpers.
 *
 * The scanner emits four related shapes, all following the same
 * contract (value-like field + method + optional reason):
 *
 *   observationBool   { value:    bool|null, method, reason? }
 *   versionOffered    { offered:  bool|null, method, reason? }
 *   groupObservation  { supported: bool|null, method, reason? }
 *   cipherSuiteEntry  { name, iana_code, supported: bool|null, method, reason? }
 *
 * Consumers should pass any of these to `classify()`, which
 * normalizes to a single `TriStateClass` string enumeration.
 */

import type {
  CipherSuiteEntry,
  GroupObservation,
  Method,
  ObservationBool,
  VersionOffered,
} from "../data/schema";

/**
 * Normalized six-way classification. The scanner's five `method`
 * values collapse to these buckets for UI purposes:
 *
 *   probe + value=true           → affirmative
 *   probe + value=false          → explicit_negative
 *   not_probed                   → unknown_not_probed
 *   not_applicable               → unknown_not_applicable
 *   error                        → unknown_error
 *   connection_state + value=true  → affirmative
 *   connection_state + value=false → explicit_negative (rare; documented)
 *
 * `connection_state` is semantically "observed passively during a
 * successful handshake" — it carries the same certainty as `probe`
 * for affirmative/negative but with a different provenance badge in
 * the UI.
 */
export type TriStateClass =
  | "affirmative"
  | "explicit_negative"
  | "unknown_not_probed"
  | "unknown_not_applicable"
  | "unknown_error"
  | "connection_state_affirmative"
  | "connection_state_negative";

/**
 * Any of the four schema shapes — plus a "pre-normalized" shape where
 * the caller has already extracted the boolean. Using a tagged union
 * via discriminators (`value` vs `offered` vs `supported`) keeps the
 * caller's type information intact.
 */
export type TriStateInput =
  | ObservationBool
  | VersionOffered
  | GroupObservation
  | CipherSuiteEntry
  | { normalizedValue: boolean | null; method: Method; reason?: string };

/**
 * Extract the boolean-or-null from any of the four shapes. The
 * field name varies but the contract is identical.
 *
 * The casts are necessary because json-schema-to-typescript emits
 * an intersection with `{[k: string]: unknown}` for shapes that use
 * conditional `allOf` in the JSON Schema, which defeats `in`
 * narrowing. We trust the schema's invariant: if the `value` /
 * `offered` / `supported` key is present, its runtime type is
 * `boolean | null`.
 */
export function extractValue(obs: TriStateInput): boolean | null {
  if ("normalizedValue" in obs) return obs.normalizedValue as boolean | null;
  if ("value" in obs) return obs.value as boolean | null;
  if ("offered" in obs) return obs.offered as boolean | null;
  // CipherSuiteEntry and GroupObservation both use `supported`.
  if ("supported" in obs) return obs.supported as boolean | null;
  throw new Error("tri-state input has no value/offered/supported field");
}

export function classify(obs: TriStateInput): TriStateClass {
  const v = extractValue(obs);
  const m = obs.method;
  switch (m) {
    case "probe":
      return v === true
        ? "affirmative"
        : v === false
          ? "explicit_negative"
          : // Schema prohibits probe+null, but if it ever appears we
            // surface it as an error rather than silently bucketing.
            "unknown_error";
    case "connection_state":
      return v === true
        ? "connection_state_affirmative"
        : "connection_state_negative";
    case "not_probed":
      return "unknown_not_probed";
    case "not_applicable":
      return "unknown_not_applicable";
    case "error":
      return "unknown_error";
  }
}

/** Convenience predicates over the classification. */
export function isAffirmative(obs: TriStateInput): boolean {
  const c = classify(obs);
  return c === "affirmative" || c === "connection_state_affirmative";
}

export function isExplicitNegative(obs: TriStateInput): boolean {
  const c = classify(obs);
  return c === "explicit_negative" || c === "connection_state_negative";
}

export function isUnknown(obs: TriStateInput): boolean {
  const c = classify(obs);
  return (
    c === "unknown_not_probed" ||
    c === "unknown_not_applicable" ||
    c === "unknown_error"
  );
}

export function isNotProbed(obs: TriStateInput): boolean {
  return classify(obs) === "unknown_not_probed";
}

/**
 * Human-facing label for each method. Renderers use this to build
 * tooltip text and ARIA labels; never display the raw enum string.
 */
export function methodLabel(m: Method): string {
  switch (m) {
    case "probe":
      return "probed";
    case "not_probed":
      return "not probed";
    case "not_applicable":
      return "not applicable";
    case "error":
      return "probe errored";
    case "connection_state":
      return "observed in handshake";
  }
}

/**
 * A single-sentence description of the observation suitable for a
 * tooltip. `reason` is surfaced verbatim when present — it carries
 * the scanner's canonical diagnostic string and shouldn't be
 * paraphrased.
 */
export function reasonText(obs: TriStateInput): string {
  const v = extractValue(obs);
  const m = obs.method;
  const reason = obs.reason;
  const base = (() => {
    switch (classify(obs)) {
      case "affirmative":
        return "supported";
      case "explicit_negative":
        return "rejected";
      case "connection_state_affirmative":
        return "present in handshake";
      case "connection_state_negative":
        return "absent from handshake";
      case "unknown_not_probed":
        return "not probed";
      case "unknown_not_applicable":
        return "not applicable";
      case "unknown_error":
        return "probe errored";
    }
  })();
  if (reason) return `${base}: ${reason} (method: ${methodLabel(m)})`;
  // Intentional: value is here to help future callers who want the
  // raw bool in logs without calling extractValue themselves.
  void v;
  return `${base} (method: ${methodLabel(m)})`;
}

/**
 * Visual treatment tokens. Components map these to concrete styling
 * (Tailwind classes, ECharts colors, etc.). Keeping the token set
 * abstract means we can retheme without touching the helpers.
 */
export type TriStateTone =
  | "green" // affirmative (probe)
  | "red" // explicit negative (probe)
  | "blue" // connection_state (either polarity — disambiguated by icon)
  | "gray" // unknown: not_probed / not_applicable
  | "amber"; // unknown: error (more attention-grabbing)

export function toneFor(obs: TriStateInput): TriStateTone {
  switch (classify(obs)) {
    case "affirmative":
      return "green";
    case "explicit_negative":
      return "red";
    case "connection_state_affirmative":
    case "connection_state_negative":
      return "blue";
    case "unknown_not_probed":
    case "unknown_not_applicable":
      return "gray";
    case "unknown_error":
      return "amber";
  }
}

/**
 * Short glyph for pill / segment rendering. Shape is load-bearing
 * for colorblind users — never use color alone to distinguish
 * states. Shape + text is the minimum.
 */
export function glyphFor(obs: TriStateInput): string {
  switch (classify(obs)) {
    case "affirmative":
      return "✓";
    case "explicit_negative":
      return "✗";
    case "connection_state_affirmative":
      return "●";
    case "connection_state_negative":
      return "○";
    case "unknown_not_probed":
      return "?";
    case "unknown_not_applicable":
      return "—";
    case "unknown_error":
      return "⚠";
  }
}

/**
 * One-word status label for inline / compact display.
 */
export function statusLabel(obs: TriStateInput): string {
  switch (classify(obs)) {
    case "affirmative":
      return "Supported";
    case "explicit_negative":
      return "Rejected";
    case "connection_state_affirmative":
      return "Present";
    case "connection_state_negative":
      return "Absent";
    case "unknown_not_probed":
      return "Not probed";
    case "unknown_not_applicable":
      return "N/A";
    case "unknown_error":
      return "Errored";
  }
}
