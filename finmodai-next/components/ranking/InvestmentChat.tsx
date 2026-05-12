'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle, Loader2, Plus, Send, TrendingUp } from 'lucide-react';
import { PMDecisionStrip } from '@/components/ranking/PMDecisionStrip';
import { TradeStructurePanel } from '@/components/ranking/TradeStructurePanel';
import { ScenarioEngine } from '@/components/ranking/ScenarioEngine';
import { CatalystTimeline } from '@/components/ranking/CatalystTimeline';
import { DeepResearchPanel } from '@/components/ranking/DeepResearchPanel';
import { TradingAgentsPanel } from '@/components/ranking/TradingAgentsPanel';
import { DexterPanel } from '@/components/ranking/DexterPanel';
import { HedgeFundPanel } from '@/components/ranking/HedgeFundPanel';
import { ConvictionMeter, parseConvictionLevel } from '@/components/ranking/ConvictionMeter';
import { getPitchQueue, upsertPitchQueueItem } from '@/lib/pitchQueue/storage';
import { buildPitchQueueItemFromRankedStock } from '@/lib/pitchQueue/buildPitch';
import {
  getActivePositions,
  addPosition,
  updatePositionThesis,
  PORTFOLIO_EVENT,
} from '@/lib/portfolio/storage';
import { buildPositionFromRankedStock } from '@/lib/portfolio/buildPosition';
import type { ActivePosition } from '@/lib/portfolio/types';
import type { RankedStock } from '@/lib/ranking/types';
import { getCompanyBrief } from '@/lib/ranking/companyBriefs';
import { buildValuationSignal } from '@/lib/valuation/signal';
import {
  type InvestmentMode, type ScoreFactor, SCORE_LABELS,
  capitalize, factorLabel, sortedFactors, topFactor,
  isGenericReason, resolvedRisk, hasLiveConfirmation, hasForecastConflict,
  tradeReadiness, factorInterpretation, convictionGrade, expectedMoveForDisplay,
  keyCatalystStr, signalFromScore, pmBullCaseRead, finalPmRead,
  tradeViewStr, thesisDrift, forecastReconciliation, contextPrompt,
} from '@/lib/ranking/chatHelpers';
import { cn } from '@/lib/utils';

type Message = {
  role:    'user' | 'assistant';
  content: string;
};

const STANDARD_PROMPTS: { label: string; mode: InvestmentMode; text: string }[] = [
  { label: 'Explain thesis',     mode: 'explain',   text: 'Why is this stock ranked here?' },
  { label: 'Evaluate risk',      mode: 'evaluate',  text: 'Should I buy, wait, or avoid?' },
  { label: 'Make the bear case', mode: 'challenge', text: 'Push back on the bull case.' },
  { label: 'Compare to peers',   mode: 'compare',   text: 'Compare against the other ranked stocks.' },
];

const NOTEBOOK_PROMPTS: { label: string; mode?: InvestmentMode; text: string }[] = [
  { label: 'Thesis', text: 'What is the thesis?' },
  { label: 'Needs true', text: 'What needs to be true for this to work?' },
  { label: 'Monitor', text: 'What should I monitor?' },
  { label: 'Breaks it', text: 'What would make this a bad trade?', mode: 'challenge' },
  { label: 'Pitch', text: 'Turn this into a pitch.', mode: 'pitch' },
];

const AGENT_PROMPTS: { label: string; mode?: InvestmentMode; text: string }[] = [
  { label: 'PM', text: 'Run the PM brain: why is this ranked here and what is the decision?' },
  { label: 'Catalyst', text: 'Run the catalyst agent: what events or headlines matter most over the next 1-3 months?' },
  { label: 'Forecast', text: 'Run the forecast agent: what does the forecast, momentum, and market tape imply?' },
  { label: 'Assumption', text: 'Show me the best assumption to test that would change the score and valuation.' },
  { label: 'Pitch', mode: 'pitch', text: 'Turn this into a pitch.' },
];

type PeerStock = Pick<
  RankedStock,
  'ticker' | 'score' | 'signal' | 'primaryReason' | 'mainRisk' | 'breakdown'
>;

type Props = {
  stock: RankedStock | null;
  peers: PeerStock[];
  onStockUpdate?: (stock: RankedStock) => void;
};

type AssumptionUpdateResponse = {
  result?: {
    adjustedScore: number;
    delta: number;
    plausibility: 'high' | 'medium' | 'low' | 'extreme';
    factorDeltas: Partial<Record<keyof RankedStock['breakdown'], number>>;
    adjustedBreakdown: RankedStock['breakdown'];
    explanation: string;
    pushback: string | null;
  };
  financialImpact?: {
    beforeValuation: NonNullable<RankedStock['meta']['valuation']>;
    afterValuation: NonNullable<RankedStock['meta']['valuation']>;
    valuationGapDelta: number | null;
    expectedMoveDeltaPct: number;
    riskScoreBefore: number;
    riskScoreAfter: number;
    riskRead: string;
  };
  parsedClaim?: {
    direction: 'positive' | 'negative';
    primaryFactor: keyof RankedStock['breakdown'] | string;
  };
  error?: string;
};

type ScoreChange = {
  fromScore: number;
  toScore: number;
  delta: number;
  fromSignal: RankedStock['signal'];
  toSignal: RankedStock['signal'];
  factorDeltas: Partial<Record<ScoreFactor, number>>;
  primaryFactor: string;
  explanation: string;
};

function changedFactorTone(delta: number): string {
  if (delta > 0) return 'animate-pulse border-emerald-400/60 bg-emerald-500/15 shadow-[0_0_18px_rgba(52,211,153,0.16)]';
  if (delta < 0) return 'animate-pulse border-rose-400/60 bg-rose-500/15 shadow-[0_0_18px_rgba(251,113,133,0.16)]';
  return 'border-transparent';
}

function changedFactorSummary(factorDeltas: Partial<Record<ScoreFactor, number>>): string {
  return (Object.entries(factorDeltas) as Array<[ScoreFactor, number | undefined]>)
    .filter(([, delta]) => delta != null && Math.abs(delta) > 0)
    .map(([factor, delta]) => `${SCORE_LABELS[factor]} ${delta! > 0 ? '↑' : '↓'}`)
    .join(', ');
}

function scoreChangeExplanation(change: ScoreChange): string {
  const direction = change.delta >= 0 ? 'moved up' : 'moved down';
  const sign = change.delta >= 0 ? '+' : '';
  const changedFactors = (Object.entries(change.factorDeltas) as Array<[ScoreFactor, number | undefined]>)
    .filter(([, d]) => d != null && Math.abs(d) > 0.05)
    .sort((a, b) => Math.abs(b[1] ?? 0) - Math.abs(a[1] ?? 0))
    .map(([f]) => SCORE_LABELS[f]);
  const factorStr = changedFactors.length > 0
    ? changedFactors.join(' and ')
    : factorLabel(change.primaryFactor);
  const verb = change.delta >= 0 ? 'improved' : 'weakened';
  return `Score ${direction} ${sign}${change.delta.toFixed(1)} because ${factorStr} ${verb}.`;
}

