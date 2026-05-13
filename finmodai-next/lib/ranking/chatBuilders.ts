import type { RankedStock } from '@/lib/ranking/types';
import { getCompanyBrief } from '@/lib/ranking/companyBriefs';
import { buildValuationSignal } from '@/lib/valuation/signal';
import {
  type InvestmentMode, type ScoreFactor, SCORE_LABELS,
  capitalize, factorLabel, sortedFactors, topFactor,
  isGenericReason, resolvedRisk, hasLiveConfirmation, hasForecastConflict,
  tradeReadiness, factorInterpretation, convictionGrade, expectedMoveForDisplay,
  keyCatalystStr, signalFromScore, pmBullCaseRead, finalPmRead,
  tradeViewStr, thesisDrift, forecastReconciliation, contextPrompt, setupLabel,
} from '@/lib/ranking/chatHelpers';

export type PeerStock = Pick<
  RankedStock,
  'ticker' | 'score' | 'signal' | 'primaryReason' | 'mainRisk' | 'breakdown'
>;

export function buildSwingThesis(
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
  const conviction   = convictionGrade(stock);
  const signalWord   = setupLabel(stock.signal).toUpperCase();
  return [
    `Setup: ${signalWord} · ${stock.score.toFixed(1)}/10`,
    `Expected Move: ${expectedMoveStr(stock)}`,
    `What Matters Most: ${options.whatMattersMost ?? `${SCORE_LABELS[topK]} (${topV.toFixed(1)}) — ${factorInterpretation(stock, topK, topV)}`}`,
    `Key Catalyst: ${options.keyCatalyst ?? keyCatalystStr(stock)}`,
    `Bull Case: ${options.bullCase ?? stock.primaryReason}`,
    `Risk: ${options.risk ?? resolvedRisk(stock)}`,
    `Trade View: ${options.tradeView ?? tradeViewStr(stock)}`,
    `Conviction: ${conviction.level} — ${conviction.read}`,
    ...(conviction.aiRead ? [`AI Sentiment: ${conviction.aiRead}`] : []),
    `Thesis Drift: ${thesisDrift(stock)}`,
  ].join('\n');
}

