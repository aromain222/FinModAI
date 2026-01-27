import type { ModelAndVizArtifact } from '@/lib/ai/schemas';
import { evaluateModel } from './evaluator';

export type SensitivityImpact = {
  input_key: string;
  input_label: string;
  base_value: number;
  down_value: number; // Value at -pct
  up_value: number; // Value at +pct
  metric_down: number | null; // Metric value when input is down
  metric_base: number; // Base metric value
  metric_up: number | null; // Metric value when input is up
  delta_down: number; // metric_down - metric_base
  delta_up: number; // metric_up - metric_base
  impact_down_pct: number; // (delta_down / metric_base) * 100
  impact_up_pct: number; // (delta_up / metric_base) * 100
  abs_max_impact: number; // max(abs(delta_down), abs(delta_up))
};

export type OneWaySensitivityResult = {
  metric_key: string;
  metric_label: string;
  metric_base_value: number;
  impacts: SensitivityImpact[];
  warnings: string[];
};

export type TwoWaySensitivityGrid = {
  metric_key: string;
  metric_label: string;
  x_input_key: string;
  x_input_label: string;
  y_input_key: string;
  y_input_label: string;
  x_steps: number[];
  y_steps: number[];
  grid: Array<Array<number | null>>; // grid[y_index][x_index] = metric_value
  warnings: string[];
};

/**
 * Evaluate a model artifact with modified inputs and extract metric value
 * Uses optimized evaluator with caching
 */
function evaluateModelWithInputs(
  artifact: ModelAndVizArtifact,
  modifiedInputs: Array<{ key: string; label: string; value: number | string; unit?: string; notes?: string; source?: string }>
): { metricValue: number | null; warnings: string[] } {
  // Build inputOverrides map from modified inputs
  const inputOverrides: Record<string, number> = {};
  for (const input of modifiedInputs) {
    const numValue = typeof input.value === 'number' ? input.value : Number(input.value);
    if (Number.isFinite(numValue)) {
      inputOverrides[input.key] = numValue;
    }
  }

  // Update artifact with modified inputs
  const modifiedArtifact: ModelAndVizArtifact = {
    ...artifact,
    model: {
      ...artifact.model,
      inputs: modifiedInputs.map(inp => ({
        key: inp.key,
        label: inp.label,
        value: typeof inp.value === 'number' ? inp.value : Number(inp.value) || 0,
        unit: inp.unit,
        notes: inp.notes,
        source: (inp.source === 'user' || inp.source === 'inferred' || inp.source === 'placeholder') 
          ? inp.source 
          : undefined,
      })),
    },
  };

  // Evaluate model
  const result = evaluateModel(modifiedArtifact, inputOverrides);
  
  // Extract metric value from evaluation output
  // Use objective metric key if available, otherwise first output
  const metricKey = artifact.model.objective_metric_key || artifact.model.outputs[0]?.key;
  let metricValue: number | null = null;
  
  if (metricKey && result.rows && result.rows.length > 0) {
    // Get value from last row (final period)
    const lastRow = result.rows[result.rows.length - 1];
    const value = lastRow[metricKey];
    if (typeof value === 'number' && Number.isFinite(value)) {
      metricValue = value;
    }
  }

  // Collect warnings from validation
  const warnings: string[] = [];
  if (result.validation && !result.validation.passed && result.validation.issues) {
    warnings.push(...result.validation.issues.map(i => i.message || i.code));
  }
  if (result.sanity && result.sanity.issues.length > 0) {
    warnings.push(...result.sanity.issues.map(i => i.message || i.code));
  }

  return {
    metricValue,
    warnings,
  };
}

function clampInputValue(value: number, baseValue: number, pct: number, min?: number, max?: number): number {
  const delta = baseValue * pct;
  const downValue = baseValue - delta;
  const upValue = baseValue + delta;

  // Apply bounds if provided
  const clampedDown = min !== undefined ? Math.max(min, downValue) : downValue;
  const clampedUp = max !== undefined ? Math.min(max, upValue) : upValue;

  // If value is the down variant, return clamped down; if up, return clamped up
  // This is a simplified approach - in reality we'd track which variant we're computing
  if (Math.abs(value - downValue) < Math.abs(value - upValue)) {
    return clampedDown;
  }
  return clampedUp;
}

function getInputBounds(key: string, unit?: string): { min?: number; max?: number } {
  const keyLower = key.toLowerCase();
  const unitLower = (unit || '').toLowerCase();

  // Percentage bounds
  if (unitLower.includes('%') || keyLower.includes('pct') || keyLower.includes('percent') || keyLower.includes('rate')) {
    if (keyLower.includes('growth')) {
      return { min: -0.5, max: 0.5 }; // Growth: -50% to +50%
    }
    if (keyLower.includes('margin')) {
      return { min: -0.5, max: 0.95 }; // Margin: -50% to 95%
    }
    if (keyLower.includes('wacc') || keyLower.includes('discount')) {
      return { min: 0.05, max: 0.20 }; // WACC: 5% to 20%
    }
    return { min: -1, max: 1 }; // Generic percentage: -100% to 100%
  }

  // Revenue/financial bounds (typically positive)
  if (keyLower.includes('revenue') || keyLower.includes('price') || keyLower.includes('value')) {
    return { min: 0, max: undefined }; // No upper bound
  }

  // Shares/debt can be positive or zero
  if (keyLower.includes('shares') || keyLower.includes('debt')) {
    return { min: 0, max: undefined };
  }

  return {}; // No bounds
}

