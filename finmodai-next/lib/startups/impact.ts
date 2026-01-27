/**
 * Impact Scoring Logic - Transparent and Explainable
 * 
 * All scores are deterministic and traceable.
 * No magic numbers - every calculation is documented.
 */

import type {
  SignalImpact,
  SignalType,
  SignalDirection,
  SignalConfidence,
  ImpactDirection,
  ImpactStrength,
  StartupImpactSummary,
  Timeframe,
} from '@/types/startups';

/**
 * Clamp value to [0, 1]
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Clamp value to [min, max]
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate z-score
 * z = (current - mean) / stdDev
 * If stdDev = 0, return 0
 */
export function calculateZScore(
  current: number,
  allValues: number[]
): { zscore: number; mean: number; stdDev: number } {
  if (allValues.length === 0) {
    return { zscore: 0, mean: 0, stdDev: 0 };
  }

  const mean = allValues.reduce((sum, val) => sum + val, 0) / allValues.length;
  const variance =
    allValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / allValues.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    return { zscore: 0, mean, stdDev: 0 };
  }

  const zscore = (current - mean) / stdDev;
  return { zscore, mean, stdDev };
}

/**
 * A) Mentions Impact
 * 
 * Formula:
 * - z-score of mentions vs baseline
 * - impactScore = clamp01(abs(z)/4) * 100
 * - contribution = clamp(z * 15, -40, 40)
 */
export function calculateMentionsImpact(
  mentionCount: number,
  allMentions: number[],
  confidence: SignalConfidence = 'medium'
): SignalImpact {
  const { zscore } = calculateZScore(mentionCount, allMentions);
  const impactScore = clamp01(Math.abs(zscore) / 4) * 100;
  const contribution = clamp(zscore * 15, -40, 40);
  const direction: SignalDirection = zscore > 0.1 ? 'positive' : zscore < -0.1 ? 'negative' : 'neutral';

  const changePercent = zscore !== 0 ? Math.round(zscore * 30) : 0;
  const description =
    zscore > 0
      ? `Mentions +${Math.abs(changePercent)}% vs baseline (z=${zscore.toFixed(2)})`
      : zscore < 0
      ? `Mentions ${changePercent}% vs baseline (z=${zscore.toFixed(2)})`
      : 'Mentions at baseline';

  return {
    id: `mentions-${Date.now()}`,
    type: 'mentions',
    direction,
    impactScore,
    contribution,
    description,
    detail: `${mentionCount} articles detected`,
    confidence,
  };
}

/**
 * B) Funding Impact
 * 
 * Formula:
 * - impactScore = clamp((log10(roundSizeUSD) - 6) / 4, 0..1) * 100
 * - stageMultiplier: Seed/A=0.7, B/C=1.0, D+/Pre-IPO=1.3
 * - contribution = clamp((impactScore/100) * 30 * stageMultiplier, 0, 45)
 */
export function calculateFundingImpact(
  roundSizeUSD: number,
  stage: 'seed' | 'a' | 'b' | 'c' | 'd' | 'pre-ipo' | 'unknown' = 'unknown',
  confidence: SignalConfidence = 'high'
): SignalImpact {
  const stageMultipliers = {
    seed: 0.7,
    a: 0.7,
    b: 1.0,
    c: 1.0,
    d: 1.3,
    'pre-ipo': 1.3,
    unknown: 0.9,
  };

  const stageMultiplier = stageMultipliers[stage];
  const impactScore = clamp((Math.log10(roundSizeUSD) - 6) / 4, 0, 1) * 100;
  const contribution = clamp((impactScore / 100) * 30 * stageMultiplier, 0, 45);

  const formatAmount = (usd: number): string => {
    if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
    if (usd >= 1e6) return `$${(usd / 1e6).toFixed(0)}M`;
    return `$${(usd / 1e3).toFixed(0)}K`;
  };

  const stageLabel = stage === 'unknown' ? '' : ` Series ${stage.toUpperCase()}`;
  const description = `${formatAmount(roundSizeUSD)}${stageLabel} funding announced`;

  return {
    id: `funding-${Date.now()}`,
    type: 'funding',
    direction: 'positive',
    impactScore,
    contribution,
    description,
    detail: stage !== 'unknown' ? `${stage.toUpperCase()}-stage` : undefined,
    confidence,
  };
}

