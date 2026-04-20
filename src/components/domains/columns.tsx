/**
 * TanStack Table column definitions for the domains view.
 *
 * Layout rule: every column sets an explicit pixel width — the
 * table uses `table-layout: fixed` so column sums are load-bearing.
 * Long cell values truncate with ellipsis and surface the full
 * string via `title={value}` so fixed 36 px row heights stay
 * intact (the virtualizer's position math assumes every row is 36 px).
 */

/* eslint-disable react-refresh/only-export-components --
   this file exports both the columns config and a tiny Truncate
   helper; Fast Refresh can't round-trip that cleanly but the table
   is always rehydrated from the parent anyway. */

import { createColumnHelper } from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";
import { TriState } from "../TriState";
import type { DomainRow } from "../../data/domainRow";
import { classify } from "../../lib/triState";
import { isRespondingHost } from "./filters";

const col = createColumnHelper<DomainRow>();

/** Shared truncation wrapper so every cell honors `table-layout: fixed`. */
function Truncate({
  children,
  title,
  className = "",
}: {
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      className={`block overflow-hidden text-ellipsis whitespace-nowrap ${className}`}
      title={title}
    >
      {children}
    </span>
  );
}

/**
 * Scan records store `host:port`. Port is almost always 443 and
 * adds noise to the column. Strip for display; keep the full
 * `target` in the URL + title so links remain unambiguous.
 */
function stripPort(target: string): string {
  const i = target.lastIndexOf(":");
  return i === -1 ? target : target.slice(0, i);
}

export const domainColumns = [
  col.accessor("target", {
    header: "Target",
    size: 280,
    cell: (c) => {
      const row = c.row.original;
      const display = stripPort(row.target);
      const reachable = isRespondingHost(row);
      return (
        <Link
          to="/scans/$date/domains/$target"
          params={{
            date: row.scan_date,
            target: encodeURIComponent(row.target),
          }}
          className={[
            "block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-sm hover:underline",
            reachable ? "text-blue-700 dark:text-blue-300" : "text-slate-500 dark:text-slate-400",
          ].join(" ")}
          title={row.target}
        >
          {display}
        </Link>
      );
    },
  }),
  col.accessor("tls_version", {
    header: "TLS",
    size: 96,
    cell: (c) => {
      const v = c.getValue();
      return v ? (
        <Truncate className="font-mono text-xs" title={v}>
          {v}
        </Truncate>
      ) : (
        <span className="text-slate-500">—</span>
      );
    },
  }),
  col.accessor("kx_group", {
    header: "Key exchange",
    size: 200,
    cell: (c) => {
      const v = c.getValue();
      return v ? (
        <Truncate className="font-mono text-xs" title={v}>
          {v}
        </Truncate>
      ) : (
        <span className="text-slate-500">—</span>
      );
    },
  }),
  col.accessor("pqc_hybrid", {
    header: "PQC hybrid",
    size: 152,
    cell: (c) => <TriState observation={c.getValue()} />,
    sortingFn: (a, b) => {
      const order = { affirmative: 0, explicit_negative: 1, unknown: 2 };
      const rank = (row: typeof a) => {
        const cls = classify(row.original.pqc_hybrid);
        if (cls === "affirmative" || cls === "connection_state_affirmative") {
          return order.affirmative;
        }
        if (cls === "explicit_negative" || cls === "connection_state_negative") {
          return order.explicit_negative;
        }
        return order.unknown;
      };
      return rank(a) - rank(b);
    },
  }),
  col.accessor("cert_issuer_cn", {
    header: "Issuer",
    size: 220,
    cell: (c) => {
      const v = c.getValue();
      return v ? (
        <Truncate className="text-xs" title={v}>
          {v}
        </Truncate>
      ) : (
        <span className="text-slate-500">—</span>
      );
    },
  }),
  col.accessor("cert_expiry", {
    header: "Cert expires",
    size: 130,
    cell: (c) => {
      const v = c.getValue();
      if (!v) return <span className="text-slate-500">—</span>;
      const t = Date.parse(v);
      if (Number.isNaN(t)) {
        return (
          <Truncate className="text-xs" title={v}>
            {v}
          </Truncate>
        );
      }
      const daysUntil = Math.round((t - Date.now()) / 86_400_000);
      const tone =
        daysUntil < 0
          ? "text-red-700 dark:text-red-300"
          : daysUntil < 30
            ? "text-amber-700 dark:text-amber-300"
            : "text-slate-700 dark:text-slate-300";
      const label =
        daysUntil < 0 ? `expired ${-daysUntil}d ago` : `${daysUntil}d left`;
      return (
        <Truncate className={`text-xs ${tone}`} title={v}>
          {label}
        </Truncate>
      );
    },
    sortingFn: (a, b) => {
      const ta = a.original.cert_expiry
        ? Date.parse(a.original.cert_expiry)
        : Infinity;
      const tb = b.original.cert_expiry
        ? Date.parse(b.original.cert_expiry)
        : Infinity;
      return ta - tb;
    },
  }),
  col.accessor("error_count", {
    header: "Errors",
    size: 72,
    cell: (c) => {
      const n = c.getValue();
      return n === 0 ? (
        <span className="text-xs text-slate-500">0</span>
      ) : (
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
          {n}
        </span>
      );
    },
  }),
  col.accessor("top_error_category", {
    header: "Unreachable",
    size: 220,
    cell: (c) => {
      const row = c.row.original;
      const v = c.getValue();
      if (isRespondingHost(row)) {
        return <span className="text-xs text-slate-500">—</span>;
      }
      return v ? (
        <Truncate className="font-mono text-xs text-slate-600 dark:text-slate-400" title={v}>
          {v}
        </Truncate>
      ) : (
        <span className="text-xs text-slate-500">unreachable</span>
      );
    },
  }),
];
