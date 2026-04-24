/**
 * Per-section renderers for the per-domain detail view.
 *
 * Each export takes the relevant slice of a schema-v1 record and
 * renders it through <TriStateText> for observation fields,
 * preserving the five-method contract everywhere.
 *
 * Sections follow the schema's top-level structure:
 *   ScanMetadataSection     `.scan` + scanner version
 *   ProtocolSupportSection  `.tls.versions_offered` (6 versions)
 *   NegotiatedSection       `.tls.negotiated` (may be absent)
 *   CipherSuitesSection     `.tls.cipher_suites.{tls1_0,tls1_1,tls1_2,tls1_3}` + order
 *   KxGroupsSection         `.tls.groups.{tls1_2,tls1_3}` (per-version keyed objects)
 *   ExtensionsSection       `.tls.extensions`
 *   CertificatesSection     `.certificates.{leaf,chain}`
 *   ValidationSection       `.validation` (3 fields, not collapsed)
 *   ErrorsSection           `.errors[]`
 */

import type {
  CertificateFacts,
  CipherSuiteEntry,
  GroupObservation,
  KemistScanResultSchemaV1,
  VersionOffered,
} from "../../data/schema";
import { TriStateText } from "../TriStateText";
import { PQC_HYBRID_GROUPS } from "../../data/transform";
import { DetailSection, Field, FieldGrid } from "./DetailSection";

// ── Scan metadata ────────────────────────────────────────────────

export function ScanMetadataSection({
  record,
}: {
  record: KemistScanResultSchemaV1;
}) {
  const { scan, scanner, capabilities } = record;
  return (
    <DetailSection title="Scan metadata" json={{ scan, scanner, capabilities }}>
      <FieldGrid>
        <Field label="Target" value={<code>{scan.target}</code>} />
        <Field label="Host" value={scan.host} />
        <Field label="Port" value={scan.port} />
        <Field label="SNI sent" value={scan.sni_sent} />
        <Field
          label="Resolved IP"
          value={scan.resolved_ip ?? "—"}
        />
        <Field label="Started" value={scan.started_at} />
        <Field label="Completed" value={scan.completed_at} />
        <Field
          label="Duration"
          value={`${scan.duration_ms.toLocaleString()} ms`}
        />
        <Field
          label="Scanner"
          value={`${scanner.name} ${scanner.version}`}
        />
        <Field
          label="Features"
          value={
            capabilities.enabled_features.length
              ? capabilities.enabled_features.join(", ")
              : "(none)"
          }
        />
      </FieldGrid>
    </DetailSection>
  );
}

// ── Protocol support ─────────────────────────────────────────────

const VERSION_ORDER = [
  "ssl2",
  "ssl3",
  "tls1_0",
  "tls1_1",
  "tls1_2",
  "tls1_3",
] as const;

const VERSION_LABEL: Record<(typeof VERSION_ORDER)[number], string> = {
  ssl2: "SSL 2.0",
  ssl3: "SSL 3.0",
  tls1_0: "TLS 1.0",
  tls1_1: "TLS 1.1",
  tls1_2: "TLS 1.2",
  tls1_3: "TLS 1.3",
};

export function ProtocolSupportSection({
  versions,
}: {
  versions: KemistScanResultSchemaV1["tls"]["versions_offered"];
}) {
  return (
    <DetailSection
      title="Protocol support"
      description="Per-version probes; tri-state preserved for each."
      json={versions}
    >
      <FieldGrid>
        {VERSION_ORDER.map((k) => {
          const obs = versions[k] as VersionOffered;
          return (
            <Field
              key={k}
              label={VERSION_LABEL[k]}
              value={
                // Wrap the schema's `versionOffered` shape in a
                // TriStateInput — the helper's `extractValue`
                // handles the `.offered` field name for us.
                <TriStateText observation={obs} />
              }
            />
          );
        })}
      </FieldGrid>
    </DetailSection>
  );
}

// ── Negotiated ───────────────────────────────────────────────────

