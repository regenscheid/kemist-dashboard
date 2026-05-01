/**
 * Horizontal stacked bar showing aff / neg / unk shares of a
 * tri-state observation. Used in stat cards, the PQC hero, and the
 * Summary cohort-comparison rows. Reads the design's oklch tokens
 * directly so the palette stays coherent with the TriPill.
 */

import type { ThreeBucket } from "../data/aggregate";

type Props = {
  bucket: ThreeBucket;
  /** Bar height in px. Default: 8 (matches the prototype's stat-card bar). */
  height?: number;
  /** Optional aria-label override. */
  ariaLabel?: string;
};

export function ThreeBucketBar({ bucket, height = 8, ariaLabel }: Props) {
  const total =
    bucket.affirmative + bucket.explicit_negative + bucket.unknown;

  const aff = total > 0 ? (bucket.affirmative / total) * 100 : 0;
  const neg = total > 0 ? (bucket.explicit_negative / total) * 100 : 0;
  const unk = total > 0 ? (bucket.unknown / total) * 100 : 0;

  const label =
    ariaLabel ??
    `${bucket.affirmative.toLocaleString()} affirmative, ${bucket.explicit_negative.toLocaleString()} negative, ${bucket.unknown.toLocaleString()} unknown of ${total.toLocaleString()} ${bucket.denominator_label}`;

  return (
    <div
      role="img"
      aria-label={label}
      className="flex w-full overflow-hidden rounded-sm bg-line-2"
      style={{ height }}
    >
      {aff > 0 && (
        <div
          className="bg-aff"
          style={{ width: `${aff}%` }}
          title={`${bucket.affirmative.toLocaleString()} (${aff.toFixed(1)}%)`}
        />
      )}
      {neg > 0 && (
        <div
          className="bg-neg"
          style={{ width: `${neg}%` }}
          title={`${bucket.explicit_negative.toLocaleString()} (${neg.toFixed(1)}%)`}
        />
      )}
      {unk > 0 && (
        <div
          className="bg-unk"
          style={{ width: `${unk}%` }}
          title={`${bucket.unknown.toLocaleString()} (${unk.toFixed(1)}%)`}
        />
      )}
    </div>
  );
}
