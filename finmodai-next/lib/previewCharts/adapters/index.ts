import type { ChartSpec } from '@/types/chartSpecs';
import { dcfCharts } from './dcf';
import { lboCharts } from './lbo';
import { compsCharts } from './comps';
import { operatingCharts } from './operating';
import { mergerCharts } from './merger';

export function buildPreviewCharts(model: any, results: any, preview: any): ChartSpec[] {
  const type = model?.model_type ?? model?.type ?? 'other';
  switch ((type ?? '').toLowerCase()) {
    case 'dcf':
      return dcfCharts(results);
    case 'lbo':
      return lboCharts(results);
    case 'comps':
      return compsCharts(results);
    case 'operating':
    case 'three-statement':
    case 'three_statement':
      return operatingCharts(results);
    case 'merger':
      return mergerCharts(results);
    default:
      return [];
  }
}
