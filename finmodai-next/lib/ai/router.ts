import 'server-only';

import { z } from 'zod';
import { callLLM, parseJSONResponse } from './llm';
import { ENV } from '@/lib/env/server';
import { selectSkeleton } from '@/lib/modeling/skeletons';

/**
 * Router Output Schema
 * Determines if a prompt requires building a quantitative model
 */
export const RouterOutputSchema = z.object({
  buildModel: z.boolean(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  skeletonId: z.string().optional(),
});

export type RouterOutput = z.infer<typeof RouterOutputSchema>;

/**
 * Keywords that indicate a model is needed
 * buildModel = true if prompt implies: decision, tradeoff, forecast, sensitivity, 
 * pricing, profitability, ROI, scenarios, growth, margin, cash flow
 */
const MODEL_KEYWORDS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  // Decision & Tradeoff
  { pattern: /\bdecision\b|\bshould\s+we\b|\bshould\s+i\b|\bdecide\b/i, weight: 4, label: 'decision' },
  { pattern: /\btrade[-\s]?off\b|\btradeoff\b|\bgrowth\s+vs\s+margin\b/i, weight: 5, label: 'tradeoff' },
  
  // Forecast & Projections
  { pattern: /\bforecast\b|\bproject\b|\bprojection\b|\bestimate\b|\bpredict\b/i, weight: 4, label: 'forecast' },
  { pattern: /\bnext\s+\d+\s*(quarters?|years?|months?)\b/i, weight: 3, label: 'time_horizon' },
  
  // Scenarios & Sensitivity
  { pattern: /\bscenario\b|\bscenarios\b|\bwhat\s+if\b/i, weight: 4, label: 'scenarios' },
  { pattern: /\bsensitivity\b|\bsensitive\b|\bstress\s+test\b/i, weight: 4, label: 'sensitivity' },
  { pattern: /\bbase\s+case\b|\bupside\b|\bdownside\b/i, weight: 3, label: 'scenario_variants' },
  
  // Pricing
  { pattern: /\bpricing\s+impact\b|\bprice\s+change\b|\bif\s+price\s+(increases?|decreases?|changes?)\b/i, weight: 4, label: 'pricing' },
  { pattern: /\braise\s+price\b|\blower\s+price\b|\bpricing\s+strategy\b/i, weight: 3, label: 'pricing_action' },
  
  // Profitability
  { pattern: /\bprofitability\b|\bprofitable\b|\bprofit\s+margin\b|\boperating\s+margin\b/i, weight: 3, label: 'profitability' },
  { pattern: /\bgross\s+margin\b|\bebitda\s+margin\b/i, weight: 3, label: 'margin' },
  
  // ROI
  { pattern: /\broi\b|\breturn\s+on\s+investment\b|\birr\b|\bpayback\b/i, weight: 4, label: 'roi' },
  { pattern: /\bnpv\b|\bnet\s+present\s+value\b/i, weight: 4, label: 'npv' },
  
  // Growth
  { pattern: /\bgrowth\b|\bscale\b|\bscaling\b/i, weight: 2, label: 'growth' },
  { pattern: /\brevenue\s+growth\b|\bsales\s+growth\b/i, weight: 3, label: 'revenue_growth' },
  
  // Margin
  { pattern: /\bmargin\b|\bmargins\b/i, weight: 2, label: 'margin' },
  { pattern: /\bimprove\s+margin\b|\bmargin\s+improvement\b/i, weight: 3, label: 'margin_improvement' },
  
  // Cash Flow
  { pattern: /\bcash\s+flow\b|\bfcf\b|\bfree\s+cash\s+flow\b/i, weight: 3, label: 'cash_flow' },
  { pattern: /\bcash\s+generation\b|\bcash\s+burn\b/i, weight: 3, label: 'cash_management' },
];

/**
 * Keywords that indicate NO model is needed (purely descriptive)
 */
const NON_MODEL_KEYWORDS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  { pattern: /\bwhat\s+is\b|\bdefine\b|\bdefinition\b|\bmeaning\b/i, weight: 4, label: 'definitional' },
  { pattern: /\bexplain\b|\bdescribe\b|\btell\s+me\s+about\b/i, weight: 3, label: 'descriptive' },
  { pattern: /\bhistory\b|\bhistorical\b|\bpast\b|\blast\s+year\b/i, weight: 2, label: 'historical_only' },
  { pattern: /\bwhat\s+happened\b|\bwhy\s+did\b/i, weight: 3, label: 'retrospective' },
  { pattern: /\bcurrent\s+state\b|\bas\s+of\s+now\b|\bcurrently\b/i, weight: 2, label: 'current_state' },
];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Router prompt for LLM fallback
 */
