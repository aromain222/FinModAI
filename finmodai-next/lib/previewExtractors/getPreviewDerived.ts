import type { PreviewV3 } from '@/types/preview-v3';
import type { ModelRow } from '@/types/modelContracts';
import { extractFromSheet, type DerivedPreview } from './extractFromSheet';

type DerivedWithFile = DerivedPreview & { fileReady: boolean };

const pickNumber = (...values: any[]): number | null => {
  for (const v of values) {
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string' && v.trim().length) {
      const parsed = Number(v);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return null;
};

export function getPreviewDerived(params: { model: ModelRow | null; preview: PreviewV3 | null }): DerivedWithFile | null {
  const { model, preview } = params;
  const results = (model as any)?.results || {};

  const fromResults: DerivedPreview = {
    sheetMeta: {
      sheetName: preview?.sheetName || 'Sheet',
      rowCount: preview?.rows?.length || 0,
      colCount: preview?.columns?.length || 0,
      fiscalYears: [],
    },
    keyOutputs: {
      enterpriseValue: pickNumber(results?.valuation?.enterpriseValue, results?.enterpriseValue),
      equityValue: pickNumber(results?.valuation?.equityValue, results?.equityValue),
      pricePerShare: pickNumber(
        results?.valuation?.pricePerShare,
        results?.valuation?.impliedValuePerShare,
        results?.pricePerShare
      ),
      netDebt: pickNumber(results?.valuation?.netDebt, results?.netDebt),
      shares: pickNumber(results?.shares, results?.sharesOutstanding, results?.capitalization?.sharesOutstanding),
    },
    assumptions: {
      taxRate: pickNumber(results?.assumptions?.taxRate, results?.assumptions?.tax_rate),
      revenueGrowth: pickNumber(results?.assumptions?.revenueGrowth, results?.assumptions?.revenue_growth),
      ebitMargin: pickNumber(results?.assumptions?.ebitMargin, results?.assumptions?.ebit_margin),
    },
    series: {},
    debug: { matchedLabels: [] },
  };

  const derivedFromSheet = extractFromSheet(preview ?? undefined);

  const merged: DerivedPreview = {
    sheetMeta: derivedFromSheet?.sheetMeta ?? fromResults.sheetMeta,
    keyOutputs: {
      enterpriseValue: fromResults.keyOutputs.enterpriseValue ?? derivedFromSheet?.keyOutputs.enterpriseValue ?? null,
      equityValue: fromResults.keyOutputs.equityValue ?? derivedFromSheet?.keyOutputs.equityValue ?? null,
      pricePerShare: fromResults.keyOutputs.pricePerShare ?? derivedFromSheet?.keyOutputs.pricePerShare ?? null,
      netDebt: fromResults.keyOutputs.netDebt ?? derivedFromSheet?.keyOutputs.netDebt ?? null,
      shares: fromResults.keyOutputs.shares ?? derivedFromSheet?.keyOutputs.shares ?? null,
    },
    assumptions: {
      ...derivedFromSheet?.assumptions,
      ...fromResults.assumptions,
    },
    series: derivedFromSheet?.series ?? {},
    debug: {
      matchedLabels: [
        ...(derivedFromSheet?.debug?.matchedLabels ?? []),
        ...(fromResults.debug?.matchedLabels ?? []),
      ],
    },
  };

  return {
    ...merged,
    fileReady: Boolean((model as any)?.r2_key || (model as any)?.file_name),
  };
}
