/**
 * Versions strip — chiclets for each TLS version probed.
 * Each chiclet is colored by its tri-state observation (aff/neg/unk)
 * and labeled with the human protocol name.
 *
 * Honors the page-level "hide unknown" toggle by suppressing chiclets
 * that classify as unk.
 */

import { triPillClass, type TriStateInput } from "../../lib/triState";
import type { KemistScanResultSchemaV2, VersionOffered } from "../../data/schema";

const VERSION_ORDER = [
  "tls1_3",
  "tls1_2",
  "tls1_1",
  "tls1_0",
  "ssl3",
  "ssl2",
] as const;

const VERSION_LABEL: Record<(typeof VERSION_ORDER)[number], string> = {
  tls1_3: "TLS 1.3",
  tls1_2: "TLS 1.2",
  tls1_1: "TLS 1.1",
  tls1_0: "TLS 1.0",
  ssl3: "SSL 3.0",
  ssl2: "SSL 2.0",
};

const TONE: Record<"aff" | "neg" | "unk", string> = {
  aff: "border-aff/40 bg-aff-bg text-aff-fg",
  neg: "border-neg/40 bg-neg-bg text-neg-fg",
  unk: "border-line bg-surface-2 text-ink-3",
};

const PILL_LABEL: Record<"aff" | "neg" | "unk", string> = {
  aff: "supported",
  neg: "rejected",
  unk: "unknown",
};

type Props = {
  versions: KemistScanResultSchemaV2["tls"]["versions_offered"];
  hideUnknown?: boolean;
};

export function VersionsStrip({ versions, hideUnknown = false }: Props) {
  const items = VERSION_ORDER.map((k) => {
    const obs = versions[k] as VersionOffered | undefined;
    return obs
      ? { key: k, label: VERSION_LABEL[k], obs: obs as TriStateInput }
      : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  const visible = hideUnknown
    ? items.filter((it) => triPillClass(it.obs) !== "unk")
    : items;

  if (visible.length === 0) {
    return (
      <p className="text-[12px] italic text-ink-3">
        No version probes to show. Toggle "Hide unknown" off to inspect not-probed entries.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
      {visible.map((it) => {
        const cls = triPillClass(it.obs);
        return (
          <div
            key={it.key}
            className={`flex flex-col items-stretch rounded-md border px-3 py-2 text-center ${TONE[cls]}`}
            title={it.obs.reason ?? PILL_LABEL[cls]}
          >
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.05em]">
              {PILL_LABEL[cls]}
            </span>
            <span className="mt-1 text-[14px] font-semibold">
              {it.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
