/**
 * TanStack Table column definitions for the domains view.
 *
 * Layout rule: every column sets an explicit pixel width — the
 * table uses `table-layout: fixed` so column sums are load-bearing.
 * Long cell values truncate with ellipsis and surface the full
 * string via `title={value}` so fixed 36 px row heights stay
 * intact (the virtualizer's position math assumes every row is 36 px).
 *
 * Column set is scan-list dependent — federal lists carry GSA
 * branch/OU context; top-20k lists carry rank.
 */

/* eslint-disable react-refresh/only-export-components --
   this file exports both the columns config and a tiny Truncate
   helper; Fast Refresh can't round-trip that cleanly but the table
   is always rehydrated from the parent anyway. */

import { createColumnHelper } from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";
import { TriState } from "../TriState";
import type { DomainRow } from "../../data/domainRow";
import type { ScanList } from "../../data/scanList";
import { resolveOrganization } from "../../data/metadata";
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

const targetColumn = col.accessor("target", {
  header: "Target",
  size: 240,
  cell: (c) => {
    const row = c.row.original;
    const display = stripPort(row.target);
    const reachable = isRespondingHost(row);
    return (
      <Link
        to="/lists/$list/scans/$date/domains/$target"
        params={{
          list: row.scan_list,
          date: row.scan_date,
          target: row.target,
        }}
        className={[
          "block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-sm hover:underline",
          reachable
            ? "text-blue-700 dark:text-blue-300"
            : "text-slate-500 dark:text-slate-400",
        ].join(" ")}
        title={row.target}
      >
        {display}
      </Link>
    );
  },
});

const orgColumn = col.accessor("organization", {
  header: "Organization",
  size: 200,
  cell: (c) => {
    const v = resolveOrganization(c.row.original);
    return (
      <Truncate className="text-sm" title={v}>
        {v}
      </Truncate>
    );
  },
  sortingFn: (a, b) =>
    resolveOrganization(a.original).localeCompare(
      resolveOrganization(b.original),
    ),
});

const branchColumn = col.accessor("branch", {
  header: "Branch",
  size: 110,
  cell: (c) => {
    const v = c.getValue();
    return v ? (
      <Truncate className="text-xs" title={v}>
        {v}
      </Truncate>
    ) : (
      <span className="text-xs text-slate-500">—</span>
    );
  },
});

const ouColumn = col.accessor("organizational_unit", {
  header: "Organizational unit",
  size: 200,
  cell: (c) => {
    const v = c.getValue();
    return v ? (
      <Truncate className="text-xs" title={v}>
        {v}
      </Truncate>
    ) : (
      <span className="text-xs text-slate-500">—</span>
    );
  },
});

const rankColumn = col.accessor("top20k_rank", {
  header: "Rank",
  size: 80,
  cell: (c) => {
    const v = c.getValue();
    return v != null ? (
      <span className="text-xs font-medium tabular-nums">
        {v.toLocaleString()}
      </span>
    ) : (
      <span className="text-xs text-slate-500">—</span>
    );
  },
  sortingFn: (a, b) => {
    const ra = a.original.top20k_rank ?? Number.POSITIVE_INFINITY;
    const rb = b.original.top20k_rank ?? Number.POSITIVE_INFINITY;
    return ra - rb;
  },
});

const tlsColumn = col.accessor("tls_version", {
  header: "TLS",
  size: 96,
  cell: (c) => {
    const row = c.row.original;
    if (!isRespondingHost(row)) {
      return <span className="text-slate-500">—</span>;
    }
    const v = c.getValue();
    return v ? (
      <Truncate className="font-mono text-xs" title={v}>
        {v}
      </Truncate>
    ) : (
      <span className="text-slate-500">—</span>
    );
  },
});

const kxColumn = col.accessor("kx_group", {
  header: "Key exchange",
  size: 200,
  cell: (c) => {
    const row = c.row.original;
    if (!isRespondingHost(row)) {
      return <span className="text-slate-500">—</span>;
    }
    const v = c.getValue();
    return v ? (
      <Truncate className="font-mono text-xs" title={v}>
        {v}
      </Truncate>
    ) : (
      <span className="text-slate-500">—</span>
    );
  },
});

// "PQC support" — any post-quantum kx (hybrid or pure) probed +true.
// Replaces the v0 PQC-hybrid-only column; users running grep for
// "did this host speak PQC at all?" don't have to mentally union
// pure-PQC sites into the hybrid bucket.
const pqcColumn = col.accessor("pqc_support", {
  header: "PQC support",
  size: 152,
  cell: (c) => {
    const row = c.row.original;
    if (!isRespondingHost(row)) {
      return <span className="text-slate-500">—</span>;
    }
    return <TriState observation={c.getValue()} />;
  },
  sortingFn: (a, b) => {
    const order = { affirmative: 0, explicit_negative: 1, unknown: 2 };
    const rank = (row: typeof a) => {
      const cls = classify(row.original.pqc_support);
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
});

const issuerColumn = col.accessor("cert_issuer_cn", {
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
});

const expiryColumn = col.accessor("cert_expiry", {
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
});

const errorsColumn = col.accessor("error_count", {
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
});

const unreachableColumn = col.accessor("top_error_category", {
  header: "Unreachable",
  size: 220,
  cell: (c) => {
    const row = c.row.original;
    const v = row.unreachable_summary ?? c.getValue();
    if (isRespondingHost(row)) {
      return <span className="text-xs text-slate-500">—</span>;
    }
    return v ? (
      <Truncate
        className="font-mono text-xs text-slate-600 dark:text-slate-400"
        title={v}
      >
        {v}
      </Truncate>
    ) : (
      <span className="text-xs text-slate-500">unreachable</span>
    );
  },
});

/**
 * Build the column set for a scan list. Federal lists show
 * branch + OU context (the GSA-derived agency hierarchy); top-20k
 * shows rank instead. All other columns are shared.
 */
export function buildDomainColumns(scan_list: ScanList) {
  const tail = [
    tlsColumn,
    kxColumn,
    pqcColumn,
    issuerColumn,
    expiryColumn,
    errorsColumn,
    unreachableColumn,
  ];
  if (scan_list === "top20k-sfw") {
    return [targetColumn, rankColumn, orgColumn, ...tail];
  }
  return [targetColumn, orgColumn, branchColumn, ouColumn, ...tail];
}

/**
 * Default column set — federal layout. Kept as an exported helper
 * so legacy call sites that don't pass scan_list still type-check.
 */
export const domainColumns = buildDomainColumns("federal-website-index");