export function catalystContext(stock: RankedStock): string {
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

export function catalystDetailedContext(stock: RankedStock): string {
  const catalysts = stock.meta.catalysts ?? [];
  if (catalysts.length === 0) return catalystContext(stock);
  const top = catalysts[0];
  const channel = factorLabel(top.channel);
  return `${channel}: ${top.title}. ${top.reason} ${top.estimateRisk}`;
}

export function scoreBacktestContext(stock: RankedStock): string {
  const forecast = stock.meta.forecastReturnPct;
  const signal = stock.score >= 7 ? 'high-score' : stock.score >= 4 ? 'watchlist' : 'low-score';
  const forecastLine = forecast == null
    ? 'No live TimesFM return is loaded yet.'
    : `Current forward check is ${forecast >= 0 ? '+' : ''}${forecast.toFixed(1)}% over the forecast window.`;
  return `Lightweight rank check: ${signal} profile (${stock.score.toFixed(1)}/10). ${forecastLine} Use this as a forward score audit, not a fully validated historical edge yet.`;
}

export function expectedMoveStr(stock: RankedStock): string {
  if (stock.meta.forecastReturnPct != null) {
    const sign = stock.meta.forecastReturnPct >= 0 ? '+' : '';
    return `${sign}${stock.meta.forecastReturnPct.toFixed(1)}% (${stock.horizonWeeks} wk forecast)`;
  }
  return `Forecast signal ${stock.breakdown.forecastSignal.toFixed(1)}/10 — no price target from model`;
}

export function cryptoTapeContext(stock: RankedStock): string | null {
  const regime = stock.meta.cryptoRegime;
  if (!regime) return null;
  return `${regime.regime.toUpperCase()} crypto tape: BTC 7D ${regime.btc7dPct >= 0 ? '+' : ''}${regime.btc7dPct.toFixed(1)}%, BTC 30D ${regime.btc30dPct >= 0 ? '+' : ''}${regime.btc30dPct.toFixed(1)}%, ETH 7D ${regime.eth7dPct >= 0 ? '+' : ''}${regime.eth7dPct.toFixed(1)}%, vol ${regime.dailyVolPct.toFixed(1)}%. ${regime.pmRead}`;
}

export function buildExplain(stock: RankedStock): string {
  const brief        = getCompanyBrief(stock.ticker);
  const cryptoTape   = cryptoTapeContext(stock);
  const [topK, topV] = topFactor(stock);
  return buildSwingThesis(stock, {
    bullCase:        `${brief.strategicContext} ${brief.nearTermFocus}`,
    whatMattersMost: `${SCORE_LABELS[topK]} (${topV.toFixed(1)}) — ${factorInterpretation(stock, topK, topV)}${cryptoTape ? `; ${cryptoTape}` : ''}`,
  });
}

export function buildThesis(stock: RankedStock): string {
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

export function buildNeedsTrue(stock: RankedStock): string {
  const brief   = getCompanyBrief(stock.ticker);
  const weakest = sortedFactors(stock).slice(-2).reverse();
  return buildSwingThesis(stock, {
    bullCase:        `${brief.watchItems.slice(0, 3).join(', ')} must confirm over the next 1-3 months.`,
    whatMattersMost: weakest[0] ? `${SCORE_LABELS[weakest[0][0]]} (${weakest[0][1].toFixed(1)}) — score re-rates if this improves` : undefined,
    risk:            `If ${brief.watchItems[0] ?? 'the main catalyst'} disappoints: ${brief.mainRisk}`,
  });
}

export function buildEvidence(stock: RankedStock): string {
  const brief = getCompanyBrief(stock.ticker);
  const top   = sortedFactors(stock)[0];
  return buildSwingThesis(stock, {
    bullCase: top
      ? `${SCORE_LABELS[top[0]]} (${top[1].toFixed(1)}) leads; watch ${brief.watchItems.slice(0, 2).join(' and ')} for confirmation.`
      : stock.primaryReason,
    risk: resolvedRisk(stock),
  });
}

export function buildMonitor(stock: RankedStock): string {
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

export function buildCatalystAgent(stock: RankedStock): string {
  const brief = getCompanyBrief(stock.ticker);
  return buildSwingThesis(stock, {
    keyCatalyst: catalystContext(stock),
    bullCase:    `${brief.keyDriver} Catalyst window: ${stock.horizonWeeks} weeks.`,
    risk:        `A headline needs to move estimates, multiple, risk premium, or positioning. ${brief.mainRisk}`,
  });
}

export function buildForecastAgent(stock: RankedStock): string {
  const cryptoTape   = cryptoTapeContext(stock);
  const momentumRead = stock.breakdown.momentum >= 7 ? 'strong' : stock.breakdown.momentum >= 5 ? 'mixed' : 'weak';
  return buildSwingThesis(stock, {
    bullCase:    `Forecast score ${stock.breakdown.forecastSignal.toFixed(1)}/10; momentum ${momentumRead} at ${stock.breakdown.momentum.toFixed(1)}/10.`,
    keyCatalyst: cryptoTape ?? keyCatalystStr(stock),
    risk:        'Forecasts are directional; weakens if price action diverges from factors or catalysts fail to confirm.',
  });
}

export function buildAssumptionAgent(stock: RankedStock): string {
  const weak        = sortedFactors(stock).slice(-2).reverse();
  const brief       = getCompanyBrief(stock.ticker);
  const watchTarget = brief.watchItems[0] ?? SCORE_LABELS[weak[0]?.[0] ?? 'forecastSignal'];
  return buildSwingThesis(stock, {
    bullCase:        `State a specific view on ${watchTarget} to test the score. E.g., "I think ${stock.ticker} beats because demand is stronger than expected."`,
    whatMattersMost: weak[0] ? `${SCORE_LABELS[weak[0][0]]} (${weak[0][1].toFixed(1)}) — weakest link; most sensitive to assumption changes` : undefined,
    risk:            'Broad or unrealistic assumptions are discounted and pushed back.',
  });
}

export function buildMarketMiss(stock: RankedStock): string {
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

export function buildMoveHigher(stock: RankedStock): string {
  const brief   = getCompanyBrief(stock.ticker);
  const weak    = sortedFactors(stock).slice(-3).reverse();
  const weakStr = weak.map(([factor]) => SCORE_LABELS[factor].toLowerCase()).join(', ');
  return buildSwingThesis(stock, {
    bullCase:        `Rank moves up if ${brief.watchItems.slice(0, 2).join(' and ')} confirm inside 1-3 months.`,
    whatMattersMost: weak[0] ? `${SCORE_LABELS[weak[0][0]]} (${weak[0][1].toFixed(1)}) — upgrade path: improve ${weakStr}` : undefined,
    risk:            resolvedRisk(stock),
  });
}

export function buildBadTrade(stock: RankedStock): string {
  const weakest = sortedFactors(stock).at(-1);
  const brief   = getCompanyBrief(stock.ticker);
  return buildSwingThesis(stock, {
    bullCase:        stock.primaryReason,
    whatMattersMost: weakest ? `${SCORE_LABELS[weakest[0]]} (${weakest[1].toFixed(1)}) — break point if this fails to improve` : undefined,
    risk:            `${brief.mainRisk} Wrong if the next catalyst fails to move estimates, multiple, or positioning and price action confirms the failure.`,
    tradeView:       tradeViewStr(stock),
  });
}

export function buildNotBuyYet(stock: RankedStock): string {
  const readiness = tradeReadiness(stock);
  const brief = getCompanyBrief(stock.ticker);
  return buildSwingThesis(stock, {
    bullCase: `${stock.ticker} can still be a strong company or opportunity without being action-ready today. Ready / Work Up / Repair ranks setup quality; Trade Readiness tells you whether to act now.`,
    whatMattersMost: forecastReconciliation(stock, expectedMoveForDisplay(stock)),
    keyCatalyst: `Needs confirmation from ${brief.watchItems.slice(0, 2).join(' or ')}.`,
    risk: resolvedRisk(stock),
    tradeView: `${readiness.label} - ${readiness.reason}`,
  });
}

export function buildScoreBacktest(stock: RankedStock): string {
  return buildSwingThesis(stock, {
    bullCase: scoreBacktestContext(stock),
    whatMattersMost: forecastReconciliation(stock, expectedMoveForDisplay(stock)),
    keyCatalyst: catalystDetailedContext(stock),
    risk: 'Historical rank edge is still being audited; do not treat the score as a standalone trading system.',
    tradeView: tradeViewStr(stock),
  });
}

export function buildPitch(stock: RankedStock): string {
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

export function buildEvaluate(stock: RankedStock): string {
  const best = sortedFactors(stock)[0];
  return buildSwingThesis(stock, {
    bullCase: `${stock.primaryReason}${best ? ` Strongest factor: ${SCORE_LABELS[best[0]]} (${best[1].toFixed(1)}).` : ''}`,
    risk:     resolvedRisk(stock),
  });
}

export function looksLikeStockQuestion(text: string, stock: RankedStock): boolean {
  const normalized = text.toLowerCase();
  const ticker = stock.ticker.toLowerCase();
  return (
    normalized.includes('?') ||
    normalized.includes(ticker) ||
    /\b(why|what|how|when|where|should|could|would|is|are|does|do|can|tell me|explain|view|thoughts|setup|thesis|stock|company|opportunity|rank|score|buy|sell|hold|wait|risk|catalyst|earnings|valuation|forecast|momentum|news)\b/.test(normalized)
  );
}

export function buildGeneralStockQuestion(stock: RankedStock, question: string): string {
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

export function buildCompare(stock: RankedStock, peers: PeerStock[]): string {
  const ranked   = [stock, ...peers].sort((a, b) => b.score - a.score).slice(0, 5);
  const rank     = ranked.findIndex(s => s.ticker === stock.ticker) + 1;
  const bestPeer = ranked.find(s => s.ticker !== stock.ticker);
  return buildSwingThesis(stock, {
    bullCase:        `${stock.ticker} ranks ${rank} of ${ranked.length}. ${stock.primaryReason}`,
    whatMattersMost: bestPeer ? `Score vs nearest peer ${bestPeer.ticker} (${bestPeer.score.toFixed(1)}): ${bestPeer.primaryReason}` : undefined,
    risk:            resolvedRisk(stock),
  });
}

export function buildLocalReply(stock: RankedStock, text: string, mode?: InvestmentMode): string | null {
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
