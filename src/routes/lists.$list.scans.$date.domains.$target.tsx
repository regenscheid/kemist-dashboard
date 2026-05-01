/**
 * Per-domain detail view scoped to a (scan_list, scan_date, target).
 *
 * Layout (matches the design handoff section order):
 *   1. Header card — domain, organization, IP, port, scan date, duration
 *   2. Versions strip — chiclets per probed TLS version
 *   3. Page-level "Hide unknown / not probed" toggle (default ON)
 *   4. In-page nav — anchor links to the section ids below
 *   5. Negotiation
 *   6. KX combined table (TLS 1.3 + TLS 1.2 in one aligned table)
 *   7. Cipher suites
 *   8. Behavioral probes
 *   9. Extensions
 *  10. Downgrade signaling
 *  11. Session resumption
 *  12. HTTP layer
 *  13. Validation (multi-trust-store + name-match row)
 *  14. Cert chain
 */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadRecord } from "../db/loader";
import { db } from "../db/dexie";
import { isScanList, type ScanList } from "../data/scanList";
import type { KemistScanResultSchemaV2 } from "../data/schema";
import type { DomainRow } from "../data/domainRow";
import {
  BehavioralProbesSection,
  CipherSuitesSection,
  DowngradeSignalingSection,
  ExtensionsSection,
  NegotiatedSection,
  SessionResumptionSection,
} from "../components/detail/sections";
import { DetailHeader } from "../components/detail/DetailHeader";
import { VersionsStrip } from "../components/detail/VersionsStrip";
import { DetailSection } from "../components/detail/DetailSection";
import { KxCombinedTable } from "../components/detail/KxCombinedTable";
import { HttpLayerSection } from "../components/detail/HttpLayerSection";
import { ValidationSection } from "../components/detail/ValidationSection";
import { CertChainCards } from "../components/detail/CertChainCards";

export const Route = createFileRoute(
  "/lists/$list/scans/$date/domains/$target",
)({
  component: DetailRoute,
});

const NAV_ITEMS: Array<{ id: string; label: string }> = [
  { id: "negotiation", label: "Negotiation" },
  { id: "kx", label: "KX groups" },
  { id: "cipher-suites", label: "Cipher suites" },
  { id: "behavioral-probes", label: "Behavioral probes" },
  { id: "extensions", label: "Extensions" },
  { id: "downgrade", label: "Downgrade" },
  { id: "session-resumption", label: "Resumption" },
  { id: "http", label: "HTTP layer" },
  { id: "validation", label: "Validation" },
  { id: "chain", label: "Cert chain" },
];

