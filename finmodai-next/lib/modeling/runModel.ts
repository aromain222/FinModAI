import 'server-only';

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import { supabaseRouteClient } from '@/lib/supabase/server';
import { assertR2Env, checkR2Env, uploadXlsxToR2 } from '@/lib/r2';
import { createModelRun, updateModelRunFailed, updateModelRunSuccess } from '@/lib/modelRuns';
import { generatePreviewFromWorkbook } from '@/lib/generatePreview';
import { NormalizeInputsError, normalizeInputs, type ModelingModelType } from '@/lib/modeling/normalizeInputs';
import { validateLBO, validateComps, validateMerger } from '@/lib/modeling/validateAndRepair';
import type { CompsModel, CompanyFinancials } from '@/types/compsModel';
import { getModelData } from '@/lib/data/getModelData';
import { cleanTickerArray } from '@/lib/identifyPeers';

const LOCAL_EXPORT_DIR = '.local-model-exports';
const DEV_BYPASS_USER_ID = '00000000-0000-0000-0000-000000000000';

export type RunModelArgs = {
  modelType: ModelingModelType;
  ticker?: string;
  tickers?: string[];
  prompt?: string;
  assumptions?: Record<string, any>;
};

export type RunModelArtifact = {
  provider: 'r2' | 'local';
  key: string;
  downloadUrl: string;
};

export type RunModelMetrics = {
  runtimeMs: number;
  generatedAt: string;
  modelType: ModelingModelType;
  ticker: string;
  stages: Record<string, number>;
};

export type RunModelResult = {
  modelId: string;
  traceId: string;
  status: 'ready';
  artifact: RunModelArtifact;
  metrics: RunModelMetrics;
  preview?: unknown;
  results?: Record<string, any> | null;
  warnings?: string[];
};

export type RunModelContext = {
  baseUrl?: string;
};

export type RunModelErrorResponse = {
  error: string;
  details?: string;
  code: string;
  stage: string;
  step: string;
  traceId: string;
};

export class ModelRunError extends Error {
  code: string;
  stage: string;
  step: string;
  traceId: string;
  httpStatus: number;

  constructor(params: {
    code: string;
    message: string;
    traceId: string;
    stage: string;
    step: string;
    httpStatus?: number;
    cause?: unknown;
  }) {
    super(params.message, params.cause ? { cause: params.cause } : undefined);
    this.name = 'ModelRunError';
    this.code = params.code;
    this.stage = params.stage;
    this.step = params.step;
    this.traceId = params.traceId;
    this.httpStatus = params.httpStatus ?? 500;
  }

  toResponseBody(): RunModelErrorResponse {
    return {
      error: this.message,
      details: this.message,
      code: this.code,
      stage: this.stage,
      step: this.step,
      traceId: this.traceId,
    };
  }
}

type AnyRecord = Record<string, any>;

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTickerForKey(value: string): string {
  const trimmed = value.trim().toUpperCase();
  const sanitized = trimmed.replace(/[^A-Z0-9]+/gi, '');
  return sanitized.length > 0 ? sanitized : 'MODEL';
}

function resolveBaseUrl(ctx?: RunModelContext): string {
  const direct = ctx?.baseUrl;
  if (direct && /^https?:\/\//i.test(direct)) {
    return direct;
  }

  const envDirect = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (envDirect && /^https?:\/\//i.test(envDirect)) {
    return envDirect;
  }

  const vercel = process.env.VERCEL_URL;
  if (vercel && vercel.trim().length > 0) {
    const trimmed = vercel.trim();
    return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
  }

  return 'http://localhost:3000';
}

function extractModelId(rawAssumptions: unknown): string | null {
  if (!isRecord(rawAssumptions)) return null;
  const candidates = [
    rawAssumptions.modelId,
    rawAssumptions.model_id,
    rawAssumptions.id,
    rawAssumptions.model?.id,
    rawAssumptions.meta?.modelId,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed.length >= 32 && trimmed !== 'undefined') return trimmed;
    }
  }
  return null;
}

function extractScenario(rawAssumptions: AnyRecord): {
  scenario: string;
  scenario_adjustment_notes: string;
  scenario_summary_notes: string;
} {
  const scenarioRaw =
    (typeof rawAssumptions.scenario === 'string' ? rawAssumptions.scenario : null) ??
    (typeof rawAssumptions.assumptions?.scenario === 'string' ? rawAssumptions.assumptions.scenario : null) ??
    'BASE';
  const scenarioKey = scenarioRaw.trim().toUpperCase();
  const normalizedScenario =
    scenarioKey === 'BULL' || scenarioKey === 'BULLISH'
      ? 'BULLISH'
      : scenarioKey === 'BEAR' || scenarioKey === 'BEARISH'
      ? 'BEARISH'
      : 'BASE';

  const notesRaw =
    rawAssumptions.scenario_adjustment_notes ??
    rawAssumptions.scenarioAdjustmentNotes ??
    rawAssumptions.scenarioNotes ??
    rawAssumptions.assumptions?.scenario_adjustment_notes ??
    rawAssumptions.assumptions?.scenarioAdjustmentNotes ??
    '';
  const summaryNotesRaw =
    rawAssumptions.scenario_summary_notes ??
    rawAssumptions.scenarioSummaryNotes ??
    rawAssumptions.assumptions?.scenario_summary_notes ??
    '';

  return {
    scenario: normalizedScenario,
    scenario_adjustment_notes: typeof notesRaw === 'string' ? notesRaw : '',
    scenario_summary_notes: typeof summaryNotesRaw === 'string' ? summaryNotesRaw : '',
  };
}

