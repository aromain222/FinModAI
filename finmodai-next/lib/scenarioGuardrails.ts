/**
 * Scenario Guardrails - Validate and bound scenario inputs
 */

import type { TickerSnapshot } from './tickerDataService';

export interface GuardrailBounds {
  revenueGrowth: { min: number; max: number; default: number };
  fcfMargin: { min: number; max: number; default: number };
  wacc: { min: number; max: number; default: number };
  terminalMultiple: { min: number; max: number; default: number };
  terminalGrowth: { min: number; max: number; default: number };
}

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  adjustedInputs?: Record<string, number>;
}

/**
 * Calculate guardrail bounds based on historical data
 */
export function calculateGuardrails(snapshot: TickerSnapshot): GuardrailBounds {
  const { history, revenueGrowthYoY, marginTrends, evRevenue } = snapshot;

  // Revenue growth bounds
  const avgGrowth = revenueGrowthYoY.length > 0
    ? revenueGrowthYoY.reduce((sum, g) => sum + g, 0) / revenueGrowthYoY.length
    : 0.08; // Default 8%
  
  const minGrowth = Math.min(...revenueGrowthYoY, avgGrowth);
  const maxGrowth = Math.max(...revenueGrowthYoY, avgGrowth);

  const revenueGrowth = {
    min: Math.max(-0.20, minGrowth - 0.10), // Historical min - 10%, floor at -20%
    max: Math.min(0.50, maxGrowth + 0.20), // Historical max + 20%, cap at 50%
    default: Math.max(-0.05, Math.min(0.30, avgGrowth)), // Clamp default between -5% and 30%
  };

  // FCF margin bounds
  const fcfMargins = marginTrends.fcf.filter(m => m !== 0);
  const avgFcfMargin = fcfMargins.length > 0
    ? fcfMargins.reduce((sum, m) => sum + m, 0) / fcfMargins.length
    : 0.15; // Default 15%

  const fcfMargin = {
    min: Math.max(-0.10, avgFcfMargin - 0.10), // Avg - 10%, floor at -10%
    max: Math.min(0.50, avgFcfMargin + 0.15), // Avg + 15%, cap at 50%
    default: Math.max(0.05, Math.min(0.35, avgFcfMargin)), // Clamp between 5% and 35%
  };

  // WACC bounds (standard ranges)
  const wacc = {
    min: 0.05, // 5%
    max: 0.20, // 20%
    default: 0.10, // 10% standard
  };

  // Terminal multiple bounds
  const terminalMultiple = {
    min: 5,
    max: 20,
    default: evRevenue && evRevenue > 0 && evRevenue < 30 ? evRevenue : 10,
  };

  // Terminal growth bounds
  const terminalGrowth = {
    min: -0.02, // -2%
    max: 0.06, // 6%
    default: 0.025, // 2.5% (long-term GDP growth)
  };

  return {
    revenueGrowth,
    fcfMargin,
    wacc,
    terminalMultiple,
    terminalGrowth,
  };
}

/**
 * Validate scenario inputs against guardrails
 */