export function NegotiatedSection({
  negotiated,
}: {
  negotiated: KemistScanResultSchemaV1["tls"]["negotiated"] | undefined;
}) {
  if (!negotiated) {
    return (
      <DetailSection
        title="Negotiated handshake"
        description="Post-handshake state; present only when the TLS handshake succeeded."
      >
        <p className="text-sm text-slate-600 dark:text-slate-400">
          No handshake completed for this target.
        </p>
      </DetailSection>
    );
  }
  return (
    <DetailSection
      title="Negotiated handshake"
      description="Read from rustls's connection state after a successful probe."
      json={negotiated}
    >
      <FieldGrid>
        <Field label="Version" value={<code>{negotiated.version}</code>} />
        <Field label="Cipher suite" value={negotiated.cipher_suite ?? "—"} />
        <Field label="KX group" value={negotiated.group ?? "—"} />
        <Field
          label="Signature"
          value={negotiated.signature_scheme ?? "—"}
        />
        <Field label="ALPN" value={negotiated.alpn ?? "—"} />
      </FieldGrid>
    </DetailSection>
  );
}

// ── Cipher suites ────────────────────────────────────────────────

export function CipherSuitesSection({
  ciphers,
}: {
  ciphers: KemistScanResultSchemaV1["tls"]["cipher_suites"];
}) {
  const versionGroups = [
    { title: "TLS 1.3", entries: ciphers.tls1_3 },
    { title: "TLS 1.2", entries: ciphers.tls1_2 },
    { title: "TLS 1.1", entries: ciphers.tls1_1 },
    { title: "TLS 1.0", entries: ciphers.tls1_0 },
  ].filter((group) => group.entries.length > 0);

  return (
    <DetailSection title="Cipher suites" json={ciphers}>
      <div className="space-y-4">
        {versionGroups.length === 0 ? (
          <p className="text-sm text-slate-500">No cipher-suite probe data recorded.</p>
        ) : (
          versionGroups.map((group) => (
            <CipherList key={group.title} title={group.title} entries={group.entries} />
          ))
        )}
        <FieldGrid>
          <Field
            label="Server enforces order"
            value={<TriStateText observation={ciphers.server_enforces_order} />}
          />
        </FieldGrid>
      </div>
    </DetailSection>
  );
}

function ProviderPill({
  provider,
}: {
  provider: "aws_lc_rs" | "openssl" | "raw_socket" | undefined;
}) {
  const label =
    provider === "openssl"
      ? "OpenSSL"
      : provider === "raw_socket"
        ? "raw-socket"
        : "aws-lc-rs";
  const isAwsLcRs = provider === "aws_lc_rs" || provider === undefined;
  return (
    <span
      className={[
        "rounded border px-1.5 py-0.5 text-[11px] font-medium",
        isAwsLcRs
          ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300"
          : "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
      ].join(" ")}
    >
      {label}
    </span>
  );
}

const CLASSIFICATION_LABELS: Record<CipherSuiteEntry["classification"], string> = {
  rsa_kex: "RSA-KEX",
  dhe_aead: "DHE-AEAD",
  dhe_cbc: "DHE-CBC",
  ecdhe_aead: "ECDHE-AEAD",
  ecdhe_cbc: "ECDHE-CBC",
  anon: "anon",
  export: "export",
  static_dh: "static-DH",
  static_ecdh: "static-ECDH",
  psk: "PSK",
  dhe_psk: "DHE-PSK",
  ecdhe_psk: "ECDHE-PSK",
  rsa_psk: "RSA-PSK",
  null_cipher: "NULL",
  other: "other",
};

// Red = privacy-broken (null/anon/export); amber = legacy kx (rsa/static);
// slate = CBC; emerald = forward-secret AEAD; gray = psk/other.
const CLASSIFICATION_TONE: Record<CipherSuiteEntry["classification"], string> = {
  null_cipher: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300",
  anon: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300",
  export: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300",
  rsa_kex: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300",
  static_dh: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300",
  static_ecdh: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300",
  dhe_cbc: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  ecdhe_cbc: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  dhe_aead: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300",
  ecdhe_aead: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300",
  psk: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  dhe_psk: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  ecdhe_psk: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  rsa_psk: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  other: "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400",
};

function ClassificationPill({ family }: { family: CipherSuiteEntry["classification"] }) {
  return (
    <span
      className={[
        "rounded border px-1.5 py-0.5 text-[11px] font-medium",
        CLASSIFICATION_TONE[family],
      ].join(" ")}
    >
      {CLASSIFICATION_LABELS[family]}
    </span>
  );
}

