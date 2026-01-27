/**
 * Unified Model Generation API
 * 
 * Generates banker-grade Excel models with OpenAI-enriched assumptions.
 * Comprehensive error handling and diagnostics at every step.
 * 
 * Flow:
 * 1. Validate request body
 * 2. Fetch financial data (with fallback to AI)
 * 3. Enrich assumptions with OpenAI
 * 4. Sanitize and validate assumptions
 * 5. Generate Excel model
 * 6. Return: assumptions, summary, preview, diagnostics
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { APP_NAME } from '@/lib/branding';
import type { ModelType as RequestModelType } from '@/types/models';
import { enrichUnifiedAssumptions } from '@/lib/enrichUnifiedAssumptions';
import { 
  sanitizeAssumptions, 
  validateSanitizedAssumptions, 
  formatSanitizationLog 
} from '@/lib/sanitizeAssumptions';
import { safeSanitizeAssumptions } from '@/lib/models/sanitizeAssumptions';
import type {
  ThreeStatementAssumptions,
  PartialThreeStatementAssumptions,
} from '@/types/threeStatementAssumptions';
import type { DataDiagnostics } from '@/types/diagnostics';
import { createDiagnostic, logDiagnostic } from '@/types/diagnostics';
import { performSanityChecks } from '@/lib/data/fetchWithDiagnostics';
import type { DCFInputs } from '@/lib/dcfGenerator';
import { formatMillions } from '@/lib/unitConversion';
import { type ScaledFinancials } from '@/lib/financials';
import type { APIAttempt } from '@/lib/data/dcfValidation';
import { buildLboWorkbook, type LboEngineOutput } from '@/lib/lboEngine';
import type { LBOInputs } from '@/lib/lboGenerator';
import { logModelRun, mapModelTypeToMetrics, type ModelType as MetricsModelType } from '@/lib/modelMetrics';
import { createModelRun, updateModelRunSuccess, updateModelRunFailed } from '@/lib/modelRuns';
import { copyWorksheet } from '@/lib/excel/copyWorksheet';
import type { Scenario } from '@/lib/scenarioEngine';
import { buildUnifiedAssumptionsFromPolygon } from '@/lib/unifiedAssumptions';
import type { LboAdvancedOptions } from '@/types/lbo';
import { generatePreviewFromWorkbook } from '@/lib/generatePreview';
import { getSettings } from '@/lib/settings/store';
import { handleModelError } from '@/lib/models/errorHandler';
import { applyDefaultsToModelInputs } from '@/lib/models/shared/applyDefaults';
import { evaluateGuardrails } from '@/lib/models/shared/guardrails';
import { uploadXlsxToR2, assertR2Env, checkR2Env } from '@/lib/r2';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { normalizeModelRequest } from '@/types/modelContracts';
import { NormalizeInputsError, normalizeInputs } from '@/lib/modeling/normalizeInputs';
// Removed randomUUID import - modelId must come from database

const deepClone = <T,>(value: T): T => {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

const toUsdMillions = (raw: any): number => {
  const num = typeof raw === 'number' && isFinite(raw) ? raw : Number(raw);
  if (!isFinite(num)) return 0;
  // Assume raw dollars; convert once
  let millions = num / 1_000_000;
  // Clamp obvious double/missed conversions
  if (millions > 1_000_000) {
    millions = millions / 1_000;
  } else if (millions > 0 && millions < 1) {
    millions = millions * 1_000_000;
  }
  return millions;
};

const toMillionShares = (raw: any): number => {
  const num = typeof raw === 'number' && isFinite(raw) ? raw : Number(raw);
  if (!isFinite(num)) return 0;
  if (num > 1_000_000) return num / 1_000_000;
  return num;
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stringifyErrorDetails = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message || undefined;
  try {
    const serialized = JSON.stringify(value);
    if (!serialized || serialized === '{}' || serialized === '[]') return undefined;
    return serialized.length > 800 ? `${serialized.slice(0, 800)}...` : serialized;
  } catch {
    return String(value);
  }
};

const normalizeNullableString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const lowered = trimmed.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined') return undefined;
  return trimmed;
};

// Helper to safely parse JSON strings
const jsonStringOrObject = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([
    schema,
    z.string().transform((str, ctx) => {
      try {
        return JSON.parse(str);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid JSON string',
        });
        return z.NEVER;
      }
    }).pipe(schema),
  ]);

const generateModelSchema = z
  .object({
    modelId: z.string().min(1, 'modelId is required'),
    ticker: z.preprocess(
      normalizeNullableString,
      z.string().min(1)
    ).optional(),
    modelType: z.string().min(1).optional(),
    model_type: z.string().min(1).optional(),
    scenario: z.string().optional(),
    scenario_adjustment_notes: z.string().optional().nullable(),
    scenarioAdjustmentNotes: z.string().optional().nullable(),
    // Handle assumptions as record, object, or stringified JSON
    assumptions: z.union([
      z.record(z.any()),
      z.object({}).passthrough(),
      z.string().transform((str, ctx) => {
        try {
          const parsed = JSON.parse(str);
          return typeof parsed === 'object' && parsed !== null ? parsed : {};
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Invalid JSON string in assumptions',
          });
          return z.NEVER;
        }
      }),
    ]).optional().default({}),
    companyName: z.preprocess(
      normalizeNullableString,
      z.string().min(1)
    ).optional(),
    company_name: z.preprocess(
      normalizeNullableString,
      z.string().min(1)
    ).optional(),
    // Consolidate duplicate fields - prefer camelCase
    // model_type will be normalized to modelType in normalizeModelRequest
    // Coerce numeric fields from strings
    wacc: z.union([z.number(), z.string().transform((s) => {
      const num = parseFloat(s);
      return Number.isFinite(num) ? num : undefined;
    })]).optional(),
    terminalGrowth: z.union([z.number(), z.string().transform((s) => {
      const num = parseFloat(s);
      return Number.isFinite(num) ? num : undefined;
    })]).optional(),
    // Handle nested objects that might be stringified
    sliderOverrides: jsonStringOrObject(z.record(z.any())).optional(),
    lboAdvanced: jsonStringOrObject(z.record(z.any())).optional(),
    lboOverrides: jsonStringOrObject(z.record(z.any())).optional(),
    scenarioInputs: jsonStringOrObject(z.record(z.any())).optional(),
    mergerInputs: jsonStringOrObject(z.record(z.any())).optional(),
    operatingInputs: jsonStringOrObject(z.record(z.any())).optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    const ticker = normalizeNullableString(value.ticker);
    const companyName = normalizeNullableString(value.companyName ?? value.company_name);
    if (!ticker && !companyName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'companyName or ticker is required',
        path: ['companyName'],
      });
    }
  });

/**
 * Validate request body
 */
function validateRequestBody(body: any): {
  ticker: string;
  modelType: RequestModelType;
  scenario: Scenario;
  assumptions: Record<string, any>;
} {
  if (!body || typeof body !== 'object') {
    throw new Error('Missing or invalid JSON body');
  }

  const { ticker, modelType, model_type, scenario, assumptions } = body;

  if (!ticker || typeof ticker !== 'string' || ticker.trim().length === 0) {
    throw new Error('Ticker is required and must be a non-empty string');
  }

  const allowedTypes: RequestModelType[] = ['three-statement', 'dcf', 'comps'];
  const preferredModelType = (modelType || model_type || 'dcf') as RequestModelType;
  const resolvedModelType = allowedTypes.includes(preferredModelType) ? preferredModelType : 'dcf';

  const scenarioAliases: Record<string, Scenario> = {
    BASE: 'BASE',
    BULL: 'BULLISH',
    BULLISH: 'BULLISH',
    BEAR: 'BEARISH',
    BEARISH: 'BEARISH',
  };

  const normalizedScenarioKey =
    typeof scenario === 'string' && scenario.trim().length > 0 ? scenario.trim().toUpperCase() : '';
  const resolvedScenario = scenarioAliases[normalizedScenarioKey] || 'BASE';

  if (!assumptions || typeof assumptions !== 'object') {
    throw new Error('Assumptions payload is required');
  }

  return {
    ticker: ticker.trim().toUpperCase(),
    modelType: resolvedModelType,
    scenario: resolvedScenario,
    assumptions,
  };
}

/**
 * Safely fetch financial data with error handling
 */
async function getOrFetchFinancialsSafe(ticker: string): Promise<any> {
  try {
    console.log(`[generateModel] Fetching LTM financials for ${ticker}`);
    const { getLTMFinancials } = await import('@/lib/getLTMFinancials');
    const data = await getLTMFinancials(ticker);
    
    if (!data) {
      throw new Error('No financial data returned from provider');
    }
    
    console.log(`[generateModel] ✅ LTM financials fetched from ${data.dataSource}`);
    return data;
  } catch (err) {
    console.error(`[generateModel] Financial data fetch failed for ${ticker}:`, err);
    // Return null instead of throwing - we'll use AI fallback
    return null;
  }
}

/**
 * Build partial assumptions from request and financial data
 */
function buildPartialAssumptions(
  body: any,
  ltmFinancials: any
): PartialThreeStatementAssumptions {
  const partial: PartialThreeStatementAssumptions = {
    ticker: body.ticker?.trim().toUpperCase(),
    companyName: body.companyName || ltmFinancials?.companyName,
    sector: body.sector || ltmFinancials?.sector,
    currency: body.currency || 'USD',
  };

  // Add LTM data if available
  if (ltmFinancials) {
    const ltmRevenueM = toUsdMillions(ltmFinancials.revenue);
    if (ltmRevenueM) {
      partial.revenue = [ltmRevenueM];
    }
    if (ltmFinancials.grossProfit && ltmRevenueM) {
      partial.cogsPct = [(ltmRevenueM - toUsdMillions(ltmFinancials.grossProfit)) / ltmRevenueM];
    }
    if (ltmFinancials.operatingIncome && ltmRevenueM) {
      partial.opexPct = [
        (ltmRevenueM -
          toUsdMillions(ltmFinancials.operatingIncome) -
          (ltmRevenueM - toUsdMillions(ltmFinancials.grossProfit))) /
          ltmRevenueM,
      ];
    }
  }

  // Add user-provided scenario parameters
  if (body.wacc !== undefined) partial.wacc = body.wacc;
  if (body.terminalGrowth !== undefined) partial.terminalGrowth = body.terminalGrowth;
  if (body.lboAdvanced && typeof body.lboAdvanced === 'object') {
    partial.lboAdvanced = body.lboAdvanced;
  }

  return partial;
}

/**
 * Build DCF model with enriched assumptions
 * DCF VALUATION ENGINE v7.0 Protocol
 */
