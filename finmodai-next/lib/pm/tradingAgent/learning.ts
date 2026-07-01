import { computePaperPnL, listPaperOrders, type PaperPnL } from '@/lib/pm/paper/paperBook';
import { listMemory } from '@/lib/pm/memory/memoryStore';
import { listPositions } from '@/lib/pm/portfolio/positionStore';

/**
 * The agent's training loop. Nothing here calls an LLM — the agent learns the
 * way a desk does: it marks its own book and reads its own trade journal.
 * A losing book raises the conviction bar before the next trade; a winning
 * book never lowers it (discipline is asymmetric by design).
 */

export type AgentTrackRecord = {
  pnl: PaperPnL;
  /** Added to the personality's pick/execution confidence floors. Never negative. */
  disciplineAdjustment: number;
  /** Most recent trade-journal lessons involving this agent. */
  lessons: string[];
  summary: string;
};

const LOSS_ADJUSTMENT = 5;
const HEAVY_LOSS_ADJUSTMENT = 10;
/** Below this many fills the book is noise, not signal. */
const MIN_FILLS_FOR_SIGNAL = 3;
/** A drawdown beyond this share of the book's cost basis is a heavy loss. */
const HEAVY_LOSS_RATIO = 0.05;

export function disciplineFromPnL(pnl: PaperPnL, bookCostBasis: number): number {
  if (pnl.totalFills < MIN_FILLS_FOR_SIGNAL) return 0;
  if (pnl.totalUSD >= 0) return 0;
  const lossRatio = bookCostBasis > 0 ? Math.abs(pnl.totalUSD) / bookCostBasis : 0;
  return lossRatio >= HEAVY_LOSS_RATIO ? HEAVY_LOSS_ADJUSTMENT : LOSS_ADJUSTMENT;
}

export function describeTrackRecord(pnl: PaperPnL, adjustment: number): string {
  if (pnl.totalFills < MIN_FILLS_FOR_SIGNAL) {
    return `Track record: ${pnl.totalFills} paper fill(s) — too few to grade, trading at baseline discipline.`;
  }
  const direction = pnl.totalUSD >= 0 ? 'up' : 'down';
  const base = `Track record: ${pnl.totalFills} paper fills, ${direction} $${Math.abs(pnl.totalUSD).toLocaleString()} (realized $${pnl.realizedUSD.toLocaleString()}, unrealized $${pnl.unrealizedUSD.toLocaleString()}) across ${pnl.openPositions} open position(s).`;
  return adjustment > 0
    ? `${base} The book is underwater, so the agent raised its conviction bar by ${adjustment} points this run.`
    : `${base} Trading at baseline discipline.`;
}

/**
 * Mark the paper book against the freshest prices the platform has and pull
 * the agent's recent journal entries. Degrades to a neutral record when the
 * stores are unavailable — training must never block trading.
 */
export async function reviewTrackRecord(): Promise<AgentTrackRecord> {
  try {
    const [orders, positions, memories] = await Promise.all([
      listPaperOrders({ limit: 200 }),
      listPositions({ limit: 200 }).catch(() => []),
      listMemory({ limit: 50 }).catch(() => []),
    ]);

    const priceByTicker = new Map<string, number>();
    for (const position of positions) {
      if (position.currentPrice != null && position.currentPrice > 0) {
        priceByTicker.set(position.ticker.toUpperCase(), position.currentPrice);
      }
    }

    const filled = orders.filter(order => order.status === 'filled_paper');
    const bookCostBasis = filled
      .filter(order => order.side === 'buy')
      .reduce((sum, order) => sum + order.shares * order.fillPrice, 0);

    const pnl = computePaperPnL(orders, priceByTicker);
    const disciplineAdjustment = disciplineFromPnL(pnl, bookCostBasis);

    const lessons = memories
      .filter(memory => memory.relatedThemes?.includes('trading_agent'))
      .slice(0, 3)
      .map(memory => memory.lesson);

    return {
      pnl,
      disciplineAdjustment,
      lessons,
      summary: describeTrackRecord(pnl, disciplineAdjustment),
    };
  } catch {
    const pnl: PaperPnL = { realizedUSD: 0, unrealizedUSD: 0, totalUSD: 0, openPositions: 0, totalFills: 0 };
    return {
      pnl,
      disciplineAdjustment: 0,
      lessons: [],
      summary: 'Track record unavailable this run; trading at baseline discipline.',
    };
  }
}
