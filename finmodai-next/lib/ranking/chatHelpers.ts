import { getCompanyBrief } from '@/lib/ranking/companyBriefs';
import { signalFromOpportunityScore } from '@/lib/ranking/signals';
import { buildExpectedMoveContext, type ExpectedMoveContext } from '@/lib/ranking/expectedMove';
import type { RankedStock } from '@/lib/ranking/types';

export type ScoreFactor = keyof RankedStock['breakdown'];
export type InvestmentMode = 'explain' | 'evaluate' | 'challenge' | 'compare' | 'pitch';

export const SCORE_LABELS: Record<ScoreFactor, string> = {
  forecastSignal:   'Forecast',
  catalystStrength: 'Catalysts',
  momentum:         'Momentum',
  earningsSetup:    'Earnings',
  valuationSignal:  'Valuation',
  riskAdjustment:   'Risk',
};

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function factorLabel(factor: string): string {
  if (factor in SCORE_LABELS) return SCORE_LABELS[factor as ScoreFactor];
  return factor.replace(/([A-Z])/g, ' $1').replace(/[_-]+/g, ' ').trim().replace(/^./, c => c.toUpperCase());
}

export function sortedFactors(stock: RankedStock): Array<[ScoreFactor, number]> {
  return (Object.entries(stock.breakdown) as Array<[ScoreFactor, number]>)
    .sort((a, b) => b[1] - a[1]);
}

export function topFactor(stock: RankedStock): [ScoreFactor, number] {
  return sortedFactors(stock)[0] ?? ['forecastSignal', stock.breakdown.forecastSignal];
}

export function isGenericReason(value: string): boolean {
  return /forecast signal weak|model data unavailable|fallback profile|no real-time|model unavailable/i.test(value);
}

export function resolvedRisk(stock: RankedStock): string {
  const brief = getCompanyBrief(stock.ticker);
  return isGenericReason(stock.mainRisk) ? brief.mainRisk : stock.mainRisk;
}

export function hasLiveConfirmation(stock: RankedStock): boolean {
  return (
    stock.meta.forecastReturnPct !== null ||
    (stock.meta.companyCatalystCount ?? 0) > 0 ||
    (stock.meta.catalysts ?? []).some(c => c.kind === 'company_news' || c.kind === 'earnings')
  );
}

export function hasForecastConflict(stock: RankedStock): boolean {
  const forecast = stock.meta.forecastReturnPct;
  if (forecast === null) return false;
  return (stock.signal === 'green' && forecast <= -2) || (stock.signal === 'red' && forecast >= 2);
}

export function tradeReadiness(stock: RankedStock): {
  label: 'Ready' | 'Work up' | 'Wait for catalyst';
  reason: string;
} {
  const brief = getCompanyBrief(stock.ticker);
  if (hasForecastConflict(stock)) {
    return {
      label: 'Wait for catalyst',
      reason: `score is strong but the TimesFM tape conflicts; wait for ${brief.watchItems[0]?.toLowerCase() ?? 'the next catalyst'} to confirm`,
    };
  }
  if (stock.signal === 'green' && hasLiveConfirmation(stock)) {
    return { label: 'Ready', reason: 'score and live forecast/catalyst context are aligned; size still depends on risk' };
  }
  if (stock.signal === 'green') {
    return { label: 'Work up', reason: 'green opportunity, but needs live headline or forecast confirmation before sizing' };
  }
  if (stock.signal === 'yellow') {
    return { label: 'Work up', reason: `interesting but needs ${brief.watchItems[0]?.toLowerCase() ?? 'one catalyst'} to improve the setup` };
  }
  return { label: 'Wait for catalyst', reason: 'risk/reward is not ready; wait for score factors to repair' };
}

export function factorInterpretation(stock: RankedStock, key: ScoreFactor, value: number): string {
  if (key === 'forecastSignal') {
    if (stock.meta.forecastReturnPct == null) return 'Fallback until live price path refreshes.';
    if (value >= 7.5) return 'Model signals strong upside.';
    if (value >= 5)   return 'Leans constructive; not confirmed.';
    return 'Weak — no clear price catalyst.';
  }
  if (key === 'catalystStrength') {
    if (stock.meta.catalystCount === 0) return 'No live headline yet.';
    if (value >= 7.5) return 'Strong catalyst density.';
    if (value >= 5)   return 'Some catalysts; mix unresolved.';
    return 'Thin pipeline.';
  }
  if (key === 'momentum') {
    if (value >= 7.0) return 'Trend constructive.';
    if (value >= 5)   return 'Mixed — needs confirmation.';
    return 'Negative or absent.';
  }
  if (key === 'earningsSetup') {
    if (value >= 7.5) return 'Setup tilts toward a beat.';
    if (value >= 5)   return 'Neutral — modest beat/miss risk.';
    return 'Setup tilts toward disappointment.';
  }
  if (key === 'valuationSignal') {
    if (value >= 7.5) return 'Undervalued vs. growth.';
    if (value >= 5)   return 'Near fair value.';
    return 'Stretched.';
  }
  if (key === 'riskAdjustment') {
    if (value >= 7.5) return 'Favorable risk/reward.';
    if (value >= 5)   return 'Moderate — manageable.';
    return 'Elevated volatility.';
  }
  return '';
}

