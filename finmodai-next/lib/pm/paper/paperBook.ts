import { z } from 'zod';
import {
  listPMRecords,
  upsertPMRecord,
  type PMStoredRecord,
} from '@/lib/pm/persistence/store';

export type PaperSide = 'buy' | 'sell';
export type PaperStatus = 'filled_paper' | 'skipped';

export type PaperTriggerSource =
  | 'committee_escalation'
  | 'committee_cycle'
  | 'scout_consensus_4of6'
  | 'scout_strong_5of6';

export type PaperOrder = PMStoredRecord & {
  id: string;
  ticker: string;
  side: PaperSide;
  shares: number;
  fillPrice: number;
  notional: number;
  status: PaperStatus;
  committeeRunId: string | null;
  agentViewId: string | null;
  rationale: string;
  triggerAction: string;
  triggerSource: PaperTriggerSource;
  confidence: number;
  createdAt: string;
  updatedAt: string;
};

const paperOrderSchema = z.object({
  id: z.string().min(1),
  ticker: z.string().min(1),
  side: z.enum(['buy', 'sell']),
  shares: z.number().positive(),
  fillPrice: z.number().positive(),
  notional: z.number().positive(),
  status: z.enum(['filled_paper', 'skipped']).default('filled_paper'),
  committeeRunId: z.string().nullable().default(null),
  agentViewId: z.string().nullable().default(null),
  rationale: z.string().default(''),
  triggerAction: z.string().default(''),
  triggerSource: z.enum([
    'committee_escalation',
    'committee_cycle',
    'scout_consensus_4of6',
    'scout_strong_5of6',
  ]).default('committee_escalation'),
  confidence: z.number().min(0).max(100).default(0),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

const BUY_NOTIONAL_USD = 100;
const TRIM_FRACTION = 0.5;
const DEFAULT_MIN_CONFIDENCE = 40;
const TRIGGER_COOLDOWN_MS = 90 * 60 * 1000; // 90m per (ticker, side, trigger) to avoid runaway fills

function roundShares(qty: number): number {
  return Math.round(qty * 10_000) / 10_000;
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function classifyAction(action: string): 'buy' | 'sell' | 'trim' | 'ignore' {
  const lower = action.trim().toLowerCase();
  if (lower === 'buy' || lower === 'add' || lower === 'long' || lower === 'accumulate') return 'buy';
  if (lower === 'sell' || lower === 'exit' || lower === 'close' || lower === 'short') return 'sell';
  if (lower === 'trim' || lower === 'reduce') return 'trim';
  return 'ignore';
}

export async function listPaperOrders(params: { ticker?: string; limit?: number } = {}): Promise<PaperOrder[]> {
  return listPMRecords<PaperOrder>('pm_paper_orders', params);
}

export type PaperPosition = {
  ticker: string;
  shares: number;
  averageCost: number;
  costBasis: number;
};

export function derivePaperPositions(orders: PaperOrder[]): PaperPosition[] {
  const sorted = [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const byTicker = new Map<string, { shares: number; costBasis: number }>();
  for (const order of sorted) {
    if (order.status !== 'filled_paper') continue;
    const cur = byTicker.get(order.ticker) ?? { shares: 0, costBasis: 0 };
    if (order.side === 'buy') {
      cur.shares += order.shares;
      cur.costBasis += order.shares * order.fillPrice;
    } else {
      // Sell: realized P&L handled at summary level; reduce shares and cost basis proportionally.
      if (cur.shares <= 0) continue;
      const sellShares = Math.min(order.shares, cur.shares);
      const avg = cur.shares > 0 ? cur.costBasis / cur.shares : 0;
      cur.shares -= sellShares;
      cur.costBasis -= sellShares * avg;
    }
    byTicker.set(order.ticker, cur);
  }
  return [...byTicker.entries()]
    .filter(([, v]) => v.shares > 1e-6)
    .map(([ticker, v]) => ({
      ticker,
      shares: roundShares(v.shares),
      costBasis: roundUsd(v.costBasis),
      averageCost: v.shares > 0 ? roundUsd(v.costBasis / v.shares) : 0,
    }));
}

export type PaperPnL = {
  realizedUSD: number;
  unrealizedUSD: number;
  totalUSD: number;
  openPositions: number;
  totalFills: number;
};

export function computePaperPnL(
  orders: PaperOrder[],
  currentPriceByTicker: Map<string, number>,
): PaperPnL {
  const sorted = [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const open = new Map<string, { shares: number; costBasis: number }>();
  let realized = 0;
  let totalFills = 0;
  for (const order of sorted) {
    if (order.status !== 'filled_paper') continue;
    totalFills += 1;
    const cur = open.get(order.ticker) ?? { shares: 0, costBasis: 0 };
    if (order.side === 'buy') {
      cur.shares += order.shares;
      cur.costBasis += order.shares * order.fillPrice;
    } else {
      if (cur.shares <= 0) continue;
      const sellShares = Math.min(order.shares, cur.shares);
      const avg = cur.shares > 0 ? cur.costBasis / cur.shares : 0;
      realized += sellShares * (order.fillPrice - avg);
      cur.shares -= sellShares;
      cur.costBasis -= sellShares * avg;
    }
    open.set(order.ticker, cur);
  }

  let unrealized = 0;
  let openPositions = 0;
  for (const [ticker, v] of open.entries()) {
    if (v.shares <= 1e-6) continue;
    openPositions += 1;
    const price = currentPriceByTicker.get(ticker);
    if (price != null && price > 0) {
      const marketValue = v.shares * price;
      unrealized += marketValue - v.costBasis;
    }
  }

  return {
    realizedUSD: roundUsd(realized),
    unrealizedUSD: roundUsd(unrealized),
    totalUSD: roundUsd(realized + unrealized),
    openPositions,
    totalFills,
  };
}

export type RecordPaperFillInput = {
  ticker: string;
  action: string;
  confidence: number;
  rationale: string;
  currentPrice: number | null;
  committeeRunId: string | null;
  agentViewId: string | null;
  triggerSource?: PaperTriggerSource;
  minConfidence?: number;
};

export type RecordPaperFillResult =
  | { recorded: true; order: PaperOrder }
  | { recorded: false; reason: string };

/**
 * Translate a committee decision into a paper fill, if it's actionable.
 * - buy:  $100 notional at currentPrice → fractional shares
 * - sell: close entire open paper position (or skip if none)
 * - trim: sell 50% of open paper position
 * - other actions or low confidence: skip with reason
 */
export async function recordPaperFill(input: RecordPaperFillInput): Promise<RecordPaperFillResult> {
  const triggerSource: PaperTriggerSource = input.triggerSource ?? 'committee_escalation';
  const minConfidence = input.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  if (input.confidence < minConfidence) {
    return { recorded: false, reason: `confidence_too_low (${input.confidence} < ${minConfidence})` };
  }
  const classified = classifyAction(input.action);
  if (classified === 'ignore') {
    return { recorded: false, reason: `non_actionable_action (${input.action})` };
  }
  if (input.currentPrice == null || input.currentPrice <= 0) {
    return { recorded: false, reason: 'missing_fill_price' };
  }

  const ticker = input.ticker.toUpperCase();
  const fillPrice = input.currentPrice;

  // Cooldown: don't fire the same trigger on the same (ticker, side) within the window.
  const recent = await listPaperOrders({ ticker, limit: 50 });
  const proposedSide: PaperSide = classified === 'buy' ? 'buy' : 'sell';
  const cutoff = Date.now() - TRIGGER_COOLDOWN_MS;
  const recentSame = recent.find(o =>
    o.triggerSource === triggerSource
    && o.side === proposedSide
    && new Date(o.createdAt).getTime() > cutoff,
  );
  if (recentSame) {
    return { recorded: false, reason: `cooldown_active (${triggerSource} ${proposedSide} ${ticker})` };
  }

  let side: PaperSide;
  let shares: number;
  if (classified === 'buy') {
    side = 'buy';
    shares = roundShares(BUY_NOTIONAL_USD / fillPrice);
  } else {
    const positions = derivePaperPositions(recent);
    const open = positions.find(p => p.ticker === ticker);
    if (!open || open.shares <= 0) {
      return { recorded: false, reason: 'no_open_paper_position_to_sell' };
    }
    side = 'sell';
    shares = classified === 'trim'
      ? roundShares(open.shares * TRIM_FRACTION)
      : roundShares(open.shares);
  }

  if (shares <= 0) {
    return { recorded: false, reason: 'computed_zero_shares' };
  }

  const notional = roundUsd(shares * fillPrice);
  const now = new Date().toISOString();
  const parsed = paperOrderSchema.parse({
    id: crypto.randomUUID(),
    ticker,
    side,
    shares,
    fillPrice: roundUsd(fillPrice),
    notional,
    status: 'filled_paper',
    committeeRunId: input.committeeRunId,
    agentViewId: input.agentViewId,
    rationale: input.rationale.slice(0, 600),
    triggerAction: input.action,
    triggerSource,
    confidence: Math.round(input.confidence),
    createdAt: now,
    updatedAt: now,
  });

  const saved = await upsertPMRecord('pm_paper_orders', parsed);
  return { recorded: true, order: saved as unknown as PaperOrder };
}

export type ScoutSignalLite = {
  key: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  score: number;
  confidence: number;
};

export type ScoutConsensusInput = {
  ticker: string;
  signals: ScoutSignalLite[];
  currentPrice: number | null;
};

export type ScoutConsensusResult = {
  fills: Array<{ source: PaperTriggerSource; result: RecordPaperFillResult }>;
  consensus: { bullish: number; bearish: number; neutral: number; avgScore: number };
};

/**
 * Layered scout-consensus triggers — fire paper fills off raw analyst agreement
 * without waiting for the senior committee.
 *
 *  - scout_consensus_4of6 (lighter): 4+ scouts agree on direction
 *  - scout_strong_5of6     (stricter): 5+ scouts agree AND avg score crosses ±70/30
 *
 * Both fire independently; cooldown inside recordPaperFill prevents flapping.
 */
export async function triggerScoutConsensusFills(input: ScoutConsensusInput): Promise<ScoutConsensusResult> {
  const ticker = input.ticker.toUpperCase();
  const sigs = input.signals;
  const counts = sigs.reduce(
    (acc, s) => {
      acc[s.signal] += 1;
      return acc;
    },
    { bullish: 0, bearish: 0, neutral: 0 },
  );
  const avgScore = sigs.length > 0
    ? sigs.reduce((sum, s) => sum + s.score, 0) / sigs.length
    : 0;
  const avgConfidence = sigs.length > 0
    ? sigs.reduce((sum, s) => sum + s.confidence, 0) / sigs.length
    : 0;

  const fills: ScoutConsensusResult['fills'] = [];

  // Trigger 1 — light consensus: 4+ scouts agree on direction
  if (counts.bullish >= 4 || counts.bearish >= 4) {
    const action = counts.bullish >= 4 ? 'buy' : 'sell';
    const dirCount = counts.bullish >= 4 ? counts.bullish : counts.bearish;
    const result = await recordPaperFill({
      ticker,
      action,
      confidence: Math.max(50, avgConfidence),
      rationale: `${dirCount}/6 scouts ${action === 'buy' ? 'bullish' : 'bearish'} · avg score ${avgScore.toFixed(1)}`,
      currentPrice: input.currentPrice,
      committeeRunId: null,
      agentViewId: null,
      triggerSource: 'scout_consensus_4of6',
      minConfidence: 40,
    });
    fills.push({ source: 'scout_consensus_4of6', result });
  }

  // Trigger 2 — strong consensus: 5+ scouts agree AND avg score is decisive
  if ((counts.bullish >= 5 && avgScore >= 70) || (counts.bearish >= 5 && avgScore <= 30)) {
    const action = counts.bullish >= 5 ? 'buy' : 'sell';
    const dirCount = counts.bullish >= 5 ? counts.bullish : counts.bearish;
    const result = await recordPaperFill({
      ticker,
      action,
      confidence: Math.max(65, avgConfidence),
      rationale: `${dirCount}/6 scouts ${action === 'buy' ? 'bullish' : 'bearish'} · avg score ${avgScore.toFixed(1)} (strong)`,
      currentPrice: input.currentPrice,
      committeeRunId: null,
      agentViewId: null,
      triggerSource: 'scout_strong_5of6',
      minConfidence: 50,
    });
    fills.push({ source: 'scout_strong_5of6', result });
  }

  return { fills, consensus: { ...counts, avgScore } };
}

