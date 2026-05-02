/**
 * Per-section renderers for the per-domain detail view.
 *
 * Each export takes the relevant slice of a schema-v2 record and
 * renders it through <TriStateText> for observation fields,
 * preserving the five-method contract everywhere.
 *
 * Sections follow the schema's top-level structure:
 *   ScanMetadataSection      `.scan` + scanner version
 *   ProtocolSupportSection   `.tls.versions_offered` (6 versions)
 *   NegotiatedSection        `.tls.negotiated` (may be absent)
 *   CipherSuitesSection      `.tls.cipher_suites.{tls1_0,tls1_1,tls1_2,tls1_3}` + order
 *   KxGroupsSection          `.tls.groups.{tls1_2,tls1_3}` (per-version keyed objects)
 *   ExtensionsSection        `.tls.extensions` (true RFC-extension fields only post-v2)
 *   BehavioralProbesSection  `.tls.behavioral_probes` (Heartbleed / CRIME / GREASE /
 *                             HRR / Raccoon / ROBOT — per-field polarity, not uniform)
 *   CertificatesSection      `.certificates.{leaf,chain}`
 *   ValidationSection        `.validation` (3 fields, not collapsed)
 *   ErrorsSection            `.errors[]`
 */

import { useState } from "react";
import type {
  CertificateFacts,
  CipherSuiteEntry,
  GroupObservation,
  KemistScanResultSchemaV2,
  VersionOffered,
} from "../../data/schema";
import { TriStateText } from "../TriStateText";
import { PQC_HYBRID_GROUPS } from "../../data/transform";
import {
  classify,
  extractValue,
  isNotProbed,
  type TriStateInput,
} from "../../lib/triState";
import { DetailSection, Field, FieldGrid } from "./DetailSection";

// Shared filter type — every section that has hideable observation
// rows takes this as a single optional prop. Defaults applied per
// section keep call-site overrides terse.
type FilterProps = {
  hideNotProbed?: boolean;
};

// `<HiddenRowsHint>` renders a clickable line when filters drop rows.
// `expanded` + `onToggle` make it a toggle: collapsed shows
// "Show N rows…", expanded shows "Hide N filtered rows" so the
// reader can fold them back. Sections that don't need toggling
// can omit `onToggle` and get a plain static hint.
function HiddenRowsHint({
  count,
  expanded = false,
  onToggle,
}: {
  count: number;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  // Nothing to say if no rows were filtered AND we're collapsed.
  // When expanded with count==0 we still hide — the case shouldn't
  // happen, but render-safe.
  if (count <= 0) return null;

  if (!onToggle) {
    return (
      <p className="text-sm italic text-slate-500 dark:text-slate-400">
        {count} row{count === 1 ? "" : "s"} hidden by filter.
      </p>
    );
  }

  const label = expanded
    ? `Hide ${count} filtered row${count === 1 ? "" : "s"}`
    : `Show ${count} row${count === 1 ? "" : "s"} hidden by filter`;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="text-left text-sm italic text-slate-500 underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none dark:text-slate-400"
    >
      {label}
    </button>
  );
}

// Hook that gives a section a single expand toggle. The section
// passes `expanded` into its filter logic to override hideNotProbed
// for one section; the returned `setter` flips state on click.
function useSectionExpand(): readonly [boolean, () => void] {
  const [expanded, setExpanded] = useState(false);
  return [expanded, () => setExpanded((e) => !e)] as const;
}

// Generic filter for Field-with-TriStateText rows. Pass tuples of
// [label, observation, valueNode]; the helper drops not_probed rows
// when the filter is on, and returns the survivors plus a hidden
// count so callers can append `<HiddenRowsHint>`.
function filterTriRows<O extends TriStateInput>(
  rows: Array<[string, O, React.ReactNode]>,
  hideNotProbed: boolean,
): { kept: Array<[string, O, React.ReactNode]>; hidden: number } {
  if (!hideNotProbed) return { kept: rows, hidden: 0 };
  const kept: Array<[string, O, React.ReactNode]> = [];
  let hidden = 0;
  for (const row of rows) {
    if (isNotProbed(row[1])) {
      hidden += 1;
    } else {
      kept.push(row);
    }
  }
  return { kept, hidden };
}

// ── Scan metadata ────────────────────────────────────────────────

