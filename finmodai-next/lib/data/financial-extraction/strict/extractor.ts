import type {
  StrictExtractedMetrics,
  StrictFinancialMetric,
  StrictFinancialPeriodType,
  StrictMetricObservation,
  StrictPipelineArtifactBundle,
  StrictSourceProvider,
} from '@/lib/data/financial-extraction/strict/types';

function emptyMetrics(): StrictExtractedMetrics {
  return {
    revenue: { observations: [] },
    ebitda: { observations: [] },
    net_income: { observations: [] },
    free_cash_flow: { observations: [] },
    debt: { observations: [] },
    cash: { observations: [] },
  };
}

function createObservation(params: {
  metric: StrictFinancialMetric;
  value: number | null;
  artifact: StrictPipelineArtifactBundle['artifact'];
  periodType: StrictFinancialPeriodType;
  fieldPath: string;
  asOfDate?: string | null;
}): StrictMetricObservation {
  return {
    value: typeof params.value === 'number' && Number.isFinite(params.value) ? params.value : null,
    unit: 'usd',
    source_id: params.artifact.source_id,
    source_url: params.artifact.source_url,
    provider: params.artifact.provider,
    as_of_date: params.asOfDate ?? params.artifact.as_of_date ?? null,
    period_type: params.periodType,
    field_path: params.fieldPath,
  };
}

function firstArrayRow(payload: unknown): Record<string, unknown> | null {
  if (Array.isArray(payload)) {
    const row = payload[0];
    return row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
  }
  if (payload && typeof payload === 'object') {
    return payload as Record<string, unknown>;
  }
  return null;
}

function pickNumber(node: unknown, keys: string[]): { value: number | null; fieldPath: string } {
  if (!node || typeof node !== 'object') {
    return { value: null, fieldPath: keys[0] || '' };
  }
  const record = node as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { value, fieldPath: key };
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return { value: parsed, fieldPath: key };
    }
  }
  return { value: null, fieldPath: keys[0] || '' };
}

function pickSecUsdValue(
  facts: any,
  tags: string[],
  periodType: StrictFinancialPeriodType,
): { value: number | null; fieldPath: string; asOfDate: string | null } {
  for (const tag of tags) {
    const units = facts?.[tag]?.units?.USD || facts?.[tag]?.units?.usd;
    if (!Array.isArray(units)) continue;
    const candidates = units.filter((item: any) => {
      const fp = String(item?.fp || '').toUpperCase();
      const form = String(item?.form || '').toUpperCase();
      if (periodType === 'annual') return fp === 'FY' || form === '10-K' || form === '20-F';
      if (periodType === 'quarterly') return /^Q[1-4]$/.test(fp) || form === '10-Q';
      return true;
    });
    const sorted = [...candidates].sort(
      (a, b) => new Date(b.end || b.filed || 0).getTime() - new Date(a.end || a.filed || 0).getTime(),
    );
    const entry = sorted.find((item) => typeof item?.val === 'number');
    if (entry) {
      return {
        value: Number(entry.val),
        fieldPath: `facts.us-gaap.${tag}.units.USD`,
        asOfDate: typeof entry.end === 'string' ? entry.end : null,
      };
    }
  }

  return {
    value: null,
    fieldPath: `facts.us-gaap.${tags[0] ?? 'unknown'}.units.USD`,
    asOfDate: null,
  };
}

