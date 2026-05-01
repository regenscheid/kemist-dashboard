/**
 * Per-domain header card — eyebrow ("PER-DOMAIN RECORD · SCHEMA …"),
 * the host as the page title, organization context, and right-side
 * KV with resolved IP, port, scan date, duration. Renders above the
 * versions strip / page-level toggle / sections.
 */

import { Link } from "@tanstack/react-router";
import type { KemistScanResultSchemaV2 } from "../../data/schema";
import type { ScanList } from "../../data/scanList";

type Props = {
  record: KemistScanResultSchemaV2;
  scanList: ScanList;
  /** Joined organization context, if known (from cached DomainRow). */
  organization?: string | null | undefined;
  branch?: string | null | undefined;
  organizationalUnit?: string | null | undefined;
};

export function DetailHeader({
  record,
  scanList,
  organization,
  branch,
  organizationalUnit,
}: Props) {
  const { scan, schema_version } = record;
  // YYYY-MM-DD only — strip the wall-clock time per the design.
  const scanDate = scan.started_at.slice(0, 10);

  const orgLine = [organization, branch, organizationalUnit]
    .filter((v): v is string => !!v)
    .join(" · ");

  return (
    <header className="rounded-md border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="space-y-1">
          <Link
            to="/lists/$list/domains"
            params={{ list: scanList }}
            className="font-mono text-[11px] uppercase tracking-[0.05em] text-accent hover:underline"
          >
            ← all domains
          </Link>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
            Per-domain record · Schema v{schema_version}
          </p>
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.01em]">
            {scan.host}
          </h1>
          {orgLine && (
            <p className="text-[13px] text-ink-2">{orgLine}</p>
          )}
        </div>

        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 font-mono text-[11px]">
          <Datum label="Resolved" value={scan.resolved_ip ?? "—"} />
          <Datum label="Port" value={String(scan.port)} />
          <Datum label="Scan date" value={scanDate} />
          <Datum
            label="Duration"
            value={`${scan.duration_ms.toLocaleString()} ms`}
          />
        </dl>
      </div>
    </header>
  );
}

function Datum({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="uppercase tracking-[0.05em] text-ink-3">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </>
  );
}
