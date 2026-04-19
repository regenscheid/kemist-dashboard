import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  ScalarStat,
  ThreeBucketStat,
} from "./ThreeBucketStat";

describe("<ThreeBucketStat>", () => {
  it("shows all three counts — never a bare percentage", () => {
    render(
      <ThreeBucketStat
        title="PQC hybrid adoption"
        bucket={{
          affirmative: 68,
          explicit_negative: 1100,
          unknown: 72,
          denominator_label: "all scanned targets",
        }}
      />,
    );
    const card = screen.getByRole("group", { name: "PQC hybrid adoption" });
    // All three bucket counts must be visible — never collapse
    // unknowns into negatives. "68" appears twice (headline +
    // Supported bucket cell); that's expected, getAllByText
    // confirms at-least-one presence.
    expect(within(card).getAllByText("68").length).toBeGreaterThan(0);
    expect(within(card).getByText("1,100")).toBeInTheDocument();
    expect(within(card).getByText("72")).toBeInTheDocument();
  });

  it("shows the denominator label explicitly", () => {
    render(
      <ThreeBucketStat
        title="X"
        bucket={{
          affirmative: 1,
          explicit_negative: 0,
          unknown: 0,
          denominator_label: "TLS 1.3 handshakes only",
        }}
      />,
    );
    expect(
      screen.getByText(/TLS 1.3 handshakes only/),
    ).toBeInTheDocument();
  });

  it("survives a zero-total bucket without dividing by zero", () => {
    render(
      <ThreeBucketStat
        title="X"
        bucket={{
          affirmative: 0,
          explicit_negative: 0,
          unknown: 0,
          denominator_label: "none",
        }}
      />,
    );
    // No percentage should appear when total is 0.
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});

describe("<ScalarStat>", () => {
  it("shows yes/total format without a tri-state breakdown", () => {
    render(<ScalarStat title="PQC signature" yes={2} no={1338} />);
    const card = screen.getByRole("group", { name: "PQC signature" });
    expect(within(card).getByText(/^2$/)).toBeInTheDocument();
    expect(within(card).getByText(/1,340/)).toBeInTheDocument();
  });
});
