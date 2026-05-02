/**
 * Generic 4-column observation table — Field / Result / Method /
 * Detail. Used by Extensions, Downgrade, Resumption sections.
 *
 * Columns auto-hide as the viewport narrows: at sm and below the
 * Method column drops; at xs (phone portrait) the Detail column
 * also drops, leaving a focused two-column read of Field + Result.
 */

import { TriState } from "../TriState";
import { methodLabel, triPillClass } from "../../lib/triState";
import { isAtLeast, useBreakpoint } from "../../lib/useBreakpoint";
import type { ObsRow } from "./obsTableHelpers";

export type { ObsRow } from "./obsTableHelpers";

type Props = {
  rows: ObsRow[];
};

export function ObsTable({ rows }: Props) {
  const bp = useBreakpoint();
  const showMethod = isAtLeast(bp, "md");
  const showDetail = isAtLeast(bp, "sm");
  const visibleCols = 2 + (showMethod ? 1 : 0) + (showDetail ? 1 : 0);

  return (
    <table
      className="w-full border-separate border-spacing-0 text-[12px]"
      style={{ tableLayout: "fixed" }}
    >
      <colgroup>
        <col style={{ width: fieldWidth(visibleCols) }} />
        <col style={{ width: resultWidth(visibleCols) }} />
        {showMethod && <col style={{ width: "18%" }} />}
        {showDetail && <col style={{ width: "30%" }} />}
      </colgroup>
      <thead>
        <tr>
          <Th>Field</Th>
          <Th>Result</Th>
          {showMethod && <Th>Method</Th>}
          {showDetail && <Th>Detail</Th>}
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
                {/* When Method column is hidden, append the method
                    inline so the provenance is still visible. */}
                {!showMethod && (
                  <span className="ml-1.5 font-mono text-[10px] text-ink-3">
                    ({methodLabel(row.observation.method)})
                  </span>
                )}
              </Td>
              {showMethod && (
                <Td>
                  <span className="font-mono text-[11px] text-ink-2">
                    {methodLabel(row.observation.method)}
                  </span>
                </Td>
              )}
              {showDetail && (
                <Td>
                  <span className="font-mono text-[11px] text-ink-2">
                    {row.detail ?? row.observation.reason ?? "—"}
                  </span>
                </Td>
              )}
            </tr>
          );
        })}
        {rows.length === 0 && (
          <tr>
            <td
              colSpan={visibleCols}
              className="border-b border-line-2 px-3 py-2 align-middle"
            >
              <span className="italic text-ink-3">
                No rows match the current filter.
              </span>
            </td>
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

/** Field column gets more breathing room as Method/Detail drop out. */
function fieldWidth(visibleCols: number): string {
  const map: Record<number, string> = { 2: "50%", 3: "40%", 4: "30%" };
  return map[visibleCols] ?? "30%";
}

/** Result column — always carries the pill, sized for it plus the
 *  inline method tag at narrow widths. */
function resultWidth(visibleCols: number): string {
  const map: Record<number, string> = { 2: "50%", 3: "30%", 4: "22%" };
  return map[visibleCols] ?? "22%";
}
