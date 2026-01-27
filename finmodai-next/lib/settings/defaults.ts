/**
 * Default Settings
 * 
 * System defaults that are merged with user settings.
 */

import type { AppSettings } from './schema';

export const DEFAULT_SETTINGS: AppSettings = {
  profile: {
    displayName: undefined,
    orgName: undefined,
  },
  
  defaults: {
    global: {
      currency: 'USD',
      decimals: 2,
    },
    
    valuation: {
      taxRate: 0.21, // 21% default
      terminalGrowth: 0.025, // 2.5%
      forecastYears: 5,
      wacc: undefined,
    },
    
    lbo: {
      holdPeriodYears: 5,
      entryMultiple: undefined,
      exitMultiple: undefined,
      interestRate: 0.05, // 5%
      minCash: 0,
      feesPct: 0.02, // 2%
    },
    
    merger: {
      taxRate: 0.21,
      synergyRampDefault: [0.25, 0.5, 0.75, 1.0],
      intangiblesPct: 0.3, // 30%
      intangiblesLifeYears: 15,
      newDebtRate: 0.05,
    },
    
    operating: {
      forecastMonths: 24,
      revenueModelDefault: 'saas',
      hiringRampPct: 1.0, // 100% fully loaded from start
      runwayWarningMonths: 6,
    },
  },
  
  guardrails: {
    global: {
      action: 'warn',
    },
    
    valuation: {
      maxWacc: 0.5, // 50% max
      maxTerminalGrowth: 0.05, // 5% max
    },
    
    lbo: {
      maxIRR: 10.0, // 1000% max (unrealistic)
      maxLeverage: 10.0, // 10x max
      sourcesUsesMustTie: {
        enabled: true,
        action: 'block',
      },
    },
    
    merger: {
      maxDilutionPct: 0.5, // 50% max dilution
      sourcesUsesMustTie: {
        enabled: true,
        action: 'block',
      },
      epsBridgeMustTie: {
        enabled: true,
        action: 'block',
      },
      requireSynergyCOGS: {
        enabled: true,
        action: 'block',
      },
    },
    
    operating: {
      runwayBelowMonths: {
        months: 6,
        action: 'warn',
      },
      maxRevenueMoMGrowth: 0.5, // 50% MoM max
      maxHeadcountMoMGrowth: 0.2, // 20% MoM max
    },
  },
  
  data: {
    primarySource: 'polygon',
    fallbackStrategy: 'fail',
  },
  
  reporting: {
    verbosity: 'summary',
    excelStyle: 'presentation',
  },
};

/**
 * Deep merge settings with defaults
 */
export function mergeWithDefaults(userSettings: Partial<AppSettings>): AppSettings {
  const merged: AppSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  
  // Deep merge
  function deepMerge(target: any, source: any) {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        deepMerge(target[key], source[key]);
      } else if (source[key] !== undefined) {
        target[key] = source[key];
      }
    }
  }
  
  deepMerge(merged, userSettings);
  return merged;
}
