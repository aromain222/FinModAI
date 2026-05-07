import type { RankedStock } from './types';

export type ExpectedMoveContext = {
  baseLowPct: number;
  baseHighPct: number;
  bullPct: number;
  riskPct: number;
  summary: string;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round0(n: number): number {
  return Math.round(n);
}

function signedPct(n: number): string {
  const rounded = round0(n);
  return `${rounded >= 0 ? '+' : ''}${rounded}%`;
}

export function formatExpectedMoveRange(lowPct: number, highPct: number): string {
  return `${signedPct(lowPct)} to ${signedPct(highPct)}`;
}

export function buildExpectedMoveContext(stock: RankedStock): ExpectedMoveContext {
  const {
    forecastSignal,
    catalystStrength,
    momentum,
    earningsSetup,
    valuationSignal,
    riskAdjustment,
  } = stock.breakdown;

  const catalystTilt = (catalystStrength - 5) * 1.15;
  const momentumTilt = (momentum - 5) * 1.0;
  const earningsTilt = (earningsSetup - 5) * 0.75;
  const valuationTilt = (valuationSignal - 5) * 0.85;
  const forecastTilt = stock.meta.forecastReturnPct != null
    ? clamp(stock.meta.forecastReturnPct * 0.55, -8, 8)
    : (forecastSignal - 5) * 0.9;
  const riskPenalty = Math.max(0, 5 - riskAdjustment) * 0.95;

  const midpoint = clamp(
    forecastTilt + catalystTilt + momentumTilt + earningsTilt + valuationTilt - riskPenalty,
    -18,
    18,
  );
  const volatilityWidth = clamp(4 + (10 - riskAdjustment) * 1.25 + Math.abs(momentum - 5) * 0.35, 5, 16);
  const baseLowPct = round0(clamp(midpoint - volatilityWidth * 0.45, -25, 25));
  const baseHighPct = round0(clamp(midpoint + volatilityWidth * 0.55, -25, 28));
  const bullPct = round0(clamp(baseHighPct + 4 + Math.max(0, catalystStrength - 6) * 1.4 + Math.max(0, earningsSetup - 6) * 0.9, -5, 35));
  const riskPct = round0(-clamp(4 + Math.max(0, 6 - riskAdjustment) * 1.8 + Math.max(0, 6 - valuationSignal) * 1.1, 5, 25));

  const driver =
    catalystStrength >= 7
      ? 'catalysts'
      : momentum >= 7
        ? 'momentum'
        : earningsSetup >= 7
          ? 'earnings setup'
          : valuationSignal < 4.5
            ? 'valuation risk'
            : 'factor mix';

  return {
    baseLowPct,
    baseHighPct,
    bullPct,
    riskPct,
    summary: `Driven by ${driver}, volatility, and valuation context.`,
  };
}
