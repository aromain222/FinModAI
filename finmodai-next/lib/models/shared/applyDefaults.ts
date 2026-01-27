/**
 * Apply Settings Defaults to Model Inputs
 * 
 * Rule: model input > user settings default > system default > fail
 * Never override explicit user inputs.
 */

import type { AppSettings, AppliedDefault } from '@/lib/settings/schema';
import { DEFAULT_SETTINGS } from '@/lib/settings/defaults';

/**
 * Apply defaults to DCF inputs
 */
export function applyDefaultsToDCF(
  inputs: any,
  settings: AppSettings
): { effectiveInputs: any; appliedDefaults: AppliedDefault[] } {
  const effectiveInputs = { ...inputs };
  const appliedDefaults: AppliedDefault[] = [];
  
  // Tax rate
  if (effectiveInputs.taxRate === undefined || effectiveInputs.taxRate === null) {
    const value = settings.defaults.valuation.taxRate ?? DEFAULT_SETTINGS.defaults.valuation.taxRate;
    if (value !== undefined) {
      effectiveInputs.taxRate = value;
      appliedDefaults.push({ path: 'taxRate', value, source: settings.defaults.valuation.taxRate !== undefined ? 'settings' : 'system' });
    }
  }
  
  // Terminal growth (check both terminalGrowth and terminalGrowthPct for compatibility)
  if ((effectiveInputs.terminalGrowth === undefined || effectiveInputs.terminalGrowth === null) &&
      (effectiveInputs.terminalGrowthPct === undefined || effectiveInputs.terminalGrowthPct === null)) {
    const value = settings.defaults.valuation.terminalGrowth ?? DEFAULT_SETTINGS.defaults.valuation.terminalGrowth;
    if (value !== undefined) {
      effectiveInputs.terminalGrowth = value;
      appliedDefaults.push({ path: 'terminalGrowth', value, source: settings.defaults.valuation.terminalGrowth !== undefined ? 'settings' : 'system' });
    }
  }
  
  // Forecast years
  if (effectiveInputs.forecastYears === undefined || effectiveInputs.forecastYears === null) {
    const value = settings.defaults.valuation.forecastYears ?? DEFAULT_SETTINGS.defaults.valuation.forecastYears;
    if (value !== undefined) {
      effectiveInputs.forecastYears = value;
      appliedDefaults.push({ path: 'forecastYears', value, source: settings.defaults.valuation.forecastYears !== undefined ? 'settings' : 'system' });
    }
  }
  
  // WACC (optional - check both wacc and waccPct)
  if ((effectiveInputs.wacc === undefined || effectiveInputs.wacc === null) &&
      (effectiveInputs.waccPct === undefined || effectiveInputs.waccPct === null)) {
    const value = settings.defaults.valuation.wacc ?? DEFAULT_SETTINGS.defaults.valuation.wacc;
    if (value !== undefined) {
      effectiveInputs.wacc = value;
      appliedDefaults.push({ path: 'wacc', value, source: settings.defaults.valuation.wacc !== undefined ? 'settings' : 'system' });
    }
  }
  
  return { effectiveInputs, appliedDefaults };
}

/**
 * Apply defaults to LBO inputs
 */
