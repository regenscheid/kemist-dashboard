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
import { domainColumns } from "./columns";
import { isRespondingHost } from "./filters";

type Props = {
  rows: DomainRow[];
  sorting: SortingState;
  onSortingChange: (next: SortingState) => void;
};

const ROW_HEIGHT = 36;

export function DomainsTable({ rows, sorting, onSortingChange }: Props) {
  const columns = useMemo(() => domainColumns, []);

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

  // Build the colgroup once — browsers use the first colgroup's
  // widths to decide the fixed layout before painting rows.
  const colWidths = useMemo(
    () => columns.map((c) => c.size ?? 120),
    [columns],
  );
  const totalWidth = colWidths.reduce((sum, w) => sum + w, 0);

  return (
    <div
      ref={parentRef}
      className="relative h-[70vh] overflow-auto rounded border border-slate-200 dark:border-slate-800"
    >
      <table
        role="table"
        className="border-separate border-spacing-0 text-sm"
        style={{
          tableLayout: "fixed",
          width: `${totalWidth}px`,
          minWidth: "100%",
        }}
      >
        <colgroup>
          {colWidths.map((w, i) => (
            <col key={i} style={{ width: `${w}px` }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    scope="col"
                    className="overflow-hidden whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:text-slate-300"
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {sorted === "asc" && "▲"}
                        {sorted === "desc" && "▼"}
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
            // Leave room for the virtualized rows to be absolutely
            // positioned inside the scroll container.
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
                  "absolute left-0",
                  reachable
                    ? "hover:bg-slate-50 dark:hover:bg-slate-900/50"
                    : "bg-slate-50 text-slate-500 dark:bg-slate-950/40 dark:text-slate-400",
                ].join(" ")}
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  height: `${ROW_HEIGHT}px`,
                  width: `${totalWidth}px`,
                  display: "table",
                  tableLayout: "fixed",
                }}
              >
                {row.getVisibleCells().map((cell, cellIdx) => (
                  <td
                    key={cell.id}
                    className="overflow-hidden border-b border-slate-100 px-3 py-1 align-middle dark:border-slate-800"
                    style={{ width: `${colWidths[cellIdx]}px` }}
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
                colSpan={domainColumns.length}
                className="px-3 py-8 text-center text-sm text-slate-500"
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