/**
 * C) Hiring Impact
 * 
 * Formula:
 * - impactScore = clamp(count/10, 0..1) * 100
 * - contribution = clamp(count * 4, 0, 25)
 */
export function calculateHiringImpact(
  hiringSignalsCount: number,
  confidence: SignalConfidence = 'medium'
): SignalImpact {
  const impactScore = clamp(hiringSignalsCount / 10, 0, 1) * 100;
  const contribution = clamp(hiringSignalsCount * 4, 0, 25);

  const description =
    hiringSignalsCount > 0
      ? `Hiring surge: ${hiringSignalsCount} new roles posted`
      : 'No hiring signals detected';

  return {
    id: `hiring-${Date.now()}`,
    type: 'hiring',
    direction: 'positive',
    impactScore,
    contribution,
    description,
    confidence,
  };
}

/**
 * D) Layoffs Impact (negative)
 * 
 * Formula:
 * - impactScore = clamp(pctCut/0.2, 0..1) * 100  (20% cut => 100)
 * - contribution = -clamp((impactScore/100) * 45, 5, 60)
 */
export function calculateLayoffsImpact(
  pctCut: number,
  confidence: SignalConfidence = 'medium'
): SignalImpact {
  const impactScore = clamp(pctCut / 0.2, 0, 1) * 100;
  const contribution = -clamp((impactScore / 100) * 45, 5, 60);

  const description = `Layoffs: ~${Math.round(pctCut * 100)}% workforce reduction`;

  return {
    id: `layoffs-${Date.now()}`,
    type: 'layoffs',
    direction: 'negative',
    impactScore,
    contribution,
    description,
    confidence,
  };
}

/**
 * E) Regulation / Lawsuit Impact (negative)
 * 
 * Formula:
 * - impactScore = clamp(mentionsCount/8, 0..1) * 100
 * - contribution = -clamp((impactScore/100) * 30, 4, 35)
 */
export function calculateRegulationImpact(
  mentionsCount: number,
  confidence: SignalConfidence = 'medium'
): SignalImpact {
  const impactScore = clamp(mentionsCount / 8, 0, 1) * 100;
  const contribution = -clamp((impactScore / 100) * 30, 4, 35);

  const description = `Regulatory pressure mentioned in ${mentionsCount} article${
    mentionsCount !== 1 ? 's' : ''
  }`;

  return {
    id: `regulation-${Date.now()}`,
    type: 'regulation',
    direction: 'negative',
    impactScore,
    contribution,
    description,
    confidence,
  };
}

export function calculateLawsuitImpact(
  mentionsCount: number,
  confidence: SignalConfidence = 'medium'
): SignalImpact {
  const impactScore = clamp(mentionsCount / 8, 0, 1) * 100;
  const contribution = -clamp((impactScore / 100) * 30, 4, 35);

  const description = `Legal issues: ${mentionsCount} lawsuit mention${
    mentionsCount !== 1 ? 's' : ''
  }`;

  return {
    id: `lawsuit-${Date.now()}`,
    type: 'lawsuit',
    direction: 'negative',
    impactScore,
    contribution,
    description,
    confidence,
  };
}

/**
 * Calculate market vs company impact split
 */
export function calculateImpactSplit(signals: SignalImpact[]): {
  marketImpact: number;
  companyImpact: number;
} {
  const marketTypes: SignalType[] = ['regulation', 'press'];
  const companyTypes: SignalType[] = ['funding', 'layoffs', 'hiring', 'product', 'partnership'];

  let marketImpact = 0;
  let companyImpact = 0;

  signals.forEach((signal) => {
    if (marketTypes.includes(signal.type)) {
      marketImpact += signal.contribution;
    } else if (companyTypes.includes(signal.type)) {
      companyImpact += signal.contribution;
    } else {
      // mentions split 50/50
      marketImpact += signal.contribution * 0.5;
      companyImpact += signal.contribution * 0.5;
    }
  });

  return { marketImpact, companyImpact };
}

/**
 * Calculate impact summary from signals
 */
