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
  provider: "aws_lc_rs" | "openssl" | undefined;
}) {
  const isOpenSsl = provider === "openssl";
  return (
    <span
      className={[
        "rounded border px-1.5 py-0.5 text-[11px] font-medium",
        isOpenSsl
          ? "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          : "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300",
      ].join(" ")}
    >
      {isOpenSsl ? "OpenSSL" : "aws-lc-rs"}
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
            <TriStateText
              observation={{
                value: extensions.ocsp_stapling.stapled,
                method: extensions.ocsp_stapling.method,
                ...(extensions.ocsp_stapling.reason
                  ? { reason: extensions.ocsp_stapling.reason }
                  : {}),
              }}
            />
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
      </FieldGrid>
    </DetailSection>
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
      <h3 className="text-sm font-semibold">{title}</h3>
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
          value={`${cert.signature_algorithm_name}${cert.is_pqc_signature ? " (PQC)" : ""}`}
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
