import { describe, expect, it } from "vitest";
import fixture from "../../fixtures/tri-state-edge-cases.json";
import type { TriStateInput } from "./triState";
import {
  classify,
  extractValue,
  glyphFor,
  isAffirmative,
  isExplicitNegative,
  isUnknown,
  methodLabel,
  reasonText,
  statusLabel,
  toneFor,
} from "./triState";

// Tri-state helpers are the load-bearing abstraction for the
// observation-only contract (never collapse null into false).
// Every schema shape (observationBool / versionOffered /
// groupObservation / cipherSuiteEntry) must flow through these
// helpers and classify identically. These tests exhaustively
// exercise all six TriStateClass buckets across all four shapes.

// Cast away the fixture's loose JSON type at the boundary — each
// named entry conforms to one of the four schema shapes the helpers
// accept. `take` throws a clear error if a fixture key was renamed
// or removed, rather than surfacing a generic undefined later.
const ex = fixture as unknown as Record<string, TriStateInput>;
function take(key: string): TriStateInput {
  const entry = ex[key];
  if (!entry) throw new Error(`fixture missing key: ${key}`);
  return entry;
}

describe("extractValue", () => {
  it("reads .value from observationBool shape", () => {
    expect(extractValue(take("observation_bool_affirmative"))).toBe(true);
    expect(extractValue(take("observation_bool_explicit_negative"))).toBe(false);
    expect(extractValue(take("observation_bool_not_probed"))).toBe(null);
  });

  it("reads .offered from versionOffered shape", () => {
    expect(extractValue(take("version_offered_affirmative"))).toBe(true);
    expect(extractValue(take("version_offered_negative"))).toBe(false);
    expect(extractValue(take("version_offered_not_probed"))).toBe(null);
  });

  it("reads .supported from groupObservation / cipherSuiteEntry", () => {
    expect(extractValue(take("group_observation_affirmative"))).toBe(true);
    expect(extractValue(take("cipher_suite_entry_affirmative"))).toBe(true);
    expect(extractValue(take("cipher_suite_entry_negative"))).toBe(false);
    expect(extractValue(take("cipher_suite_entry_not_probed"))).toBe(null);
  });
});

describe("classify", () => {
  it("buckets probe+true as affirmative", () => {
    expect(classify(take("observation_bool_affirmative"))).toBe("affirmative");
    expect(classify(take("version_offered_affirmative"))).toBe("affirmative");
    expect(classify(take("group_observation_affirmative"))).toBe("affirmative");
    expect(classify(take("cipher_suite_entry_affirmative"))).toBe("affirmative");
  });

  it("buckets probe+false as explicit_negative", () => {
    expect(classify(take("observation_bool_explicit_negative"))).toBe(
      "explicit_negative",
    );
    expect(classify(take("version_offered_negative"))).toBe("explicit_negative");
    expect(classify(take("group_observation_negative"))).toBe("explicit_negative");
    expect(classify(take("cipher_suite_entry_negative"))).toBe("explicit_negative");
  });

  it("buckets the three unknown methods distinctly", () => {
    expect(classify(take("observation_bool_not_probed"))).toBe("unknown_not_probed");
    expect(classify(take("observation_bool_not_applicable"))).toBe(
      "unknown_not_applicable",
    );
    expect(classify(take("observation_bool_error"))).toBe("unknown_error");
  });

  it("distinguishes connection_state affirmative vs negative", () => {
    expect(classify(take("observation_bool_connection_state_true"))).toBe(
      "connection_state_affirmative",
    );
    expect(classify(take("observation_bool_connection_state_false"))).toBe(
      "connection_state_negative",
    );
  });
});

