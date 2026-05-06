/**
 * Assumption Engine
 *
 * Parses a free-text user assumption, maps it to the scoring factors,
 * assesses its plausibility against historical norms, and returns a
 * re-scored opportunity with a delta and explanation.
 *
 * Fully deterministic — no LLM calls, no network I/O.
 * All functions are pure and independently testable.
 *
 * Pipeline
 *   parseClaim()          → ParsedClaim
 *   assessPlausibility()  → PlausibilityAssessment
 *   computeAdjustedScore()→ number
 *   applyAssumption()     → AssumptionResult   (main entry)
 */

import type { ScoreBreakdown } from '@/lib/ranking/types';
import { WEIGHTS } from '@/lib/ranking/score';

// ── Public types ───────────────────────────────────────────────────────────

export type Plausibility = 'high' | 'medium' | 'low' | 'extreme';
export type ScoreFactor  = keyof ScoreBreakdown;

/** Plausibility → impact scalar per the spec */
export const PLAUSIBILITY_SCALAR: Record<Plausibility, number> = {
  high:    1.0,
  medium:  0.7,
  low:     0.3,
  extreme: 0.1,
};

export type ParsedClaim = {
  rawText:          string;
  direction:        'positive' | 'negative';
  /** Raw impact magnitude before plausibility scaling: 0.5 – 3.0 */
  magnitude:        number;
  /** Primary factor gets full magnitude; secondary gets 50% */
  affectedFactors:  { factor: ScoreFactor; weight: 'primary' | 'secondary' }[];
  /** Keywords that triggered the mapping */
  matchedKeywords:  string[];
  /** Parsed percentage if present in text */
  parsedPct:        number | null;
};

export type PlausibilityAssessment = {
  level:    Plausibility;
  scalar:   number;
  /** Non-null when the claim is unrealistic — contains the pushback message */
  pushback: string | null;
  /** Description of the norm used to assess */
  normRef:  string;
};

export type AssumptionInput = {
  ticker:        string;
  baseScore:     number;
  breakdown:     ScoreBreakdown;
  assumption:    string;
  horizonWeeks?: number;
};

export type AssumptionResult = {
  adjustedScore:     number;
  delta:             number;
  plausibility:      Plausibility;
  plausibilityScalar: number;
  affectedFactors:   ScoreFactor[];
  factorDeltas:      Partial<Record<ScoreFactor, number>>;
  adjustedBreakdown: ScoreBreakdown;
  explanation:       string;
  /** Non-null when the assumption is flagged as unrealistic */
  pushback:          string | null;
};

// ── Direction keywords ─────────────────────────────────────────────────────

const POSITIVE_RE = /\b(beat|beats|exceed|surpass|grows?|growth|accelerat|improv|increas|higher|stronger|better|upside|rally|surges?|pops?|jumps?|gains?|bullish|launches?|wins?|approved|approval|approves?|partnership|expands?|ramps?|doubles?|triples?|10x)\b/i;
const NEGATIVE_RE = /\b(miss|misses|disappoint|declin|falls?|drops?|lower|weaker|worse|downside|sell.?off|crashes?|collapses?|fails?|loses?|rejects?|halts?|cuts?|slows?|contracts?|struggles?|warns?|investigation|lawsuit|headwind|pressures?|erodes?|deteriorat)\b/i;
// Suffix-bearing negatives that \b can't handle mid-stem (e.g. "intensif" doesn't boundary-match "intensifies")
const NEGATIVE_STEM_RE = /\b(intensif(?:ies|y|ied|ying)?|escalat(?:es|ed|ing)?|worsens?|mounts(?:ing)?)\b/i;

// ── Factor keyword mapping ─────────────────────────────────────────────────
// Each entry: primary factors first, then secondaries.

type FactorRule = {
  keywords: RegExp;
  primary:   ScoreFactor;
  secondary: ScoreFactor | null;
  label:     string;
};

