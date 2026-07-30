import type {
  CertificateFacts,
  KemistScanRecord,
  Method,
  ObservationBool,
} from "./schema";
import type { Polarity, PolarityLabels } from "../lib/triState";

export type NormalizedCertificateChain = {
  chain_id: string;
  role: "primary" | "alternate";
  observed_via: string[];
  leaf_fingerprint_sha256?: string;
  chain_fingerprint_sha256?: string;
  chain: CertificateFacts[];
};

export type SniProbeRow = {
  variant: "omitted" | "bogus_dns" | "ip_literal";
  sni_sent?: string | null;
  outcome: "same_cert" | "different_cert" | "rejected" | "error" | "not_probed";
  leaf_fingerprint_sha256?: string;
  reason?: string;
};

export type RenegotiationRow = {
  label: string;
  observation: ObservationBool;
  /**
   * Both renegotiation observations are negative-polarity: `value: true`
   * means the server allowed or performed a renegotiation, which is the
   * worse posture. Modern servers reject client-initiated renegotiation
   * by default (OpenSSL disabled it after CVE-2011-1473), so the generic
   * `true → green` mapping would paint the compliant outcome red on
   * effectively every host scanned.
   */
  polarity: Polarity;
  labels: PolarityLabels;
};

type Certificates = KemistScanRecord["certificates"];
type SniBehavior = KemistScanRecord["tls"]["sni_behavior"];
type RenegotiationBehavior = KemistScanRecord["tls"]["renegotiation_behavior"];
type LegacyRenegotiationBehavior = RenegotiationBehavior & {
  server_initiated_observed?: ObservationBool;
  server_initiated_probe_reason?: string;
};
type ClientAuthRequest = NonNullable<KemistScanRecord["tls"]["client_auth_request"]>;
type BehavioralProbes = KemistScanRecord["tls"]["behavioral_probes"];
type ClientAuthDistinguishedName = NonNullable<
  ClientAuthRequest["ca_distinguished_names"]
>[number];
type ClientAuthOidFilter = NonNullable<ClientAuthRequest["oid_filters"]>[number];

export type CompressionBehavior = {
  selected: string | null;
  vulnerable: ObservationBool;
  by_version: BehavioralProbes["record_compression_by_version"];
};

export function getObservedChains(
  certificates: Certificates,
): NormalizedCertificateChain[] {
  if (certificates.observed_chains?.length) {
    return certificates.observed_chains;
  }

  const chains: NormalizedCertificateChain[] = [];
  const primaryChain = legacyChainWithLeaf(certificates.leaf, certificates.chain);
  if (primaryChain.length > 0) {
    chains.push({
      chain_id: "primary",
      role: "primary",
      observed_via: ["legacy.certificates.chain"],
      ...(primaryChain[0]?.fingerprint_sha256
        ? { leaf_fingerprint_sha256: primaryChain[0].fingerprint_sha256 }
        : {}),
      chain: primaryChain,
    });
  }

  for (const [index, alternate] of (certificates.alternates ?? []).entries()) {
    const alternateChain = legacyChainWithLeaf(alternate.leaf, alternate.chain);
    if (alternateChain.length === 0) continue;
    const leafFingerprint =
      alternate.leaf_fingerprint_sha256 ?? alternateChain[0]?.fingerprint_sha256;
    chains.push({
      chain_id: `alternate-${leafFingerprint?.slice(0, 12) ?? index + 1}`,
      role: "alternate",
      observed_via: alternate.observed_via,
      ...(leafFingerprint ? { leaf_fingerprint_sha256: leafFingerprint } : {}),
      ...(alternate.chain_fingerprint_sha256
        ? { chain_fingerprint_sha256: alternate.chain_fingerprint_sha256 }
        : {}),
      chain: alternateChain,
    });
  }

  return chains;
}

export function getPrimaryLeaf(
  certificates: Certificates,
): CertificateFacts | undefined {
  const primary = getObservedChains(certificates).find(
    (chain) => chain.role === "primary",
  );
  return primary?.chain[0] ?? certificates.leaf ?? certificates.chain[0];
}

