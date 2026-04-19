/**
 * Summary card that surfaces a single tri-state rate.
 *
 * Pattern A guarantee: all three buckets are visible — never a
 * bare percentage. The denominator label is shown so a screenshot
 * of the card is self-explanatory ("68 of 1,200 supported" is
 * different from "68 of 1,200 TLS 1.3 handshakes support hybrid").
 */

import type { ThreeBucket } from "../../data/aggregate";

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
      className="rounded border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/30"
      role="group"
      aria-label={title}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          {title}
        </h3>
        {pctAffirm !== null && (
          <span className="text-xs text-slate-500">
            {pctAffirm.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mt-2 text-2xl font-semibold">
        {bucket.affirmative.toLocaleString()}
        <span className="text-sm font-normal text-slate-500">
          {" "}
          / {total.toLocaleString()}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-x-2 text-xs">
        <BucketCell
          label="Supported"
          count={bucket.affirmative}
          tone="green"
        />
        <BucketCell
          label="Rejected"
          count={bucket.explicit_negative}
          tone="red"
        />
        <BucketCell label="Unknown" count={bucket.unknown} tone="gray" />
      </dl>
      <p className="mt-2 text-xs text-slate-500">
        Denominator: {bucket.denominator_label}
      </p>
      {caption && (
        <p className="mt-1 text-xs text-slate-500">{caption}</p>
      )}
    </div>
  );
}

const toneClasses: Record<"green" | "red" | "gray", string> = {
  green: "text-green-700 dark:text-green-300",
  red: "text-red-700 dark:text-red-300",
  gray: "text-slate-600 dark:text-slate-400",
};

function BucketCell({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "green" | "red" | "gray";
}) {
  return (
    <div>
      <dt className="uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-0.5 font-semibold ${toneClasses[tone]}`}>
        {count.toLocaleString()}
      </dd>
    </div>
  );
}

/**
 * Compact scalar card — no tri-state; just one count vs total.
 * Used for PQC signature presence where the value is a boolean,
 * not an observation.
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
  return (
    <div
      className="rounded border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/30"
      role="group"
      aria-label={title}
    >
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
        {title}
      </h3>
      <div className="mt-2 text-2xl font-semibold">
        {yes.toLocaleString()}
        <span className="text-sm font-normal text-slate-500">
          {" "}
          / {total.toLocaleString()}
        </span>
      </div>
      {caption && <p className="mt-1 text-xs text-slate-500">{caption}</p>}
    </div>
  );
}