type ModelPluginResult = {
  workbook: any;
  preview?: any;
  results?: Record<string, any>;
  appliedDefaults?: any[];
  warnings?: string[];
  blocks?: string[];
};

type ModelPlugin = {
  modelType: ModelingModelType;
  run(params: {
    traceId: string;
    modelId: string;
    normalized: ReturnType<typeof normalizeInputs>;
    assumptions: Record<string, any>;
  }): Promise<ModelPluginResult>;
};

async function runLboPlugin(params: {
  traceId: string;
  modelId: string;
  normalized: ReturnType<typeof normalizeInputs>;
  assumptions: Record<string, any>;
}): Promise<ModelPluginResult> {
  const ticker = params.normalized.primaryTicker;

  const { getSector } = await import('@/lib/sectorMapping');
  const { buildLboWorkbook } = await import('@/lib/lboEngine');

  const modelData = await getModelData({
    modelType: 'lbo',
    primaryTicker: ticker,
    traceId: params.traceId,
  });
  const ltm = modelData.financials[ticker];
  if (ltm) {
    normalizedFinancials = {
      revenueM: ltm.revenue,
      ebitdaM: ltm.ebitda,
      ebitM: ltm.ebit,
      fcfM: ltm.netIncome,
      netDebtM: ltm.netDebt,
      sharesOutstandingM: ltm.shares,
      marketCapM: ltm.marketCap,
    };
  } else {
    normalizedFinancials = null;
    console.warn('[runModel][lbo] Model data missing for ticker', { traceId: params.traceId, ticker });
  }

  const sliderOverrides =
    (isRecord(params.assumptions.sliderOverrides) ? params.assumptions.sliderOverrides : null) ??
    (isRecord((params.assumptions as any).lbo?.sliderOverrides) ? (params.assumptions as any).lbo.sliderOverrides : null) ??
    {};
  const lboOverrides =
    (isRecord(params.assumptions.lboOverrides) ? params.assumptions.lboOverrides : null) ??
    (isRecord((params.assumptions as any).lbo?.overrides) ? (params.assumptions as any).lbo.overrides : null) ??
    {};
  const advancedOptions =
    (isRecord(params.assumptions.lboAdvanced) ? params.assumptions.lboAdvanced : undefined) ??
    (isRecord((params.assumptions as any).lbo?.advanced) ? (params.assumptions as any).lbo.advanced : undefined);

  const revenueM = typeof normalizedFinancials?.revenueM === 'number' ? normalizedFinancials.revenueM : 0;
  const ebitdaM = typeof normalizedFinancials?.ebitdaM === 'number' ? normalizedFinancials.ebitdaM : 0;
  const baseMargin = revenueM > 0 ? Math.max(0, Math.min(1, ebitdaM / revenueM)) : 0.25;

  const revenueGrowth =
    typeof sliderOverrides.revenueGrowth === 'number'
      ? sliderOverrides.revenueGrowth
      : typeof params.assumptions.revenueGrowth === 'number'
      ? params.assumptions.revenueGrowth
      : 0.05;
  const ebitdaMargin =
    typeof sliderOverrides.ebitdaMargin === 'number'
      ? sliderOverrides.ebitdaMargin
      : typeof params.assumptions.ebitdaMargin === 'number'
      ? params.assumptions.ebitdaMargin
      : baseMargin;
  const capexPercent =
    typeof lboOverrides.capexPercent === 'number'
      ? lboOverrides.capexPercent
      : typeof params.assumptions.capexPercent === 'number'
      ? params.assumptions.capexPercent
      : 0.04;
  const daPercent =
    typeof lboOverrides.daPercent === 'number'
      ? lboOverrides.daPercent
      : typeof params.assumptions.daPercent === 'number'
      ? params.assumptions.daPercent
      : 0.04;
  const nwcPercent =
    typeof lboOverrides.nwcPercent === 'number'
      ? lboOverrides.nwcPercent
      : typeof params.assumptions.nwcPercent === 'number'
      ? params.assumptions.nwcPercent
      : 0.02;
  const taxRate =
    typeof sliderOverrides.taxRate === 'number'
      ? sliderOverrides.taxRate
      : typeof params.assumptions.taxRate === 'number'
      ? params.assumptions.taxRate
      : 0.21;
  const entryMultiple = typeof lboOverrides.entryMultiple === 'number' ? lboOverrides.entryMultiple : 10;
  const exitMultiple =
    typeof lboOverrides.exitMultiple === 'number' ? lboOverrides.exitMultiple : typeof entryMultiple === 'number' ? entryMultiple : 10;
  const leverageMultiple =
    typeof lboOverrides.leverageMultiple === 'number'
      ? lboOverrides.leverageMultiple
      : typeof params.assumptions.leverageMultiple === 'number'
      ? params.assumptions.leverageMultiple
      : 4.5;
  const transactionFeesPercent =
    typeof lboOverrides.transactionFeesPercent === 'number' ? lboOverrides.transactionFeesPercent : 0.02;
  const termLoanBRate = typeof lboOverrides.termLoanBRate === 'number' ? lboOverrides.termLoanBRate : 0.065;
  const revolverRate = typeof lboOverrides.revolverRate === 'number' ? lboOverrides.revolverRate : 0.05;

  const advancedMinCash = isRecord(advancedOptions) && typeof (advancedOptions as any).minimumCashAtClose === 'number'
    ? Math.max(0, (advancedOptions as any).minimumCashAtClose)
    : 0;
  const minimumCashBase =
    typeof lboOverrides.minimumCash === 'number'
      ? lboOverrides.minimumCash
      : typeof params.assumptions.minimumCash === 'number'
      ? params.assumptions.minimumCash
      : Math.max(0, Number(ltm?.cash ?? 50) || 50);
  const minimumCash = Math.max(minimumCashBase, advancedMinCash);

  const offerPremium =
    typeof lboOverrides.offerPremium === 'number'
      ? lboOverrides.offerPremium
      : typeof sliderOverrides.offerPremium === 'number'
      ? sliderOverrides.offerPremium
      : 0.3;

  const sector = getSector(ticker, typeof params.assumptions.companyName === 'string' ? params.assumptions.companyName : undefined);

  const excelOverrides: any = {
    currentStockPrice:
      typeof params.assumptions.currentPrice === 'number'
        ? params.assumptions.currentPrice
        : typeof ltm?.price === 'number'
        ? ltm.price
        : undefined,
    offerPremium,
    basicSharesOutstanding: normalizedFinancials?.sharesOutstandingM,
    inTheMoneyOptions: typeof params.assumptions.options === 'number' ? params.assumptions.options : undefined,
    cashOnBalance: minimumCash,
    fundCashBalance: minimumCash,
    refinanceDebt: Math.max(normalizedFinancials?.netDebtM ?? 0, 0),
    netDebt: normalizedFinancials?.netDebtM ?? undefined,
  } satisfies Partial<import('@/lib/lboGenerator').LBOInputs>;

  const { workbook, summary } = await buildLboWorkbook({
    ticker,
    companyName:
      typeof params.assumptions.companyName === 'string' && params.assumptions.companyName.trim().length > 0
        ? params.assumptions.companyName.trim()
        : ticker,
    sectorHint: sector,
    normalizedFinancials,
    sliderAssumptions: {
      revenueGrowth,
      ebitdaMargin,
      capexPercent,
      daPercent,
      nwcPercent,
      taxRate,
      entryMultiple,
      exitMultiple,
      leverageMultiple,
      transactionFeesPercent,
      offerPremium,
      forecastYears: 5,
      termLoanBRate,
      revolverRate,
      minimumCash,
    },
    excelOverrides,
    advancedOptions: advancedOptions as any,
  });

  const results: Record<string, any> = {
    lboSummary: summary,
    irr: summary.exit?.irr ?? null,
    moic: summary.exit?.moic ?? null,
    entryMultiple: summary.entryMultiple ?? null,
    exitMultiple: summary.exitMultiple ?? null,
    leverage: summary.entry?.leverageMultiple ?? null,
    revenueGrowth,
    ebitdaMargin,
    holdPeriod: 5,
  };

  const pluginWarnings: string[] = [];
  const lboValidation = validateLBO({ summary });
  results.modelChecks = lboValidation.checks;
  if (lboValidation.repaired) {
    pluginWarnings.push('LBO outputs were adjusted to enforce accounting ties.');
  }
  if (lboValidation.safeMode) {
    results.safeMode = true;
    pluginWarnings.push('Safe-mode LBO model provided due to repeated validation failures.');
  }

  return {
    workbook,
    preview: generatePreviewFromWorkbook(workbook, 'lbo'),
    results,
    warnings: pluginWarnings,
    blocks: [],
    appliedDefaults: [],
  };
}