function CipherList({
  title,
  entries,
}: {
  title: string;
  entries: CipherSuiteEntry[];
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <table className="mt-1 min-w-full text-sm">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="py-1 pr-4 font-medium">Suite</th>
            <th className="py-1 pr-4 font-medium">IANA</th>
            <th className="py-1 pr-4 font-medium">Class</th>
            <th className="py-1 pr-4 font-medium">Source</th>
            <th className="py-1 font-medium">Observation</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr
              key={`${entry.iana_code}-${entry.provider ?? "aws_lc_rs"}-${index}`}
              className="border-t border-slate-100 dark:border-slate-800"
            >
              <td className="py-1 pr-4">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-xs">{entry.name}</code>
                  {entry.openssl_name && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      ({entry.openssl_name})
                    </span>
                  )}
                </div>
              </td>
              <td className="py-1 pr-4">
                <code className="text-xs">{entry.iana_code}</code>
              </td>
              <td className="py-1 pr-4">
                <ClassificationPill family={entry.classification} />
              </td>
              <td className="py-1 pr-4">
                <ProviderPill provider={entry.provider} />
              </td>
              <td className="py-1">
                <TriStateText observation={entry} showMethod={false} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── KX groups ────────────────────────────────────────────────────

const HYBRID_GROUP_SET = new Set(PQC_HYBRID_GROUPS as readonly string[]);

function sortGroupEntries(
  groups: Record<string, GroupObservation>,
): Array<[string, GroupObservation]> {
  return Object.entries(groups).sort(([left], [right]) => {
    const leftRank = HYBRID_GROUP_SET.has(left) ? 0 : 1;
    const rightRank = HYBRID_GROUP_SET.has(right) ? 0 : 1;
    return leftRank - rightRank || left.localeCompare(right);
  });
}

export function KxGroupsSection({
  groups,
}: {
  groups: KemistScanResultSchemaV1["tls"]["groups"];
}) {
  const tls13Entries = sortGroupEntries(groups.tls1_3);
  const tls12Entries = sortGroupEntries(groups.tls1_2);

  return (
    <DetailSection
      title="Key-exchange groups"
      description="Per-version group probes. TLS 1.3 is shown first; TLS 1.2 carries the FFDHE compatibility results."
      json={groups}
    >
      {tls13Entries.length === 0 && tls12Entries.length === 0 ? (
        <p className="text-sm text-slate-500">No group probe data recorded.</p>
      ) : (
        <div className="space-y-4">
          {tls13Entries.length > 0 && (
            <GroupList title="TLS 1.3 groups" entries={tls13Entries} />
          )}
          {tls12Entries.length > 0 && (
            <GroupList title="TLS 1.2 groups" entries={tls12Entries} />
          )}
        </div>
      )}
    </DetailSection>
  );
}

function GroupObservationValue({
  observation,
}: {
  observation: GroupObservation;
}) {
  const ignoredOffer =
    observation.reason === "server_ignored_group_offer_returned_custom_prime";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <TriStateText observation={observation} showMethod={false} />
        {observation.provider && <ProviderPill provider={observation.provider} />}
        {observation.iana_code && (
          <code className="text-xs text-slate-500 dark:text-slate-400">
            {observation.iana_code}
          </code>
        )}
      </div>
      {ignoredOffer && (
        <span className="inline-flex w-fit items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          ⚠ server ignored group offer and returned a custom prime
        </span>
      )}
    </div>
  );
}

function GroupList({
  title,
  entries,
}: {
  title: string;
  entries: Array<[string, GroupObservation]>;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <FieldGrid>
        {entries.map(([name, obs]) => (
          <Field
            key={`${title}-${name}`}
            label={name}
            value={<GroupObservationValue observation={obs} />}
          />
        ))}
      </FieldGrid>
    </div>
  );
}

// ── Extensions ───────────────────────────────────────────────────

