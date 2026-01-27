import type { DerivedPreview } from '@/lib/previewDerived/types';

export function buildReportInputs({ model, derivedPreview }: { model: any; derivedPreview: DerivedPreview | null }) {
  return {
    modelType: model?.model_type ?? model?.type ?? 'other',
    ticker: model?.ticker ?? null,
    units: derivedPreview?.units ?? { label: 'Unknown', scale: 'UNKNOWN' },
    keyOutputs: derivedPreview?.keyOutputs ?? {},
    assumptions: derivedPreview?.assumptions ?? {},
    series: derivedPreview?.series ?? {},
    sheetMeta: derivedPreview?.sheetMeta ?? {},
  };
}