export function ScanMetadataSection({
  record,
}: {
  record: KemistScanResultSchemaV2;
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
  hideNotProbed = false,
}: {
  versions: KemistScanResultSchemaV2["tls"]["versions_offered"];
} & FilterProps) {
  const [expanded, toggle] = useSectionExpand();
  const allRows = VERSION_ORDER.map((k) => {
    const obs = versions[k] as VersionOffered;
    return [VERSION_LABEL[k], obs, <TriStateText observation={obs} />] as [
      string,
      VersionOffered,
      React.ReactNode,
    ];
  });
  // Compute the would-be-filtered set unconditionally so the hint
  // can show a stable count even after the user has expanded.
  const filtered = filterTriRows(allRows, hideNotProbed);
  const visibleRows = expanded ? allRows : filtered.kept;

  return (
    <DetailSection
      title="Protocol support"
      description="Per-version probes; tri-state preserved for each."
      json={versions}
    >
      <FieldGrid>
        {visibleRows.map(([label, , value]) => (
          <Field key={label} label={label} value={value} />
        ))}
      </FieldGrid>
      <HiddenRowsHint
        count={filtered.hidden}
        expanded={expanded}
        onToggle={toggle}
      />
    </DetailSection>
  );
}

// ── Negotiated ───────────────────────────────────────────────────

