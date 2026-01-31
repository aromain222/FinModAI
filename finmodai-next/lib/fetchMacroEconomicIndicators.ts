/**
 * Fetch Macro Economic Indicators
 */

export interface MacroIndicator {
  name: string;
  value: number;
  change: number;
  unit: string;
}

export async function fetchMacroEconomicIndicators(): Promise<MacroIndicator[]> {
  return [
    { name: 'GDP Growth', value: 2.5, change: 0.1, unit: '%' },
    { name: 'Unemployment', value: 3.9, change: -0.1, unit: '%' },
    { name: 'Inflation (CPI)', value: 3.2, change: -0.3, unit: '%' },
    { name: 'Fed Funds Rate', value: 5.33, change: 0, unit: '%' }
  ];
}
