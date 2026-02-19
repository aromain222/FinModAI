import { ModelPreviewSnapshot, ModelPreviewDriver, ModelPreviewSparkline } from '@/types/modelPreview';
import { ModelType } from '@/types/models';
import type { ThreeStatementAssumptions } from '@/types/threeStatementAssumptions';
import type { LboEngineOutput } from '@/lib/lboEngine';
import type { CompsResult } from '@/lib/compsCalculator';

type BuildPreviewParams = {
  ticker: string;
  modelType: ModelType;
  assumptions?: ThreeStatementAssumptions;
  dcfSummary?: any;
  lboSummary?: LboEngineOutput | null;
  compsSummary?: CompsResult | null;
  usedAiFallback?: boolean;
};

const toActualDollars = (value: number | undefined | null): number | undefined => {
  if (value === undefined || value === null || !isFinite(value)) return undefined;
  // Heuristic: most engine outputs are in millions; upscale if value looks small for EV
  if (Math.abs(value) < 1_000_000) return value * 1_000_000;
  return value;
};

const calcCagr = (values: number[]): number | undefined => {
  const clean = values.filter(v => typeof v === 'number' && isFinite(v));
  if (clean.length < 2) return undefined;
  const first = clean[0];
  const last = clean[clean.length - 1];
  if (first === 0) return undefined;
  const years = clean.length - 1;
  return Math.pow(last / first, 1 / years) - 1;
};

const buildDrivers = (drivers: Array<{ label: string; value?: number; direction?: 'positive' | 'negative' }>): ModelPreviewDriver[] =>
  drivers
    .filter(d => typeof d.value === 'number' && isFinite(d.value))
    .map(d => ({
      label: d.label,
      value: d.value as number,
      direction: d.direction ?? 'positive',
    }));

const buildSparklines = (items: Array<{ label: string; values?: number[] }>): ModelPreviewSparkline[] =>
  items
    .filter(item => Array.isArray(item.values) && item.values.length > 0)
    .map(item => {
      const cleanValues = item.values!.filter(v => typeof v === 'number' && isFinite(v));
      const terminal = cleanValues.length > 0 ? cleanValues[cleanValues.length - 1] : undefined;
      return {
        label: item.label,
        values: cleanValues,
        cagr: calcCagr(item.values!),
        terminal,
      };
    });

const insightFromWarnings = (ticker: string, warnings: string[], base: string) => {
  if (warnings.length === 0) return base;
  return `${base} Key caution flags: ${warnings.slice(0, 3).join(' · ')}${warnings.length > 3 ? '…' : ''}`;
};

