import type {
  MappedModelInputs,
  NormalizedFinancialFact,
  ResolvedCompanyIdentity,
  ValidatedFinancialSnapshot,
} from '@/lib/data/financial-extraction/types';

function toModelMillions(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Number((value / 1_000_000).toFixed(3)) : null;
}

function selectMetric(facts: NormalizedFinancialFact[], metricKey: NormalizedFinancialFact['metricKey']): number | null {
  const fact = facts.find((item) => item.metricKey === metricKey);
  return fact?.value ?? null;
}

export function buildMappedModelInputs(params: {
  identity: ResolvedCompanyIdentity;
  facts: NormalizedFinancialFact[];
}): MappedModelInputs {
  const revenue = selectMetric(params.facts, 'revenue');
  const grossProfit = selectMetric(params.facts, 'gross_profit');
  const ebitda = selectMetric(params.facts, 'ebitda');
  const ebit = selectMetric(params.facts, 'ebit');
  const cash = selectMetric(params.facts, 'cash');
  const totalDebt = selectMetric(params.facts, 'total_debt');
  const sharesOutstanding = selectMetric(params.facts, 'shares_outstanding');
  const sharePrice = selectMetric(params.facts, 'share_price');
  const marketCap = selectMetric(params.facts, 'market_cap');
  const asOfDate = params.facts.find((item) => item.asOfDate)?.asOfDate ?? null;
  const periodType = params.facts[0]?.periodType ?? 'ltm';

  return {
    companyName: params.identity.companyName,
    ticker: params.identity.ticker ?? null,
    asOfDate,
    periodType,
    revenue: toModelMillions(revenue),
    grossProfit: toModelMillions(grossProfit),
    ebitda: toModelMillions(ebitda),
    ebit: toModelMillions(ebit),
    cash: toModelMillions(cash),
    totalDebt: toModelMillions(totalDebt),
    sharesOutstanding,
    sharePrice,
    marketCap: toModelMillions(marketCap),
    netDebt:
      typeof totalDebt === 'number' && typeof cash === 'number'
        ? toModelMillions(totalDebt - cash)
        : null,
    source: `financial_extraction_${params.identity.lane}`,
    sourceAttribution: Array.from(new Set(params.facts.map((item) => item.sourceLabel))),
  };
}

export function buildValidatedSnapshot(params: {
  identity: ResolvedCompanyIdentity;
  validationState: ValidatedFinancialSnapshot['validationState'];
  warnings: string[];
  blockingErrors: string[];
  facts: NormalizedFinancialFact[];
  mappedModelInputs: MappedModelInputs | null;
  sourceArtifacts: ValidatedFinancialSnapshot['sourceArtifacts'];
}): ValidatedFinancialSnapshot {
  return {
    companyName: params.identity.companyName,
    ticker: params.identity.ticker ?? null,
    cik: params.identity.cik ?? null,
    lane: params.identity.lane,
    validationState: params.validationState,
    warnings: params.warnings,
    blockingErrors: params.blockingErrors,
    facts: params.facts,
    mappedModelInputs: params.mappedModelInputs,
    sourceArtifacts: params.sourceArtifacts,
  };
}