function buildSwingThesis(
  stock: RankedStock,
  options: {
    bullCase?: string;
    risk?: string;
    tradeView?: string;
    whatMattersMost?: string;
    keyCatalyst?: string;
  } = {},
): string {
  const [topK, topV] = topFactor(stock);
  const conviction   = convictionGrade(stock.score, stock.signal);
  const signalWord   = stock.signal === 'green' ? 'GREEN' : stock.signal === 'yellow' ? 'YELLOW' : 'RED';
  return [
    `Signal: ${signalWord} · ${stock.score.toFixed(1)}/10`,
    `Expected Move: ${expectedMoveStr(stock)}`,
    `What Matters Most: ${options.whatMattersMost ?? `${SCORE_LABELS[topK]} (${topV.toFixed(1)}) — ${factorInterpretation(stock, topK, topV)}`}`,
    `Key Catalyst: ${options.keyCatalyst ?? keyCatalystStr(stock)}`,
    `Bull Case: ${options.bullCase ?? stock.primaryReason}`,
    `Risk: ${options.risk ?? resolvedRisk(stock)}`,
    `Trade View: ${options.tradeView ?? tradeViewStr(stock)}`,
    `Conviction: ${conviction.level} — ${conviction.read}`,
    `Thesis Drift: ${thesisDrift(stock)}`,
  ].join('\n');
}

function catalystContext(stock: RankedStock): string {
  const catalysts = stock.meta.catalysts ?? [];
  if (catalysts.length === 0) {
    const brief = getCompanyBrief(stock.ticker);
    return `No live headline catalyst is loaded yet; watch ${brief.watchItems.slice(0, 3).join(', ')} for confirmation.`;
  }
  return catalysts
    .slice(0, 3)
    .map((catalyst) => `${catalyst.title} (${catalyst.channel}, ${catalyst.direction}, ${catalyst.impactPct >= 0 ? '+' : ''}${catalyst.impactPct.toFixed(1)}%)`)
    .join('; ');
}

function catalystDetailedContext(stock: RankedStock): string {
  const catalysts = stock.meta.catalysts ?? [];
  if (catalysts.length === 0) return catalystContext(stock);
  const top = catalysts[0];
  const channel = factorLabel(top.channel);
  return `${channel}: ${top.title}. ${top.reason} ${top.estimateRisk}`;
}

function scoreBacktestContext(stock: RankedStock): string {
  const forecast = stock.meta.forecastReturnPct;
  const signal = stock.score >= 7 ? 'high-score' : stock.score >= 4 ? 'watchlist' : 'low-score';
  const forecastLine = forecast == null
    ? 'No live TimesFM return is loaded yet.'
    : `Current forward check is ${forecast >= 0 ? '+' : ''}${forecast.toFixed(1)}% over the forecast window.`;
  return `Lightweight rank check: ${signal} profile (${stock.score.toFixed(1)}/10). ${forecastLine} Use this as a forward score audit, not a fully validated historical edge yet.`;
}

function expectedMoveStr(stock: RankedStock): string {
  if (stock.meta.forecastReturnPct != null) {
    const sign = stock.meta.forecastReturnPct >= 0 ? '+' : '';
    return `${sign}${stock.meta.forecastReturnPct.toFixed(1)}% (${stock.horizonWeeks} wk forecast)`;
  }
  return `Forecast signal ${stock.breakdown.forecastSignal.toFixed(1)}/10 — no price target from model`;
}

function cryptoTapeContext(stock: RankedStock): string | null {
  const regime = stock.meta.cryptoRegime;
  if (!regime) return null;
  return `${regime.regime.toUpperCase()} crypto tape: BTC 7D ${regime.btc7dPct >= 0 ? '+' : ''}${regime.btc7dPct.toFixed(1)}%, BTC 30D ${regime.btc30dPct >= 0 ? '+' : ''}${regime.btc30dPct.toFixed(1)}%, ETH 7D ${regime.eth7dPct >= 0 ? '+' : ''}${regime.eth7dPct.toFixed(1)}%, vol ${regime.dailyVolPct.toFixed(1)}%. ${regime.pmRead}`;
}

function buildExplain(stock: RankedStock): string {
  const brief        = getCompanyBrief(stock.ticker);
  const cryptoTape   = cryptoTapeContext(stock);
  const [topK, topV] = topFactor(stock);
  return buildSwingThesis(stock, {
    bullCase:        `${brief.strategicContext} ${brief.nearTermFocus}`,
    whatMattersMost: `${SCORE_LABELS[topK]} (${topV.toFixed(1)}) — ${factorInterpretation(stock, topK, topV)}${cryptoTape ? `; ${cryptoTape}` : ''}`,
  });
}

function buildThesis(stock: RankedStock): string {
  const brief      = getCompanyBrief(stock.ticker);
  const valuation  = stock.meta.valuation ?? buildValuationSignal({
    ticker: stock.ticker,
    forecastReturnPct: stock.meta.forecastReturnPct,
    factorBreakdown:   stock.breakdown,
  });
  const [topK, topV] = topFactor(stock);
  return buildSwingThesis(stock, {
    bullCase:        `${brief.nearTermFocus} Actionable if it moves estimates, multiple, or positioning.`,
    risk:            brief.mainRisk,
    whatMattersMost: `${SCORE_LABELS[topK]} (${topV.toFixed(1)}) — ${valuation.summary}`,
  });
}

function buildNeedsTrue(stock: RankedStock): string {
  const brief   = getCompanyBrief(stock.ticker);
  const weakest = sortedFactors(stock).slice(-2).reverse();
  return buildSwingThesis(stock, {
    bullCase:        `${brief.watchItems.slice(0, 3).join(', ')} must confirm over the next 1-3 months.`,
    whatMattersMost: weakest[0] ? `${SCORE_LABELS[weakest[0][0]]} (${weakest[0][1].toFixed(1)}) — score re-rates if this improves` : undefined,
    risk:            `If ${brief.watchItems[0] ?? 'the main catalyst'} disappoints: ${brief.mainRisk}`,
  });
}

function buildEvidence(stock: RankedStock): string {
  const brief = getCompanyBrief(stock.ticker);
  const top   = sortedFactors(stock)[0];
  return buildSwingThesis(stock, {
    bullCase: top
      ? `${SCORE_LABELS[top[0]]} (${top[1].toFixed(1)}) leads; watch ${brief.watchItems.slice(0, 2).join(' and ')} for confirmation.`
      : stock.primaryReason,
    risk: resolvedRisk(stock),
  });
}

function buildMonitor(stock: RankedStock): string {
  const brief      = getCompanyBrief(stock.ticker);
  const cryptoTape = cryptoTapeContext(stock);
  const catalysts  = stock.meta.catalysts ?? [];
  const liveItems   = catalysts.slice(0, 2).map(c => `${c.title} (${c.channel})`);
  const watchItems  = [...liveItems, ...brief.watchItems].slice(0, 4);
  return buildSwingThesis(stock, {
    bullCase:    `This week, monitor ${watchItems.join(', ')}.`,
    keyCatalyst: `${catalystDetailedContext(stock)}${cryptoTape ? `; ${cryptoTape}` : ''}`,
    risk:        brief.mainRisk,
    tradeView:   tradeViewStr(stock),
  });
}

function buildCatalystAgent(stock: RankedStock): string {
  const brief = getCompanyBrief(stock.ticker);
  return buildSwingThesis(stock, {
    keyCatalyst: catalystContext(stock),
    bullCase:    `${brief.keyDriver} Catalyst window: ${stock.horizonWeeks} weeks.`,
    risk:        `A headline needs to move estimates, multiple, risk premium, or positioning. ${brief.mainRisk}`,
  });
}

function buildForecastAgent(stock: RankedStock): string {
  const cryptoTape   = cryptoTapeContext(stock);
  const momentumRead = stock.breakdown.momentum >= 7 ? 'strong' : stock.breakdown.momentum >= 5 ? 'mixed' : 'weak';
  return buildSwingThesis(stock, {
    bullCase:    `Forecast score ${stock.breakdown.forecastSignal.toFixed(1)}/10; momentum ${momentumRead} at ${stock.breakdown.momentum.toFixed(1)}/10.`,
    keyCatalyst: cryptoTape ?? keyCatalystStr(stock),
    risk:        'Forecasts are directional; weakens if price action diverges from factors or catalysts fail to confirm.',
  });
}