function DetailRoute() {
  const params = Route.useParams();
  const { date, target: rawTarget } = params;
  const target = useMemo(() => decodeURIComponent(rawTarget), [rawTarget]);
  const scanList = isScanList(params.list)
    ? (params.list as ScanList)
    : null;

  const [record, setRecord] = useState<KemistScanResultSchemaV2 | null>(null);
  const [domainRow, setDomainRow] = useState<DomainRow | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Page-level "Hide unknown / not probed entries" — default ON per
  // the design's acceptance checklist. Threaded into every section
  // that consumes a tri-state row set.
  const [hideUnknown, setHideUnknown] = useState(true);
  const [hideUnsupportedLegacyCiphers, setHideUnsupportedLegacyCiphers] =
    useState(true);

  useEffect(() => {
    if (!scanList) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecord(null);
    setError(null);
    (async () => {
      try {
        const [loadedRecord, cachedDomain] = await Promise.all([
          loadRecord(date, scanList, target),
          db.domains.get([target, date, scanList]).catch(() => undefined),
        ]);
        if (cancelled) return;
        setRecord(loadedRecord);
        setDomainRow(cachedDomain ?? null);
      } catch (e) {
        if (cancelled) return;
        setError(e as Error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date, scanList, target]);

  if (error) {
    return (
      <section aria-labelledby="detail-heading" className="space-y-4">
        <h1
          id="detail-heading"
          className="text-[24px] font-semibold tracking-[-0.005em]"
        >
          {target}
        </h1>
        <p className="rounded-md border border-neg/30 bg-neg-bg px-3 py-2 text-sm text-neg-fg">
          Couldn't load record: {error.message}
        </p>
      </section>
    );
  }

  if (!record || !scanList) {
    return (
      <section aria-labelledby="detail-heading" className="space-y-4">
        <h1
          id="detail-heading"
          className="text-[24px] font-semibold tracking-[-0.005em]"
        >
          {target}
        </h1>
        <p className="text-sm italic text-ink-3">Loading record…</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="detail-heading" className="space-y-5">
      <DetailHeader
        record={record}
        scanList={scanList}
        organization={domainRow?.organization}
        branch={domainRow?.branch}
        organizationalUnit={domainRow?.organizational_unit}
      />

      <DetailSection
        id="versions"
        title="TLS versions probed"
        description="Per-version probe outcomes. Hidden entries collapse with the page-level toggle below."
      >
        <VersionsStrip
          versions={record.tls.versions_offered}
          hideUnknown={hideUnknown}
        />
      </DetailSection>

      <PageLevelToggle
        hideUnknown={hideUnknown}
        onChangeHideUnknown={setHideUnknown}
        hideUnsupportedLegacyCiphers={hideUnsupportedLegacyCiphers}
        onChangeHideUnsupportedLegacyCiphers={setHideUnsupportedLegacyCiphers}
      />

      <InPageNav />

      <NegotiatedSection negotiated={record.tls.negotiated} />

      <KxCombinedTable
        groups={record.tls.groups}
        hideUnknown={hideUnknown}
      />

      <CipherSuitesSection
        ciphers={record.tls.cipher_suites}
        hideNotProbed={hideUnknown}
        hideUnsupportedLegacy={hideUnsupportedLegacyCiphers}
      />

      <BehavioralProbesSection
        probes={record.tls.behavioral_probes}
        hideNotProbed={hideUnknown}
      />

      <ExtensionsSection
        extensions={record.tls.extensions}
        hideNotProbed={hideUnknown}
      />

      <DowngradeSignalingSection
        downgrade={record.tls.downgrade_signaling}
        hideNotProbed={hideUnknown}
      />

      <SessionResumptionSection
        resumption={record.tls.session_resumption}
        hideNotProbed={hideUnknown}
      />

      <HttpLayerSection http={record.http} />

      <ValidationSection
        validation={record.validation}
        hideUnknown={hideUnknown}
      />

      <CertChainCards certificates={record.certificates} />
    </section>
  );
}

function PageLevelToggle({
  hideUnknown,
  onChangeHideUnknown,
  hideUnsupportedLegacyCiphers,
  onChangeHideUnsupportedLegacyCiphers,
}: {
  hideUnknown: boolean;
  onChangeHideUnknown: (next: boolean) => void;
  hideUnsupportedLegacyCiphers: boolean;
  onChangeHideUnsupportedLegacyCiphers: (next: boolean) => void;
}) {
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-accent"
            checked={hideUnknown}
            onChange={(e) => onChangeHideUnknown(e.target.checked)}
          />
          <span>Hide "unknown" / "not probed" entries</span>
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-accent"
            checked={hideUnsupportedLegacyCiphers}
            onChange={(e) =>
              onChangeHideUnsupportedLegacyCiphers(e.target.checked)
            }
          />
          <span>Hide unsupported legacy cipher suites</span>
        </label>
      </div>
    </div>
  );
}

function InPageNav() {
  return (
    <nav
      aria-label="In-page sections"
      className="rounded-md border border-line bg-surface px-4 py-3"
    >
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-[12px]">
        {NAV_ITEMS.map((item, idx) => (
          <li key={item.id} className="flex items-center gap-4">
            {idx > 0 && (
              <span aria-hidden="true" className="text-ink-3">
                ·
              </span>
            )}
            <a
              href={`#${item.id}`}
              className="text-accent hover:underline"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
