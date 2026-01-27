/**
 * Preview Standardization
 * 
 * Standardizes preview generation for LBO, Comps, and Merger models.
 * Each preview includes: KPIs + charts + assumptions + checks.
 * 
 * Usage:
 *   const preview = buildLboPreview(engineOutput, assumptions);
 *   const preview = buildCompsPreview(engineOutput, assumptions);
 *   const preview = buildMergerPreview(engineOutput, assumptions);
 */

import type { PreviewResult } from '@/lib/models/runModelPipeline';

/**
 * KPI display item
 */
export interface KPI {
  label: string;
  value: string | number;
  format: 'currency' | 'percent' | 'multiple' | 'number' | 'text';
  unit?: string;
}

/**
 * Assumption display item
 */
export interface AssumptionItem {
  key: string;
  label: string;
  value: string | number | boolean;
  unit?: string;
  category?: 'Operating' | 'Capital Structure' | 'Valuation';
  isDerived?: boolean;
}

/**
 * Chart specification for Recharts
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
 * Model check/validation result
 */
export interface ModelCheck {
  name: string;
  passed: boolean;
  message?: string;
  severity?: 'error' | 'warning' | 'info';
}

/**
 * Extended preview with KPIs and checks
 */
export interface ExtendedPreview extends PreviewResult {
  kpis: KPI[];
  checks: ModelCheck[];
}

/**
 * Build LBO preview
 */