describe("predicates", () => {
  it("isAffirmative covers probe+true and connection_state+true", () => {
    expect(isAffirmative(take("observation_bool_affirmative"))).toBe(true);
    expect(isAffirmative(take("observation_bool_connection_state_true"))).toBe(true);
    expect(isAffirmative(take("observation_bool_explicit_negative"))).toBe(false);
    expect(isAffirmative(take("observation_bool_not_probed"))).toBe(false);
  });

  it("isExplicitNegative covers probe+false and connection_state+false", () => {
    expect(isExplicitNegative(take("observation_bool_explicit_negative"))).toBe(true);
    expect(isExplicitNegative(take("observation_bool_connection_state_false"))).toBe(
      true,
    );
    expect(isExplicitNegative(take("observation_bool_affirmative"))).toBe(false);
    expect(isExplicitNegative(take("observation_bool_not_probed"))).toBe(false);
  });

  it("isUnknown never fires on a probe or connection_state observation", () => {
    expect(isUnknown(take("observation_bool_affirmative"))).toBe(false);
    expect(isUnknown(take("observation_bool_explicit_negative"))).toBe(false);
    expect(isUnknown(take("observation_bool_connection_state_true"))).toBe(false);
    expect(isUnknown(take("observation_bool_connection_state_false"))).toBe(false);
  });

  it("isUnknown fires on all three unknown methods", () => {
    expect(isUnknown(take("observation_bool_not_probed"))).toBe(true);
    expect(isUnknown(take("observation_bool_not_applicable"))).toBe(true);
    expect(isUnknown(take("observation_bool_error"))).toBe(true);
  });
});

describe("presentation helpers", () => {
  it("methodLabel renders each method as human prose", () => {
    expect(methodLabel("probe")).toBe("probed");
    expect(methodLabel("not_probed")).toBe("not probed");
    expect(methodLabel("not_applicable")).toBe("not applicable");
    expect(methodLabel("error")).toBe("errored");
    expect(methodLabel("connection_state")).toBe("observed");
  });

  it("statusLabel distinguishes every class", () => {
    const seen = new Set<string>();
    for (const key of Object.keys(ex)) {
      // Skip the JSON `$comment` annotation at the top of the fixture
      // (it's a documentation string, not an observation).
      if (key.startsWith("$")) continue;
      const obs = ex[key];
      if (!obs || typeof obs !== "object") continue;
      seen.add(statusLabel(obs));
    }
    // Seven buckets → seven distinct labels (one per TriStateClass).
    expect(seen.size).toBe(7);
  });

  it("reasonText surfaces the schema's reason string when present", () => {
    const obs = take("observation_bool_not_probed");
    const text = reasonText(obs);
    expect(text).toContain("hello_probe_failed:hello_probe_not_run");
    expect(text).toContain("not probed");
  });

  it("reasonText omits reason when schema didn't supply one", () => {
    const text = reasonText(take("observation_bool_affirmative"));
    expect(text).toContain("supported");
    expect(text).not.toContain("undefined");
  });

  it("toneFor maps each class to a distinct palette token", () => {
    expect(toneFor(take("observation_bool_affirmative"))).toBe("green");
    expect(toneFor(take("observation_bool_explicit_negative"))).toBe("red");
    expect(toneFor(take("observation_bool_connection_state_true"))).toBe("blue");
    expect(toneFor(take("observation_bool_not_probed"))).toBe("gray");
    expect(toneFor(take("observation_bool_not_applicable"))).toBe("gray");
    expect(toneFor(take("observation_bool_error"))).toBe("amber");
  });

  it("glyphFor uses shape (not color) to distinguish classes", () => {
    // Every class must produce a unique glyph — this is the a11y
    // guarantee that color isn't load-bearing.
    const glyphs = new Set([
      glyphFor(take("observation_bool_affirmative")),
      glyphFor(take("observation_bool_explicit_negative")),
      glyphFor(take("observation_bool_connection_state_true")),
      glyphFor(take("observation_bool_connection_state_false")),
      glyphFor(take("observation_bool_not_probed")),
      glyphFor(take("observation_bool_not_applicable")),
      glyphFor(take("observation_bool_error")),
    ]);
    expect(glyphs.size).toBe(7);
  });
});