async function buildDcfModelWithAssumptions(
  workbook: ExcelJS.Workbook,
  ticker: string,
  assumptions: ThreeStatementAssumptions,
  body: any,
  scenario: Scenario,
  normalizedFinancials?: ScaledFinancials | null,
  appliedDefaults: any[] = [],
  modelType: RequestModelType = 'dcf'
): Promise<{ dcfSummary?: any; validation?: any; raw?: { results: any; normalizedInputs: any } }> {
  console.log(`[generateModel] ========== DCF VALUATION ENGINE v7.0 ==========`);
  console.log(`[generateModel] Building DCF for ${ticker}`);

  const clampOverride = (value: any, min: number, max: number): number | undefined => {
    if (typeof value !== 'number' || !isFinite(value)) {
      return undefined;
    }
    return Math.max(min, Math.min(max, value));
  };

  const sliderOverrides = body?.sliderOverrides && typeof body.sliderOverrides === 'object'
    ? {
        revenueGrowth: clampOverride(body.sliderOverrides.revenueGrowth, -0.5, 0.5),
        ebitdaMargin: clampOverride(body.sliderOverrides.ebitdaMargin, 0, 0.7),
        wacc: clampOverride(body.sliderOverrides.wacc, 0.05, 0.2),
      }
    : { revenueGrowth: undefined, ebitdaMargin: undefined, wacc: undefined };
  
  // Defensive scenario inputs handling - handle case-insensitive scenario keys
  const scenarioKey = scenario.toLowerCase();
  const scenarioInputsRaw = body?.scenarioInputs && typeof body.scenarioInputs === 'object' ? body.scenarioInputs : {};
  const scenarioInput =
    scenarioInputsRaw[scenarioKey] ??
    scenarioInputsRaw[scenario.toLowerCase()] ??
    scenarioInputsRaw.base ??
    scenarioInputsRaw.BASE ??
    {};
  
  // Import all required modules
  const { generateBankerDCF, computeDCFSeries, normalizeDCFInputs } = await import('@/lib/dcfGenerator');
  const { fetchConsensusEstimates, selectBestEstimate } = await import('@/lib/data/consensusEstimates');
  const { 
    validateDCFInputs, 
    formatValidationError, 
    createAPIAttempt,
    logValidationResult,
  } = await import('@/lib/data/dcfValidation');
  const {
    inferCapexPercentage,
    inferDAPercentage,
    inferWorkingCapitalPercentage,
    inferWACC,
    inferTerminalGrowth,
    logInferredValue,
    createInferenceSummary,
  } = await import('@/lib/data/inferenceProtocol');
  const { getSector } = await import('@/lib/sectorMapping');
  const {
    applyScenarioToEstimates,
    applyScenarioToWACC,
    applyScenarioToRevenueProjections,
    logScenarioAdjustments,
    createScenarioSummary,
  } = await import('@/lib/scenarioEngine');
  const {
    formatDCFOutput,
    logFormattedOutput,
    createJSONSummary,
  } = await import('@/lib/outputFormatter');
  
  console.log(`[generateModel] Scenario: ${scenario}`);
  
  // Track API attempts for validation
  const apiAttempts: APIAttempt[] = [];
  const inferences: Record<string, any> = {};
  
  // STEP 1: Fetch Consensus Estimates (Priority 1)
  console.log(`[generateModel] STEP 1: Fetching consensus estimates...`);
  const consensusResult = await fetchConsensusEstimates(ticker);
  const bestEstimate = selectBestEstimate(consensusResult);
  
  if (consensusResult.ok && bestEstimate) {
    apiAttempts.push(createAPIAttempt(
      'fmp',
      consensusResult.fmpEstimates ? 'success' : 'failed',
      undefined,
      consensusResult.fmpEstimates ? ['revenue growth', 'margin targets'] : undefined
    ));
    apiAttempts.push(createAPIAttempt(
      'finnhub',
      consensusResult.finnhubEstimates ? 'success' : 'failed',
      undefined,
      consensusResult.finnhubEstimates ? ['revenue growth'] : undefined
    ));
    console.log(`[generateModel] ✅ Consensus estimates available from ${bestEstimate.source}`);
  } else {
    console.log(`[generateModel] ⚠️  No consensus estimates available`);
  }
  
  // STEP 2: LTM/Historical Data already fetched (Priority 2)
  // This was done in earlier steps via getLTMFinancials
  console.log(`[generateModel] STEP 2: Using LTM data from ${assumptions.dataSource || 'enrichment'}`);
  
  // STEP 3: Calculate EBIT margin from cost structure
  let ebitMargin = 1 - assumptions.cogsPct[0] - assumptions.opexPct[0] - assumptions.daPct[0];
  
  // STEP 4: Ensure all monetary values are in millions (MANDATORY SCALING PROTOCOL)
  console.log(`[generateModel] STEP 3: Applying MANDATORY SCALING PROTOCOL...`);
  const netDebtMillions = normalizedFinancials?.netDebtM ?? toUsdMillions(assumptions.debt - assumptions.startingCash);
  
  // Determine shares outstanding with source priority:
  // 1. Cap table (if modeled in 3-statement) - check if shares are in assumptions from cap table
  // 2. Market data (normalizedFinancials from Polygon) 
  // 3. Assumption (user-provided)
  let sharesOutstandingMillions: number;
  let sharesSource: 'capTable' | 'marketData' | 'assumption';
  
  // Check if shares come from cap table (3-statement model would have this)
  // For now, we'll check if assumptions.sharesOutstanding exists and is from a cap table
  // In a full implementation, you'd check if there's a cap table sheet/modeled shares
  const capTableShares = assumptions.sharesOutstanding && assumptions.sharesOutstanding > 0 
    ? toMillionShares(assumptions.sharesOutstanding) 
    : null;
  
  if (capTableShares && capTableShares > 0) {
    sharesOutstandingMillions = capTableShares;
    sharesSource = 'capTable';
    console.log(`[generateModel] Shares outstanding from cap table: ${sharesOutstandingMillions.toFixed(2)}M`);
  } else if (normalizedFinancials?.sharesOutstandingM && normalizedFinancials.sharesOutstandingM > 0) {
    sharesOutstandingMillions = normalizedFinancials.sharesOutstandingM;
    sharesSource = 'marketData';
    console.log(`[generateModel] Shares outstanding from market data (Polygon): ${sharesOutstandingMillions.toFixed(2)}M`);
  } else {
    sharesOutstandingMillions = toMillionShares(assumptions.sharesOutstanding) ?? 0;
    sharesSource = 'assumption';
    if (sharesOutstandingMillions > 0) {
      console.log(`[generateModel] Shares outstanding from assumption: ${sharesOutstandingMillions.toFixed(2)}M`);
    }
  }
  
  // SAFETY CHECK: Shares outstanding - warn if missing but continue
  // ALWAYS write shares to workbook (even if 0) for deterministic output
  if (!sharesOutstandingMillions || sharesOutstandingMillions <= 0) {
    console.warn(`[generateModel] ⚠️  Shares outstanding is missing or invalid: ${sharesOutstandingMillions}`);
    console.warn(`[generateModel] Per-share metrics will be unavailable. EV and equity value will still be calculated.`);
    console.warn(`[generateModel] Shares will be written as 0 in workbook with named range CB_OUT_SHARES_OUT.`);
  } else {
    console.log(`[generateModel] Shares outstanding (millions): ${sharesOutstandingMillions.toFixed(2)}M (source: ${sharesSource})`);
  }
  let revenueByYear = assumptions.revenue.map((r: number) => r);
  if (normalizedFinancials?.revenueM && revenueByYear.length > 0) {
    revenueByYear[0] = normalizedFinancials.revenueM;
  }
  // Ensure length matches years by padding with simple growth
  while (revenueByYear.length < assumptions.years.length) {
    const last = revenueByYear[revenueByYear.length - 1] || revenueByYear[0] || 1000;
    const growth = typeof assumptions.revenueGrowth?.[0] === 'number' ? assumptions.revenueGrowth[0] : 0.05;
    revenueByYear.push(last * (1 + growth));
  }
  
  if (sliderOverrides.revenueGrowth !== undefined) {
    for (let i = 1; i < revenueByYear.length; i++) {
      revenueByYear[i] = revenueByYear[i - 1] * (1 + sliderOverrides.revenueGrowth);
    }
    console.log(
      `[generateModel] Slider override: Applied ${(sliderOverrides.revenueGrowth * 100).toFixed(1)}% revenue growth across forecast years.`
    );
  }
  if (revenueByYear.length > 0) {
    const firstRev = revenueByYear[0];
    console.log(
      `[generateModel] Revenue Y1 (USD millions): ${formatMillions(firstRev)}`
    );
  }
  
  // STEP 5: Get sector for inference
  const sector = getSector(ticker);
  console.log(`[generateModel] Sector: ${sector}`);
  
  // STEP 6: CONDITIONAL INFERENCE PROTOCOL
  console.log(`[generateModel] STEP 4: Applying CONDITIONAL INFERENCE PROTOCOL...`);
  
  // Infer D&A if missing or zero
  let daPercentOfRevenue = assumptions.daPct[0];
  if (!daPercentOfRevenue || daPercentOfRevenue <= 0) {
    const daInference = inferDAPercentage([], [], assumptions.capexPctRevenue[0], sector);
    daPercentOfRevenue = daInference.value;
    inferences.daPercentOfRevenue = daInference;
    logInferredValue('D&A % Revenue', daInference);
  }
  
  if (sliderOverrides.ebitdaMargin !== undefined) {
    const targetEbitMargin = Math.max(sliderOverrides.ebitdaMargin - daPercentOfRevenue, 0.01);
    ebitMargin = targetEbitMargin;
    console.log(
      `[generateModel] Slider override: EBITDA margin ${(sliderOverrides.ebitdaMargin * 100).toFixed(1)}% (EBIT margin ${(targetEbitMargin * 100).toFixed(1)}%).`
    );
  }
  
  // Infer CapEx if missing or zero
  let capexPercentOfRevenue = assumptions.capexPctRevenue[0];
  if (!capexPercentOfRevenue || capexPercentOfRevenue <= 0) {
    const capexInference = inferCapexPercentage([], [], sector);
    capexPercentOfRevenue = capexInference.value;
    inferences.capexPercentOfRevenue = capexInference;
    logInferredValue('CapEx % Revenue', capexInference);
  }
  
  // Infer Working Capital change
  const wcDays = (assumptions.arDays + assumptions.inventoryDays - assumptions.apDays);
  let changeInWCPercentOfRevenue = wcDays / 365 * 0.1;
  if (!isFinite(changeInWCPercentOfRevenue) || Math.abs(changeInWCPercentOfRevenue) > 0.5) {
    const wcInference = inferWorkingCapitalPercentage([], [], sector);
    changeInWCPercentOfRevenue = wcInference.value;
    inferences.changeInWCPercentOfRevenue = wcInference;
    logInferredValue('ΔWC % Revenue', wcInference);
  }
  
  // STEP 7: USER WACC PRIORITY (v7.0)
  // Note: Settings defaults are already applied in partialAssumptions, so body.wacc may already have a default
  console.log(`[generateModel] STEP 6: Applying USER WACC PRIORITY...`);
  let wacc: number;
  let waccSource: 'user-defined' | 'calculated' | 'inferred' | 'settings-default';
  
  if (body.wacc !== undefined && typeof body.wacc === 'number') {
    // Check if this was applied from settings
    const waccDefault = appliedDefaults.find(d => d.path === 'wacc');
    if (waccDefault) {
      wacc = body.wacc;
      waccSource = 'settings-default';
      console.log(`[generateModel] ✅ Using WACC from Settings: ${(wacc * 100).toFixed(2)}%`);
    } else {
      // Priority 1: User-Defined WACC
      wacc = body.wacc;
      waccSource = 'user-defined';
      console.log(`[generateModel] ✅ Using USER-DEFINED WACC: ${(wacc * 100).toFixed(2)}%`);
    }
  } else {
    // Priority 2: Inferred WACC
    const waccInference = inferWACC(sector);
    wacc = waccInference.value;
    waccSource = 'inferred';
    inferences.wacc = waccInference;
    logInferredValue('WACC', waccInference);
  }
  
  if (sliderOverrides.wacc !== undefined && body.wacc === undefined) {
    wacc = sliderOverrides.wacc;
    waccSource = 'user-defined';
    console.log(`[generateModel] Slider override: WACC ${(wacc * 100).toFixed(2)}%`);
  }
  
  // Apply scenario adjustment to WACC
  const waccAdjustment = applyScenarioToWACC(wacc, scenario);
  wacc = waccAdjustment.adjustedWACC;
  
  // Terminal Growth (check user input first, then settings default)
  let terminalGrowth: number;
  if (body.terminalGrowth !== undefined && typeof body.terminalGrowth === 'number') {
    // Check if this was applied from settings
    const tgDefault = appliedDefaults.find(d => d.path === 'terminalGrowth');
    if (tgDefault) {
      terminalGrowth = body.terminalGrowth;
      console.log(`[generateModel] ✅ Using Terminal Growth from Settings: ${(terminalGrowth * 100).toFixed(2)}%`);
    } else {
      terminalGrowth = body.terminalGrowth;
      console.log(`[generateModel] ✅ Using USER-DEFINED Terminal Growth: ${(terminalGrowth * 100).toFixed(2)}%`);
    }
  } else {
    const terminalGrowthInference = inferTerminalGrowth(sector, assumptions.revenueGrowth);
    terminalGrowth = terminalGrowthInference.value;
    inferences.terminalGrowth = terminalGrowthInference;
    logInferredValue('Terminal Growth', terminalGrowthInference);
  }
  
  // STEP 8: APPLY SCENARIO ADJUSTMENTS (v7.0)
  console.log(`[generateModel] STEP 7: Applying SCENARIO ADJUSTMENTS (${scenario})...`);
  const adjustedEstimates = applyScenarioToEstimates(bestEstimate || null, scenario);
  
  if (sliderOverrides.revenueGrowth !== undefined) {
    const overrideGrowth = clampOverride(
      sliderOverrides.revenueGrowth + (scenario === 'BULLISH' ? 0.02 : scenario === 'BEARISH' ? -0.02 : 0),
      -0.5,
      0.5
    );
    if (overrideGrowth !== undefined) {
      adjustedEstimates.adjustedRevenueGrowthY1 = overrideGrowth;
      adjustedEstimates.adjustedRevenueGrowthY2 = overrideGrowth;
      adjustedEstimates.adjustedRevenueGrowthY3 = overrideGrowth;
      adjustedEstimates.adjustmentNotes.push(
        `Revenue growth forced by slider input: ${(overrideGrowth * 100).toFixed(1)}%`
      );
    }
  }
  
  if (sliderOverrides.ebitdaMargin !== undefined) {
    const overrideMargin = clampOverride(
      sliderOverrides.ebitdaMargin + (scenario === 'BULLISH' ? 0.01 : scenario === 'BEARISH' ? -0.01 : 0),
      0,
      0.7
    );
    if (overrideMargin !== undefined) {
      adjustedEstimates.adjustedEbitdaMargin = overrideMargin;
      adjustedEstimates.adjustedOperatingMargin = overrideMargin;
      adjustedEstimates.adjustmentNotes.push(
        `EBITDA margin forced by slider input: ${(overrideMargin * 100).toFixed(1)}%`
      );
    }
  }
  
  // Apply scenario adjustments to revenue projections if we have consensus growth
  if (adjustedEstimates.adjustedRevenueGrowthY1) {
    const adjustedGrowthRates = [
      adjustedEstimates.adjustedRevenueGrowthY1,
      adjustedEstimates.adjustedRevenueGrowthY2 || adjustedEstimates.adjustedRevenueGrowthY1,
      adjustedEstimates.adjustedRevenueGrowthY3 || adjustedEstimates.adjustedRevenueGrowthY2 || adjustedEstimates.adjustedRevenueGrowthY1,
    ];
    
    // Apply to revenue projections
    const adjustedRevenue = applyScenarioToRevenueProjections(
      revenueByYear,
      scenario,
      adjustedGrowthRates
    );
    
    // Use adjusted revenue if scenario is not BASE
    if (scenario !== 'BASE') {
      revenueByYear.splice(0, revenueByYear.length, ...adjustedRevenue);
      console.log(`[generateModel] ✅ Applied ${scenario} revenue adjustments`);
    }
  }
  
  // Apply scenario adjustments to margins if available
  if (adjustedEstimates.adjustedEbitdaMargin && scenario !== 'BASE') {
    // Adjust EBIT margin based on EBITDA margin adjustment
    const marginDelta = (adjustedEstimates.adjustedEbitdaMargin || 0) - (adjustedEstimates.originalEstimates?.ebitdaMarginTarget || ebitMargin);
    ebitMargin = Math.max(0, Math.min(1, ebitMargin + marginDelta));
    console.log(`[generateModel] ✅ Applied ${scenario} margin adjustments: EBIT Margin = ${(ebitMargin * 100).toFixed(1)}%`);
  }
  
  // Log scenario adjustments
  logScenarioAdjustments(scenario, adjustedEstimates, waccAdjustment);
  
  // Build DCF inputs using new interface
  const dcfInputs: Partial<DCFInputs> = {
    ticker,
    companyName: assumptions.companyName || ticker,
    
    // Fiscal years
    years: assumptions.years,
    
    // Revenue forecast (already in millions from enrichment)
    revenueByYear,
    
    // Operating assumptions (as decimals)
    ebitMargin,
    taxRate: assumptions.taxRate,
    daPercentOfRevenue,
    changeInWCPercentOfRevenue,
    capexPercentOfRevenue,
    
    // Valuation inputs (inferred)
    wacc,
    terminalGrowth,
    
    // Balance sheet (in millions)
    netDebtMillions,
    sharesOutstandingMillions,
    sharesSource, // Track source for workbook labeling
  };

  // Log inference summary
  const inferenceSummary = createInferenceSummary(inferences);
  if (inferenceSummary.length > 0) {
    console.log(`[generateModel] ========== INFERRED ASSUMPTIONS ==========`);
    inferenceSummary.forEach(line => console.log(`[generateModel] ${line}`));
    console.log(`[generateModel] ================================================`);
  }
  
  console.log(`[generateModel] ========== DCF INPUTS DEBUG ==========`);
  console.log(`[generateModel] Ticker: ${ticker}`);
  console.log(`[generateModel] Years: ${dcfInputs.years?.join(', ')}`);
  console.log(`[generateModel] Revenue: ${dcfInputs.revenueByYear?.map(r => formatMillions(r)).join(', ')}`);
  console.log(`[generateModel] EBIT Margin: ${(ebitMargin * 100).toFixed(1)}%`);
  console.log(`[generateModel] Tax Rate: ${(dcfInputs.taxRate! * 100).toFixed(1)}%`);
  console.log(`[generateModel] D&A % Revenue: ${(dcfInputs.daPercentOfRevenue! * 100).toFixed(1)}%${inferences.daPercentOfRevenue ? ' (INFERRED)' : ''}`);
  console.log(`[generateModel] ΔWC % Revenue: ${(dcfInputs.changeInWCPercentOfRevenue! * 100).toFixed(1)}%${inferences.changeInWCPercentOfRevenue ? ' (INFERRED)' : ''}`);
  console.log(`[generateModel] Capex % Revenue: ${(dcfInputs.capexPercentOfRevenue! * 100).toFixed(1)}%${inferences.capexPercentOfRevenue ? ' (INFERRED)' : ''}`);
  console.log(`[generateModel] WACC: ${(dcfInputs.wacc! * 100).toFixed(1)}% (INFERRED)`);
  console.log(`[generateModel] Terminal Growth: ${(dcfInputs.terminalGrowth! * 100).toFixed(1)}% (INFERRED)`);
  console.log(`[generateModel] Net Debt: ${formatMillions(netDebtMillions)}`);
  console.log(`[generateModel] Shares Outstanding: ${sharesOutstandingMillions.toFixed(1)}M`);
  console.log(`[generateModel] ==========================================`);

  // Normalize and compute DCF (for diagnostics)
  const normalizedInputs = normalizeDCFInputs(dcfInputs);
  const results = computeDCFSeries(normalizedInputs);

  // Validate DCF inputs and results (tiered validation)
  const validationResult = validateDCFInputs(normalizedInputs, results, apiAttempts);
  validationResult.warnings = validationResult.warnings || [];
  validationResult.errors = validationResult.errors || [];
  logValidationResult(validationResult, ticker);

  // Only block model generation on fatal errors (isValid=false)
  // Warnings are informational and do not block download/preview
  if (!validationResult.isValid) {
    results.isValid = false;
    results.invalidReason = validationResult.reason ?? 'Validation failure';

    throw new Error(validationResult.reason || 'DCF validation failed');
  }
  
  console.log(`[generateModel] ========== DCF RESULTS DEBUG ==========`);
  console.log(`[generateModel] EBIT Year 1: ${formatMillions(results.ebitByYear[0])}`);
  console.log(`[generateModel] UFCF Year 1: ${formatMillions(results.ufcfByYear[0])}`);
  console.log(`[generateModel] PV Explicit FCF: ${formatMillions(results.pvExplicitFCF)}`);
  console.log(`[generateModel] Terminal Value: ${formatMillions(results.terminalValue)}`);
  console.log(`[generateModel] PV Terminal Value: ${formatMillions(results.pvTerminalValue)}`);
  console.log(`[generateModel] Enterprise Value: ${formatMillions(results.enterpriseValue)}`);
  console.log(`[generateModel] Net Debt: ${formatMillions(normalizedInputs.netDebtMillions)}`);
  console.log(`[generateModel] Equity Value: ${formatMillions(results.equityValue)}`);
  console.log(
    `[generateModel] Price Per Share: ${
      results.pricePerShare !== null ? `$${results.pricePerShare.toFixed(2)}` : 'N/A'
    }`
  );
  console.log(`[generateModel] ==========================================`);

  // Generate DCF workbook (uses normalized inputs/results)
  const bankerWorkbook = await generateBankerDCF(normalizedInputs, results);

  // Copy DCF Model sheet to main workbook
  const bankerSheet = bankerWorkbook.getWorksheet('DCF Model');
  if (bankerSheet) {
    const newSheet = workbook.addWorksheet('DCF Model');
    copyWorksheet(bankerSheet, newSheet);
  }
  
  // Copy RAW_INPUTS debug sheet
  const debugSheet = bankerWorkbook.getWorksheet('RAW_INPUTS');
  if (debugSheet) {
    const newDebugSheet = workbook.addWorksheet('RAW_INPUTS');
    copyWorksheet(debugSheet, newDebugSheet);
  }
  
  // STEP 9: FORMAT OUTPUT (v7.0)
  console.log(`[generateModel] STEP 8: Formatting output with Analyst AI marketing...`);
  
  const scenarioSummaryNotes = createScenarioSummary(scenario, adjustedEstimates, waccAdjustment);
  
  const dcfSummary = formatDCFOutput(
    ticker,
    scenario,
    normalizedInputs,
    results,
    waccSource,
    scenarioSummaryNotes
  );
  
  // Log formatted output to console
  logFormattedOutput(dcfSummary);
  
  // Return DCF summary for API response
  // Include both the formatted summary AND the raw results for preview parsing
  const jsonSummary = createJSONSummary(dcfSummary);
  return { 
    dcfSummary: {
      ...jsonSummary,
      results: {
        enterpriseValue: results.enterpriseValue,
        equityValue: results.equityValue,
        pricePerShare: results.pricePerShare,
        pvExplicitFCF: results.pvExplicitFCF,
        pvTerminalValue: results.pvTerminalValue,
        terminalValue: results.terminalValue,
        netDebt: normalizedInputs.netDebtMillions,
        revenueByYear: normalizedInputs.revenueByYear,
        ebitByYear: results.ebitByYear,
        ufcfByYear: results.ufcfByYear,
        revenueProjections: normalizedInputs.revenueByYear.slice(0, 3),
        ebitdaProjections: results.ebitByYear.slice(0, 3).map((ebit, i) => 
          ebit + (results.daByYear[i] || 0)
        ),
        fcfProjections: results.ufcfByYear.slice(0, 3),
      },
      assumptions: {
        ...jsonSummary.assumptions,
        taxRate: normalizedInputs.taxRate,
        projectionHorizon: normalizedInputs.years.length,
      },
    },
    validation: validationResult,
    raw: { results, normalizedInputs },
  };
}