export function buildModelPreviewSnapshot(params: BuildPreviewParams): ModelPreviewSnapshot | null {
  const { ticker, modelType, dcfSummary, lboSummary, compsSummary, assumptions, usedAiFallback } = params;
  const warnings: string[] = [];
  if (usedAiFallback) warnings.push('AI fallback assumptions applied');

  const baseSnapshot: Omit<ModelPreviewSnapshot, 'modelType' | 'ticker'> = {
    confidence: 'high',
    headline: {},
    drivers: [],
    sparklines: [],
    assumptions: {},
    aiInsight: '',
    qualityWarnings: warnings,
  };

  switch (modelType) {
    case 'dcf': {
      const results = dcfSummary?.results || {};
      const assumptionsBlock = dcfSummary?.assumptions || assumptions || {};
      const revenueSeries = results.revenueByYear || [];
      const fcfSeries = results.ufcfByYear || results.fcfProjections || [];
      const ev = toActualDollars(results.enterpriseValue);
      const eq = toActualDollars(results.equityValue);
      const pps = results.pricePerShare;
      const revenueCagr = calcCagr(revenueSeries);
      const ebitdaMargin = assumptionsBlock.ebitdaMargin ?? assumptionsBlock.ebitdaMarginPct;
      const wacc = assumptionsBlock.wacc ?? dcfSummary?.valuationResults?.wacc;
      const terminalGrowth = assumptionsBlock.terminalGrowth ?? dcfSummary?.valuationResults?.terminalGrowth;

      if (!ev || !eq) {
        warnings.push('DCF valuation outputs were incomplete; check inputs before relying on price per share.');
      }

      return {
        ticker,
        modelType,
        confidence: warnings.length > 1 ? 'medium' : 'high',
        headline: {
          enterpriseValue: ev,
          equityValue: eq,
          pricePerShare: typeof pps === 'number' ? pps : undefined,
          upsidePct: null,
          downsidePct: null,
        },
        drivers: buildDrivers([
          { label: 'Revenue growth', value: assumptionsBlock.revenueGrowth?.[0] ?? assumptionsBlock.revenueGrowth, direction: 'positive' },
          { label: 'EBITDA margin', value: ebitdaMargin, direction: 'positive' },
          { label: 'WACC', value: wacc, direction: 'negative' },
          { label: 'Terminal growth', value: terminalGrowth, direction: 'positive' },
        ]),
        sparklines: buildSparklines([
          { label: 'Revenue', values: revenueSeries },
          { label: 'Free Cash Flow', values: fcfSeries },
        ]),
        assumptions: {
          revenueCagr: revenueCagr,
          ebitdaMargin,
          wacc,
          terminalGrowth,
        },
        aiInsight: insightFromWarnings(
          ticker,
          warnings,
          'Base DCF shows value driven by growth, margin, and discount rate; terminal value remains the largest contributor.'
        ),
        qualityWarnings: warnings,
      };
    }
    case 'three-statement': {
      const revenue = assumptions?.revenue || [];
      const cogsPct = assumptions?.cogsPct || [];
      const opexPct = assumptions?.opexPct || [];
      const daPct = assumptions?.daPct || [];
      const revenueCagr = calcCagr(revenue);
      const ebitdaMargin =
        typeof cogsPct[0] === 'number' && typeof opexPct[0] === 'number' ? 1 - cogsPct[0] - opexPct[0] : undefined;
      const margin =
        typeof cogsPct[0] === 'number' && typeof opexPct[0] === 'number' && typeof daPct[0] === 'number'
          ? 1 - cogsPct[0] - opexPct[0] - daPct[0]
          : undefined;

      return {
        ticker,
        modelType,
        confidence: warnings.length ? 'medium' : 'high',
        headline: {},
        drivers: buildDrivers([
          { label: 'Revenue growth', value: revenueCagr, direction: 'positive' },
          { label: 'Operating margin', value: margin, direction: 'positive' },
          { label: 'Capex % revenue', value: assumptions?.capexPctRevenue?.[0], direction: 'negative' },
        ]),
        sparklines: buildSparklines([{ label: 'Revenue', values: revenue }]),
        assumptions: {
          revenueCagr,
          ebitdaMargin,
          wacc: undefined,
          terminalGrowth: undefined,
        },
        aiInsight: insightFromWarnings(
          ticker,
          warnings,
          'Three-statement projection highlights the revenue and cost structure; cash flow quality depends on working capital and capex discipline.'
        ),
        qualityWarnings: warnings,
      };
    }
    case 'lbo': {
      if (!lboSummary) {
        warnings.push('LBO summary unavailable; showing placeholders.');
      }
      const projections = lboSummary?.projections || [];
      const revenue = projections.map(p => p.revenue);
      const fcf = projections.map(p => p.freeCashFlow);
      return {
        ticker,
        modelType,
        confidence: warnings.length ? 'medium' : 'high',
        headline: {
          enterpriseValue: toActualDollars(lboSummary?.sourcesAndUses?.uses?.purchasePrice),
          equityValue: toActualDollars(lboSummary?.returns?.exitEquityValue),
          pricePerShare: undefined,
          upsidePct: null,
          downsidePct: null,
        },
        drivers: buildDrivers([
          { label: 'Leverage', value: lboSummary?.inputs?.leverageMultiple ?? lboSummary?.inputs?.debtToEquity, direction: 'positive' },
          { label: 'Entry/Exit multiple', value: lboSummary?.inputs?.exitMultiple, direction: 'positive' },
          { label: 'EBITDA margin', value: lboSummary?.projections?.[0]?.ebitdaMargin, direction: 'positive' },
        ]),
        sparklines: buildSparklines([
          { label: 'Revenue', values: revenue },
          { label: 'Free Cash Flow', values: fcf },
        ]),
        assumptions: {
          revenueCagr: calcCagr(revenue),
          ebitdaMargin: lboSummary?.projections?.[0]?.ebitdaMargin,
          wacc: undefined,
          terminalGrowth: undefined,
        },
        aiInsight: insightFromWarnings(
          ticker,
          warnings,
          'LBO preview focuses on leverage, multiple expansion, and free cash flow through the hold period.'
        ),
        qualityWarnings: warnings,
      };
    }
    case 'comps': {
      if (!compsSummary) {
        warnings.push('Comps valuation missing; peers may not have loaded.');
      }
      const implied = compsSummary?.impliedValuation;
      const median = compsSummary?.medianMultiples;
      const peers = compsSummary?.peers || [];
      return {
        ticker,
        modelType,
        confidence: warnings.length ? 'medium' : 'high',
        headline: {
          enterpriseValue: toActualDollars(implied?.byEvEbitda),
          equityValue: toActualDollars(implied?.byEvRevenue),
          pricePerShare: undefined,
          upsidePct: null,
          downsidePct: null,
        },
        drivers: buildDrivers([
          { label: 'EV/EBITDA', value: median?.evToEbitda == null ? undefined : median.evToEbitda, direction: 'positive' },
          { label: 'EV/Revenue', value: median?.evToRevenue == null ? undefined : median.evToRevenue, direction: 'positive' },
          { label: 'P/E', value: median?.peRatio == null ? undefined : median.peRatio, direction: 'positive' },
        ]),
        sparklines: buildSparklines([
          {
            label: 'Peer Market Cap',
            values: peers
              .map((p) => p.marketCap)
              .filter((v): v is number => typeof v === 'number' && isFinite(v)),
          },
        ]),
        assumptions: {
          revenueCagr: undefined,
          ebitdaMargin: undefined,
          wacc: undefined,
          terminalGrowth: undefined,
        },
        aiInsight: insightFromWarnings(
          ticker,
          warnings,
          'Trading comps snapshot highlights median multiples and implied valuation ranges versus peers.'
        ),
        qualityWarnings: warnings,
      };
    }
    default:
      return null;
  }
}