// Rules are tested in order. The FIRST matching rule claims the primary slot.
// Subsequent matches contribute their primary as a secondary factor only.
// Risk is placed before Catalyst so "regulatory risk" → riskAdjustment (not catalystStrength).
const FACTOR_RULES: FactorRule[] = [
  // Earnings / guidance → earningsSetup + forecastSignal
  {
    keywords: /\b(earnings?|eps|quarter|results?|guidance|beats?|misses?|print|reported?|surprise|estimate|consensus|q[1-4]\b|annual results)\b/i,
    primary:   'earningsSetup',
    secondary: 'forecastSignal',
    label:     'earnings setup',
  },

  // Valuation / DCF / expectations → valuationSignal + riskAdjustment
  {
    keywords: /\b(valuation|dcf|reverse dcf|fair value|intrinsic|upside|downside|cheap|expensive|undervalued|overvalued|multiple|terminal|implied growth|mispriced)\b/i,
    primary:   'valuationSignal',
    secondary: 'riskAdjustment',
    label:     'valuation signal',
  },

  // Revenue / demand / growth → forecastSignal + catalystStrength
  {
    keywords: /\b(revenue|sales|demand|bookings?|backlog|pipeline|growth|shipments?|orders?|subscribers?|users?|aum|arr)\b/i,
    primary:   'forecastSignal',
    secondary: 'catalystStrength',
    label:     'forecast / demand',
  },

  // Risk / volatility / macro → riskAdjustment + momentum  (before catalyst)
  {
    keywords: /\b(risk|volatil|uncertainty|regulation|competition|lawsuit|litigation|macro|rates?|inflation|recession|geopolit|tariff|supply chain|churn|competitor|margin pressure|capex)\b/i,
    primary:   'riskAdjustment',
    secondary: 'momentum',
    label:     'risk / volatility',
  },

  // Technical / price momentum → momentum + riskAdjustment
  {
    keywords: /\b(momentum|trend|technical|breakout|support|resistance|moving average|rsi|volume|accumulation|price action|chart|pullback|consolidation|breadth)\b/i,
    primary:   'momentum',
    secondary: 'riskAdjustment',
    label:     'momentum',
  },

  // Catalyst events → catalystStrength + forecastSignal  (after risk)
  {
    keywords: /\b(catalyst|event|announcement|launch|fda|approval|deal|acquisition|merger|partnership|contract|product|conference|investor day|spin.?off|buyback|dividend)\b/i,
    primary:   'catalystStrength',
    secondary: 'forecastSignal',
    label:     'catalyst',
  },
];

// ── Magnitude extraction ───────────────────────────────────────────────────

function extractMagnitude(text: string): { value: number; parsedPct: number | null } {
  // Percentage explicitly stated — map to 0.5–3.0 scale
  const pctMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) {
    const pct = parseFloat(pctMatch[1]);
    let value: number;
    if      (pct < 5)  value = 0.5;
    else if (pct < 15) value = 1.0;
    else if (pct < 30) value = 1.5;
    else if (pct < 50) value = 2.0;
    else               value = 2.5;
    return { value, parsedPct: pct };
  }

  // Qualitative multiplier
  if (/\b(massively|dramatically|radically|completely|zero|guarantee|guaranteed|impossible|collapse|doubles?|triple|10x|100x)\b/i.test(text)) {
    return { value: 3.0, parsedPct: null };
  }
  if (/\b(significantly|materially|substantially|sharply|strongly|greatly|considerably|surge|skyrockets?)\b/i.test(text)) {
    return { value: 2.0, parsedPct: null };
  }
  if (/\b(modestly|somewhat|noticeably|meaningfully|clearly|decent)\b/i.test(text)) {
    return { value: 1.0, parsedPct: null };
  }
  if (/\b(slightly|marginally|fractionally|a bit|a little|minor)\b/i.test(text)) {
    return { value: 0.5, parsedPct: null };
  }

  return { value: 1.5, parsedPct: null }; // default — unspecified magnitude
}

// ── Claim parser ───────────────────────────────────────────────────────────

/**
 * Parses a free-text assumption into a structured claim.
 * Pure function — no side effects.
 */
