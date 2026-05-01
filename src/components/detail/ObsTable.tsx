/**
 * Generic 4-column observation table — Field / Result / Method /
 * Detail. Used by Extensions, Downgrade, Resumption, Validation
 * sections. Columns align via `table-layout: fixed` + `<colgroup>`
 * so multiple ObsTables on a page share visual rhythm.
 */

import { TriState } from "../TriState";
import { methodLabel, triPillClass } from "../../lib/triState";
import type { ObsRow } from "./obsTableHelpers";

export type { ObsRow } from "./obsTableHelpers";

type Props = {
  rows: ObsRow[];
  /**
   * Width split. Defaults to balanced: field 30%, result 22%, method
   * 18%, detail 30%. Pass an array of pixel widths for fixed layouts
   * (e.g. when stacking ObsTables in a multi-section page).
   */
  columnWidths?: [string, string, string, string];
};

const DEFAULT_WIDTHS: [string, string, string, string] = [
  "30%",
  "22%",
  "18%",
  "30%",
];

export function ObsTable({ rows, columnWidths = DEFAULT_WIDTHS }: Props) {
  return (
    <table
      className="w-full border-separate border-spacing-0 text-[12px]"
      style={{ tableLayout: "fixed" }}
    >
      <colgroup>
        {columnWidths.map((w, i) => (
          <col key={i} style={{ width: w }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <Th>Field</Th>
          <Th>Result</Th>
          <Th>Method</Th>
          <Th>Detail</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const cls = triPillClass(row.observation);
          const tint =
            cls === "aff"
              ? "bg-aff-bg/40"
              : cls === "neg"
                ? "bg-neg-bg/30"
                : "";
          return (
            <tr key={`${row.label}-${i}`} className={tint}>
              <Td>{row.label}</Td>
              <Td>
                {row.resultLabel !== undefined ? (
                  <TriState
                    observation={row.observation}
                    label={row.resultLabel}
                    compact
                  />
                ) : (
                  <TriState observation={row.observation} compact />
                )}
              </Td>
              <Td>
                <span className="font-mono text-[11px] text-ink-2">
                  {methodLabel(row.observation.method)}
                </span>
              </Td>
              <Td>
                <span className="font-mono text-[11px] text-ink-2">
                  {row.detail ?? row.observation.reason ?? "—"}
                </span>
              </Td>
            </tr>
          );
        })}
        {rows.length === 0 && (
          <tr>
            <Td>
              <span className="text-ink-3 italic">
                No rows match the current filter.
              </span>
            </Td>
            <Td>{null}</Td>
            <Td>{null}</Td>
            <Td>{null}</Td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="border-b border-line px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-ink-3"
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="overflow-hidden border-b border-line-2 px-3 py-2 align-middle">
      {children}
    </td>
  );
}

// Filter helpers live in ./obsTableHelpers.ts so this file only
// exports the React component (fast-refresh rule).