async function runCompsPlugin(params: {
  traceId: string;
  modelId: string;
  normalized: ReturnType<typeof normalizeInputs>;
  assumptions: Record<string, any>;
}): Promise<ModelPluginResult> {
  const ticker = params.normalized.primaryTicker;

  const { buildCompsModel } = await import('@/lib/compsCalculator');
  const { generateCompsExcel } = await import('@/lib/compsExcelGenerator');

  const useOnlyCustom = Boolean(
    (params.assumptions as any)?.useOnlyCustom ??
      (params.assumptions as any)?.comps?.useOnlyCustom ??
      (params.assumptions as any)?.assumptions?.useOnlyCustom ??
      false
  );

  const explicitPeersRaw =
    (Array.isArray((params.assumptions as any).customComps) ? (params.assumptions as any).customComps : null) ??
    (Array.isArray((params.assumptions as any).tickers) ? (params.assumptions as any).tickers : null) ??
    params.normalized.tickers;

  const customComps = cleanTickerArray(
    (Array.isArray(explicitPeersRaw) ? explicitPeersRaw : [])
      .map((peer) => String(peer || '').trim().toUpperCase())
      .filter((peer) => peer && peer !== ticker)
  );

  const modelData = await getModelData({
    modelType: 'comps',
    primaryTicker: ticker,
    peerOptions: {
      customPeers: customComps,
      useOnlyCustom,
      allowAuto: !useOnlyCustom,
    },
    traceId: params.traceId,
  });

  const targetCompany = modelData.financials[ticker];
  if (!targetCompany) {
    throw new Error('Failed to fetch target company financials');
  }

  const peerTickers = modelData.peers?.list ?? [];
  const peerCompanies = peerTickers.map((peerTicker) => modelData.financials[peerTicker]).filter(Boolean);
  if (peerCompanies.length === 0) {
    throw new Error('No comparable companies found');
  }
  const peerDiagnostics = modelData.peers?.diagnostics ?? null;

  const compsModel = buildCompsModel(targetCompany, peerCompanies as CompanyFinancials[]);
  const workbook = await generateCompsExcel(ticker, compsModel as any);

  const implied = compsModel?.impliedValuation;
  const medianEvEbitda = compsModel?.stats?.evEbitda?.median;
  const medianPe = compsModel?.stats?.pe?.median;
  const impliedMedian = implied?.pricePerShareMedian;
  const impliedMean = implied?.pricePerShareMean;
  const impliedPriceLow =
    typeof impliedMedian === 'number' && typeof impliedMean === 'number'
      ? Math.min(impliedMedian, impliedMean)
      : typeof impliedMedian === 'number'
      ? impliedMedian
      : typeof impliedMean === 'number'
      ? impliedMean
      : null;
  const impliedPriceHigh =
    typeof impliedMedian === 'number' && typeof impliedMean === 'number'
      ? Math.max(impliedMedian, impliedMean)
      : typeof impliedMedian === 'number'
      ? impliedMedian
      : typeof impliedMean === 'number'
      ? impliedMean
      : null;

  const compsTable = Array.isArray(compsModel?.comps)
    ? compsModel.comps.map((c: any) => ({
        name: c.name,
        ticker: c.ticker,
        evRevenue: c.evToRevenue,
        evEbitda: c.evToEbitda,
        evEbit: c.evToEbit,
        pe: c.pe,
        price: c.price,
        source: c.source,
      }))
    : [];

  const results: Record<string, any> = {
    compsModel,
    compsTable,
    evEbitda: typeof medianEvEbitda === 'number' ? medianEvEbitda : null,
    pe: typeof medianPe === 'number' ? medianPe : null,
    impliedPriceLow,
    impliedPriceHigh,
    peerDiagnostics,
    peersUsed: modelData.resolvedTickers,
  };

  const pluginWarnings: string[] = [];
  const compsValidation = validateComps({ model: compsModel });
  results.modelChecks = compsValidation.checks;
  if (compsValidation.repaired) {
    pluginWarnings.push('Trading comparables cleaned to remove extreme outliers.');
  }
  if (compsValidation.safeMode) {
    results.safeMode = true;
    pluginWarnings.push('Safe-mode comps model used due to persistent outliers.');
  }

  return {
    workbook,
    preview: generatePreviewFromWorkbook(workbook, 'comps'),
    results,
    warnings: pluginWarnings,
    blocks: [],
    appliedDefaults: [],
  };
}