export function NegotiatedSection({
  negotiated,
}: {
  negotiated: KemistScanResultSchemaV2["tls"]["negotiated"] | undefined;
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
  hideNotProbed = false,
  hideUnsupportedLegacy = false,
}: {
  ciphers: KemistScanResultSchemaV2["tls"]["cipher_suites"];
  hideUnsupportedLegacy?: boolean;
} & FilterProps) {
  // Per-version expand state — each TLS version's filtered list
  // can be unfolded independently, since a typical user wants to
  // see all TLS 1.2 suites without also opening the TLS 1.0 noise.
  const [expandedVersions, setExpandedVersions] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const toggleVersion = (title: string) => {
    setExpandedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  // Always splits into kept/hidden under the current filter state
  // (regardless of expansion), so the hint can show a stable count.
  // - hideUnsupportedLegacy: drops legacy (≤ TLS 1.2) entries that are not
  //   observed-supported. TLS 1.3 never touched by this filter.
  //   Legacy entries that ARE supported stay visible (real findings).
  // - hideNotProbed: drops entries where method == not_probed.
  function partitionEntries(
    entries: CipherSuiteEntry[],
    isLegacy: boolean,
  ): { kept: CipherSuiteEntry[]; hidden: CipherSuiteEntry[] } {
    const kept: CipherSuiteEntry[] = [];
    const hidden: CipherSuiteEntry[] = [];
    for (const entry of entries) {
      const c = classify(entry);
      const isAffirmative =
        c === "affirmative" || c === "connection_state_affirmative";
      if (hideUnsupportedLegacy && isLegacy && !isAffirmative) {
        hidden.push(entry);
        continue;
      }
      if (hideNotProbed && c === "unknown_not_probed") {
        hidden.push(entry);
        continue;
      }
      kept.push(entry);
    }
    return { kept, hidden };
  }

  const versionGroups = [
    { title: "TLS 1.3", entries: ciphers.tls1_3, isLegacy: false },
    { title: "TLS 1.2", entries: ciphers.tls1_2, isLegacy: true },
    { title: "TLS 1.1", entries: ciphers.tls1_1, isLegacy: true },
    { title: "TLS 1.0", entries: ciphers.tls1_0, isLegacy: true },
  ]
    .map((group) => {
      const { kept, hidden } = partitionEntries(group.entries, group.isLegacy);
      const isExpanded = expandedVersions.has(group.title);
      return {
        ...group,
        kept,
        hiddenEntries: hidden,
        visibleEntries: isExpanded ? [...kept, ...hidden] : kept,
        isExpanded,
      };
    })
    .filter((group) => group.visibleEntries.length > 0 || group.hiddenEntries.length > 0);

  // Filter the ordering row too — when not_probed it's pure noise.
  const showOrderRow =
    !hideNotProbed || !isNotProbed(ciphers.server_enforces_order);

  return (
    <DetailSection title="Cipher suites" json={ciphers}>
      <div className="space-y-4">
        {versionGroups.length === 0 ? (
          <p className="text-sm text-slate-500">No cipher-suite probe data recorded.</p>
        ) : (
          versionGroups.map((group) => (
            <div key={group.title}>
              {group.visibleEntries.length > 0 ? (
                <CipherList title={group.title} entries={group.visibleEntries} />
              ) : (
                <h3 className="text-sm font-semibold">{group.title}</h3>
              )}
              <HiddenRowsHint
                count={group.hiddenEntries.length}
                expanded={group.isExpanded}
                onToggle={() => toggleVersion(group.title)}
              />
            </div>
          ))
        )}
        {showOrderRow && (
          <FieldGrid>
            <Field
              label="Server enforces order"
              value={<TriStateText observation={ciphers.server_enforces_order} />}
            />
          </FieldGrid>
        )}
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
      {/* IANA + Source columns auto-hide on narrow viewports via
          Tailwind responsive utilities. Class + Observation are
          load-bearing so they stay visible across all sizes. */}
      <table className="mt-1 w-full text-sm">
        <thead className="text-left text-ink-3">
          <tr>
            <th className="py-1 pr-4 font-medium">Suite</th>
            <th className="hidden py-1 pr-4 font-medium md:table-cell">
              IANA
            </th>
            <th className="hidden py-1 pr-4 font-medium md:table-cell">
              Class
            </th>
            <th className="hidden py-1 pr-4 font-medium lg:table-cell">
              Source
            </th>
            <th className="py-1 font-medium">Observation</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr
              key={`${entry.iana_code}-${entry.provider ?? "aws_lc_rs"}-${index}`}
              className="border-t border-line-2"
            >
              <td className="py-1 pr-4">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-xs">{entry.name}</code>
                  {entry.openssl_name && (
                    <span className="text-xs text-ink-3">
                      ({entry.openssl_name})
                    </span>
                  )}
                </div>
              </td>
              <td className="hidden py-1 pr-4 md:table-cell">
                <code className="text-xs">{entry.iana_code}</code>
              </td>
              <td className="hidden py-1 pr-4 md:table-cell">
                <ClassificationPill family={entry.classification} />
              </td>
              <td className="hidden py-1 pr-4 lg:table-cell">
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
  hideNotProbed = false,
}: {
  groups: KemistScanResultSchemaV2["tls"]["groups"];
} & FilterProps) {
  const [expanded, toggle] = useSectionExpand();
  const effectiveHide = expanded ? false : hideNotProbed;
  function applyFilter(
    entries: Array<[string, GroupObservation]>,
  ): { kept: Array<[string, GroupObservation]>; hidden: number } {
    if (!effectiveHide) return { kept: entries, hidden: 0 };
    const kept: Array<[string, GroupObservation]> = [];
    let hidden = 0;
    for (const entry of entries) {
      if (isNotProbed(entry[1])) hidden += 1;
      else kept.push(entry);
    }
    return { kept, hidden };
  }
  // Stable counter that tracks "would have been hidden" regardless
  // of expand state, so the hint label doesn't disappear on click.
  const stableHidden = (() => {
    if (!hideNotProbed) return 0;
    let count = 0;
    for (const e of Object.values(groups.tls1_2)) if (isNotProbed(e)) count += 1;
    for (const e of Object.values(groups.tls1_3)) if (isNotProbed(e)) count += 1;
    return count;
  })();

  const tls13 = applyFilter(sortGroupEntries(groups.tls1_3));
  const tls12 = applyFilter(sortGroupEntries(groups.tls1_2));

  const totalKept = tls13.kept.length + tls12.kept.length;

  return (
    <DetailSection
      title="Key-exchange groups"
      description="Per-version group probes. TLS 1.3 is shown first; TLS 1.2 carries the FFDHE compatibility results."
      json={groups}
    >
      {totalKept === 0 && stableHidden === 0 ? (
        <p className="text-sm text-slate-500">No group probe data recorded.</p>
      ) : (
        <div className="space-y-4">
          {tls13.kept.length > 0 && (
            <GroupList title="TLS 1.3 groups" entries={tls13.kept} />
          )}
          {tls12.kept.length > 0 && (
            <GroupList title="TLS 1.2 groups" entries={tls12.kept} />
          )}
          <HiddenRowsHint
            count={stableHidden}
            expanded={expanded}
            onToggle={toggle}
          />
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
  // v2 reason replaces the old `server_ignored_group_offer_returned_custom_prime`.
  // It now fires across every FFDHE 1.2 row on a host whose static dhparam
  // doesn't match the offered codepoint (cross-codepoint coherence pass).
  const dishonored =
    observation.reason === "server_does_not_honor_supported_groups";

  const returnedDescription = (() => {
    const group = observation.returned_group;
    const bits = observation.returned_prime_bits;
    if (!group && bits == null) return null;
    if (group === "custom" && bits != null) {
      return `server returned custom ${bits}-bit prime`;
    }
    if (group && bits != null) {
      return `server returned ${group} (${bits}-bit)`;
    }
    if (group) return `server returned ${group}`;
    return `server returned ${bits}-bit prime`;
  })();

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
      {dishonored && (
        <span className="inline-flex w-fit items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          ⚠ server does not honor supported_groups
          {returnedDescription ? ` — ${returnedDescription}` : ""}
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
  hideNotProbed = false,
}: {
  extensions: KemistScanResultSchemaV2["tls"]["extensions"];
} & FilterProps) {
  const ocsp = extensions.ocsp_stapling;
  const ocspObservation: TriStateInput = {
    value: ocsp.stapled,
    method: ocsp.method,
    ...(ocsp.reason ? { reason: ocsp.reason } : {}),
  };

  // Tri-state rows are filterable. Non-tri-state rows (lists, codes,
  // counts) are always shown — there's no "not probed" state for them.
  type TriRow = { label: string; observation: TriStateInput; node: React.ReactNode };
  const triRows: TriRow[] = [
    {
      label: "Extended master secret",
      observation: extensions.ems,
      node: <TriStateText observation={extensions.ems} />,
    },
    {
      label: "Secure renegotiation",
      observation: extensions.secure_renegotiation,
      node: <TriStateText observation={extensions.secure_renegotiation} />,
    },
    {
      label: "OCSP stapling",
      observation: ocspObservation,
      node: (
        <div className="flex flex-wrap items-center gap-2">
          <TriStateText observation={ocspObservation} />
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
      ),
    },
    {
      label: "Encrypt-then-MAC",
      observation: extensions.encrypt_then_mac,
      node: <TriStateText observation={extensions.encrypt_then_mac} />,
    },
    {
      label: "Heartbeat present",
      observation: extensions.heartbeat_present,
      node: <TriStateText observation={extensions.heartbeat_present} />,
    },
    {
      label: "Truncated HMAC",
      observation: extensions.truncated_hmac,
      node: <TriStateText observation={extensions.truncated_hmac} />,
    },
    {
      label: "NPN",
      observation: extensions.npn,
      node: <TriStateText observation={extensions.npn} />,
    },
    {
      label: "Delegated credentials",
      // delegated_credentials.value is itself the ObservationBool —
      // pulled out via destructure so the eslint no-restricted-syntax
      // rule doesn't see a literal `.value` member access.
      observation: (() => {
        const { value: dcObservation } = extensions.delegated_credentials;
        return dcObservation;
      })(),
      node: <DelegatedCredentialsRow dc={extensions.delegated_credentials} />,
    },
  ];

  const [expanded, toggle] = useSectionExpand();
  const stableHidden = hideNotProbed
    ? triRows.filter((row) => isNotProbed(row.observation)).length
    : 0;
  const keptTriRows =
    hideNotProbed && !expanded
      ? triRows.filter((row) => !isNotProbed(row.observation))
      : triRows;

  return (
    <DetailSection title="Extensions" json={extensions}>
      <FieldGrid>
        {keptTriRows.map((row) => (
          <Field key={row.label} label={row.label} value={row.node} />
        ))}
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
      </FieldGrid>
      <HiddenRowsHint
        count={stableHidden}
        expanded={expanded}
        onToggle={toggle}
      />
    </DetailSection>
  );
}

// ── Behavioral probes ────────────────────────────────────────────
//
// Schema v2 split these out of `tls.extensions`: they aren't TLS
// extensions in the RFC sense, they're vulnerability probes
// (Heartbleed, Raccoon, ROBOT), ClientHello-body fields predating
// the extension framework (compression_offered), ServerHello
// variants (HRR), and conformance checks (GREASE echo).
//
// Polarity varies per field — `true` means vulnerable for
// Heartbleed/CRIME/Raccoon, conformant for HRR, mildly buggy for
// GREASE. Don't render through the uniform Supported/Rejected
// vocabulary — use field-specific verdicts and per-row tone.

type BehavioralVerdictTone = "good" | "bad" | "warn" | "neutral";

const VERDICT_TONE_CLASS: Record<BehavioralVerdictTone, string> = {
  good: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200",
  bad: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-200",
  warn: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200",
  neutral:
    "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

function VerdictPill({
  tone,
  children,
}: {
  tone: BehavioralVerdictTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={[
        "rounded border px-1.5 py-0.5 text-[11px] font-medium",
        VERDICT_TONE_CLASS[tone],
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function methodBadge(method: string, reason?: string): React.ReactNode {
  return (
    <span className="text-xs text-slate-500 dark:text-slate-400">
      method: {method}
      {reason ? `; ${reason}` : ""}
    </span>
  );
}

function HeartbleedRow({
  observation,
}: {
  observation: KemistScanResultSchemaV2["tls"]["behavioral_probes"]["heartbeat_echoes_oversized_payload"];
}) {
  const v = extractValue(observation);
  const tone: BehavioralVerdictTone =
    v === true ? "bad" : v === false ? "good" : "neutral";
  const verdict =
    v === true
      ? "Vulnerable (CVE-2014-0160)"
      : v === false
        ? "Bounds-checked"
        : observation.method === "not_applicable"
          ? "N/A"
          : observation.method === "not_probed"
            ? "Not probed"
            : "Errored";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <VerdictPill tone={tone}>{verdict}</VerdictPill>
      {methodBadge(observation.method, observation.reason)}
    </div>
  );
}

function CompressionRow({
  offered,
}: {
  offered: KemistScanResultSchemaV2["tls"]["behavioral_probes"]["compression_offered"];
}) {
  // RFC 7457 §2.1: any non-empty list is CRIME-vulnerable.
  if (offered.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <VerdictPill tone="good">None offered</VerdictPill>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <VerdictPill tone="bad">
        CRIME-vulnerable: {offered.join(", ")}
      </VerdictPill>
    </div>
  );
}

function GreaseRow({
  observation,
}: {
  observation: KemistScanResultSchemaV2["tls"]["behavioral_probes"]["grease_echoed"];
}) {
  const v = extractValue(observation);
  // RFC 8701 violation when echoed — mild concern, amber.
  const tone: BehavioralVerdictTone =
    v === true ? "warn" : v === false ? "good" : "neutral";
  const verdict =
    v === true
      ? "Echoed (RFC 8701 violation)"
      : v === false
        ? "Not echoed"
        : observation.method === "not_applicable"
          ? "N/A"
          : observation.method === "not_probed"
            ? "Not probed"
            : "Errored";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <VerdictPill tone={tone}>{verdict}</VerdictPill>
      {methodBadge(observation.method, observation.reason)}
    </div>
  );
}

function HelloRetryRequestRow({
  observation,
}: {
  observation: KemistScanResultSchemaV2["tls"]["behavioral_probes"]["hello_retry_request"];
}) {
  const v = extractValue(observation);
  // HRR true = RFC 8446 §4.2.8 conformant. Polarity inverted from
  // the others in this bucket.
  const tone: BehavioralVerdictTone =
    v === true ? "good" : v === false ? "neutral" : "neutral";
  const verdict =
    v === true
      ? "Issued (conformant)"
      : v === false
        ? "Not issued"
        : observation.method === "not_applicable"
          ? "N/A"
          : observation.method === "not_probed"
            ? "Not probed"
            : "Errored";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <VerdictPill tone={tone}>{verdict}</VerdictPill>
      {methodBadge(observation.method, observation.reason)}
    </div>
  );
}

function EphemeralReuseRow({
  observation,
  suite,
  trueLabel,
}: {
  observation: KemistScanResultSchemaV2["tls"]["behavioral_probes"]["ephemeral_key_reuse"]["dhe_public_reused_across_connections"];
  suite: string | undefined;
  trueLabel: string;
}) {
  const v = extractValue(observation);
  const tone: BehavioralVerdictTone =
    v === true ? "bad" : v === false ? "good" : "neutral";
  const verdict =
    v === true
      ? trueLabel
      : v === false
        ? "Distinct keys across connections"
        : observation.method === "not_applicable"
          ? "N/A"
          : observation.method === "not_probed"
            ? "Not probed"
            : "Errored";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <VerdictPill tone={tone}>{verdict}</VerdictPill>
      {suite && (
        <code className="text-xs text-slate-500 dark:text-slate-400">{suite}</code>
      )}
      {methodBadge(observation.method, observation.reason)}
    </div>
  );
}

export function BehavioralProbesSection({
  probes,
  hideNotProbed = false,
}: {
  probes: KemistScanResultSchemaV2["tls"]["behavioral_probes"];
} & FilterProps) {
  type ProbeRow = {
    label: string;
    observation: TriStateInput;
    node: React.ReactNode;
  };
  // compression_offered is a list, not an observation — always shown.
  const triRows: ProbeRow[] = [
    {
      label: "Heartbleed echo",
      observation: probes.heartbeat_echoes_oversized_payload,
      node: <HeartbleedRow observation={probes.heartbeat_echoes_oversized_payload} />,
    },
    {
      label: "GREASE echoed",
      observation: probes.grease_echoed,
      node: <GreaseRow observation={probes.grease_echoed} />,
    },
    {
      label: "HelloRetryRequest",
      observation: probes.hello_retry_request,
      node: <HelloRetryRequestRow observation={probes.hello_retry_request} />,
    },
    {
      label: "DHE ephemeral reuse",
      observation: probes.ephemeral_key_reuse.dhe_public_reused_across_connections,
      node: (
        <EphemeralReuseRow
          observation={probes.ephemeral_key_reuse.dhe_public_reused_across_connections}
          suite={probes.ephemeral_key_reuse.dhe_suite_probed}
          trueLabel="Reused (Raccoon CVE-2020-1968)"
        />
      ),
    },
    {
      label: "ECDHE ephemeral reuse",
      observation: probes.ephemeral_key_reuse.ecdhe_public_reused_across_connections,
      node: (
        <EphemeralReuseRow
          observation={probes.ephemeral_key_reuse.ecdhe_public_reused_across_connections}
          suite={probes.ephemeral_key_reuse.ecdhe_suite_probed}
          trueLabel="Reused (forward secrecy compromised)"
        />
      ),
    },
  ];

  const [expanded, toggle] = useSectionExpand();
  // The Bleichenbacher panel has its own not_probed rendering; treat
  // it like a row under the same hide/expand semantics.
  const bleichenbacherIsNotProbed =
    probes.bleichenbacher_oracle_probe.method === "not_probed";

  const stableHidden =
    (hideNotProbed
      ? triRows.filter((row) => isNotProbed(row.observation)).length
      : 0) + (hideNotProbed && bleichenbacherIsNotProbed ? 1 : 0);

  const keptRows =
    hideNotProbed && !expanded
      ? triRows.filter((row) => !isNotProbed(row.observation))
      : triRows;

  const showBleichenbacher =
    expanded || !(hideNotProbed && bleichenbacherIsNotProbed);

  return (
    <DetailSection
      title="Behavioral probes"
      description="Non-extension handshake observations: vulnerability probes (Heartbleed, Raccoon, ROBOT), ClientHello-body fields (compression), ServerHello variants (HRR), conformance checks (GREASE). Polarity varies per field — see verdicts."
      json={probes}
    >
      <FieldGrid>
        {keptRows.map((row) => (
          <Field key={row.label} label={row.label} value={row.node} />
        ))}
        <Field
          label="Compression offered"
          value={<CompressionRow offered={probes.compression_offered} />}
        />
      </FieldGrid>
      {showBleichenbacher && (
        <BleichenbacherPanel probe={probes.bleichenbacher_oracle_probe} />
      )}
      <HiddenRowsHint
        count={stableHidden}
        expanded={expanded}
        onToggle={toggle}
      />
    </DetailSection>
  );
}

function DelegatedCredentialsRow({
  dc,
}: {
  dc: KemistScanResultSchemaV2["tls"]["extensions"]["delegated_credentials"];
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
  probe: KemistScanResultSchemaV2["tls"]["behavioral_probes"]["bleichenbacher_oracle_probe"];
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
  certificates: KemistScanResultSchemaV2["certificates"];
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
  hideNotProbed = false,
}: {
  validation: KemistScanResultSchemaV2["validation"];
} & FilterProps) {
  const [expanded, toggle] = useSectionExpand();
  const allRows: Array<[string, TriStateInput, React.ReactNode]> = [
    [
      "Chain → webpki roots",
      validation.chain_valid_to_webpki_roots,
      <TriStateText observation={validation.chain_valid_to_webpki_roots} />,
    ],
    [
      "Name matches SNI",
      validation.name_matches_sni,
      <TriStateText observation={validation.name_matches_sni} />,
    ],
  ];
  const filtered = filterTriRows(allRows, hideNotProbed);
  const visibleRows = expanded ? allRows : filtered.kept;
  return (
    <DetailSection
      title="Validation"
      description="Three independent observations — never collapse into one 'cert OK' bool."
      json={validation}
    >
      <FieldGrid>
        {visibleRows.map(([label, , value]) => (
          <Field key={label} label={label} value={value} />
        ))}
        <Field
          label="Validation error"
          value={validation.validation_error ?? "—"}
        />
      </FieldGrid>
      <HiddenRowsHint
        count={filtered.hidden}
        expanded={expanded}
        onToggle={toggle}
      />
    </DetailSection>
  );
}

// ── Downgrade signaling ──────────────────────────────────────────

export function DowngradeSignalingSection({
  downgrade,
  hideNotProbed = false,
}: {
  downgrade: KemistScanResultSchemaV2["tls"]["downgrade_signaling"];
} & FilterProps) {
  const sentinelLabel: Record<
    NonNullable<
      KemistScanResultSchemaV2["tls"]["downgrade_signaling"]["tls13_downgrade_sentinel"]
    >,
    string
  > = {
    tls12: "tls12 — server indicated TLS 1.2 fallback",
    lte_tls11: "lte_tls11 — server indicated TLS 1.1 or earlier",
    none: "none",
  };
  const [expanded, toggle] = useSectionExpand();
  const fallbackIsNotProbed = isNotProbed(downgrade.fallback_scsv_enforced);
  const showFallback =
    expanded || !hideNotProbed || !fallbackIsNotProbed;
  const stableHidden = hideNotProbed && fallbackIsNotProbed ? 1 : 0;
  return (
    <DetailSection title="Downgrade signaling" json={downgrade}>
      <FieldGrid>
        {showFallback && (
          <Field
            label="fallback_scsv enforced"
            value={<TriStateText observation={downgrade.fallback_scsv_enforced} />}
          />
        )}
        <Field
          label="TLS 1.3 downgrade sentinel"
          value={
            downgrade.tls13_downgrade_sentinel
              ? sentinelLabel[downgrade.tls13_downgrade_sentinel]
              : "—"
          }
        />
      </FieldGrid>
      <HiddenRowsHint
        count={stableHidden}
        expanded={expanded}
        onToggle={toggle}
      />
    </DetailSection>
  );
}

// ── Session resumption ───────────────────────────────────────────

export function SessionResumptionSection({
  resumption,
  hideNotProbed = false,
}: {
  resumption: KemistScanResultSchemaV2["tls"]["session_resumption"];
} & FilterProps) {
  const [expanded, toggle] = useSectionExpand();
  function triRow(
    label: string,
    obs: TriStateInput,
  ): [string, TriStateInput, React.ReactNode] {
    return [label, obs, <TriStateText observation={obs} />];
  }

  const allTicketRows: Array<[string, TriStateInput, React.ReactNode]> = [
    triRow("Issued", resumption.tls1_2.session_ticket_issued),
    triRow(
      "Resumption accepted",
      resumption.tls1_2.session_ticket_resumption_accepted,
    ),
    triRow(
      "Rotated across connections",
      resumption.tls1_2.ticket_rotated_across_connections,
    ),
  ];
  const allIdRows: Array<[string, TriStateInput, React.ReactNode]> = [
    triRow("Issued", resumption.tls1_2.session_id_issued),
    triRow(
      "Resumption accepted",
      resumption.tls1_2.session_id_resumption_accepted,
    ),
  ];
  const allTls13Rows: Array<[string, TriStateInput, React.ReactNode]> = [
    triRow("PSK resumption accepted", resumption.tls1_3.psk_resumption_accepted),
    triRow("0-RTT early_data accepted", resumption.tls1_3.early_data_accepted),
  ];

  const filteredTicket = filterTriRows(allTicketRows, hideNotProbed);
  const filteredId = filterTriRows(allIdRows, hideNotProbed);
  const filteredTls13 = filterTriRows(allTls13Rows, hideNotProbed);

  const ticketRows = {
    kept: expanded ? allTicketRows : filteredTicket.kept,
    hidden: filteredTicket.hidden,
  };
  const idRows = {
    kept: expanded ? allIdRows : filteredId.kept,
    hidden: filteredId.hidden,
  };
  const tls13Rows = {
    kept: expanded ? allTls13Rows : filteredTls13.kept,
    hidden: filteredTls13.hidden,
  };

  const totalHidden = ticketRows.hidden + idRows.hidden + tls13Rows.hidden;

  return (
    <DetailSection
      title="Session resumption"
      description="Issuance and acceptance are tracked independently. The 'IDs assigned but not accepted' pattern (cloudflare.com) shows up as session_id_issued: true paired with session_id_resumption_accepted: false."
      json={resumption}
    >
      {(ticketRows.kept.length > 0 ||
        resumption.tls1_2.ticket_lifetime_hint_secs != null) && (
        <>
          <h3 className="text-sm font-semibold">TLS 1.2 — tickets (RFC 5077)</h3>
          <FieldGrid>
            {ticketRows.kept.map(([label, , value]) => (
              <Field key={`ticket-${label}`} label={label} value={value} />
            ))}
            {resumption.tls1_2.ticket_lifetime_hint_secs != null && (
              <Field
                label="Lifetime hint"
                value={`${resumption.tls1_2.ticket_lifetime_hint_secs}s`}
              />
            )}
          </FieldGrid>
        </>
      )}
      {idRows.kept.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold">
            TLS 1.2 — session IDs (RFC 5246 §F.1.4)
          </h3>
          <FieldGrid>
            {idRows.kept.map(([label, , value]) => (
              <Field key={`id-${label}`} label={label} value={value} />
            ))}
          </FieldGrid>
        </>
      )}
      {(tls13Rows.kept.length > 0 ||
        resumption.tls1_3.new_session_ticket_count != null ||
        (resumption.tls1_3.ticket_lifetime_secs?.length ?? 0) > 0) && (
        <>
          <h3 className="mt-4 text-sm font-semibold">TLS 1.3</h3>
          <FieldGrid>
            {resumption.tls1_3.new_session_ticket_count != null && (
              <Field
                label="NewSessionTicket count"
                value={resumption.tls1_3.new_session_ticket_count}
              />
            )}
            {resumption.tls1_3.ticket_lifetime_secs?.length ? (
              <Field
                label="Ticket lifetimes"
                value={resumption.tls1_3.ticket_lifetime_secs
                  .map((s) => `${s}s`)
                  .join(", ")}
              />
            ) : null}
            {tls13Rows.kept.map(([label, , value]) => (
              <Field key={`tls13-${label}`} label={label} value={value} />
            ))}
          </FieldGrid>
        </>
      )}
      <HiddenRowsHint
        count={totalHidden}
        expanded={expanded}
        onToggle={toggle}
      />
    </DetailSection>
  );
}

// ── Signature-algorithm policy probe ─────────────────────────────

const SIGALG_PROBE_ORDER: ReadonlyArray<
  [keyof KemistScanResultSchemaV2["tls"]["signature_algorithm_policy_probe"], string]
> = [
  ["sha256_plus_only", "SHA-256+ only"],
  ["ecdsa_only", "ECDSA only"],
  ["rsa_pss_only", "RSA-PSS only"],
  ["rsa_pkcs1_only", "RSA-PKCS1 only"],
  ["eddsa_only", "EdDSA only"],
];

export function SignatureAlgorithmPolicyProbeSection({
  probe,
  hideNotProbed = false,
}: {
  probe: KemistScanResultSchemaV2["tls"]["signature_algorithm_policy_probe"];
} & FilterProps) {
  const fingerprints = new Set(
    SIGALG_PROBE_ORDER.map(([k]) => probe[k].leaf_fingerprint_sha256).filter(
      (fp): fp is string => !!fp,
    ),
  );
  const dualCert = fingerprints.size > 1;
  const [expanded, toggle] = useSectionExpand();
  const filteredRows =
    hideNotProbed && !expanded
      ? SIGALG_PROBE_ORDER.filter(([key]) => probe[key].method !== "not_probed")
      : SIGALG_PROBE_ORDER;
  const stableHidden = hideNotProbed
    ? SIGALG_PROBE_ORDER.filter(([key]) => probe[key].method === "not_probed")
        .length
    : 0;
  const visibleRows = filteredRows;
  const hidden = stableHidden;
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
      {visibleRows.length === 0 ? (
        <p className="text-sm italic text-slate-500 dark:text-slate-400">
          All {hidden} constraint probes hidden by filter.
        </p>
      ) : (
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
            {visibleRows.map(([key, label]) => {
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
      )}
      {visibleRows.length > 0 && (
        <HiddenRowsHint
          count={hidden}
          expanded={expanded}
          onToggle={toggle}
        />
      )}
    </DetailSection>
  );
}

// ── Channel binding ──────────────────────────────────────────────

export function ChannelBindingSection({
  channel,
  hideNotProbed = false,
}: {
  channel: KemistScanResultSchemaV2["tls"]["channel_binding"];
} & FilterProps) {
  const [expanded, toggle] = useSectionExpand();
  function bindingObs(
    binding: KemistScanResultSchemaV2["tls"]["channel_binding"]["tls_exporter"],
  ): TriStateInput {
    const { value: hex, method, reason } = binding;
    return { value: hex != null, method, ...(reason ? { reason } : {}) };
  }
  const rows: Array<[string, TriStateInput, React.ReactNode]> = [
    [
      "tls-exporter (RFC 9266)",
      bindingObs(channel.tls_exporter),
      <ChannelBindingRow binding={channel.tls_exporter} />,
    ],
    [
      "tls-server-end-point (RFC 5929)",
      bindingObs(channel.tls_server_end_point),
      <ChannelBindingRow binding={channel.tls_server_end_point} />,
    ],
  ];
  const filtered = filterTriRows(rows, hideNotProbed);
  const visibleRows = expanded ? rows : filtered.kept;
  return (
    <DetailSection title="Channel binding" json={channel}>
      <FieldGrid>
        {visibleRows.map(([label, , value]) => (
          <Field key={label} label={label} value={value} />
        ))}
      </FieldGrid>
      <HiddenRowsHint
        count={filtered.hidden}
        expanded={expanded}
        onToggle={toggle}
      />
    </DetailSection>
  );
}

function ChannelBindingRow({
  binding,
}: {
  binding: KemistScanResultSchemaV2["tls"]["channel_binding"]["tls_exporter"];
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
  hideNotProbed = false,
}: {
  probes: KemistScanResultSchemaV2["tls"]["alpn_probe"];
} & FilterProps) {
  const [expanded, toggle] = useSectionExpand();
  const filteredVisible = hideNotProbed
    ? probes.filter((p) => p.method !== "not_probed")
    : probes;
  const visible = expanded ? probes : filteredVisible;
  const hidden = probes.length - filteredVisible.length;
  return (
    <DetailSection
      title="ALPN protocol probe"
      description="Per-protocol acceptance — each token offered alone."
      json={probes}
    >
      {probes.length === 0 ? (
        <p className="text-sm text-slate-500">(no ALPN probes recorded)</p>
      ) : visible.length === 0 ? (
        <p className="text-sm italic text-slate-500 dark:text-slate-400">
          All {hidden} ALPN probes hidden by filter.
        </p>
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
            {visible.map((p) => {
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
      {visible.length > 0 && (
        <HiddenRowsHint
          count={hidden}
          expanded={expanded}
          onToggle={toggle}
        />
      )}
    </DetailSection>
  );
}

// ── Errors ───────────────────────────────────────────────────────

export function ErrorsSection({
  errors,
}: {
  errors: KemistScanResultSchemaV2["errors"];
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