export function buildLboPreview(
  engineOutput: any,
  assumptions: Record<string, any>
): ExtendedPreview {
  const kpis: KPI[] = [];
  const assumptionsList: AssumptionItem[] = [];
  const charts: ChartSpec[] = [];
  const checks: ModelCheck[] = [];
  
  // KPIs
  if (engineOutput?.exit?.irr !== undefined) {
    kpis.push({
      label: 'IRR',
      value: engineOutput.exit.irr,
      format: 'percent',
      unit: '%',
    });
  }
  
  if (engineOutput?.exit?.moic !== undefined) {
    kpis.push({
      label: 'MOIC',
      value: engineOutput.exit.moic,
      format: 'multiple',
      unit: 'x',
    });
  }
  
  if (engineOutput?.entry?.entryEV !== undefined) {
    kpis.push({
      label: 'Entry EV',
      value: engineOutput.entry.entryEV,
      format: 'currency',
      unit: 'M',
    });
  }
  
  if (engineOutput?.exit?.exitEV !== undefined) {
    kpis.push({
      label: 'Exit EV',
      value: engineOutput.exit.exitEV,
      format: 'currency',
      unit: 'M',
    });
  }
  
  // Assumptions
  if (assumptions.entryMultiple !== undefined) {
    assumptionsList.push({
      key: 'entryMultiple',
      label: 'Entry Multiple',
      value: assumptions.entryMultiple,
      unit: 'x',
      category: 'Capital Structure',
    });
  }
  
  if (assumptions.exitMultiple !== undefined) {
    assumptionsList.push({
      key: 'exitMultiple',
      label: 'Exit Multiple',
      value: assumptions.exitMultiple,
      unit: 'x',
      category: 'Capital Structure',
    });
  }
  
  if (assumptions.revenueGrowth !== undefined) {
    assumptionsList.push({
      key: 'revenueGrowth',
      label: 'Revenue Growth',
      value: Array.isArray(assumptions.revenueGrowth) 
        ? assumptions.revenueGrowth[0] 
        : assumptions.revenueGrowth,
      unit: '%',
      category: 'Operating',
    });
  }
  
  if (assumptions.ebitdaMargin !== undefined) {
    assumptionsList.push({
      key: 'ebitdaMargin',
      label: 'EBITDA Margin',
      value: Array.isArray(assumptions.ebitdaMargin)
        ? assumptions.ebitdaMargin[0]
        : assumptions.ebitdaMargin,
      unit: '%',
      category: 'Operating',
    });
  }
  
  // Derived assumptions
  if (engineOutput?.exit?.irr !== undefined) {
    assumptionsList.push({
      key: 'irr',
      label: 'IRR',
      value: engineOutput.exit.irr,
      unit: '%',
      category: 'Valuation',
      isDerived: true,
    });
  }
  
  if (engineOutput?.exit?.moic !== undefined) {
    assumptionsList.push({
      key: 'moic',
      label: 'MOIC',
      value: engineOutput.exit.moic,
      unit: 'x',
      category: 'Valuation',
      isDerived: true,
    });
  }
  
  // Charts: EV Bridge
  if (engineOutput?.entry?.entryEV && engineOutput?.exit?.exitEV) {
    const entryEV = engineOutput.entry.entryEV;
    const exitEV = engineOutput.exit.exitEV;
    const years = engineOutput.debtSchedule?.map((d: any, i: number) => i) || [0, 1, 2, 3, 4, 5];
    
    const evData = years.map((year: number) => {
      const progress = years.length > 1 ? year / (years.length - 1) : 0;
      const ev = entryEV + (exitEV - entryEV) * progress;
      return { year, ev };
    });
    
    charts.push({
      type: 'line',
      title: 'Enterprise Value Bridge',
      data: evData,
      xKey: 'year',
      yKey: 'ev',
    });
  }
  
  // Charts: Debt Paydown
  if (engineOutput?.debtSchedule && Array.isArray(engineOutput.debtSchedule)) {
    const debtData = engineOutput.debtSchedule.map((item: any, index: number) => ({
      year: item.year ?? index,
      netDebt: item.netDebt ?? item.endingDebt ?? 0,
      leverageRatio: item.leverageRatio ?? item.leverageMultiple ?? 0,
    }));
    
    if (debtData.length > 0) {
      charts.push({
        type: 'line',
        title: 'Debt Paydown Over Time',
        data: debtData,
        xKey: 'year',
        yKey: 'netDebt',
      });
    }
  }
  
  // Checks
  if (engineOutput?.diagnostics) {
    if (engineOutput.diagnostics.suspiciousEconomics) {
      checks.push({
        name: 'Economics Validation',
        passed: false,
        message: 'IRR or MOIC exceeds typical ranges',
        severity: 'warning',
      });
    }
    
    if (engineOutput.diagnostics.noDeleveraging) {
      checks.push({
        name: 'Debt Paydown',
        passed: false,
        message: 'Debt does not decrease over holding period',
        severity: 'warning',
      });
    }
  }
  
  // Default check: All checks pass if no diagnostics issues
  if (checks.length === 0) {
    checks.push({
      name: 'Model Validation',
      passed: true,
      message: 'All model checks passed',
      severity: 'info',
    });
  }
  
  return {
    assumptions: assumptionsList,
    charts,
    kpis,
    checks,
    summary: `LBO model: ${engineOutput?.ticker || 'Target'} - ${kpis.find(k => k.label === 'IRR')?.value || 'N/A'}% IRR, ${kpis.find(k => k.label === 'MOIC')?.value || 'N/A'}x MOIC`,
    keyMetrics: {
      irr: engineOutput?.exit?.irr ?? 0,
      moic: engineOutput?.exit?.moic ?? 0,
      entryEV: engineOutput?.entry?.entryEV ?? 0,
      exitEV: engineOutput?.exit?.exitEV ?? 0,
    },
  };
}

/**
 * Build Comps preview
 */
