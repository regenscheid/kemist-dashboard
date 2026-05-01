/**
 * Validation section — multi-trust-store chain validation, plus
 * `name_matches_sni` rendered as a separate row beneath the table
 * inside the same section. The `webpki` field is populated from
 * Mozilla's CCADB list — surface as "mozilla roots" per the design.
 */

import type { KemistScanResultSchemaV2 } from "../../data/schema";
import { TriState } from "../TriState";
import { methodLabel } from "../../lib/triState";
import { DetailSection } from "./DetailSection";
import { partitionRows, type ObsRow } from "./obsTableHelpers";

type Props = {
  validation: KemistScanResultSchemaV2["validation"];
  hideUnknown?: boolean;
};

const TRUST_STORE_LABELS: Array<{
  field: keyof KemistScanResultSchemaV2["validation"];
  label: string;
  /** Which key in `per_store_validation_errors` carries this store's error. */
  errorKey: string;
}> = [
  {
    field: "chain_valid_to_webpki_roots",
    label: "mozilla roots",
    errorKey: "webpki",
  },
  {
    field: "chain_valid_to_microsoft_roots",
    label: "microsoft roots",
    errorKey: "microsoft",
  },
  {
    field: "chain_valid_to_apple_roots",
    label: "apple roots",
    errorKey: "apple",
  },
  {
    field: "chain_valid_to_us_fpki_common_roots",
    label: "US Federal PKI Common",
    errorKey: "us_fpki_common",
  },
  {
    field: "chain_valid_to_us_dod_roots",
    label: "US DoD roots",
    errorKey: "us_dod",
  },
];

export function ValidationSection({ validation, hideUnknown = false }: Props) {
  const rows: ObsRow[] = TRUST_STORE_LABELS.map(({ field, label, errorKey }) => {
    const obs = validation[field] as ObsRow["observation"];
    const errReason =
      validation.per_store_validation_errors?.[errorKey] ?? undefined;
    return {
      label,
      observation: obs,
      detail: errReason ?? obs.reason ?? "—",
    };
  });

  const { kept, hidden } = partitionRows(rows, hideUnknown);

  return (
    <DetailSection
      id="validation"
      title="Validation"
      description="Per-trust-store chain validation. Tri-state per store."
      json={validation}
    >
      <table
        className="w-full border-separate border-spacing-0 text-[12px]"
        style={{ tableLayout: "fixed" }}
      >
        <colgroup>
          <col style={{ width: "30%" }} />
          <col style={{ width: "22%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "30%" }} />
        </colgroup>
        <thead>
          <tr>
            <Th>Trust store</Th>
            <Th>Result</Th>
            <Th>Method</Th>
            <Th>Reason</Th>
          </tr>
        </thead>
        <tbody>
          {kept.map((row) => (
            <tr key={row.label}>
              <Td>{row.label}</Td>
              <Td>
                <TriState observation={row.observation} compact />
              </Td>
              <Td>
                <span className="font-mono text-[11px] text-ink-2">
                  {methodLabel(row.observation.method)}
                </span>
              </Td>
              <Td>
                <span className="font-mono text-[11px] text-ink-2">
                  {row.detail ?? "—"}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>

      {hidden > 0 && (
        <p className="mt-2 text-[11px] italic text-ink-3">
          {hidden} row{hidden === 1 ? "" : "s"} hidden by "Hide unknown" toggle.
        </p>
      )}

      {/* "Name matches SNI" lives inside this section but is rendered
          beneath the trust-store table — not a row inside it. */}
      <div className="mt-4 rounded-md border border-line bg-surface-2 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-ink-3">
              Name matches SNI
            </span>
          </div>
          <TriState observation={validation.name_matches_sni} compact />
          <span className="font-mono text-[11px] text-ink-2">
            {methodLabel(validation.name_matches_sni.method)}
          </span>
        </div>
        {validation.name_matches_sni.reason && (
          <p className="mt-1 font-mono text-[11px] text-ink-3">
            {validation.name_matches_sni.reason}
          </p>
        )}
      </div>

      {validation.validation_error && (
        <p className="mt-3 font-mono text-[11px] text-neg-fg">
          validation_error: {validation.validation_error}
        </p>
      )}
    </DetailSection>
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