function extractSecObservations(
  artifact: StrictPipelineArtifactBundle,
  periodType: StrictFinancialPeriodType,
): Array<{ metric: StrictFinancialMetric; observation: StrictMetricObservation }> {
  const facts = (artifact.raw as any)?.facts?.['us-gaap'];
  const picks: Record<StrictFinancialMetric, ReturnType<typeof pickSecUsdValue>> = {
    revenue: pickSecUsdValue(
      facts,
      ['Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerExcludingAssessedTax'],
      periodType,
    ),
    ebitda: pickSecUsdValue(
      facts,
      ['EarningsBeforeInterestTaxesDepreciationAndAmortization'],
      periodType,
    ),
    net_income: pickSecUsdValue(facts, ['NetIncomeLoss'], periodType),
    free_cash_flow: pickSecUsdValue(
      facts,
      ['FreeCashFlow', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperationsLessCapitalExpenditures'],
      periodType,
    ),
    debt: pickSecUsdValue(
      facts,
      ['Debt', 'DebtAndFinanceLeaseObligations', 'LongTermDebtAndCapitalLeaseObligations'],
      periodType,
    ),
    cash: pickSecUsdValue(
      facts,
      ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
      periodType,
    ),
  };

  return (Object.keys(picks) as StrictFinancialMetric[]).map((metric) => ({
    metric,
    observation: createObservation({
      metric,
      value: picks[metric].value,
      artifact: artifact.artifact,
      periodType,
      fieldPath: picks[metric].fieldPath,
      asOfDate: picks[metric].asOfDate,
    }),
  }));
}

function extractFmpObservations(
  artifact: StrictPipelineArtifactBundle,
  periodType: StrictFinancialPeriodType,
): Array<{ metric: StrictFinancialMetric; observation: StrictMetricObservation }> {
  const row = firstArrayRow(artifact.raw);
  const asOfDate = typeof row?.date === 'string' ? row.date : null;
  const kind = artifact.artifact.source_id.split(':')[2] || '';
  const providerMetrics =
    kind === 'income'
      ? {
          revenue: pickNumber(row, ['revenue']),
          ebitda: pickNumber(row, ['ebitda']),
          net_income: pickNumber(row, ['netIncome']),
          free_cash_flow: { value: null, fieldPath: 'freeCashFlow' },
          debt: { value: null, fieldPath: 'totalDebt' },
          cash: { value: null, fieldPath: 'cashAndCashEquivalents' },
        }
      : kind === 'cashFlow'
        ? {
            revenue: { value: null, fieldPath: 'revenue' },
            ebitda: { value: null, fieldPath: 'ebitda' },
            net_income: { value: null, fieldPath: 'netIncome' },
            free_cash_flow: pickNumber(row, ['freeCashFlow']),
            debt: { value: null, fieldPath: 'totalDebt' },
            cash: { value: null, fieldPath: 'cashAndCashEquivalents' },
          }
        : {
            revenue: { value: null, fieldPath: 'revenue' },
            ebitda: { value: null, fieldPath: 'ebitda' },
            net_income: { value: null, fieldPath: 'netIncome' },
            free_cash_flow: { value: null, fieldPath: 'freeCashFlow' },
            debt: pickNumber(row, ['totalDebt']),
            cash: pickNumber(row, ['cashAndCashEquivalents', 'cashAndShortTermInvestments']),
          };

  return (Object.keys(providerMetrics) as StrictFinancialMetric[]).map((metric) => ({
    metric,
    observation: createObservation({
      metric,
      value: providerMetrics[metric].value,
      artifact: artifact.artifact,
      periodType,
      fieldPath: providerMetrics[metric].fieldPath,
      asOfDate,
    }),
  }));
}

function extractArtifactObservations(
  artifact: StrictPipelineArtifactBundle,
  periodType: StrictFinancialPeriodType,
): Array<{ metric: StrictFinancialMetric; observation: StrictMetricObservation }> {
  if (artifact.artifact.provider === 'sec_edgar') {
    return extractSecObservations(artifact, periodType);
  }
  if (artifact.artifact.provider === 'fmp') {
    return extractFmpObservations(artifact, periodType);
  }
  return [];
}

export function runStrictExtractor(params: {
  artifacts: StrictPipelineArtifactBundle[];
  periodType: StrictFinancialPeriodType;
}): StrictExtractedMetrics {
  const metrics = emptyMetrics();

  for (const artifact of params.artifacts) {
    for (const { metric, observation } of extractArtifactObservations(artifact, params.periodType)) {
      metrics[metric].observations.push(observation);
    }
  }

  return metrics;
}
