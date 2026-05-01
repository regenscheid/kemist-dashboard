/**
 * HTTP layer — HSTS observability + a list of security headers
 * with values rendered in mono. Schema-v2 declares `http.hsts` as
 * an open-ended object; we render the keys we find without
 * assuming a fixed shape so the section degrades gracefully when
 * future scanner versions populate more fields.
 */

import type { KemistScanResultSchemaV2 } from "../../data/schema";
import { DetailSection, Field, FieldGrid } from "./DetailSection";

type Props = {
  http: KemistScanResultSchemaV2["http"];
};

export function HttpLayerSection({ http }: Props) {
  if (!http || !http.enabled) {
    return (
      <DetailSection
        id="http"
        title="HTTP layer"
        description="HSTS, preload status, and security headers."
      >
        <p className="text-[13px] italic text-ink-3">
          HTTP layer not probed for this target.
        </p>
      </DetailSection>
    );
  }

  const hstsKv =
    http.hsts && Object.keys(http.hsts).length > 0
      ? (http.hsts as Record<string, unknown>)
      : null;

  const headers = http.security_headers ?? {};
  const headerEntries = Object.entries(headers).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );

  return (
    <DetailSection
      id="http"
      title="HTTP layer"
      description="HSTS, preload status, and security headers observed on the GET / response."
      json={http}
    >
      <FieldGrid>
        <Field
          label="HSTS present"
          value={
            <span className="font-mono text-[12px]">
              {hstsKv ? "yes" : "no"}
            </span>
          }
        />
        {hstsKv &&
          Object.entries(hstsKv).map(([k, v]) => (
            <Field
              key={k}
              label={k.replace(/_/g, " ")}
              value={
                <span className="font-mono text-[12px]">
                  {String(v)}
                </span>
              }
            />
          ))}
        <Field
          label="Preload list status"
          value={
            <span className="font-mono text-[12px]">
              {http.preload_list_status ?? "—"}
            </span>
          }
        />
        {http.preload_list_source && (
          <Field
            label="Preload source"
            value={
              <span className="font-mono text-[12px] text-ink-3">
                {http.preload_list_source}
              </span>
            }
          />
        )}
      </FieldGrid>

      {headerEntries.length > 0 && (
        <div className="mt-5">
          <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-ink-3">
            Security headers
          </h3>
          <ul className="mt-2 space-y-1.5">
            {headerEntries.map(([key, value]) => (
              <li
                key={key}
                className="grid grid-cols-[max-content_1fr] gap-3 border-b border-line-2 pb-1.5 last:border-0"
              >
                <span className="font-mono text-[11px] text-ink-3">
                  {key.replace(/_/g, "-")}
                </span>
                <span className="break-all font-mono text-[11px] text-ink">
                  {typeof value === "string" ? value : JSON.stringify(value)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DetailSection>
  );
}
