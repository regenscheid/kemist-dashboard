/**
 * Stat card — single tri-state rate. Three buckets visible (never a
 * bare percentage), denominator stated, oklch tokens.
 */

import type { ThreeBucket } from "../../data/aggregate";
import { ThreeBucketBar } from "../ThreeBucketBar";

type Props = {
  title: string;
  bucket: ThreeBucket;
  /** Optional helper text displayed below the counts. */
  caption?: string;
};

export function ThreeBucketStat({ title, bucket, caption }: Props) {
  const total =
    bucket.affirmative + bucket.explicit_negative + bucket.unknown;
  const pctAffirm = total > 0 ? (bucket.affirmative / total) * 100 : null;
  return (
    <div
      className="rounded-md border border-line bg-surface p-4"
      role="group"
      aria-label={title}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">
          {title}
        </h3>
        {pctAffirm !== null && (
          <span className="font-mono text-[12px] text-ink-2">
            {pctAffirm.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.01em]">
        {bucket.affirmative.toLocaleString()}
        <span className="ml-1 text-sm font-normal text-ink-3">
          / {total.toLocaleString()}
        </span>
      </div>
      <div className="mt-3">
        <ThreeBucketBar bucket={bucket} height={8} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-x-2 text-[11px]">
        <BucketCell label="supported" count={bucket.affirmative} tone="aff" />
        <BucketCell
          label="rejected"
          count={bucket.explicit_negative}
          tone="neg"
        />
        <BucketCell label="unknown" count={bucket.unknown} tone="unk" />
      </dl>
      <p className="mt-3 text-[11px] text-ink-3">
        denominator · {bucket.denominator_label}
      </p>
      {caption && <p className="mt-1 text-[11px] text-ink-3">{caption}</p>}
    </div>
  );
}

const toneClasses: Record<"aff" | "neg" | "unk", string> = {
  aff: "text-aff-fg",
  neg: "text-neg-fg",
  unk: "text-unk-fg",
};

const dotClasses: Record<"aff" | "neg" | "unk", string> = {
  aff: "bg-aff",
  neg: "bg-neg",
  unk: "bg-unk",
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
      <dd className={`mt-1 font-mono text-[13px] font-semibold ${toneClasses[tone]}`}>
        {count.toLocaleString()}
      </dd>
    </div>
  );
}

/**
 * Compact scalar card — no tri-state; just one count vs total. Used
 * for PQC signature presence where the value is a boolean, not an
 * observation.
 */
export function ScalarStat({
  title,
  yes,
  no,
  caption,
}: {
  title: string;
  yes: number;
  no: number;
  caption?: string;
}) {
  const total = yes + no;
  const pctYes = total > 0 ? (yes / total) * 100 : null;
  return (
    <div
      className="rounded-md border border-line bg-surface p-4"
      role="group"
      aria-label={title}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">
          {title}
        </h3>
        {pctYes !== null && (
          <span className="font-mono text-[12px] text-ink-2">
            {pctYes.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.01em]">
        {yes.toLocaleString()}
        <span className="ml-1 text-sm font-normal text-ink-3">
          / {total.toLocaleString()}
        </span>
      </div>
      {caption && <p className="mt-2 text-[11px] text-ink-3">{caption}</p>}
    </div>
  );
}
