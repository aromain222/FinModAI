import type { PreviewV3 } from '@/types/preview-v3';
import { extractFromSheet } from './extractFromSheet';
import { extractFromResults } from './extractFromResults';
import type { DerivedPreview, UnitsScale } from './types';

const mergeKeyOutputs = (primary: any, secondary: any) => ({
  enterpriseValue: primary?.enterpriseValue ?? secondary?.enterpriseValue ?? null,
  equityValue: primary?.equityValue ?? secondary?.equityValue ?? null,
  netDebt: primary?.netDebt ?? secondary?.netDebt ?? null,
  sharesMm: primary?.sharesMm ?? secondary?.sharesMm ?? null,
  pricePerShare: primary?.pricePerShare ?? secondary?.pricePerShare ?? null,
  notes: [...(primary?.notes ?? []), ...(secondary?.notes ?? [])],
});

const mergeAssumptions = (a: any, b: any) => ({ ...(b || {}), ...(a || {}) });

const mergeSeries = (a: any, b: any) => ({
  revenue: a?.revenue ?? b?.revenue,
  ebit: a?.ebit ?? b?.ebit,
  nopat: a?.nopat ?? b?.nopat,
  fcf: a?.fcf ?? b?.fcf,
  ebitMargin: a?.ebitMargin ?? b?.ebitMargin,
});

const computePricePerShare = (outputs: any): any => {
  const next = { ...outputs };
  if ((!next.pricePerShare || Number.isNaN(next.pricePerShare)) && next.equityValue && next.sharesMm && next.sharesMm > 0) {
    next.pricePerShare = next.equityValue / next.sharesMm;
  } else if (!next.pricePerShare) {
    next.notes = [...(next.notes ?? []), 'Price/share unavailable: shares missing in workbook.'];
  }
  return next;
};

const chooseUnits = (a: DerivedPreview | null, b: DerivedPreview | null): { label: string; scale: UnitsScale } => {
  if (a?.units) return a.units;
  if (b?.units) return b.units;
  return { label: 'Unknown', scale: 'UNKNOWN' };
};

const buildYearRangeLabel = (years: Array<number | string>) => {
  if (!years || years.length === 0) return '—';
  return `${years[0]}–${years[years.length - 1]}`;
};

export function buildDerivedPreview(input: { model: any; preview?: PreviewV3 | null; results?: any }): DerivedPreview {
  const sheetDerived = extractFromSheet(input.preview ?? null);
  const resultsDerived = extractFromResults(input.results ?? {});

  const keyOutputs = computePricePerShare(mergeKeyOutputs(resultsDerived.keyOutputs, sheetDerived?.keyOutputs));
  const assumptions = mergeAssumptions(resultsDerived.assumptions, sheetDerived?.assumptions);
  const series = mergeSeries(resultsDerived.series, sheetDerived?.series);

  const units = chooseUnits(sheetDerived, resultsDerived as any);
  const sheetMeta = sheetDerived?.sheetMeta ?? {
    sheetName: input.preview?.sheetName ?? 'Sheet',
    rowCount: input.preview?.rows?.length ?? 0,
    colCount: input.preview?.columns?.length ?? 0,
    years: [],
    yearRangeLabel: buildYearRangeLabel([]),
  };

  const fileReady = Boolean(
    (input.model as any)?.r2_key ||
      (input.model as any)?.file_name ||
      (input.results as any)?.r2_key ||
      (resultsDerived.file?.ready ?? false)
  );

  const derived: DerivedPreview = {
    units,
    sheetMeta: { ...sheetMeta, yearRangeLabel: buildYearRangeLabel(sheetMeta.years) },
    keyOutputs,
    assumptions,
    series,
    file: { ready: fileReady, label: fileReady ? 'Ready' : 'Not available', r2Key: (input.model as any)?.r2_key },
    debug: {
      matchedLabels: [
        ...(sheetDerived?.debug?.matchedLabels ?? []),
        ...(resultsDerived.debug?.matchedLabels ?? []),
      ],
      chosenSources: [
        ...(resultsDerived.debug?.chosenSources ?? []),
        ...(sheetDerived?.debug?.chosenSources ?? []),
      ],
    },
  };

  return derived;
}
