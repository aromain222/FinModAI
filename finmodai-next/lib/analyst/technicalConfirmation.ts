export type TechnicalConfirmationVerdict = 'confirms' | 'conflicts' | 'mixed' | 'insufficient';
export type TechnicalTrendBias = 'bullish' | 'bearish' | 'neutral';

export type TechnicalConfirmation = {
  latestPrice: number;
  movingAverage20: number | null;
  movingAverage50: number | null;
  priceVsMa20Pct: number | null;
  priceVsMa50Pct: number | null;
  momentum20dPct: number | null;
  volatility30dPct: number | null;
  volumeTrendPct: number | null;
  trendBias: TechnicalTrendBias;
  forecastDirection: TechnicalTrendBias;
  verdict: TechnicalConfirmationVerdict;
  confidenceAdjustment: number;
  explanation: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals = 2): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function average(values: number[]): number | null {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length === 0) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function stdDev(values: number[]): number | null {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return null;
  const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  const variance = clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (clean.length - 1);
  return Math.sqrt(variance);
}

function directionFromReturn(returnPct: number | null): TechnicalTrendBias {
  if (returnPct === null || !Number.isFinite(returnPct)) return 'neutral';
  if (returnPct > 1) return 'bullish';
  if (returnPct < -1) return 'bearish';
  return 'neutral';
}

function verdictFromBias(trendBias: TechnicalTrendBias, forecastDirection: TechnicalTrendBias): TechnicalConfirmationVerdict {
  if (trendBias === 'neutral' || forecastDirection === 'neutral') return 'mixed';
  return trendBias === forecastDirection ? 'confirms' : 'conflicts';
}

function explanationFor(params: {
  verdict: TechnicalConfirmationVerdict;
  trendBias: TechnicalTrendBias;
  forecastDirection: TechnicalTrendBias;
  priceVsMa20Pct: number | null;
  priceVsMa50Pct: number | null;
  momentum20dPct: number | null;
  volumeTrendPct: number | null;
}): string {
  if (params.verdict === 'insufficient') {
    return 'Not enough price history to run technical confirmation.';
  }
  const ma20 = params.priceVsMa20Pct === null ? '20D MA unavailable' : `${params.priceVsMa20Pct >= 0 ? '+' : ''}${params.priceVsMa20Pct.toFixed(1)}% vs 20D MA`;
  const ma50 = params.priceVsMa50Pct === null ? '50D MA unavailable' : `${params.priceVsMa50Pct >= 0 ? '+' : ''}${params.priceVsMa50Pct.toFixed(1)}% vs 50D MA`;
  const momentum = params.momentum20dPct === null ? 'momentum unavailable' : `${params.momentum20dPct >= 0 ? '+' : ''}${params.momentum20dPct.toFixed(1)}% 20D momentum`;
  const volume = params.volumeTrendPct === null ? 'volume trend unavailable' : `${params.volumeTrendPct >= 0 ? '+' : ''}${params.volumeTrendPct.toFixed(1)}% volume trend`;
  const stance =
    params.verdict === 'confirms'
      ? 'Technicals confirm the forecast direction'
      : params.verdict === 'conflicts'
        ? 'Technicals conflict with the forecast direction'
        : 'Technicals are mixed against the forecast direction';
  return `${stance}: ${ma20}, ${ma50}, ${momentum}, ${volume}.`;
}