export function convictionGrade(score: number, signal: RankedStock['signal']): { level: string; read: string } {
  if (signal === 'green' && score >= 8.0)  return { level: 'High',          read: 'strong multi-factor alignment' };
  if (signal === 'green' && score >= 7.0)  return { level: 'Moderate-High', read: 'green signal with room to improve' };
  if (signal === 'yellow' && score >= 6.0) return { level: 'Moderate',      read: 'constructive but not confirmed' };
  if (signal === 'yellow')                 return { level: 'Low-Moderate',  read: 'waiting for a clearer trigger' };
  if (score < 4.0)                         return { level: 'Low',           read: 'setup favors avoiding' };
  return                                          { level: 'Low',           read: 'weak factor alignment' };
}

export function expectedMoveForDisplay(stock: RankedStock): ExpectedMoveContext {
  const base = buildExpectedMoveContext(stock);
  if (!hasLiveConfirmation(stock)) {
    return {
      baseLowPct:  -4,
      baseHighPct: 6,
      bullPct:  Math.max(8, Math.min(14, base.bullPct)),
      riskPct:  Math.min(-6, base.riskPct),
      summary:  'Scenario range — live forecast not yet confirmed.',
    };
  }
  if (hasForecastConflict(stock)) {
    return {
      baseLowPct:  Math.min(base.baseLowPct, -3),
      baseHighPct: Math.max(Math.min(base.baseHighPct, 6), 2),
      bullPct:  Math.min(base.bullPct, 10),
      riskPct:  Math.min(base.riskPct, -8),
      summary:  'Score and forecast conflict — wait for confirmation.',
    };
  }
  return base;
}

export function keyCatalystStr(stock: RankedStock): string {
  const catalysts = stock.meta.catalysts ?? [];
  if (catalysts.length === 0) {
    const brief = getCompanyBrief(stock.ticker);
    return brief.watchItems[0] ?? 'No live catalyst loaded yet';
  }
  const top  = catalysts[0];
  const sign = top.impactPct >= 0 ? '+' : '';
  return `${top.title} (${sign}${top.impactPct.toFixed(1)}%)`;
}

export function signalFromScore(score: number): RankedStock['signal'] {
  return signalFromOpportunityScore(score);
}

export function pmBullCaseRead(expectedMove: ExpectedMoveContext): 'High' | 'Medium' | 'Low' {
  if (expectedMove.bullPct >= 20) return 'High';
  if (expectedMove.bullPct >= 12) return 'Medium';
  return 'Low';
}

export function finalPmRead(stock: RankedStock, expectedMove: ExpectedMoveContext): string {
  const readiness = tradeReadiness(stock);
  const top = topFactor(stock);
  if (readiness.label === 'Ready') {
    return `Work the idea — ${SCORE_LABELS[top[0]].toLowerCase()} leads and PM upside is ${pmBullCaseRead(expectedMove).toLowerCase()}.`;
  }
  return `${readiness.label}: ${readiness.reason}.`;
}

export function tradeViewStr(stock: RankedStock): string {
  const brief = getCompanyBrief(stock.ticker);
  const readiness = tradeReadiness(stock);
  if (readiness.label !== 'Ready') return `${readiness.label} — ${readiness.reason}`;
  if (hasForecastConflict(stock)) {
    return `Wait — score and forecast conflict; hold until ${brief.watchItems[0]?.toLowerCase() ?? 'the setup'} confirms`;
  }
  if (stock.signal === 'green' && !hasLiveConfirmation(stock)) {
    return 'Work up — score is constructive; wait for live forecast or headline before sizing';
  }
  if (stock.signal === 'green') {
    return `Ready — add if ${(brief.watchItems[0] ?? 'catalyst confirmation').toLowerCase()} confirms`;
  }
  if (stock.signal === 'red') {
    return `Avoid — wait for ${brief.watchItems[0]?.toLowerCase() ?? 'thesis improvement'}`;
  }
  return `Watch — hold until ${brief.watchItems[0]?.toLowerCase() ?? 'the setup clarifies'}`;
}