export function parseClaim(text: string): ParsedClaim {
  const posScore = (text.match(POSITIVE_RE) ?? []).length;
  const negScore = (text.match(NEGATIVE_RE) ?? []).length + (NEGATIVE_STEM_RE.test(text) ? 1 : 0);
  const direction = negScore > posScore ? 'negative' : 'positive';

  const { value: magnitude, parsedPct } = extractMagnitude(text);

  const affected: ParsedClaim['affectedFactors'] = [];
  const matchedKeywords: string[] = [];

  // First matching rule owns the primary slot; subsequent matches contribute secondaries only.
  let primaryClaimed = false;
  for (const rule of FACTOR_RULES) {
    const matches = text.match(rule.keywords);
    if (!matches) continue;

    matchedKeywords.push(...matches.map(m => m.toLowerCase()));

    if (!primaryClaimed) {
      affected.push({ factor: rule.primary, weight: 'primary' });
      primaryClaimed = true;
      if (rule.secondary && !affected.some(a => a.factor === rule.secondary)) {
        affected.push({ factor: rule.secondary!, weight: 'secondary' });
      }
    } else {
      // Subsequent rule: add its primary as secondary if not already present
      if (!affected.some(a => a.factor === rule.primary)) {
        affected.push({ factor: rule.primary, weight: 'secondary' });
      }
    }
  }

  // Default: forecastSignal if nothing matched
  if (affected.length === 0) {
    affected.push({ factor: 'forecastSignal', weight: 'primary' });
  }

  return {
    rawText:         text,
    direction,
    magnitude,
    affectedFactors: affected,
    matchedKeywords: [...new Set(matchedKeywords)],
    parsedPct,
  };
}

// ── Historical norm tables ─────────────────────────────────────────────────

type NormRule = {
  /** Pattern that triggers this pushback check */
  trigger:       RegExp;
  /** Plausibility assigned if this rule fires */
  plausibility:  Plausibility;
  /** Short norm reference (shown to user) */
  normRef:       string;
  /** Full pushback message */
  pushback:      string;
};

