import type { AgentView, InvestmentDecision, ThesisUpdateInput, WeeklyMemoSection } from '@/lib/pm/types';
import type { RankedStock, ScoreBreakdown } from '@/lib/ranking/types';

type QuantInput = Partial<RankedStock> & {
  ticker?: string;
  score?: number;
  signal?: RankedStock['signal'];
  breakdown?: Partial<ScoreBreakdown>;
  meta?: Partial<RankedStock['meta']>;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, decimals = 1): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function safeFactor(breakdown: Partial<ScoreBreakdown> | undefined, key: keyof ScoreBreakdown, fallback = 5): number {
  const value = breakdown?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 10) : fallback;
}

function factorStats(breakdown: Partial<ScoreBreakdown> | undefined): {
  average: number;
  breadth: number;
  spread: number;
  top: [keyof ScoreBreakdown, number];
  bottom: [keyof ScoreBreakdown, number];
} {
  const entries = ([
    'forecastSignal',
    'catalystStrength',
    'momentum',
    'earningsSetup',
    'valuationSignal',
    'riskAdjustment',
  ] as Array<keyof ScoreBreakdown>).map((key) => [key, safeFactor(breakdown, key)] as [keyof ScoreBreakdown, number]);
  const sorted = entries.slice().sort((a, b) => b[1] - a[1]);
  const average = entries.reduce((sum, [, value]) => sum + value, 0) / entries.length;
  const breadth = entries.filter(([, value]) => value >= 6).length / entries.length;
  return {
    average,
    breadth,
    spread: sorted[0][1] - sorted.at(-1)![1],
    top: sorted[0],
    bottom: sorted.at(-1)!,
  };
}

function sellRiskScore(input: QuantInput): number {
  const score = typeof input.score === 'number' ? input.score : 5;
  const momentum = safeFactor(input.breakdown, 'momentum');
  const forecast = safeFactor(input.breakdown, 'forecastSignal');
  const risk = safeFactor(input.breakdown, 'riskAdjustment');
  const valuation = safeFactor(input.breakdown, 'valuationSignal');
  const earnings = safeFactor(input.breakdown, 'earningsSetup');
  const forecastReturn = typeof input.meta?.forecastReturnPct === 'number' ? input.meta.forecastReturnPct : null;
  let sellRisk = 0;
  sellRisk += Math.max(0, 5.2 - momentum) * 13;
  sellRisk += Math.max(0, 5.0 - forecast) * 10;
  sellRisk += Math.max(0, 4.8 - risk) * 12;
  sellRisk += Math.max(0, 4.8 - earnings) * 7;
  sellRisk += Math.max(0, 5.0 - score) * 8;
  sellRisk += Math.max(0, 5.5 - valuation) * 4;
  if (forecastReturn !== null && forecastReturn <= -3) sellRisk += Math.min(22, Math.abs(forecastReturn) * 2.5);
  if (forecastReturn !== null && forecastReturn >= 6) sellRisk -= Math.min(14, forecastReturn);
  return clamp(Math.round(sellRisk), 0, 100);
}

function stanceFor(input: QuantInput): AgentView['stance'] {
  const sellRisk = sellRiskScore(input);
  if (sellRisk >= 58) return 'bearish';
  if (sellRisk <= 24) return 'bullish';
  return 'neutral';
}

function actionFor(view: AgentView): InvestmentDecision['action'] {
  if (view.stance === 'bearish' && view.conviction >= 82) return 'exit';
  if (view.stance === 'bearish' && view.conviction >= 62) return 'trim';
  return 'watch';
}

