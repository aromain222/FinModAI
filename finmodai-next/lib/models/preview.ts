/**
 * Preview Standardization
 * 
 * Standardizes preview generation for LBO, Comps, and Merger models.
 * Ensures consistent assumptions panels and charts across all models.
 */

import type { PreviewResult } from './runModelPipeline';

/**
 * Category for grouping assumptions
 */
export type AssumptionCategory = 'Operating' | 'Capital Structure' | 'Valuation';

/**
 * Assumption item for display
 */
export interface AssumptionItem {
  key: string;
  label: string;
  value: string | number | boolean;
  unit?: string;
  category?: AssumptionCategory;
  isDerived?: boolean;
}

/**
 * Chart specification
 */
export interface ChartSpec {
  type: 'line' | 'bar' | 'area' | 'scatter';
  title: string;
  data: Record<string, any>[];
  xKey: string;
  yKey?: string;
  yKeys?: string[];
}

/**
 * Build assumptions panel from model inputs/outputs
 */
export function buildAssumptionsPanel(params: {
  inputs: Record<string, any>;
  outputs?: Record<string, any>;
  modelType: 'lbo' | 'comps' | 'merger';
}): AssumptionItem[] {
  const { inputs, outputs, modelType } = params;
  const assumptions: AssumptionItem[] = [];
  
  // Operating assumptions
  if (inputs.revenueGrowth !== undefined) {
    assumptions.push({
      key: 'revenueGrowth',
      label: 'Revenue Growth',
      value: Array.isArray(inputs.revenueGrowth) 
        ? inputs.revenueGrowth[0] 
        : inputs.revenueGrowth,
      unit: '%',
      category: 'Operating',
    });
  }
  
  if (inputs.ebitdaMargin !== undefined) {
    assumptions.push({
      key: 'ebitdaMargin',
      label: 'EBITDA Margin',
      value: Array.isArray(inputs.ebitdaMargin)
        ? inputs.ebitdaMargin[0]
        : inputs.ebitdaMargin,
      unit: '%',
      category: 'Operating',
    });
  }
  
  if (inputs.taxRate !== undefined) {
    assumptions.push({
      key: 'taxRate',
      label: 'Tax Rate',
      value: inputs.taxRate,
      unit: '%',
      category: 'Operating',
    });
  }
  
  // Capital Structure assumptions (LBO/Merger)
  if (modelType === 'lbo' || modelType === 'merger') {
    if (inputs.entryMultiple !== undefined) {
      assumptions.push({
        key: 'entryMultiple',
        label: 'Entry Multiple',
        value: inputs.entryMultiple,
        unit: 'x',
        category: 'Capital Structure',
      });
    }
    
    if (inputs.exitMultiple !== undefined) {
      assumptions.push({
        key: 'exitMultiple',
        label: 'Exit Multiple',
        value: inputs.exitMultiple,
        unit: 'x',
        category: 'Capital Structure',
      });
    }
    
    if (inputs.targetLeverage !== undefined) {
      assumptions.push({
        key: 'targetLeverage',
        label: 'Target Leverage',
        value: inputs.targetLeverage,
        unit: 'x',
        category: 'Capital Structure',
      });
    }
  }
  
  // Valuation assumptions
  if (inputs.wacc !== undefined) {
    assumptions.push({
      key: 'wacc',
      label: 'WACC',
      value: inputs.wacc,
      unit: '%',
      category: 'Valuation',
    });
  }
  
  // Derived values from outputs
  if (outputs) {
    if (outputs.irr !== undefined) {
      assumptions.push({
        key: 'irr',
        label: 'IRR',
        value: outputs.irr,
        unit: '%',
        category: 'Valuation',
        isDerived: true,
      });
    }
    
    if (outputs.moic !== undefined) {
      assumptions.push({
        key: 'moic',
        label: 'MOIC',
        value: outputs.moic,
        unit: 'x',
        category: 'Valuation',
        isDerived: true,
      });
    }
  }
  
  return assumptions;
}

/**
 * Build EV bridge chart (for LBO & Merger)
 */
export function buildEVBridgeChart(params: {
  entryEV: number;
  exitEV: number;
  years?: number[];
}): ChartSpec | null {
  const { entryEV, exitEV, years = [0, 1, 2, 3, 4, 5] } = params;
  
  if (!Number.isFinite(entryEV) || !Number.isFinite(exitEV)) {
    return null;
  }
  
  // Simple linear interpolation for EV bridge
  const data = years.map((year, index) => {
    const progress = index / (years.length - 1);
    const ev = entryEV + (exitEV - entryEV) * progress;
    return {
      year,
      ev,
    };
  });
  
  return {
    type: 'line',
    title: 'Enterprise Value Bridge',
    data,
    xKey: 'year',
    yKey: 'ev',
  };
}