export function applyDefaultsToLBO(
  inputs: any,
  settings: AppSettings
): { effectiveInputs: any; appliedDefaults: AppliedDefault[] } {
  const effectiveInputs = { ...inputs };
  const appliedDefaults: AppliedDefault[] = [];
  
  // Hold period
  if (effectiveInputs.exitYear === undefined && effectiveInputs.holdPeriodYears === undefined) {
    const value = settings.defaults.lbo.holdPeriodYears ?? DEFAULT_SETTINGS.defaults.lbo.holdPeriodYears;
    if (value !== undefined) {
      effectiveInputs.holdPeriodYears = value;
      appliedDefaults.push({ path: 'holdPeriodYears', value, source: settings.defaults.lbo.holdPeriodYears !== undefined ? 'settings' : 'system' });
    }
  }
  
  // Interest rate
  if (effectiveInputs.termLoanBRate === undefined && effectiveInputs.revolverRate === undefined) {
    const value = settings.defaults.lbo.interestRate ?? DEFAULT_SETTINGS.defaults.lbo.interestRate;
    if (value !== undefined) {
      effectiveInputs.termLoanBRate = value;
      appliedDefaults.push({ path: 'termLoanBRate', value, source: settings.defaults.lbo.interestRate !== undefined ? 'settings' : 'system' });
    }
  }
  
  // Min cash
  if (effectiveInputs.minimumCash === undefined || effectiveInputs.minimumCash === null) {
    const value = settings.defaults.lbo.minCash ?? DEFAULT_SETTINGS.defaults.lbo.minCash;
    if (value !== undefined) {
      effectiveInputs.minimumCash = value;
      appliedDefaults.push({ path: 'minimumCash', value, source: settings.defaults.lbo.minCash !== undefined ? 'settings' : 'system' });
    }
  }
  
  // Fees
  if (effectiveInputs.transactionFeesPercent === undefined) {
    const value = settings.defaults.lbo.feesPct ?? DEFAULT_SETTINGS.defaults.lbo.feesPct;
    if (value !== undefined) {
      effectiveInputs.transactionFeesPercent = value;
      appliedDefaults.push({ path: 'transactionFeesPercent', value, source: settings.defaults.lbo.feesPct !== undefined ? 'settings' : 'system' });
    }
  }
  
  return { effectiveInputs, appliedDefaults };
}

/**
 * Apply defaults to Merger inputs
 */
export function applyDefaultsToMerger(
  inputs: any,
  settings: AppSettings
): { effectiveInputs: any; appliedDefaults: AppliedDefault[] } {
  const effectiveInputs = { ...inputs };
  const appliedDefaults: AppliedDefault[] = [];
  
  // Tax rate
  if (effectiveInputs.taxRate === undefined || effectiveInputs.taxRate === null) {
    const value = settings.defaults.merger.taxRate ?? DEFAULT_SETTINGS.defaults.merger.taxRate;
    if (value !== undefined) {
      effectiveInputs.taxRate = value;
      appliedDefaults.push({ path: 'taxRate', value, source: settings.defaults.merger.taxRate !== undefined ? 'settings' : 'system' });
    }
  }
  
  // New debt rate
  if (effectiveInputs.newDebtRate === undefined && effectiveInputs.debt?.interestRate === undefined) {
    const value = settings.defaults.merger.newDebtRate ?? DEFAULT_SETTINGS.defaults.merger.newDebtRate;
    if (value !== undefined) {
      effectiveInputs.newDebtRate = value;
      appliedDefaults.push({ path: 'newDebtRate', value, source: settings.defaults.merger.newDebtRate !== undefined ? 'settings' : 'system' });
    }
  }
  
  // Purchase accounting defaults
  if (effectiveInputs.purchaseAccounting?.enabled && !effectiveInputs.purchaseAccounting.intangiblesPct) {
    const value = settings.defaults.merger.intangiblesPct ?? DEFAULT_SETTINGS.defaults.merger.intangiblesPct;
    if (value !== undefined) {
      effectiveInputs.purchaseAccounting = {
        ...effectiveInputs.purchaseAccounting,
        intangiblesPct: value,
      };
      appliedDefaults.push({ path: 'purchaseAccounting.intangiblesPct', value, source: settings.defaults.merger.intangiblesPct !== undefined ? 'settings' : 'system' });
    }
  }
  
  if (effectiveInputs.purchaseAccounting?.enabled && !effectiveInputs.purchaseAccounting.intangiblesLifeYears) {
    const value = settings.defaults.merger.intangiblesLifeYears ?? DEFAULT_SETTINGS.defaults.merger.intangiblesLifeYears;
    if (value !== undefined) {
      effectiveInputs.purchaseAccounting = {
        ...effectiveInputs.purchaseAccounting,
        intangiblesLifeYears: value,
      };
      appliedDefaults.push({ path: 'purchaseAccounting.intangiblesLifeYears', value, source: settings.defaults.merger.intangiblesLifeYears !== undefined ? 'settings' : 'system' });
    }
  }
  
  return { effectiveInputs, appliedDefaults };
}

/**
 * Apply defaults to Operating inputs
 */
