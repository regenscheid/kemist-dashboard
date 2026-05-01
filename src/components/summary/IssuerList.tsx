/**
 * Top-N certificate issuers, rendered as horizontal bars. Pure
 * compositional component — no charting library — so the row
 * proportions stay legible at narrow widths.
 */

type Props = {
  /** Issuer-name → record count, as emitted in `aggregates.cert_issuers`. */
  issuers: Record<string, number>;
  /** How many rows to show. Default 10 to match the design. */
  limit?: number;
};

export function IssuerList({ issuers, limit = 10 }: Props) {
  const rows = Object.entries(issuers)
    .map(([issuer, count]) => ({ issuer, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  if (rows.length === 0) {
    return (
      <p className="text-[12px] italic text-ink-3">
        No issuers observed in this scan.
      </p>
    );
  }

  const max = rows[0]?.count ?? 1;

  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div
          key={r.issuer}
          className="grid grid-cols-[1fr_minmax(80px,180px)_60px] items-center gap-3 text-[12px]"
        >
          <div className="truncate" title={r.issuer}>
            {r.issuer}
          </div>
          <div className="h-2 overflow-hidden rounded-sm bg-line-2">
            <div
              className="h-full bg-accent-2"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
          <div className="text-right font-mono text-[11px] text-ink-2">
            {r.count.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
