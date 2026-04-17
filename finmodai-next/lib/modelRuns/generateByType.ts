import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createRun, findRunByHash, updateRun } from '@/lib/modelRunStore';
import { isObjectStoreConfigured, objectExists, uploadBufferAndSign } from '@/lib/storage/objectStore';
import { POST as generateModelPost } from '@/app/api/generateModel/route';
import { isDemoMode, isDemoModeFromRequest } from '@/lib/demo/isDemoMode';
import { runWithDemoMode } from '@/lib/demo/demoContext';
import { isDemoOrQualityTickerAvailable } from '@/lib/data/providers/demoProvider';
import { fromManual, fromTicker, manualPayloadFromRequest } from '@/lib/modelInputs/adapters';
import type { ModelInputs } from '@/types/modelInputs';
import { normalizeModelInputs } from '@/lib/modelInputs/defensive';
import { runModel } from '@/src/core/engine/runModel';
import { buildExcelFromModelOutputs } from '@/src/core/export/excel';
import { compareScenarios } from '@/src/core/engine/compare';
import type { Scenario } from '@/src/core/engine/scenario';
import { runSensitivity } from '@/src/core/engine/sensitivity';
import { buildDocumentFromPreview } from '@/lib/models/schema/fromPreview';
import { buildRequiredInputState } from '@/lib/models/shared/requiredInputs';
import {
  extractCatalogRefreshValues,
  refreshCatalogCompanyProfile,
  type DataRefreshStatus,
} from '@/lib/models/shared/catalogRefresh';

type GeneratedPayload = {
  preview?: unknown;
  modelDocument?: unknown;
  dcfSummary?: unknown;
  lboSummary?: unknown;
  debtCapacityLite?: unknown;
  scorecardSummary?: unknown;
  assumptions?: unknown;
  diagnostics?: unknown;
  warnings?: unknown;
  appliedDefaults?: unknown;
  coreModelOutputs?: unknown;
  coreInputs?: unknown;
  liveDataFallback?: boolean;
  scenarioComparison?: unknown;
  scenarioSummaries?: unknown;
  macroContext?: string;
  macroAssumptions?: unknown;
  macroAssumptionContext?: unknown;
  catalystContext?: string;
  companyCatalystContext?: unknown;
  dataRefreshStatus?: DataRefreshStatus;
};

