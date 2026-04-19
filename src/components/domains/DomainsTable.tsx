/**
 * TanStack Table + TanStack Virtual wiring for the filterable
 * domain view. Pure presentational — receives the filtered/sorted
 * row set from the caller. Virtualization lets the page stay fast
 * past ~50k rows.
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

  return (
    <div
      ref={parentRef}
      className="relative h-[70vh] overflow-auto rounded border border-slate-200 dark:border-slate-800"
    >
      <table
        role="table"
        className="w-full border-separate border-spacing-0 text-sm"
        style={{ minWidth: "100%" }}
      >
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
                    className="border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:text-slate-300"
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
            return (
              <tr
                key={row.id}
                data-testid="domains-row"
                className="absolute left-0 right-0 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  height: `${ROW_HEIGHT}px`,
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="border-b border-slate-100 px-3 py-1 align-middle dark:border-slate-800"
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