export function validateScenarioInputs(
  inputs: {
    revenueGrowth?: number;
    fcfMargin?: number;
    wacc?: number;
    terminalMultiple?: number;
    terminalGrowth?: number;
  },
  bounds: GuardrailBounds
): ValidationResult {
  const warnings: string[] = [];
  const adjustedInputs: Record<string, number> = {};
  let valid = true;

  // Validate revenue growth
  if (inputs.revenueGrowth !== undefined) {
    if (inputs.revenueGrowth < bounds.revenueGrowth.min) {
      warnings.push(
        `Revenue growth ${(inputs.revenueGrowth * 100).toFixed(1)}% is below historical range (min: ${(bounds.revenueGrowth.min * 100).toFixed(1)}%). Consider if this is realistic.`
      );
      adjustedInputs.revenueGrowth = bounds.revenueGrowth.min;
      valid = false;
    } else if (inputs.revenueGrowth > bounds.revenueGrowth.max) {
      warnings.push(
        `Revenue growth ${(inputs.revenueGrowth * 100).toFixed(1)}% is above historical range (max: ${(bounds.revenueGrowth.max * 100).toFixed(1)}%). This assumes significant acceleration.`
      );
      adjustedInputs.revenueGrowth = bounds.revenueGrowth.max;
      valid = false;
    }
  }

  // Validate FCF margin
  if (inputs.fcfMargin !== undefined) {
    if (inputs.fcfMargin < bounds.fcfMargin.min) {
      warnings.push(
        `FCF margin ${(inputs.fcfMargin * 100).toFixed(1)}% is below historical range (min: ${(bounds.fcfMargin.min * 100).toFixed(1)}%). This implies margin compression.`
      );
      adjustedInputs.fcfMargin = bounds.fcfMargin.min;
      valid = false;
    } else if (inputs.fcfMargin > bounds.fcfMargin.max) {
      warnings.push(
        `FCF margin ${(inputs.fcfMargin * 100).toFixed(1)}% is above historical range (max: ${(bounds.fcfMargin.max * 100).toFixed(1)}%). This assumes significant margin expansion.`
      );
      adjustedInputs.fcfMargin = bounds.fcfMargin.max;
      valid = false;
    }
  }

  // Validate WACC
  if (inputs.wacc !== undefined) {
    if (inputs.wacc < bounds.wacc.min) {
      warnings.push(
        `WACC ${(inputs.wacc * 100).toFixed(1)}% is unusually low (min: ${(bounds.wacc.min * 100).toFixed(1)}%).`
      );
      adjustedInputs.wacc = bounds.wacc.min;
      valid = false;
    } else if (inputs.wacc > bounds.wacc.max) {
      warnings.push(
        `WACC ${(inputs.wacc * 100).toFixed(1)}% is unusually high (max: ${(bounds.wacc.max * 100).toFixed(1)}%).`
      );
      adjustedInputs.wacc = bounds.wacc.max;
      valid = false;
    }
  }

  // Validate terminal multiple
  if (inputs.terminalMultiple !== undefined) {
    if (inputs.terminalMultiple < bounds.terminalMultiple.min) {
      warnings.push(
        `Terminal multiple ${inputs.terminalMultiple.toFixed(1)}x is below reasonable range (min: ${bounds.terminalMultiple.min}x).`
      );
      adjustedInputs.terminalMultiple = bounds.terminalMultiple.min;
      valid = false;
    } else if (inputs.terminalMultiple > bounds.terminalMultiple.max) {
      warnings.push(
        `Terminal multiple ${inputs.terminalMultiple.toFixed(1)}x is above reasonable range (max: ${bounds.terminalMultiple.max}x).`
      );
      adjustedInputs.terminalMultiple = bounds.terminalMultiple.max;
      valid = false;
    }
  }

  // Validate terminal growth
  if (inputs.terminalGrowth !== undefined) {
    if (inputs.terminalGrowth < bounds.terminalGrowth.min) {
      warnings.push(
        `Terminal growth ${(inputs.terminalGrowth * 100).toFixed(1)}% is below reasonable range (min: ${(bounds.terminalGrowth.min * 100).toFixed(1)}%).`
      );
      adjustedInputs.terminalGrowth = bounds.terminalGrowth.min;
      valid = false;
    } else if (inputs.terminalGrowth > bounds.terminalGrowth.max) {
      warnings.push(
        `Terminal growth ${(inputs.terminalGrowth * 100).toFixed(1)}% is above reasonable range (max: ${(bounds.terminalGrowth.max * 100).toFixed(1)}%). Long-term growth above GDP is unsustainable.`
      );
      adjustedInputs.terminalGrowth = bounds.terminalGrowth.max;
      valid = false;
    }
  }

  return {
    valid,
    warnings,
    adjustedInputs: Object.keys(adjustedInputs).length > 0 ? adjustedInputs : undefined,
  };
}

/**
 * Clamp input value to guardrail bounds
 */
export function clampToGuardrails(
  value: number,
  bounds: { min: number; max: number }
): number {
  return Math.max(bounds.min, Math.min(bounds.max, value));
}

/**
 * Generate preset scenarios (Bull/Bear) based on bounds
 */
export function generatePresetScenarios(bounds: GuardrailBounds): {
  base: Record<string, number>;
  bull: Record<string, number>;
  bear: Record<string, number>;
} {
  return {
    base: {
      revenueGrowth: bounds.revenueGrowth.default,
      fcfMargin: bounds.fcfMargin.default,
      wacc: bounds.wacc.default,
      terminalMultiple: bounds.terminalMultiple.default,
      terminalGrowth: bounds.terminalGrowth.default,
    },
    bull: {
      revenueGrowth: bounds.revenueGrowth.max * 0.8, // 80% of max
      fcfMargin: bounds.fcfMargin.max * 0.9, // 90% of max
      wacc: bounds.wacc.min + (bounds.wacc.default - bounds.wacc.min) * 0.5, // Lower WACC
      terminalMultiple: bounds.terminalMultiple.max * 0.8,
      terminalGrowth: bounds.terminalGrowth.max * 0.8,
    },
    bear: {
      revenueGrowth: bounds.revenueGrowth.min + (bounds.revenueGrowth.default - bounds.revenueGrowth.min) * 0.3,
      fcfMargin: bounds.fcfMargin.min + (bounds.fcfMargin.default - bounds.fcfMargin.min) * 0.5,
      wacc: bounds.wacc.max * 0.8, // Higher WACC
      terminalMultiple: bounds.terminalMultiple.min + (bounds.terminalMultiple.default - bounds.terminalMultiple.min) * 0.5,
      terminalGrowth: bounds.terminalGrowth.min + (bounds.terminalGrowth.default - bounds.terminalGrowth.min) * 0.5,
    },
  };
}
