/**
 * Single combined table for TLS 1.3 + TLS 1.2 KX-group probes.
 * Columns are aligned across both versions via `<colgroup>` +
 * `table-layout: fixed`. Per-version sub-headers are rendered as
 * full-width separator rows.
 *
 * The "Family" column derives from the group name via
 * `classifyKxGroupName` so PQC HYBRID / PURE PQC / ECC / FFDHE
 * labels stay coherent with the KX-support filter pills elsewhere.
 */

import { Link } from "@tanstack/react-router";
import type {
  GroupObservation,
  KemistScanResultSchemaV2,
} from "../../data/schema";
import {
  classifyKxGroupName,
  KX_SUPPORT_LABELS,
  type KxSupportType,
} from "../../data/kxSupport";
import { TriState } from "../TriState";
import {
  isAffirmative,
  isExplicitNegative,
  methodLabel,
  triPillClass,
} from "../../lib/triState";
import { isAtLeast, useBreakpoint } from "../../lib/useBreakpoint";
import { DetailSection } from "./DetailSection";

type Props = {
  groups: KemistScanResultSchemaV2["tls"]["groups"];
  hideUnknown?: boolean;
};

const FAMILY_TONE: Record<KxSupportType, string> = {
  pure_pqc: "bg-aff text-surface",
  pqc_hybrid: "bg-aff text-surface",
  ecc: "bg-line text-ink-2",
  rsa: "bg-line text-ink-2",
  ffdh: "bg-line text-ink-2",
};

export function KxCombinedTable({ groups, hideUnknown = false }: Props) {
  const bp = useBreakpoint();
  const showFamily = isAtLeast(bp, "sm");
  const showProvider = isAtLeast(bp, "md");
  const showReason = isAtLeast(bp, "lg");
  const visibleColCount =
    2 + (showFamily ? 1 : 0) + (showProvider ? 1 : 0) + (showReason ? 1 : 0);

  const tls13Rows = sortEntries(groups.tls1_3);
  const tls12Rows = sortEntries(groups.tls1_2);

  const filtered = (rows: typeof tls13Rows) =>
    hideUnknown
      ? rows.filter(
          ([, o]) => isAffirmative(o) || isExplicitNegative(o),
        )
      : rows;

  const tls13Visible = filtered(tls13Rows);
  const tls12Visible = filtered(tls12Rows);

  const tls13Probed = tls13Rows.length;
  const tls12Probed = tls12Rows.length;

  return (
    <DetailSection
      id="kx"
      title="Key-exchange groups"
      description="Per-group probe results from supported_groups. Every entry has its own tri-state observation."
      json={groups}
    >
      <table
        className="w-full border-separate border-spacing-0 text-[12px]"
        style={{ tableLayout: "fixed" }}
      >
        <colgroup>
          {/* Re-allocate column widths so the visible columns split
              the row evenly when narrow columns are hidden. */}
          <col style={{ width: groupColWidth(visibleColCount) }} />
          {showFamily && <col style={{ width: "16%" }} />}
          {showProvider && <col style={{ width: "16%" }} />}
          <col style={{ width: observationColWidth(visibleColCount) }} />
          {showReason && <col style={{ width: "22%" }} />}
        </colgroup>
        <thead>
          <tr>
            <Th>Group</Th>
            {showFamily && <Th>Family</Th>}
            {showProvider && <Th>Provider</Th>}
            <Th>Observation</Th>
            {showReason && <Th>Reason</Th>}
          </tr>
        </thead>
        <tbody>
          <SubHeaderRow
            label="TLS 1.3"
            probed={tls13Probed}
            visible={tls13Visible.length}
            colSpan={visibleColCount}
          />
          {tls13Visible.map(([name, obs]) => (
            <GroupRow
              key={`tls13-${name}`}
              name={name}
              obs={obs}
              showFamily={showFamily}
              showProvider={showProvider}
              showReason={showReason}
            />
          ))}
          {tls13Visible.length === 0 && tls13Probed > 0 && (
            <EmptyRow
              message="All TLS 1.3 entries hidden by 'Hide unknown'."
              colSpan={visibleColCount}
            />
          )}

          <SubHeaderRow
            label="TLS 1.2"
            probed={tls12Probed}
            visible={tls12Visible.length}
            colSpan={visibleColCount}
          />
          {tls12Visible.map(([name, obs]) => (
            <GroupRow
              key={`tls12-${name}`}
              name={name}
              obs={obs}
              showFamily={showFamily}
              showProvider={showProvider}
              showReason={showReason}
            />
          ))}
          {tls12Visible.length === 0 && tls12Probed > 0 && (
            <EmptyRow
              message="All TLS 1.2 entries hidden by 'Hide unknown'."
              colSpan={visibleColCount}
            />
          )}
        </tbody>
      </table>
    </DetailSection>
  );
}

