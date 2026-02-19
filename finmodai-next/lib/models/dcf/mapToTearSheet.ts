/**
 * Map DCF to Tear Sheet
 * Convert DCF output to tear sheet format
 */

import type { TearSheet } from '../tearSheet/types';

export function mapToTearSheet(dcfOutput: Record<string, any>): TearSheet {
  const ticker = (dcfOutput?.ticker as string | undefined) ?? 'N/A';
  const scenario = (dcfOutput?.scenario as string | undefined) ?? undefined;
  const createdAt = (dcfOutput?.createdAt as string | undefined) ?? undefined;

  // Prefer nested "valuationResults" when present.
  const valuation = dcfOutput?.valuationResults ?? dcfOutput ?? {};

  return {
    header: {
      ticker,
      modelName: 'DCF',
      createdAt,
      scenario,
    },
    kpis: [
      {
        label: 'Enterprise Value',
        value: typeof valuation.enterpriseValue === 'number' ? valuation.enterpriseValue : undefined,
        format: 'currency',
        unit: 'millions',
      },
      {
        label: 'Equity Value',
        value: typeof valuation.equityValue === 'number' ? valuation.equityValue : undefined,
        format: 'currency',
        unit: 'millions',
      },
      {
        label: 'Price Per Share',
        value: typeof valuation.pricePerShare === 'number' ? valuation.pricePerShare : undefined,
        format: 'currency',
        unit: 'raw',
        decimals: 2,
      },
    ],
    mainBlocks: [
      {
        type: 'table',
        title: 'Valuation Summary',
        columns: [
          { header: 'Metric', format: 'text', align: 'left' },
          { header: 'Value', format: 'currency', unit: 'millions', align: 'right' },
        ],
        rows: [
          ['PV Explicit FCF', valuation.pvExplicitFCF ?? null],
          ['PV Terminal Value', valuation.pvTerminalValue ?? null],
          ['Terminal Value', valuation.terminalValue ?? null],
        ],
        unitNote: 'USD (millions)',
      },
    ],
    sidebar: {
      assumptions: [
        { label: 'WACC', value: valuation.wacc ?? dcfOutput?.wacc ?? null, format: 'percent', decimals: 2 },
        {
          label: 'Terminal Growth',
          value: valuation.terminalGrowth ?? dcfOutput?.terminalGrowth ?? null,
          format: 'percent',
          decimals: 2,
        },
      ],
      diagnostics: {
        warnings: Array.isArray(dcfOutput?.warnings) ? dcfOutput.warnings : [],
      },
    },
  };
}

// Alias for compatibility
export const mapDcfToTearSheet = mapToTearSheet;