export function applyDefaultsToOperating(
  inputs: any,
  settings: AppSettings
): { effectiveInputs: any; appliedDefaults: AppliedDefault[] } {
  const effectiveInputs = { ...inputs };
  const appliedDefaults: AppliedDefault[] = [];
  
  // Forecast months
  if (effectiveInputs.months === undefined || effectiveInputs.months === null) {
    const value = settings.defaults.operating.forecastMonths ?? DEFAULT_SETTINGS.defaults.operating.forecastMonths;
    if (value !== undefined) {
      effectiveInputs.months = value;
      appliedDefaults.push({ path: 'months', value, source: settings.defaults.operating.forecastMonths !== undefined ? 'settings' : 'system' });
    }
  }
  
  // Revenue model default
  if (!effectiveInputs.revenueModel?.type) {
    const value = settings.defaults.operating.revenueModelDefault ?? DEFAULT_SETTINGS.defaults.operating.revenueModelDefault;
    if (value !== undefined) {
      effectiveInputs.revenueModel = {
        ...effectiveInputs.revenueModel,
        type: value,
      };
      appliedDefaults.push({ path: 'revenueModel.type', value, source: settings.defaults.operating.revenueModelDefault !== undefined ? 'settings' : 'system' });
    }
  }
  
  // Tax rate
  if (effectiveInputs.taxRate === undefined || effectiveInputs.taxRate === null) {
    const value = settings.defaults.valuation.taxRate ?? DEFAULT_SETTINGS.defaults.valuation.taxRate;
    if (value !== undefined) {
      effectiveInputs.taxRate = value;
      appliedDefaults.push({ path: 'taxRate', value, source: settings.defaults.valuation.taxRate !== undefined ? 'settings' : 'system' });
    }
  }
  
  // Currency
  if (!effectiveInputs.currency) {
    const value = settings.defaults.global.currency ?? DEFAULT_SETTINGS.defaults.global.currency;
    effectiveInputs.currency = value;
    appliedDefaults.push({ path: 'currency', value, source: settings.defaults.global.currency !== undefined ? 'settings' : 'system' });
  }
  
  return { effectiveInputs, appliedDefaults };
}

/**
 * Apply defaults to 3-Statement inputs
 */
export function applyDefaultsToThreeStatement(
  inputs: any,
  settings: AppSettings
): { effectiveInputs: any; appliedDefaults: AppliedDefault[] } {
  const effectiveInputs = { ...inputs };
  const appliedDefaults: AppliedDefault[] = [];
  
  // Tax rate
  if (effectiveInputs.taxRate === undefined || effectiveInputs.taxRate === null) {
    const value = settings.defaults.valuation.taxRate ?? DEFAULT_SETTINGS.defaults.valuation.taxRate;
    if (value !== undefined) {
      effectiveInputs.taxRate = value;
      appliedDefaults.push({ path: 'taxRate', value, source: settings.defaults.valuation.taxRate !== undefined ? 'settings' : 'system' });
    }
  }
  
  // Forecast years
  if (effectiveInputs.forecastYears === undefined || effectiveInputs.forecastYears === null) {
    const value = settings.defaults.valuation.forecastYears ?? DEFAULT_SETTINGS.defaults.valuation.forecastYears;
    if (value !== undefined) {
      effectiveInputs.forecastYears = value;
      appliedDefaults.push({ path: 'forecastYears', value, source: settings.defaults.valuation.forecastYears !== undefined ? 'settings' : 'system' });
    }
  }
  
  return { effectiveInputs, appliedDefaults };
}

/**
 * Main entry point: apply defaults based on model type
 */
export function applyDefaultsToModelInputs(
  modelType: 'dcf' | 'lbo' | 'merger' | 'operating' | 'three-statement' | 'comps',
  inputs: any,
  settings: AppSettings
): { effectiveInputs: any; appliedDefaults: AppliedDefault[] } {
  switch (modelType) {
    case 'dcf':
      return applyDefaultsToDCF(inputs, settings);
    case 'lbo':
      return applyDefaultsToLBO(inputs, settings);
    case 'merger':
      return applyDefaultsToMerger(inputs, settings);
    case 'operating':
      return applyDefaultsToOperating(inputs, settings);
    case 'three-statement':
      return applyDefaultsToThreeStatement(inputs, settings);
    case 'comps':
      // Comps model doesn't have defaults yet
      return { effectiveInputs: inputs, appliedDefaults: [] };
    default:
      return { effectiveInputs: inputs, appliedDefaults: [] };
  }
}
