import 'server-only';

import type { ModelAndVizArtifact } from '@/lib/ai/schemas';
import type { EvaluationOutput } from './evaluator';

/**
 * Sanity Check Result
 */
export type SanityIssue = {
  code: string;
  message: string;
  affected_keys: string[];
  severity: 'error' | 'warning';
  clamped_value?: number;
  original_value?: number;
};

export type SanityResult = {
  passed: boolean;
  issues: SanityIssue[];
  clamped_inputs: Record<string, number>; // input key -> clamped value
};

/**
 * Decision Signal
 */
export type DecisionSignal = {
  direction: 'up' | 'down' | 'neutral';
  magnitude: number; // 0-1 scale
  explanation: string;
};

/**
 * Run sanity checks on model inputs and outputs
 * Clamps invalid values and returns warnings instead of failing
 */
export function checkModelSanity(
  artifact: ModelAndVizArtifact,
  evaluationOutput?: EvaluationOutput
): SanityResult {
  const issues: SanityIssue[] = [];
  const clamped_inputs: Record<string, number> = {};
  const { model } = artifact;

  // Check each input
  for (const input of model.inputs) {
    const value = typeof input.value === 'number' ? input.value : Number(input.value) || 0;
    
    // Revenue, price, units must be >= 0
    if (['revenue', 'price', 'units', 'starting_revenue', 'base_price', 'base_units'].some(k => 
      input.key.toLowerCase().includes(k)
    )) {
      if (value < 0) {
        issues.push({
          code: 'negative_revenue_price_units',
          message: `${input.label || input.key} cannot be negative`,
          affected_keys: [input.key],
          severity: 'warning',
          clamped_value: 0,
          original_value: value,
        });
        clamped_inputs[input.key] = 0;
      }
    }

    // Churn, margins must be <= 100% (or 1.0 if decimal)
    if (['churn', 'margin', 'cogs', 'opex', 'tax'].some(k => 
      input.key.toLowerCase().includes(k)
    ) && input.unit?.includes('%') || input.key.toLowerCase().includes('pct') || input.key.toLowerCase().includes('percent')) {
      const maxValue = value > 1 ? 100 : 1; // Handle both decimal and percentage formats
      const actualMax = value > 1 ? 100 : 1;
      
      if (value > actualMax) {
        issues.push({
          code: 'exceeds_max_percentage',
          message: `${input.label || input.key} exceeds maximum (${actualMax}${value > 1 ? '%' : ''})`,
          affected_keys: [input.key],
          severity: 'warning',
          clamped_value: actualMax,
          original_value: value,
        });
        clamped_inputs[input.key] = actualMax;
      }
    }

    // Growth rates: bounds [-50%, +100%] (or [-0.5, +1.0] if decimal)
    if (['growth', 'expansion', 'rate'].some(k => 
      input.key.toLowerCase().includes(k)
    ) && !input.key.toLowerCase().includes('churn')) {
      // Check unit field to determine format, otherwise use heuristic
      const hasPercentUnit = input.unit?.includes('%');
      // If value is > 1 and no explicit unit, treat as decimal but check if it exceeds 1.0
      // If value is > 1 and has % unit, treat as percentage
      // If value <= 1, treat as decimal
      const isPercentage = hasPercentUnit && Math.abs(value) > 1;
      const isDecimalOverflow = !hasPercentUnit && Math.abs(value) > 1 && value > 1.0;
      
      if (isPercentage) {
        // Percentage format: bounds [-50%, +100%]
        const minValue = -50;
        const maxValue = 100;
        
        if (value < minValue) {
          issues.push({
            code: 'growth_too_negative',
            message: `${input.label || input.key} growth rate too negative (${value}%)`,
            affected_keys: [input.key],
            severity: 'warning',
            clamped_value: minValue,
            original_value: value,
          });
          clamped_inputs[input.key] = minValue;
        } else if (value > maxValue) {
          issues.push({
            code: 'growth_too_high',
            message: `${input.label || input.key} growth rate too high (${value}%)`,
            affected_keys: [input.key],
            severity: 'warning',
            clamped_value: maxValue,
            original_value: value,
          });
          clamped_inputs[input.key] = maxValue;
        }
      } else {
        // Decimal format: bounds [-0.5, +1.0]
        const minValue = -0.5;
        const maxValue = 1.0;
        
        if (value < minValue) {
          issues.push({
            code: 'growth_too_negative',
            message: `${input.label || input.key} growth rate too negative (${value})`,
            affected_keys: [input.key],
            severity: 'warning',
            clamped_value: minValue,
            original_value: value,
          });
          clamped_inputs[input.key] = minValue;
        } else if (value > maxValue || isDecimalOverflow) {
          issues.push({
            code: 'growth_too_high',
            message: `${input.label || input.key} growth rate too high (${value}, should be <= 1.0 for decimal format)`,
            affected_keys: [input.key],
            severity: 'warning',
            clamped_value: maxValue,
            original_value: value,
          });
          clamped_inputs[input.key] = maxValue;
        }
      }
    }
  }

  // Check evaluation outputs for exponential blowups
  if (evaluationOutput) {
    checkExponentialBlowups(evaluationOutput, issues);
  }

  const errors = issues.filter(i => i.severity === 'error');
  
  return {
    passed: errors.length === 0,
    issues,
    clamped_inputs,
  };
}

