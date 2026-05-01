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
            className="grid grid-cols-[200px_1fr_200px] items-center gap-4"
          >
            <div className="text-[13px]">
              {SCAN_LIST_LABELS[scanList].display}
            </div>
            <ThreeBucketBar bucket={bucket} height={14} />
            <div className="flex items-baseline justify-end gap-3 font-mono text-[12px]">
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
