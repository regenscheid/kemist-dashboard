/**
 * TanStack Table + TanStack Virtual wiring for the filterable
 * domain view. Pure presentational — receives the filtered/sorted
 * row set from the caller.
 *
 * Layout notes:
 *   * Uses `table-layout: fixed` + explicit column widths from
 *     `columnDef.size` so long cipher / issuer strings don't cause
 *     the browser to auto-resize columns and push rows past their
 *     fixed 36 px height. That would break the virtualizer's
 *     position math (it assumes every row is 36 px).
 *   * Each cell truncates with ellipsis + title attribute, so the
 *     full value is still discoverable on hover.
 *   * Total column width sums to ~1600 px; the scroll container
 *     scrolls horizontally when the viewport is narrower.
 */

import { useMemo, useRef } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { DomainRow } from "../../data/domainRow";
import type { ScanList } from "../../data/scanList";
import { DEFAULT_SCAN_LIST } from "../../data/scanList";
import { isAtLeast, useBreakpoint } from "../../lib/useBreakpoint";
import { buildDomainColumns } from "./columns";
import { isRespondingHost } from "./filters";

type Props = {
  rows: DomainRow[];
  sorting: SortingState;
  onSortingChange: (next: SortingState) => void;
  /**
   * Active scan list — drives column choice (federal shows
   * Branch + OU; top-20k shows Rank). Defaults to the canonical
   * federal list for legacy callers.
   */
  scanList?: ScanList;
};

const ROW_HEIGHT = 36;

export function DomainsTable({
  rows,
  sorting,
  onSortingChange,
  scanList = DEFAULT_SCAN_LIST,
}: Props) {
  const breakpoint = useBreakpoint();
  // Filter out columns whose `hideBelow` meta exceeds the current
  // breakpoint, so narrow viewports drop low-priority columns
  // automatically rather than forcing a horizontal scroll.
  const columns = useMemo(
    () =>
      buildDomainColumns(scanList).filter((c) => {
        const hideBelow = c.meta?.hideBelow;
        return !hideBelow || isAtLeast(breakpoint, hideBelow);
      }),
    [scanList, breakpoint],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      onSortingChange(
        typeof updater === "function" ? updater(sorting) : updater,
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const { rows: tableRows } = table.getRowModel();

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const colWidths = useMemo(
    () => columns.map((c) => c.size ?? 120),
    [columns],
  );
  const totalWidth = colWidths.reduce((sum, w) => sum + w, 0);
  // Convert each column's pixel size into a percentage of the row.
  // Using percentages on both <col> and the virtualized <tr> cells
  // means thead (sized by colgroup) and body rows (sized by their
  // own display:table) split available width identically — without
  // this, when the container is wider than `totalWidth` the table
  // stretches via `minWidth: 100%` and headers drift relative to
  // the virtualized cells, which keep their pixel widths.
  const colPercents = useMemo(
    () => colWidths.map((w) => (w / totalWidth) * 100),
    [colWidths, totalWidth],
  );

  return (
    <div
      ref={parentRef}
      className="relative h-[70vh] overflow-auto rounded-md border border-line bg-surface"
    >
      <table
        role="table"
        className="w-full border-separate border-spacing-0 text-[12px]"
        style={{
          tableLayout: "fixed",
          minWidth: `${totalWidth}px`,
        }}
      >
        <colgroup>
          {colPercents.map((p, i) => (
            <col key={i} style={{ width: `${p}%` }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-surface-2">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    scope="col"
                    className="overflow-hidden whitespace-nowrap border-b border-line px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-ink-3"
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="flex items-center gap-1 hover:text-ink"
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {sorted === "asc" && (
                          <span aria-hidden="true">▲</span>
                        )}
                        {sorted === "desc" && (
                          <span aria-hidden="true">▼</span>
                        )}
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = tableRows[virtualRow.index];
            if (!row) return null;
            const reachable = isRespondingHost(row.original);
            return (
              <tr
                key={row.id}
                data-testid="domains-row"
                className={[
                  "absolute left-0 right-0",
                  reachable
                    ? "hover:bg-surface-2"
                    : "bg-surface-2 text-ink-3",
                ].join(" ")}
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  height: `${ROW_HEIGHT}px`,
                  width: "100%",
                  minWidth: `${totalWidth}px`,
                  display: "table",
                  tableLayout: "fixed",
                }}
              >
                {row.getVisibleCells().map((cell, cellIdx) => (
                  <td
                    key={cell.id}
                    className="overflow-hidden border-b border-line-2 px-3 py-1 align-middle"
                    style={{ width: `${colPercents[cellIdx]}%` }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
          {tableRows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center text-[13px] text-ink-3"
              >
                No domains match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
