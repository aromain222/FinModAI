import type { AgentView, OpportunityScoreSnapshot } from '@/lib/pm/types';
import type { RankedStock } from '@/lib/ranking/types';

export function rankedStockToSnapshot(stock: RankedStock): OpportunityScoreSnapshot {
  return {
    ticker: stock.ticker,
    score: stock.score,
    signal: stock.signal,
    scoredAt: stock.meta.scoredAt,
    primaryReason: stock.primaryReason,
    mainRisk: stock.mainRisk,
  };
}

export function rankedStockToAgentView(stock: RankedStock, previous?: AgentView | null): AgentView {
  const stance = stock.signal === 'green' ? 'bullish' : stock.signal === 'red' ? 'bearish' : 'neutral';
  const conviction = Math.round(Math.max(0, Math.min(100, stock.score * 10)));
  return {
    id: crypto.randomUUID(),
    ticker: stock.ticker,
    agentName: 'Opportunity Score',
    stance,
    conviction,
    reasoning: `${stock.primaryReason} Main risk: ${stock.mainRisk}`,
    changedSinceLast: previous ? previous.stance !== stance || Math.abs(previous.conviction - conviction) >= 10 : false,
    evidence: [{
      source: 'ranking_engine',
      summary: `Score ${stock.score}/10 with forecast ${stock.breakdown.forecastSignal}/10, catalysts ${stock.breakdown.catalystStrength}/10, valuation ${stock.breakdown.valuationSignal}/10.`,
      impactDirection: stance,
      confidence: conviction,
    }],
    createdAt: new Date().toISOString(),
    source: 'rank',
    agentType: 'forecast',
    runAt: new Date().toISOString(),
    signal: stance,
    confidence: conviction,
    summary: stock.primaryReason,
    rawOutput: { snapshot: rankedStockToSnapshot(stock), breakdown: stock.breakdown },
  };
}
