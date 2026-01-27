/**
 * Extract model-driven assumptions from API response
 * Returns max 5 bullets, non-repetitive, derived from actual inputs
 */

import type { AppliedDefault } from '@/lib/settings/schema';

export interface ModelAssumptions {
  label: string;
  value: string | number;
  unit?: string;
}

export function extractModelAssumptions(
  modelType: string,
  data: any,
  appliedDefaults: AppliedDefault[] = []
): ModelAssumptions[] {
  const assumptions: ModelAssumptions[] = [];

  try {
    switch (modelType) {
      case 'dcf':
        const dcfSummary = data.dcfSummary || {};
        const dcfAssumptions = data.assumptions || {};
        
        if (dcfSummary.wacc !== undefined || dcfAssumptions.wacc !== undefined) {
          assumptions.push({
            label: 'WACC',
            value: ((dcfSummary.wacc || dcfAssumptions.wacc) * 100).toFixed(1),
            unit: '%',
          });
        }
        if (dcfSummary.terminalGrowth !== undefined || dcfAssumptions.terminalGrowth !== undefined) {
          assumptions.push({
            label: 'Terminal Growth',
            value: ((dcfSummary.terminalGrowth || dcfAssumptions.terminalGrowth) * 100).toFixed(1),
            unit: '%',
          });
        }
        if (dcfAssumptions.revenueGrowth?.[0] !== undefined) {
          assumptions.push({
            label: 'Revenue Growth (Y1)',
            value: (dcfAssumptions.revenueGrowth[0] * 100).toFixed(1),
            unit: '%',
          });
        }
        if (dcfAssumptions.ebitdaMargin?.[0] !== undefined) {
          assumptions.push({
            label: 'EBITDA Margin',
            value: (dcfAssumptions.ebitdaMargin[0] * 100).toFixed(1),
            unit: '%',
          });
        }
        break;

      case 'lbo':
        const lboSummary = data.lboSummary || {};
        const entry = lboSummary.entry || {};
        const exit = lboSummary.exit || {};
        
        if (entry.entryMultiple !== undefined) {
          assumptions.push({
            label: 'Entry Multiple',
            value: entry.entryMultiple.toFixed(1),
            unit: 'x',
          });
        }
        if (entry.leverageMultiple !== undefined) {
          assumptions.push({
            label: 'Leverage Multiple',
            value: entry.leverageMultiple.toFixed(1),
            unit: 'x',
          });
        }
        if (entry.holdPeriod !== undefined) {
          assumptions.push({
            label: 'Hold Period',
            value: entry.holdPeriod,
            unit: 'years',
          });
        }
        if (exit.exitMultiple !== undefined) {
          assumptions.push({
            label: 'Exit Multiple',
            value: exit.exitMultiple.toFixed(1),
            unit: 'x',
          });
        }
        break;

      case 'three-statement':
        const assumptions_3s = data.assumptions || {};
        if (assumptions_3s.revenueGrowth?.[0] !== undefined) {
          assumptions.push({
            label: 'Revenue Growth',
            value: (assumptions_3s.revenueGrowth[0] * 100).toFixed(1),
            unit: '%',
          });
        }
        if (assumptions_3s.ebitdaMargin?.[0] !== undefined) {
          assumptions.push({
            label: 'EBITDA Margin',
            value: (assumptions_3s.ebitdaMargin[0] * 100).toFixed(1),
            unit: '%',
          });
        }
        if (assumptions_3s.taxRate !== undefined) {
          assumptions.push({
            label: 'Tax Rate',
            value: (assumptions_3s.taxRate * 100).toFixed(1),
            unit: '%',
          });
        }
        break;

      case 'merger':
        const mergerData = data.mergerModel || data.merger || {};
        if (mergerData.premium !== undefined) {
          assumptions.push({
            label: 'Premium',
            value: mergerData.premium.toFixed(1),
            unit: '%',
          });
        }
        if (mergerData.mix) {
          assumptions.push({
            label: 'Mix',
            value: `${mergerData.mix.cash}% Cash, ${mergerData.mix.debt}% Debt, ${mergerData.mix.stock}% Stock`,
          });
        }
        if (mergerData.synergiesTimeline) {
          assumptions.push({
            label: 'Synergies Timeline',
            value: mergerData.synergiesTimeline,
          });
        }
        break;

      case 'operating':
        const operatingData = data.operatingModel || data.operating || {};
        if (operatingData.revenueModel?.type) {
          assumptions.push({
            label: 'Revenue Model',
            value: operatingData.revenueModel.type,
          });
        }
        if (operatingData.opexModel?.startingHeadcount !== undefined) {
          assumptions.push({
            label: 'Starting Headcount',
            value: operatingData.opexModel.startingHeadcount,
          });
        }
        break;
    }
  } catch (error) {
    console.error('[extractModelAssumptions] Error:', error);
  }

  // Limit to 5 bullets
  return assumptions.slice(0, 5);
}
