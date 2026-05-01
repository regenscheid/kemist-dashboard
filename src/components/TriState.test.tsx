import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import fixture from "../../fixtures/tri-state-edge-cases.json";
import { TriState } from "./TriState";
import { TriStateText } from "./TriStateText";
import type { TriStateInput } from "../lib/triState";

const ex = fixture as unknown as Record<string, TriStateInput>;
function take(key: string): TriStateInput {
  const entry = ex[key];
  if (!entry) throw new Error(`fixture missing key: ${key}`);
  return entry;
}

describe("<TriState> pill (three-class TriPill)", () => {
  it("renders the generic 'supported' label and a `+` glyph for affirmative", () => {
    render(<TriState observation={take("observation_bool_affirmative")} />);
    const pill = screen.getByRole("status");
    expect(pill).toHaveTextContent("supported");
    expect(pill).toHaveTextContent("+");
    expect(pill).toHaveAccessibleName(/supported.*method: probed/i);
  });

  it("renders 'rejected' with a `−` glyph for explicit negatives", () => {
    render(
      <TriState observation={take("observation_bool_explicit_negative")} />,
    );
    const pill = screen.getByRole("status");
    expect(pill).toHaveTextContent("rejected");
    expect(pill).toHaveTextContent("−");
  });

  it("renders 'unknown' with a `?` glyph for not-probed observations", () => {
    render(<TriState observation={take("observation_bool_not_probed")} />);
    const pill = screen.getByRole("status");
    expect(pill).toHaveTextContent("unknown");
    expect(pill).toHaveTextContent("?");
  });

  it("uses the unk tone for errored probes (collapsed to unknown)", () => {
    const { container } = render(
      <TriState observation={take("observation_bool_error")} />,
    );
    // Three-class collapse — error becomes unk; the visual class is bg-unk-bg.
    expect(container.querySelector("span.bg-unk-bg")).toBeTruthy();
  });

  it("collapses connection_state observations into aff/neg classes", () => {
    const { container, rerender } = render(
      <TriState observation={take("observation_bool_connection_state_true")} />,
    );
    expect(container.querySelector("span.bg-aff-bg")).toBeTruthy();
    rerender(
      <TriState observation={take("observation_bool_connection_state_false")} />,
    );
    expect(container.querySelector("span.bg-neg-bg")).toBeTruthy();
  });

  it("preserves the schema's reason string in the accessible label", () => {
    render(<TriState observation={take("observation_bool_not_probed")} />);
    const pill = screen.getByRole("status");
    expect(pill).toHaveAccessibleName(
      /hello_probe_failed:hello_probe_not_run/,
    );
  });

  it("preserves the seven-class method distinction in the tooltip even when the visible class is collapsed", () => {
    render(<TriState observation={take("observation_bool_error")} />);
    const pill = screen.getByRole("status");
    // Visible label is the generic "unknown" but the tooltip carries
    // "probe errored" — the finer taxonomy is not lost.
    expect(pill).toHaveAccessibleName(/probe errored/);
    expect(pill).toHaveAccessibleName(
      /unexpected_alert_during_probe: internal_error/,
    );
  });

  it("supports a compact size for table cells", () => {
    const { container } = render(
      <TriState
        observation={take("observation_bool_affirmative")}
        compact
      />,
    );
    const pill = container.querySelector("span[role='status']");
    expect(pill?.className).toMatch(/text-\[10\.5px\]/);
  });
});

describe("<TriStateText> inline", () => {
  it("defaults to showing method in parentheses", () => {
    render(<TriStateText observation={take("observation_bool_affirmative")} />);
    expect(screen.getByText(/Supported/)).toBeInTheDocument();
    expect(screen.getByText(/method: probed/)).toBeInTheDocument();
  });

  it("omits the method parenthetical when showMethod=false", () => {
    render(
      <TriStateText
        observation={take("observation_bool_affirmative")}
        showMethod={false}
      />,
    );
    expect(screen.getByText(/Supported/)).toBeInTheDocument();
    expect(screen.queryByText(/method:/)).not.toBeInTheDocument();
  });

  it("inlines the reason when one is present", () => {
    render(<TriStateText observation={take("observation_bool_error")} />);
    expect(
      screen.getByText(
        /method: probe errored; unexpected_alert_during_probe: internal_error/,
      ),
    ).toBeInTheDocument();
  });
});
