/**
 * pnlAttribution.ts
 *
 * Decomposes realized PnL into attribution buckets:
 *   - by event category (earnings, macro, etc.)
 *   - by signal strength tier (low / medium / high)
 *   - by trade direction (long / short)
 *
 * Pure function — no side effects, no external calls.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClosedPosition = {
  ticker:    string;
  pnl_dollar: number;   // signed: positive = profit
  pnl_pct:   number;    // signed return fraction
  direction: 'long' | 'short';
  attribution: {
    event_category:  string;   // e.g. 'earnings', 'macro', 'technical'
    signal_strength: number;   // 0–1 (max of bull/bear probability)
    valuation_gap:   number;   // signed gap at signal time
    event_momentum:  number;   // sum of weighted event scores
  };
};

export type BucketStats = {
  total_pnl: number;
  avg_pnl:   number;
  count:     number;
  win_count: number;
  win_rate:  number;
};

export type PnlAttributionResult = {
  by_event_type:      Record<string, BucketStats>;
  by_signal_strength: Record<string, BucketStats>;  // 'low' | 'medium' | 'high'
  by_direction:       Record<string, BucketStats>;  // 'long' | 'short'
  total_pnl:          number;
  total_count:        number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

type Accumulator = Record<string, { total_pnl: number; count: number; win_count: number }>;

function r4(n: number): number { return Math.round(n * 1e4) / 1e4; }
function r3(n: number): number { return Math.round(n * 1e3) / 1e3; }

function strengthBucket(s: number): 'low' | 'medium' | 'high' {
  if (s >= 0.70) return 'high';
  if (s >= 0.40) return 'medium';
  return 'low';
}

function accumulate(
  acc: Accumulator,
  key: string,
  pnl: number,
  won: boolean
): void {
  if (!acc[key]) acc[key] = { total_pnl: 0, count: 0, win_count: 0 };
  acc[key].total_pnl  += pnl;
  acc[key].count      += 1;
  acc[key].win_count  += won ? 1 : 0;
}

function finalize(acc: Accumulator): Record<string, BucketStats> {
  const out: Record<string, BucketStats> = {};
  for (const [k, v] of Object.entries(acc)) {
    out[k] = {
      total_pnl: r4(v.total_pnl),
      avg_pnl:   r4(v.count > 0 ? v.total_pnl / v.count : 0),
      count:     v.count,
      win_count: v.win_count,
      win_rate:  r3(v.count > 0 ? v.win_count / v.count : 0),
    };
  }
  return out;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Decompose realized PnL from a set of closed positions into attribution buckets.
 */
export function attributePnl(positions: ClosedPosition[]): PnlAttributionResult {
  const byEvent:    Accumulator = {};
  const byStrength: Accumulator = {};
  const byDir:      Accumulator = {};

  let totalPnl = 0;

  for (const pos of positions) {
    const won    = pos.pnl_dollar > 0;
    const cat    = pos.attribution.event_category || 'unknown';
    const bucket = strengthBucket(pos.attribution.signal_strength);
    const dir    = pos.direction;

    totalPnl += pos.pnl_dollar;

    accumulate(byEvent,    cat,    pos.pnl_dollar, won);
    accumulate(byStrength, bucket, pos.pnl_dollar, won);
    accumulate(byDir,      dir,    pos.pnl_dollar, won);
  }

  return {
    by_event_type:      finalize(byEvent),
    by_signal_strength: finalize(byStrength),
    by_direction:       finalize(byDir),
    total_pnl:          r4(totalPnl),
    total_count:        positions.length,
  };
}

/**
 * Sort a bucket map by total_pnl descending — useful for "top performers" views.
 */
export function rankBuckets(
  map: Record<string, BucketStats>
): Array<{ key: string } & BucketStats> {
  return Object.entries(map)
    .map(([key, stats]) => ({ key, ...stats }))
    .sort((a, b) => b.total_pnl - a.total_pnl);
}
