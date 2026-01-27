import 'server-only';

import { z } from 'zod';

/**
 * Prompt Classification Schema
 * Determines if a quantitative model is required to answer the prompt well
 */
export const PromptClassificationSchema = z.object({
  buildModel: z.boolean(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
});

export type PromptClassification = z.infer<typeof PromptClassificationSchema>;

/**
 * Keywords and patterns that indicate a model is needed
 */
const MODEL_INDICATORS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  // Forecasting & Projections
  { pattern: /\bforecast\b|\bproject\b|\bprojection\b|\bestimate\b|\bpredict\b/i, weight: 4, label: 'forecasting' },
  { pattern: /\bnext\s+\d+\s*(quarters?|years?|months?|weeks?)\b/i, weight: 4, label: 'time_horizon' },
  { pattern: /\bover\s+time\b|\bgoing\s+forward\b|\bfuture\b/i, weight: 2, label: 'temporal' },
  
  // Scenarios & Sensitivity
  { pattern: /\bscenario\b|\bscenarios\b|\bwhat\s+if\b|\bif\s+.+\b(then|happens?|changes?)\b/i, weight: 4, label: 'scenarios' },
  { pattern: /\bsensitivity\b|\bsensitive\b|\bstress\s+test\b|\bstress\s+testing\b/i, weight: 4, label: 'sensitivity' },
  { pattern: /\bbase\s+case\b|\bupside\b|\bdownside\b/i, weight: 3, label: 'scenario_variants' },
  
  // ROI & Financial Outcomes
  { pattern: /\broi\b|\breturn\s+on\s+investment\b|\birr\b|\bpayback\b/i, weight: 4, label: 'roi' },
  { pattern: /\bprofitability\b|\bprofitable\b|\bprofit\s+margin\b|\boperating\s+margin\b/i, weight: 3, label: 'profitability' },
  { pattern: /\bnpv\b|\bnet\s+present\s+value\b|\bvaluation\b|\bdcf\b/i, weight: 4, label: 'valuation' },
  { pattern: /\bcash\s+flow\b|\bfcf\b|\bfree\s+cash\s+flow\b/i, weight: 3, label: 'cash_flow' },
  
  // Pricing & Impact Analysis
  { pattern: /\bpricing\s+impact\b|\bprice\s+change\b|\bif\s+price\s+(increases?|decreases?|changes?)\b/i, weight: 4, label: 'pricing_impact' },
  { pattern: /\brevenue\s+impact\b|\bsales\s+impact\b|\bimpact\s+on\s+(revenue|sales)\b/i, weight: 3, label: 'revenue_impact' },
  { pattern: /\bmargin\s+impact\b|\bcost\s+impact\b/i, weight: 3, label: 'margin_impact' },
  { pattern: /\bimpact\s+of\b|\bthe\s+impact\b|\bcalculate\s+impact\b|\bmodel\s+impact\b/i, weight: 4, label: 'impact_analysis' },
  
  // Tradeoffs
  { pattern: /\btrade[-\s]?off\b|\btradeoff\b|\btrade\s+off\b/i, weight: 4, label: 'tradeoff' },
  { pattern: /\bgrowth\s+vs\s+margin\b|\bmargin\s+vs\s+growth\b|\bprofitability\s+vs\s+growth\b/i, weight: 5, label: 'growth_margin_tradeoff' },
  { pattern: /\boptimize\b|\boptimization\b|\bmaximize\b|\bminimize\b/i, weight: 3, label: 'optimization' },
  
  // Time-based Outcomes
  { pattern: /\bby\s+(q[1-4]|\d+\s*(quarter|year|month))\b/i, weight: 3, label: 'time_bound' },
  { pattern: /\bpath\s+to\b|\bhow\s+to\s+get\s+to\b|\bramp\b|\bscaling\b/i, weight: 2, label: 'trajectory' },
  
  // Quantitative Drivers
  { pattern: /\bdriver\b|\bdrivers\b|\bdepends?\s+on\b|\bdependency\b/i, weight: 2, label: 'drivers' },
  { pattern: /\bassumption\b|\bassumptions\b|\bwhat\s+if\s+.+\s+changes?\b/i, weight: 2, label: 'assumptions' },
  
  // Decision Support
  { pattern: /\bshould\s+we\b|\bshould\s+i\b|\bdecide\b|\bdecision\b/i, weight: 3, label: 'decision' },
  { pattern: /\bwhich\s+(option|strategy|approach)\b/i, weight: 3, label: 'choice' },
  
  // Financial Metrics & Models
  { pattern: /\blbo\b|\bleveraged\s+buyout\b/i, weight: 4, label: 'lbo' },
  { pattern: /\bcomps\b|\bcomparable\s+companies\b/i, weight: 2, label: 'comps' },
  { pattern: /\bunit\s+economics\b|\bcac\b|\bltv\b/i, weight: 3, label: 'unit_economics' },
];