function quantRead(input: QuantInput): {
  stance: AgentView['stance'];
  conviction: number;
  reasoning: string;
  evidence: AgentView['evidence'];
} {
  const ticker = (input.ticker ?? '').toUpperCase();
  const stats = factorStats(input.breakdown);
  const stance = stanceFor(input);
  const sellRisk = sellRiskScore(input);
  const forecastReturn = typeof input.meta?.forecastReturnPct === 'number' ? input.meta.forecastReturnPct : null;
  const risk = safeFactor(input.breakdown, 'riskAdjustment');
  const momentum = safeFactor(input.breakdown, 'momentum');
  const valuation = safeFactor(input.breakdown, 'valuationSignal');
  const weakBreadthPenalty = (1 - stats.breadth) * 14;
  const concentrationPenalty = Math.max(0, stats.spread - 2.5) * 4;
  const conviction = Math.round(clamp(42 + sellRisk * 0.55 + weakBreadthPenalty + concentrationPenalty, 35, 92));
  const topLabel = stats.top[0].replace(/([A-Z])/g, ' $1').toLowerCase();
  const bottomLabel = stats.bottom[0].replace(/([A-Z])/g, ' $1').toLowerCase();
  const riskRead = risk < 4 ? 'risk budget is the gating item' : risk >= 6.5 ? 'risk is acceptable for a swing setup' : 'risk is manageable but not clean';
  const tapeRead = momentum >= 6.5 ? 'price action confirms the setup' : momentum <= 4.5 ? 'price action is not confirming yet' : 'tape is mixed';
  const valuationRead = valuation >= 6.5 ? 'valuation has room to support re-rating' : valuation <= 4.5 ? 'valuation leaves limited room for disappointment' : 'valuation is close to fair';
  const forecastRead = forecastReturn === null
    ? 'forecast is not live-confirmed'
    : `forecast tape points to ${forecastReturn >= 0 ? '+' : ''}${round(forecastReturn)}%`;
  const sellDiscipline =
    sellRisk >= 70 ? 'sell signal is active: protect capital unless a catalyst repairs the tape quickly'
      : sellRisk >= 50 ? 'trim/watch signal: reduce risk if confirmation does not improve'
        : sellRisk >= 30 ? 'hold discipline: no clean sell signal, but do not add blindly'
          : 'no quant sell signal: thesis can remain active if catalysts still support it';
  const reasoning = `${ticker} Quant Sell Discipline: ${stance}. Sell-risk score ${sellRisk}/100. Factor breadth ${Math.round(stats.breadth * 100)}%, top factor ${topLabel} (${round(stats.top[1])}), main drag ${bottomLabel} (${round(stats.bottom[1])}). ${sellDiscipline}; ${tapeRead}; ${valuationRead}; ${riskRead}; ${forecastRead}.`;

  return {
    stance,
    conviction,
    reasoning,
    evidence: [
      {
        source: 'factor_breadth',
        summary: `${Math.round(stats.breadth * 100)}% of score factors are constructive; factor spread is ${round(stats.spread)} points. Low breadth raises trim risk.`,
        impactDirection: stats.breadth >= 0.5 ? 'neutral' : 'bearish',
        confidence: conviction,
      },
      {
        source: 'momentum_risk',
        summary: `Momentum ${round(momentum)}/10 and risk adjustment ${round(risk)}/10. ${tapeRead}; ${riskRead}. This is the main sell/hold gate.`,
        impactDirection: momentum <= 4.5 || risk <= 3.5 ? 'bearish' : 'neutral',
        confidence: conviction,
      },
      {
        source: 'valuation_forecast',
        summary: `Valuation ${round(valuation)}/10. ${valuationRead}; ${forecastRead}.`,
        impactDirection: valuation <= 4 || (forecastReturn !== null && forecastReturn <= -3) ? 'bearish' : 'neutral',
        confidence: conviction,
      },
      {
        source: 'sell_risk_score',
        summary: `Sell-risk score ${sellRisk}/100. ${sellDiscipline}.`,
        impactDirection: sellRisk >= 50 ? 'bearish' : 'neutral',
        confidence: conviction,
      },
    ],
  };
}

export function quantToAgentView(output: QuantInput, previous?: AgentView | null): AgentView {
  const ticker = (output.ticker ?? '').toUpperCase();
  const read = quantRead(output);
  const now = new Date().toISOString();
  const recommendation = actionFor({
    id: '',
    ticker,
    agentName: 'Quant Sell Discipline',
    stance: read.stance,
    conviction: read.conviction,
    reasoning: read.reasoning,
    changedSinceLast: false,
    evidence: read.evidence,
    createdAt: now,
  });
  return {
    id: crypto.randomUUID(),
    ticker,
    agentName: 'Quant Sell Discipline',
    stance: read.stance,
    conviction: read.conviction,
    reasoning: read.reasoning,
    changedSinceLast: previous ? previous.stance !== read.stance || Math.abs(previous.conviction - read.conviction) >= 10 : false,
    evidence: read.evidence,
    createdAt: now,
    source: 'quant',
    agentType: 'quant',
    runAt: now,
    signal: read.stance === 'mixed' ? 'neutral' : read.stance,
    confidence: read.conviction,
    summary: read.reasoning,
    recommendation,
    action: recommendation,
    rawOutput: output as Record<string, unknown>,
  };
}

export function quantToDecision(output: QuantInput): InvestmentDecision | null {
  const view = quantToAgentView(output);
  const action = actionFor(view);
  if (action === 'watch') return null;
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    ticker: view.ticker,
    action,
    recommendation: `${action.toUpperCase()} from Quant Sell Discipline; pending human approval`,
    approvalStatus: 'pending',
    approvedBy: null,
    rationale: view.reasoning,
    evidence: view.evidence,
    linkedAlertId: null,
    confidence: view.conviction,
    createdAt: now,
    updatedAt: now,
    recommendedAction: action,
  };
}

export function quantToThesisUpdateInput(output: QuantInput): ThesisUpdateInput | null {
  if (!output.ticker) return null;
  const view = quantToAgentView(output);
  return {
    ticker: view.ticker,
    newEvidence: `Quant Sell Discipline update: ${view.reasoning}`,
    newThesisSummary: view.summary,
    convictionScore: view.conviction,
    agentViews: [view],
    evidence: view.evidence,
    source: 'agent',
  };
}

export function quantToWeeklyMemoSection(output: QuantInput): WeeklyMemoSection | null {
  if (!output.ticker) return null;
  const view = quantToAgentView(output);
  return {
    title: `${view.ticker} Quant Sell Discipline read`,
    body: `${view.stance.toUpperCase()} at ${view.conviction}% conviction. ${view.reasoning}`,
    tickers: [view.ticker],
  };
}