const NORM_RULES: NormRule[] = [
  // Absolute guarantees are always extreme
  {
    trigger:      /\b(guaranteed?|can't fail|impossible to miss|sure thing|certainl[y]|definitely will|100% chance)\b/i,
    plausibility: 'extreme',
    normRef:      'Financial markets: no outcome is guaranteed',
    pushback:     'No financial outcome is guaranteed. Even the highest-conviction trades carry meaningful tail risk. The model treats certainty claims as extreme and scales their impact to 10%.',
  },
  // Zero-risk claims
  {
    trigger:      /\b(zero risk|no risk|risk.?free|riskless|completely safe|no downside)\b/i,
    plausibility: 'extreme',
    normRef:      'VIX floor: equity risk premium implies persistent non-zero downside risk',
    pushback:     '"Zero risk" is not consistent with equity investing. Even the lowest-volatility large-caps carry event risk and macro beta. This assumption is scaled to 10% impact.',
  },
  // Extreme short-term price claims (double, triple, 10x)
  {
    trigger:      /\b(doubles?|triple|10x|200%|300%|1000%)\b/i,
    plausibility: 'extreme',
    normRef:      'S&P 500: fewer than 2% of large-caps double within a single quarter',
    pushback:     'A doubling or more in 1–3 months is a >99th-percentile outcome for established companies. This has occurred in exceptional cases (meme episodes, merger arb), but cannot be the base case. Impact scaled to 10%.',
  },
  // Massive earnings beats
  {
    trigger:      /\b(beats? by 3[0-9]|beats? by [4-9]\d|beats? by \d{3}|earnings? up [5-9]\d|eps up [5-9]\d)\b/i,
    plausibility: 'low',
    normRef:      'S&P 500 historical average earnings beat: 5–7% above consensus',
    pushback:     'Earnings beats of 30%+ above consensus are extremely rare. The historical S&P 500 average beat is 5–7%. Beats above 20% occur in fewer than 3% of prints.',
  },
  // FDA/regulatory guarantees
  {
    trigger:      /\b(fda (?:will )?approve|regulatory (?:will )?approve|guaranteed? (?:approval|pass)|certain to pass)\b/i,
    plausibility: 'low',
    normRef:      'FDA Phase 3 approval rate: ~50–70%; binary event by nature',
    pushback:     'Regulatory approvals are binary events with meaningful failure probability. FDA Phase 3 approval rates are typically 50–70%. No regulatory outcome can be assumed as certain.',
  },
  // Stock going to zero
  {
    trigger:      /\b(goes? to zero|worthless|bankrupt(?:cy)?|stock (?:is )?dead|wipe.?out)\b/i,
    plausibility: 'extreme',
    normRef:      'Large-cap bankruptcy rate: <0.5% per year historically',
    pushback:     'Bankruptcy or total loss is an extreme scenario for established companies — historically fewer than 0.5% of large-caps per year. This assumption is scaled to 10% impact.',
  },
];

// ── Plausibility assessment ────────────────────────────────────────────────

/**
 * Assesses how plausible a parsed claim is against historical norms.
 * Also checks internal consistency with the existing breakdown.
 */
export function assessPlausibility(
  claim:     ParsedClaim,
  breakdown: ScoreBreakdown,
): PlausibilityAssessment {
  const text = claim.rawText;

  // 0. Percentage-based extreme check (before norm rule loop to avoid regex.source fragility)
  if (claim.parsedPct !== null) {
    if (claim.parsedPct >= 50) {
      return {
        level:    'extreme',
        scalar:   PLAUSIBILITY_SCALAR.extreme,
        pushback: 'Returns or moves of 50%+ in a 1–3 month window have occurred in fewer than 2% of large-cap cases historically. Impact is scaled to 10%.',
        normRef:  'S&P 500 historical: ~3–5% per quarter for large-cap equities',
      };
    }
    if (claim.parsedPct >= 30) {
      return {
        level:    'low',
        scalar:   PLAUSIBILITY_SCALAR.low,
        pushback: 'A 30%+ move in 1–3 months is well above the historical distribution for large-cap equities (~3–5% per quarter). Impact is scaled to 30%.',
        normRef:  'S&P 500 historical: 30%+ quarterly moves in top ~5% of outcomes',
      };
    }
  }

  // 1. Check norm rules in order — first match wins
  for (const rule of NORM_RULES) {
    if (rule.trigger.test(text)) {
      const level = rule.plausibility;
      return { level, scalar: PLAUSIBILITY_SCALAR[level], pushback: rule.pushback, normRef: rule.normRef };
    }
  }

  // 2. Magnitude-based plausibility assessment
  const mag = claim.magnitude;

  if (mag >= 3.0) {
    return {
      level:    'extreme',
      scalar:   PLAUSIBILITY_SCALAR.extreme,
      pushback: 'The magnitude implied by this assumption is at the extreme tail of historical outcomes for a 1–3 month window. Impact is scaled to 10%.',
      normRef:  'Historical distribution of short-term large-cap stock moves',
    };
  }

  // 3. Consistency check: are we trying to push a factor that's already at its ceiling?
  const primaryFactor = claim.affectedFactors.find(f => f.weight === 'primary')?.factor;
  if (primaryFactor) {
    const currentScore = breakdown[primaryFactor];
    if (claim.direction === 'positive' && currentScore >= 8.5) {
      return {
        level:    'low',
        scalar:   PLAUSIBILITY_SCALAR.low,
        pushback: `${primaryFactor} is already scored ${currentScore.toFixed(1)}/10 — further upside from this assumption has limited incremental impact. The model caps marginal plausibility at "low" when the component is near ceiling.`,
        normRef:  'Score ceiling consistency check',
      };
    }
    if (claim.direction === 'negative' && currentScore <= 2.0) {
      return {
        level:    'low',
        scalar:   PLAUSIBILITY_SCALAR.low,
        pushback: `${primaryFactor} is already scored ${currentScore.toFixed(1)}/10 — the component is near floor and further negative pressure has limited incremental impact.`,
        normRef:  'Score floor consistency check',
      };
    }
  }

  // 4. Magnitude → plausibility mapping (default path)
  if (mag <= 0.5)  return { level: 'high',   scalar: PLAUSIBILITY_SCALAR.high,   pushback: null, normRef: 'Magnitude within normal range' };
  if (mag <= 1.5)  return { level: 'high',   scalar: PLAUSIBILITY_SCALAR.high,   pushback: null, normRef: 'Magnitude within normal range' };
  if (mag <= 2.0)  return { level: 'medium', scalar: PLAUSIBILITY_SCALAR.medium, pushback: null, normRef: 'Magnitude moderately above historical median' };
  return             { level: 'low',    scalar: PLAUSIBILITY_SCALAR.low,    pushback: 'The magnitude of this assumption is above historical norms for the 1–3 month horizon. Impact is scaled to 30%.', normRef: 'Historical distribution: top quartile move' };
}

// ── Score adjustment math ──────────────────────────────────────────────────

/**
 * Applies scaled factor deltas and recomputes the weighted composite.
 * Returns both the adjusted breakdown and the new score.
 */
export function computeAdjustedScore(
  breakdown:      ScoreBreakdown,
  claim:          ParsedClaim,
  plausibility:   PlausibilityAssessment,
): {
  adjustedBreakdown: ScoreBreakdown;
  factorDeltas:      Partial<Record<ScoreFactor, number>>;
  adjustedScore:     number;
} {
  const scalar    = plausibility.scalar;
  const sign      = claim.direction === 'positive' ? 1 : -1;
  const rawMag    = claim.magnitude;

  const factorDeltas: Partial<Record<ScoreFactor, number>> = {};
  const adjusted   = { ...breakdown };

  for (const { factor, weight } of claim.affectedFactors) {
    const weightMult = weight === 'primary' ? 1.0 : 0.5;
    const delta      = sign * rawMag * scalar * weightMult;
    const clamped    = Math.max(0, Math.min(10, adjusted[factor] + delta));
    factorDeltas[factor] = round1(clamped - adjusted[factor]);
    adjusted[factor]     = round1(clamped);
  }

  const raw =
    adjusted.forecastSignal   * WEIGHTS.forecastSignal   +
    adjusted.catalystStrength * WEIGHTS.catalystStrength +
    adjusted.momentum         * WEIGHTS.momentum         +
    adjusted.earningsSetup    * WEIGHTS.earningsSetup    +
    adjusted.valuationSignal  * WEIGHTS.valuationSignal  +
    adjusted.riskAdjustment   * WEIGHTS.riskAdjustment;

  const adjustedScore = round1(Math.min(10, Math.max(1, raw)));

  return { adjustedBreakdown: adjusted, factorDeltas, adjustedScore };
}

// ── Explanation builder ────────────────────────────────────────────────────

function buildExplanation(
  claim:       ParsedClaim,
  plausibility: PlausibilityAssessment,
  delta:       number,
  input:       AssumptionInput,
): string {
  const { ticker, baseScore, horizonWeeks = 6 } = input;
  const direction  = claim.direction === 'positive' ? 'positive' : 'negative';
  const factorList = claim.affectedFactors
    .map(f => f.factor.replace(/([A-Z])/g, ' $1').toLowerCase().trim())
    .join(', ');
  const sign = delta >= 0 ? '+' : '';
  const plausLabel = plausibility.level.charAt(0).toUpperCase() + plausibility.level.slice(1);

  const deltaLine =
    delta === 0
      ? 'The assumption produced no net score change under current plausibility scaling.'
      : `Score moves ${sign}${delta.toFixed(1)}: ${baseScore.toFixed(1)} → ${round1(baseScore + delta).toFixed(1)}.`;

  const plausLine = `Plausibility: ${plausLabel} (scalar ${plausibility.scalar.toFixed(1)}×). ${plausibility.normRef}.`;

  const horizonLine = `Assessed over a ${horizonWeeks}-week investment horizon for ${ticker}.`;

  return [deltaLine, `Assumption reads as ${direction}, affecting ${factorList}.`, plausLine, horizonLine].join(' ');
}

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Applies a free-text user assumption to a stock's opportunity score.
 * Returns the adjusted score, delta, plausibility, and explanation.
 */
export function applyAssumption(input: AssumptionInput): AssumptionResult {
  const { baseScore, breakdown, assumption } = input;

  const claim       = parseClaim(assumption);
  const plausResult = assessPlausibility(claim, breakdown);
  const { adjustedBreakdown, factorDeltas } = computeAdjustedScore(
    breakdown,
    claim,
    plausResult,
  );

  const weightedDelta = (Object.entries(factorDeltas) as Array<[ScoreFactor, number | undefined]>)
    .reduce((sum, [factor, factorDelta]) => sum + (factorDelta ?? 0) * WEIGHTS[factor], 0);
  const adjustedScore = round1(Math.min(10, Math.max(1, baseScore + weightedDelta)));
  const delta       = round1(adjustedScore - baseScore);
  const explanation = buildExplanation(claim, plausResult, delta, input);

  return {
    adjustedScore,
    delta,
    plausibility:       plausResult.level,
    plausibilityScalar: plausResult.scalar,
    affectedFactors:    claim.affectedFactors.map(f => f.factor),
    factorDeltas,
    adjustedBreakdown,
    explanation,
    pushback:           plausResult.pushback,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