async function runMergerPlugin(params: {
  traceId: string;
  modelId: string;
  normalized: ReturnType<typeof normalizeInputs>;
  assumptions: Record<string, any>;
}): Promise<ModelPluginResult> {
  const { MergerModelInputSchema, getMissingMergerInputs } = await import('@/lib/models/merger/schema');
  const { computeMergerModel } = await import('@/lib/models/merger/compute');
  const { generateMergerReport } = await import('@/lib/models/merger/report');
  const { generateMergerWorkbook } = await import('@/lib/models/merger/excel');
  const { getCurrentUserSettings } = await import('@/lib/settings/store');
  const { applyDefaultsToModelInputs } = await import('@/lib/models/shared/applyDefaults');
  const { evaluateGuardrails } = await import('@/lib/models/shared/guardrails');

  let body: AnyRecord = params.assumptions;
  if (isRecord(body.mergerInputs)) {
    body = { ...body.mergerInputs, ...body };
  }

  // Ensure normalized buyer/target tickers are present on the schema payload.
  body.buyerTicker = params.normalized.merger?.acquirer ?? body.buyerTicker;
  body.targetTicker = params.normalized.merger?.target ?? body.targetTicker;

  const modelData = await getModelData({
    modelType: 'merger',
    primaryTicker: body.buyerTicker,
    tickers: [body.buyerTicker, body.targetTicker],
    traceId: params.traceId,
  });
  const buyerLTM = modelData.financials[body.buyerTicker];
  const targetLTM = modelData.financials[body.targetTicker];
  if (!buyerLTM || !targetLTM) {
    throw new ModelRunError({
      code: 'DATA_FETCH_FAILED',
      message: 'Unable to load merger company data',
      traceId: params.traceId,
      stage: 'fetch_data',
      step: 'load_financials',
      httpStatus: 500,
    });
  }

  const pulledData = {
    buyer: buyerLTM
      ? {
          price: buyerLTM.price,
          shares: buyerLTM.shares,
          cash: buyerLTM.cash,
          taxRate: undefined,
        }
      : undefined,
    target: targetLTM
      ? {
          price: targetLTM.price,
          shares: targetLTM.shares,
          cash: targetLTM.cash,
          debt: Math.max(0, (targetLTM.netDebt ?? 0) + (targetLTM.cash ?? 0)),
          taxRate: undefined,
        }
      : undefined,
  };

  const missing = getMissingMergerInputs(body, pulledData);
  if (missing.length > 0) {
    throw new ModelRunError({
      code: 'MISSING_REQUIRED_INPUTS',
      message: `Missing required inputs: ${missing.join(', ')}`,
      traceId: params.traceId,
      stage: 'validate',
      step: 'missing_required',
      httpStatus: 400,
    });
  }

  const parseResult = MergerModelInputSchema.safeParse(body);
  if (!parseResult.success) {
    throw new ModelRunError({
      code: 'INVALID_INPUT',
      message: 'Invalid merger inputs',
      traceId: params.traceId,
      stage: 'validate',
      step: 'schema',
      httpStatus: 400,
      cause: parseResult.error,
    });
  }

  const settings = await getCurrentUserSettings();
  const { effectiveInputs, appliedDefaults } = applyDefaultsToModelInputs('merger', parseResult.data, settings);

  const finalParseResult = MergerModelInputSchema.safeParse(effectiveInputs);
  if (!finalParseResult.success) {
    throw new ModelRunError({
      code: 'INVALID_INPUT_DEFAULTS',
      message: 'Invalid merger inputs after applying defaults',
      traceId: params.traceId,
      stage: 'validate',
      step: 'schema_defaults',
      httpStatus: 400,
      cause: finalParseResult.error,
    });
  }

  const input = finalParseResult.data;

  // Ensure we have both company LTM objects after validation (pull if missing).
  const convertToCompanyFinancials = (ltm: any, ticker: string): any => {
    const cogs =
      ltm.revenue && ltm.ebitda ? Math.max(0, ltm.revenue - ltm.ebitda - ltm.revenue * 0.15) : 0;
    const grossProfit = (ltm.revenue || 0) - cogs;
    const opex = ltm.revenue && ltm.ebitda ? Math.max(0, ltm.revenue - cogs - ltm.ebitda) : 0;
    const da = ltm.ebitda && ltm.ebit ? Math.max(0, ltm.ebitda - ltm.ebit) : 0;
    return {
      ticker,
      revenue: ltm.revenue || 0,
      cogs,
      grossProfit,
      opex,
      ebitda: ltm.ebitda || 0,
      ebit: ltm.ebit || 0,
      da,
      interestExpense: 0,
      netIncome: ltm.netIncome || 0,
      sharesOutstanding: ltm.shares || 0,
      cash: ltm.cash || 0,
      debt: Math.max(0, (ltm.netDebt ?? 0) + (ltm.cash ?? 0)),
      price: ltm.price || 0,
      taxRate: 0.21,
    };
  };

  const buyerFinancials = convertToCompanyFinancials(buyerLTM, input.buyerTicker);
  const targetFinancials = convertToCompanyFinancials(targetLTM, input.targetTicker);

  let output: any;
  try {
    output = computeMergerModel(input, buyerFinancials, targetFinancials);
  } catch (computeError: any) {
    throw new ModelRunError({
      code: 'COMPUTE_FAILED',
      message: computeError?.message || 'Merger model computation failed',
      traceId: params.traceId,
      stage: 'compute',
      step: 'compute',
      httpStatus: 400,
      cause: computeError,
    });
  }

  let report: any = null;
  try {
    if (output?.checks?.allInvariantsPassed && output?.checks?.sourcesUsesBalanced) {
      report = generateMergerReport(input, output, input.buyerTicker, input.targetTicker);
    }
  } catch (reportError) {
    console.warn('[runModel][merger] Report generation failed', {
      traceId: params.traceId,
      error: reportError instanceof Error ? reportError.message : String(reportError),
    });
    report = null;
  }

  const guardrailResult = evaluateGuardrails('merger', output, settings);
  if (guardrailResult.blocks.length > 0) {
    throw new ModelRunError({
      code: 'GUARDRAIL_BLOCKED',
      message: 'Model outputs violate guardrails',
      traceId: params.traceId,
      stage: 'guardrails',
      step: 'evaluate',
      httpStatus: 400,
      cause: guardrailResult.blocks,
    });
  }

  const workbook = await generateMergerWorkbook(input, output, buyerFinancials, targetFinancials);

  const preview = {
    sheetName: 'Combined IS',
    columns: ['Line Item', ...Array.from({ length: input.forecastYears }, (_, i) => `Year ${i + 1}`)],
    rows: [
      ['Revenue', ...(output.combinedIS || []).map((row: any) => Number(row?.revenue?.total ?? 0).toFixed(0))],
      ['EBITDA', ...(output.combinedIS || []).map((row: any) => Number(row?.ebitda ?? 0).toFixed(0))],
      ['Net Income', ...(output.combinedIS || []).map((row: any) => Number(row?.netIncome ?? 0).toFixed(0))],
    ],
  };

  const results: Record<string, any> = {
    mergerInputs: input,
    mergerOutput: output,
    mergerReport: report,
    appliedDefaults,
    warnings: guardrailResult.warnings,
    preview,
    tickerPair: `${input.buyerTicker}/${input.targetTicker}`,
  };

  const pluginWarnings = [...(guardrailResult.warnings ?? [])];
  const mergerValidation = validateMerger({ output });
  results.modelChecks = mergerValidation.checks;
  if (mergerValidation.repaired) {
    pluginWarnings.push('Merger sources & uses were rebalanced to meet invariants.');
  }
  if (mergerValidation.safeMode) {
    results.safeMode = true;
    pluginWarnings.push('Safe-mode merger model provided due to validation failure.');
  }

  return {
    workbook,
    preview,
    results,
    appliedDefaults,
    warnings: pluginWarnings,
    blocks: [],
  };
}

