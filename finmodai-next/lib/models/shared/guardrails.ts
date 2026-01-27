/**
 * Guardrails Evaluation
 * 
 * Evaluates model outputs against settings guardrails.
 * Returns warnings and blocks based on configured actions.
 */

import type { AppSettings, GuardrailAction } from '@/lib/settings/schema';

export interface GuardrailResult {
  warnings: string[];
  blocks: string[];
}

/**
 * Evaluate guardrails for DCF model
 */
export function evaluateDCFGuardrails(
  outputs: any,
  settings: AppSettings
): GuardrailResult {
  const warnings: string[] = [];
  const blocks: string[] = [];
  const action = settings.guardrails.global.action;
  
  // WACC check
  if (settings.guardrails.valuation.maxWacc !== undefined && outputs.wacc !== undefined) {
    if (outputs.wacc > settings.guardrails.valuation.maxWacc) {
      const msg = `WACC (${(outputs.wacc * 100).toFixed(1)}%) exceeds maximum (${(settings.guardrails.valuation.maxWacc * 100).toFixed(1)}%)`;
      if (action === 'block') blocks.push(msg);
      else warnings.push(msg);
    }
  }
  
  // Terminal growth check
  if (settings.guardrails.valuation.maxTerminalGrowth !== undefined && outputs.terminalGrowth !== undefined) {
    if (outputs.terminalGrowth > settings.guardrails.valuation.maxTerminalGrowth) {
      const msg = `Terminal growth (${(outputs.terminalGrowth * 100).toFixed(1)}%) exceeds maximum (${(settings.guardrails.valuation.maxTerminalGrowth * 100).toFixed(1)}%)`;
      if (action === 'block') blocks.push(msg);
      else warnings.push(msg);
    }
  }
  
  return { warnings, blocks };
}

/**
 * Evaluate guardrails for LBO model
 */
export function evaluateLBOGuardrails(
  outputs: any,
  settings: AppSettings
): GuardrailResult {
  const warnings: string[] = [];
  const blocks: string[] = [];
  const action = settings.guardrails.global.action;
  
  // Sources & Uses must tie
  if (settings.guardrails.lbo.sourcesUsesMustTie?.enabled) {
    const tolerance = 1; // $1M tolerance
    const reconciliation = outputs.sourcesUses?.reconciliation ?? 0;
    if (Math.abs(reconciliation) > tolerance) {
      const msg = `Sources & Uses do not reconcile (difference: $${Math.abs(reconciliation).toFixed(2)}M)`;
      if (settings.guardrails.lbo.sourcesUsesMustTie.action === 'block') {
        blocks.push(msg);
      } else {
        warnings.push(msg);
      }
    }
  }
  
  // Max IRR
  if (settings.guardrails.lbo.maxIRR !== undefined && outputs.irr !== undefined) {
    if (outputs.irr > settings.guardrails.lbo.maxIRR) {
      const msg = `IRR (${(outputs.irr * 100).toFixed(1)}%) exceeds maximum (${(settings.guardrails.lbo.maxIRR * 100).toFixed(1)}%)`;
      if (action === 'block') blocks.push(msg);
      else warnings.push(msg);
    }
  }
  
  // Max leverage
  if (settings.guardrails.lbo.maxLeverage !== undefined && outputs.leverageMultiple !== undefined) {
    if (outputs.leverageMultiple > settings.guardrails.lbo.maxLeverage) {
      const msg = `Leverage (${outputs.leverageMultiple.toFixed(1)}x) exceeds maximum (${settings.guardrails.lbo.maxLeverage.toFixed(1)}x)`;
      if (action === 'block') blocks.push(msg);
      else warnings.push(msg);
    }
  }
  
  return { warnings, blocks };
}

/**
 * Evaluate guardrails for Merger model
 */
