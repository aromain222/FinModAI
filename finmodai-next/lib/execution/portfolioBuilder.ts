/**
 * Portfolio Builder
 *
 * Full auto-trade pipeline:
 *   1. Fetch ranked board (top N stocks by composite score)
 *   2. Convert each RankedStock into an AgentView + decision via PM Brain
 *   3. Auto-approve decisions meeting the confidence threshold
 *   4. Execute approved decisions via Alpaca paper trading
 *
 * Called by /api/execution/auto-trade-cron.
 */

import { scoreMultiple } from '@/lib/ranking/score';
import type { RankedStock } from '@/lib/ranking/types';
import { ingestAgentView } from '@/lib/pm/decisions/pmBrain';
import { autoApprovePaperDecisions } from '@/lib/pm/decisions/autoApprove';
import { runAutoPaperTrader } from '@/lib/execution/autoPaperTrader';
import type { AgentView } from '@/lib/pm/types';

const DEFAULT_WATCHLIST = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA',
  'JPM', 'GS', 'BAC', 'V', 'MA',
  'UNH', 'LLY', 'ABBV',
  'XOM', 'CVX',
  'UBER', 'ABNB', 'SHOP',
];

const BUY_SCORE_THRESHOLD  = 6.0;
const SELL_SCORE_THRESHOLD = 4.0;
const MAX_BUY_CANDIDATES   = 20;

export type BuilderConfig = {
  dryRun: boolean;
  notional?: number;
  minConfidence?: number;
  maxOrders?: number;
  watchlist?: string[];
  origin: string;
};

export type BuilderResult = {
  dryRun: boolean;
  ranked: number;
  buyCandidates: string[];
  sellCandidates: string[];
  decisionsCreated: number;
  approved: number;
  submitted: number;
  errors: string[];
};

function rankedStockToAgentView(stock: RankedStock): AgentView {
  const stance =
    stock.score >= BUY_SCORE_THRESHOLD ? 'bullish' :
    stock.score <= SELL_SCORE_THRESHOLD ? 'bearish' : 'neutral';

  const recommendation =
    stance === 'bullish' ? 'buy' :
    stance === 'bearish' ? 'sell' : 'watch';

  const conviction = Math.round(Math.min(100, Math.max(0, (stock.score / 10) * 100)));

  return {
    id: crypto.randomUUID(),
    ticker: stock.ticker,
    agentName: 'PortfolioBuilder',
    stance,
    conviction,
    reasoning: `Score ${stock.score}/10. ${stock.primaryReason} Risk: ${stock.mainRisk}`,
    changedSinceLast: false,
    evidence: (stock.meta.catalysts ?? []).slice(0, 3).map(c => ({
      source: c.source ?? 'rank',
      title: c.title,
      summary: c.title,
      url: c.url ?? null,
      publishedAt: c.publishedAt ?? null,
      impactDirection: c.direction === 'positive' ? 'bullish' : c.direction === 'negative' ? 'bearish' : 'neutral',
      confidence: conviction,
    })),
    createdAt: new Date().toISOString(),
    source: 'rank',
    agentType: 'world_monitor',
    runAt: new Date().toISOString(),
    signal: stance === 'bullish' ? 'bullish' : stance === 'bearish' ? 'bearish' : 'neutral',
    confidence: conviction,
    summary: stock.primaryReason,
    recommendation: recommendation as AgentView['recommendation'],
    action: recommendation as AgentView['action'],
    rawOutput: { score: stock.score, breakdown: stock.breakdown },
  };
}

export async function buildPortfolio(config: BuilderConfig): Promise<BuilderResult> {
  const errors: string[] = [];
  const watchlist = config.watchlist ?? DEFAULT_WATCHLIST;

  // 1. Score all tickers
  let ranked: RankedStock[] = [];
  try {
    ranked = await scoreMultiple(watchlist, config.origin, 6);
  } catch (err) {
    errors.push(`Scoring failed: ${err instanceof Error ? err.message : String(err)}`);
    return { dryRun: config.dryRun, ranked: 0, buyCandidates: [], sellCandidates: [], decisionsCreated: 0, approved: 0, submitted: 0, errors };
  }

  const buyCandidates = ranked
    .filter(s => s.score >= BUY_SCORE_THRESHOLD)
    .slice(0, MAX_BUY_CANDIDATES)
    .map(s => s.ticker);

  const sellCandidates = ranked
    .filter(s => s.score <= SELL_SCORE_THRESHOLD)
    .map(s => s.ticker);

  // 2. Ingest ranked stocks into PM Brain as agent views → decisions
  let decisionsCreated = 0;
  for (const stock of ranked.filter(s => buyCandidates.includes(s.ticker) || sellCandidates.includes(s.ticker))) {
    try {
      const view = rankedStockToAgentView(stock);
      await ingestAgentView(view);
      decisionsCreated++;
    } catch (err) {
      errors.push(`PM Brain ingest failed for ${stock.ticker}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 3. Auto-approve qualifying decisions
  const approvalResult = await autoApprovePaperDecisions({
    dryRun: config.dryRun,
    minConfidence: config.minConfidence ?? 70,
    maxApprovals: config.maxOrders ?? 5,
    approvedBy: 'portfolio_builder',
  });

  // 4. Execute approved decisions
  const tradeResult = await runAutoPaperTrader({
    dryRun: config.dryRun,
    notional: config.notional ?? 500,
    minConfidence: config.minConfidence ?? 70,
    maxOrders: config.maxOrders ?? 5,
    autoApprove: false,
  });

  return {
    dryRun: config.dryRun,
    ranked: ranked.length,
    buyCandidates,
    sellCandidates,
    decisionsCreated,
    approved: approvalResult.approved.length,
    submitted: tradeResult.submitted,
    errors,
  };
}