/**
 * Check for exponential blowups in time series
 */
function checkExponentialBlowups(
  evaluationOutput: EvaluationOutput,
  issues: SanityIssue[]
): void {
  const { series } = evaluationOutput;

  for (const [key, values] of Object.entries(series)) {
    if (!Array.isArray(values) || values.length < 2) continue;

    // Check for extreme growth rates between consecutive periods
    for (let i = 1; i < values.length; i++) {
      const prev = values[i - 1];
      const curr = values[i];

      if (typeof prev !== 'number' || typeof curr !== 'number') continue;
      if (!Number.isFinite(prev) || !Number.isFinite(curr)) continue;
      if (prev === 0) continue; // Skip division by zero

      const growthRate = (curr - prev) / Math.abs(prev);
      
      // Flag if growth rate exceeds 100% per period (exponential blowup)
      if (Math.abs(growthRate) > 1.0) {
        issues.push({
          code: 'exponential_blowup',
          message: `${key} shows extreme growth (${(growthRate * 100).toFixed(1)}%) between periods ${i - 1} and ${i}`,
          affected_keys: [key],
          severity: 'warning',
        });
      }

      // Flag if absolute value exceeds reasonable bounds (e.g., 1 trillion)
      const absValue = Math.abs(curr);
      if (absValue > 1e12) {
        issues.push({
          code: 'value_too_large',
          message: `${key} value exceeds reasonable bounds (${formatLargeNumber(curr)})`,
          affected_keys: [key],
          severity: 'warning',
        });
      }
    }
  }
}

/**
 * Format large numbers for display
 */
function formatLargeNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toFixed(2);
}

/**
 * Compute decision signal from model evaluation
 * Analyzes objective metric trajectory to provide decision guidance
 */
export function computeDecisionSignal(
  artifact: ModelAndVizArtifact,
  evaluationOutput: EvaluationOutput
): DecisionSignal | null {
  const { model } = artifact;
  const { series } = evaluationOutput;

  const objectiveKey = model.objective_metric_key;
  if (!objectiveKey) return null;

  // Try to find objective metric in series (check base scenario first)
  let objectiveSeries: number[] | undefined;
  const baseKey = `${objectiveKey}__Base`;
  
  if (series[baseKey]) {
    objectiveSeries = series[baseKey];
  } else if (series[objectiveKey]) {
    objectiveSeries = series[objectiveKey];
  }

  if (!objectiveSeries || objectiveSeries.length < 2) return null;

  // Calculate trend
  const start = objectiveSeries[0];
  const end = objectiveSeries[objectiveSeries.length - 1];
  
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start === 0) return null; // Can't compute percentage change

  const delta = end - start;
  const percentChange = (delta / Math.abs(start)) * 100;

  // Determine direction
  let direction: 'up' | 'down' | 'neutral';
  if (Math.abs(percentChange) < 5) {
    direction = 'neutral';
  } else if (percentChange > 0) {
    direction = 'up';
  } else {
    direction = 'down';
  }

  // Calculate magnitude (0-1 scale, based on absolute percentage change)
  const magnitude = Math.min(Math.abs(percentChange) / 100, 1.0);

  // Build explanation
  const metricLabel = model.objective_metric_label || objectiveKey;
  const absPercent = Math.abs(percentChange).toFixed(1);
  const sign = percentChange >= 0 ? '+' : '';
  
  let explanation: string;
  if (direction === 'neutral') {
    explanation = `${metricLabel} remains relatively stable (${sign}${percentChange.toFixed(1)}% over period).`;
  } else if (direction === 'up') {
    explanation = `${metricLabel} shows positive trajectory (${sign}${percentChange.toFixed(1)}% growth over period).`;
  } else {
    explanation = `${metricLabel} shows negative trajectory (${percentChange.toFixed(1)}% decline over period).`;
  }

  // Add scenario context if available
  if (evaluationOutput.scenarios && evaluationOutput.scenarios.length > 1) {
    const upsideKey = `${objectiveKey}__Upside`;
    const downsideKey = `${objectiveKey}__Downside`;
    
    if (series[upsideKey] && series[downsideKey]) {
      const upsideEnd = series[upsideKey][series[upsideKey].length - 1];
      const downsideEnd = series[downsideKey][series[downsideKey].length - 1];
      
      if (Number.isFinite(upsideEnd) && Number.isFinite(downsideEnd) && start !== 0) {
        const upsideDelta = ((upsideEnd - start) / Math.abs(start)) * 100;
        const downsideDelta = ((downsideEnd - start) / Math.abs(start)) * 100;
        
        explanation += ` Scenario range: ${downsideDelta.toFixed(1)}% to ${upsideDelta.toFixed(1)}%.`;
      }
    }
  }

  return {
    direction,
    magnitude,
    explanation,
  };
}