export function computeTechnicalConfirmation(params: {
  prices: number[];
  volumes?: number[] | null;
  forecastReturnPct: number | null;
}): TechnicalConfirmation {
  const prices = params.prices.filter((value) => Number.isFinite(value) && value > 0);
  const latestPrice = prices.at(-1);
  if (prices.length < 30 || typeof latestPrice !== 'number') {
    return {
      latestPrice: typeof latestPrice === 'number' ? latestPrice : 0,
      movingAverage20: null,
      movingAverage50: null,
      priceVsMa20Pct: null,
      priceVsMa50Pct: null,
      momentum20dPct: null,
      volatility30dPct: null,
      volumeTrendPct: null,
      trendBias: 'neutral',
      forecastDirection: directionFromReturn(params.forecastReturnPct),
      verdict: 'insufficient',
      confidenceAdjustment: -0.04,
      explanation: explanationFor({
        verdict: 'insufficient',
        trendBias: 'neutral',
        forecastDirection: directionFromReturn(params.forecastReturnPct),
        priceVsMa20Pct: null,
        priceVsMa50Pct: null,
        momentum20dPct: null,
        volumeTrendPct: null,
      }),
    };
  }

  const ma20 = average(prices.slice(-20));
  const ma50 = prices.length >= 50 ? average(prices.slice(-50)) : null;
  const priceVsMa20Pct = ma20 && ma20 > 0 ? (latestPrice / ma20 - 1) * 100 : null;
  const priceVsMa50Pct = ma50 && ma50 > 0 ? (latestPrice / ma50 - 1) * 100 : null;
  const price20dAgo = prices.length > 20 ? prices[prices.length - 21] : null;
  const momentum20dPct = price20dAgo && price20dAgo > 0 ? (latestPrice / price20dAgo - 1) * 100 : null;
  const returns = prices.slice(-31).slice(1).map((value, index) => {
    const previous = prices.slice(-31)[index];
    return previous && previous > 0 ? value / previous - 1 : 0;
  });
  const dailyVol = stdDev(returns);
  const volatility30dPct = dailyVol === null ? null : dailyVol * Math.sqrt(252) * 100;

  const cleanVolumes = (params.volumes ?? []).filter((value) => Number.isFinite(value) && value > 0);
  const recentVolume = cleanVolumes.length >= 40 ? average(cleanVolumes.slice(-10)) : null;
  const priorVolume = cleanVolumes.length >= 40 ? average(cleanVolumes.slice(-40, -10)) : null;
  const volumeTrendPct = recentVolume && priorVolume && priorVolume > 0 ? (recentVolume / priorVolume - 1) * 100 : null;

  const maScore =
    (priceVsMa20Pct !== null ? Math.sign(priceVsMa20Pct) : 0) +
    (priceVsMa50Pct !== null ? Math.sign(priceVsMa50Pct) : 0);
  const momentumScore = momentum20dPct !== null && Math.abs(momentum20dPct) >= 1 ? Math.sign(momentum20dPct) : 0;
  const rawTrendScore = maScore + momentumScore;
  const trendBias: TechnicalTrendBias =
    rawTrendScore >= 2 ? 'bullish' :
    rawTrendScore <= -2 ? 'bearish' :
    'neutral';
  const forecastDirection = directionFromReturn(params.forecastReturnPct);
  const verdict = verdictFromBias(trendBias, forecastDirection);
  const confidenceAdjustment =
    verdict === 'confirms' ? 0.06 :
    verdict === 'conflicts' ? -0.1 :
    verdict === 'insufficient' ? -0.04 :
    0;

  return {
    latestPrice: round(latestPrice, 2),
    movingAverage20: ma20 === null ? null : round(ma20, 2),
    movingAverage50: ma50 === null ? null : round(ma50, 2),
    priceVsMa20Pct: priceVsMa20Pct === null ? null : round(priceVsMa20Pct, 1),
    priceVsMa50Pct: priceVsMa50Pct === null ? null : round(priceVsMa50Pct, 1),
    momentum20dPct: momentum20dPct === null ? null : round(momentum20dPct, 1),
    volatility30dPct: volatility30dPct === null ? null : round(clamp(volatility30dPct, 0, 250), 1),
    volumeTrendPct: volumeTrendPct === null ? null : round(clamp(volumeTrendPct, -100, 300), 1),
    trendBias,
    forecastDirection,
    verdict,
    confidenceAdjustment,
    explanation: explanationFor({
      verdict,
      trendBias,
      forecastDirection,
      priceVsMa20Pct,
      priceVsMa50Pct,
      momentum20dPct,
      volumeTrendPct,
    }),
  };
}
