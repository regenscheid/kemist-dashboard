/**
 * Per-domain detail view. Route is keyed by scan date + URL-encoded
 * target (which contains `host:port`, so colons must be percent-
 * encoded in links).
 *
 * Data flow on mount:
 *   1. loadRecord(date, target) — Dexie hit OR fetch index → fetch
 *      batch → decompress → cache every record from the batch.
 *   2. loadScanManifest(date)   — cached provenance strip data.
 *
 * Rendering is synchronous over the resolved record; every
 * observation row routes through `<TriStateText>` so the five-method
 * contract stays enforced.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadRecord, loadScanManifest } from "../db/loader";
import type { KemistScanResultSchemaV1 } from "../data/schema";
import type { Provenance } from "../components/ProvenanceStrip";
import { ProvenanceStrip } from "../components/ProvenanceStrip";
import {
  AlpnProbeSection,
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

export const Route = createFileRoute("/scans/$date/domains/$target")({
  component: DetailRoute,
});

function DetailRoute() {
  const { date, target: rawTarget } = Route.useParams();
  const target = useMemo(() => decodeURIComponent(rawTarget), [rawTarget]);

  const [record, setRecord] = useState<KemistScanResultSchemaV1 | null>(null);
  const [provenance, setProvenance] = useState<Provenance | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Reset local state immediately so the previous target's record
    // doesn't linger while the new fetch runs. Safe in this context
    // because the effect only re-fires on (date, target) change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecord(null);
    setError(null);
    (async () => {
      try {
        const [loadedRecord, scan] = await Promise.all([
          loadRecord(date, target),
          loadScanManifest(date).catch(() => null),
        ]);
        if (cancelled) return;
        setRecord(loadedRecord);
        setProvenance({
          scan_date: date,
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
  }, [date, target]);

  // Allocate the JSON download URL up-front so the hook count stays
  // stable across conditional renders below. `record` may be null;
  // the memo returns null in that case and is rebuilt after load.
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

        <ScanMetadataSection record={record} />
        <ProtocolSupportSection versions={record.tls.versions_offered} />
        <NegotiatedSection negotiated={record.tls.negotiated} />
        <CipherSuitesSection ciphers={record.tls.cipher_suites} />
        <KxGroupsSection groups={record.tls.groups} />
        <ExtensionsSection extensions={record.tls.extensions} />
        <DowngradeSignalingSection downgrade={record.tls.downgrade_signaling} />
        <SessionResumptionSection resumption={record.tls.session_resumption} />
        <SignatureAlgorithmPolicyProbeSection
          probe={record.tls.signature_algorithm_policy_probe}
        />
        <ChannelBindingSection channel={record.tls.channel_binding} />
        <AlpnProbeSection probes={record.tls.alpn_probe} />
        <CertificatesSection certificates={record.certificates} />
        <ValidationSection validation={record.validation} />
        <ErrorsSection errors={record.errors} />
      </section>
    </>
  );
}
