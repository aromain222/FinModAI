import type { AgentView, OpportunityScoreSnapshot, ThesisUpdateInput, WeeklyMemoSection } from '@/lib/pm/types';
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

export function rankedStockToThesisUpdateInput(stock: RankedStock): ThesisUpdateInput {
  const strongest = Object.entries(stock.breakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([factor, score]) => `${factor} ${score}/10`)
    .join(', ');
  const weakest = Object.entries(stock.breakdown)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 1)
    .map(([factor, score]) => `${factor} ${score}/10`)
    .join(', ');
  return {
    ticker: stock.ticker,
    newEvidence: `Opportunity Score update: ${stock.score}/10 (${stock.signal}). Strongest factors: ${strongest}. Main drag: ${weakest}. Reason: ${stock.primaryReason}. Risk: ${stock.mainRisk}.`,
    newThesisSummary: stock.primaryReason,
    convictionScore: Math.round(Math.max(0, Math.min(100, stock.score * 10))),
    source: 'score_change',
  };
}

export function rankedStockToWeeklyMemoSection(stock: RankedStock): WeeklyMemoSection {
  return {
    title: `${stock.ticker} opportunity score`,
    body: `${stock.signal.toUpperCase()} at ${stock.score}/10. ${stock.primaryReason} Main risk: ${stock.mainRisk}`,
    tickers: [stock.ticker],
  };
}
