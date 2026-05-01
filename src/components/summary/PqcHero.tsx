/**
 * PQC Support hero — one card per cohort. Big percentage, fraction
 * note, three-bucket bar, bucket dl, denominator. The design pairs
 * two of these side-by-side under the Summary tab.
 *
 * Sparkline is omitted for now — the dashboard's data layer only
 * carries the latest scan, not a 12-week timeline. When historical
 * scan data lands, slot a sparkline into the spark slot below.
 */

import { Link } from "@tanstack/react-router";
import type { ThreeBucket } from "../../data/aggregate";
import { SCAN_LIST_LABELS, type ScanList } from "../../data/scanList";
import { ThreeBucketBar } from "../ThreeBucketBar";

type Props = {
  scanList: ScanList;
  bucket: ThreeBucket;
};

export function PqcHero({ scanList, bucket }: Props) {
  const total =
    bucket.affirmative + bucket.explicit_negative + bucket.unknown;
  const pct = total > 0 ? (bucket.affirmative / total) * 100 : 0;
  const label = SCAN_LIST_LABELS[scanList];

  return (
    <article
      className="rounded-lg border border-line bg-surface p-5"
      aria-labelledby={`pqc-hero-${scanList}-title`}
    >
      <header className="flex items-start justify-between gap-4">
        <span
          id={`pqc-hero-${scanList}-title`}
          className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3"
        >
          {label.display}
        </span>
        <Link
          to="/lists/$list/domains"
          params={{ list: scanList }}
          className="font-mono text-[11px] uppercase tracking-[0.05em] text-accent hover:underline"
        >
          browse {label.short} →
        </Link>
      </header>

      <div className="mt-3 flex items-baseline gap-3">
        <span className="font-mono text-[36px] font-semibold leading-none tracking-[-0.02em]">
          {pct.toFixed(1)}%
        </span>
      </div>

      <p className="mt-2 text-[13px] text-ink-2">
        <span className="font-mono">
          {bucket.affirmative.toLocaleString()}
        </span>{" "}
        of{" "}
        <span className="font-mono">{total.toLocaleString()}</span>{" "}
        TLS responding hosts offered PQC KX
      </p>

      <div className="mt-3">
        <ThreeBucketBar bucket={bucket} height={12} />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-x-2 text-[11px]">
        <BucketCell label="offered PQC" count={bucket.affirmative} tone="aff" />
        <BucketCell
          label="did not offer"
          count={bucket.explicit_negative}
          tone="neg"
        />
        <BucketCell label="unknown" count={bucket.unknown} tone="unk" />
      </dl>

      <p className="mt-4 text-[11px] text-ink-3">
        denominator · {bucket.denominator_label}.
      </p>
    </article>
  );
}

const dotClasses: Record<"aff" | "neg" | "unk", string> = {
  aff: "bg-aff",
  neg: "bg-neg",
  unk: "bg-unk",
};

const toneClasses: Record<"aff" | "neg" | "unk", string> = {
  aff: "text-aff-fg",
  neg: "text-neg-fg",
  unk: "text-unk-fg",
};

function BucketCell({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "aff" | "neg" | "unk";
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 uppercase tracking-[0.05em] text-ink-3">
        <span
          aria-hidden="true"
          className={`inline-block h-2 w-2 rounded-full ${dotClasses[tone]}`}
        />
        {label}
      </dt>
      <dd
        className={`mt-1 font-mono text-[13px] font-semibold ${toneClasses[tone]}`}
      >
        {count.toLocaleString()}
      </dd>
    </div>
  );
}