function buildAssumptionAgent(stock: RankedStock): string {
  const weak        = sortedFactors(stock).slice(-2).reverse();
  const brief       = getCompanyBrief(stock.ticker);
  const watchTarget = brief.watchItems[0] ?? SCORE_LABELS[weak[0]?.[0] ?? 'forecastSignal'];
  return buildSwingThesis(stock, {
    bullCase:        `State a specific view on ${watchTarget} to test the score. E.g., "I think ${stock.ticker} beats because demand is stronger than expected."`,
    whatMattersMost: weak[0] ? `${SCORE_LABELS[weak[0][0]]} (${weak[0][1].toFixed(1)}) — weakest link; most sensitive to assumption changes` : undefined,
    risk:            'Broad or unrealistic assumptions are discounted and pushed back.',
  });
}

function buildMarketMiss(stock: RankedStock): string {
  const brief     = getCompanyBrief(stock.ticker);
  const valuation = stock.meta.valuation ?? buildValuationSignal({
    ticker: stock.ticker,
    forecastReturnPct: stock.meta.forecastReturnPct,
    factorBreakdown:   stock.breakdown,
  });
  return buildSwingThesis(stock, {
    bullCase: `Market may be underpricing ${brief.watchItems.slice(0, 2).join(' and ')}: ${valuation.summary}`,
    risk:     brief.mainRisk,
  });
}

function buildMoveHigher(stock: RankedStock): string {
  const brief   = getCompanyBrief(stock.ticker);
  const weak    = sortedFactors(stock).slice(-3).reverse();
  const weakStr = weak.map(([factor]) => SCORE_LABELS[factor].toLowerCase()).join(', ');
  return buildSwingThesis(stock, {
    bullCase:        `Rank moves up if ${brief.watchItems.slice(0, 2).join(' and ')} confirm inside 1-3 months.`,
    whatMattersMost: weak[0] ? `${SCORE_LABELS[weak[0][0]]} (${weak[0][1].toFixed(1)}) — upgrade path: improve ${weakStr}` : undefined,
    risk:            resolvedRisk(stock),
  });
}

function buildBadTrade(stock: RankedStock): string {
  const weakest = sortedFactors(stock).at(-1);
  const brief   = getCompanyBrief(stock.ticker);
  return buildSwingThesis(stock, {
    bullCase:        stock.primaryReason,
    whatMattersMost: weakest ? `${SCORE_LABELS[weakest[0]]} (${weakest[1].toFixed(1)}) — break point if this fails to improve` : undefined,
    risk:            `${brief.mainRisk} Wrong if the next catalyst fails to move estimates, multiple, or positioning and price action confirms the failure.`,
    tradeView:       tradeViewStr(stock),
  });
}

function buildNotBuyYet(stock: RankedStock): string {
  const readiness = tradeReadiness(stock);
  const brief = getCompanyBrief(stock.ticker);
  return buildSwingThesis(stock, {
    bullCase: `${stock.ticker} can still be a strong opportunity without being ready today. The green/yellow/red score ranks opportunity quality; Trade Readiness tells you whether to act now.`,
    whatMattersMost: forecastReconciliation(stock, expectedMoveForDisplay(stock)),
    keyCatalyst: `Needs confirmation from ${brief.watchItems.slice(0, 2).join(' or ')}.`,
    risk: resolvedRisk(stock),
    tradeView: `${readiness.label} - ${readiness.reason}`,
  });
}

function buildScoreBacktest(stock: RankedStock): string {
  return buildSwingThesis(stock, {
    bullCase: scoreBacktestContext(stock),
    whatMattersMost: forecastReconciliation(stock, expectedMoveForDisplay(stock)),
    keyCatalyst: catalystDetailedContext(stock),
    risk: 'Historical rank edge is still being audited; do not treat the score as a standalone trading system.',
    tradeView: tradeViewStr(stock),
  });
}

function buildPitch(stock: RankedStock): string {
  const brief      = getCompanyBrief(stock.ticker);
  const marketMiss = stock.meta.valuation?.summary ?? 'Catalyst-driven upside within the 1-3 month window.';
  return buildSwingThesis(stock, {
    bullCase:  `${brief.strategicContext} ${marketMiss}`,
    risk:      brief.mainRisk,
    tradeView: stock.signal === 'green'
      ? `Build position — ${brief.nearTermFocus}`
      : stock.signal === 'red'
        ? `Pass / avoid — ${brief.mainRisk}`
        : `Wait — ${brief.nearTermFocus}`,
  });
}

function buildEvaluate(stock: RankedStock): string {
  const best = sortedFactors(stock)[0];
  return buildSwingThesis(stock, {
    bullCase: `${stock.primaryReason}${best ? ` Strongest factor: ${SCORE_LABELS[best[0]]} (${best[1].toFixed(1)}).` : ''}`,
    risk:     resolvedRisk(stock),
  });
}

function looksLikeStockQuestion(text: string, stock: RankedStock): boolean {
  const normalized = text.toLowerCase();
  const ticker = stock.ticker.toLowerCase();
  return (
    normalized.includes('?') ||
    normalized.includes(ticker) ||
    /\b(why|what|how|when|where|should|could|would|is|are|does|do|can|tell me|explain|view|thoughts|setup|thesis|stock|company|opportunity|rank|score|buy|sell|hold|wait|risk|catalyst|earnings|valuation|forecast|momentum|news)\b/.test(normalized)
  );
}

function buildGeneralStockQuestion(stock: RankedStock, question: string): string {
  const brief = getCompanyBrief(stock.ticker);
  const expectedMove = expectedMoveForDisplay(stock);
  const top = topFactor(stock);
  return buildSwingThesis(stock, {
    bullCase: `${brief.nearTermFocus} The answer depends on whether ${brief.watchItems.slice(0, 2).join(' and ')} can change estimates, the multiple, or positioning in the next 1-3 months.`,
    whatMattersMost: `${SCORE_LABELS[top[0]]} (${top[1].toFixed(1)}) — ${factorInterpretation(stock, top[0], top[1])}`,
    keyCatalyst: `${keyCatalystStr(stock)}. ${forecastReconciliation(stock, expectedMove)}`,
    risk: resolvedRisk(stock),
    tradeView: `${tradeViewStr(stock)} Question asked: "${question.slice(0, 120)}${question.length > 120 ? '...' : ''}"`,
  });
}

function buildCompare(stock: RankedStock, peers: PeerStock[]): string {
  const ranked   = [stock, ...peers].sort((a, b) => b.score - a.score).slice(0, 5);
  const rank     = ranked.findIndex(s => s.ticker === stock.ticker) + 1;
  const bestPeer = ranked.find(s => s.ticker !== stock.ticker);
  return buildSwingThesis(stock, {
    bullCase:        `${stock.ticker} ranks ${rank} of ${ranked.length}. ${stock.primaryReason}`,
    whatMattersMost: bestPeer ? `Score vs nearest peer ${bestPeer.ticker} (${bestPeer.score.toFixed(1)}): ${bestPeer.primaryReason}` : undefined,
    risk:            resolvedRisk(stock),
  });
}