const SUPPORTED_MODEL_TYPES = new Set([
  'dcf',
  'reverse-dcf',
  'debt-capacity-lite',
  'three-statement',
  'lbo',
  'comps',
  'football-field',
  'precedents',
  'merger',
  'scorecard',
]);

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`);
  return `{${entries.join(',')}}`;
}

function hashInputs(payload: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function parseDataUriToBuffer(dataUri: string): Buffer {
  const base64Part = dataUri.split(',')[1] || '';
  return Buffer.from(base64Part, 'base64');
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  stage: 'validate' | 'generate' | 'upload' | 'unknown'
) {
  return NextResponse.json(
    {
      ok: false,
      code,
      message,
      stage,
      status: 'failed',
      state: 'failed',
    },
    { status }
  );
}

function buildAssumptionsRequiredPayload(
  modelType: string,
  missingInputs: string[],
  message: string,
  dataRefreshStatus: DataRefreshStatus = 'cached',
  warnings: string[] = []
) {
  const requirementState = buildRequiredInputState(modelType, missingInputs, message);
  return {
    status: 'assumptions_required' as const,
    state: 'assumptions_required' as const,
    missingInputs: requirementState.missing,
    requiredInputs: requirementState.requiredInputs,
    isComputable: requirementState.isComputable,
    exportEligibility: requirementState.exportEligibility,
    dataRefreshStatus,
    warnings,
    message,
  };
}

function isPrivateManualMode(body: any): boolean {
  if (!body || typeof body !== 'object') return false;
  const requestedDataSource = String(body.dataSource || body.source || '').toLowerCase();
  if (requestedDataSource === 'manual') return true;
  const companyMode = String(body.companyMode || body.mode || '').toLowerCase();
  if (companyMode === 'private') return true;
  if (body.manualMode === true) return true;
  const manualInputs = body.manualInputs;
  if (manualInputs && typeof manualInputs === 'object') {
    const hasRevenue =
      typeof manualInputs.revenue === 'number' &&
      Number.isFinite(manualInputs.revenue) &&
      manualInputs.revenue > 0;
    const hasCompanyName = typeof body.companyName === 'string' && body.companyName.trim().length > 0;
    return hasRevenue || hasCompanyName;
  }
  return false;
}

function buildCorePreview(inputs: any, outputs: any) {
  const latestRevenue =
    Array.isArray(inputs?.historicals?.revenue) && inputs.historicals.revenue.length > 0
      ? inputs.historicals.revenue[inputs.historicals.revenue.length - 1]
      : null;
  const baseGrowth =
    Array.isArray(inputs?.assumptions?.growthSeries) && inputs.assumptions.growthSeries.length > 0
      ? normalizeRatioLike(inputs.assumptions.growthSeries[0], 0.08)
      : normalizeRatioLike(inputs?.assumptions?.growth, 0.08);
  const baseMargin = normalizeRatioLike(inputs?.assumptions?.margin, 0.2);
  const wacc = normalizeRatioLike((outputs?.audit?.assumptionsUsed as any)?.wacc, 0.1);
  const terminalGrowth = normalizeRatioLike((outputs?.audit?.assumptionsUsed as any)?.terminalGrowth, 0.025);
  return {
    sheetName: 'DCF Summary',
    columns: ['Metric', 'Value', 'Context'],
    rows: [
      ['Revenue (LTM)', latestRevenue, 'Current revenue anchor used for the forecast'],
      ['Base Revenue Growth', baseGrowth, 'Year 1 growth assumption'],
      ['Base EBITDA Margin', baseMargin, 'Operating profitability assumption'],
      ['WACC', wacc, 'Discount rate applied to projected cash flows'],
      ['Terminal Growth', terminalGrowth, 'Long-run growth used in terminal value'],
      ['Enterprise Value', outputs?.summary?.enterpriseValue ?? null, 'DCF enterprise value output'],
      ['Equity Value', outputs?.summary?.equityValue ?? null, 'Enterprise value less net debt'],
      ['Implied Share Price', outputs?.summary?.impliedSharePrice ?? null, 'Base case value per share'],
    ],
  };
}

function buildFootballFieldPreview(inputs: {
  companyName: string;
  netDebt: number | null;
  sharesOutstanding: number | null;
  ranges: Array<{
    label: string;
    lowValue: number | null;
    midValue: number | null;
    highValue: number | null;
  }>;
}) {
  const toPrice = (enterpriseValue: number | null) => {
    if (enterpriseValue === null) return null;
    if (inputs.sharesOutstanding === null || inputs.sharesOutstanding <= 0) return null;
    return (enterpriseValue - (inputs.netDebt ?? 0)) / inputs.sharesOutstanding;
  };

  return {
    sheetName: 'Football Field',
    columns: ['Method', 'Low EV', 'Mid EV', 'High EV', 'Low Price', 'Mid Price', 'High Price'],
    rows: inputs.ranges.map((range) => [
      range.label,
      range.lowValue,
      range.midValue,
      range.highValue,
      toPrice(range.lowValue),
      toPrice(range.midValue),
      toPrice(range.highValue),
    ]),
  };
}

function buildPrecedentsPreview(inputs: {
  companyName: string;
  subjectRevenue: number | null;
  subjectEbitda: number | null;
  revenueMultiple: number;
  ebitdaMultiple: number;
  transactions: Array<{
    transaction: string;
    announcementYear: number;
    revenueMultiple: number;
    ebitdaMultiple: number;
    premium: number;
  }>;
}) {
  const impliedRevenueEv =
    inputs.subjectRevenue !== null ? inputs.subjectRevenue * inputs.revenueMultiple : null;
  const impliedEbitdaEv =
    inputs.subjectEbitda !== null ? inputs.subjectEbitda * inputs.ebitdaMultiple : null;

  return {
    sheetName: 'Precedent Summary',
    columns: ['Metric', 'Value', 'Context'],
    rows: [
      ['Subject', inputs.companyName, `${inputs.transactions.length} transactions selected`],
      ['Subject Revenue', inputs.subjectRevenue, 'Revenue anchor used for EV / Revenue framing'],
      ['Subject EBITDA', inputs.subjectEbitda, 'EBITDA anchor used for EV / EBITDA framing'],
      ['Median EV / Revenue', inputs.revenueMultiple, 'Median precedent revenue multiple'],
      ['Median EV / EBITDA', inputs.ebitdaMultiple, 'Median precedent EBITDA multiple'],
      ['Implied EV (Revenue)', impliedRevenueEv, 'Revenue-based control value read-through'],
      ['Implied EV (EBITDA)', impliedEbitdaEv, 'EBITDA-based control value read-through'],
      [],
      ['Recent Transaction', 'Year', 'Premium'],
      ...inputs.transactions.slice(0, 5).map((item) => [item.transaction, item.announcementYear, item.premium]),
    ],
  };
}

function buildMergerPreview(summary: {
  acquirerTicker: string;
  targetTicker: string;
  dealValue: number;
  consideration: { cash: number; stock: number; debt: number };
  proForma: { revenue: number; ebitda: number; eps: number };
  standalone: { acquirer: { eps: number } };
  accretionDilution: { epsAccretion: number; epsAccretionPct: number };
}) {
  return {
    sheetName: 'Merger Summary',
    columns: ['Metric', 'Value', 'Context'],
    rows: [
      ['Transaction', `${summary.acquirerTicker} / ${summary.targetTicker}`, 'Acquirer and target'],
      ['Deal Value', summary.dealValue, 'Total consideration value'],
      ['Cash Consideration', summary.consideration.cash, 'Cash-funded portion'],
      ['Stock Consideration', summary.consideration.stock, 'Stock-funded portion'],
      ['Debt Consideration', summary.consideration.debt, 'Debt-funded portion'],
      ['Standalone EPS', summary.standalone.acquirer.eps, 'Acquirer standalone EPS'],
      ['Pro Forma Revenue', summary.proForma.revenue, 'Combined topline after year-one adjustments'],
      ['Pro Forma EBITDA', summary.proForma.ebitda, 'Combined EBITDA after year-one adjustments'],
      ['Pro Forma EPS', summary.proForma.eps, 'Combined earnings per share'],
      ['EPS Accretion / Dilution', summary.accretionDilution.epsAccretionPct, 'Positive = accretive'],
    ],
  };
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeRatioLike(value: unknown, fallback: number): number {
  const base = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.abs(base) > 1 ? base / 100 : base;
}

function mapCoreInputsToBankerDcfInputs(
  coreInputs: {
    company: { name: string; currency: string; ticker?: string };
    historicals: { revenue?: number[] };
    assumptions: {
      growth?: number | number[];
      growthSeries?: number[];
      margin?: number | number[];
      taxRate?: number;
      capexPctRevenue?: number;
      nwcPctRevenue?: number;
      daPctRevenue?: number;
    };
    capitalStructure?: { netDebt?: number; sharesOutstanding?: number };
    pricingAnchor?: { marketCap?: number; sharePrice?: number; sharesOutstanding?: number };
  },
  coreOutputs: any
) {
  const latestRevenue =
    Array.isArray(coreInputs.historicals?.revenue) && coreInputs.historicals.revenue.length > 0
      ? coreInputs.historicals.revenue[coreInputs.historicals.revenue.length - 1]
      : 1000;
  const growthSeries =
    Array.isArray(coreInputs.assumptions?.growthSeries) && coreInputs.assumptions.growthSeries.length > 0
      ? coreInputs.assumptions.growthSeries.map((value) => normalizeRatioLike(value, 0.08))
      : [normalizeRatioLike(coreInputs.assumptions?.growth, 0.08)];
  const ebitMargin = normalizeRatioLike(coreInputs.assumptions?.margin, 0.2);
  const daPctRevenue = normalizeRatioLike(coreInputs.assumptions?.daPctRevenue, 0.04);
  const wacc = normalizeRatioLike((coreOutputs?.audit?.assumptionsUsed as any)?.wacc, 0.1);
  const terminalGrowth = normalizeRatioLike((coreOutputs?.audit?.assumptionsUsed as any)?.terminalGrowth, 0.025);

  return {
    ticker: coreInputs.company?.ticker || 'DCF',
    companyName: coreInputs.company?.name || coreInputs.company?.ticker || 'Company',
    revenue: latestRevenue,
    revenueGrowth: growthSeries,
    ebitMargin,
    ebitdaMargin: ebitMargin + daPctRevenue,
    taxRate: normalizeRatioLike(coreInputs.assumptions?.taxRate, 0.25),
    depreciationPctRevenue: daPctRevenue,
    capexPctRevenue: normalizeRatioLike(coreInputs.assumptions?.capexPctRevenue, 0.04),
    nwcPctRevenue: normalizeRatioLike(coreInputs.assumptions?.nwcPctRevenue, 0.02),
    wacc,
    terminalGrowth,
    projectionYears: growthSeries.length > 0 ? growthSeries.length : 5,
    netDebt: toFiniteNumber(coreInputs.capitalStructure?.netDebt),
    sharesOutstanding:
      toFiniteNumber(coreInputs.capitalStructure?.sharesOutstanding) ??
      toFiniteNumber(coreInputs.pricingAnchor?.sharesOutstanding),
    marketCap: toFiniteNumber(coreInputs.pricingAnchor?.marketCap) ?? undefined,
    marketPrice: toFiniteNumber(coreInputs.pricingAnchor?.sharePrice) ?? undefined,
    price: toFiniteNumber(coreInputs.pricingAnchor?.sharePrice) ?? undefined,
    sharePrice: toFiniteNumber(coreInputs.pricingAnchor?.sharePrice) ?? undefined,
    currency: coreInputs.company?.currency || 'USD',
  };
}

const asFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
};

const toDecimalPercent = (value: unknown): number | undefined => {
  const numeric = asFiniteNumber(value);
  if (numeric === undefined) return undefined;
  return Math.abs(numeric) > 1 ? numeric / 100 : numeric;
};

const buildScenarioOverride = (raw: any): Scenario['assumptionsOverride'] => {
  if (!raw || typeof raw !== 'object') return undefined;
  const mapped: Record<string, number> = {};

  const growth = toDecimalPercent(raw?.revenueGrowthPct);
  const margins = toDecimalPercent(raw?.ebitdaMarginPct);
  const daPct = toDecimalPercent(raw?.daPctRevenuePct);
  const wacc = toDecimalPercent(raw?.waccPct);
  const terminalGrowth = toDecimalPercent(raw?.terminalGrowthPct);
  const nwcPct = toDecimalPercent(raw?.deltaNwcPct);
  const capexPct = toDecimalPercent(raw?.capexPctRevenuePct);
  const taxRate = toDecimalPercent(raw?.taxRatePct);

  if (growth !== undefined) mapped.growth = growth;
  if (margins !== undefined) mapped.margins = margins;
  if (daPct !== undefined) mapped.daPct = daPct;
  if (wacc !== undefined) mapped.wacc = wacc;
  if (terminalGrowth !== undefined) mapped.terminalGrowth = terminalGrowth;
  if (nwcPct !== undefined) mapped.nwcPct = nwcPct;
  if (capexPct !== undefined) mapped.capexPct = capexPct;
  if (taxRate !== undefined) mapped.taxRate = taxRate;

  return Object.keys(mapped).length > 0 ? mapped : undefined;
};

const buildCenteredRange = (
  base: number,
  range: number,
  step: number,
  min: number,
  max: number
): number[] => {
  const safeRange = Math.max(0, range);
  const safeStep = Math.max(step, 0.0001);
  const start = Math.max(min, base - safeRange);
  const end = Math.min(max, base + safeRange);
  const values: number[] = [];
  for (let current = start; current <= end + 1e-9; current += safeStep) {
    values.push(Number(current.toFixed(6)));
    if (values.length > 101) break;
  }
  if (values.length === 0) {
    values.push(Number(base.toFixed(6)));
  }
  if (!values.includes(Number(base.toFixed(6)))) {
    values.push(Number(base.toFixed(6)));
    values.sort((a, b) => a - b);
  }
  return values;
};

export async function generateRunForModelType({
  req,
  modelTypeRaw,
  body,
}: {
  req: NextRequest;
  modelTypeRaw: string;
  body: any;
}) {
  const demoEnabled = isDemoModeFromRequest(req) || isDemoMode();
  if (!demoEnabled) {
    return errorResponse(400, 'demo_mode_required', 'Demo mode is required for model generation.', 'validate');
  }

  return runWithDemoMode(true, async () => {
    try {
  const modelType = String(modelTypeRaw || '').toLowerCase();
  if (!SUPPORTED_MODEL_TYPES.has(modelType)) {
    return errorResponse(400, 'unsupported_model_type', `Unsupported model type: ${modelType}`, 'validate');
  }

  const isPrivateMode = isPrivateManualMode(body);
  const privateCompanyName =
    typeof body?.companyName === 'string' ? body.companyName.trim() : '';
  const privateTickerFallback = privateCompanyName
    ? privateCompanyName.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'PRIVATE'
    : 'PRIVATE';
  const ticker = String(body?.ticker || (isPrivateMode ? privateTickerFallback : '')).trim().toUpperCase();
  const mergerInputsRaw = body?.mergerInputs && typeof body.mergerInputs === 'object' ? body.mergerInputs : body;
  const mergerRunTicker =
    modelType === 'merger'
      ? [mergerInputsRaw?.acquirerTicker, mergerInputsRaw?.targetTicker]
          .filter((value) => typeof value === 'string' && value.trim().length > 0)
          .map((value) => String(value).trim().toUpperCase())
          .join('/')
      : '';
  const runTicker = mergerRunTicker || ticker;
  const asOfDate = String(body?.asOfDate || new Date().toISOString().slice(0, 10));
  const { getMacroAssumptionContext } = await import('@/lib/models/shared/macroAssumptions');
  const macroAssumptionContext = await getMacroAssumptionContext(modelType as any);
  const { getCompanyCatalystContext } = await import('@/lib/models/shared/companyCatalystContext');
  const catalystTicker =
    !isPrivateMode
      ? modelType === 'merger'
        ? String(mergerInputsRaw?.acquirerTicker || mergerInputsRaw?.targetTicker || '').trim().toUpperCase() || null
        : (runTicker || ticker || null)
      : null;
  const companyCatalystContext = await getCompanyCatalystContext(catalystTicker, modelType as any);
  let modelInputs: ModelInputs | null = null;
  let payloadForHash: unknown = null;

  if (!runTicker && !isPrivateMode && modelType !== 'merger') {
    return NextResponse.json(
      {
        ok: true,
        ...buildAssumptionsRequiredPayload(modelType, ['ticker'], 'Ticker is required.'),
      },
      { status: 200 }
    );
  }

  if (isDemoMode() && !isPrivateMode && modelType !== 'merger') {
    const demoAllowed = await isDemoOrQualityTickerAvailable(runTicker);
    if (!demoAllowed) {
    return NextResponse.json(
      {
        ok: false,
        status: 'failed',
        state: 'failed',
        code: 'DEMO_NOT_FOUND',
        message: 'This ticker is not available in the current public demo universe. Choose a synced public company.',
      },
      { status: 400 }
    );
    }
  }

  if (modelType === 'football-field') {
    if (isPrivateMode) {
      return NextResponse.json(
        {
          ok: true,
          ...buildAssumptionsRequiredPayload(
            modelType,
            ['ticker'],
            'Football Field currently requires a public ticker in the main wizard backend.'
          ),
        },
        { status: 200 }
      );
    }

    payloadForHash = {
      modelType,
      ticker,
      asOfDate,
      inputs: body,
      prompt: `Build a football field for ${ticker}`,
    };
  } else if (modelType === 'precedents') {
    payloadForHash = {
      modelType,
      ticker: runTicker,
      asOfDate,
      inputs: body,
      prompt: `Create a precedent transactions view for ${isPrivateMode ? (privateCompanyName || 'the company') : runTicker}`,
    };
  } else if (modelType === 'merger') {
    payloadForHash = {
      modelType,
      ticker: runTicker,
      asOfDate,
      inputs: mergerInputsRaw,
    };
  } else {
    try {
      const rawInputs = isPrivateMode
        ? fromManual(manualPayloadFromRequest({ ...body, ticker }) as any)
        : await fromTicker(ticker);
      const normalized = normalizeModelInputs(rawInputs, { modelType });
      if (!normalized.ok || !normalized.value) {
        return errorResponse(
          400,
          'model_inputs_invalid',
          normalized.issues.map((issue) => issue.message).join(' ') || 'Model inputs are invalid.',
          'validate'
        );
      }
      modelInputs = normalized.value;
    } catch (normalizationError: any) {
      return errorResponse(
        400,
        isPrivateMode ? 'manual_inputs_invalid' : 'ticker_inputs_invalid',
        normalizationError?.message ||
          (isPrivateMode
            ? 'Manual inputs are incomplete or invalid.'
            : `Unable to normalize ticker inputs for ${ticker}.`),
        'validate'
      );
    }

    payloadForHash = {
      modelType,
      ticker,
      asOfDate,
      inputs: body,
      modelInputs,
    };
  }
  const inputsHash = hashInputs(payloadForHash);

  const existing = findRunByHash(inputsHash);
  if (existing?.status === 'generated' && (existing.storageKey || existing.dataUrl)) {
    const generatedResult = (existing.result || {}) as GeneratedPayload;
    return NextResponse.json({
      ok: true,
      status: 'generated',
      state: 'generated',
      runId: existing.id,
      storageKey: existing.storageKey,
      downloadUrl: null,
      ...generatedResult,
    });
  }
  if (existing?.status === 'generating') {
    return NextResponse.json({ ok: true, status: 'generating', state: 'generating', runId: existing.id });
  }

  const run = createRun({
    userId: null,
    modelType,
    ticker: runTicker,
    asOfDate,
    inputsHash,
    status: 'generating',
  });
  console.log('[model-run] status transition', { runId: run.id, from: 'new', to: 'generating', ticker: runTicker, modelType });

  try {
    if (modelType === 'football-field') {
      const { extractInputs } = await import('@/lib/model-generator/extractInputs');
      const { buildWorkbook } = await import('@/lib/model-generator/templates/footballField');

      const prompt = `Build a football field for ${ticker}`;
      const extracted = await extractInputs(prompt, 'FOOTBALL_FIELD');
      const footballFieldInputs = extracted.extractedInputs;

      if (extracted.missingCriticalInputs.length > 0) {
        const assumptionsRequired = buildAssumptionsRequiredPayload(
          modelType,
          extracted.missingCriticalInputs,
          'Football Field requires more company anchors before generation.'
        );
        updateRun(run.id, {
          status: assumptionsRequired.status,
          result: assumptionsRequired,
        });
        return NextResponse.json({
          ok: true,
          runId: run.id,
          ...assumptionsRequired,
        });
      }

      if (footballFieldInputs.modelType !== 'FOOTBALL_FIELD') {
        updateRun(run.id, {
          status: 'failed',
          errorMessage: 'Football field extraction returned the wrong model type.',
        });
        return errorResponse(500, 'football_field_extraction_failed', 'Football field extraction failed.', 'generate');
      }

      const workbook = await buildWorkbook(footballFieldInputs);
      const workbookBufferRaw = await workbook.xlsx.writeBuffer();
      const workbookBuffer = Buffer.isBuffer(workbookBufferRaw) ? workbookBufferRaw : Buffer.from(workbookBufferRaw);
      const dataUri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${workbookBuffer.toString('base64')}`;

      let storageKey: string | undefined;
      let dataUrl: string | undefined;

      if (isObjectStoreConfigured()) {
        storageKey = `models/${run.id}.xlsx`;
        await uploadBufferAndSign({
          key: storageKey,
          buffer: workbookBuffer,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          expiresInSeconds: 900,
        });

        const exists = await objectExists(storageKey);
        console.log('[model-run] upload confirmation', { runId: run.id, storageKey, exists });
        if (!exists) {
          updateRun(run.id, { status: 'failed', errorMessage: 'Workbook upload verification failed' });
          return errorResponse(500, 'upload_verification_failed', 'Workbook upload verification failed', 'upload');
        }
      } else {
        dataUrl = dataUri;
      }

      const preview = buildFootballFieldPreview(footballFieldInputs);
      const modelDocument = buildDocumentFromPreview(preview, {
        ticker: footballFieldInputs.ticker || ticker,
        modelType: 'football-field',
        asOfDate,
        currency: 'USD',
        units: 'millions',
        macroContext: macroAssumptionContext,
        companyCatalystContext,
      });

      const generatedResult: GeneratedPayload = {
        preview,
        modelDocument,
        assumptions: footballFieldInputs,
        diagnostics: [],
        warnings: extracted.missingInputs.length > 0 ? [`Missing optional inputs: ${extracted.missingInputs.join(', ')}`] : [],
        appliedDefaults: Object.entries(extracted.defaultsUsed).map(([key, value]) => ({ key, value })),
        macroContext: macroAssumptionContext.summary,
        macroAssumptions: macroAssumptionContext.items,
        macroAssumptionContext,
        catalystContext: companyCatalystContext?.summary,
        companyCatalystContext,
      };

      updateRun(run.id, {
        status: 'generated',
        storageKey,
        dataUrl,
        fileSize: workbookBuffer.length,
        result: generatedResult as Record<string, unknown>,
      });
      console.log('[model-run] status transition', {
        runId: run.id,
        from: 'generating',
        to: 'generated',
        storageKey: storageKey || null,
        engine: 'football-field',
      });

      return NextResponse.json({
        ok: true,
        status: 'generated',
        state: 'generated',
        runId: run.id,
        storageKey,
        downloadUrl: null,
        ...generatedResult,
      });
    }

    if (modelType === 'precedents') {
      const { extractInputs } = await import('@/lib/model-generator/extractInputs');
      const { buildWorkbook } = await import('@/lib/model-generator/templates/precedents');

      const prompt = `Create a precedent transactions view for ${isPrivateMode ? (privateCompanyName || 'the company') : runTicker}`;
      const overrideSource = body?.manualInputs && typeof body.manualInputs === 'object' ? body.manualInputs : body;
      const baseInputOverrides = {
        companyName: isPrivateMode ? (privateCompanyName || 'Private Company') : undefined,
        ticker: isPrivateMode ? privateTickerFallback : runTicker,
        subjectRevenue:
          typeof overrideSource?.revenue === 'number'
            ? overrideSource.revenue
            : typeof body?.revenue === 'number'
              ? body.revenue
              : undefined,
        subjectEbitda:
          typeof overrideSource?.ebitda === 'number'
            ? overrideSource.ebitda
            : typeof body?.ebitda === 'number'
              ? body.ebitda
              : undefined,
      };
      let extracted = await extractInputs(prompt, 'PRECEDENTS', {
        inputOverrides: {
          ...baseInputOverrides,
        },
      });
      let precedentsInputs: any = extracted.extractedInputs;
      let dataRefreshStatus: DataRefreshStatus = 'cached';
      let dataRefreshWarnings: string[] = [];

      const missingSubjectAnchors =
        !precedentsInputs?.companyName ||
        (typeof precedentsInputs?.subjectRevenue !== 'number' &&
          typeof precedentsInputs?.subjectEbitda !== 'number');

      if (!isPrivateMode && (extracted.missingCriticalInputs.length > 0 || missingSubjectAnchors)) {
        const refreshResult = await refreshCatalogCompanyProfile(runTicker);
        dataRefreshWarnings = refreshResult.warnings;

        if (refreshResult.status === 'rerun_failed') {
          dataRefreshStatus = 'rerun_failed';
        } else {
          const refreshedValues = extractCatalogRefreshValues(refreshResult.profile);
          extracted = await extractInputs(prompt, 'PRECEDENTS', {
            inputOverrides: {
              ...baseInputOverrides,
              companyName: baseInputOverrides.companyName ?? refreshedValues.companyName ?? undefined,
              subjectRevenue: baseInputOverrides.subjectRevenue ?? refreshedValues.revenue ?? undefined,
              subjectEbitda: baseInputOverrides.subjectEbitda ?? refreshedValues.ebitda ?? undefined,
            },
          });
          precedentsInputs = extracted.extractedInputs;
          dataRefreshStatus =
            extracted.missingCriticalInputs.length === 0 &&
            Boolean(precedentsInputs?.companyName) &&
            (typeof precedentsInputs?.subjectRevenue === 'number' ||
              typeof precedentsInputs?.subjectEbitda === 'number')
              ? 'rerun_succeeded'
              : 'rerun_attempted';
        }
      }

      if (extracted.missingCriticalInputs.length > 0 || precedentsInputs.modelType !== 'PRECEDENTS') {
        const missingInputs =
          precedentsInputs.modelType === 'PRECEDENTS'
            ? extracted.missingCriticalInputs
            : ['companyName', 'revenue', 'ebitda'];
        const assumptionsRequired = buildAssumptionsRequiredPayload(
          modelType,
          missingInputs,
          'Precedent transactions requires a resolved subject company and at least one operating anchor before generation.',
          dataRefreshStatus,
          dataRefreshWarnings
        );
        updateRun(run.id, {
          status: assumptionsRequired.status,
          result: assumptionsRequired,
        });
        return NextResponse.json({
          ok: true,
          runId: run.id,
          ...assumptionsRequired,
        });
      }

      const workbook = await buildWorkbook(precedentsInputs);
      const workbookBufferRaw = await workbook.xlsx.writeBuffer();
      const workbookBuffer = Buffer.isBuffer(workbookBufferRaw) ? workbookBufferRaw : Buffer.from(workbookBufferRaw);
      const dataUri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${workbookBuffer.toString('base64')}`;

      let storageKey: string | undefined;
      let dataUrl: string | undefined;

      if (isObjectStoreConfigured()) {
        storageKey = `models/${run.id}.xlsx`;
        await uploadBufferAndSign({
          key: storageKey,
          buffer: workbookBuffer,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          expiresInSeconds: 900,
        });

        const exists = await objectExists(storageKey);
        console.log('[model-run] upload confirmation', { runId: run.id, storageKey, exists });
        if (!exists) {
          updateRun(run.id, { status: 'failed', errorMessage: 'Workbook upload verification failed' });
          return errorResponse(500, 'upload_verification_failed', 'Workbook upload verification failed', 'upload');
        }
      } else {
        dataUrl = dataUri;
      }

      const preview = buildPrecedentsPreview(precedentsInputs);
      const modelDocument = buildDocumentFromPreview(preview, {
        ticker: precedentsInputs.ticker || runTicker || privateTickerFallback,
        modelType: 'precedents',
        asOfDate,
        currency: 'USD',
        units: 'millions',
        macroContext: macroAssumptionContext,
        companyCatalystContext,
      });

      const generatedResult: GeneratedPayload = {
        preview,
        modelDocument,
        assumptions: precedentsInputs,
        diagnostics: [],
        warnings: [
          ...(extracted.missingInputs.length > 0 ? [`Missing optional inputs: ${extracted.missingInputs.join(', ')}`] : []),
          ...dataRefreshWarnings,
        ],
        appliedDefaults: Object.entries(extracted.defaultsUsed).map(([key, value]) => ({ key, value })),
        macroContext: macroAssumptionContext.summary,
        macroAssumptions: macroAssumptionContext.items,
        macroAssumptionContext,
        catalystContext: companyCatalystContext?.summary,
        companyCatalystContext,
        dataRefreshStatus,
      };

      updateRun(run.id, {
        status: 'generated',
        storageKey,
        dataUrl,
        fileSize: workbookBuffer.length,
        result: generatedResult as Record<string, unknown>,
      });
      console.log('[model-run] status transition', {
        runId: run.id,
        from: 'generating',
        to: 'generated',
        storageKey: storageKey || null,
        engine: 'precedents',
      });

      return NextResponse.json({
        ok: true,
        status: 'generated',
        state: 'generated',
        runId: run.id,
        storageKey,
        downloadUrl: null,
        dataRefreshStatus,
        ...generatedResult,
      });
    }

    if (modelType === 'merger') {
      const { MergerModelInputSchema, getMissingMergerInputs } = await import('@/lib/models/merger/schema');
      const { extractInputs } = await import('@/lib/model-generator/extractInputs');
      const { buildWorkbook, toWorkbookInputs } = await import('@/lib/model-generator/templates/merger');
      const { calculateMergerModel } = await import('@/lib/models/merger/excel');

      const missing = getMissingMergerInputs(mergerInputsRaw);
      if (missing.length > 0) {
        const assumptionsRequired = buildAssumptionsRequiredPayload(
          modelType,
          missing,
          'Merger model requires acquirer, target, and deal terms before generation.'
        );
        updateRun(run.id, {
          status: assumptionsRequired.status,
          result: assumptionsRequired,
        });
        return NextResponse.json({
          ok: true,
          runId: run.id,
          ...assumptionsRequired,
        });
      }

      const parsedMerger = MergerModelInputSchema.safeParse(mergerInputsRaw);
      if (!parsedMerger.success) {
        const invalidInputs = parsedMerger.error.errors.map((entry) => entry.path.join('.') || entry.message);
        const assumptionsRequired = buildAssumptionsRequiredPayload(
          modelType,
          invalidInputs,
          'Merger inputs are incomplete or invalid.'
        );
        updateRun(run.id, {
          status: assumptionsRequired.status,
          result: assumptionsRequired,
        });
        return NextResponse.json({
          ok: true,
          runId: run.id,
          ...assumptionsRequired,
        });
      }

      const mergerData = parsedMerger.data;
      const mergerPromptParts = [
        `Build an accretion dilution model for ${mergerData.acquirerTicker} acquiring ${mergerData.targetTicker}`,
        `at $${mergerData.purchasePrice}M`,
        mergerData.cashPct !== undefined ? `with ${(mergerData.cashPct * 100).toFixed(0)}% cash` : null,
        mergerData.stockPct !== undefined ? `and ${(mergerData.stockPct * 100).toFixed(0)}% stock` : null,
        mergerData.debtPct !== undefined ? `and ${(mergerData.debtPct * 100).toFixed(0)}% debt` : null,
      ].filter(Boolean);
      const extracted = await extractInputs(mergerPromptParts.join(' '), 'MERGER', {
        inputOverrides: {
          purchasePrice: mergerData.purchasePrice,
          cashPct: mergerData.cashPct,
          stockPct: mergerData.stockPct,
          debtPct: mergerData.debtPct,
          forecastYears: mergerData.forecastYears,
          newDebt: mergerData.newDebt,
          newDebtRate: mergerData.newDebtRate,
          synergies: mergerData.synergies,
          oneTimeCosts: mergerData.oneTimeCosts,
          taxRate: mergerData.taxRate,
        },
      });
      const mergerInputs = extracted.extractedInputs;

      if (extracted.missingCriticalInputs.length > 0 || mergerInputs.modelType !== 'MERGER') {
        const missingInputs =
          mergerInputs.modelType === 'MERGER'
            ? extracted.missingCriticalInputs
            : ['acquirerTicker', 'targetTicker', 'purchasePrice'];
        const assumptionsRequired = buildAssumptionsRequiredPayload(
          modelType,
          missingInputs,
          'Merger model requires complete acquirer, target, and purchase price inputs.'
        );
        updateRun(run.id, {
          status: assumptionsRequired.status,
          result: assumptionsRequired,
        });
        return NextResponse.json({
          ok: true,
          runId: run.id,
          ...assumptionsRequired,
        });
      }

      const workbook = await buildWorkbook(mergerInputs);
      const workbookBufferRaw = await workbook.xlsx.writeBuffer();
      const workbookBuffer = Buffer.isBuffer(workbookBufferRaw) ? workbookBufferRaw : Buffer.from(workbookBufferRaw);
      const dataUri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${workbookBuffer.toString('base64')}`;

      let storageKey: string | undefined;
      let dataUrl: string | undefined;

      if (isObjectStoreConfigured()) {
        storageKey = `models/${run.id}.xlsx`;
        await uploadBufferAndSign({
          key: storageKey,
          buffer: workbookBuffer,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          expiresInSeconds: 900,
        });

        const exists = await objectExists(storageKey);
        console.log('[model-run] upload confirmation', { runId: run.id, storageKey, exists });
        if (!exists) {
          updateRun(run.id, { status: 'failed', errorMessage: 'Workbook upload verification failed' });
          return errorResponse(500, 'upload_verification_failed', 'Workbook upload verification failed', 'upload');
        }
      } else {
        dataUrl = dataUri;
      }

      const mergerSummary = calculateMergerModel(toWorkbookInputs(mergerInputs));
      const preview = buildMergerPreview(mergerSummary);
      const modelDocument = buildDocumentFromPreview(preview, {
        ticker: mergerRunTicker || mergerInputs.acquirerTicker || runTicker || 'MERGER',
        modelType: 'merger',
        asOfDate,
        currency: 'USD',
        units: 'millions',
        macroContext: macroAssumptionContext,
        companyCatalystContext,
      });

      const generatedResult: GeneratedPayload = {
        preview,
        modelDocument,
        assumptions: mergerInputs,
        diagnostics: [],
        warnings: extracted.missingInputs.length > 0 ? [`Missing optional inputs: ${extracted.missingInputs.join(', ')}`] : [],
        appliedDefaults: Object.entries(extracted.defaultsUsed).map(([key, value]) => ({ key, value })),
        macroContext: macroAssumptionContext.summary,
        macroAssumptions: macroAssumptionContext.items,
        macroAssumptionContext,
        catalystContext: companyCatalystContext?.summary,
        companyCatalystContext,
      };

      updateRun(run.id, {
        status: 'generated',
        storageKey,
        dataUrl,
        fileSize: workbookBuffer.length,
        result: generatedResult as Record<string, unknown>,
      });
      console.log('[model-run] status transition', {
        runId: run.id,
        from: 'generating',
        to: 'generated',
        storageKey: storageKey || null,
        engine: 'merger',
      });

      return NextResponse.json({
        ok: true,
        status: 'generated',
        state: 'generated',
        runId: run.id,
        storageKey,
        downloadUrl: null,
        ...generatedResult,
      });
    }

    if (modelType === 'dcf') {
      const dataSourceId = isPrivateMode ? 'manual' : 'ticker';
      const coreParams = isPrivateMode
        ? {
            formData: {
              ...(body?.manualInputs && typeof body.manualInputs === 'object' ? body.manualInputs : {}),
              companyName: body?.companyName,
              currency: body?.currency,
              ticker,
            },
            asOfDate,
          }
        : {
            ticker,
            asOfDate,
          };

      const scenarioInputs = body?.scenarioInputs && typeof body.scenarioInputs === 'object' ? body.scenarioInputs : {};
      const includeScenarioComparison = body?.includeScenarios === true;
      const baseOverride = buildScenarioOverride((scenarioInputs as any)?.base);
      const baseScenario: Scenario | undefined = baseOverride
        ? {
            id: 'base',
            name: 'Base',
            assumptionsOverride: baseOverride,
            createdAt: new Date().toISOString(),
          }
        : undefined;

      const baseResult = await runModel({
        templateId: 'dcf',
        dataSourceId: dataSourceId as 'ticker' | 'manual',
        params: coreParams as any,
        options: { asOfDate, scenarioId: baseScenario?.id },
        scenario: baseScenario,
      });

      if (!baseResult.ok || !baseResult.outputs || !baseResult.inputs) {
        const issueMessage =
          baseResult.issues.find((entry) => entry.severity === 'error')?.message ||
          'Core engine failed to generate DCF output.';
        updateRun(run.id, {
          status: 'failed',
          errorMessage: issueMessage,
        });
        return NextResponse.json(
          {
            ok: false,
            status: 'failed',
            state: 'failed',
            code: 'core_engine_failed',
            message: issueMessage,
            issues: baseResult.issues,
          },
          { status: 400 }
        );
      }

      const scenarioOutputs: Array<{
        scenarioId: string;
        scenarioName: string;
        outputs: (typeof baseResult.outputs);
      }> = [
        {
          scenarioId: baseScenario?.id || 'base',
          scenarioName: baseScenario?.name || 'Base',
          outputs: baseResult.outputs,
        },
      ];

      const runOptionalScenario = async (scenarioId: string, scenarioName: string, rawScenario: any) => {
        const assumptionsOverride = buildScenarioOverride(rawScenario);
        if (!assumptionsOverride) return;
        const scenario: Scenario = {
          id: scenarioId,
          name: scenarioName,
          assumptionsOverride,
          createdAt: new Date().toISOString(),
        };
        const scenarioResult = await runModel({
          templateId: 'dcf',
          dataSourceId: dataSourceId as 'ticker' | 'manual',
          params: coreParams as any,
          options: { asOfDate, scenarioId: scenario.id },
          scenario,
        });
        if (!scenarioResult.ok || !scenarioResult.outputs) {
          const scenarioFailure =
            scenarioResult.issues.find((entry) => entry.severity === 'error')?.message ||
            `Failed to run ${scenarioName} scenario.`;
          console.warn('[model-run] scenario failed', { runId: run.id, scenarioId, message: scenarioFailure });
          return;
        }
        scenarioOutputs.push({
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          outputs: scenarioResult.outputs,
        });
      };

      if (includeScenarioComparison) {
        await runOptionalScenario('bull', 'Bull', (scenarioInputs as any)?.bull);
        await runOptionalScenario('bear', 'Bear', (scenarioInputs as any)?.bear);
      }

      const scenarioComparison = compareScenarios(scenarioOutputs as any);

      const requestedDcfSensitivity =
        body?.sensitivity?.dcf && typeof body.sensitivity.dcf === 'object'
          ? body.sensitivity.dcf
          : {};
      const baseWacc = asFiniteNumber(baseResult.outputs.summary.wacc) ?? 0.1;
      const baseTerminalGrowth = asFiniteNumber(baseResult.inputs.assumptions.terminalGrowth) ?? 0.025;
      const waccRange = toDecimalPercent(requestedDcfSensitivity?.waccRangePct) ?? 0.02;
      const waccStep = toDecimalPercent(requestedDcfSensitivity?.waccStepPct) ?? 0.005;
      const terminalGrowthRange = toDecimalPercent(requestedDcfSensitivity?.terminalGrowthRangePct) ?? 0.01;
      const terminalGrowthStep = toDecimalPercent(requestedDcfSensitivity?.terminalGrowthStepPct) ?? 0.0025;
      const waccAxis = buildCenteredRange(baseWacc, waccRange, waccStep, 0.04, 0.3);
      const terminalGrowthAxis = buildCenteredRange(baseTerminalGrowth, terminalGrowthRange, terminalGrowthStep, -0.02, 0.08);

      const sensitivityResult = await runSensitivity({
        templateId: 'dcf',
        dataSourceId: dataSourceId as 'ticker' | 'manual',
        baseParams: coreParams as any,
        variableA: 'terminalGrowth',
        rangeA: terminalGrowthAxis,
        variableB: 'wacc',
        rangeB: waccAxis,
        scenario: baseScenario,
        maxIterations: 225,
        metric: 'impliedSharePrice',
      });

      const sensitivityWarnings = sensitivityResult.warnings || [];
      if (!sensitivityResult.ok) {
        const sensitivityIssue = sensitivityResult.issues.find((entry) => entry.severity === 'error');
        if (sensitivityIssue) {
          sensitivityWarnings.push(`Sensitivity fallback: ${sensitivityIssue.message}`);
        }
      }

      const dcfSensitivity = {
        base: {
          wacc: baseWacc,
          terminalGrowth: baseTerminalGrowth,
          pricePerShare: asFiniteNumber(baseResult.outputs.summary.impliedSharePrice) ?? null,
        },
        rows: sensitivityResult.yAxis || waccAxis,
        cols: sensitivityResult.xAxis || terminalGrowthAxis,
        values: (sensitivityResult.grid || []).map((row) =>
          row.map((cell) => (Number.isFinite(cell) ? Number(cell) : null))
        ),
        config: {
          waccRangePct: Number((waccRange * 100).toFixed(4)),
          waccStepPct: Number((waccStep * 100).toFixed(4)),
          terminalGrowthRangePct: Number((terminalGrowthRange * 100).toFixed(4)),
          terminalGrowthStepPct: Number((terminalGrowthStep * 100).toFixed(4)),
        },
      };

      let workbookBuffer: Buffer;
      try {
        const { generateBankerDCF, buildDcfWorkbook } = await import('@/lib/dcfGenerator');
        const bankerInputs = mapCoreInputsToBankerDcfInputs(baseResult.inputs, baseResult.outputs);
        const bankerOutput = await generateBankerDCF(bankerInputs);
        const bankerWorkbook = await buildDcfWorkbook(bankerOutput);
        const bankerBufferRaw = await bankerWorkbook.xlsx.writeBuffer();
        workbookBuffer = Buffer.isBuffer(bankerBufferRaw) ? bankerBufferRaw : Buffer.from(bankerBufferRaw);
      } catch (error) {
        console.warn('[model-run] banker DCF workbook generation failed, falling back to core export', {
          runId: run.id,
          message: error instanceof Error ? error.message : String(error),
        });
        workbookBuffer = await buildExcelFromModelOutputs({
          templateId: 'dcf',
          modelOutputs: baseResult.outputs,
          companyName: baseResult.inputs.company.name,
        });
      }

      const dataUri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${workbookBuffer.toString('base64')}`;
      let storageKey: string | undefined;
      let dataUrl: string | undefined;

      if (isObjectStoreConfigured()) {
        storageKey = `models/${run.id}.xlsx`;
        await uploadBufferAndSign({
          key: storageKey,
          buffer: workbookBuffer,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          expiresInSeconds: 900,
        });

        const exists = await objectExists(storageKey);
        console.log('[model-run] upload confirmation', { runId: run.id, storageKey, exists });
        if (!exists) {
          updateRun(run.id, { status: 'failed', errorMessage: 'Workbook upload verification failed' });
          return errorResponse(500, 'upload_verification_failed', 'Workbook upload verification failed', 'upload');
        }
      } else {
        dataUrl = dataUri;
      }

      const preview = buildCorePreview(baseResult.inputs, baseResult.outputs);
      const modelDocument = buildDocumentFromPreview(preview, {
        ticker: baseResult.inputs.company.ticker || ticker || 'PRIVATE',
        modelType: 'dcf',
        asOfDate,
        currency: baseResult.inputs.company.currency || 'USD',
        units: 'millions',
        macroContext: macroAssumptionContext,
        companyCatalystContext,
      });

      const scenarioSummaries = scenarioOutputs.reduce<Record<string, any>>((acc, entry) => {
        acc[entry.scenarioId] = {
          name: entry.scenarioName,
          valuationResults: {
            enterpriseValue: entry.outputs.summary.enterpriseValue,
            equityValue: entry.outputs.summary.equityValue ?? null,
            pricePerShare: entry.outputs.summary.impliedSharePrice ?? null,
          },
        };
        return acc;
      }, {});

      const generatedResult: GeneratedPayload = {
        preview,
        modelDocument,
        dcfSummary: {
          valuationResults: {
            enterpriseValue: baseResult.outputs.summary.enterpriseValue,
            equityValue: baseResult.outputs.summary.equityValue ?? null,
            pricePerShare: baseResult.outputs.summary.impliedSharePrice ?? null,
          },
          results: {
            enterpriseValue: baseResult.outputs.summary.enterpriseValue,
            equityValue: baseResult.outputs.summary.equityValue ?? null,
            pricePerShare: baseResult.outputs.summary.impliedSharePrice ?? null,
          },
          inputs: baseResult.inputs,
          sensitivity: dcfSensitivity,
          scenarioComparison,
        },
        assumptions: baseResult.outputs.audit.assumptionsUsed,
        diagnostics: [],
        warnings: [
          ...baseResult.warnings,
          ...baseResult.issues
            .filter((entry) => entry.severity === 'warning')
            .map((entry) => entry.message),
          ...sensitivityWarnings,
        ],
        appliedDefaults: [],
        coreModelOutputs: baseResult.outputs,
        coreInputs: baseResult.inputs,
        liveDataFallback: baseResult.inputs.metadata?.liveDataFallback === true,
        scenarioComparison,
        scenarioSummaries,
        macroContext: macroAssumptionContext.summary,
        macroAssumptions: macroAssumptionContext.items,
        macroAssumptionContext,
        catalystContext: companyCatalystContext?.summary,
        companyCatalystContext,
      };

      updateRun(run.id, {
        status: 'generated',
        storageKey,
        dataUrl,
        fileSize: workbookBuffer.length,
        result: generatedResult as Record<string, unknown>,
      });
      console.log('[model-run] status transition', {
        runId: run.id,
        from: 'generating',
        to: 'generated',
        storageKey: storageKey || null,
        engine: 'core',
      });

      return NextResponse.json({
        ok: true,
        status: 'generated',
        state: 'generated',
        runId: run.id,
        storageKey,
        downloadUrl: null,
        ...generatedResult,
      });
    }

    const internalReq = new NextRequest(`${req.nextUrl.origin}/api/generateModel?format=json`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-capitalbase-inline-download': '1',
      },
      body: JSON.stringify({
        ...body,
        ticker,
        modelType,
        modelInputs,
      }),
    });

    const generationResponse = await generateModelPost(internalReq);
    const generationJson = await generationResponse.json();

    if (!generationResponse.ok) {
      updateRun(run.id, {
        status: 'failed',
        errorMessage: generationJson?.message || generationJson?.error || 'generateModel failed',
      });
      return errorResponse(
        generationResponse.status,
        generationJson?.code || 'generate_model_failed',
        generationJson?.message || generationJson?.error || 'Model generation failed',
        'generate'
      );
    }

    if (generationJson?.state === 'assumptions_required') {
      const assumptionsRequired = buildAssumptionsRequiredPayload(
        modelType,
        generationJson?.missing || [],
        generationJson?.message || 'Required assumptions are missing.'
      );
      updateRun(run.id, {
        status: assumptionsRequired.status,
        result: {
          missingInputs: assumptionsRequired.missingInputs,
          requiredInputs: assumptionsRequired.requiredInputs,
          estimatedInputs: generationJson?.estimated || [],
          isComputable: assumptionsRequired.isComputable,
          exportEligibility: assumptionsRequired.exportEligibility,
          dataRefreshStatus: assumptionsRequired.dataRefreshStatus,
        },
      });
      console.log('[model-run] status transition', { runId: run.id, from: 'generating', to: 'assumptions_required' });
      return NextResponse.json({
        ok: true,
        runId: run.id,
        estimatedInputs: generationJson?.estimated || [],
        ...assumptionsRequired,
      });
    }

    const dataUri = generationJson?.downloadUrl;
    if (typeof dataUri !== 'string' || !dataUri.startsWith('data:')) {
      updateRun(run.id, { status: 'failed', errorMessage: 'Missing inline workbook data in generation response' });
      return errorResponse(500, 'missing_download_data', 'Generation response did not include workbook data', 'generate');
    }

    const workbookBuffer = parseDataUriToBuffer(dataUri);
    let storageKey: string | undefined;
    let dataUrl: string | undefined;

    if (isObjectStoreConfigured()) {
      storageKey = `models/${run.id}.xlsx`;
      await uploadBufferAndSign({
        key: storageKey,
        buffer: workbookBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        expiresInSeconds: 900,
      });

      const exists = await objectExists(storageKey);
      console.log('[model-run] upload confirmation', { runId: run.id, storageKey, exists });
      if (!exists) {
        updateRun(run.id, { status: 'failed', errorMessage: 'Workbook upload verification failed' });
        return errorResponse(500, 'upload_verification_failed', 'Workbook upload verification failed', 'upload');
      }
    } else {
      dataUrl = dataUri;
    }

    const generatedResult: GeneratedPayload = {
      preview: generationJson?.preview,
      modelDocument: generationJson?.modelDocument,
      dcfSummary: generationJson?.dcfSummary,
      lboSummary: generationJson?.lboSummary,
      debtCapacityLite: generationJson?.debtCapacityLite,
      scorecardSummary: generationJson?.scorecardSummary,
      assumptions: generationJson?.assumptions,
      diagnostics: generationJson?.diagnostics,
      warnings: generationJson?.warnings,
      appliedDefaults: generationJson?.appliedDefaults,
      macroContext: generationJson?.macroContext ?? macroAssumptionContext.summary,
      macroAssumptions: generationJson?.macroAssumptions ?? macroAssumptionContext.items,
      macroAssumptionContext: generationJson?.macroAssumptionContext ?? macroAssumptionContext,
      catalystContext: generationJson?.catalystContext ?? companyCatalystContext?.summary,
      companyCatalystContext: generationJson?.companyCatalystContext ?? companyCatalystContext,
    };

    updateRun(run.id, {
      status: 'generated',
      storageKey,
      dataUrl,
      fileSize: workbookBuffer.length,
      result: generatedResult as Record<string, unknown>,
    });
    console.log('[model-run] status transition', {
      runId: run.id,
      from: 'generating',
      to: 'generated',
      storageKey: storageKey || null,
    });

    return NextResponse.json({
      ok: true,
      status: 'generated',
      state: 'generated',
      runId: run.id,
      storageKey,
      downloadUrl: null,
      ...generatedResult,
    });
  } catch (error: any) {
    updateRun(run.id, {
      status: 'failed',
      errorMessage: error?.message || 'Generation failed',
    });
    console.log('[model-run] status transition', {
      runId: run.id,
      from: 'generating',
      to: 'failed',
      error: error?.message || 'Generation failed',
    });
    return errorResponse(500, 'run_generation_failed', error?.message || 'Failed to generate model run', 'unknown');
  }
    } catch (error: any) {
      console.error('[model-run] unhandled error', error);
      return errorResponse(500, 'run_unhandled_error', error?.message || 'Unexpected error', 'unknown');
    }
  });
}