/**
 * Apply clamped inputs to artifact
 */
export function applyClampedInputs(
  artifact: ModelAndVizArtifact,
  clamped_inputs: Record<string, number>
): ModelAndVizArtifact {
  if (Object.keys(clamped_inputs).length === 0) return artifact;

  return {
    ...artifact,
    model: {
      ...artifact.model,
      inputs: artifact.model.inputs.map(input => {
        const clamped = clamped_inputs[input.key];
        if (clamped !== undefined) {
          return {
            ...input,
            value: clamped,
          };
        }
        return input;
      }),
    },
  };
}

/**
 * Tag inputs with confidence and source
 * Inputs already support these fields via ModelInputSchema
 * This helper function can be used to automatically tag inputs based on their values
 */
export function tagInputsWithConfidence(
  artifact: ModelAndVizArtifact,
  confidenceMap?: Record<string, 'high' | 'medium' | 'low'>,
  sourceMap?: Record<string, 'user' | 'inferred' | 'placeholder'>
): ModelAndVizArtifact {
  return {
    ...artifact,
    model: {
      ...artifact.model,
      inputs: artifact.model.inputs.map(input => {
        const confidence = confidenceMap?.[input.key] || inferConfidence(input);
        const source = sourceMap?.[input.key] || input.source || inferSource(input);
        
        return {
          ...input,
          // Note: confidence is not in the schema yet, but source is
          source: source as 'user' | 'inferred' | 'placeholder',
        };
      }),
    },
  };
}

/**
 * Infer confidence level based on input characteristics
 */
function inferConfidence(input: ModelAndVizArtifact['model']['inputs'][0]): 'high' | 'medium' | 'low' {
  // High confidence: user-provided, has notes, or is a standard default
  if (input.source === 'user') return 'high';
  if (input.notes && input.notes.length > 10) return 'high';
  
  // Low confidence: placeholder values or extreme values
  if (input.source === 'placeholder') return 'low';
  if (input.value === 0 && ['revenue', 'price', 'units'].some(k => input.key.includes(k))) return 'low';
  
  // Medium confidence: default
  return 'medium';
}

/**
 * Infer source based on input characteristics
 * Used by tagInputsWithConfidence helper
 */
function inferSourceFromInput(input: ModelAndVizArtifact['model']['inputs'][0]): 'user' | 'inferred' | 'placeholder' {
  // If already has source, use it
  if (input.source) return input.source;
  
  // Check notes for explicit markers
  const notes = (input.notes || '').toLowerCase();
  if (notes.includes('placeholder') || notes.includes('example') || notes.includes('illustrative')) {
    return 'placeholder';
  }
  if (notes.includes('inferred') || notes.includes('estimated') || notes.includes('derived')) {
    return 'inferred';
  }
  if (notes.includes('user') || notes.includes('provided')) {
    return 'user';
  }
  
  // Placeholder: round numbers, common defaults
  const value = typeof input.value === 'number' ? input.value : Number(input.value) || 0;
  if (value === 0 || value === 100 || value === 0.1 || value === 0.2 || value === 1000) {
    return 'placeholder';
  }
  
  // Inferred: reasonable values but no explicit user indication
  return 'inferred';
}

