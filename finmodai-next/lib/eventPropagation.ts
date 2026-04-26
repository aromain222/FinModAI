/**
 * eventPropagation.ts
 *
 * Extends an event's impact beyond its primary ticker by propagating a scaled
 * delta to related assets (peers, ETFs, sector proxies).
 *
 * Relationship map is static and deterministic — no external calls.
 * Propagation factors range from 0.30 (distant) to 0.70 (close peer).
 *
 * Pure function — no side effects.
 */

// ── Sector relationship map ───────────────────────────────────────────────────
// Format: source_ticker → Array<[target_ticker, propagation_factor]>

const PROPAGATION_MAP: Record<string, Array<[string, number]>> = {
  // Semiconductors
  NVDA: [['AMD', 0.65], ['TSM', 0.55], ['INTC', 0.45], ['AVGO', 0.50], ['SMH', 0.60], ['SOXX', 0.55]],
  AMD:  [['NVDA', 0.60], ['INTC', 0.55], ['TSM', 0.45], ['SMH', 0.55], ['SOXX', 0.50]],
  INTC: [['AMD', 0.55], ['NVDA', 0.40], ['TSM', 0.45], ['SMH', 0.50], ['SOXX', 0.45]],
  TSM:  [['NVDA', 0.55], ['AMD', 0.50], ['ASML', 0.45], ['SMH', 0.60]],
  ASML: [['TSM', 0.50], ['NVDA', 0.40], ['AMAT', 0.60], ['LRCX', 0.55]],

  // Mega-cap tech
  AAPL: [['MSFT', 0.40], ['GOOGL', 0.35], ['META', 0.35], ['XLK', 0.55], ['QQQ', 0.50]],
  MSFT: [['AAPL', 0.40], ['GOOGL', 0.45], ['AMZN', 0.40], ['XLK', 0.55], ['QQQ', 0.50]],
  GOOGL: [['META', 0.55], ['MSFT', 0.40], ['AMZN', 0.35], ['XLK', 0.45], ['QQQ', 0.50]],
  META:  [['GOOGL', 0.55], ['SNAP', 0.65], ['PINS', 0.60], ['XLK', 0.40]],
  AMZN:  [['MSFT', 0.45], ['GOOGL', 0.35], ['XLK', 0.40], ['XLY', 0.45]],

  // Financials
  JPM:  [['BAC', 0.65], ['WFC', 0.60], ['GS', 0.55], ['MS', 0.55], ['XLF', 0.65]],
  BAC:  [['JPM', 0.65], ['WFC', 0.65], ['C', 0.60],  ['XLF', 0.65]],
  GS:   [['MS', 0.70], ['JPM', 0.50], ['XLF', 0.55]],
  MS:   [['GS', 0.70], ['JPM', 0.50], ['XLF', 0.55]],

  // Energy
  XOM:  [['CVX', 0.70], ['COP', 0.60], ['OXY', 0.55], ['XLE', 0.70]],
  CVX:  [['XOM', 0.70], ['COP', 0.60], ['XLE', 0.70]],

  // Healthcare
  JNJ:  [['PFE', 0.55], ['MRK', 0.55], ['ABBV', 0.50], ['XLV', 0.60]],
  PFE:  [['JNJ', 0.55], ['MRK', 0.60], ['MRNA', 0.55], ['XLV', 0.55]],

  // Electric vehicles / autos
  TSLA: [['GM', 0.40], ['F', 0.40], ['RIVN', 0.55], ['NIO', 0.50], ['LI', 0.45]],
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type PropagatedEvent = {
  source_ticker:      string;
  target_ticker:      string;
  original_delta_pct: number;
  propagated_delta_pct: number;
  propagation_factor: number;
  relationship:       'close_peer' | 'sector_peer' | 'etf';
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function relationshipType(factor: number): PropagatedEvent['relationship'] {
  if (factor >= 0.60) return 'close_peer';
  if (factor >= 0.45) return 'sector_peer';
  return 'etf';
}

function r4(n: number): number { return Math.round(n * 1e4) / 1e4; }

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Propagate an event delta from a source ticker to related assets.
 *
 * @param ticker       The primary ticker where the event occurred
 * @param delta_pct    The event's valuation delta on the source ticker (%)
 * @param custom_map   Optional override for the built-in propagation map
 * @returns            Array of propagated events sorted by |delta| descending
 */
export function propagateEvent(
  ticker:     string,
  delta_pct:  number,
  custom_map?: Record<string, Array<[string, number]>>
): PropagatedEvent[] {
  const map     = custom_map ?? PROPAGATION_MAP;
  const targets = map[ticker.toUpperCase()] ?? [];

  return targets
    .map(([target, factor]) => ({
      source_ticker:        ticker.toUpperCase(),
      target_ticker:        target,
      original_delta_pct:   r4(delta_pct),
      propagated_delta_pct: r4(delta_pct * factor),
      propagation_factor:   factor,
      relationship:         relationshipType(factor),
    }))
    .sort((a, b) => Math.abs(b.propagated_delta_pct) - Math.abs(a.propagated_delta_pct));
}

/**
 * Build a flat map of ticker → propagated delta for quick lookup.
 */
export function propagationMap(
  ticker:    string,
  delta_pct: number,
  custom_map?: Record<string, Array<[string, number]>>
): Record<string, number> {
  const events = propagateEvent(ticker, delta_pct, custom_map);
  const out: Record<string, number> = {};
  for (const e of events) out[e.target_ticker] = e.propagated_delta_pct;
  return out;
}

/**
 * List tickers that are known peers of the given ticker.
 */
export function getPeers(ticker: string): string[] {
  return (PROPAGATION_MAP[ticker.toUpperCase()] ?? []).map(([t]) => t);
}
