import type {
  AnalystDcfComparisonPayload,
  AnalystDcfDemoPayload,
  AnalystDcfScenarioResult,
} from '@/lib/analyst/dcfDemo';

export function normalizeDcfSharesOutstanding(
  sharesOutstanding: number | null | undefined,
  marketCapM: number | null | undefined,
  sharePrice: number | null | undefined,
): number | null {
  const shares =
    typeof sharesOutstanding === 'number' && Number.isFinite(sharesOutstanding) && sharesOutstanding > 0
      ? sharesOutstanding
      : null;
  const derivedFromMarket =
    typeof marketCapM === 'number' &&
    Number.isFinite(marketCapM) &&
    marketCapM > 0 &&
    typeof sharePrice === 'number' &&
    Number.isFinite(sharePrice) &&
    sharePrice > 0
      ? marketCapM / sharePrice
      : null;

  if (shares === null) return derivedFromMarket;
  if (derivedFromMarket !== null && shares < 100 && derivedFromMarket > shares * 50) return derivedFromMarket;
  if (shares > 1_000_000) return shares / 1_000_000;
  return shares;
}

function repairScenarioShareValue(
  scenario: AnalystDcfScenarioResult,
  sharesOutstanding: number | null,
  marketPrice: number | null,
): AnalystDcfScenarioResult {
  if (sharesOutstanding === null || sharesOutstanding <= 0) return scenario;
  const pricePerShare = scenario.equityValue / sharesOutstanding;
  const upsidePct =
    marketPrice !== null && Number.isFinite(marketPrice) && marketPrice > 0
      ? pricePerShare / marketPrice - 1
      : null;

  return {
    ...scenario,
    pricePerShare,
    marketPrice,
    upsidePct,
  };
}

export function repairDcfPayloadShareCount(payload: AnalystDcfDemoPayload): AnalystDcfDemoPayload {
  const comparison = payload.comparison ? repairDcfComparisonShareCount(payload.comparison) : payload.comparison;
  const originalShares = payload.baseMetrics.sharesOutstanding;
  const sharePrice = payload.baseMetrics.sharePrice;
  const marketCap = payload.baseMetrics.marketCap;
  const sharesOutstanding = normalizeDcfSharesOutstanding(
    originalShares,
    marketCap,
    sharePrice,
  );

  if (sharesOutstanding === null || sharesOutstanding === originalShares) {
    return comparison === payload.comparison ? payload : { ...payload, comparison };
  }

  const repairWarning =
    originalShares !== null && originalShares !== undefined
      ? `Shares outstanding normalized from ${originalShares.toLocaleString('en-US')} to ${sharesOutstanding?.toLocaleString('en-US') ?? 'n/a'}M for DCF per-share math.`
      : 'Shares outstanding derived from market cap and share price for DCF per-share math.';
  const memoLooksStale = /data error|orders of magnitude|nonsensical|\$[0-9,.]+M/i.test(payload.memo);

  return {
    ...payload,
    memo: memoLooksStale
      ? `${repairWarning} Displayed valuation outputs have been recalculated with the normalized share count. Regenerate or apply changes to refresh the full investment memo.`
      : payload.memo,
    warnings: payload.warnings.includes(repairWarning)
      ? payload.warnings
      : [...payload.warnings, repairWarning],
    baseMetrics: {
      ...payload.baseMetrics,
      sharesOutstanding,
    },
    scenarios: {
      base: repairScenarioShareValue(payload.scenarios.base, sharesOutstanding, sharePrice),
      bull: repairScenarioShareValue(payload.scenarios.bull, sharesOutstanding, sharePrice),
      bear: repairScenarioShareValue(payload.scenarios.bear, sharesOutstanding, sharePrice),
    },
    comparison,
  };
}

function repairDcfComparisonShareCount(payload: AnalystDcfComparisonPayload): AnalystDcfComparisonPayload {
  const sharesOutstanding = normalizeDcfSharesOutstanding(
    payload.baseMetrics.sharesOutstanding,
    payload.baseMetrics.marketCap,
    payload.baseMetrics.sharePrice,
  );

  if (sharesOutstanding === null || sharesOutstanding === payload.baseMetrics.sharesOutstanding) return payload;

  return {
    ...payload,
    baseMetrics: {
      ...payload.baseMetrics,
      sharesOutstanding,
    },
    scenarios: {
      base: repairScenarioShareValue(payload.scenarios.base, sharesOutstanding, payload.baseMetrics.sharePrice),
      bull: repairScenarioShareValue(payload.scenarios.bull, sharesOutstanding, payload.baseMetrics.sharePrice),
      bear: repairScenarioShareValue(payload.scenarios.bear, sharesOutstanding, payload.baseMetrics.sharePrice),
    },
  };
}
