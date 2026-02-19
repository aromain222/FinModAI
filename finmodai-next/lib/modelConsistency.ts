import type { CanonicalFinancials } from './canonicalFinancials';

type ModelMetricSource = {
  model: 'dcf' | 'comps' | 'lbo';
  ebitda?: number | null;
  netDebt?: number | null;
  sharesOutstanding?: number | null;
};

export type ConsistencyWarning = {
  metric: 'ebitda' | 'netDebt' | 'sharesOutstanding';
  canonical: number;
  model: string;
  modelValue: number;
  message: string;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export function checkModelConsistency(
  canonical: CanonicalFinancials | null,
  sources: ModelMetricSource[],
  tolerancePct: number = 0.02
): { warnings: string[]; details: ConsistencyWarning[] } {
  const warnings: string[] = [];
  const details: ConsistencyWarning[] = [];

  if (!canonical) {
    return { warnings, details };
  }

  const canonicalValues = canonical.values;
  const metricMap: Array<{
    key: 'ebitda' | 'netDebt' | 'sharesOutstanding';
    canonicalValue: number | null;
  }> = [
    { key: 'ebitda', canonicalValue: canonicalValues.ebitda.value },
    { key: 'netDebt', canonicalValue: canonicalValues.netDebt.value },
    { key: 'sharesOutstanding', canonicalValue: canonicalValues.sharesOutstanding.value },
  ];

  metricMap.forEach(({ key, canonicalValue }) => {
    if (canonicalValue === null || !Number.isFinite(canonicalValue)) return;
    sources.forEach((source) => {
      const modelValue = toNumber(source[key]);
      if (modelValue === null) return;
      const diff = Math.abs(modelValue - canonicalValue);
      const denom = Math.max(Math.abs(canonicalValue), 1);
      if (diff / denom > tolerancePct) {
        const message = `Model inputs differ across valuations: ${source.model} ${key} (${modelValue}) vs canonical (${canonicalValue}).`;
        warnings.push(message);
        details.push({
          metric: key,
          canonical: canonicalValue,
          model: source.model,
          modelValue,
          message,
        });
      }
    });
  });

  return { warnings, details };
}