const PLUGINS: Record<ModelingModelType, ModelPlugin> = {
  lbo: {
    modelType: 'lbo',
    run: runLboPlugin,
  },
  comps: {
    modelType: 'comps',
    run: runCompsPlugin,
  },
  merger: {
    modelType: 'merger',
    run: runMergerPlugin,
  },
};

export async function runModel(args: RunModelArgs, ctx?: RunModelContext): Promise<RunModelResult> {
  const traceId = randomUUID();
  const startedAt = Date.now();
  const stages: Record<string, number> = {};
  const stageStart = (name: string) => {
    stages[name] = Date.now();
  };
  const stageEnd = (name: string) => {
    const start = stages[name];
    if (typeof start === 'number') {
      stages[name] = Math.max(0, Date.now() - start);
    }
  };

  let runId: string | null = null;
  let modelId: string | null = null;
  let userId: string | null = null;
  let normalized: ReturnType<typeof normalizeInputs> | null = null;
  let effectiveAssumptions: Record<string, any> = {};

  try {
    stageStart('normalize');
    const rawAssumptions = isRecord(args.assumptions) ? args.assumptions : {};
    const raw = {
      ...rawAssumptions,
      ticker: args.ticker ?? rawAssumptions.ticker,
      tickers: args.tickers ?? rawAssumptions.tickers,
      prompt: args.prompt ?? rawAssumptions.prompt,
      modelType: args.modelType,
      model_type: args.modelType,
    };

    try {
      normalized = normalizeInputs(args.modelType, raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to normalize inputs';
      const code = error instanceof NormalizeInputsError ? error.code : 'INPUT_NORMALIZATION_FAILED';
      throw new ModelRunError({
        code,
        message,
        traceId,
        stage: 'normalize',
        step: 'normalize_inputs',
        httpStatus: 400,
        cause: error,
      });
    }

    // Normalized, unified assumptions schema:
    // - preserve user-provided top-level fields (sliderOverrides, lboOverrides, mergerInputs, etc.)
    // - enforce canonical ticker/tickers/company fields from normalizeInputs()
    effectiveAssumptions = {
      ...rawAssumptions,
      ...normalized.assumptions,
      modelType: normalized.modelType,
      ticker: normalized.primaryTicker,
      tickers: normalized.tickers,
      ...(normalized.merger ? { merger: normalized.merger } : {}),
      ...(args.prompt ? { prompt: args.prompt } : {}),
    };
    modelId = extractModelId(rawAssumptions) ?? null;
    stageEnd('normalize');

    stageStart('auth_db');
    const supabase = (() => {
      try {
        return supabaseRouteClient();
      } catch {
        return null;
      }
    })();

    const devBypass =
      process.env.NODE_ENV !== 'production' &&
      (process.env.BYPASS_AUTH === '1' || process.env.DEMO_BYPASS_AUTH === '1' || process.env.DEMO_MODE === '1');

    if (supabase) {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (!devBypass && (sessionError || !session?.user?.id)) {
        throw new ModelRunError({
          code: 'UNAUTHORIZED',
          message: sessionError?.message || 'Authentication required',
          traceId,
          stage: 'auth',
          step: 'get_session',
          httpStatus: 401,
          cause: sessionError,
        });
      }

      userId = devBypass ? DEV_BYPASS_USER_ID : session?.user?.id ?? null;

      // Ensure model record exists (create if missing)
      if (modelId) {
        const { data: existing, error: fetchError } = await supabase
          .from('models')
          .select('id, user_id, status, ticker, model_type, scenario, scenario_adjustment_notes, scenario_summary_notes')
          .eq('id', modelId)
          .eq('user_id', userId)
          .maybeSingle();

        if (fetchError) {
          throw new ModelRunError({
            code: 'DATABASE_ERROR',
            message: fetchError.message,
            traceId,
            stage: 'db',
            step: 'lookup_model',
            httpStatus: 500,
            cause: fetchError,
          });
        }
        if (!existing) {
          throw new ModelRunError({
            code: 'MODEL_NOT_FOUND',
            message: 'Model record does not exist. Call /api/models/create first.',
            traceId,
            stage: 'db',
            step: 'lookup_model',
            httpStatus: 404,
          });
        }

        await supabase
          .from('models')
          .update({ status: 'generating', updated_at: new Date().toISOString() })
          .eq('id', modelId)
          .eq('user_id', userId);
      } else {
        const baseScenario = extractScenario(rawAssumptions);
        const companyName =
          typeof rawAssumptions.company_name === 'string'
            ? rawAssumptions.company_name
            : typeof rawAssumptions.companyName === 'string'
            ? rawAssumptions.companyName
            : null;
        const units = {
          currency: 'USD',
          scale: 'MILLIONS',
          shares: 'MILLIONS',
          rates: 'DECIMAL',
        };
        const insertPayload: Record<string, any> = {
          user_id: userId,
          model_type: normalized.modelType,
          type: normalized.modelType,
          ticker: normalized.primaryTicker,
          status: 'generating',
          scenario: baseScenario.scenario,
          scenario_adjustment_notes: baseScenario.scenario_adjustment_notes,
          scenario_summary_notes: baseScenario.scenario_summary_notes,
          company_name: companyName,
          assumptions: effectiveAssumptions,
          units,
        };
        const { data: created, error: insertError } = await supabase
          .from('models')
          .insert(insertPayload)
          .select('id')
          .single();

        if (insertError || !created?.id) {
          throw new ModelRunError({
            code: 'MODEL_CREATE_FAILED',
            message: insertError?.message || 'Failed to create model record',
            traceId,
            stage: 'db',
            step: 'insert_model',
            httpStatus: 500,
            cause: insertError,
          });
        }

        modelId = created.id;
      }
    } else if (!modelId) {
      modelId = randomUUID();
    }
    stageEnd('auth_db');

    if (!modelId || !normalized) {
      throw new ModelRunError({
        code: 'INTERNAL_STATE_ERROR',
        message: 'runModel internal state missing (modelId/normalized)',
        traceId,
        stage: 'internal',
        step: 'preflight',
      });
    }

    stageStart('run_record');
    try {
      runId = await createModelRun({
        ticker: normalized.primaryTicker,
        modelType: normalized.modelType,
        modelId,
        traceId,
      });
    } catch (error) {
      console.warn('[runModel] Failed to create run record', {
        traceId,
        modelId,
        error: error instanceof Error ? error.message : String(error),
      });
      runId = null;
    }
    stageEnd('run_record');

    stageStart('generate');
    const plugin = PLUGINS[normalized.modelType];
    if (!plugin) {
      throw new ModelRunError({
        code: 'UNSUPPORTED_MODEL_TYPE',
        message: `Unsupported modelType: ${normalized.modelType}`,
        traceId,
        stage: 'generate',
        step: 'select_plugin',
        httpStatus: 400,
      });
    }

    const pluginResult = await plugin.run({
      traceId,
      modelId,
      normalized,
      assumptions: effectiveAssumptions,
    });
    stageEnd('generate');

    stageStart('serialize');
    const workbook = pluginResult.workbook;
    const bufferRaw = await workbook.xlsx.writeBuffer();
    const workbookBuffer = Buffer.isBuffer(bufferRaw) ? bufferRaw : Buffer.from(bufferRaw);
    if (workbookBuffer.length < 4 || workbookBuffer[0] !== 0x50 || workbookBuffer[1] !== 0x4b) {
      throw new ModelRunError({
        code: 'INVALID_WORKBOOK',
        message: 'Generated workbook buffer is not a valid XLSX file (missing PK signature)',
        traceId,
        stage: 'serialize',
        step: 'xlsx_buffer',
      });
    }
    stageEnd('serialize');

    stageStart('storage');
    const baseUrl = resolveBaseUrl(ctx);
    const safeTicker = normalizeTickerForKey(normalized.primaryTicker);
    const filename = `${normalized.primaryTicker}-${normalized.modelType}.xlsx`;
    const r2Key = `models/${modelId}/${safeTicker}-${normalized.modelType}.xlsx`;

    const missingR2Env = checkR2Env();
    const canUseLocalExport = process.env.NODE_ENV !== 'production';

    let artifact: RunModelArtifact;
    let localPath: string | null = null;

    if (missingR2Env.length > 0) {
      if (!canUseLocalExport) {
        throw new ModelRunError({
          code: 'R2_ENV_MISSING',
          message: `Cloud storage not configured (missing: ${missingR2Env.join(', ')})`,
          traceId,
          stage: 'storage',
          step: 'check_env',
          httpStatus: 500,
        });
      }

      const localDir = path.resolve(process.cwd(), LOCAL_EXPORT_DIR, modelId);
      await mkdir(localDir, { recursive: true });
      localPath = path.join(localDir, filename);
      await writeFile(localPath, workbookBuffer);
      const downloadUrl = new URL(`/api/models/${encodeURIComponent(modelId)}/download-local`, baseUrl).toString();
      artifact = { provider: 'local', key: localPath, downloadUrl };
    } else {
      assertR2Env();
      const signedUrl = await uploadXlsxToR2({ key: r2Key, buffer: workbookBuffer, filename });
      artifact = { provider: 'r2', key: r2Key, downloadUrl: signedUrl };
    }
    stageEnd('storage');

    stageStart('db_update');
    // Reuse supabase client from auth_db stage if available, otherwise create new one
    let dbSupabase = supabase;
    if (!dbSupabase) {
      try {
        dbSupabase = supabaseRouteClient();
      } catch {
        dbSupabase = null;
      }
    }
    if (dbSupabase && userId) {
      const baseScenario = extractScenario(isRecord(args.assumptions) ? args.assumptions : {});
      const preview =
        pluginResult.preview !== undefined ? pluginResult.preview : generatePreviewFromWorkbook(workbook, normalized.modelType);
      const sheets =
        workbook?.worksheets && Array.isArray(workbook.worksheets)
          ? workbook.worksheets.map((sheet: any) => sheet?.name).filter(Boolean)
          : [];

      const resultsPayload: Record<string, any> = {
        ...(isRecord(pluginResult.results) ? pluginResult.results : {}),
        modelType: normalized.modelType,
        ticker: normalized.primaryTicker,
        tickers: normalized.tickers,
        export_mode: artifact.provider,
        filename,
        sheets,
        upload: {
          provider: artifact.provider,
          key: artifact.key,
        },
        ...(artifact.provider === 'local'
          ? { download_url: artifact.downloadUrl, local_path: localPath ?? undefined }
          : { r2_key: artifact.key }),
        appliedDefaults: pluginResult.appliedDefaults ?? [],
        warnings: pluginResult.warnings ?? [],
      };

      await dbSupabase
        .from('models')
        .update({
          r2_key: artifact.provider === 'r2' ? artifact.key : null,
          file_name: filename,
          status: 'ready',
          results: resultsPayload,
          preview,
          assumptions: effectiveAssumptions,
          scenario: baseScenario.scenario,
          scenario_adjustment_notes: baseScenario.scenario_adjustment_notes,
          scenario_summary_notes: baseScenario.scenario_summary_notes,
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', modelId)
        .eq('user_id', userId);
    }
    stageEnd('db_update');

    stageStart('run_record_finish');
    const runtimeMs = Math.max(0, Date.now() - startedAt);
    await updateModelRunSuccess({ runId, runtimeMs });
    stageEnd('run_record_finish');

    const metrics: RunModelMetrics = {
      runtimeMs,
      generatedAt: new Date().toISOString(),
      modelType: normalized.modelType,
      ticker: normalized.primaryTicker,
      stages,
    };

    return {
      modelId,
      traceId,
      status: 'ready',
      artifact,
      metrics,
    };
  } catch (error: any) {
    const runtimeMs = Math.max(0, Date.now() - startedAt);
    try {
      await updateModelRunFailed({ runId, errorMessage: error?.message || 'Model run failed' });
    } catch {}

    // Best-effort model status update.
    try {
      const errorSupabase = supabaseRouteClient();
      const devBypass =
        process.env.NODE_ENV !== 'production' &&
        (process.env.BYPASS_AUTH === '1' || process.env.DEMO_BYPASS_AUTH === '1' || process.env.DEMO_MODE === '1');
      if (!userId && devBypass) {
        userId = DEV_BYPASS_USER_ID;
      }
      if (errorSupabase && userId && modelId) {
        await errorSupabase
          .from('models')
          .update({
            status: 'failed',
            error: error?.message || 'Model generation failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', modelId)
          .eq('user_id', userId);
      }
    } catch {}

    if (error instanceof ModelRunError) {
      throw error;
    }

    const step = typeof error?.step === 'string' && error.step.trim().length > 0 ? error.step.trim() : 'unknown';
    throw new ModelRunError({
      code: 'MODEL_RUN_FAILED',
      message: error?.message || 'Model run failed',
      traceId,
      stage: normalized ? 'generate' : 'unknown',
      step,
      httpStatus: 500,
      cause: error,
    });
  }
}
