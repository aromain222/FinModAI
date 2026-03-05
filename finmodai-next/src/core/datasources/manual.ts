import type { ManualHydrateParams, ModelInputs } from '@/src/core/contracts/modelInputs';
import type { HydrationResult } from '@/src/core/contracts/modelOutputs';
import { fromManual as fromLegacyManual, manualPayloadFromRequest } from '@/lib/modelInputs/adapters';
import { issue } from '@/src/core/engine/errors';

const mapLegacyToCore = (legacy: any): ModelInputs => ({
  company: {
    name: legacy.company?.name || 'Private Company',
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
    source: 'manual',
    asOfDate: legacy.metadata?.asOfDate || new Date().toISOString().slice(0, 10),
    scenarioId: legacy.metadata?.scenarioId,
    liveDataFallback: legacy.metadata?.liveDataFallback === true,
    liveDataStatus: legacy.metadata?.liveDataStatus,
  },
});

export async function hydrateFromManual(params: ManualHydrateParams): Promise<HydrationResult> {
  try {
    const payload = manualPayloadFromRequest({
      ...params.formData,
      manualInputs: params.formData,
      companyName: params.formData?.companyName,
    } as any);
    const legacy = fromLegacyManual(payload as any);
    const mapped = mapLegacyToCore(legacy);
    if (params.asOfDate) mapped.metadata.asOfDate = params.asOfDate;
    if (params.scenarioId) mapped.metadata.scenarioId = params.scenarioId;

    return {
      ok: true,
      value: mapped,
      warnings: [],
      issues: [],
    };
  } catch (error: any) {
    return {
      ok: false,
      warnings: [],
      issues: [
        issue(
          'manual_hydration_failed',
          error?.message || 'Manual inputs are incomplete or invalid.',
          'error',
          'manualInputs'
        ),
      ],
    };
  }
}