export function evaluateMergerGuardrails(
  outputs: any,
  settings: AppSettings
): GuardrailResult {
  const warnings: string[] = [];
  const blocks: string[] = [];
  const action = settings.guardrails.global.action;
  
  // Sources & Uses must tie
  if (settings.guardrails.merger.sourcesUsesMustTie?.enabled) {
    const tolerance = 1; // $1M tolerance
    const reconciliation = outputs.sourcesUses?.reconciliation ?? 0;
    if (Math.abs(reconciliation) > tolerance) {
      const msg = `Sources & Uses do not reconcile (difference: $${Math.abs(reconciliation).toFixed(2)}M)`;
      if (settings.guardrails.merger.sourcesUsesMustTie.action === 'block') {
        blocks.push(msg);
      } else {
        warnings.push(msg);
      }
    }
  }
  
  // EPS bridge must tie
  if (settings.guardrails.merger.epsBridgeMustTie?.enabled) {
    // Check if EPS bridge reconciles (would need to be in outputs)
    const epsBridgeReconciles = outputs.checks?.epsBridgeReconciles ?? true;
    if (!epsBridgeReconciles) {
      const msg = 'EPS bridge does not reconcile';
      if (settings.guardrails.merger.epsBridgeMustTie.action === 'block') {
        blocks.push(msg);
      } else {
        warnings.push(msg);
      }
    }
  }
  
  // Max dilution
  if (settings.guardrails.merger.maxDilutionPct !== undefined && outputs.dilutionPct !== undefined) {
    if (outputs.dilutionPct > settings.guardrails.merger.maxDilutionPct) {
      const msg = `Dilution (${(outputs.dilutionPct * 100).toFixed(1)}%) exceeds maximum (${(settings.guardrails.merger.maxDilutionPct * 100).toFixed(1)}%)`;
      if (action === 'block') blocks.push(msg);
      else warnings.push(msg);
    }
  }
  
  return { warnings, blocks };
}

/**
 * Evaluate guardrails for Operating model
 */
export function evaluateOperatingGuardrails(
  outputs: any,
  settings: AppSettings
): GuardrailResult {
  const warnings: string[] = [];
  const blocks: string[] = [];
  const action = settings.guardrails.global.action;
  
  // Runway check
  if (settings.guardrails.operating.runwayBelowMonths) {
    const runwayMonths = outputs.summary?.runwayMonthsRemaining;
    if (runwayMonths !== null && runwayMonths !== undefined && runwayMonths < settings.guardrails.operating.runwayBelowMonths.months) {
      const msg = `Cash runway (${runwayMonths} months) is below threshold (${settings.guardrails.operating.runwayBelowMonths.months} months)`;
      if (settings.guardrails.operating.runwayBelowMonths.action === 'block') {
        blocks.push(msg);
      } else {
        warnings.push(msg);
      }
    }
  }
  
  // Max revenue MoM growth
  if (settings.guardrails.operating.maxRevenueMoMGrowth !== undefined && outputs.monthly) {
    for (let i = 1; i < outputs.monthly.length; i++) {
      const prevRevenue = outputs.monthly[i - 1].revenue.total;
      const currRevenue = outputs.monthly[i].revenue.total;
      if (prevRevenue > 0) {
        const momGrowth = (currRevenue - prevRevenue) / prevRevenue;
        if (momGrowth > settings.guardrails.operating.maxRevenueMoMGrowth) {
          const msg = `Revenue MoM growth (${(momGrowth * 100).toFixed(1)}%) exceeds maximum (${(settings.guardrails.operating.maxRevenueMoMGrowth * 100).toFixed(1)}%) in month ${i + 1}`;
          if (action === 'block') blocks.push(msg);
          else warnings.push(msg);
        }
      }
    }
  }
  
  // Max headcount MoM growth
  if (settings.guardrails.operating.maxHeadcountMoMGrowth !== undefined && outputs.monthly) {
    for (let i = 1; i < outputs.monthly.length; i++) {
      const prevHeadcount = outputs.monthly[i - 1].headcount;
      const currHeadcount = outputs.monthly[i].headcount;
      if (prevHeadcount > 0) {
        const momGrowth = (currHeadcount - prevHeadcount) / prevHeadcount;
        if (momGrowth > settings.guardrails.operating.maxHeadcountMoMGrowth) {
          const msg = `Headcount MoM growth (${(momGrowth * 100).toFixed(1)}%) exceeds maximum (${(settings.guardrails.operating.maxHeadcountMoMGrowth * 100).toFixed(1)}%) in month ${i + 1}`;
          if (action === 'block') blocks.push(msg);
          else warnings.push(msg);
        }
      }
    }
  }
  
  return { warnings, blocks };
}

/**
 * Main entry point: evaluate guardrails based on model type
 */
export function evaluateGuardrails(
  modelType: 'dcf' | 'lbo' | 'merger' | 'operating' | 'three-statement' | 'comps',
  outputs: any,
  settings: AppSettings
): GuardrailResult {
  switch (modelType) {
    case 'dcf':
      return evaluateDCFGuardrails(outputs, settings);
    case 'lbo':
      return evaluateLBOGuardrails(outputs, settings);
    case 'merger':
      return evaluateMergerGuardrails(outputs, settings);
    case 'operating':
      return evaluateOperatingGuardrails(outputs, settings);
    case 'three-statement':
    case 'comps':
      // No guardrails for these models yet
      return { warnings: [], blocks: [] };
    default:
      return { warnings: [], blocks: [] };
  }
}
