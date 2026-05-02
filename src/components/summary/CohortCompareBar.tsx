/**
 * Side-by-side cohort comparison row. Renders one row per cohort
 * showing the same metric — useful for "X negotiated" or "X
 * supported" questions where the contrast between cohorts is the
 * point. Used under section headers in the Summary view.
 */

import type { ThreeBucket } from "../../data/aggregate";
import { SCAN_LIST_LABELS, type ScanList } from "../../data/scanList";
import { ThreeBucketBar } from "../ThreeBucketBar";

type CohortRow = {
  scanList: ScanList;
  bucket: ThreeBucket;
};

type Props = {
  rows: CohortRow[];
};

export function CohortCompareBar({ rows }: Props) {
  return (
    <div className="space-y-3">
      {rows.map(({ scanList, bucket }) => {
        const total =
          bucket.affirmative + bucket.explicit_negative + bucket.unknown;
        const pct = total > 0 ? (bucket.affirmative / total) * 100 : 0;
        return (
          <div
            key={scanList}
            // Stack vertically on phones (label, bar, numbers); switch
            // to a three-column grid at md so the wider bar gets
            // breathing room. Below md the side columns squeeze the
            // 1fr middle to ~0px and the bar collapses.
            className="grid grid-cols-1 items-center gap-2 md:grid-cols-[180px_1fr_180px] md:gap-4"
          >
            <div className="text-[13px]">
              {SCAN_LIST_LABELS[scanList].display}
            </div>
            <ThreeBucketBar bucket={bucket} height={14} />
            <div className="flex items-baseline justify-start gap-3 font-mono text-[12px] md:justify-end">
              <span className="font-semibold">{pct.toFixed(1)}%</span>
              <span className="text-ink-3">
                {bucket.affirmative.toLocaleString()} /{" "}
                {total.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