export function buildCompsPreview(
  engineOutput: any,
  assumptions: Record<string, any>
): ExtendedPreview {
  const kpis: KPI[] = [];
  const assumptionsList: AssumptionItem[] = [];
  const charts: ChartSpec[] = [];
  const checks: ModelCheck[] = [];
  
  // KPIs
  if (engineOutput?.impliedValuation?.evToRevenue !== undefined) {
    kpis.push({
      label: 'Implied EV/Revenue',
      value: engineOutput.impliedValuation.evToRevenue,
      format: 'multiple',
      unit: 'x',
    });
  }
  
  if (engineOutput?.impliedValuation?.evToEBITDA !== undefined) {
    kpis.push({
      label: 'Implied EV/EBITDA',
      value: engineOutput.impliedValuation.evToEBITDA,
      format: 'multiple',
      unit: 'x',
    });
  }
  
  if (engineOutput?.impliedValuation?.pe !== undefined) {
    kpis.push({
      label: 'Implied P/E',
      value: engineOutput.impliedValuation.pe,
      format: 'multiple',
      unit: 'x',
    });
  }
  
  if (engineOutput?.target?.ticker) {
    kpis.push({
      label: 'Target',
      value: engineOutput.target.ticker,
      format: 'text',
    });
  }
  
  // Assumptions
  if (engineOutput?.target) {
    assumptionsList.push({
      key: 'targetTicker',
      label: 'Target Company',
      value: engineOutput.target.ticker || 'N/A',
      category: 'Valuation',
    });
  }
  
  if (engineOutput?.comps && Array.isArray(engineOutput.comps)) {
    assumptionsList.push({
      key: 'peerCount',
      label: 'Peer Companies',
      value: engineOutput.comps.length,
      unit: 'companies',
      category: 'Valuation',
    });
  }
  
  // Charts: Multiples Distribution
  if (engineOutput?.comps && Array.isArray(engineOutput.comps)) {
    const evToRevenueMultiples = engineOutput.comps
      .map((c: any) => c.evToRevenue)
      .filter((m: any) => Number.isFinite(m) && m > 0);
    
    if (evToRevenueMultiples.length > 0) {
      const sorted = [...evToRevenueMultiples].sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const median = sorted[Math.floor(sorted.length / 2)];
      const p25 = sorted[Math.floor(sorted.length * 0.25)];
      const p75 = sorted[Math.floor(sorted.length * 0.75)];
      
      charts.push({
        type: 'bar',
        title: 'EV/Revenue Distribution',
        data: [
          { name: 'Min', value: min },
          { name: 'P25', value: p25 },
          { name: 'Median', value: median },
          { name: 'P75', value: p75 },
          { name: 'Max', value: max },
        ],
        xKey: 'name',
        yKey: 'value',
      });
    }
    
    const evToEbitdaMultiples = engineOutput.comps
      .map((c: any) => c.evToEBITDA)
      .filter((m: any) => Number.isFinite(m) && m > 0);
    
    if (evToEbitdaMultiples.length > 0) {
      const sorted = [...evToEbitdaMultiples].sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const median = sorted[Math.floor(sorted.length / 2)];
      const p25 = sorted[Math.floor(sorted.length * 0.25)];
      const p75 = sorted[Math.floor(sorted.length * 0.75)];
      
      charts.push({
        type: 'bar',
        title: 'EV/EBITDA Distribution',
        data: [
          { name: 'Min', value: min },
          { name: 'P25', value: p25 },
          { name: 'Median', value: median },
          { name: 'P75', value: p75 },
          { name: 'Max', value: max },
        ],
        xKey: 'name',
        yKey: 'value',
      });
    }
  }
  
  // Checks
  if (engineOutput?.comps && Array.isArray(engineOutput.comps)) {
    if (engineOutput.comps.length < 3) {
      checks.push({
        name: 'Peer Count',
        passed: false,
        message: 'Fewer than 3 comparable companies',
        severity: 'warning',
      });
    } else {
      checks.push({
        name: 'Peer Count',
        passed: true,
        message: `Using ${engineOutput.comps.length} comparable companies`,
        severity: 'info',
      });
    }
  }
  
  return {
    assumptions: assumptionsList,
    charts,
    kpis,
    checks,
    summary: `Comps analysis: ${engineOutput?.target?.ticker || 'Target'} vs ${engineOutput?.comps?.length || 0} peers`,
    keyMetrics: {
      impliedEvToRevenue: engineOutput?.impliedValuation?.evToRevenue ?? 0,
      impliedEvToEbitda: engineOutput?.impliedValuation?.evToEBITDA ?? 0,
      peerCount: engineOutput?.comps?.length ?? 0,
    },
  };
}

/**
 * Build Merger preview
 */
