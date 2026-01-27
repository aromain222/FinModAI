export type UnitsScale = 'MILLIONS' | 'BILLIONS' | 'RAW' | 'UNKNOWN';

export type DerivedPreview = {
  units: { label: string; scale: UnitsScale };
  sheetMeta: { sheetName: string; rowCount: number; colCount: number; years: Array<number | string>; yearRangeLabel: string };
  keyOutputs: {
    enterpriseValue?: number | null;
    equityValue?: number | null;
    netDebt?: number | null;
    sharesMm?: number | null;
    pricePerShare?: number | null;
    notes?: string[];
  };
  assumptions: Record<string, { label: string; value: number | string | null; kind: 'percent' | 'money' | 'number' | 'text' }>;
  series: {
    revenue?: Array<{ year: number | string; value: number }>;
    ebit?: Array<{ year: number | string; value: number }>;
    nopat?: Array<{ year: number | string; value: number }>;
    fcf?: Array<{ year: number | string; value: number }>;
    ebitMargin?: Array<{ year: number | string; value: number }>;
  };
  file: { ready: boolean; label: string; r2Key?: string | null };
  debug: { matchedLabels: string[]; chosenSources: string[] };
};