/**
 * Build multiples distribution chart (for Comps)
 */
export function buildMultiplesDistributionChart(params: {
  multiples: number[];
  multipleType: 'EV/Revenue' | 'EV/EBITDA' | 'P/E';
}): ChartSpec | null {
  const { multiples, multipleType } = params;
  
  if (!Array.isArray(multiples) || multiples.length === 0) {
    return null;
  }
  
  // Calculate percentiles
  const sorted = [...multiples].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const median = sorted[Math.floor(sorted.length / 2)];
  const p25 = sorted[Math.floor(sorted.length * 0.25)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  
  const data = [
    { name: 'Min', value: min },
    { name: 'P25', value: p25 },
    { name: 'Median', value: median },
    { name: 'P75', value: p75 },
    { name: 'Max', value: max },
  ];
  
  return {
    type: 'bar',
    title: `${multipleType} Distribution`,
    data,
    xKey: 'name',
    yKey: 'value',
  };
}

/**
 * Build debt paydown chart (for LBO)
 */
export function buildDebtPaydownChart(params: {
  debtSchedule: Array<{ year: number; netDebt: number; leverageRatio: number }>;
}): ChartSpec | null {
  const { debtSchedule } = params;
  
  if (!Array.isArray(debtSchedule) || debtSchedule.length === 0) {
    return null;
  }
  
  return {
    type: 'line',
    title: 'Debt Paydown Over Time',
    data: debtSchedule,
    xKey: 'year',
    yKey: 'netDebt',
  };
}

/**
 * Build revenue/EBITDA trend chart (for Merger)
 */
export function buildRevenueEBITDATrendChart(params: {
  revenue?: Array<{ year: number; revenue: number }>;
  ebitda?: Array<{ year: number; ebitda: number }>;
}): ChartSpec | null {
  const { revenue, ebitda } = params;
  
  if (!revenue && !ebitda) {
    return null;
  }
  
  // Combine revenue and EBITDA into single chart
  const years = revenue ? revenue.map(r => r.year) : ebitda?.map(e => e.year) || [];
  const data = years.map(year => {
    const r = revenue?.find(item => item.year === year);
    const e = ebitda?.find(item => item.year === year);
    return {
      year,
      revenue: r?.revenue,
      ebitda: e?.ebitda,
    };
  });
  
  return {
    type: 'line',
    title: 'Revenue & EBITDA Trend',
    data,
    xKey: 'year',
    yKeys: ['revenue', 'ebitda'],
  };
}

/**
 * Build complete preview with assumptions and charts
 */
export function buildCompletePreview(params: {
  inputs: Record<string, any>;
  outputs?: Record<string, any>;
  modelType: 'lbo' | 'comps' | 'merger';
}): PreviewResult {
  const { inputs, outputs, modelType } = params;
  
  const assumptions = buildAssumptionsPanel({ inputs, outputs, modelType });
  const charts: ChartSpec[] = [];
  
  // Model-specific charts
  if (modelType === 'lbo') {
    // EV bridge
    if (outputs?.entryEV && outputs?.exitEV) {
      const evChart = buildEVBridgeChart({
        entryEV: outputs.entryEV,
        exitEV: outputs.exitEV,
      });
      if (evChart) charts.push(evChart);
    }
    
    // Debt paydown
    if (outputs?.debtPaydown) {
      const debtChart = buildDebtPaydownChart({
        debtSchedule: outputs.debtPaydown,
      });
      if (debtChart) charts.push(debtChart);
    }
  }
  
  if (modelType === 'comps') {
    // Multiples distribution
    if (outputs?.multiplesDistribution?.evToRevenue) {
      const evRevChart = buildMultiplesDistributionChart({
        multiples: [1, 2, 3, 4, 5], // Placeholder - should come from actual peer data
        multipleType: 'EV/Revenue',
      });
      if (evRevChart) charts.push(evRevChart);
    }
  }
  
  if (modelType === 'merger') {
    // EV bridge
    if (outputs?.entryEV && outputs?.exitEV) {
      const evChart = buildEVBridgeChart({
        entryEV: outputs.entryEV,
        exitEV: outputs.exitEV,
      });
      if (evChart) charts.push(evChart);
    }
    
    // Revenue/EBITDA trend
    if (outputs?.revenueTrend || outputs?.ebitdaTrend) {
      const trendChart = buildRevenueEBITDATrendChart({
        revenue: outputs?.revenueTrend,
        ebitda: outputs?.ebitdaTrend,
      });
      if (trendChart) charts.push(trendChart);
    }
  }
  
  return {
    assumptions,
    charts,
    summary: `Generated ${modelType.toUpperCase()} model preview`,
  };
}