/**
 * Patterns that indicate NO model is needed (definitional/descriptive)
 */
const NON_MODEL_INDICATORS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  { pattern: /\bwhat\s+is\b|\bdefine\b|\bdefinition\b|\bmeaning\b/i, weight: 3, label: 'definitional' },
  { pattern: /\bexplain\b|\bdescribe\b|\btell\s+me\s+about\b/i, weight: 2, label: 'descriptive' },
  { pattern: /\bhistory\b|\bhistorical\b|\bpast\b|\blast\s+year\b/i, weight: 1, label: 'historical_only' },
  { pattern: /\bwhat\s+happened\b|\bwhy\s+did\b/i, weight: 2, label: 'retrospective' },
  { pattern: /\bcurrent\s+state\b|\bas\s+of\s+now\b|\bcurrently\b/i, weight: 1, label: 'current_state' },
];

/**
 * Classify a user prompt to determine if a quantitative model is required
 */
export function classifyPrompt(prompt: string): PromptClassification {
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return {
      buildModel: false,
      reason: 'Empty or invalid prompt',
      confidence: 1.0,
    };
  }

  const text = prompt.trim();
  
  // Count model indicators
  let modelScore = 0;
  const modelHits: string[] = [];
  
  for (const indicator of MODEL_INDICATORS) {
    if (indicator.pattern.test(text)) {
      modelScore += indicator.weight;
      modelHits.push(indicator.label);
    }
  }
  
  // Count non-model indicators
  let nonModelScore = 0;
  const nonModelHits: string[] = [];
  
  for (const indicator of NON_MODEL_INDICATORS) {
    if (indicator.pattern.test(text)) {
      nonModelScore += indicator.weight;
      nonModelHits.push(indicator.label);
    }
  }
  
  // Decision logic
  const buildModel = modelScore > nonModelScore;
  const netScore = Math.abs(modelScore - nonModelScore);
  const totalPossibleScore = Math.max(modelScore, nonModelScore, 1);
  
  // Confidence based on score difference and total signals
  let confidence = 0.5;
  if (netScore >= 5) {
    confidence = 0.9;
  } else if (netScore >= 3) {
    confidence = 0.75;
  } else if (netScore >= 2) {
    confidence = 0.65;
  } else if (netScore >= 1) {
    confidence = 0.55;
  } else {
    confidence = 0.5; // Ambiguous
  }
  
  // Build reason string
  const primarySignals = buildModel ? modelHits : nonModelHits;
  const reasonParts: string[] = [];
  
  if (buildModel) {
    reasonParts.push('Model required: prompt implies');
    if (primarySignals.length > 0) {
      reasonParts.push(primarySignals.slice(0, 3).join(', '));
    } else {
      reasonParts.push('quantitative analysis');
    }
  } else {
    reasonParts.push('Model not required: prompt is');
    if (primarySignals.length > 0) {
      reasonParts.push(primarySignals.slice(0, 2).join(', '));
    } else {
      reasonParts.push('definitional or descriptive');
    }
  }
  
  const reason = reasonParts.join(' ');
  
  return {
    buildModel,
    reason,
    confidence: Math.round(confidence * 100) / 100, // Round to 2 decimals
  };
}

/**
 * Validate and return classification result
 */
export function validateClassification(input: unknown): PromptClassification {
  const parsed = PromptClassificationSchema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }
  
  // Fallback for invalid input
  return {
    buildModel: false,
    reason: 'Invalid classification input',
    confidence: 0.0,
  };
}

