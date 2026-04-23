import { getModelRequiredInputKeys } from '@/lib/models/shared/missingInputSpecs';
import type {
  StrictExplicitAssumptions,
  StrictModelInputs,
  StrictSourceAttribution,
  StrictValidatedMetrics,
} from '@/lib/data/financial-extraction/strict/types';

type SupportedMetricField = 'revenue' | 'ebitda' | 'net_income' | 'cash' | 'total_debt';

const METRIC_KEY_TO_FIELD: Record<SupportedMetricField, keyof StrictValidatedMetrics> = {
  revenue: 'revenue',
  ebitda: 'ebitda',
  net_income: 'net_income',
  cash: 'cash',
  total_debt: 'debt',
};

const EXPLICIT_ASSUMPTION_MAP: Record<string, keyof StrictExplicitAssumptions> = {
  wacc: 'wacc',
  terminal_growth: 'terminal_growth',
  tax_rate: 'tax_rate',
  tax_rate_assumption: 'tax_rate',
};

function buildAttribution(sourceIds: string[], sourceUrls: string[]) {
  return {
    source_ids: Array.from(new Set(sourceIds)),
    source_urls: Array.from(new Set(sourceUrls)),
  };
}

export function buildStrictModelInputs(params: {
  companyName: string;
  validatedMetrics: StrictValidatedMetrics;
  targetModelType: string;
  explicitAssumptions: StrictExplicitAssumptions;
}):
  | {
      ok: true;
      modelInputs: StrictModelInputs;
      sourceAttribution: StrictSourceAttribution;
    }
  | {
      ok: false;
      reason: string;
      missingFields: string[];
    } {
  const requiredKeys = getModelRequiredInputKeys(params.targetModelType);
  const modelInputs: StrictModelInputs = {
    companyName: {
      value: params.companyName,
      source: ['resolved_identity'],
    },
  };
  const sourceAttribution: StrictSourceAttribution = {
    companyName: {
      source_ids: ['resolved_identity'],
      source_urls: [],
    },
  };
  const missingFields: string[] = [];

  for (const key of requiredKeys) {
    if (key === 'companyName') continue;

    if (key in EXPLICIT_ASSUMPTION_MAP) {
      const assumptionKey = EXPLICIT_ASSUMPTION_MAP[key];
      const value = params.explicitAssumptions[assumptionKey];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        missingFields.push(key);
        continue;
      }
      modelInputs[key] = { value, source: ['explicit_assumptions'] };
      sourceAttribution[key] = buildAttribution(['explicit_assumptions'], []);
      continue;
    }

    if (key in METRIC_KEY_TO_FIELD) {
      const metric = params.validatedMetrics[METRIC_KEY_TO_FIELD[key as SupportedMetricField]];
      if (!metric) {
        missingFields.push(key);
        continue;
      }
      modelInputs[key] = {
        value: metric.value,
        source: metric.observations.map((observation) => observation.source_id),
      };
      sourceAttribution[key] = buildAttribution(
        metric.observations.map((observation) => observation.source_id),
        metric.observations.map((observation) => observation.source_url),
      );
      continue;
    }

    missingFields.push(key);
  }

  if (missingFields.length > 0) {
    return {
      ok: false,
      reason: 'Requested model requires fields that are not present in validated metrics or explicit assumptions.',
      missingFields,
    };
  }

  return {
    ok: true,
    modelInputs,
    sourceAttribution,
  };
}