export function thesisDrift(stock: RankedStock): string {
  const sorted = sortedFactors(stock);
  const top    = sorted[0];
  const bottom = sorted[sorted.length - 1];
  if (!top || !bottom) return 'Insufficient data.';
  const spread = top[1] - bottom[1];
  if (spread < 1.5) return 'Aligned — balanced across factors.';
  if (stock.signal === 'green' && bottom[1] >= 5.5) return 'Aligned — all factors constructive.';
  if (stock.signal === 'green') return `Mild drift — ${SCORE_LABELS[bottom[0]]} (${bottom[1].toFixed(1)}) is the weak link.`;
  if (stock.signal === 'yellow') return `Cautious — ${SCORE_LABELS[top[0]]} leads but ${SCORE_LABELS[bottom[0]]} lags.`;
  return `Drifting negative — ${SCORE_LABELS[bottom[0]]} is the drag.`;
}

export function forecastReconciliation(stock: RankedStock, expectedMove: ExpectedMoveContext): string {
  const timesfm = stock.meta.forecastReturnPct;
  const fmRead = timesfm == null ? 'Pending' : timesfm >= 4 ? 'Bullish' : timesfm <= -4 ? 'Bearish' : 'Neutral';
  return `Score: ${capitalize(stock.signal)} | TimesFM: ${fmRead} | PM Bull: ${pmBullCaseRead(expectedMove)}`;
}

export function contextPrompt(
  signal: RankedStock['signal'],
  breakdown: RankedStock['breakdown'],
): { label: string; mode?: InvestmentMode; text: string } {
  if (breakdown.catalystStrength >= 7.5)
    return { label: 'Will the catalyst hit?', mode: 'challenge', text: 'Will the catalyst actually hit and change the investment thesis?' };
  if (breakdown.valuationSignal < 4.5)
    return { label: 'Is this overpriced?', mode: 'evaluate', text: 'Is this stock overpriced relative to its growth expectations?' };
  if (breakdown.riskAdjustment < 4.5)
    return { label: 'What could go wrong?', mode: 'challenge', text: 'What are the biggest risk factors that could break this trade?' };
  if (signal === 'green') return { label: 'Build a pitch',          mode: 'pitch',     text: 'Write a structured investment pitch.' };
  if (signal === 'red')   return { label: 'When does this recover?',                   text: 'What would make this bad trade improve?' };
  return                         { label: 'What needs to change?',                     text: 'What needs to happen for this to become a buy?' };
}

export function coreDebate(stock: RankedStock): string {
  const factors    = sortedFactors(stock);
  const brief      = getCompanyBrief(stock.ticker);
  const [topKey, topVal]     = factors[0]   ?? ['forecastSignal', 5] as [ScoreFactor, number];
  const [bottomKey, bottomVal] = factors[factors.length - 1] ?? ['riskAdjustment', 5] as [ScoreFactor, number];
  const hasGap  = topKey !== bottomKey && topVal - bottomVal > 1.5;
  const topStr    = SCORE_LABELS[topKey].toLowerCase();
  const bottomStr = SCORE_LABELS[bottomKey].toLowerCase();
  const watch = brief.watchItems[0]?.toLowerCase() ?? 'catalyst confirmation';

  if (stock.signal === 'green' && hasGap)
    return `${capitalize(topStr)} (${topVal.toFixed(1)}) drives the setup — does it hold before ${bottomStr} (${bottomVal.toFixed(1)}) limits the move?`;
  if (stock.signal === 'green')
    return `Aligned green setup — trade needs ${watch} to confirm before sizing.`;
  if (stock.signal === 'yellow' && hasGap)
    return `${capitalize(topStr)} is constructive at ${topVal.toFixed(1)}, but ${bottomStr} (${bottomVal.toFixed(1)}) keeps this in work-up territory.`;
  if (stock.signal === 'yellow')
    return `Interesting setup — not ready until ${watch} confirms the opportunity.`;
  if (stock.signal === 'red' && hasGap)
    return `${capitalize(bottomStr)} (${bottomVal.toFixed(1)}) is dragging the score — recovery depends on ${topStr} (${topVal.toFixed(1)}) repair.`;
  return `Weak setup — avoid until factors repair and ${watch} confirms.`;
}