function buildLocalReply(stock: RankedStock, text: string, mode?: InvestmentMode): string | null {
  const normalized = text.toLowerCase();
  if (/\b(pm brain|run the pm|decision agent|ranked here.*decision)\b/.test(normalized)) return buildExplain(stock);
  if (/\b(catalyst agent|events? matter|headlines? matter|catalyst)\b/.test(normalized)) return buildCatalystAgent(stock);
  if (/\b(forecast agent|forecast.*momentum|market tape|timesfm|price path)\b/.test(normalized)) return buildForecastAgent(stock);
  if (/\b(assumption agent|best assumption|assumption to test|change the score|change.*valuation)\b/.test(normalized)) return buildAssumptionAgent(stock);
  if (/\b(what'?s priced|what is priced|priced in|market pricing|market miss|what is the market missing|underpricing|mispricing)\b/.test(normalized)) return buildMarketMiss(stock);
  if (/\b(backtest|historical check|score.*7|when score|next 30 days)\b/.test(normalized)) return buildScoreBacktest(stock);
  if (/\b(not a buy yet|why.*not.*buy|why.*wait|why.*work up|trade readiness|ready to buy)\b/.test(normalized)) return buildNotBuyYet(stock);
  if (/\b(what needs to be true|needs to be true|what has to happen|what would make it work|underwrite|confirm the thesis)\b/.test(normalized)) return buildNeedsTrue(stock);
  if (/\b(evidence|supporting evidence|proof|why believe|data supports|what supports this)\b/.test(normalized)) return buildEvidence(stock);
  if (/\b(monitor|watch|track|what should i watch|signals to watch|watch items)\b/.test(normalized)) return buildMonitor(stock);
  if (/\b(thesis|investment case|core case|stock thesis|company thesis)\b/.test(normalized)) return buildThesis(stock);
  if (/\b(move.*higher|score higher|improve.*score|what would.*higher)\b/.test(normalized)) return buildMoveHigher(stock);
  if (mode === 'challenge' || /\b(bad trade|make this weaker|what.*weaker|what breaks|invalidat|risk|push back|bear case|challenge)\b/.test(normalized)) return buildBadTrade(stock);
  if (/\b(bull case|supports the bull|why own|upside)\b/.test(normalized)) {
    const brief = getCompanyBrief(stock.ticker);
    return buildSwingThesis(stock, {
      bullCase:    `${brief.nearTermFocus} ${brief.keyDriver}`,
      risk:        brief.mainRisk,
      keyCatalyst: `Watch ${brief.watchItems.slice(0, 2).join(' and ')} for confirmation`,
    });
  }
  if (/\b(tell me|what is|what's|about|overview|quick read|low reasoning)\b/.test(normalized)) return buildExplain(stock);
  if (mode === 'pitch' || /\b(turn this into a pitch|pitch|weekly pitch)\b/.test(normalized)) return buildPitch(stock);
  if (mode === 'explain' || /\b(why|ranked here|score|breakdown)\b/.test(normalized)) return buildExplain(stock);
  if (mode === 'evaluate' || /\b(buy|wait|avoid|trade|recommendation|should i)\b/.test(normalized)) return buildEvaluate(stock);
  if (looksLikeStockQuestion(text, stock)) return buildGeneralStockQuestion(stock, text);
  return null;
}

function buildAssumptionReply(stock: RankedStock, payload: AssumptionUpdateResponse): string {
  const result = payload.result;
  if (!result) {
    return buildSwingThesis(stock, {
      bullCase: stock.primaryReason,
      risk:     'Assumption was not specific enough to map to a scoring factor — ranking unchanged.',
    });
  }

  const fromScore     = result.adjustedScore - result.delta;
  const primaryFactor = payload.parsedClaim?.primaryFactor
    ? factorLabel(payload.parsedClaim.primaryFactor)
    : 'the setup';
  const factorMoves = (Object.entries(result.factorDeltas) as Array<[keyof RankedStock['breakdown'], number]>)
    .filter(([, delta]) => Math.abs(delta) > 0)
    .map(([factor, delta]) => `${SCORE_LABELS[factor]} ${delta > 0 ? '+' : ''}${delta.toFixed(1)}`)
    .join(', ');
  const beforeValuation = stock.meta.valuation ?? buildValuationSignal({
    ticker: stock.ticker,
    forecastReturnPct: stock.meta.forecastReturnPct,
    factorBreakdown:   stock.breakdown,
  });
  const afterValuation = payload.financialImpact?.afterValuation ?? buildValuationSignal({
    ticker: stock.ticker,
    forecastReturnPct: stock.meta.forecastReturnPct,
    factorBreakdown:   result.adjustedBreakdown,
  });
  const valuationGapDelta = payload.financialImpact?.valuationGapDelta;
  const valuationLine = payload.financialImpact
    ? `Valuation gap ${beforeValuation.impliedUpside != null && beforeValuation.impliedUpside >= 0 ? '+' : ''}${beforeValuation.impliedUpside?.toFixed(1) ?? 'n/a'}% → ${afterValuation.impliedUpside != null && afterValuation.impliedUpside >= 0 ? '+' : ''}${afterValuation.impliedUpside?.toFixed(1) ?? 'n/a'}%${valuationGapDelta != null ? ` (${valuationGapDelta >= 0 ? '+' : ''}${valuationGapDelta.toFixed(1)} pts)` : ''}; expected move ${payload.financialImpact.expectedMoveDeltaPct >= 0 ? '+' : ''}${payload.financialImpact.expectedMoveDeltaPct.toFixed(1)}%.`
    : beforeValuation.impliedUpside != null && afterValuation.impliedUpside != null
    ? `Valuation gap ${beforeValuation.impliedUpside >= 0 ? '+' : ''}${beforeValuation.impliedUpside.toFixed(1)}% → ${afterValuation.impliedUpside >= 0 ? '+' : ''}${afterValuation.impliedUpside.toFixed(1)}%.`
    : '';

  const updatedStock: RankedStock = {
    ...stock,
    score:     result.adjustedScore,
    signal:    signalFromScore(result.adjustedScore),
    breakdown: result.adjustedBreakdown,
  };
  return buildSwingThesis(updatedStock, {
    bullCase: `${primaryFactor}${factorMoves ? ` (${factorMoves})` : ''} drove score from ${fromScore.toFixed(1)} → ${result.adjustedScore.toFixed(1)} (${capitalize(result.plausibility)} plausibility).${valuationLine ? ` ${valuationLine}` : ''}`,
    risk:     result.pushback ?? stock.mainRisk,
  });
}

function buildInputErrorReply(stock: RankedStock, reason: string): string {
  return buildSwingThesis(stock, {
    bullCase: stock.primaryReason,
    risk:     reason,
  });
}

function buildPositionEvolution(stock: RankedStock, position: ActivePosition): string {
  const daysSince = Math.floor((Date.now() - new Date(position.entryDate).getTime()) / 86400000);
  const pctChange = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;
  const dollarPnL = typeof position.notionalUsd === 'number' && Number.isFinite(position.notionalUsd)
    ? position.notionalUsd * (pctChange / 100)
    : null;
  const scoreDelta = position.currentScore - position.entryScore;
  const recentEvents = position.timeline.slice(-3).reverse();
  const eventStr = recentEvents.length > 0
    ? '\n\nTimeline:\n' + recentEvents.map(e =>
        `  ${new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} → ${e.description}`
      ).join('\n')
    : '';
  return [
    `Position: ${stock.ticker} (${daysSince}d open)`,
    `P&L: ${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%${dollarPnL !== null ? ` (${dollarPnL >= 0 ? '+' : ''}$${Math.round(dollarPnL).toLocaleString('en-US')})` : ''} · Entry: $${position.entryPrice.toFixed(2)} · Current: $${position.currentPrice.toFixed(2)}${position.notionalUsd ? ` · Amount: $${Math.round(position.notionalUsd).toLocaleString('en-US')}` : ''}`,
    `Score: ${position.entryScore.toFixed(1)} → ${position.currentScore.toFixed(1)} (${scoreDelta >= 0 ? '+' : ''}${scoreDelta.toFixed(1)}) · Drift: ${capitalize(position.thesisDrift)}`,
    `Stance: ${position.currentStance}`,
    `Next: ${position.nextCatalyst}`,
    `Risk: ${position.keyRisks}`,
  ].join('\n') + eventStr;
}

function buildPositionChanges(stock: RankedStock, position: ActivePosition): string {
  const scoreDelta    = position.currentScore - position.entryScore;
  const recentEvents  = position.timeline.slice(-5).reverse();
  const eventStr = recentEvents.map(e =>
    `  ${new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} → ${e.description}`
  ).join('\n');
  return [
    `Changes since entry — ${stock.ticker}`,
    `Score: ${position.entryScore.toFixed(1)} → ${position.currentScore.toFixed(1)} (${scoreDelta >= 0 ? '+' : ''}${scoreDelta.toFixed(1)}) · Drift: ${capitalize(position.thesisDrift)}`,
    `Thesis: ${position.thesisSummary}`,
    '',
    'Timeline:',
    eventStr || '  No logged updates yet.',
  ].join('\n');
}

function buildHoldDecision(stock: RankedStock, position: ActivePosition): string {
  const scoreDelta = position.currentScore - position.entryScore;
  let rec: string;
  if (position.thesisDrift === 'strengthening' || scoreDelta > 0.5) {
    rec = 'Hold and consider adding — thesis is strengthening.';
  } else if (position.thesisDrift === 'weakening' || scoreDelta < -1.0) {
    rec = 'Consider trimming — thesis drift is negative.';
  } else {
    rec = 'Hold — thesis is stable; no action needed yet.';
  }
  return buildSwingThesis(stock, {
    bullCase:  `${rec} ${stock.primaryReason}`,
    risk:      position.keyRisks,
    tradeView: `${position.currentStance} — entered $${position.entryPrice.toFixed(2)}`,
  });
}

function buildWhatMattersNext(stock: RankedStock, position: ActivePosition): string {
  const watchStr = position.watchItems.length > 0 ? position.watchItems.join(', ') : undefined;
  return buildSwingThesis(stock, {
    bullCase:        stock.primaryReason,
    keyCatalyst:     position.nextCatalyst,
    whatMattersMost: watchStr ? `Watch: ${watchStr}` : undefined,
    risk:            position.keyRisks,
  });
}

function isStrongerThesis(stock: RankedStock, position: ActivePosition): boolean {
  return position.thesisDrift === 'strengthening' || stock.score > position.entryScore + 0.5;
}

function buildThesisStrength(stock: RankedStock, position: ActivePosition): string {
  const scoreDelta = position.currentScore - position.entryScore;
  const stronger   = isStrongerThesis(stock, position);
  return buildSwingThesis(stock, {
    bullCase: stronger
      ? `Thesis is strengthening. Score moved ${scoreDelta >= 0 ? '+' : ''}${scoreDelta.toFixed(1)} since entry. ${stock.primaryReason}`
      : `Thesis is ${position.thesisDrift}. Score: ${position.entryScore.toFixed(1)} → ${position.currentScore.toFixed(1)}. Monitor closely.`,
    risk:      position.keyRisks,
    tradeView: `${position.currentStance} — entered $${position.entryPrice.toFixed(2)}`,
  });
}

function looksLikeAssumptionUpdate(text: string): boolean {
  return /\b(i think|i believe|i assume|assuming|assume|what if|because|my view|my assumption|stronger than|weaker than|beats?|misses?)\b/i.test(text);
}

export function InvestmentChat({ stock, peers, onStockUpdate }: Props) {
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [input,     setInput]     = useState('');
  const [streaming, setStreaming] = useState(false);
  const [scoreChange, setScoreChange] = useState<ScoreChange | null>(null);
  const [displayedScore, setDisplayedScore] = useState(stock?.score ?? 0);
  const [queued,     setQueued]     = useState(false);
  const [isInQueue,  setIsInQueue]  = useState(false);
  const [currentPosition,   setCurrentPosition]   = useState<ActivePosition | null>(null);
  const [showEnterForm,     setShowEnterForm]     = useState(false);
  const [entryPriceInput,   setEntryPriceInput]   = useState('');
  const [positionAmountInput, setPositionAmountInput] = useState('');
  const [positionConfirmed, setPositionConfirmed] = useState(false);
  const [aiVerdict, setAiVerdict] = useState<{ action: string; bullish: number; bearish: number; neutral: number; confidence: number } | null>(null);
  const [panelTab, setPanelTab] = useState<'analysis' | 'agents' | 'chat'>('agents');
  const scrollRef         = useRef<HTMLDivElement>(null);
  const abortRef          = useRef<AbortController | null>(null);
  const prevTicker        = useRef<string | null>(null);
  const scoreAnimationRef = useRef<number | null>(null);
  const clearScoreRef     = useRef<number | null>(null);
  const queuedTimeoutRef  = useRef<number | null>(null);
  const positionTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (stock?.ticker !== prevTicker.current) {
      abortRef.current?.abort();
      if (clearScoreRef.current    !== null) { window.clearTimeout(clearScoreRef.current);    clearScoreRef.current    = null; }
      if (queuedTimeoutRef.current !== null) { window.clearTimeout(queuedTimeoutRef.current); queuedTimeoutRef.current = null; }
      if (positionTimeoutRef.current !== null) { window.clearTimeout(positionTimeoutRef.current); positionTimeoutRef.current = null; }
      setMessages(stock ? [
        { role: 'user', content: "Here's why this stock is ranked here..." },
        { role: 'assistant', content: buildExplain(stock) },
      ] : []);
      setInput('');
      setStreaming(false);
      setScoreChange(null);
      setQueued(false);
      setIsInQueue(stock ? getPitchQueue().some(item => item.ticker === stock.ticker) : false);
      setDisplayedScore(stock?.score ?? 0);
      setShowEnterForm(false);
      setEntryPriceInput('');
      setPositionAmountInput('');
      setPositionConfirmed(false);
      setAiVerdict(null);
      setPanelTab('agents');
      setCurrentPosition(
        stock ? (getActivePositions().find(p => p.ticker === stock.ticker) ?? null) : null,
      );
      prevTicker.current = stock?.ticker ?? null;
    }
  }, [stock]);

  useEffect(() => {
    return () => {
      if (scoreAnimationRef.current  !== null) cancelAnimationFrame(scoreAnimationRef.current);
      if (clearScoreRef.current      !== null) window.clearTimeout(clearScoreRef.current);
      if (queuedTimeoutRef.current   !== null) window.clearTimeout(queuedTimeoutRef.current);
      if (positionTimeoutRef.current !== null) window.clearTimeout(positionTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!scoreChange) {
      setDisplayedScore(stock?.score ?? 0);
      return;
    }

    if (scoreAnimationRef.current !== null) cancelAnimationFrame(scoreAnimationRef.current);
    const startedAt = performance.now();
    const durationMs = 700;

    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      const next = scoreChange.fromScore + (scoreChange.toScore - scoreChange.fromScore) * eased;
      setDisplayedScore(Math.round(next * 10) / 10);

      if (progress < 1) {
        scoreAnimationRef.current = requestAnimationFrame(step);
      } else {
        setDisplayedScore(scoreChange.toScore);
        scoreAnimationRef.current = null;
        if (clearScoreRef.current !== null) window.clearTimeout(clearScoreRef.current);
        clearScoreRef.current = window.setTimeout(() => setScoreChange(null), 2400);
      }
    };

    setDisplayedScore(scoreChange.fromScore);
    scoreAnimationRef.current = requestAnimationFrame(step);
  }, [scoreChange, stock?.score]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string, modeOverride?: InvestmentMode) => {
      if (!stock || !text.trim() || streaming) return;

      const trimmed   = text.trim();
      const history   = [...messages, { role: 'user' as const, content: trimmed }];

      setMessages([...history, { role: 'assistant', content: '' }]);
      setInput('');
      setStreaming(true);

      if (currentPosition) {
        const norm = trimmed.toLowerCase();
        let positionReply: string | null = null;
        if (/\b(how is this evolving|position evolving|evolving)\b/.test(norm))
          positionReply = buildPositionEvolution(stock, currentPosition);
        else if (/\b(changed since|what changed|since entry)\b/.test(norm))
          positionReply = buildPositionChanges(stock, currentPosition);
        else if (/\b(should.*hold|still hold|hold this)\b/.test(norm))
          positionReply = buildHoldDecision(stock, currentPosition);
        else if (/\b(matters next|what.*next|what event|catalyst next)\b/.test(norm))
          positionReply = buildWhatMattersNext(stock, currentPosition);
        else if (/\b(thesis.*stronger|getting stronger|is the thesis|thesis improving)\b/.test(norm))
          positionReply = buildThesisStrength(stock, currentPosition);
        if (positionReply) {
          window.setTimeout(() => {
            setMessages([...history, { role: 'assistant', content: positionReply! }]);
            setStreaming(false);
          }, 120);
          return;
        }
      }

      if (looksLikeAssumptionUpdate(trimmed)) {
        const controller = new AbortController();
        abortRef.current = controller;
        const timeoutId = window.setTimeout(() => controller.abort(), 2_000);

        try {
          const res = await fetch('/api/assumption-update', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticker:       stock.ticker,
              baseScore:    stock.score,
              breakdown:    stock.breakdown,
              assumption:   trimmed,
              horizonWeeks: stock.horizonWeeks,
              forecastReturnPct: stock.meta.forecastReturnPct,
            }),
            signal: controller.signal,
          });

          const payload = await res.json().catch(() => null) as AssumptionUpdateResponse | null;
          if (!res.ok || !payload?.result) throw new Error(payload?.error ?? `HTTP ${res.status}`);

          const updated: RankedStock = {
            ...stock,
            score:     payload.result.adjustedScore,
            signal:    signalFromScore(payload.result.adjustedScore),
            breakdown: payload.result.adjustedBreakdown,
            meta: {
              ...stock.meta,
              valuation: payload.financialImpact?.afterValuation ?? buildValuationSignal({
                ticker: stock.ticker,
                forecastReturnPct: stock.meta.forecastReturnPct,
                factorBreakdown: payload.result.adjustedBreakdown,
              }),
            },
            primaryReason: payload.result.delta > 0
              ? `User assumption strengthens ${factorLabel(payload.parsedClaim?.primaryFactor ?? 'score')}`
              : payload.result.delta < 0
                ? `User assumption weakens ${factorLabel(payload.parsedClaim?.primaryFactor ?? 'score')}`
                : stock.primaryReason,
            mainRisk: payload.result.pushback ?? stock.mainRisk,
          };
          setScoreChange({
            fromScore: stock.score,
            toScore: payload.result.adjustedScore,
            delta: payload.result.delta,
            fromSignal: stock.signal,
            toSignal: signalFromScore(payload.result.adjustedScore),
            factorDeltas: payload.result.factorDeltas,
            primaryFactor: payload.parsedClaim?.primaryFactor ?? 'score',
            explanation: payload.result.explanation,
          });
          onStockUpdate?.(updated);
          if (currentPosition) {
            const note = `Score updated: ${stock.score.toFixed(1)} → ${payload.result.adjustedScore.toFixed(1)} via assumption — ${payload.result.explanation}`;
            updatePositionThesis(currentPosition.id, payload.result.adjustedScore, signalFromScore(payload.result.adjustedScore), note);
            setCurrentPosition(prev => prev ? { ...prev, currentScore: payload.result!.adjustedScore, currentSignal: signalFromScore(payload.result!.adjustedScore) } : prev);
          }
          setMessages([...history, { role: 'assistant', content: buildAssumptionReply(stock, payload) }]);
          return;
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            setMessages([...history, { role: 'assistant', content: buildInputErrorReply(stock, 'The score update timed out after 2 seconds.') }]);
            return;
          }
          console.error('[InvestmentChat assumption-update]', err);
          setMessages([...history, { role: 'assistant', content: buildInputErrorReply(stock, 'The assumption needs a clearer driver such as earnings, growth, valuation, momentum, or risk.') }]);
          return;
        } finally {
          window.clearTimeout(timeoutId);
          setStreaming(false);
        }
      }

      if (modeOverride === 'compare') {
        window.setTimeout(() => {
          setMessages([...history, { role: 'assistant', content: buildCompare(stock, peers) }]);
          setStreaming(false);
        }, 120);
        return;
      }

      const localReply = buildLocalReply(stock, trimmed, modeOverride);
      if (localReply) {
        window.setTimeout(() => {
          setMessages([...history, { role: 'assistant', content: localReply }]);
          setStreaming(false);
        }, 120);
        return;
      }

      const controller  = new AbortController();
      abortRef.current  = controller;
      const timeoutId = window.setTimeout(() => controller.abort(), 2_000);

      try {
        const body = {
          message: trimmed,
          ...(modeOverride ? { mode: modeOverride } : {}),
          context: {
            primaryTicker:     stock.ticker,
            score:             stock.score,
            signal:            stock.signal,
            horizonWeeks:      stock.horizonWeeks,
            breakdown:         stock.breakdown,
            primaryReason:     stock.primaryReason,
            mainRisk:          stock.mainRisk,
            forecastReturnPct: stock.meta.forecastReturnPct,
            catalystCount:     stock.meta.catalystCount,
            events:            [],
            recentPrices:      [],
            peers,
            history: history.map(m => ({ role: m.role, content: m.content })),
          },
        };

        const res = await fetch('/api/assistant', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
          signal:  controller.signal,
        });

        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== 'assistant') return prev;
            return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
          });
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setMessages([...history, { role: 'assistant', content: buildExplain(stock) }]);
          return;
        }
        console.error('[InvestmentChat]', err);
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.content === '') {
            return [
              ...prev.slice(0, -1),
              { role: 'assistant', content: buildInputErrorReply(stock, 'AI provider unavailable; using current score context only.') },
            ];
          }
          return prev;
        });
      } finally {
        window.clearTimeout(timeoutId);
        setStreaming(false);
      }
    },
    [stock, peers, messages, streaming, onStockUpdate, currentPosition],
  );

  const handleAddToQueue = useCallback(() => {
    if (!stock) return;
    try {
      upsertPitchQueueItem(buildPitchQueueItemFromRankedStock(stock));
      setIsInQueue(true);
    } catch {
      // localStorage unavailable — silent no-op
    }
    if (queuedTimeoutRef.current !== null) window.clearTimeout(queuedTimeoutRef.current);
    setQueued(true);
    queuedTimeoutRef.current = window.setTimeout(() => setQueued(false), 2000);
  }, [stock]);

  const handleEnterPosition = useCallback(() => {
    if (!stock) return;
    const price = parseFloat(entryPriceInput);
    const amount = parseFloat(positionAmountInput);
    if (isNaN(price) || price <= 0) return;
    const position = buildPositionFromRankedStock(stock, price, !isNaN(amount) && amount > 0 ? amount : null);
    const updated  = addPosition(position);
    setCurrentPosition(updated.find(p => p.id === position.id) ?? null);
    setShowEnterForm(false);
    setEntryPriceInput('');
    setPositionAmountInput('');
    if (positionTimeoutRef.current !== null) window.clearTimeout(positionTimeoutRef.current);
    setPositionConfirmed(true);
    positionTimeoutRef.current = window.setTimeout(() => setPositionConfirmed(false), 2400);
  }, [stock, entryPriceInput, positionAmountInput]);

  // ── Empty state ──────────────────────────────────────────────────────────

  if (!stock) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--cb-surface)] ring-1 ring-[var(--cb-border)]">
          <span className="text-xl">📊</span>
        </div>
        <p className="text-sm font-medium text-[var(--cb-text-primary)]">Select a stock</p>
        <p className="max-w-[220px] text-xs text-[var(--cb-text-muted)]">
          Click any opportunity on the left to open the investment assistant.
        </p>
      </div>
    );
  }

  // ── Chat ─────────────────────────────────────────────────────────────────

  const cp = contextPrompt(stock.signal, stock.breakdown);
  const brief = getCompanyBrief(stock.ticker);
  const liveValuation = buildValuationSignal({
    ticker: stock.ticker,
    forecastReturnPct: stock.meta.forecastReturnPct,
    factorBreakdown: stock.breakdown,
  });
  const cryptoTape = cryptoTapeContext(stock);
  const sourceCards = [
    { label: 'Company file',  value: brief.strategicContext, prompt: 'Tell me about this company and why it is in the ranked universe.' },
    { label: 'Score basis',   value: stock.primaryReason,   prompt: 'Why is this stock ranked here and what drives the score?', mode: 'explain' as InvestmentMode },
    { label: 'Catalyst tape', value: catalystDetailedContext(stock), prompt: 'Run the catalyst agent: what events or headlines matter most over the next 1-3 months?' },
    ...(cryptoTape ? [{ label: 'Crypto tape', value: cryptoTape, prompt: 'Run the forecast agent: what does the forecast, momentum, and market tape imply?' }] : []),
    { label: 'Risk file',     value: resolvedRisk(stock),   prompt: 'What are the biggest risk factors that could break this trade?', mode: 'challenge' as InvestmentMode },
    { label: 'Valuation note', value: liveValuation.summary, prompt: 'Is this stock overpriced relative to its growth expectations?', mode: 'evaluate' as InvestmentMode },
  ];

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">

      {/* ── Sticky header: score strip + action buttons ── */}
      <PMDecisionStrip stock={stock} displayedScore={displayedScore} scoreChange={scoreChange} />

      {/* AI Verdict banner */}
      {aiVerdict && (() => {
        const total = aiVerdict.bullish + aiVerdict.bearish + aiVerdict.neutral;
        const bullPct = total > 0 ? Math.round((aiVerdict.bullish / total) * 100) : 0;
        const act = aiVerdict.action.toLowerCase();
        const isBull = act === 'buy' || act === 'cover';
        const isBear = act === 'sell' || act === 'short';
        const bannerClasses = isBull
          ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
          : isBear
          ? 'border-rose-400/40 bg-rose-500/15 text-rose-200'
          : 'border-amber-400/30 bg-amber-500/12 text-amber-200';
        const dotClass = isBull ? 'bg-emerald-400' : isBear ? 'bg-rose-400' : 'bg-amber-400';
        const glowClass = isBull
          ? 'shadow-[0_2px_16px_rgba(52,211,153,0.18)]'
          : isBear ? 'shadow-[0_2px_16px_rgba(251,113,133,0.18)]' : '';
        return (
          <div className={cn('shrink-0 flex items-center gap-3 border-b px-4 py-2', bannerClasses, glowClass)}>
            <span className={cn('h-2 w-2 shrink-0 rounded-full animate-pulse', dotClass)} />
            <span className="text-[10px] font-bold uppercase tracking-widest">AI Hedge Fund</span>
            <span className="text-[11px] font-black capitalize tracking-tight">{aiVerdict.action}</span>
            <span className="text-[10px] opacity-70">{aiVerdict.confidence}% confidence</span>
            <div className="mx-2 h-3 w-px bg-current opacity-20" />
            <span className="text-[10px]">
              <span className="font-semibold">{aiVerdict.bullish}</span><span className="opacity-60"> bull · </span>
              <span className="font-semibold">{aiVerdict.bearish}</span><span className="opacity-60"> bear · </span>
              <span className="opacity-60">{bullPct}% bullish</span>
            </span>
          </div>
        );
      })()}

      {/* Action buttons */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-[var(--cb-border)] px-4 py-2">
        <button
          type="button"
          onClick={isInQueue ? undefined : handleAddToQueue}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors',
            queued || isInQueue
              ? 'cursor-default border-emerald-400/30 bg-emerald-500/15 text-emerald-300'
              : 'border-[var(--cb-border)] text-[var(--cb-text-muted)] hover:border-[var(--cb-border-strong)] hover:text-[var(--cb-text-primary)]',
          )}
        >
          {queued
            ? <><CheckCircle className="h-3 w-3" />&nbsp;Added to Pitch Queue</>
            : isInQueue
              ? <><CheckCircle className="h-3 w-3" />&nbsp;In Queue</>
              : <><Plus className="h-3 w-3" />&nbsp;Queue</>
          }
        </button>
        {queued && (
          <a href="/pitch-queue" className="text-[10px] text-emerald-400 hover:underline">
            View Queue →
          </a>
        )}

        {currentPosition ? (
          <a
            href="/portfolio"
            className="flex items-center gap-1.5 rounded-lg border border-blue-400/30 bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-300 hover:underline"
          >
            <TrendingUp className="h-3 w-3" />
            Tracked Idea ↗
          </a>
        ) : showEnterForm ? (
          <div className="flex flex-wrap items-center gap-1">
            <input
              type="number"
              value={positionAmountInput}
              onChange={e => setPositionAmountInput(e.target.value)}
              placeholder="$ amount"
              className="w-24 rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] px-2 py-1 text-[11px] text-[var(--cb-text-primary)] focus:outline-none"
              onKeyDown={e => { if (e.key === 'Enter') handleEnterPosition(); if (e.key === 'Escape') setShowEnterForm(false); }}
            />
            <input
              type="number"
              value={entryPriceInput}
              onChange={e => setEntryPriceInput(e.target.value)}
              placeholder="Ref price"
              className="w-20 rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] px-2 py-1 text-[11px] text-[var(--cb-text-primary)] focus:outline-none"
              onKeyDown={e => { if (e.key === 'Enter') handleEnterPosition(); if (e.key === 'Escape') setShowEnterForm(false); }}
              autoFocus
            />
            <button type="button" onClick={handleEnterPosition} className="rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white">✓</button>
            <button type="button" onClick={() => setShowEnterForm(false)} className="rounded-lg border border-[var(--cb-border)] px-2 py-1 text-[11px] text-[var(--cb-text-muted)]">✕</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowEnterForm(true)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors',
              positionConfirmed
                ? 'cursor-default border-blue-400/30 bg-blue-500/10 text-blue-300'
                : 'border-[var(--cb-border)] text-[var(--cb-text-muted)] hover:border-blue-400/30 hover:text-blue-300',
            )}
          >
            <TrendingUp className="h-3 w-3" />
            {positionConfirmed ? 'Idea Tracked' : 'Paper Track'}
          </button>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div className="shrink-0 flex border-b border-[var(--cb-border)] bg-[var(--cb-surface)]">
        {([ ['agents', 'AI Agents'], ['analysis', 'Analysis'], ['chat', 'Chat'] ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setPanelTab(tab)}
            className={cn(
              'flex-1 py-2 text-[11px] font-semibold tracking-wide transition-colors relative',
              panelTab === tab
                ? 'text-[var(--cb-text-primary)]'
                : 'text-[var(--cb-text-muted)] hover:text-[var(--cb-text-secondary)]',
            )}
          >
            {label}
            {tab === 'agents' && aiVerdict && (
              <span className={cn(
                'ml-1.5 inline-block h-1.5 w-1.5 rounded-full',
                aiVerdict.action.toLowerCase() === 'buy' || aiVerdict.action.toLowerCase() === 'cover'
                  ? 'bg-emerald-400' : aiVerdict.action.toLowerCase() === 'sell' || aiVerdict.action.toLowerCase() === 'short'
                  ? 'bg-rose-400' : 'bg-amber-400',
              )} />
            )}
            {panelTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--cb-text-primary)]" />
            )}
          </button>
        ))}
      </div>

      {/* ── Analysis tab ── */}
      {panelTab === 'analysis' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TradeStructurePanel stock={stock} />
          <ScenarioEngine stock={stock} onScenarioClick={text => sendMessage(text)} disabled={streaming} />
          <CatalystTimeline stock={stock} onCatalystClick={text => sendMessage(text)} disabled={streaming} />
          <DeepResearchPanel
            stock={stock}
            scoreChange={scoreChange}
            sourceCards={sourceCards}
            onPrompt={(text, mode) => sendMessage(text, mode as InvestmentMode | undefined)}
            disabled={streaming}
          />
        </div>
      )}

      {/* ── AI Agents tab — the three integrated repos ── */}
      {panelTab === 'agents' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Repo labels */}
          <div className="px-4 pt-3 pb-1 flex flex-wrap gap-2">
            {[
              { label: 'virattt/ai-hedge-fund', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-400/30' },
              { label: 'tauricresearch/TradingAgents', color: 'text-blue-400 bg-blue-500/10 border-blue-400/30' },
              { label: 'virattt/dexter', color: 'text-violet-400 bg-violet-500/10 border-violet-400/30' },
            ].map(r => (
              <span key={r.label} className={cn('rounded border px-2 py-0.5 text-[9px] font-mono font-semibold', r.color)}>
                {r.label}
              </span>
            ))}
          </div>
          <HedgeFundPanel
            ticker={stock.ticker}
            autoRun
            onResult={r => {
              if (!r.decision) return;

              // ── Dynamic ranking: AI consensus adjusts the live score ──────
              const total = r.consensus.bullish + r.consensus.bearish + r.consensus.neutral;
              const bullPct = total > 0 ? r.consensus.bullish / total : 0.5;
              // Maps 0% bull → -1.5, 50% → 0, 100% → +1.5
              const consensusAdj = (bullPct - 0.5) * 3;
              // Action override: buy/cover add 0.4, sell/short subtract 0.4
              const act = r.decision.action.toLowerCase();
              const actionAdj = (act === 'buy' || act === 'cover') ? 0.4
                : (act === 'sell' || act === 'short') ? -0.4 : 0;

              const rawNew = stock.score + consensusAdj + actionAdj;
              const newScore = Math.round(Math.max(0, Math.min(10, rawNew)) * 10) / 10;
              const newSignal = signalFromScore(newScore);

              onStockUpdate?.({
                ...stock,
                score: newScore,
                signal: newSignal,
                primaryReason: `AI: ${r.decision.action} (${r.consensus.bullish}↑ ${r.consensus.bearish}↓) — ${stock.primaryReason}`,
                meta: { ...stock.meta, dataSource: 'live' },
              });

              setAiVerdict({
                action: r.decision.action,
                bullish: r.consensus.bullish,
                bearish: r.consensus.bearish,
                neutral: r.consensus.neutral,
                confidence: r.decision.confidence,
              });
            }}
          />
          <TradingAgentsPanel ticker={stock.ticker} />
          <DexterPanel ticker={stock.ticker} />
        </div>
      )}

      {/* ── Chat tab ── */}
      {panelTab === 'chat' && (
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
        >
        {messages.map((msg, i) => {
          const convictionLevel =
            msg.role === 'assistant' && msg.content
              ? parseConvictionLevel(msg.content)
              : null;
          return (
            <div
              key={i}
              className={cn(
                'flex flex-col',
                msg.role === 'user' ? 'items-end' : 'items-start',
              )}
            >
              <div
                className={cn(
                  'max-w-[92%] overflow-hidden rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words',
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-[var(--cb-surface)] text-[var(--cb-text-body)] ring-1 ring-[var(--cb-border)]',
                )}
              >
                {msg.content || (
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:0.1s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:0.2s]" />
                  </span>
                )}
              </div>
              {convictionLevel && (
                <div className="mt-1 w-full max-w-[85%] px-1">
                  <ConvictionMeter level={convictionLevel} />
                </div>
              )}
            </div>
          );
        })}
        </div>
      )}

      {/* Suggested prompts + input — only on chat tab */}
      {panelTab === 'chat' && <div className="shrink-0 border-t border-[var(--cb-border)] px-4 py-2">
        {currentPosition && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-blue-400/70">
              Position
            </span>
            {(
              [
                { label: 'Evolving?',     text: 'How is this position evolving?' },
                { label: 'What changed?', text: 'What changed since entry?' },
                { label: 'Still hold?',   text: 'Should we still hold this?' },
                { label: 'Next event?',   text: 'What event matters next for this position?' },
                { label: 'Thesis?',       text: 'Is the thesis getting stronger?' },
              ] as const
            ).map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => sendMessage(p.text)}
                disabled={streaming}
                className="rounded-lg border border-blue-400/20 bg-blue-500/8 px-2 py-1 text-[10px] font-medium text-blue-300 transition-colors hover:border-blue-300/40 hover:bg-blue-500/12 disabled:opacity-50"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--cb-text-muted)]">
            Agents
          </span>
          {AGENT_PROMPTS.map(agent => (
            <button
              key={agent.label}
              type="button"
              onClick={() => sendMessage(agent.text, agent.mode)}
              disabled={streaming}
              className="rounded-lg border border-blue-400/20 bg-blue-500/10 px-2 py-1 text-[10px] font-semibold text-blue-200 transition-colors hover:border-blue-300/40 hover:bg-blue-500/15 disabled:opacity-50"
            >
              {agent.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STANDARD_PROMPTS.map(qp => (
            <button
              key={qp.mode}
              type="button"
              onClick={() => sendMessage(qp.text, qp.mode)}
              disabled={streaming}
              className="rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] px-2 py-1 text-[10px] font-medium text-[var(--cb-text-secondary)] transition-colors hover:border-[var(--cb-border-strong)] hover:text-[var(--cb-text-primary)] disabled:opacity-50"
            >
              {qp.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => sendMessage(cp.text, cp.mode)}
            disabled={streaming}
            className={cn(
              'rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors disabled:opacity-50',
              stock.signal === 'green'
                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15'
                : stock.signal === 'red'
                  ? 'border-rose-400/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15'
                  : 'border-amber-400/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15',
            )}
          >
            {cp.label}
          </button>
        </div>
      </div>}

      {panelTab === 'chat' && <div className="shrink-0 border-t border-[var(--cb-border)] px-4 py-3">
        <form
          onSubmit={e => { e.preventDefault(); sendMessage(input); }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about this stock…"
            disabled={streaming}
            className="min-w-0 flex-1 rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] px-3 py-2 text-sm text-[var(--cb-text-primary)] placeholder:text-[var(--cb-text-muted)] focus:border-[var(--cb-border-strong)] focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {streaming
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />
            }
          </button>
        </form>
      </div>}
    </div>
  );
}
