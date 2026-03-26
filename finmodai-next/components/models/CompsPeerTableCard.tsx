type CompsPeerRow = {
  ticker?: string | null;
  name?: string | null;
  price?: number | null;
  marketCap?: number | null;
  enterpriseValue?: number | null;
  revenue?: number | null;
  ebitda?: number | null;
  evToRevenue?: number | null;
  evToEbitda?: number | null;
};

type CompsPeerTableCardProps = {
  peers: CompsPeerRow[];
};

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatMoney(value: number | null): string {
  if (value === null) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMultiple(value: number | null): string {
  if (value === null) return 'N/A';
  return `${value.toFixed(2)}x`;
}

function quartile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function buildOutlierSet(peers: CompsPeerRow[], key: 'evToRevenue' | 'evToEbitda'): Set<string> {
  const values = peers
    .map((peer) => finite(peer[key]))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  if (values.length < 4) return new Set();

  const q1 = quartile(values, 0.25);
  const q3 = quartile(values, 0.75);
  const iqr = q3 - q1;
  const lowBound = q1 - 1.5 * iqr;
  const highBound = q3 + 1.5 * iqr;

  return new Set(
    peers
      .filter((peer) => {
        const value = finite(peer[key]);
        return value !== null && (value < lowBound || value > highBound);
      })
      .map((peer) => String(peer.ticker || peer.name || 'peer'))
  );
}

export function CompsPeerTableCard({ peers }: CompsPeerTableCardProps) {
  if (!Array.isArray(peers) || peers.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
        <h3 className="mb-2 text-sm font-semibold text-[var(--cb-text-primary)]">Peer Table</h3>
        <p className="text-sm text-[var(--cb-text-secondary)]">
          No peers were populated for this run.
        </p>
      </div>
    );
  }

  const revenueOutliers = buildOutlierSet(peers, 'evToRevenue');
  const ebitdaOutliers = buildOutlierSet(peers, 'evToEbitda');
  const totalFlagged = peers.filter((peer) => {
    const id = String(peer.ticker || peer.name || 'peer');
    return revenueOutliers.has(id) || ebitdaOutliers.has(id);
  }).length;

  return (
    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--cb-text-primary)]">Peer Table And Outlier Review</h3>
          <p className="text-xs text-[var(--cb-text-secondary)]">
            Deterministic outlier flags use an IQR screen on EV / Revenue and EV / EBITDA.
          </p>
        </div>
        <div className="text-xs text-[var(--cb-text-secondary)]">
          {peers.length} peers • {totalFlagged} flagged
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="text-[var(--cb-text-muted)]">
            <tr>
              <th className="pb-2 pr-4 font-medium">Ticker</th>
              <th className="pb-2 pr-4 font-medium">Name</th>
              <th className="pb-2 pr-4 font-medium">Price</th>
              <th className="pb-2 pr-4 font-medium">EV / Revenue</th>
              <th className="pb-2 pr-4 font-medium">EV / EBITDA</th>
              <th className="pb-2 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody className="text-[var(--cb-text-primary)]">
            {peers.map((peer, index) => {
              const id = String(peer.ticker || peer.name || `peer-${index}`);
              const flags = [
                revenueOutliers.has(id) ? 'Revenue outlier' : null,
                ebitdaOutliers.has(id) ? 'EBITDA outlier' : null,
              ].filter((flag): flag is string => Boolean(flag));

              return (
                <tr key={`${id}-${index}`} className="border-t border-[var(--cb-border-subtle)]">
                  <td className="py-2 pr-4 font-mono">{peer.ticker || 'N/A'}</td>
                  <td className="py-2 pr-4">{peer.name || 'Peer'}</td>
                  <td className="py-2 pr-4 font-mono">{formatMoney(finite(peer.price))}</td>
                  <td className="py-2 pr-4 font-mono">{formatMultiple(finite(peer.evToRevenue))}</td>
                  <td className="py-2 pr-4 font-mono">{formatMultiple(finite(peer.evToEbitda))}</td>
                  <td className="py-2">
                    {flags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {flags.map((flag) => (
                          <span
                            key={flag}
                            className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800"
                          >
                            {flag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[var(--cb-text-secondary)]">Clean</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