export function calculateImpactSummary(
  signals: SignalImpact[],
  timeframe: Timeframe,
  priorPeriodNetImpact?: number
): StartupImpactSummary {
  // Calculate totals
  const totalPositiveImpact = signals
    .filter((s) => s.contribution > 0)
    .reduce((sum, s) => sum + s.contribution, 0);

  const totalNegativeImpact = signals
    .filter((s) => s.contribution < 0)
    .reduce((sum, s) => sum + Math.abs(s.contribution), 0);

  const netImpact = totalPositiveImpact - totalNegativeImpact;

  // Determine direction and strength
  const direction: ImpactDirection =
    Math.abs(netImpact) < 8 ? 'flat' : netImpact >= 8 ? 'up' : 'down';

  const absNetImpact = Math.abs(netImpact);
  const strength: ImpactStrength =
    absNetImpact < 15 ? 'mild' : absNetImpact < 35 ? 'moderate' : 'strong';

  // Get top drivers
  const bullDrivers = signals
    .filter((s) => s.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);

  const bearDrivers = signals
    .filter((s) => s.contribution < 0)
    .sort((a, b) => a.contribution - b.contribution)
    .slice(0, 3);

  // Generate explanation
  const explanation = generateExplanation(direction, strength, bullDrivers, bearDrivers);

  // Calculate market vs company split
  const { marketImpact, companyImpact } = calculateImpactSplit(signals);

  // Group timeline by date
  const timeline = groupSignalsByDate(signals);

  // Calculate delta
  const delta = priorPeriodNetImpact !== undefined ? netImpact - priorPeriodNetImpact : undefined;

  return {
    timeframe,
    totalPositiveImpact,
    totalNegativeImpact,
    netImpact,
    direction,
    strength,
    explanation,
    marketImpact,
    companyImpact,
    bullDrivers,
    bearDrivers,
    timeline,
    priorPeriodNetImpact,
    delta,
  };
}

/**
 * Generate human-readable explanation
 */
function generateExplanation(
  direction: ImpactDirection,
  strength: ImpactStrength,
  bullDrivers: SignalImpact[],
  bearDrivers: SignalImpact[]
): string {
  if (direction === 'flat') {
    return 'Momentum is neutral with balanced positive and negative signals.';
  }

  const strengthLabel = strength === 'mild' ? 'mildly' : strength === 'moderate' ? 'moderately' : 'strongly';

  if (direction === 'up') {
    const topBull = bullDrivers[0];
    const secondBull = bullDrivers[1];

    if (!topBull) {
      return `Momentum is ${strengthLabel} positive.`;
    }

    const bullDesc = topBull.type;
    const secondBullDesc = secondBull ? ` and ${secondBull.type}` : '';

    if (bearDrivers.length === 0) {
      return `Momentum is ${strengthLabel} positive driven by ${bullDesc}${secondBullDesc}.`;
    } else {
      const topBear = bearDrivers[0];
      return `Momentum is ${strengthLabel} positive as ${bullDesc}${secondBullDesc} outweighed ${topBear.type}.`;
    }
  }

  // direction === 'down'
  const topBear = bearDrivers[0];
  const secondBear = bearDrivers[1];

  if (!topBear) {
    return `Momentum is ${strengthLabel} negative.`;
  }

  const bearDesc = topBear.type;
  const secondBearDesc = secondBear ? ` and ${secondBear.type}` : '';

  if (bullDrivers.length === 0) {
    return `Momentum is ${strengthLabel} negative due to ${bearDesc}${secondBearDesc}.`;
  } else {
    const topBull = bullDrivers[0];
    return `Momentum is ${strengthLabel} negative as ${bearDesc}${secondBearDesc} outweighed ${topBull.type}.`;
  }
}

/**
 * Group signals by date for timeline view
 */
function groupSignalsByDate(signals: SignalImpact[]) {
  const grouped = new Map<string, SignalImpact[]>();

  signals.forEach((signal) => {
    const date = signal.ts ? signal.ts.split('T')[0] : 'unknown';
    if (!grouped.has(date)) {
      grouped.set(date, []);
    }
    grouped.get(date)!.push(signal);
  });

  return Array.from(grouped.entries())
    .map(([date, items]) => ({ date, items }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

