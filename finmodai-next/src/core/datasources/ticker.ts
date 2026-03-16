import type { TickerHydrateParams, ModelInputs } from '@/src/core/contracts/modelInputs';
import type { HydrationResult } from '@/src/core/contracts/modelOutputs';
import { fromTicker as fromLegacyTicker } from '@/lib/modelInputs/adapters';
import { issue } from '@/src/core/engine/errors';

const deterministicSeedFromTicker = (ticker: string): number =>
  ticker.split('').reduce((acc, char, idx) => acc + char.charCodeAt(0) * (idx + 3), 0);

const seededFallbackInputs = (ticker: string): ModelInputs => {
  const seed = deterministicSeedFromTicker(ticker);
  const revenue = 30_000 + (seed % 120_000);
  const margin = 0.18 + ((seed % 12) / 100);
  const sharesOutstanding = 1_000 + (seed % 10_000);
  const sharePrice = 20 + (seed % 280);
  const marketCap = sharesOutstanding * sharePrice;

  return {
    company: {
      name: ticker,
      currency: 'USD',
      ticker,
    },
    historicals: {
      years: [new Date().getUTCFullYear() - 1],
      revenue: [revenue],
    },
    assumptions: {
      growth: 0.08,
      margins: margin,
      taxRate: 0.25,
      capexPct: 0.04,
      nwcPct: 0.02,
      daPct: 0.04,
      wacc: 0.1,
      terminalGrowth: 0.025,
    },
    capitalStructure: {
      netDebt: revenue * 0.1,
      sharesOutstanding,
    },
    pricingAnchor: {
      marketCap,
      sharePrice,
      sharesOutstanding,
    },
    metadata: {
      source: 'ticker',
      asOfDate: new Date().toISOString().slice(0, 10),
      liveDataFallback: true,
      liveDataStatus: 'seeded_demo_fallback',
    },
  };
};

const mapLegacyToCore = (legacy: any): ModelInputs => ({
  company: {
    name: legacy.company?.name || legacy.company?.ticker || 'Company',
    currency: legacy.company?.currency || 'USD',
    ticker: legacy.company?.ticker,
  },
  historicals: {
    years: legacy.historicals?.years,
    revenue: legacy.historicals?.revenue,
    ebit: legacy.historicals?.ebit,
    ebitMargin: legacy.historicals?.ebitMargin,
    fcf: legacy.historicals?.fcf,
  },
  assumptions: {
    growth: legacy.assumptions?.growth,
    margins: legacy.assumptions?.margin,
    taxRate: legacy.assumptions?.taxRate,
    capexPct: legacy.assumptions?.capexPctRevenue,
    nwcPct: legacy.assumptions?.nwcPctRevenue,
    daPct: legacy.assumptions?.daPctRevenue,
    wacc: legacy.assumptions?.wacc,
    terminalGrowth: legacy.assumptions?.terminalGrowth,
    terminalMultiple: legacy.assumptions?.terminalMultiple,
    projectionYears:
      Array.isArray(legacy.assumptions?.growthSeries) && legacy.assumptions.growthSeries.length > 0
        ? legacy.assumptions.growthSeries.length
        : undefined,
  },
  capitalStructure: {
    netDebt: legacy.capitalStructure?.netDebt,
    sharesOutstanding: legacy.capitalStructure?.sharesOutstanding,
  },
  pricingAnchor: {
    marketCap: legacy.pricingAnchor?.marketCap,
    sharePrice: legacy.pricingAnchor?.sharePrice,
    sharesOutstanding: legacy.pricingAnchor?.sharesOutstanding,
  },
  metadata: {
    source: 'ticker',
    asOfDate: legacy.metadata?.asOfDate || new Date().toISOString().slice(0, 10),
    scenarioId: legacy.metadata?.scenarioId,
    liveDataFallback: legacy.metadata?.liveDataFallback === true,
    liveDataStatus: legacy.metadata?.liveDataStatus,
  },
});

export async function hydrateFromTicker(params: TickerHydrateParams): Promise<HydrationResult> {
  const cleanTicker = String(params.ticker || '').trim().toUpperCase();
  if (!cleanTicker) {
    return {
      ok: false,
      warnings: [],
      issues: [issue('ticker_required', 'Ticker is required for ticker data source.', 'error', 'ticker')],
    };
  }

  try {
    const legacy = await fromLegacyTicker(cleanTicker);
    const mapped = mapLegacyToCore(legacy);
    if (params.asOfDate) {
      mapped.metadata.asOfDate = params.asOfDate;
    }
    if (params.scenarioId) {
      mapped.metadata.scenarioId = params.scenarioId;
    }

    const warnings: string[] = [];
    if (mapped.metadata.liveDataFallback) {
      warnings.push('Live market pull unavailable — using cached company data and fallback assumptions where needed.');
    }

    return {
      ok: true,
      value: mapped,
      warnings,
      issues: [],
    };
  } catch (error: any) {
    const fallback = seededFallbackInputs(cleanTicker);
    if (params.asOfDate) fallback.metadata.asOfDate = params.asOfDate;
    if (params.scenarioId) fallback.metadata.scenarioId = params.scenarioId;
    return {
      ok: true,
      value: fallback,
      warnings: ['Live market pull unavailable — using cached company data and fallback assumptions where needed.'],
      issues: [
        issue(
          'ticker_hydration_failed',
          error?.message || 'Ticker hydration failed. Using seeded demo fallback.',
          'warning',
          'ticker'
        ),
      ],
    };
  }
}
