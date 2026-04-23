import type {
  StrictExtractedMetrics,
  StrictFinancialMetric,
  StrictMetricConflict,
  StrictValidatedMetrics,
} from '@/lib/data/financial-extraction/strict/types';

const MODEL_KEY_TO_METRIC: Partial<Record<string, StrictFinancialMetric>> = {
  revenue: 'revenue',
  ebitda: 'ebitda',
  net_income: 'net_income',
  cash: 'cash',
  total_debt: 'debt',
};

export function validateStrictMetrics(params: {
  metrics: StrictExtractedMetrics;
  requiredModelKeys: string[];
  periodType: string;
}):
  | {
      ok: true;
      validatedMetrics: StrictValidatedMetrics;
      missingFields: string[];
      conflicts: StrictMetricConflict[];
    }
  | {
      ok: false;
      reason: string;
      missingFields: string[];
      conflicts: StrictMetricConflict[];
    } {
  const requiredMetrics = Array.from(
    new Set(
      params.requiredModelKeys
        .map((key) => MODEL_KEY_TO_METRIC[key] ?? null)
        .filter((value): value is StrictFinancialMetric => Boolean(value)),
    ),
  );

  const validatedMetrics: StrictValidatedMetrics = {};
  const conflicts: StrictMetricConflict[] = [];
  const missingFields: string[] = [];

  for (const metric of requiredMetrics) {
    const observations = params.metrics[metric].observations;
    const explicit = observations.filter(
      (observation) => typeof observation.value === 'number' && Number.isFinite(observation.value),
    );

    if (explicit.length === 0) {
      missingFields.push(metric);
      continue;
    }

    const distinctValues = Array.from(new Set(explicit.map((observation) => String(observation.value))));
    if (distinctValues.length > 1) {
      conflicts.push({
        metric,
        period_type: params.periodType,
        sources: explicit.map((observation) => observation.source_id),
        values: distinctValues,
      });
      continue;
    }

    validatedMetrics[metric] = {
      value: explicit[0].value as number,
      unit: 'usd',
      observations: explicit,
    };
  }

  if (missingFields.length > 0 || conflicts.length > 0) {
    return {
      ok: false,
      reason:
        conflicts.length > 0
          ? 'Critical metrics contain conflicting explicit source values.'
          : 'Critical metrics are missing explicit source values.',
      missingFields,
      conflicts,
    };
  }

  return {
    ok: true,
    validatedMetrics,
    missingFields: [],
    conflicts: [],
  };
}
