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

describe("<TriState> pill", () => {
  it("renders status text and carries the reason as an aria-label", () => {
    render(<TriState observation={take("observation_bool_affirmative")} />);
    const pill = screen.getByRole("status");
    expect(pill).toHaveTextContent("Supported");
    expect(pill).toHaveAccessibleName(/supported.*method: probed/i);
  });

  it("uses amber tone for errored probes", () => {
    const { container } = render(
      <TriState observation={take("observation_bool_error")} />,
    );
    // amber pill: the tone class string includes "amber".
    expect(container.querySelector("span.bg-amber-50, span.dark\\:bg-amber-900\\/30")).toBeTruthy();
  });

  it("surfaces the schema's reason string in the accessible label", () => {
    render(<TriState observation={take("observation_bool_not_probed")} />);
    const pill = screen.getByRole("status");
    expect(pill).toHaveAccessibleName(/hello_probe_failed:hello_probe_not_run/);
  });

  it("distinguishes not_probed from not_applicable with distinct glyphs", () => {
    const { rerender, container } = render(
      <TriState observation={take("observation_bool_not_probed")} />,
    );
    const notProbedText = container.textContent ?? "";
    rerender(<TriState observation={take("observation_bool_not_applicable")} />);
    const notApplicableText = container.textContent ?? "";
    expect(notProbedText).not.toBe(notApplicableText);
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