const ROUTER_PROMPT = `You are a prompt classifier that determines if a user's question requires building a quantitative financial model to answer well.

Return ONLY valid JSON with this exact structure:
{
  "buildModel": boolean,
  "reason": string,
  "confidence": number
}

Rules:
- buildModel = true if the prompt implies: decision, tradeoff, forecast, sensitivity, pricing, profitability, ROI, scenarios, growth, margin, cash flow
- buildModel = false if the prompt is purely descriptive, definitional, or asks "what is" / "explain" without quantitative analysis
- confidence: number between 0 and 1 (0.5 = unsure, 1.0 = very confident)
- reason: brief explanation (one sentence)

Examples:
- "What is revenue?" → {"buildModel": false, "reason": "Definitional question", "confidence": 0.9}
- "Forecast revenue for next 4 quarters" → {"buildModel": true, "reason": "Requires forecasting model", "confidence": 0.95}
- "Should we raise prices?" → {"buildModel": true, "reason": "Decision requires pricing impact model", "confidence": 0.9}
- "Explain what DCF means" → {"buildModel": false, "reason": "Purely descriptive/definitional", "confidence": 0.85}

CRITICAL: Return ONLY the JSON object. No markdown, no code blocks, no commentary.`;

/**
 * Route prompt using rule-based classification
 */
export function routePromptRules(prompt: string): RouterOutput {
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
  
  for (const keyword of MODEL_KEYWORDS) {
    if (keyword.pattern.test(text)) {
      modelScore += keyword.weight;
      modelHits.push(keyword.label);
    }
  }
  
  // Count non-model indicators
  let nonModelScore = 0;
  const nonModelHits: string[] = [];
  
  for (const keyword of NON_MODEL_KEYWORDS) {
    if (keyword.pattern.test(text)) {
      nonModelScore += keyword.weight;
      nonModelHits.push(keyword.label);
    }
  }
  
  // Determine buildModel
  const buildModel = modelScore > nonModelScore || (modelScore > 0 && nonModelScore === 0);
  
  // Calculate confidence
  const totalScore = modelScore + nonModelScore;
  let confidence: number;
  
  if (totalScore === 0) {
    // No clear indicators - low confidence
    confidence = 0.4;
  } else if (buildModel) {
    // Model is needed - confidence based on model score strength
    if (modelScore >= 10) {
      confidence = 0.9;
    } else if (modelScore >= 6) {
      confidence = 0.75;
    } else if (modelScore >= 3) {
      confidence = 0.65;
    } else {
      confidence = 0.55;
    }
    
    // Reduce confidence if non-model indicators present
    if (nonModelScore > 0) {
      confidence = clamp01(confidence - (nonModelScore / totalScore) * 0.2);
    }
  } else {
    // No model needed - confidence based on non-model score strength
    if (nonModelScore >= 6) {
      confidence = 0.85;
    } else if (nonModelScore >= 3) {
      confidence = 0.7;
    } else {
      confidence = 0.5;
    }
  }
  
  // Build reason
  const primaryHits = buildModel ? modelHits : nonModelHits;
  const reason = primaryHits.length > 0
    ? `${buildModel ? 'Model required' : 'No model required'}: ${primaryHits.slice(0, 3).join(', ')}`
    : buildModel
    ? 'Model indicators detected'
    : 'Descriptive/definitional prompt';
  
  // Select skeleton if model is needed
  let skeletonId: string | undefined;
  if (buildModel) {
    const skeleton = selectSkeleton(prompt);
    if (skeleton) {
      skeletonId = skeleton.id;
      // Boost confidence if skeleton found
      confidence = clamp01(confidence + 0.1);
    }
  }

  return {
    buildModel,
    reason,
    confidence: clamp01(confidence),
    skeletonId,
  };
}

/**
 * Route prompt with LLM fallback if confidence < 0.65
 */
export async function routePrompt(prompt: string): Promise<RouterOutput> {
  // First, try rule-based routing
  const rulesResult = routePromptRules(prompt);
  
  // If confidence >= 0.65, return rules result
  if (rulesResult.confidence >= 0.65) {
    return rulesResult;
  }
  
  // Confidence < 0.65 - use LLM fallback
  if (!ENV.OPENAI_API_KEY) {
    // No LLM available - return rules result with warning
    return {
      ...rulesResult,
      reason: `${rulesResult.reason} (LLM unavailable, using rules)`,
      confidence: rulesResult.confidence,
    };
  }

  try {
    const traceId = crypto.randomUUID();
    
    const userPrompt = `User prompt: "${prompt}"

${ROUTER_PROMPT}`;
    
    const response = await callLLM({
      systemPrompt: ROUTER_PROMPT,
      userPrompt,
      model: ENV.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2, // Low temperature for consistent classification
      maxTokens: 200,
      responseFormat: { type: 'json_object' },
      traceId,
    });
    
    const parsed = parseJSONResponse<RouterOutput>(response.content, traceId);
    const validated = RouterOutputSchema.safeParse(parsed);
    
    if (validated.success) {
      // If LLM didn't provide skeletonId, try to select one
      if (!validated.data.skeletonId && validated.data.buildModel) {
        const skeleton = selectSkeleton(prompt);
        if (skeleton) {
          validated.data.skeletonId = skeleton.id;
        }
      }
      return validated.data;
    } else {
      // LLM response invalid - fallback to rules
      console.warn('[router] LLM response invalid, falling back to rules', validated.error);
      return rulesResult;
    }
  } catch (error: any) {
    // LLM call failed - fallback to rules
    console.warn('[router] LLM call failed, falling back to rules', error?.message);
    return {
      ...rulesResult,
      reason: `${rulesResult.reason} (LLM failed, using rules)`,
      confidence: rulesResult.confidence,
    };
  }
}
