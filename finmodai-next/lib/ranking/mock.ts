import type { RankedStock, ScoreBreakdown } from './types';
import { diversifyBreakdown, tickerFactorShape } from './profileShape';
import { compositeOpportunityScore, signalFromOpportunityScore } from './signals';
import { buildValuationSignal, scoreValuationSignal } from '@/lib/valuation/signal';

// Realistic mock scores returned when all upstream APIs fail for a ticker.
// Values are plausible mid-cycle estimates, not random — ensures the UI
// always renders something coherent rather than an error state.

type MockProfile = {
  forecastReturnPct: number;
  breakdown: ScoreBreakdown;
  primaryReason: string;
  mainRisk: string;
};

const MOCK_PROFILES: Record<string, MockProfile> = {
  AAPL: {
    forecastReturnPct: 6.2,
    breakdown: { forecastSignal: 6.5, catalystStrength: 6.0, momentum: 6.8, earningsSetup: 6.5, valuationSignal: 6.2, riskAdjustment: 7.0 },
    primaryReason: 'Services revenue acceleration + iPhone upgrade cycle approaching',
    mainRisk: 'China demand softness and margin compression on hardware',
  },
  MSFT: {
    forecastReturnPct: 8.1,
    breakdown: { forecastSignal: 7.2, catalystStrength: 7.5, momentum: 7.0, earningsSetup: 7.8, valuationSignal: 5.8, riskAdjustment: 7.5 },
    primaryReason: 'Azure AI workload ramp with strong enterprise copilot adoption',
    mainRisk: 'Valuation already pricing significant AI monetisation upside',
  },
  NVDA: {
    forecastReturnPct: 14.3,
    breakdown: { forecastSignal: 8.8, catalystStrength: 9.0, momentum: 8.5, earningsSetup: 9.2, valuationSignal: 4.4, riskAdjustment: 5.5 },
    primaryReason: 'Blackwell ramp — data centre demand structurally above expectations',
    mainRisk: 'High concentration risk; any supply shock reprices sharply',
  },
  GOOGL: {
    forecastReturnPct: 7.4,
    breakdown: { forecastSignal: 7.0, catalystStrength: 6.5, momentum: 6.2, earningsSetup: 7.0, valuationSignal: 5.6, riskAdjustment: 6.5 },
    primaryReason: 'Search monetisation resilient; Cloud accelerating toward 30%+ growth',
    mainRisk: 'DOJ antitrust ruling overhang limits multiple expansion',
  },
  META: {
    forecastReturnPct: 9.8,
    breakdown: { forecastSignal: 8.0, catalystStrength: 7.8, momentum: 8.2, earningsSetup: 8.0, valuationSignal: 6.0, riskAdjustment: 6.0 },
    primaryReason: 'Reels monetisation + AI-driven ad targeting delivering margin upside',
    mainRisk: 'Reality Labs capex drag and regulatory scrutiny on acquisitions',
  },
  AMZN: {
    forecastReturnPct: 10.5,
    breakdown: { forecastSignal: 8.2, catalystStrength: 7.5, momentum: 7.8, earningsSetup: 8.2, valuationSignal: 6.3, riskAdjustment: 6.5 },
    primaryReason: 'AWS reacceleration and Prime advertising unit hitting scale',
    mainRisk: 'Logistics cost inflation and international segment losses',
  },
  TSLA: {
    forecastReturnPct: -3.1,
    breakdown: { forecastSignal: 3.8, catalystStrength: 4.5, momentum: 3.5, earningsSetup: 3.8, valuationSignal: 4.2, riskAdjustment: 3.0 },
    primaryReason: 'Robotaxi launch option value partially offsets near-term delivery weakness',
    mainRisk: 'Margin pressure from price cuts; CEO distraction risk elevated',
  },
  NFLX: {
    forecastReturnPct: 5.9,
    breakdown: { forecastSignal: 6.2, catalystStrength: 6.0, momentum: 6.5, earningsSetup: 6.0, valuationSignal: 5.4, riskAdjustment: 6.0 },
    primaryReason: 'Password sharing crackdown sustaining subscriber momentum',
    mainRisk: 'Content spend inflation as streaming competition intensifies',
  },
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function computeScore(bd: ScoreBreakdown): number {
  return compositeOpportunityScore(bd);
}

function toSignal(score: number): RankedStock['signal'] {
  return signalFromOpportunityScore(score);
}

/** Returns a mock RankedStock for a ticker, whether or not we have a profile. */
export function mockFallback(ticker: string, horizonWeeks: number): RankedStock {
  const t = ticker.toUpperCase();
  const profile = MOCK_PROFILES[t];

  if (profile) {
    const breakdown = diversifyBreakdown(t, profile.breakdown);
    const score = computeScore(breakdown);
    const valuation = buildValuationSignal({
      ticker: t,
      forecastReturnPct: profile.forecastReturnPct,
      factorBreakdown: breakdown,
    });
    return {
      ticker: t,
      score,
      signal: toSignal(score),
      horizonWeeks,
      primaryReason: profile.primaryReason,
      mainRisk: profile.mainRisk,
      breakdown,
      meta: {
        forecastReturnPct: round1(profile.forecastReturnPct),
        catalystCount: 0,
        dataSource: 'mock',
        scoredAt: new Date().toISOString(),
        valuation,
      },
    };
  }

  // Generic fallback for unknown tickers
  const shape = tickerFactorShape(t);
  const valuationForScoring = buildValuationSignal({ ticker: t, forecastReturnPct: null });
  const genericBreakdown: ScoreBreakdown = diversifyBreakdown(t, {
    forecastSignal: shape.forecastSignal,
    catalystStrength: shape.catalystStrength,
    momentum: shape.momentum,
    earningsSetup: shape.earningsSetup,
    valuationSignal: scoreValuationSignal(valuationForScoring),
    riskAdjustment: shape.riskAdjustment,
  });
  const valuation = buildValuationSignal({
    ticker: t,
    forecastReturnPct: null,
    factorBreakdown: genericBreakdown,
  });
  const score = computeScore(genericBreakdown);
  return {
    ticker: t,
    score,
    signal: toSignal(score),
    horizonWeeks,
    primaryReason: 'Fallback profile uses ticker-specific factor shape while live data is unavailable',
    mainRisk: 'No real-time forecast or catalyst data available',
    breakdown: genericBreakdown,
    meta: {
      forecastReturnPct: null,
      catalystCount: 0,
      dataSource: 'mock',
      scoredAt: new Date().toISOString(),
      valuation,
    },
  };
}