function GroupRow({
  name,
  obs,
  showFamily,
  showProvider,
  showReason,
}: {
  name: string;
  obs: GroupObservation;
  showFamily: boolean;
  showProvider: boolean;
  showReason: boolean;
}) {
  const family = classifyKxGroupName(name);
  const cls = triPillClass(obs);
  const tint =
    cls === "aff" ? "bg-aff-bg/40" : cls === "neg" ? "bg-neg-bg/30" : "";

  return (
    <tr className={tint}>
      <Td>
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[12px]">{name}</span>
          {/* When Family is hidden as a column, surface the family
              tag inline beneath the group name so the reader still
              sees the hybrid/PQC distinction. */}
          {!showFamily && family && (
            <span
              className={`inline-block w-fit rounded-sm px-1 font-mono text-[9px] font-semibold uppercase tracking-[0.05em] ${FAMILY_TONE[family]}`}
            >
              {KX_SUPPORT_LABELS[family]}
            </span>
          )}
        </div>
      </Td>
      {showFamily && (
        <Td>
          {family ? (
            <span
              className={`inline-block rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] ${FAMILY_TONE[family]}`}
            >
              {KX_SUPPORT_LABELS[family]}
            </span>
          ) : (
            <span className="text-ink-3">—</span>
          )}
        </Td>
      )}
      {showProvider && (
        <Td>
          <span className="font-mono text-[11px] text-ink-2">
            {obs.provider ?? "—"}
          </span>
        </Td>
      )}
      <Td>
        <div className="flex flex-wrap items-center gap-1">
          <TriState observation={obs} compact />
          <span className="font-mono text-[10px] text-ink-3">
            ({methodLabel(obs.method)})
          </span>
        </div>
      </Td>
      {showReason && (
        <Td>
          <span className="font-mono text-[11px] text-ink-2">
            {obs.reason ?? "—"}
          </span>
        </Td>
      )}
    </tr>
  );
}

function SubHeaderRow({
  label,
  probed,
  visible,
  colSpan,
}: {
  label: string;
  probed: number;
  visible: number;
  colSpan: number;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="border-b border-line bg-surface-2 px-3 py-2"
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.05em] text-ink">
            {label} · {visible} of {probed}
          </span>
          {probed === 0 && (
            <span className="font-mono text-[10px] text-ink-3">
              not probed
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

function EmptyRow({
  message,
  colSpan,
}: {
  message: string;
  colSpan: number;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="border-b border-line-2 px-3 py-2 text-[12px] italic text-ink-3"
      >
        {message}
      </td>
    </tr>
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

/**
 * Reflow column widths so visible columns share row space evenly when
 * narrow ones drop. Group + Observation are always visible; the
 * remaining percentage is split between them as more columns hide.
 */
function groupColWidth(visibleColCount: number): string {
  // 5 cols visible: 26%; 4: 32%; 3: 40%; 2: 50%
  const map: Record<number, string> = {
    2: "50%",
    3: "40%",
    4: "32%",
    5: "26%",
  };
  return map[visibleColCount] ?? "26%";
}

function observationColWidth(visibleColCount: number): string {
  const map: Record<number, string> = {
    2: "50%",
    3: "44%",
    4: "36%",
    5: "20%",
  };
  return map[visibleColCount] ?? "20%";
}

function sortEntries(
  map: Record<string, GroupObservation>,
): Array<[string, GroupObservation]> {
  // Affirmatives first → negatives → unknowns; within a class, by name.
  const order: Record<"aff" | "neg" | "unk", number> = { aff: 0, neg: 1, unk: 2 };
  const entries = Object.entries(map);
  entries.sort(([an, ao], [bn, bo]) => {
    const ar = order[triPillClass(ao)];
    const br = order[triPillClass(bo)];
    if (ar !== br) return ar - br;
    return an.localeCompare(bn);
  });
  return entries;
}

// Re-export so the route can render a "no PQC support → /lists/$list/domains?pqc=neg"
// link without rebinding to the design plan, if needed in future.
export { Link };