export function getSniProbeRows(sniBehavior: SniBehavior): SniProbeRow[] {
  if (sniBehavior.probes?.length) {
    return sniBehavior.probes;
  }

  const outcome = sniBehavior.omitted_probe ?? legacySniOutcome(sniBehavior.method);
  return [
    {
      variant: "omitted",
      sni_sent: null,
      outcome,
      ...(sniBehavior.reason ? { reason: sniBehavior.reason } : {}),
    },
  ];
}

export function getRenegotiationRows(
  renegotiation: RenegotiationBehavior,
): RenegotiationRow[] {
  const legacyRenegotiation = renegotiation as LegacyRenegotiationBehavior;
  const clientObservation =
    renegotiation.client_initiated?.accepted ??
    legacyClientRenegotiationObservation(
      renegotiation.client_initiated_verdict,
      renegotiation.method,
      renegotiation.reason,
    );
  const serverObservation =
    renegotiation.server_initiated?.observed ??
    withReasonFallback(
      legacyRenegotiation.server_initiated_observed,
      legacyRenegotiation.server_initiated_probe_reason,
    ) ??
    {
      value: null,
      method: "not_probed",
      reason: "server_initiated_renegotiation_not_recorded",
    };

  return [
    {
      label: "Client-initiated renegotiation",
      observation: clientObservation,
      polarity: "negative",
      labels: { whenTrue: "Accepted", whenFalse: "Refused by server" },
    },
    {
      label: "Server-initiated renegotiation",
      observation: serverObservation,
      polarity: "negative",
      // "Rejected" was doubly wrong here: nothing was rejected, and the
      // probe is passive — it only watches for a HelloRequest.
      labels: { whenTrue: "Observed", whenFalse: "Not observed" },
    },
  ];
}

export function getClientAuthDistinguishedNameHex(
  entry: ClientAuthDistinguishedName,
): string {
  return entry.raw_der_hex ?? entry.raw_der_b64;
}

export function getClientAuthOidFilterValuesHex(
  entry: ClientAuthOidFilter,
): string[] {
  return entry.values_hex ?? entry.values_b64;
}

export function getCompressionBehavior(
  probes: BehavioralProbes,
): CompressionBehavior {
  if ("compression_selected" in probes && "crime_vulnerable" in probes) {
    return {
      selected: probes.compression_selected,
      vulnerable: probes.crime_vulnerable,
      by_version: probes.record_compression_by_version,
    };
  }

  const legacy = probes as BehavioralProbes & {
    compression_offered?: string[];
  };
  if (Array.isArray(legacy.compression_offered)) {
    const selected = legacy.compression_offered[0] ?? null;
    return {
      selected,
      vulnerable: {
        value: legacy.compression_offered.length > 0,
        method: "probe",
      },
      by_version: [],
    };
  }

  return {
    selected: null,
    vulnerable: {
      value: null,
      method: "not_probed",
      reason: "record_compression_fields_missing",
    },
    by_version: [],
  };
}

function legacyChainWithLeaf(
  leaf: CertificateFacts | undefined,
  chain: CertificateFacts[],
): CertificateFacts[] {
  if (!leaf) return chain;
  if (chain[0]?.fingerprint_sha256 === leaf.fingerprint_sha256) return chain;
  return [leaf, ...chain];
}

function legacySniOutcome(method: Method): SniProbeRow["outcome"] {
  if (method === "error") return "error";
  return "not_probed";
}

function legacyClientRenegotiationObservation(
  verdict: RenegotiationBehavior["client_initiated_verdict"],
  method: Method,
  reason: string | undefined,
): ObservationBool {
  if (verdict === "accepted") {
    return { value: true, method, ...(reason ? { reason } : {}) };
  }
  if (verdict === "rejected") {
    return { value: false, method, ...(reason ? { reason } : {}) };
  }
  return {
    value: null,
    method: verdict === "error" ? "error" : method,
    ...(reason ? { reason } : {}),
  };
}

function withReasonFallback(
  observation: ObservationBool | undefined,
  reason: string | undefined,
): ObservationBool | undefined {
  if (!observation) return undefined;
  if (observation.reason || !reason) return observation;
  return { ...observation, reason };
}