/**
 * Perform 1-way sensitivity analysis on a MODEL_AND_VIZ artifact
 * Varies each input by ±pct and measures impact on chosen metric
 * Returns top N drivers sorted by absolute impact
 */
export function oneWaySensitivity(
  artifact: ModelAndVizArtifact,
  metricKey?: string,
  pct: number = 0.1,
  topN: number = 8
): OneWaySensitivityResult {
  const warnings: string[] = [];
  const { model } = artifact;

  // Determine metric to analyze
  let targetMetric = metricKey;
  if (!targetMetric) {
    // Default to primary output
    const primaryOutput = model.outputs[0];
    if (!primaryOutput) {
      return {
        metric_key: 'unknown',
        metric_label: 'Unknown',
        metric_base_value: 0,
        impacts: [],
        warnings: ['no_outputs_defined'],
      };
    }
    targetMetric = primaryOutput.key;
  }

  // Find metric label
  const metricOutput = model.outputs.find((o) => o.key === targetMetric);
  const metricLabel = metricOutput?.label || targetMetric;

  // Get base metric value - convert inputs to required format
  const baseInputs = (model.inputs || []).map(inp => ({
    key: inp.key,
    label: inp.label,
    value: typeof inp.value === 'number' ? inp.value : Number(inp.value) || 0,
    unit: inp.unit,
    notes: inp.notes,
    source: inp.source,
  }));
  
  const baseResult = evaluateModelWithInputs(artifact, baseInputs);
  const metricBaseValue = baseResult.metricValue;

  if (metricBaseValue === null || !Number.isFinite(metricBaseValue)) {
    return {
      metric_key: targetMetric,
      metric_label: metricLabel,
      metric_base_value: 0,
      impacts: [],
      warnings: [...baseResult.warnings, 'base_metric_unavailable'],
    };
  }

  warnings.push(...baseResult.warnings);

  // Filter to numeric inputs only
  const numericInputs = baseInputs.filter((inp) => {
    const val = typeof inp.value === 'number' ? inp.value : Number(inp.value);
    return val !== null && Number.isFinite(val) && Math.abs(val) > 0.001; // Skip zero/negligible inputs
  });

  if (numericInputs.length === 0) {
    return {
      metric_key: targetMetric,
      metric_label: metricLabel,
      metric_base_value: metricBaseValue,
      impacts: [],
      warnings: [...warnings, 'no_numeric_inputs'],
    };
  }

  // Compute sensitivity for each input
  const impacts: SensitivityImpact[] = [];

  for (const input of numericInputs) {
    try {
      const baseValue = typeof input.value === 'number' ? input.value : Number(input.value);
      if (!Number.isFinite(baseValue) || baseValue === 0) continue;

      const bounds = getInputBounds(input.key, input.unit);
      const delta = baseValue * pct;
      const downValue = Math.max(bounds.min ?? baseValue - delta, baseValue * 0.01); // Prevent going to zero or negative for positive inputs
      const upValue = bounds.max !== undefined ? Math.min(bounds.max, baseValue + delta) : baseValue + delta;

      // Modify inputs for down scenario
      const downInputs = numericInputs.map((inp) =>
        inp.key === input.key ? { ...inp, value: downValue } : inp
      );
      const downResult = evaluateModelWithInputs(artifact, downInputs);
      warnings.push(...downResult.warnings);

      // Modify inputs for up scenario
      const upInputs = numericInputs.map((inp) =>
        inp.key === input.key ? { ...inp, value: upValue } : inp
      );
      const upResult = evaluateModelWithInputs(artifact, upInputs);
      warnings.push(...upResult.warnings);

      const metricDown = downResult.metricValue;
      const metricUp = upResult.metricValue;

      if (metricDown === null || metricUp === null) {
        warnings.push(`sensitivity_failed:${input.key}`);
        continue;
      }

      const deltaDown = metricDown - metricBaseValue;
      const deltaUp = metricUp - metricBaseValue;
      const impactDownPct = metricBaseValue !== 0 ? (deltaDown / metricBaseValue) * 100 : 0;
      const impactUpPct = metricBaseValue !== 0 ? (deltaUp / metricBaseValue) * 100 : 0;
      const absMaxImpact = Math.max(Math.abs(deltaDown), Math.abs(deltaUp));

      impacts.push({
        input_key: input.key,
        input_label: input.label,
        base_value: baseValue,
        down_value: downValue,
        up_value: upValue,
        metric_down: metricDown,
        metric_base: metricBaseValue,
        metric_up: metricUp,
        delta_down: deltaDown,
        delta_up: deltaUp,
        impact_down_pct: impactDownPct,
        impact_up_pct: impactUpPct,
        abs_max_impact: absMaxImpact,
      });
    } catch (error: any) {
      warnings.push(`input_failed:${input.key}:${error?.message || 'Unknown error'}`);
    }
  }

  // Sort by absolute max impact (descending) and take top N
  impacts.sort((a, b) => b.abs_max_impact - a.abs_max_impact);
  const topImpacts = impacts.slice(0, topN);

  return {
    metric_key: targetMetric,
    metric_label: metricLabel,
    metric_base_value: metricBaseValue,
    impacts: topImpacts,
    warnings: Array.from(new Set(warnings)),
  };
}