export function buildMergerPreview(
  engineOutput: any,
  assumptions: Record<string, any>
): ExtendedPreview {
  const kpis: KPI[] = [];
  const assumptionsList: AssumptionItem[] = [];
  const charts: ChartSpec[] = [];
  const checks: ModelCheck[] = [];
  
  // KPIs
  if (engineOutput?.epsAnalysis?.year1?.accretion !== undefined) {
    kpis.push({
      label: 'EPS Accretion (Y1)',
      value: engineOutput.epsAnalysis.year1.accretion,
      format: 'percent',
      unit: '%',
    });
  }
  
  if (engineOutput?.dealConsideration?.totalValue !== undefined) {
    kpis.push({
      label: 'Deal Value',
      value: engineOutput.dealConsideration.totalValue,
      format: 'currency',
      unit: 'M',
    });
  }
  
  if (engineOutput?.sourcesUses?.total !== undefined) {
    kpis.push({
      label: 'Total Sources/Uses',
      value: engineOutput.sourcesUses.total,
      format: 'currency',
      unit: 'M',
    });
  }
  
  // Assumptions
  if (assumptions.buyerTicker) {
    assumptionsList.push({
      key: 'buyerTicker',
      label: 'Buyer',
      value: assumptions.buyerTicker,
      category: 'Capital Structure',
    });
  }
  
  if (assumptions.targetTicker) {
    assumptionsList.push({
      key: 'targetTicker',
      label: 'Target',
      value: assumptions.targetTicker,
      category: 'Capital Structure',
    });
  }
  
  if (assumptions.dealStructure) {
    assumptionsList.push({
      key: 'dealStructure',
      label: 'Deal Structure',
      value: assumptions.dealStructure,
      category: 'Capital Structure',
    });
  }
  
  if (assumptions.offerPrice !== undefined) {
    assumptionsList.push({
      key: 'offerPrice',
      label: 'Offer Price',
      value: assumptions.offerPrice,
      format: 'currency',
      unit: '$',
      category: 'Capital Structure',
    });
  }
  
  // Charts: EV Bridge
  if (engineOutput?.evBridge && Array.isArray(engineOutput.evBridge)) {
    charts.push({
      type: 'line',
      title: 'Enterprise Value Bridge',
      data: engineOutput.evBridge.map((item: any) => ({
        year: item.year ?? 0,
        buyerEV: item.buyerEV ?? 0,
        targetEV: item.targetEV ?? 0,
        combinedEV: item.combinedEV ?? 0,
      })),
      xKey: 'year',
      yKeys: ['buyerEV', 'targetEV', 'combinedEV'],
    });
  }
  
  // Charts: Revenue/EBITDA Trend
  if (engineOutput?.combinedIS && Array.isArray(engineOutput.combinedIS)) {
    const revenueData = engineOutput.combinedIS.map((item: any, index: number) => ({
      year: item.year ?? index + 1,
      revenue: item.revenue?.total ?? 0,
      ebitda: item.ebitda?.total ?? 0,
    }));
    
    charts.push({
      type: 'line',
      title: 'Revenue & EBITDA Trend',
      data: revenueData,
      xKey: 'year',
      yKeys: ['revenue', 'ebitda'],
    });
  }
  
  // Checks
  if (engineOutput?.checks) {
    if (engineOutput.checks.sourcesEqualsUses === false) {
      checks.push({
        name: 'Sources & Uses Balance',
        passed: false,
        message: 'Sources and uses do not balance',
        severity: 'error',
      });
    } else {
      checks.push({
        name: 'Sources & Uses Balance',
        passed: true,
        message: 'Sources and uses balance correctly',
        severity: 'info',
      });
    }
    
    if (engineOutput.checks.balances === false) {
      checks.push({
        name: 'Model Balances',
        passed: false,
        message: 'Model does not balance',
        severity: 'error',
      });
    }
  }
  
  return {
    assumptions: assumptionsList,
    charts,
    kpis,
    checks,
    summary: `Merger model: ${assumptions.buyerTicker || 'Buyer'} + ${assumptions.targetTicker || 'Target'}`,
    keyMetrics: {
      dealValue: engineOutput?.dealConsideration?.totalValue ?? 0,
      epsAccretion: engineOutput?.epsAnalysis?.year1?.accretion ?? 0,
    },
  };
}
