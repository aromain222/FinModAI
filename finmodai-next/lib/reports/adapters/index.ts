import type { ReportV1 } from '@/types/reportContracts';
import { buildDcfReport } from './dcf';
import { buildLboReport } from './lbo';
import { buildCompsReport } from './comps';
import { buildOperatingReport } from './operating';
import { buildMergerReport } from './merger';
import { buildFallbackReport } from './fallback';

export function buildReportForModel(params: {
  modelId: string;
  modelType: string;
  ticker?: string | null;
  companyName?: string | null;
  scenario?: string | null;
  results?: any;
  preview?: any;
}): ReportV1 {
  const modelType = params.modelType?.toLowerCase?.() ?? 'other';
  try {
    switch (modelType) {
      case 'dcf':
        return buildDcfReport(params);
      case 'lbo':
        return buildLboReport(params);
      case 'comps':
        return buildCompsReport(params);
      case 'operating':
      case 'three-statement':
      case 'three_statement':
        return buildOperatingReport(params);
      case 'merger':
        return buildMergerReport(params);
      default:
        return buildFallbackReport(params);
    }
  } catch (error) {
    return buildFallbackReport({ ...params, results: { error } });
  }
}