export function ExtensionsSection({
  extensions,
}: {
  extensions: KemistScanResultSchemaV1["tls"]["extensions"];
}) {
  const ocsp = extensions.ocsp_stapling;
  return (
    <DetailSection title="Extensions" json={extensions}>
      <FieldGrid>
        <Field
          label="Extended master secret"
          value={<TriStateText observation={extensions.ems} />}
        />
        <Field
          label="Secure renegotiation"
          value={<TriStateText observation={extensions.secure_renegotiation} />}
        />
        <Field
          label="OCSP stapling"
          value={
            <div className="flex flex-wrap items-center gap-2">
              <TriStateText
                observation={{
                  value: ocsp.stapled,
                  method: ocsp.method,
                  ...(ocsp.reason ? { reason: ocsp.reason } : {}),
                }}
              />
              {ocsp.delivery_path && (
                <span className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-800">
                  {ocsp.delivery_path}
                </span>
              )}
              {ocsp.content?.cert_status && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  cert_status: {ocsp.content.cert_status}
                  {ocsp.content.this_update && ` · thisUpdate ${ocsp.content.this_update}`}
                  {ocsp.content.next_update && ` · nextUpdate ${ocsp.content.next_update}`}
                </span>
              )}
            </div>
          }
        />
        <Field
          label="SCTs observed"
          value={`${extensions.sct.count} (paths: ${
            extensions.sct.delivery_paths.join(", ") || "none"
          })`}
        />
        <Field
          label="ALPN offered"
          value={
            extensions.alpn_offered.length
              ? extensions.alpn_offered.join(", ")
              : "—"
          }
        />
        <Field
          label="Encrypt-then-MAC"
          value={<TriStateText observation={extensions.encrypt_then_mac} />}
        />
        <Field
          label="Heartbeat present"
          value={<TriStateText observation={extensions.heartbeat_present} />}
        />
        <Field
          label="Heartbleed probe"
          value={
            <TriStateText
              observation={extensions.heartbeat_echoes_oversized_payload}
            />
          }
        />
        <Field
          label="Compression offered"
          value={
            extensions.compression_offered.length
              ? extensions.compression_offered.join(", ")
              : "—"
          }
        />
        <Field
          label="Truncated HMAC"
          value={<TriStateText observation={extensions.truncated_hmac} />}
        />
        <Field
          label="NPN"
          value={<TriStateText observation={extensions.npn} />}
        />
        <Field
          label="Point formats echoed"
          value={
            extensions.supported_point_formats_echoed.length
              ? extensions.supported_point_formats_echoed.join(", ")
              : "—"
          }
        />
        <Field
          label="Max fragment length"
          value={extensions.max_fragment_length ?? "—"}
        />
        <Field
          label="Record size limit"
          value={
            extensions.record_size_limit != null
              ? String(extensions.record_size_limit)
              : "—"
          }
        />
        <Field
          label="Cert compression algs"
          value={
            extensions.compress_certificate_algorithms?.length
              ? extensions.compress_certificate_algorithms.join(", ")
              : "—"
          }
        />
        <Field
          label="GREASE echoed"
          value={<TriStateText observation={extensions.grease_echoed} />}
        />
        <Field
          label="HelloRetryRequest"
          value={<TriStateText observation={extensions.hello_retry_request} />}
        />
        <Field
          label="Delegated credentials"
          value={<DelegatedCredentialsRow dc={extensions.delegated_credentials} />}
        />
        <Field
          label="DHE ephemeral reuse"
          value={
            <div className="flex flex-wrap items-center gap-2">
              <TriStateText
                observation={
                  extensions.ephemeral_key_reuse
                    .dhe_public_reused_across_connections
                }
              />
              {extensions.ephemeral_key_reuse.dhe_suite_probed && (
                <code className="text-xs text-slate-500 dark:text-slate-400">
                  {extensions.ephemeral_key_reuse.dhe_suite_probed}
                </code>
              )}
            </div>
          }
        />
        <Field
          label="ECDHE ephemeral reuse"
          value={
            <div className="flex flex-wrap items-center gap-2">
              <TriStateText
                observation={
                  extensions.ephemeral_key_reuse
                    .ecdhe_public_reused_across_connections
                }
              />
              {extensions.ephemeral_key_reuse.ecdhe_suite_probed && (
                <code className="text-xs text-slate-500 dark:text-slate-400">
                  {extensions.ephemeral_key_reuse.ecdhe_suite_probed}
                </code>
              )}
            </div>
          }
        />
      </FieldGrid>
      <BleichenbacherPanel probe={extensions.bleichenbacher_oracle_probe} />
    </DetailSection>
  );
}

function DelegatedCredentialsRow({
  dc,
}: {
  dc: KemistScanResultSchemaV1["tls"]["extensions"]["delegated_credentials"];
}) {
  const { value: observation, delivery_path, expected_cert_verify_algorithm, valid_time_seconds } = dc;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <TriStateText observation={observation} />
      {delivery_path && (
        <span className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-800">
          {delivery_path}
        </span>
      )}
      {expected_cert_verify_algorithm && (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {expected_cert_verify_algorithm}
          {valid_time_seconds != null && ` · valid_time ${valid_time_seconds}s`}
        </span>
      )}
    </div>
  );
}

