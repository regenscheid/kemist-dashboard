/**
 * Certificate chain — leaf → root cards. Each card surfaces subject,
 * issuer, SAN chips, validity dates, key algorithm + size, signature
 * algorithm, fingerprint, and embedded SCT count. Renders the full
 * chain in wire order.
 */

import type {
  CertificateFacts,
  KemistScanResultSchemaV2,
} from "../../data/schema";
import { DetailSection } from "./DetailSection";

type Props = {
  certificates: KemistScanResultSchemaV2["certificates"];
};

export function CertChainCards({ certificates }: Props) {
  const all: CertificateFacts[] = [];
  if (certificates.leaf) all.push(certificates.leaf);
  // chain[0] is the leaf in wire order; skip if we already pushed the
  // duplicate via `leaf`. Otherwise (unusual, but possible) the chain
  // array is the source of truth.
  const skipFirst =
    certificates.leaf && certificates.chain[0]?.fingerprint_sha256 ===
      certificates.leaf.fingerprint_sha256;
  for (let i = skipFirst ? 1 : 0; i < certificates.chain.length; i++) {
    const c = certificates.chain[i];
    if (c) all.push(c);
  }

  if (all.length === 0) {
    return (
      <DetailSection
        id="chain"
        title="Certificate chain"
        description="Full chain in wire order — leaf → root."
      >
        <p className="text-[13px] italic text-ink-3">
          No certificate chain observed (handshake didn't reach the cert
          stage).
        </p>
      </DetailSection>
    );
  }

  return (
    <DetailSection
      id="chain"
      title="Certificate chain"
      description={`${all.length} entr${all.length === 1 ? "y" : "ies"} delivered in wire order — leaf → root`}
      json={certificates}
    >
      <div className="space-y-4">
        {all.map((cert, idx) => (
          <CertCard
            key={cert.fingerprint_sha256}
            cert={cert}
            position={idx}
            isLeaf={idx === 0}
            isRoot={idx === all.length - 1 && all.length > 1}
          />
        ))}
      </div>
    </DetailSection>
  );
}

function CertCard({
  cert,
  position,
  isLeaf,
  isRoot,
}: {
  cert: CertificateFacts;
  position: number;
  isLeaf: boolean;
  isRoot: boolean;
}) {
  const role = isLeaf
    ? "LEAF"
    : isRoot
      ? "ROOT"
      : "INTERMEDIATE";

  const keyDescriptor = [
    cert.public_key.algorithm,
    `${cert.public_key.size_bits} bit`,
    cert.public_key.curve,
  ]
    .filter((v): v is string => !!v)
    .join(" · ");

  return (
    <article className="grid grid-cols-[max-content_1fr] gap-4 rounded-md border border-line bg-surface-2 p-4">
      <div className="flex flex-col items-start gap-2 font-mono text-[10px] uppercase tracking-[0.05em] text-ink-3">
        <span>[{position}]</span>
      </div>

      <div className="space-y-3">
        <header className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] ${
              isLeaf
                ? "bg-aff-bg text-aff-fg"
                : isRoot
                  ? "bg-accent-2 text-surface"
                  : "bg-line-2 text-ink-2"
            }`}
          >
            {role}
          </span>
          <span className="text-[15px] font-semibold">
            {cert.subject_cn ?? cert.subject_dn}
          </span>
        </header>
        <p className="break-all font-mono text-[11px] text-ink-3">
          {cert.subject_dn}
        </p>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12px] sm:grid-cols-3">
          <KV label="Issuer CN" value={cert.issuer_cn ?? cert.issuer_dn} />
          <KV label="Not before" value={cert.not_before} />
          <KV label="Not after" value={cert.not_after} />
          <KV
            label="Validity"
            value={`${cert.validity_days.toLocaleString()} days`}
          />
          <KV label="Sig alg" value={cert.signature_algorithm_name} />
          <KV label="Public key" value={keyDescriptor || "—"} />
          <KV
            label="Embedded SCTs"
            value={cert.embedded_scts.toLocaleString()}
          />
          <KV
            label="FP SHA256"
            value={
              <span
                title={cert.fingerprint_sha256}
                className="block overflow-hidden text-ellipsis whitespace-nowrap font-mono"
              >
                {cert.fingerprint_sha256}
              </span>
            }
          />
        </dl>

        {cert.san.length > 0 && (
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-ink-3">
              SAN
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {cert.san.map((name) => (
                <span
                  key={name}
                  className="rounded-sm bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink-2"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function KV({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.05em] text-ink-3">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-[12px]">{value}</dd>
    </div>
  );
}
