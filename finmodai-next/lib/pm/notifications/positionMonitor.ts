import type { PortfolioPosition } from '@/lib/pm/types';
import type { StockQuote } from '@/app/api/quotes/route';
import type { RankedStock } from '@/lib/ranking/types';
import { scoreMultiple } from '@/lib/ranking/score';

// Thresholds
const PRICE_MOVE_ALERT_PCT  = 2.5;  // intraday % move triggers alert
const SCORE_DROP_ALERT      = 1.5;  // score points dropped from entry
const SCORE_EXIT_THRESHOLD  = 4.0;  // score below this = exit signal
const SCORE_ADD_THRESHOLD   = 7.5;  // score above this = add signal

export type PositionAlert = {
  ticker: string;
  type: 'price_move' | 'target_hit' | 'score_drop' | 'exit_signal' | 'trim_signal' | 'add_signal' | 'sell_suggestion';
  title: string;
  body: string;
  urgency: 'high' | 'medium' | 'low';
};

function pctChange(from: number, to: number): number {
  return ((to - from) / from) * 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export async function monitorPositions(params: {
  positions: PortfolioPosition[];
  quotes: Map<string, StockQuote>;
  origin: string;
}): Promise<PositionAlert[]> {
  const { positions, quotes, origin } = params;
  const active = positions.filter(p => p.status === 'active' || p.status === 'watch');
  if (active.length === 0) return [];

  const tickers = active.map(p => p.ticker);
  let scores: RankedStock[] = [];
  try {
    scores = await scoreMultiple(tickers, origin, 6);
  } catch { /* use stored scores as fallback */ }

  const scoreMap = new Map(scores.map(s => [s.ticker, s]));
  const alerts: PositionAlert[] = [];

  for (const pos of active) {
    const quote = quotes.get(pos.ticker);
    const ranked = scoreMap.get(pos.ticker);
    const currentPrice = quote?.price ?? pos.currentPrice;
    const currentScore = ranked?.score ?? pos.currentScore;
    const entryPrice = pos.entryPrice ?? pos.costBasis;
    const entryScore = pos.entryScore;

    // 1. Intraday price move
    if (quote?.changePct != null && Math.abs(quote.changePct) >= PRICE_MOVE_ALERT_PCT) {
      const dir = quote.changePct > 0 ? 'up' : 'down';
      alerts.push({
        ticker: pos.ticker,
        type: 'price_move',
        title: `${pos.ticker} ${dir === 'up' ? '📈' : '📉'} ${quote.changePct > 0 ? '+' : ''}${round1(quote.changePct)}% today`,
        body: `Price moved ${dir} ${Math.abs(round1(quote.changePct))}% intraday${currentPrice ? ` to $${currentPrice.toFixed(2)}` : ''}. Review thesis.`,
        urgency: Math.abs(quote.changePct) >= 5 ? 'high' : 'medium',
      });
    }

    // 2. Target price hit
    if (pos.targetPrice && currentPrice) {
      const hitTarget = currentPrice >= pos.targetPrice;
      if (hitTarget) {
        const gainPct = entryPrice ? round1(pctChange(entryPrice, currentPrice)) : null;
        alerts.push({
          ticker: pos.ticker,
          type: 'target_hit',
          title: `🎯 ${pos.ticker} hit target $${pos.targetPrice}`,
          body: `Current price $${currentPrice.toFixed(2)} reached your target of $${pos.targetPrice}${gainPct != null ? ` (+${gainPct}% from entry)` : ''}. Consider trimming or exiting.`,
          urgency: 'high',
        });
      }
    }

    // 3. Score drop from entry
    if (entryScore != null && currentScore != null) {
      const scoreDelta = currentScore - entryScore;

      if (currentScore < SCORE_EXIT_THRESHOLD) {
        const sellReason = buildSellReason(pos, currentScore, entryScore, quote);
        alerts.push({
          ticker: pos.ticker,
          type: 'exit_signal',
          title: `🔴 ${pos.ticker} — Exit Signal (score ${currentScore})`,
          body: sellReason,
          urgency: 'high',
        });
      } else if (scoreDelta <= -SCORE_DROP_ALERT) {
        const pnlStr = entryPrice && currentPrice
          ? ` P&L: ${pctChange(entryPrice, currentPrice) >= 0 ? '+' : ''}${round1(pctChange(entryPrice, currentPrice))}%.`
          : '';
        alerts.push({
          ticker: pos.ticker,
          type: 'score_drop',
          title: `🟠 ${pos.ticker} — Score dropped ${round1(entryScore)} → ${round1(currentScore)}`,
          body: `Score faded ${Math.abs(round1(scoreDelta))} points from entry.${pnlStr} Original thesis may be weakening — consider running Recheck.`,
          urgency: Math.abs(scoreDelta) >= 2.5 ? 'high' : 'medium',
        });
      } else if (scoreDelta <= -1 && pos.thesisIntegrity === 'weakening') {
        alerts.push({
          ticker: pos.ticker,
          type: 'sell_suggestion',
          title: `⚠️ ${pos.ticker} — Trim suggested`,
          body: `Score ${round1(entryScore)} → ${round1(currentScore)} with thesis weakening. Consider trimming to reduce risk while keeping exposure.`,
          urgency: 'medium',
        });
      }

      // 4. Add signal (score improved)
      if (scoreDelta >= 1 && currentScore >= SCORE_ADD_THRESHOLD && pos.agentConsensus === 'bullish') {
        alerts.push({
          ticker: pos.ticker,
          type: 'add_signal',
          title: `🟢 ${pos.ticker} — Add signal (score ${round1(currentScore)})`,
          body: `Score improved to ${round1(currentScore)} with bullish agent consensus. Setup is stronger than entry — consider adding.`,
          urgency: 'low',
        });
      }
    }
  }

  return alerts;
}

function buildSellReason(
  pos: PortfolioPosition,
  currentScore: number,
  entryScore: number,
  quote: StockQuote | undefined,
): string {
  const parts: string[] = [];
  parts.push(`Score at ${round1(currentScore)}, down from ${round1(entryScore)} at entry.`);
  if (quote?.changePct != null && quote.changePct < -1) {
    parts.push(`Stock also down ${Math.abs(round1(quote.changePct))}% today.`);
  }
  if (pos.thesisIntegrity === 'broken' || pos.thesisIntegrity === 'weakening') {
    parts.push(`Thesis marked ${pos.thesisIntegrity}.`);
  }
  parts.push('Original setup no longer supported — exit candidate.');
  return parts.join(' ');
}