/**
 * Build Three-Statement Model
 */
async function buildThreeStatementModelWithAssumptions(
  workbook: ExcelJS.Workbook,
  ticker: string,
  assumptions: ThreeStatementAssumptions
): Promise<void> {
  console.log(`[generateModel] Building Three-Statement for ${ticker}`);
  
  const sheet = workbook.addWorksheet('Three-Statement Model');

  // Header
  sheet.getCell('A1').value = `${ticker} - Integrated Three-Statement Model`;
  sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  sheet.mergeCells('A1:H1');

  let row = 3;

  // Years header
  sheet.getCell(row, 1).value = 'Period';
  assumptions.years.forEach((year, idx) => {
    sheet.getCell(row, idx + 2).value = year;
  });
  row++;

  // Income Statement
  sheet.getCell(row, 1).value = 'INCOME STATEMENT';
  sheet.getCell(row, 1).font = { bold: true };
  sheet.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  row++;

  // Revenue
  sheet.getCell(row, 1).value = 'Revenue';
  assumptions.revenue.forEach((val, idx) => {
    sheet.getCell(row, idx + 2).value = val;
    sheet.getCell(row, idx + 2).numFmt = '$#,##0';
  });
  row++;

  // COGS
  sheet.getCell(row, 1).value = 'COGS';
  assumptions.revenue.forEach((rev, idx) => {
    const cogs = rev * assumptions.cogsPct[idx];
    sheet.getCell(row, idx + 2).value = -cogs;
    sheet.getCell(row, idx + 2).numFmt = '$#,##0';
  });
  row++;

  // Gross Profit
  sheet.getCell(row, 1).value = 'Gross Profit';
  assumptions.revenue.forEach((rev, idx) => {
    const cogs = rev * assumptions.cogsPct[idx];
    sheet.getCell(row, idx + 2).value = rev - cogs;
    sheet.getCell(row, idx + 2).numFmt = '$#,##0';
  });
  row++;

  // Operating Expenses
  sheet.getCell(row, 1).value = 'Operating Expenses';
  assumptions.revenue.forEach((rev, idx) => {
    const opex = rev * assumptions.opexPct[idx];
    sheet.getCell(row, idx + 2).value = -opex;
    sheet.getCell(row, idx + 2).numFmt = '$#,##0';
  });
  row++;

  // D&A
  sheet.getCell(row, 1).value = 'Depreciation & Amortization';
  assumptions.revenue.forEach((rev, idx) => {
    const da = rev * assumptions.daPct[idx];
    sheet.getCell(row, idx + 2).value = -da;
    sheet.getCell(row, idx + 2).numFmt = '$#,##0';
  });
  row++;

  // EBIT
  sheet.getCell(row, 1).value = 'EBIT';
  sheet.getCell(row, 1).font = { bold: true };
  assumptions.revenue.forEach((rev, idx) => {
    const cogs = rev * assumptions.cogsPct[idx];
    const opex = rev * assumptions.opexPct[idx];
    const da = rev * assumptions.daPct[idx];
    const ebit = rev - cogs - opex - da;
    sheet.getCell(row, idx + 2).value = ebit;
    sheet.getCell(row, idx + 2).numFmt = '$#,##0';
    sheet.getCell(row, idx + 2).font = { bold: true };
  });
  row++;

  // Interest Expense (from debt schedule)
  sheet.getCell(row, 1).value = 'Interest Expense';
  // Calculate interest from average debt for each period
  let beginDebt = assumptions.debt;
  assumptions.years.forEach((_, idx) => {
    // For simplicity, use constant debt (proper debt schedule would track beginning/ending)
    const avgDebt = beginDebt;
    const interestExpense = avgDebt * assumptions.interestRate;
    sheet.getCell(row, idx + 2).value = -interestExpense;
    sheet.getCell(row, idx + 2).numFmt = '$#,##0';
  });
  row++;

  // EBT
  sheet.getCell(row, 1).value = 'EBT';
  assumptions.revenue.forEach((rev, idx) => {
    const cogs = rev * assumptions.cogsPct[idx];
    const opex = rev * assumptions.opexPct[idx];
    const da = rev * assumptions.daPct[idx];
    const ebit = rev - cogs - opex - da;
    const avgDebt = beginDebt; // Use constant debt for now
    const interestExpense = avgDebt * assumptions.interestRate;
    const ebt = ebit - interestExpense;
    sheet.getCell(row, idx + 2).value = ebt;
    sheet.getCell(row, idx + 2).numFmt = '$#,##0';
  });
  row++;

  // Taxes
  sheet.getCell(row, 1).value = 'Taxes';
  assumptions.revenue.forEach((rev, idx) => {
    const cogs = rev * assumptions.cogsPct[idx];
    const opex = rev * assumptions.opexPct[idx];
    const da = rev * assumptions.daPct[idx];
    const ebit = rev - cogs - opex - da;
    const avgDebt = beginDebt;
    const interestExpense = avgDebt * assumptions.interestRate;
    const ebt = ebit - interestExpense;
    // Tax logic: 0 if EBT < 0, otherwise EBT * taxRate
    const taxes = ebt < 0 ? 0 : ebt * assumptions.taxRate;
    sheet.getCell(row, idx + 2).value = -taxes;
    sheet.getCell(row, idx + 2).numFmt = '$#,##0';
  });
  row++;

  // Net Income
  sheet.getCell(row, 1).value = 'Net Income';
  sheet.getCell(row, 1).font = { bold: true };
  sheet.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B050' } };
  assumptions.revenue.forEach((rev, idx) => {
    const cogs = rev * assumptions.cogsPct[idx];
    const opex = rev * assumptions.opexPct[idx];
    const da = rev * assumptions.daPct[idx];
    const ebit = rev - cogs - opex - da;
    const avgDebt = beginDebt;
    const interestExpense = avgDebt * assumptions.interestRate;
    const ebt = ebit - interestExpense;
    const taxes = ebt < 0 ? 0 : ebt * assumptions.taxRate;
    const netIncome = ebt - taxes;
    sheet.getCell(row, idx + 2).value = netIncome;
    sheet.getCell(row, idx + 2).numFmt = '$#,##0';
    sheet.getCell(row, idx + 2).font = { bold: true };
    sheet.getCell(row, idx + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B050' } };
  });
  row += 2;

  // Add note about assumptions
  sheet.getCell(row, 1).value = '✓ All assumptions enriched by OpenAI - No zero values';
  sheet.getCell(row, 1).font = { italic: true, size: 10 };
  sheet.mergeCells(row, 1, row, 4);

  // Set column widths
  sheet.getColumn(1).width = 30;
  for (let i = 2; i <= assumptions.years.length + 1; i++) {
    sheet.getColumn(i).width = 15;
  }
}

/**
 * Build LBO Model
 */
async function buildLboModelWithAssumptions(
  workbook: ExcelJS.Workbook,
  ticker: string,
  assumptions: ThreeStatementAssumptions,
  normalizedFinancials?: ScaledFinancials | null,
  requestBody?: any
): Promise<LboEngineOutput> {
  console.log(`[generateModel] Building LBO for ${ticker}`);

  const sliderOverrides = requestBody?.sliderOverrides && typeof requestBody.sliderOverrides === 'object'
    ? requestBody.sliderOverrides
    : {};
  const lboOverrides = requestBody?.lboOverrides && typeof requestBody.lboOverrides === 'object'
    ? requestBody.lboOverrides
    : {};
  const advancedOptions =
    (assumptions as any).lboAdvanced ??
    (requestBody?.lboAdvanced && typeof requestBody.lboAdvanced === 'object' ? requestBody.lboAdvanced : undefined);
  const advancedMinCash = Math.max(advancedOptions?.minimumCashAtClose ?? 0, 0);

  const baseRevenue = assumptions.revenue[0] ?? normalizedFinancials?.revenueM ?? 1000;
  const baseMargin = 1 - (assumptions.cogsPct[0] ?? 0.6) - (assumptions.opexPct[0] ?? 0.2);
  const revenueGrowth = typeof sliderOverrides.revenueGrowth === 'number'
    ? sliderOverrides.revenueGrowth
    : assumptions.revenueGrowth?.[0] ?? 0.05;
  const ebitdaMargin = typeof sliderOverrides.ebitdaMargin === 'number'
    ? sliderOverrides.ebitdaMargin
    : baseMargin;
  const capexPercent = typeof lboOverrides.capexPercent === 'number'
    ? lboOverrides.capexPercent
    : assumptions.capexPctRevenue?.[0] ?? 0.04;
  const daPercent = typeof lboOverrides.daPercent === 'number'
    ? lboOverrides.daPercent
    : assumptions.daPct?.[0] ?? 0.04;
  const nwcPercent = typeof lboOverrides.nwcPercent === 'number'
    ? lboOverrides.nwcPercent
    : inferNwcPercent(assumptions);
  const taxRate = typeof sliderOverrides.taxRate === 'number'
    ? sliderOverrides.taxRate
    : assumptions.taxRate ?? 0.21;
  const entryMultipleOverride = lboOverrides.entryMultiple ?? requestBody?.entryMultiple ?? (assumptions as any).entryMultiple;
  const exitMultipleOverride = lboOverrides.exitMultiple ?? requestBody?.exitMultiple ?? (assumptions as any).exitMultiple;
  const leverageMultiple = lboOverrides.leverageMultiple ?? requestBody?.leverageMultiple ?? 4.5;
  const transactionFeesPercent = lboOverrides.transactionFeesPercent ?? 0.02;
  const minimumCashBase = typeof lboOverrides.minimumCash === 'number' ? lboOverrides.minimumCash : assumptions.startingCash ?? 50;
  const minimumCash = Math.max(minimumCashBase, advancedMinCash || 0);
  const termLoanBRate = lboOverrides.termLoanBRate ?? 0.065;
  const revolverRate = lboOverrides.revolverRate ?? 0.05;

  const { getSector } = await import('@/lib/sectorMapping');
  const sector = getSector(ticker, assumptions.assumptionNotes?.[0]);

  const excelOverrides: Partial<LBOInputs> = {
    currentStockPrice: typeof requestBody?.currentPrice === 'number' ? requestBody.currentPrice : undefined,
    offerPremium: lboOverrides.offerPremium ?? sliderOverrides.offerPremium ?? 0.3,
    basicSharesOutstanding: normalizedFinancials?.sharesOutstandingM,
    inTheMoneyOptions: typeof requestBody?.options === 'number' ? requestBody.options : undefined,
    cashOnBalance: minimumCash,
    fundCashBalance: minimumCash,
    refinanceDebt: Math.max(normalizedFinancials?.netDebtM ?? 0, 0),
    netDebt: normalizedFinancials?.netDebtM ?? undefined,
  };
  if (advancedOptions) {
    console.log('[generateModel] Advanced LBO options supplied', {
      ticker,
      ...advancedOptions,
    });
  }

  const { summary: lboSummary } = await buildLboWorkbook({
    workbook,
    ticker,
    companyName: assumptions.assumptionNotes?.[0] || ticker,
    sectorHint: sector,
    normalizedFinancials,
    sliderAssumptions: {
      revenueGrowth,
      ebitdaMargin,
      capexPercent,
      daPercent,
      nwcPercent,
      taxRate,
      entryMultiple: entryMultipleOverride,
      exitMultiple: exitMultipleOverride,
      leverageMultiple,
      transactionFeesPercent,
      offerPremium: lboOverrides.offerPremium ?? 0.3,
      forecastYears: 5,
      termLoanBRate,
      revolverRate,
      minimumCash,
    },
    excelOverrides,
    advancedOptions,
  });

  return lboSummary;
}

function inferNwcPercent(assumptions: ThreeStatementAssumptions): number {
  const revenue = assumptions.revenue[0] || 1;
  if (!revenue) {
    return 0.02;
  }
  const ar = assumptions.startingAR ?? revenue * 0.2;
  const inventory = assumptions.startingInventory ?? revenue * 0.1;
  const ap = assumptions.startingAP ?? revenue * 0.1;
  return (ar + inventory - ap) / revenue;
}

/**
 * Build Comps Model
 */
async function buildCompsModelWithAssumptions(
  workbook: ExcelJS.Workbook,
  ticker: string,
  assumptions: ThreeStatementAssumptions,
  normalizedFinancials?: ScaledFinancials | null,
  diagnostics?: DataDiagnostics[],
  requestBody?: any
): Promise<void> {
  console.log(`[generateModel] Building Comps for ${ticker}`);
  
  const { identifyPeers, mergePeerSets, cleanTickerArray } = await import('@/lib/identifyPeers');
  const { fetchAndEnrichBatch } = await import('@/lib/financialDataFetcher');
  const { buildCompsModel } = await import('@/lib/compsCalculator');
  const { generateCompsExcel } = await import('@/lib/compsExcelGenerator');

  // Get custom comps from request (if provided)
  let normalized: ReturnType<typeof normalizeInputs> | null = null;
  try {
    normalized = normalizeInputs(
      'comps',
      requestBody && typeof requestBody === 'object' ? { ...requestBody, ticker } : { ticker }
    );
  } catch {
    normalized = null;
  }

  const customComps = cleanTickerArray(
    (normalized ? normalized.tickers.filter((peer) => peer !== ticker) : []) as any
  );
  const useOnlyCustom = Boolean(
    (requestBody as any)?.useOnlyCustom ??
      (requestBody as any)?.assumptions?.useOnlyCustom ??
      (assumptions as any)?.useOnlyCustom ??
      false
  );

  // Identify peers
  let autoPeers: string[] = [];
  let peerSelectionDiagnostics;
  if (!useOnlyCustom) {
    const peerSelection = await identifyPeers(ticker);
    autoPeers = peerSelection.peers;
    peerSelectionDiagnostics = peerSelection.diagnostics;
  }

  const mergedPeers = mergePeerSets(autoPeers, customComps, useOnlyCustom);
  if (peerSelectionDiagnostics && diagnostics) {
    const peerDiag = createDiagnostic(ticker, 'comps', 'User-Input', 'fetch', true);
    if (peerSelectionDiagnostics.fallbackReason) {
      peerDiag.warnings.push(peerSelectionDiagnostics.fallbackReason);
    }
    peerDiag.rawSample = peerSelectionDiagnostics.peerDetails;
    diagnostics.push(peerDiag);
    logDiagnostic(peerDiag);
  }
  const finalPeers = mergedPeers;

  if (finalPeers.length === 0) {
    throw new Error('No comparable companies found');
  }

  // Fetch peer data
  const batchTickers = [{ ticker, source: 'auto' as const }, ...finalPeers];
  const companyData = await fetchAndEnrichBatch(batchTickers);

  const [targetCompany, ...peerCompanies] = companyData;
  if (!targetCompany) {
    throw new Error('Failed to fetch target company financials');
  }

  const target = {
    ticker: targetCompany.ticker,
    name: targetCompany.name,
    revenue: normalizedFinancials?.revenueM ?? targetCompany.revenue,
    ebitda: normalizedFinancials?.ebitdaM ?? targetCompany.ebitda,
    ebit: normalizedFinancials?.ebitM ?? targetCompany.ebit,
    netIncome: targetCompany.netIncome,
    shares: normalizedFinancials?.sharesOutstandingM ?? targetCompany.shares,
    netDebt: normalizedFinancials?.netDebtM ?? targetCompany.netDebt,
    price: targetCompany.price,
  };

  // Build comps model
  const compsModel = buildCompsModel(target, peerCompanies);

  // Generate Excel
  const compsWorkbook = await generateCompsExcel(ticker, compsModel);
  if (!compsWorkbook || typeof (compsWorkbook as any).getWorksheet !== 'function') {
    throw new Error('compsWorkbook is not a valid ExcelJS Workbook instance');
  }
  let compsSheet = compsWorkbook.getWorksheet('Comps Analysis');
  if (!compsSheet) {
    compsSheet = compsWorkbook.addWorksheet('Comps Analysis');
  }
  if (compsSheet) {
    const newSheet = workbook.addWorksheet('Comps Analysis');
    copyWorksheet(compsSheet, newSheet);
  }
}

/**
 * Main POST handler with comprehensive error handling
 */
export async function POST(req: NextRequest) {
  const metricsStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let metricsTicker: string | null = null;
  let metricsModelType: MetricsModelType | null = null;
  let metricsSuccess = false;
  let runId: string | null = null;
  const supabase = createRouteHandlerClient({ cookies });
  let modelId: string | null = null;
  let userId: string | null = null;
  const traceId = randomUUID();
  const diagnostics: DataDiagnostics[] = [];
  let enrichedAssumptions: ThreeStatementAssumptions | null = null;
  let sanitizedAssumptions: ThreeStatementAssumptions | null = null;
  
  try {
    console.log('[generateModel] ========== Incoming request ==========', { traceId });
  
  // STEP 1: Validate request body
  let cleanTicker: string;
  let modelType: RequestModelType;
  let body: any;
  let requestedLboAdvanced: LboAdvancedOptions | undefined;
  let requestScenario: Scenario = 'BASE';
  let requestScenarioNotes: string | null = null;
  let requestAssumptions: Record<string, any> | null = null;
  
  try {
    const json = await req.json();
    
    // Dev-only logging: log raw request body (truncated)
    if (process.env.NODE_ENV !== 'production') {
      const bodyPreview = JSON.stringify(json, null, 2);
      const truncated = bodyPreview.length > 2000 ? bodyPreview.substring(0, 2000) + '... (truncated)' : bodyPreview;
      console.log('[generateModel] Raw request body:', truncated);
    }
    
    const parseResult = generateModelSchema.safeParse(json);
    if (!parseResult.success) {
      // Dev-only: structured Zod error logging
      if (process.env.NODE_ENV !== 'production') {
        const issues = parseResult.error.errors.map((i) => ({
          path: i.path.join('.'),
          expected: i.expected,
          received: i.received,
          message: i.message,
          code: i.code,
        }));
        console.error('[generateModel] ❌ Zod validation failed:', JSON.stringify(issues, null, 2));
      }
      
      // Structured error response with field-level details
      const issues = parseResult.error.errors.map((i) => ({
        path: i.path.join('.') || 'root',
        expected: i.expected || 'unknown',
        received: i.received || 'unknown',
        message: i.message,
      }));
      
      const message = parseResult.error.errors.map((error) => {
        const path = error.path.join('.') || 'root';
        return `${path}: ${error.message}`;
      }).join('; ');
      
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Request body validation failed',
          details: message,
          issues: issues,
          code: 'INPUT_VALIDATION_FAILED',
          traceId,
          stage: 'validate',
          step: 'parse_body',
        },
        { status: 400 }
      );
    }
    body = parseResult.data;
    requestedLboAdvanced =
      body?.lboAdvanced && typeof body.lboAdvanced === 'object' ? body.lboAdvanced : undefined;

    // Normalize tickers for LBO/COMPS before validation so mismatched payload shapes
    // (tickerSymbol/symbol/assumptions.company.ticker/peers arrays) don't fail with "Ticker is required".
    try {
      const rawModelType =
        typeof body?.modelType === 'string'
          ? body.modelType
          : typeof body?.model_type === 'string'
            ? body.model_type
            : '';
      const normalizedModelType = rawModelType.trim().toLowerCase();
      if (normalizedModelType === 'lbo' || normalizedModelType === 'comps') {
        const normalized = normalizeInputs(normalizedModelType, body);
        body.ticker = normalized.primaryTicker;

        if (!body.assumptions || typeof body.assumptions !== 'object') {
          body.assumptions = {};
        }
        if (typeof body.assumptions.ticker !== 'string' || body.assumptions.ticker.trim().length === 0) {
          body.assumptions.ticker = normalized.primaryTicker;
        }

        // Preserve explicit peer inputs on the request body (sanitization drops unknown fields).
        if (normalizedModelType === 'comps') {
          const peers = normalized.tickers.filter((ticker) => ticker !== normalized.primaryTicker);
          if (peers.length > 0 && !Array.isArray((body as any).customComps)) {
            (body as any).customComps = peers;
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to normalize tickers';
      const code = error instanceof NormalizeInputsError ? error.code : 'INPUT_NORMALIZATION_FAILED';
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Failed to normalize request',
          details: message,
          code,
          traceId,
          stage: 'normalize',
          step: 'normalize_tickers',
        },
        { status: 400 }
      );
    }

    console.log('[generateModel] Raw body:', JSON.stringify(body, null, 2));
    
    // Normalize and consolidate duplicate fields - use camelCase canonical
    const normalizedPayload = normalizeModelRequest(body);
    const normalizedTicker = normalizeNullableString(normalizedPayload.ticker ?? body.ticker);
    const normalizedCompanyName = normalizeNullableString(
      normalizedPayload.companyName ?? body.companyName ?? body.company_name
    );

    if (!normalizedTicker && !normalizedCompanyName) {
      return NextResponse.json(
        {
          error: 'MISSING_COMPANY_CONTEXT',
          message: 'Provide at least a ticker or company name for model generation.',
          traceId,
          stage: 'validate',
          step: 'company_context',
        },
        { status: 400 }
      );
    }

    // Consolidate duplicate fields - remove snake_case duplicates, keep camelCase only
    body = {
      ...body,
      // Canonical camelCase fields
      ticker: normalizedTicker ?? body.ticker,
      modelType: normalizedPayload.modelType || body.modelType || body.model_type,
      scenario: normalizedPayload.scenario,
      scenarioAdjustmentNotes: normalizedPayload.scenario_adjustment_notes,
      scenarioSummaryNotes: normalizedPayload.scenario_summary_notes,
      assumptions: normalizedPayload.assumptions,
      companyName: normalizedCompanyName,
      // Remove duplicate snake_case fields - they cause validation confusion
      // Keep model_type temporarily for backwards compatibility, but prefer modelType
      model_type: normalizedPayload.modelType || body.modelType || body.model_type,
      scenario_adjustment_notes: normalizedPayload.scenario_adjustment_notes,
      scenario_summary_notes: normalizedPayload.scenario_summary_notes,
      company_name: normalizedCompanyName,
      // Map scenarioNotes from any source
      scenarioNotes: normalizedPayload.scenario_adjustment_notes || body.scenarioNotes || body.scenarioAdjustmentNotes || '',
    };
    
    const validated = validateRequestBody(body);
    cleanTicker = validated.ticker;
    modelType = validated.modelType;
    requestScenario = validated.scenario;
    requestAssumptions = deepClone(validated.assumptions);
    requestScenarioNotes = normalizedPayload.scenario_adjustment_notes || '';
    metricsTicker = cleanTicker;
    const metricsType = mapModelTypeToMetrics(modelType);
    if (metricsType) {
      metricsModelType = metricsType;
    }
    
    console.log('[generateModel] ✅ Request validated:', { ticker: cleanTicker, modelType });
    
    // CRITICAL: modelId must be provided and come from /api/models/create
    if (!body.modelId || typeof body.modelId !== 'string') {
      return NextResponse.json(
        { 
          error: 'Model ID is required. Call /api/models/create first to create a model record.',
          code: 'MISSING_MODEL_ID'
        },
        { status: 400 }
      );
    }

    // Create run record after validation (runModel pipeline owns LBO/COMPS run tracking)
    if (modelType !== 'lbo' && modelType !== 'comps') {
      try {
        runId = await createModelRun({
          ticker: cleanTicker,
          modelType,
          modelId: body.modelId,
          traceId,
        });
      } catch (err) {
        console.warn('[generateModel] Failed to create run record:', err);
      }
    }
  } catch (err: any) {
    console.error('[generateModel] ❌ Request validation / parsing failed:', err);
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Failed to parse or validate request body',
          details: err?.message || 'Failed to parse or validate request body',
          traceId,
          stage: 'validate',
          step: 'parse_body',
        },
        { status: 400 }
      );
    }

  // Get user ID for R2 key generation
  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('[generateModel] Failed to fetch session:', sessionError, { traceId });
      return NextResponse.json(
        {
          error: 'UNAUTHORIZED',
          details: sessionError.message,
          traceId,
        },
        { status: 401 }
      );
    }

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          error: 'UNAUTHORIZED',
          details: 'Authentication required.',
          traceId,
        },
        { status: 401 }
      );
    }

    userId = session.user.id;
    console.log('[generateModel][SESSION]', { traceId, userId });

    // CRITICAL: Verify model exists in database before generating
    modelId = body.modelId;
    const { data: existingModel, error: fetchError } = await supabase
      .from('models')
      .select('id, user_id, ticker, model_type, scenario, scenario_adjustment_notes, scenario_summary_notes, assumptions')
      .eq('id', modelId)
      .eq('user_id', userId)
      .maybeSingle();

    console.log('[generateModel][MODEL_LOOKUP]', {
      traceId,
      modelId,
      userId,
      found: Boolean(existingModel),
    });

    if (fetchError) {
      console.error('[generateModel] Database error checking model:', fetchError, { traceId, modelId });
      return NextResponse.json(
        { error: 'DATABASE_ERROR', details: fetchError.message, traceId },
        { status: 500 }
      );
    }

    if (!existingModel) {
      console.warn('[generateModel] Model not found', {
        traceId,
        modelId,
        userId,
        hint: 'Likely RLS/user_id mismatch or stale modelId',
      });
      return NextResponse.json(
        {
          error: 'MODEL_NOT_FOUND',
          details: 'Model record does not exist. Call /api/models/create first.',
          traceId,
        },
        { status: 404 }
      );
    }

    // Verify user owns the model
    if (existingModel.user_id !== userId) {
      return NextResponse.json(
        { error: 'FORBIDDEN', details: 'Model belongs to a different user.', traceId },
        { status: 403 }
      );
    }

    // Canonical modelType and scenario after DB fetch
    const resolvedModelTypeRaw =
      (typeof body?.modelType === 'string' && body.modelType.trim()) ||
      (typeof body?.model_type === 'string' && body.model_type.trim()) ||
      (typeof (existingModel as any)?.model_type === 'string' && (existingModel as any).model_type.trim()) ||
      (typeof (existingModel as any)?.type === 'string' && (existingModel as any).type.trim()) ||
      'dcf';
    const allowedTypes: RequestModelType[] = ['three-statement', 'dcf', 'comps'];
    modelType = allowedTypes.includes(resolvedModelTypeRaw as RequestModelType)
      ? (resolvedModelTypeRaw as RequestModelType)
      : 'dcf';

    if (modelType === 'lbo') {
      return NextResponse.json(
        {
          error: 'INVALID_LBO_INPUTS',
          message: 'Use /api/models/lbo for LBO generation.',
          traceId,
        },
        { status: 400 }
      );
    }

    const resolvedScenarioRaw =
      (typeof body?.scenario === 'string' && body.scenario.trim()) ||
      (typeof body?.assumptions?.scenario === 'string' && body.assumptions.scenario.trim()) ||
      (typeof existingModel.scenario === 'string' && existingModel.scenario.trim()) ||
      'BASE';
    requestScenario =
      (resolvedScenarioRaw.toUpperCase() as Scenario) in { BASE: 1, BULL: 1, BULLISH: 1, BEAR: 1, BEARISH: 1 }
        ? (resolvedScenarioRaw.toUpperCase() as Scenario)
        : 'BASE';

    console.log('[generateModel] ✅ Model verified:', { traceId, modelId, ticker: existingModel.ticker, modelType, requestScenario });

    requestScenarioNotes =
      requestScenarioNotes ??
      existingModel.scenario_adjustment_notes ??
      '';
    body.scenarioNotes =
      body.scenarioNotes ??
      body.scenario_summary_notes ??
      body.scenarioSummaryNotes ??
      existingModel.scenario_summary_notes ??
      '';

    // Update status to show work-in-progress
    let generatingQuery = supabase
      .from('models')
      .update({
        status: 'generating',
        updated_at: new Date().toISOString(),
      })
      .eq('id', modelId);
    if (userId) {
      generatingQuery = generatingQuery.eq('user_id', userId);
    }
    const { error: generatingError } = await generatingQuery;
    if (generatingError) {
      console.error('[generateModel] Unable to set status=generating:', generatingError, { traceId, modelId });
    }
  } catch (err) {
    console.warn('[generateModel] Failed to verify model:', err, { traceId, modelId });
    return NextResponse.json(
      { error: 'Failed to verify model', traceId },
      { status: 500 }
    );
  }

  // STEP 2: Fetch financial data
  let ltmFinancials: any = null;
  let normalizedFinancials: ScaledFinancials | null = null;
  const fetchDiag = createDiagnostic(cleanTicker, modelType as any, 'Unknown', 'fetch', true);
  const fetchStartTime = Date.now();
  
  try {
    ltmFinancials = await getOrFetchFinancialsSafe(cleanTicker);
    fetchDiag.durationMs = Date.now() - fetchStartTime;
    
    if (ltmFinancials) {
      fetchDiag.dataSource = ltmFinancials.dataSource as any;
      console.log(`[generateModel] ✅ Financial data fetched successfully`);
    } else {
      fetchDiag.ok = false;
      fetchDiag.warnings.push('No financial data available, will use AI fallback');
      console.log(`[generateModel] ⚠️  No financial data, using AI fallback`);
    }
    
    logDiagnostic(fetchDiag);
    diagnostics.push(fetchDiag);
  } catch (err: any) {
    fetchDiag.ok = false;
    fetchDiag.durationMs = Date.now() - fetchStartTime;
    fetchDiag.errors.push(err?.message || 'Unknown error fetching financial data');
    console.error('[generateModel] ❌ Financial data fetch failed:', err);
    logDiagnostic(fetchDiag);
    diagnostics.push(fetchDiag);
    // Continue with AI fallback
  }

  // STEP 2B: Build deterministic unified assumptions for all models
  try {
    const unifiedAssumptions = await buildUnifiedAssumptionsFromPolygon(
      cleanTicker,
      ltmFinancials ?? undefined,
      { lboAdvanced: requestedLboAdvanced }
    );
    const fallbackEbit =
      typeof ltmFinancials?.ebit === 'number' ? ltmFinancials.ebit : unifiedAssumptions.ltmEbitda * 0.9;
    const fallbackFcf =
      typeof (ltmFinancials as any)?.freeCashFlow === 'number'
        ? (ltmFinancials as any).freeCashFlow
        : typeof ltmFinancials?.netIncome === 'number'
        ? ltmFinancials.netIncome
        : unifiedAssumptions.ltmEbitda * 0.6;
    const fallbackMarketCap =
      typeof ltmFinancials?.marketCap === 'number' && ltmFinancials.marketCap > 0
        ? ltmFinancials.marketCap
        : unifiedAssumptions.sharePrice * unifiedAssumptions.fdShares;

    const revenueM = toUsdMillions(unifiedAssumptions.ltmRevenue);
    const ebitdaM = toUsdMillions(unifiedAssumptions.ltmEbitda);
    const ebitM = toUsdMillions(fallbackEbit);
    const fcfM = toUsdMillions(fallbackFcf);
    const netDebtM = toUsdMillions(unifiedAssumptions.netDebt);
    const sharesOutstandingM = toMillionShares(unifiedAssumptions.fdShares);
    const marketCapM = toUsdMillions(fallbackMarketCap);

    normalizedFinancials = {
      revenueM,
      ebitdaM,
      ebitM,
      fcfM,
      netDebtM,
      sharesOutstandingM,
      marketCapM,
    };
  } catch (err: any) {
    console.error('[generateModel] ❌ Failed to build unified assumptions:', err);
    throw new Error(err?.message || 'Unable to prepare financial inputs');
  }

  // STEP 3: Load settings and apply defaults (MUST BE BEFORE buildDcfModelWithAssumptions)
  let settings: any;
  let appliedDefaults: any[] = [];
  try {
    settings = await getSettings();
    console.log('[generateModel] ✅ Settings loaded');
  } catch (err: any) {
    console.warn('[generateModel] ⚠️  Failed to load settings, using defaults:', err);
    // Continue without settings - will use system defaults
  }

  // STEP 3B: Build partial assumptions
  let partialAssumptions: PartialThreeStatementAssumptions;
  try {
    partialAssumptions = buildPartialAssumptions(body, ltmFinancials);
    
    // Apply settings defaults to partial assumptions
    if (settings) {
      const { effectiveInputs, appliedDefaults: defaults } = applyDefaultsToModelInputs(
        modelType === 'dcf' ? 'dcf' : modelType === 'lbo' ? 'lbo' : 'three-statement',
        partialAssumptions,
        settings
      );
      partialAssumptions = effectiveInputs as PartialThreeStatementAssumptions;
      appliedDefaults = defaults;
      if (defaults.length > 0) {
        console.log('[generateModel] ✅ Applied defaults:', defaults.map(d => `${d.path}=${d.value}`).join(', '));
      }
    }
    
    console.log('[generateModel] ✅ Partial assumptions built');
  } catch (err: any) {
    console.error('[generateModel] ❌ Failed to build partial assumptions:', err);
    throw new Error(err?.message || 'Failed to build assumptions');
  }

  // STEP 4: Enrich assumptions with OpenAI
  const aiFallbackDiag = createDiagnostic(cleanTicker, modelType as any, 'AI-Fallback', 'ai-fallback', true);
  const aiStartTime = Date.now();
  
  try {
    console.log('[generateModel] Enriching assumptions with OpenAI...');
    enrichedAssumptions = await enrichUnifiedAssumptions({
      ticker: cleanTicker,
      companyName: ltmFinancials?.companyName || body.companyName,
      sector: body.sector,
      modelType,
      currency: body.currency || 'USD',
      partialAssumptions,
      userNotes: body.scenarioNotes,
    });
    
    aiFallbackDiag.durationMs = Date.now() - aiStartTime;
    aiFallbackDiag.usedAiFallback = true;
    console.log('[generateModel] ✅ Assumptions enriched successfully');
    logDiagnostic(aiFallbackDiag);
    diagnostics.push(aiFallbackDiag);
  } catch (err: any) {
    aiFallbackDiag.ok = false;
    aiFallbackDiag.durationMs = Date.now() - aiStartTime;
    aiFallbackDiag.errors.push(err?.message || 'AI enrichment failed');
    console.error('[generateModel] ❌ AI enrichment failed:', err);
    logDiagnostic(aiFallbackDiag);
    diagnostics.push(aiFallbackDiag);
    throw new Error(err?.message || 'AI enrichment failed');
  }

  if (!enrichedAssumptions) {
    return NextResponse.json(
      {
        error: 'ENRICHMENT_FAILED',
        message: 'Assumptions enrichment did not produce a result',
        traceId,
        stage: 'compute',
        step: 'enrich_assumptions',
      },
      { status: 500 }
    );
  }

  // Delegate COMPS generation to the unified runModelPipeline.
  // Note: This happens after enrichment but before sanitization, so we use enrichedAssumptions
  if (modelType === 'comps') {
    try {
      const { runCompsPipeline } = await import('@/lib/models/comps/pipeline');
      
      // Convert to canonical input format
      // Use enrichedAssumptions since sanitization hasn't happened yet
      const canonicalInput = {
        modelType: 'comps' as const,
        tickers: [cleanTicker],
        assumptions: {
          ...enrichedAssumptions,
          ...body,
          ticker: cleanTicker,
        },
        options: {
          includeExcel: true,
          includePreview: true,
        },
      };
      
      // Run pipeline
      const pipelineResult = await runCompsPipeline(canonicalInput, {
        traceId,
        modelId: modelId || undefined,
        normalizedFinancials,
        requestBody: body,
      });
      
      metricsSuccess = true;
      
      // Convert pipeline output to legacy response format for backward compatibility
      const downloadUrl = pipelineResult.artifact?.downloadUrl || null;
      const preview = pipelineResult.preview || null;
      
      // Update model record with results
      if (modelId && supabase && userId) {
        try {
          await supabase
            .from('models')
            .update({
              status: pipelineResult.status === 'success' ? 'ready' : 'partial',
              preview: preview ? JSON.stringify(preview) : null,
              results: JSON.stringify({
                modelType,
                ticker: cleanTicker,
                downloadUrl,
                preview,
                warnings: pipelineResult.warnings || [],
              }),
              updated_at: new Date().toISOString(),
            })
            .eq('id', modelId)
            .eq('user_id', userId);
        } catch (dbError) {
          console.warn('[generateModel] Failed to update model record', dbError);
        }
      }
      
      return NextResponse.json({
        success: true,
        modelId: pipelineResult.modelId || modelId,
        status: pipelineResult.status === 'success' ? 'ready' : 'partial',
        ticker: cleanTicker,
        modelType,
        scenario: requestScenario,
        downloadUrl,
        preview,
        warnings: pipelineResult.warnings || [],
      });
    } catch (error: any) {
      // Use handleModelError - should always be defined due to import sanity check
      try {
        return handleModelError(error, {
          traceId,
          modelType: 'comps',
          defaultStage: 'compute',
          defaultStep: 'run_pipeline',
        });
      } catch (handlerError) {
        console.error('[GENERATE_MODEL_ERROR] handleModelError failed', handlerError);
        // Fall through to inline handler
      }
      
      // Inline error handler fallback - NO stack traces in response
      const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'string' 
          ? error 
          : 'Pipeline execution failed';
      const errorDetails = stringifyErrorDetails((error as any)?.details) || stringifyErrorDetails(error);
      
      // Log stack trace server-side (dev only) but never include in response
      if (error instanceof Error && process.env.NODE_ENV === 'development') {
        console.error('[generateModel] Pipeline error stack (server-side only):', error.stack);
      }
      
      console.error('[GENERATE_MODEL_ERROR_INLINE]', {
        message: errorMessage,
        traceId,
        modelType: modelType as 'lbo' | 'comps',
      });
      
      // Response includes only user-friendly message, never stack traces
      const fieldErrors =
        error && typeof error === 'object' && 'fieldErrors' in error ? (error as any).fieldErrors : undefined;
      const warnings =
        error && typeof error === 'object' && 'warnings' in error ? (error as any).warnings : undefined;
      
      return NextResponse.json(
        {
          error: 'PIPELINE_EXECUTION_FAILED',
          message: errorMessage,
          ...(errorDetails && !errorDetails.includes('at ') ? { details: errorDetails } : {}),
          traceId,
          stage: 'compute',
          step: 'run_pipeline',
          ...(fieldErrors ? { fieldErrors } : {}),
          ...(warnings ? { warnings } : {}),
        },
        { status: 500 }
      );
    }
  }

  // STEP 5: Sanitize assumptions
  const sanitizeDiag = createDiagnostic(cleanTicker, modelType as any, ltmFinancials?.dataSource as any || 'AI-Fallback', 'sanitize', true);
  const sanitizeStartTime = Date.now();
  
  console.log('[generateModel] Sanitizing assumptions...');
  const sanitizeResult = safeSanitizeAssumptions(enrichedAssumptions);
  sanitizeDiag.durationMs = Date.now() - sanitizeStartTime;
  
  if (!sanitizeResult.ok) {
    // Sanitization failed - return error response safely
    sanitizeDiag.ok = false;
    sanitizeDiag.errors.push(sanitizeResult.error || 'Sanitization failed');
    if (sanitizeResult.details) {
      sanitizeDiag.errors.push(sanitizeResult.details);
    }
    console.error('[generateModel] ❌ Sanitization/validation failed:', sanitizeResult.error, sanitizeResult.details);
    logDiagnostic(sanitizeDiag);
    diagnostics.push(sanitizeDiag);
    
    // Return structured error response without referencing uninitialized variables
    return NextResponse.json(
      {
        error: 'Failed to generate model',
        details: sanitizeResult.details || sanitizeResult.error || 'Invalid financial assumptions',
        traceId,
        stage: 'validate',
        step: 'sanitize_assumptions',
      },
      { status: 500 }
    );
  }
  
  // Sanitization succeeded - use the sanitized value
  sanitizedAssumptions = sanitizeResult.value;
  
  // Log sanitization results (for debugging)
  try {
    // Re-run sanitize to get warnings/errors for diagnostics (safe since we know it succeeded)
    const sanitizationResult = sanitizeAssumptions(enrichedAssumptions);
    const sanitizationLog = formatSanitizationLog(sanitizationResult);
    if (sanitizationLog) {
      console.log(`[generateModel] Sanitization results:\n${sanitizationLog}`);
    }
    
    // Add sanitization warnings/errors to diagnostics
    if (sanitizationResult.errors.length > 0) {
      sanitizeDiag.errors.push(...sanitizationResult.errors.map(e => e.issue));
    }
    if (sanitizationResult.warnings.length > 0) {
      sanitizeDiag.warnings.push(...sanitizationResult.warnings.map(w => w.issue));
    }
  } catch {
    // Ignore errors in diagnostics logging - sanitization already succeeded
  }
  
  // Apply normalized financials and LBO advanced options to sanitized assumptions
  if (normalizedFinancials) {
    sanitizedAssumptions.sharesOutstanding = normalizedFinancials.sharesOutstandingM || sanitizedAssumptions.sharesOutstanding;
    (sanitizedAssumptions as any).netDebt = normalizedFinancials.netDebtM;
    sanitizedAssumptions.debt = normalizedFinancials.netDebtM + sanitizedAssumptions.startingCash;
  }
  if (requestedLboAdvanced) {
    (sanitizedAssumptions as any).lboAdvanced = requestedLboAdvanced;
  }
  
  console.log('[generateModel] ✅ Assumptions sanitized and validated');
  logDiagnostic(sanitizeDiag);
  diagnostics.push(sanitizeDiag);

  // STEP 6: Perform sanity checks
  // Guard: sanitizedAssumptions must be non-null at this point
  if (!sanitizedAssumptions) {
    return NextResponse.json(
      {
        error: 'Failed to generate model',
        details: 'Assumptions were not sanitized successfully',
        traceId,
      },
      { status: 500 }
    );
  }

  const sanityDiag = performSanityChecks({
    ticker: cleanTicker,
    modelType: modelType as any,
    dataSource: ltmFinancials?.dataSource as any || 'AI-Fallback',
    revenue: sanitizedAssumptions.revenue,
    grossMargin: 1 - sanitizedAssumptions.cogsPct[0],
    ebitMargin: 1 - sanitizedAssumptions.cogsPct[0] - sanitizedAssumptions.opexPct[0] - sanitizedAssumptions.daPct[0],
    taxRate: sanitizedAssumptions.taxRate,
    capexPctRevenue: sanitizedAssumptions.capexPctRevenue[0],
  });
  diagnostics.push(sanityDiag);

  // STEP 7: Generate Excel model
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;
  workbook.calcProperties.fullCalcOnLoad = true;

  let dcfSummary: any = undefined;
  let lboSummary: LboEngineOutput | undefined;
  let validationSummary: { reason?: string | null; errors?: any[]; warnings?: any[] } | null = null;
  let dcfRaw: { results: any; normalizedInputs: any } | null = null;
  
  try {
    console.log('[generateModel] Building Excel workbook...');
    
    switch (modelType) {
      case 'three-statement':
        await buildThreeStatementModelWithAssumptions(workbook, cleanTicker, sanitizedAssumptions);
        break;
      case 'dcf':
        // PREFLIGHT: Resolve shares outstanding (BEST EFFORT - not mandatory)
        const { resolveSharesOutstanding } = await import('@/lib/data/sharesOutstanding');
        const sharesResult = await resolveSharesOutstanding(cleanTicker);
        
        // Log shares outstanding resolution status
        if (sharesResult.success && sharesResult.sharesOutstandingMm && sharesResult.sharesOutstandingMm > 0) {
          console.log(`[generateModel] ✅ Shares outstanding resolved: ${sharesResult.sharesOutstandingMm.toFixed(2)}M (source: ${sharesResult.source}, confidence: ${sharesResult.confidence})`);
          
          // Inject resolved shares into assumptions if not already present
          if (!sanitizedAssumptions.sharesOutstanding || sanitizedAssumptions.sharesOutstanding <= 0) {
            sanitizedAssumptions.sharesOutstanding = sharesResult.sharesOutstandingMm; // keep in millions
          }
          
          // Also update normalizedFinancials if available
          if (normalizedFinancials && (!normalizedFinancials.sharesOutstandingM || normalizedFinancials.sharesOutstandingM <= 0)) {
            normalizedFinancials.sharesOutstandingM = sharesResult.sharesOutstandingMm;
          }
        } else {
          // Shares outstanding missing - log warning but continue
          console.warn(`[generateModel] ⚠️  Shares outstanding unavailable for ${cleanTicker}`);
          console.warn(`[generateModel] Sources attempted: ${sharesResult.warnings.join('; ')}`);
          console.warn(`[generateModel] Per-share metrics will be disabled in preview`);
          
          // Set to null/0 to signal unavailability
          sanitizedAssumptions.sharesOutstanding = 0;
          if (normalizedFinancials) {
            normalizedFinancials.sharesOutstandingM = 0;
          }
        }
        
        const dcfResult = await buildDcfModelWithAssumptions(
          workbook,
          cleanTicker,
          sanitizedAssumptions,
          body,
          requestScenario,
          normalizedFinancials,
          appliedDefaults,
          modelType
        );
        dcfSummary = dcfResult.dcfSummary;
        validationSummary = dcfResult.validation ?? null;
        dcfRaw = dcfResult.raw ?? null;
        break;
      case 'lbo':
        // DEPRECATED: LBO is now handled by pipeline above (lines 1352-1428)
        // This case should not be reached, but kept as fallback
        console.warn('[generateModel] LBO reached legacy switch case - this should not happen');
        throw new Error('LBO model generation should use pipeline (see lines 1352-1428). This is a fallback error.');
      case 'comps':
        // DEPRECATED: Comps is now handled by pipeline above (lines 1352-1428)
        // This case should not be reached, but kept as fallback
        console.warn('[generateModel] Comps reached legacy switch case - this should not happen');
        throw new Error('Comps model generation should use pipeline (see lines 1352-1428). This is a fallback error.');
      default:
        throw new Error(`Unsupported model type: ${modelType}`);
    }
    
    console.log('[generateModel] ✅ Excel workbook built successfully');

  } catch (err: any) {
    console.error('[generateModel] ❌ Model generation failed:', err);
    
    const errorDiag = createDiagnostic(cleanTicker, modelType as any, 'Unknown', 'post-process', false);
    errorDiag.errors.push(err?.message || 'Model generation failed');
    logDiagnostic(errorDiag);
    diagnostics.push(errorDiag);
    throw new Error(err?.message || 'Model generation failed');
  }

  // Validate workbook has at least one worksheet
  if (workbook.worksheets.length === 0) {
    throw new Error('Workbook generated without any worksheets');
  }

  // STEP 8: Evaluate guardrails (if settings available)
  let guardrailResult: { warnings: string[]; blocks: string[] } = { warnings: [], blocks: [] };
  if (settings) {
    try {
      // Build output object for guardrail evaluation
      // Extract values from DCF summary or LBO summary
      const outputs: any = {};
      
      if (modelType === 'dcf' && dcfSummary) {
        // Extract from dcfSummary if available
        outputs.wacc = dcfSummary.wacc || dcfSummary.valuationResults?.wacc;
        outputs.terminalGrowth = dcfSummary.terminalGrowth || dcfSummary.valuationResults?.terminalGrowth;
      } else if (modelType === 'lbo' && lboSummary) {
        outputs.irr = lboSummary.irr;
        outputs.leverageMultiple = lboSummary.leverageMultiple;
        outputs.sourcesUses = lboSummary.sourcesUses;
      }
      
      guardrailResult = evaluateGuardrails(
        modelType === 'dcf' ? 'dcf' : modelType === 'lbo' ? 'lbo' : 'three-statement',
        outputs,
        settings
      );
      
      if (guardrailResult.blocks.length > 0) {
        console.warn('[generateModel] ⚠️  Guardrails blocked generation:', guardrailResult.blocks);
        if (modelId) {
          let failQuery = supabase
            .from('models')
            .update({
              status: 'failed',
              error: guardrailResult.blocks.join('; '),
            })
            .eq('id', modelId);
          if (userId) {
            failQuery = failQuery.eq('user_id', userId);
          }
          await failQuery;
        }
        return NextResponse.json(
          {
            error: 'Model outputs violate guardrails',
            blocks: guardrailResult.blocks,
            warnings: guardrailResult.warnings,
          },
          { status: 400 }
        );
      }
      
      if (guardrailResult.warnings.length > 0) {
        console.log('[generateModel] ⚠️  Guardrail warnings:', guardrailResult.warnings);
      }
    } catch (err: any) {
      console.warn('[generateModel] ⚠️  Guardrail evaluation failed:', err);
      // Continue - guardrails are warnings, not blockers
    }
  }

  // Generate preview before writing buffer
  const preview = generatePreviewFromWorkbook(workbook, modelType);
  console.log('[MODEL_DEBUG] Preview generated:', preview ? `${preview.rows.length} rows, ${preview.columns.length} columns` : 'null');

  const downloadBufferRaw = await workbook.xlsx.writeBuffer();
  const workbookBuffer = Buffer.isBuffer(downloadBufferRaw)
    ? downloadBufferRaw
    : Buffer.from(downloadBufferRaw);

  // Validate buffer is a valid XLSX (starts with PK signature)
  if (workbookBuffer.length < 4 || workbookBuffer[0] !== 0x50 || workbookBuffer[1] !== 0x4B) {
    throw new Error('Generated workbook buffer is not a valid XLSX file (missing PK signature)');
  }

  metricsSuccess = true;

  console.log('[MODEL_DEBUG] sheets:', workbook.worksheets.map((sheet) => sheet.name));
  console.log('[MODEL_DEBUG] buffer size:', workbookBuffer.length, 'bytes');

  if (!modelId) {
    throw new Error('Model verification state missing (no modelId)');
  }

  const safeKeyTicker = cleanTicker.replace(/[^A-Z0-9]+/gi, '').toUpperCase() || 'MODEL';
  const downloadFilename = `${cleanTicker}-${modelType}.xlsx`;
  
  // STEP 9: Upload to R2 and update model record
  // modelId is already verified above (comes from /api/models/create)
  const r2Key = `models/${modelId}/${safeKeyTicker}-${modelType}.xlsx`;
  let effectiveR2Key: string | null = r2Key;
  let localDownloadUrl: string | null = null;
  let localExportPath: string | null = null;

  const missingR2Env = checkR2Env();
  const canUseLocalExport = process.env.NODE_ENV !== 'production';

  if (missingR2Env.length > 0) {
    if (!canUseLocalExport) {
      console.error('[generateModel] ❌ R2 environment variables missing:', missingR2Env);
      if (modelId) {
        let envFailQuery = supabase
          .from('models')
          .update({
            status: 'failed',
            error: 'R2 configuration missing',
          })
          .eq('id', modelId);
        if (userId) {
          envFailQuery = envFailQuery.eq('user_id', userId);
        }
        await envFailQuery;
      }
      return NextResponse.json(
        {
          error: 'R2_ENV_MISSING',
          details: 'Cloud storage is not configured. Set R2 env vars to enable downloads.',
          missing: missingR2Env,
        },
        { status: 500 }
      );
    }

    console.warn('[generateModel] ⚠️  R2 env missing; using local export fallback', { missing: missingR2Env });
    try {
      effectiveR2Key = null;
      const localDir = path.resolve(process.cwd(), '.local-model-exports', modelId);
      await mkdir(localDir, { recursive: true });
      localExportPath = path.join(localDir, downloadFilename);
      await writeFile(localExportPath, workbookBuffer);
      localDownloadUrl = new URL(`/api/models/${encodeURIComponent(modelId)}/download-local`, req.nextUrl.origin).toString();
    } catch (localErr: any) {
      console.error('[generateModel] ❌ Local export failed', { message: localErr?.message, traceId, modelId });
      if (modelId) {
        let failQuery = supabase
          .from('models')
          .update({
            status: 'failed',
            error: localErr?.message || 'Local export failed',
          })
          .eq('id', modelId);
        if (userId) {
          failQuery = failQuery.eq('user_id', userId);
        }
        await failQuery;
      }
      return NextResponse.json(
        {
          error: 'LOCAL_EXPORT_FAILED',
          details: localErr?.message || 'Failed to write local Excel export.',
          traceId,
        },
        { status: 500 }
      );
    }
  } else {
    // Strict R2 env check (should pass since missingR2Env is empty)
    assertR2Env();

    try {
      await uploadXlsxToR2({
        key: r2Key,
        buffer: workbookBuffer,
        filename: downloadFilename,
      });
    } catch (r2Error: any) {
      console.error('[R2] upload/sign failed', {
        message: r2Error?.message,
        name: r2Error?.name,
        code: r2Error?.code,
        stack: r2Error?.stack,
      });
      if (modelId) {
        let failQuery = supabase
          .from('models')
          .update({
            status: 'failed',
            error: r2Error?.message || 'Model generation failed',
          })
          .eq('id', modelId);
        if (userId) {
          failQuery = failQuery.eq('user_id', userId);
        }
        await failQuery;
      }
      return NextResponse.json(
        {
          error: 'R2_UPLOAD_FAILED',
          details: r2Error?.message || 'Failed to upload Excel export to storage.',
          traceId,
        },
        { status: 500 }
      );
    }
  }

  const statementsPayload =
    modelType === 'three-statement' && sanitizedAssumptions
      ? (() => {
          const years = sanitizedAssumptions.years || [];
          const periods = ['LTM', ...years.slice(1).map((y: string) => `FY+${y}`)];
          const revenue = sanitizedAssumptions.revenue || [];
          const cogs = revenue.map((rev: number, idx: number) => rev * (sanitizedAssumptions.cogsPct?.[idx] || 0));
          const grossProfit = revenue.map((rev: number, idx: number) => rev - cogs[idx]);
          const operatingExpenses = revenue.map((rev: number, idx: number) => rev * (sanitizedAssumptions.opexPct?.[idx] || 0));
          const da = revenue.map((rev: number, idx: number) => rev * (sanitizedAssumptions.daPct?.[idx] || 0));
          const ebit = revenue.map((rev: number, idx: number) => grossProfit[idx] - operatingExpenses[idx] - da[idx]);
          const ebitda = ebit.map((val: number, idx: number) => val + da[idx]);
          // Debt schedule: calculate interest from average debt
          const debt = (sanitizedAssumptions.debt || 0) * 1_000_000; // Convert to raw dollars
          const interestRate = sanitizedAssumptions.interestRate || 0.05;
          // For simplicity, use constant debt (will be improved with proper debt schedule)
          const avgDebt = debt;
          const interestExpense = avgDebt * interestRate;
          const ebt = ebit.map((val: number) => val - interestExpense);
          // Tax logic: 0 if EBT < 0, otherwise EBT * taxRate
          const taxRate = sanitizedAssumptions.taxRate || 0.21;
          const taxes = ebt.map((val: number) => val < 0 ? 0 : val * taxRate);
          const netIncome = ebt.map((val: number, idx: number) => val - taxes[idx]);
          const capex = revenue.map((rev: number, idx: number) => rev * (sanitizedAssumptions.capexPctRevenue?.[idx] || 0.04));
          const operatingCashFlow = netIncome.map((ni: number, idx: number) => ni + da[idx]);
          const investingCashFlow = capex.map((cap: number) => -cap);
          const financingCashFlow = years.map(() => 0);
          const netChangeInCash = operatingCashFlow.map((ocf: number, idx: number) => ocf + investingCashFlow[idx] + financingCashFlow[idx]);
          const startingCash = (normalizedFinancials?.cashM || 0) * 1_000_000;
          const cash = [startingCash];
          netChangeInCash.slice(1).forEach((change: number) => {
            cash.push((cash[cash.length - 1] || 0) + change);
          });
          const ppeEstimate = revenue.map((rev: number) => rev * 0.5);
          const totalAssets = cash.map((c: number, idx: number) => c + ppeEstimate[idx]);
          const totalLiabilities = years.map(() => (sanitizedAssumptions.debt || 0) * 1_000_000);
          const totalEquity = totalAssets.map((assets: number, idx: number) => assets - totalLiabilities[idx]);
          return {
            periods,
            incomeStatement: {
              revenue,
              cogs,
              grossProfit,
              operatingExpenses,
              ebitda,
              ebit,
              netIncome,
            },
            cashFlow: {
              operatingCashFlow,
              investingCashFlow,
              financingCashFlow,
              netChangeInCash,
            },
            balanceSheet: {
              cash,
              totalAssets,
              totalLiabilities,
              totalEquity,
            },
          };
        })()
      : null;

  const scenarioSummaryNotes = (() => {
    const adjustments = dcfSummary?.scenarioAdjustments;
    if (Array.isArray(adjustments) && adjustments.length > 0) {
      return adjustments;
    }
    if (body?.scenarioNotes && typeof body.scenarioNotes === 'string' && body.scenarioNotes.length > 0) {
      return body.scenarioNotes;
    }
    if (requestScenarioNotes && requestScenarioNotes.length > 0) {
      return requestScenarioNotes;
    }
    return null;
  })();
  const scenarioSummaryNotesValue = Array.isArray(scenarioSummaryNotes)
    ? scenarioSummaryNotes.join('\n')
    : scenarioSummaryNotes ?? '';

  const dcfResults = dcfSummary?.results ?? dcfRaw?.results ?? null;
  const dcfNormalized = dcfRaw?.normalizedInputs ?? null;
  const resultsPayload: Record<string, any> = {
    preview,
    modelType,
    ticker: cleanTicker,
    scenario: requestScenario,
    scenarioNotes: scenarioSummaryNotes,
    export_mode: effectiveR2Key ? 'r2' : 'local',
    download_url: localDownloadUrl ?? undefined,
    local_path: localExportPath ?? undefined,
    warnings: guardrailResult.warnings,
    sheets: workbook.worksheets.map((sheet) => sheet.name),
    filename: downloadFilename,
    assumptionsUsed: requestAssumptions ?? null,
    isValid: true,
    invalidReason: null,
    validation: validationSummary
      ? {
          reason: validationSummary.reason ?? null,
          errors: (validationSummary.errors || []).map((err: any) =>
            typeof err === 'string' ? err : `${err.field ?? 'field'}: ${err.issue ?? err.message ?? 'invalid'}`
          ),
          warnings: (validationSummary.warnings || []).map((warn: any) =>
            typeof warn === 'string' ? warn : `${warn.field ?? 'field'}: ${warn.issue ?? warn.message ?? 'warning'}`
          ),
        }
      : { reason: null, errors: [], warnings: [] },
    results: dcfResults
      ? {
          ...dcfResults,
          revenueByYear: dcfNormalized?.revenueByYear ?? dcfResults.revenueByYear,
          netDebt: dcfNormalized?.netDebtMillions ?? dcfResults.netDebt,
          sharesOutstanding: dcfNormalized?.sharesOutstandingMillions ?? dcfResults.sharesOutstanding,
          isValid: true,
          invalidReason: null,
        }
      : undefined,
  };

  if (dcfSummary) {
    resultsPayload.dcfSummary = dcfSummary;
  }

  if (lboSummary) {
    resultsPayload.lboSummary = lboSummary;
  }

  if (statementsPayload) {
    resultsPayload.statements = statementsPayload;
  }

  console.log('[generateModel] normalized scenario:', requestScenario);
  console.log('[generateModel] preparing model update', {
    traceId,
    modelId,
    scenario: requestScenario,
    pointer: effectiveR2Key ?? localDownloadUrl,
  });

  let updateQuery = supabase
    .from('models')
    .update({
      r2_key: effectiveR2Key,
      file_name: downloadFilename,
      status: 'ready',
      results: resultsPayload,
      preview,
      assumptions: requestAssumptions ?? null,
      normalized_assumptions: sanitizedAssumptions ?? requestAssumptions ?? null,
      validation: validationSummary
        ? {
            reason: validationSummary.reason ?? null,
            errors: validationSummary.errors ?? [],
            warnings: validationSummary.warnings ?? [],
          }
        : null,
      scenario: requestScenario,
      scenario_adjustment_notes: requestScenarioNotes ?? '',
      scenario_summary_notes: scenarioSummaryNotesValue,
      error: null,
    })
    .eq('id', modelId)
    .eq('user_id', userId);
  const { error: updateError } = await updateQuery;

  if (updateError) {
    console.error('[generateModel] Failed to update model record:', updateError);
    return NextResponse.json(
      {
        error: 'MODEL_UPDATE_FAILED',
        details: updateError.message,
        code: updateError.code,
      },
      { status: 500 }
    );
  }

  console.log(`[generateModel] ✅ Model record updated: ${modelId}`);
  console.log(
    `[generateModel] ✅ Model export ready (${effectiveR2Key ? 'r2' : 'local'}): ${effectiveR2Key ?? localDownloadUrl}`
  );
  
  const responseBody: Record<string, any> = {
    success: true,
    modelId,
    status: 'ready',
    ticker: cleanTicker,
    modelType,
    scenario: requestScenario,
    scenario_adjustment_notes: requestScenarioNotes,
    scenarioAdjustmentNotes: requestScenarioNotes,
    scenario_summary_notes: scenarioSummaryNotesValue,
    scenarioSummaryNotes: scenarioSummaryNotesValue,
    results: resultsPayload,
    preview,
    appliedDefaults,
    warnings: guardrailResult.warnings,
  };

  if (dcfSummary) {
    responseBody.dcfSummary = dcfSummary;
  }

  if (lboSummary) {
    responseBody.lboSummary = lboSummary;
  }

  return NextResponse.json(responseBody);
  } catch (error: any) {
    // Update run record to failed
    if (runId) {
      await updateModelRunFailed({
        runId,
        errorMessage: error?.message || 'Unknown error',
      });
    }

    if (modelId) {
      let failQuery = supabase
        .from('models')
        .update({
          status: 'failed',
          error: error?.message || 'Model generation failed',
        })
        .eq('id', modelId);
      if (userId) {
        failQuery = failQuery.eq('user_id', userId);
      }
      await failQuery;
    }
    
    console.error('[GENERATE_MODEL_ERROR]', error, { traceId, modelId });
    
    // Use handleModelError - should always be defined due to import sanity check
    try {
      return handleModelError(error, {
        traceId,
        modelType: modelType || 'three-statement',
        defaultStage: 'compute',
        defaultStep: 'unknown',
        httpStatus: 500,
      });
    } catch (handlerError) {
      console.error('[GENERATE_MODEL_ERROR] handleModelError failed', handlerError);
      // Fall through to inline handler
    }
    
    // Helper functions for error extraction
    function toErrorMessage(err: unknown): string {
      if (err instanceof Error) return err.message;
      try {
        return JSON.stringify(err);
      } catch {
        return String(err);
      }
    }

    function toErrorDetails(err: unknown): Array<{ path?: string; message: string }> {
      // Zod errors (if you use zod)
      const anyErr = err as any;
      if (anyErr?.issues && Array.isArray(anyErr.issues)) {
        return anyErr.issues.map((i: any) => ({
          path: Array.isArray(i.path) ? i.path.join('.') : String(i.path ?? ''),
          message: String(i.message ?? 'Invalid input'),
        }));
      }
      return [];
    }

    const errorMessage = toErrorMessage(error);
    const errorDetails = toErrorDetails(error);

    // Server log always
    console.error('[GENERATE_MODEL_ERROR] generation failed', { traceId, message: errorMessage, error });

    // In dev, include stack for instant diagnosis
    const stack =
      process.env.NODE_ENV !== 'production' && error instanceof Error
        ? error.stack
        : undefined;

    // Attempt to send to Sentry if available (server-side only)
    if (typeof window === 'undefined') {
      try {
        // Dynamic import to avoid bundling Sentry if not configured
        const Sentry = await import('@sentry/nextjs').catch(() => null);
        if (Sentry?.captureException && typeof Sentry.captureException === 'function') {
          Sentry.captureException(error, {
            tags: { traceId, modelType: modelType || 'three-statement' },
            extra: { modelId },
          });
        }
      } catch {
        // Sentry not available or failed to import, continue without it
      }
    }
    
    return NextResponse.json(
      {
        ok: false,
        traceId,
        error: {
          message: errorMessage,
          details: errorDetails,
          ...(stack ? { stack } : {}),
        },
      },
      { status: 500 }
    );
  } finally {
    const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const durationMs = Math.max(0, Math.round(endTime - metricsStart));
    
    // Update run record
    if (runId) {
      if (metricsSuccess) {
        await updateModelRunSuccess({ runId, runtimeMs: durationMs });
      } else {
        await updateModelRunFailed({ runId });
      }
    }
    
    // Also log to metrics (legacy)
    if (metricsTicker && metricsModelType) {
      logModelRun({
        ticker: metricsTicker,
        modelType: metricsModelType,
        durationMs,
        success: metricsSuccess,
      }).catch((error) => console.error('[METRICS] Failed to log run', error));
    }
  }
}
