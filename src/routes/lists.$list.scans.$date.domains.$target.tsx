/**
 * Per-domain detail view scoped to a (scan_list, scan_date, target).
 *
 * Data flow on mount:
 *   1. loadRecord(date, list, target) — Dexie hit OR fetch index →
 *      fetch batch → decompress → cache every record from the batch.
 *   2. loadScanManifest(date, list)   — provenance strip data.
 *
 * Rendering is synchronous over the resolved record; every
 * observation row routes through `<TriStateText>` so the five-method
 * contract stays enforced.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadRecord, loadScanManifest } from "../db/loader";
import { isScanList, type ScanList } from "../data/scanList";
import type { KemistScanResultSchemaV2 } from "../data/schema";
import type { Provenance } from "../components/ProvenanceStrip";
import { ProvenanceStrip } from "../components/ProvenanceStrip";
import {
  AlpnProbeSection,
  BehavioralProbesSection,
  CertificatesSection,
  ChannelBindingSection,
  CipherSuitesSection,
  DowngradeSignalingSection,
  ErrorsSection,
  ExtensionsSection,
  KxGroupsSection,
  NegotiatedSection,
  ProtocolSupportSection,
  ScanMetadataSection,
  SessionResumptionSection,
  SignatureAlgorithmPolicyProbeSection,
  ValidationSection,
} from "../components/detail/sections";

export const Route = createFileRoute(
  "/lists/$list/scans/$date/domains/$target",
)({
  component: DetailRoute,
});

function DetailRoute() {
  const params = Route.useParams();
  const { date, target: rawTarget } = params;
  const target = useMemo(() => decodeURIComponent(rawTarget), [rawTarget]);
  const scanList = isScanList(params.list)
    ? (params.list as ScanList)
    : null;

  const [record, setRecord] = useState<KemistScanResultSchemaV2 | null>(null);
  const [provenance, setProvenance] = useState<Provenance | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const [hideNotProbed, setHideNotProbed] = useState(true);
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
        const [loadedRecord, scan] = await Promise.all([
          loadRecord(date, scanList, target),
          loadScanManifest(date, scanList).catch(() => null),
        ]);
        if (cancelled) return;
        setRecord(loadedRecord);
        setProvenance({
          scan_date: date,
          scan_list: scanList,
          total_records: scan?.record_count ?? null,
          scanner_name: loadedRecord.scanner.name,
          scanner_version: loadedRecord.scanner.version,
          schema_version: loadedRecord.schema_version,
          warnings: [],
        });
      } catch (e) {
        if (cancelled) return;
        setError(e as Error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date, scanList, target]);

  const rawJsonHref = useMemo(() => {
    if (!record) return null;
    const blob = new Blob([JSON.stringify(record, null, 2)], {
      type: "application/json",
    });
    return URL.createObjectURL(blob);
  }, [record]);
  useEffect(() => {
    return () => {
      if (rawJsonHref) URL.revokeObjectURL(rawJsonHref);
    };
  }, [rawJsonHref]);

  if (error) {
    return (
      <section aria-labelledby="detail-heading" className="space-y-4">
        <h1
          id="detail-heading"
          className="text-2xl font-semibold tracking-tight"
        >
          {target}
        </h1>
        <p className="rounded border border-red-500/40 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-200">
          Couldn't load record: {error.message}
        </p>
      </section>
    );
  }

  if (!record) {
    return (
      <section aria-labelledby="detail-heading" className="space-y-4">
        <h1
          id="detail-heading"
          className="text-2xl font-semibold tracking-tight"
        >
          {target}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Loading record…
        </p>
      </section>
    );
  }

  // Build the per-target metadata block from the cached domain row
  // (sidecar data joined at deploy time) — looked up from Dexie via
  // the loader cache. The detail loader fetches the full record, but
  // organization/branch/OU/tags live on DomainRow only. Pull from
  // record.scan.host through useTargetMetadata… but we don't have
  // that hook today; for now, surface the basic identifiers and let
  // a future enhancement enrich the strip from cached domain row.

  return (
    <>
      {provenance && <ProvenanceStrip provenance={provenance} />}
      <section aria-labelledby="detail-heading" className="mt-6 space-y-6">
        <header className="flex items-baseline justify-between gap-4">
          <div>
            <h1
              id="detail-heading"
              className="text-2xl font-semibold tracking-tight"
            >
              {target}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Scan date: {date}
            </p>
          </div>
          {rawJsonHref && (
            <a
              href={rawJsonHref}
              download={`${record.scan.host}-${date}.json`}
              className="text-sm text-slate-600 underline-offset-2 hover:underline dark:text-slate-400"
            >
              Download raw JSON
            </a>
          )}
        </header>

        <fieldset className="rounded border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/40">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Filters
          </legend>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={hideNotProbed}
                onChange={(e) => setHideNotProbed(e.target.checked)}
              />
              Hide “Not probed” rows
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={hideUnsupportedLegacyCiphers}
                onChange={(e) =>
                  setHideUnsupportedLegacyCiphers(e.target.checked)
                }
              />
              Hide unsupported legacy cipher suites
            </label>
          </div>
        </fieldset>

        <ScanMetadataSection record={record} />
        <ProtocolSupportSection
          versions={record.tls.versions_offered}
          hideNotProbed={hideNotProbed}
        />
        <NegotiatedSection negotiated={record.tls.negotiated} />
        <CipherSuitesSection
          ciphers={record.tls.cipher_suites}
          hideNotProbed={hideNotProbed}
          hideUnsupportedLegacy={hideUnsupportedLegacyCiphers}
        />
        <KxGroupsSection groups={record.tls.groups} hideNotProbed={hideNotProbed} />
        <ExtensionsSection
          extensions={record.tls.extensions}
          hideNotProbed={hideNotProbed}
        />
        <BehavioralProbesSection
          probes={record.tls.behavioral_probes}
          hideNotProbed={hideNotProbed}
        />
        <DowngradeSignalingSection
          downgrade={record.tls.downgrade_signaling}
          hideNotProbed={hideNotProbed}
        />
        <SessionResumptionSection
          resumption={record.tls.session_resumption}
          hideNotProbed={hideNotProbed}
        />
        <SignatureAlgorithmPolicyProbeSection
          probe={record.tls.signature_algorithm_policy_probe}
          hideNotProbed={hideNotProbed}
        />
        <ChannelBindingSection
          channel={record.tls.channel_binding}
          hideNotProbed={hideNotProbed}
        />
        <AlpnProbeSection
          probes={record.tls.alpn_probe}
          hideNotProbed={hideNotProbed}
        />
        <CertificatesSection certificates={record.certificates} />
        <ValidationSection
          validation={record.validation}
          hideNotProbed={hideNotProbed}
        />
        <ErrorsSection errors={record.errors} />
      </section>
    </>
  );
}
