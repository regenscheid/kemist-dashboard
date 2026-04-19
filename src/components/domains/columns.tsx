/**
 * TanStack Table column definitions for the domains view.
 *
 * Kept in a separate module so the route file stays focused on
 * layout + URL-state wiring. Cell renderers use the shared
 * TriState components — never render tri-state observations by
 * reading `.value` directly.
 */

import { createColumnHelper } from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";
import { TriState } from "../TriState";
import type { DomainRow } from "../../data/domainRow";
import { classify } from "../../lib/triState";

const col = createColumnHelper<DomainRow>();

export const domainColumns = [
  col.accessor("target", {
    header: "Target",
    cell: (c) => {
      const row = c.row.original;
      return (
        <Link
          to="/scans/$date/domains/$target"
          params={{
            date: row.scan_date,
            target: encodeURIComponent(row.target),
          }}
          className="font-mono text-sm text-blue-700 hover:underline dark:text-blue-300"
        >
          {row.target}
        </Link>
      );
    },
  }),
  col.accessor("scope", {
    header: "Scope",
    cell: (c) => <span className="text-xs">{c.getValue()}</span>,
  }),
  col.accessor("tls_version", {
    header: "TLS",
    cell: (c) => {
      const v = c.getValue();
      return v ? <code className="text-xs">{v}</code> : <span className="text-slate-500">—</span>;
    },
  }),
  col.accessor("cipher", {
    header: "Cipher",
    cell: (c) => {
      const v = c.getValue();
      return v ? <code className="text-xs">{v}</code> : <span className="text-slate-500">—</span>;
    },
  }),
  col.accessor("kx_group", {
    header: "KX",
    cell: (c) => {
      const v = c.getValue();
      return v ? <code className="text-xs">{v}</code> : <span className="text-slate-500">—</span>;
    },
  }),
  col.accessor("pqc_hybrid", {
    header: "PQC hybrid",
    cell: (c) => <TriState observation={c.getValue()} />,
    // Sort affirmative → explicit_negative → unknown so positive
    // signal floats up when the user clicks the header. Uses the
    // canonical classifier rather than a raw `.value` read, so the
    // tri-state ESLint rule stays happy.
    sortingFn: (a, b) => {
      const order = { affirmative: 0, explicit_negative: 1, unknown: 2 };
      const rank = (row: typeof a) => {
        const c = classify(row.original.pqc_hybrid);
        if (c === "affirmative" || c === "connection_state_affirmative") {
          return order.affirmative;
        }
        if (c === "explicit_negative" || c === "connection_state_negative") {
          return order.explicit_negative;
        }
        return order.unknown;
      };
      return rank(a) - rank(b);
    },
  }),
  col.accessor("cert_issuer_cn", {
    header: "Issuer",
    cell: (c) => {
      const v = c.getValue();
      return v ? (
        <span className="text-xs">{v}</span>
      ) : (
        <span className="text-slate-500">—</span>
      );
    },
  }),
  col.accessor("cert_expiry", {
    header: "Cert expires",
    cell: (c) => {
      const v = c.getValue();
      if (!v) return <span className="text-slate-500">—</span>;
      const t = Date.parse(v);
      if (Number.isNaN(t)) return <span className="text-xs">{v}</span>;
      const daysUntil = Math.round((t - Date.now()) / 86_400_000);
      const tone =
        daysUntil < 0
          ? "text-red-700 dark:text-red-300"
          : daysUntil < 30
            ? "text-amber-700 dark:text-amber-300"
            : "text-slate-700 dark:text-slate-300";
      const label =
        daysUntil < 0
          ? `expired ${-daysUntil}d ago`
          : `${daysUntil}d left`;
      return (
        <span className={`text-xs ${tone}`} title={v}>
          {label}
        </span>
      );
    },
    sortingFn: (a, b) => {
      const ta = a.original.cert_expiry ? Date.parse(a.original.cert_expiry) : Infinity;
      const tb = b.original.cert_expiry ? Date.parse(b.original.cert_expiry) : Infinity;
      return ta - tb;
    },
  }),
  col.accessor("error_count", {
    header: "Errors",
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
    header: "Top error",
    cell: (c) => {
      const v = c.getValue();
      return v ? (
        <code className="text-xs">{v}</code>
      ) : (
        <span className="text-xs text-slate-500">—</span>
      );
    },
  }),
];
