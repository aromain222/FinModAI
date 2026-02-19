/**
 * Apply Defaults to Model Inputs
 */

import { AppSettings } from '@/lib/settings/schema';
import { AppliedDefault } from '@/lib/settings/schema';

export async function applyDefaultsToModelInputs<T extends Record<string, any>>(
  inputs: Partial<T>,
  settings: AppSettings
): Promise<{ inputs: T; appliedDefaults: AppliedDefault[] }> {
  const appliedDefaults: AppliedDefault[] = [];
  const result = { ...inputs } as T;
  
  // Apply defaults from settings where inputs are missing
  const defaultMappings: Array<[keyof T, keyof AppSettings, string]> = [
    ['revenueGrowth' as keyof T, 'defaultRevenueGrowth', 'Revenue growth'],
    ['ebitdaMargin' as keyof T, 'defaultEbitdaMargin', 'EBITDA margin'],
    ['wacc' as keyof T, 'defaultWACC', 'WACC'],
    ['terminalGrowth' as keyof T, 'defaultTerminalGrowth', 'Terminal growth'],
    ['taxRate' as keyof T, 'defaultTaxRate', 'Tax rate'],
    ['capexPctRevenue' as keyof T, 'defaultCapexPctRevenue', 'Capex % of revenue'],
    ['nwcPctRevenue' as keyof T, 'defaultNwcPctRevenue', 'NWC % of revenue']
  ];
  
  for (const [inputKey, settingKey, label] of defaultMappings) {
    if (result[inputKey] === undefined && settings[settingKey] !== undefined) {
      result[inputKey] = settings[settingKey] as any;
      appliedDefaults.push({
        path: String(inputKey),
        field: String(inputKey),
        value: settings[settingKey],
        reason: `Using default ${label} from settings`,
        source: 'settings'
      });
    }
  }
  
  return { inputs: result, appliedDefaults };
}