/**
 * Perform 2-way sensitivity analysis (grid) for two selected inputs
 */
export function twoWaySensitivity(
  artifact: ModelAndVizArtifact,
  metricKey: string,
  xInputKey: string,
  yInputKey: string,
  steps: number = 5,
  pct: number = 0.2
): TwoWaySensitivityGrid {
  const warnings: string[] = [];
  const { model } = artifact;

  // Convert inputs to required format
  const baseInputs = (model.inputs || []).map(inp => ({
    key: inp.key,
    label: inp.label,
    value: typeof inp.value === 'number' ? inp.value : Number(inp.value) || 0,
    unit: inp.unit,
    notes: inp.notes,
    source: inp.source,
  }));
  
  const xInput = baseInputs.find((inp) => inp.key === xInputKey);
  const yInput = baseInputs.find((inp) => inp.key === yInputKey);

  if (!xInput || !yInput) {
    return {
      metric_key: metricKey,
      metric_label: model.outputs.find((o) => o.key === metricKey)?.label || metricKey,
      x_input_key: xInputKey,
      x_input_label: xInput?.label || xInputKey,
      y_input_key: yInputKey,
      y_input_label: yInput?.label || yInputKey,
      x_steps: [],
      y_steps: [],
      grid: [],
      warnings: ['inputs_not_found'],
    };
  }

  const xBase = typeof xInput.value === 'number' ? xInput.value : Number(xInput.value);
  const yBase = typeof yInput.value === 'number' ? yInput.value : Number(yInput.value);

  if (!Number.isFinite(xBase) || !Number.isFinite(yBase)) {
    return {
      metric_key: metricKey,
      metric_label: model.outputs.find((o) => o.key === metricKey)?.label || metricKey,
      x_input_key: xInputKey,
      x_input_label: xInput.label,
      y_input_key: yInputKey,
      y_input_label: yInput.label,
      x_steps: [],
      y_steps: [],
      grid: [],
      warnings: ['invalid_base_values'],
    };
  }

  const xBounds = getInputBounds(xInput.key, xInput.unit);
  const yBounds = getInputBounds(yInput.key, yInput.unit);

  // Generate step values
  const xRange = xBase * pct * 2; // Total range
  const yRange = yBase * pct * 2;

  const xSteps: number[] = [];
  const ySteps: number[] = [];

  for (let i = 0; i < steps; i++) {
    const xFactor = (i / (steps - 1)) * 2 - 1; // -1 to +1
    const xVal = xBase + xFactor * (xBase * pct);
    xSteps.push(xBounds.max !== undefined ? Math.min(xBounds.max, xVal) : xBounds.min !== undefined ? Math.max(xBounds.min, xVal) : xVal);

    const yFactor = (i / (steps - 1)) * 2 - 1; // -1 to +1
    const yVal = yBase + yFactor * (yBase * pct);
    ySteps.push(yBounds.max !== undefined ? Math.min(yBounds.max, yVal) : yBounds.min !== undefined ? Math.max(yBounds.min, yVal) : yVal);
  }

  // Build grid
  const grid: Array<Array<number | null>> = [];

  for (let yIdx = 0; yIdx < steps; yIdx++) {
    const row: Array<number | null> = [];
    for (let xIdx = 0; xIdx < steps; xIdx++) {
      try {
        const modifiedInputs = baseInputs.map((inp) => {
          if (inp.key === xInputKey) {
            return { ...inp, value: xSteps[xIdx] };
          }
          if (inp.key === yInputKey) {
            return { ...inp, value: ySteps[yIdx] };
          }
          return inp;
        });

        const result = evaluateModelWithInputs(artifact, modifiedInputs);
        warnings.push(...result.warnings);
        row.push(result.metricValue);
      } catch (error: any) {
        warnings.push(`grid_cell_failed:${xIdx},${yIdx}:${error?.message || 'Unknown error'}`);
        row.push(null);
      }
    }
    grid.push(row);
  }

  return {
    metric_key: metricKey,
    metric_label: model.outputs.find((o) => o.key === metricKey)?.label || metricKey,
    x_input_key: xInputKey,
    x_input_label: xInput.label,
    y_input_key: yInputKey,
    y_input_label: yInput.label,
    x_steps: xSteps,
    y_steps: ySteps,
    grid,
    warnings: Array.from(new Set(warnings)),
  };
}

