/**
 * Pure helpers for ObsTable callers — kept outside the component
 * file so eslint-plugin-react-refresh's "only export components"
 * rule stays happy.
 */

import { triPillClass, type TriStateInput } from "../../lib/triState";

export type ObsRow = {
  /** Field-name shown in the first column. */
  label: string;
  /** Tri-state observation rendered as a pill in column 2. */
  observation: TriStateInput;
  /** Override pill label (otherwise generic "supported / rejected / unknown"). */
  resultLabel?: string;
  /** Optional fourth-column detail text. Schema's `reason` if blank. */
  detail?: React.ReactNode;
};

/** Predicate: should this row be hidden when "hide unknown" is on? */
export function isUnknownRow(row: ObsRow): boolean {
  return triPillClass(row.observation) === "unk";
}

/**
 * Filter helper for the page-level "hide unknown" pass. Returns the
 * kept set plus a count for the optional hint line.
 */
export function partitionRows(
  rows: ObsRow[],
  hideUnknown: boolean,
): { kept: ObsRow[]; hidden: number } {
  if (!hideUnknown) return { kept: rows, hidden: 0 };
  const kept: ObsRow[] = [];
  let hidden = 0;
  for (const row of rows) {
    if (isUnknownRow(row)) hidden += 1;
    else kept.push(row);
  }
  return { kept, hidden };
}