function BleichenbacherPanel({
  probe,
}: {
  probe: KemistScanResultSchemaV1["tls"]["extensions"]["bleichenbacher_oracle_probe"];
}) {
  if (probe.method !== "probe" || probe.per_variant.length === 0) {
    return (
      <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Bleichenbacher / ROBOT differential probe:{" "}
        <span className="font-medium">{probe.method}</span>
        {probe.reason ? ` — ${probe.reason}` : ""}
      </div>
    );
  }
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold">
        Bleichenbacher / ROBOT differential
      </h3>
      {probe.rsa_kex_suite_probed && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Pinned suite: <code>{probe.rsa_kex_suite_probed}</code>
        </p>
      )}
      <table className="mt-1 min-w-full text-sm">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="py-1 pr-4 font-medium">Variant</th>
            <th className="py-1 pr-4 font-medium">Alert</th>
            <th className="py-1 pr-4 font-medium">TCP reset</th>
            <th className="py-1 pr-4 font-medium">ms</th>
            <th className="py-1 font-medium">Other outcome</th>
          </tr>
        </thead>
        <tbody>
          {probe.per_variant.map((v) => (
            <tr
              key={v.variant}
              className="border-t border-slate-100 dark:border-slate-800"
            >
              <td className="py-1 pr-4">
                <code className="text-xs">{v.variant}</code>
              </td>
              <td className="py-1 pr-4">{v.alert_category ?? "—"}</td>
              <td className="py-1 pr-4">{v.tcp_reset ? "yes" : "no"}</td>
              <td className="py-1 pr-4">{v.elapsed_ms}</td>
              <td className="py-1">{v.other_outcome ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Certificates ─────────────────────────────────────────────────

export function CertificatesSection({
  certificates,
}: {
  certificates: KemistScanResultSchemaV1["certificates"];
}) {
  if (!certificates.leaf && certificates.chain.length === 0) {
    return (
      <DetailSection title="Certificate chain">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          No certificate chain observed (handshake did not reach the
          cert stage).
        </p>
      </DetailSection>
    );
  }
  return (
    <DetailSection
      title="Certificate chain"
      description={`Leaf + ${certificates.chain_length - 1} intermediate(s)`}
      json={certificates}
    >
      <div className="space-y-4">
        {certificates.leaf && (
          <CertBlock title="Leaf" cert={certificates.leaf} />
        )}
        {certificates.chain.slice(1).map((c, i) => (
          <CertBlock key={c.fingerprint_sha256} title={`Chain [${i + 1}]`} cert={c} />
        ))}
      </div>
    </DetailSection>
  );
}

function CertBlock({
  title,
  cert,
}: {
  title: string;
  cert: CertificateFacts;
}) {
  return (
    <div className="rounded border border-slate-200 p-3 dark:border-slate-800">
      <h3 className="text-sm font-semibold">
        {title}
        <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
          wire position {cert.wire_position}
        </span>
      </h3>
      <FieldGrid>
        <Field label="Subject" value={cert.subject_dn} />
        <Field
          label="SANs"
          value={cert.san.length ? cert.san.join(", ") : "—"}
        />
        <Field label="Issuer" value={cert.issuer_dn} />
        <Field label="Serial" value={<code className="text-xs">{cert.serial}</code>} />
        <Field label="Not before" value={cert.not_before} />
        <Field label="Not after" value={cert.not_after} />
        <Field
          label="Validity"
          value={`${cert.validity_days} days`}
        />
        <Field
          label="Signature"
          value={`${cert.signature_algorithm_name}${cert.pqc_signature_family ? ` (PQC: ${cert.pqc_signature_family})` : ""}`}
        />
        <Field
          label="Public key"
          value={`${cert.public_key.algorithm} ${cert.public_key.size_bits}${cert.public_key.curve ? ` (${cert.public_key.curve})` : ""}`}
        />
        <Field label="Embedded SCTs" value={cert.embedded_scts} />
        <Field
          label="SHA-256"
          value={
            <code className="break-all text-xs">
              {cert.fingerprint_sha256}
            </code>
          }
        />
      </FieldGrid>
      {cert.extensions && <CertExtensionsBlock ext={cert.extensions} />}
    </div>
  );
}

function CertExtensionsBlock({ ext }: { ext: NonNullable<CertificateFacts["extensions"]> }) {
  return (
    <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-800">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        X.509 extensions
      </h4>
      <FieldGrid>
        {ext.basic_constraints && (
          <Field
            label="Basic constraints"
            value={
              `CA: ${ext.basic_constraints.ca}` +
              (ext.basic_constraints.path_len_constraint != null
                ? ` · pathLen ${ext.basic_constraints.path_len_constraint}`
                : "")
            }
          />
        )}
        {ext.key_usage && (
          <Field
            label="Key usage"
            value={ext.key_usage.bits.length ? ext.key_usage.bits.join(", ") : "—"}
          />
        )}
        {ext.extended_key_usage && (
          <Field
            label="Extended key usage"
            value={
              ext.extended_key_usage.oids.length
                ? ext.extended_key_usage.oids.join(", ")
                : "—"
            }
          />
        )}
        {ext.authority_key_identifier && (
          <Field
            label="AKI"
            value={<code className="break-all text-xs">{ext.authority_key_identifier}</code>}
          />
        )}
        {ext.subject_key_identifier && (
          <Field
            label="SKI"
            value={<code className="break-all text-xs">{ext.subject_key_identifier}</code>}
          />
        )}
        {ext.authority_information_access && (
          <Field
            label="AIA"
            value={
              <div className="flex flex-col gap-0.5">
                {ext.authority_information_access.ocsp.map((u) => (
                  <span key={`ocsp-${u}`} className="text-xs">
                    OCSP: <code>{u}</code>
                  </span>
                ))}
                {ext.authority_information_access.ca_issuers.map((u) => (
                  <span key={`ca-${u}`} className="text-xs">
                    CA issuers: <code>{u}</code>
                  </span>
                ))}
                {ext.authority_information_access.ocsp.length === 0 &&
                  ext.authority_information_access.ca_issuers.length === 0 && (
                    <span className="text-xs">—</span>
                  )}
              </div>
            }
          />
        )}
        {ext.crl_distribution_points && (
          <Field
            label="CRL DPs"
            value={
              ext.crl_distribution_points.urls.length ? (
                <div className="flex flex-col gap-0.5">
                  {ext.crl_distribution_points.urls.map((u) => (
                    <code key={u} className="break-all text-xs">
                      {u}
                    </code>
                  ))}
                </div>
              ) : (
                "—"
              )
            }
          />
        )}
        {ext.name_constraints && (
          <Field
            label="Name constraints"
            value={
              `permitted: ${ext.name_constraints.permitted_subtrees.join(", ") || "—"} · ` +
              `excluded: ${ext.name_constraints.excluded_subtrees.join(", ") || "—"}`
            }
          />
        )}
        {ext.certificate_policies && (
          <Field
            label="Cert policies"
            value={
              ext.certificate_policies.oids.length
                ? ext.certificate_policies.oids.join(", ")
                : "—"
            }
          />
        )}
        {ext.must_staple != null && (
          <Field label="Must-Staple" value={ext.must_staple ? "yes" : "no"} />
        )}
        {ext.scts && ext.scts.length > 0 && (
          <Field
            label="SCTs (in cert)"
            value={`${ext.scts.length} (${ext.scts
              .map((s) => s.signature_hash_algorithm)
              .join(", ")})`}
          />
        )}
      </FieldGrid>
    </div>
  );
}

// ── Validation ───────────────────────────────────────────────────

export function ValidationSection({
  validation,
}: {
  validation: KemistScanResultSchemaV1["validation"];
}) {
  return (
    <DetailSection
      title="Validation"
      description="Three independent observations — never collapse into one 'cert OK' bool."
      json={validation}
    >
      <FieldGrid>
        <Field
          label="Chain → webpki roots"
          value={<TriStateText observation={validation.chain_valid_to_webpki_roots} />}
        />
        <Field
          label="Name matches SNI"
          value={<TriStateText observation={validation.name_matches_sni} />}
        />
        <Field
          label="Validation error"
          value={validation.validation_error ?? "—"}
        />
      </FieldGrid>
    </DetailSection>
  );
}

// ── Downgrade signaling ──────────────────────────────────────────

export function DowngradeSignalingSection({
  downgrade,
}: {
  downgrade: KemistScanResultSchemaV1["tls"]["downgrade_signaling"];
}) {
  const sentinelLabel: Record<
    NonNullable<
      KemistScanResultSchemaV1["tls"]["downgrade_signaling"]["tls13_downgrade_sentinel"]
    >,
    string
  > = {
    tls12: "tls12 — server indicated TLS 1.2 fallback",
    lte_tls11: "lte_tls11 — server indicated TLS 1.1 or earlier",
    none: "none",
  };
  return (
    <DetailSection title="Downgrade signaling" json={downgrade}>
      <FieldGrid>
        <Field
          label="fallback_scsv enforced"
          value={<TriStateText observation={downgrade.fallback_scsv_enforced} />}
        />
        <Field
          label="TLS 1.3 downgrade sentinel"
          value={
            downgrade.tls13_downgrade_sentinel
              ? sentinelLabel[downgrade.tls13_downgrade_sentinel]
              : "—"
          }
        />
      </FieldGrid>
    </DetailSection>
  );
}

// ── Session resumption ───────────────────────────────────────────

export function SessionResumptionSection({
  resumption,
}: {
  resumption: KemistScanResultSchemaV1["tls"]["session_resumption"];
}) {
  return (
    <DetailSection title="Session resumption" json={resumption}>
      <h3 className="text-sm font-semibold">TLS 1.2</h3>
      <FieldGrid>
        <Field
          label="Session ticket issued"
          value={<TriStateText observation={resumption.tls1_2.session_ticket_issued} />}
        />
        <Field
          label="Ticket lifetime hint"
          value={
            resumption.tls1_2.ticket_lifetime_hint_secs != null
              ? `${resumption.tls1_2.ticket_lifetime_hint_secs}s`
              : "—"
          }
        />
        <Field
          label="Session ID issued"
          value={<TriStateText observation={resumption.tls1_2.session_id_issued} />}
        />
        <Field
          label="Ticket rotated across connections"
          value={
            <TriStateText
              observation={resumption.tls1_2.ticket_rotated_across_connections}
            />
          }
        />
      </FieldGrid>
      <h3 className="mt-4 text-sm font-semibold">TLS 1.3</h3>
      <FieldGrid>
        <Field
          label="NewSessionTicket count"
          value={resumption.tls1_3.new_session_ticket_count ?? "—"}
        />
        <Field
          label="Ticket lifetimes"
          value={
            resumption.tls1_3.ticket_lifetime_secs?.length
              ? resumption.tls1_3.ticket_lifetime_secs.map((s) => `${s}s`).join(", ")
              : "—"
          }
        />
        <Field
          label="PSK resumption accepted"
          value={<TriStateText observation={resumption.tls1_3.psk_resumption_accepted} />}
        />
        <Field
          label="0-RTT early_data accepted"
          value={<TriStateText observation={resumption.tls1_3.early_data_accepted} />}
        />
      </FieldGrid>
    </DetailSection>
  );
}

// ── Signature-algorithm policy probe ─────────────────────────────

const SIGALG_PROBE_ORDER: ReadonlyArray<
  [keyof KemistScanResultSchemaV1["tls"]["signature_algorithm_policy_probe"], string]
> = [
  ["sha256_plus_only", "SHA-256+ only"],
  ["ecdsa_only", "ECDSA only"],
  ["rsa_pss_only", "RSA-PSS only"],
  ["rsa_pkcs1_only", "RSA-PKCS1 only"],
  ["eddsa_only", "EdDSA only"],
];

export function SignatureAlgorithmPolicyProbeSection({
  probe,
}: {
  probe: KemistScanResultSchemaV1["tls"]["signature_algorithm_policy_probe"];
}) {
  const fingerprints = new Set(
    SIGALG_PROBE_ORDER.map(([k]) => probe[k].leaf_fingerprint_sha256).filter(
      (fp): fp is string => !!fp,
    ),
  );
  const dualCert = fingerprints.size > 1;
  return (
    <DetailSection
      title="Signature-algorithm policy probe"
      description={
        dualCert
          ? `Dual-cert deployment observed — ${fingerprints.size} distinct leaf fingerprints across the constrained probes.`
          : "Constrained sigalg handshakes — one probe per policy."
      }
      json={probe}
    >
      <table className="min-w-full text-sm">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="py-1 pr-4 font-medium">Constraint</th>
            <th className="py-1 pr-4 font-medium">Outcome</th>
            <th className="py-1 pr-4 font-medium">Selected sigalg</th>
            <th className="py-1 pr-4 font-medium">Alert</th>
            <th className="py-1 font-medium">Leaf fingerprint</th>
          </tr>
        </thead>
        <tbody>
          {SIGALG_PROBE_ORDER.map(([key, label]) => {
            const slot = probe[key];
            return (
              <tr
                key={key}
                className="border-t border-slate-100 dark:border-slate-800"
              >
                <td className="py-1 pr-4">{label}</td>
                <td className="py-1 pr-4">
                  <code className="text-xs">{slot.outcome}</code>
                </td>
                <td className="py-1 pr-4">{slot.selected_sigalg ?? "—"}</td>
                <td className="py-1 pr-4">{slot.alert ?? "—"}</td>
                <td className="py-1">
                  {slot.leaf_fingerprint_sha256 ? (
                    <code className="break-all text-xs">
                      {slot.leaf_fingerprint_sha256.slice(0, 16)}…
                    </code>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </DetailSection>
  );
}

// ── Channel binding ──────────────────────────────────────────────

export function ChannelBindingSection({
  channel,
}: {
  channel: KemistScanResultSchemaV1["tls"]["channel_binding"];
}) {
  return (
    <DetailSection title="Channel binding" json={channel}>
      <FieldGrid>
        <Field
          label="tls-exporter (RFC 9266)"
          value={<ChannelBindingRow binding={channel.tls_exporter} />}
        />
        <Field
          label="tls-server-end-point (RFC 5929)"
          value={<ChannelBindingRow binding={channel.tls_server_end_point} />}
        />
      </FieldGrid>
    </DetailSection>
  );
}

function ChannelBindingRow({
  binding,
}: {
  binding: KemistScanResultSchemaV1["tls"]["channel_binding"]["tls_exporter"];
}) {
  const { value: hex, method, reason } = binding;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <TriStateText
        observation={{
          value: hex != null,
          method,
          ...(reason ? { reason } : {}),
        }}
      />
      {hex && (
        <code className="break-all text-xs text-slate-500 dark:text-slate-400">
          {hex.slice(0, 16)}…
        </code>
      )}
    </div>
  );
}

// ── ALPN protocol probe matrix ───────────────────────────────────

export function AlpnProbeSection({
  probes,
}: {
  probes: KemistScanResultSchemaV1["tls"]["alpn_probe"];
}) {
  return (
    <DetailSection
      title="ALPN protocol probe"
      description="Per-protocol acceptance — each token offered alone."
      json={probes}
    >
      {probes.length === 0 ? (
        <p className="text-sm text-slate-500">(no ALPN probes recorded)</p>
      ) : (
        <table className="min-w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-1 pr-4 font-medium">Protocol</th>
              <th className="py-1 pr-4 font-medium">Observation</th>
              <th className="py-1 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {probes.map((p) => {
              const { protocol, supported: value, method, reason } = p;
              return (
                <tr
                  key={protocol}
                  className="border-t border-slate-100 dark:border-slate-800"
                >
                  <td className="py-1 pr-4">
                    <code className="text-xs">{protocol}</code>
                  </td>
                  <td className="py-1 pr-4">
                    <TriStateText
                      observation={{
                        value,
                        method,
                        ...(reason ? { reason } : {}),
                      }}
                      showMethod={false}
                    />
                  </td>
                  <td className="py-1">{reason ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </DetailSection>
  );
}

// ── Errors ───────────────────────────────────────────────────────

export function ErrorsSection({
  errors,
}: {
  errors: KemistScanResultSchemaV1["errors"];
}) {
  return (
    <DetailSection
      title="Errors"
      description={
        errors.length === 0
          ? "No errors recorded for this scan."
          : `${errors.length} error${errors.length === 1 ? "" : "s"} — partial observations still live on the record.`
      }
      json={errors}
    >
      {errors.length === 0 ? (
        <p className="text-sm text-slate-500">(none)</p>
      ) : (
        <ul className="space-y-2">
          {errors.map((err) => (
            <li
              key={err.timestamp + err.category}
              className="rounded border border-amber-500/40 bg-amber-50 p-2 text-sm dark:bg-amber-900/20"
            >
              <div className="font-semibold">{err.category}</div>
              <div className="mt-1 font-mono text-xs text-slate-700 dark:text-slate-300">
                {err.context}
              </div>
              <div className="mt-1 text-xs text-slate-500">{err.timestamp}</div>
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}
