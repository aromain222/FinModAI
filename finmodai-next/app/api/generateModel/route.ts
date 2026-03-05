// @ts-nocheck
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
 * 6. Return: assumptions, summary, preview, downloadUrl, diagnostics
 */

import { NextResponse, NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import crypto from 'crypto';
import { APP_NAME } from '@/lib/branding';
import type { ModelType as RequestModelType } from '@/types/models';
import { enrichUnifiedAssumptions } from '@/lib/enrichUnifiedAssumptions';
import { 
  sanitizeAssumptions, 
  validateSanitizedAssumptions, 
  formatSanitizationLog 
} from '@/lib/sanitizeAssumptions';
import type {
  ThreeStatementAssumptions,
  PartialThreeStatementAssumptions,
} from '@/types/threeStatementAssumptions';
import type { DataDiagnostics } from '@/types/diagnostics';
import { createDiagnostic, logDiagnostic } from '@/types/diagnostics';
import { performSanityChecks } from '@/lib/data/fetchWithDiagnostics';
import type { DCFInputs } from '@/lib/dcfGenerator';
import { ensureMillions, formatMillions } from '@/lib/unitConversion';
import { cleanAndScaleFinancials, normalizeToMillions, type RawFinancials, type ScaledFinancials } from '@/lib/financials';
import type { APIAttempt } from '@/lib/data/dcfValidation';
import { buildLboWorkbook, runLboModel, type LboEngineOutput } from '@/lib/lboEngine';
import { logModelRun, mapModelTypeToMetrics, type ModelType as MetricsModelType } from '@/lib/modelMetrics';
import { createModelRun, updateModelRunSuccess, updateModelRunFailed } from '@/lib/modelRuns';
import { copyWorksheet } from '@/lib/excel/copyWorksheet';
import { buildCanonicalFinancials } from '@/lib/canonicalFinancials';
import { checkModelConsistency } from '@/lib/modelConsistency';
// import type { Scenario } from '@/lib/scenarioEngine';
import type { ScenarioAssumptions } from '@/lib/scenarioEngine';
type Scenario = 'BASE' | 'BULL' | 'BEAR';
import { buildUnifiedAssumptionsFromPolygon } from '@/lib/unifiedAssumptions';
import type { LboAdvancedOptions } from '@/types/lbo';
import { getSettings } from '@/lib/settings/store';
import { applyDefaultsToModelInputs } from '@/lib/models/shared/applyDefaults';
import { evaluateGuardrails } from '@/lib/models/shared/guardrails';
import { ModelRequestContext } from '@/lib/modelContext';
import { assertString } from '@/lib/assertions';
import { logKeyStatus } from '@/lib/keyStatus';
import type { CompsResult } from '@/lib/compsCalculator';
import { isObjectStoreConfigured, uploadBufferAndSign } from '@/lib/storage/objectStore';
import { DEFAULT_STYLE_TOKENS } from '@/lib/models/schema/StyleTokens';
import type { ModelDocument, TableBlock, Column, Row, Cell } from '@/lib/models/schema';
import { buildDocumentFromModelOutputs, buildLegacyPreviewFromDocument } from '@/lib/models/schema/fromModelOutputs';
import { mapDocumentToExcel } from '@/lib/models/schema/mappings';
import { checkModelComputability, assertModelComputable } from '@/lib/models/shared/computability';
import { buildRequiredInputs } from '@/lib/models/shared/requiredInputs';
import { estimateDCFInputs, applyAutoEstimates } from '@/lib/models/shared/autoEstimates';
import { resolveFundamentals } from '@/lib/models/shared/resolveFundamentals';
import { rescaleSeriesToCanonical, coerceToMillions } from '@/lib/models/shared/unitNormalization';
import { buildRevenueSeries } from '@/lib/models/shared/revenueSeries';
import type { ModelStateInfo } from '@/lib/models/shared/modelState';
import { fetchLboIngestion, mapLboIngestionToLtmFinancials, hasLboIngestionData } from '@/lib/lboIngestion';
import { isDemoMode, isDemoModeFromRequest } from '@/lib/demo/isDemoMode';
import { runWithDemoMode } from '@/lib/demo/demoContext';
import { isDemoTickerAvailable } from '@/lib/data/providers/demoProvider';
import { hasAnyOpenAIKey } from '@/lib/openaiKey';
import {
  assessDemoLboReadiness,
  buildQuickLboPayload,
  normalizeQuickLboInputs,
} from '@/lib/models/lbo/quick';
import {
  assessReverseDcfDemoReadiness,
  parseReverseDcfInputs,
  solveReverseDcfImpliedGrowth,
  type ReverseDcfInputs as ReverseDcfSolverInputs,
} from '@/lib/models/dcf/reverse';
import {
  DEFAULT_DCF_SENSITIVITY_CONFIG,
  DEFAULT_LBO_SENSITIVITY_CONFIG,
  buildDcfSensitivityTable,
  buildLboSensitivityTable,
  parseDcfSensitivityConfig,
  parseLboSensitivityConfig,
} from '@/lib/models/sensitivity';
import {
  buildDebtCapacityLiteSummary,
  parseDebtCapacityLiteInputs,
  validateDebtCapacityLiteInputs,
  type DebtCapacityLiteSummary,
} from '@/lib/models/debtCapacityLite';
import type { ModelInputs } from '@/types/modelInputs';
import { fromManual, fromTicker, manualPayloadFromRequest } from '@/lib/modelInputs/adapters';
import { LIVE_DATA_FALLBACK_NOTICE, normalizeModelInputs } from '@/lib/modelInputs/defensive';

const deepClone = <T,>(value: T): T => {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

export const runtime = 'nodejs';

// Surface env configuration early for observability (service or user key enables enrichment)
if (!hasAnyOpenAIKey()) {
  console.warn('[generateModel] No OpenAI key (OPENAI_SERVICE_API_KEY or OPENAI_API_KEY) – AI enrichment will use defaults');
}

export async function POST(req: NextRequest) {
  let body: any = undefined;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const demoEnabled =
    isDemoModeFromRequest(req) ||
    String(process.env.DEMO_MODE || '').toLowerCase() === 'true' ||
    String(process.env.NEXT_PUBLIC_DEMO_MODE || '').toLowerCase() === 'true';
  if (!demoEnabled) {
    return NextResponse.json(
      {
        ok: false,
        status: 'failed',
        state: 'failed',
        code: 'demo_mode_required',
        message: 'Demo mode is required. Set DEMO_MODE=true and NEXT_PUBLIC_DEMO_MODE=true.',
      },
      { status: 400 }
    );
  }
  const privateManualMode = isPrivateManualMode(body);
  const requestedTicker =
    typeof body?.ticker === 'string' ? body.ticker.trim().toUpperCase() : null;
  if (requestedTicker && !privateManualMode) {
    const demoAllowed = await isDemoTickerAvailable(requestedTicker);
    if (!demoAllowed) {
      return NextResponse.json(
        {
          ok: false,
          status: 'failed',
          state: 'failed',
          code: 'DEMO_NOT_FOUND',
          message: 'This demo ticker is not in the curated demo set. Choose a demo company.',
        },
        { status: 400 }
      );
    }
  }
  return runWithDemoMode(true, () => handleGenerateModel(req, body));
}

// Safe formatters to avoid toFixed crashes
const fmtFixed = (val: number | null | undefined, decimals: number = 2): string =>
  typeof val === 'number' && isFinite(val) ? val.toFixed(decimals) : 'N/A';
const fmtPct = (val: number | null | undefined, decimals: number = 1): string =>
  typeof val === 'number' && isFinite(val) ? `${(val * 100).toFixed(decimals)}%` : 'N/A';

/**
 * Validate request body
 */
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
      typeof manualInputs.revenue === 'number' && Number.isFinite(manualInputs.revenue) && manualInputs.revenue > 0;
    const hasCompanyName =
      typeof body.companyName === 'string' && body.companyName.trim().length > 0;
    return hasRevenue || hasCompanyName;
  }
  return false;
}

function validateRequestBody(body: any): { ticker: string; modelType: RequestModelType; rest: any } {
  if (!body || typeof body !== 'object') {
    throw new Error('Missing or invalid JSON body');
  }

  const { ticker, modelType, ...rest } = body;

  const allowedTypes: RequestModelType[] = [
    'three-statement',
    'dcf',
    'reverse-dcf',
    'debt-capacity-lite',
    'lbo',
    'comps',
    'merger',
    'operating',
    'scorecard',
  ];
  if (!modelType || !allowedTypes.includes(modelType)) {
    throw new Error(`Invalid modelType "${modelType}". Must be one of: ${allowedTypes.join(', ')}`);
  }

  const privateManualMode = isPrivateManualMode(body);
  if ((!ticker || typeof ticker !== 'string' || ticker.trim().length === 0) && !privateManualMode) {
    throw new Error('Ticker is required and must be a non-empty string');
  }
  const normalizedTicker =
    ticker && typeof ticker === 'string' && ticker.trim().length > 0
      ? ticker.trim().toUpperCase()
      : (typeof body.companyName === 'string' && body.companyName.trim()
          ? body.companyName.trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'PRIVATE'
          : 'PRIVATE');

  return {
    ticker: normalizedTicker,
    modelType,
    rest,
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

function buildLtmFinancialsFromModelInputs(ticker: string, modelInputs: ModelInputs) {
  const latestRevenue =
    Array.isArray(modelInputs.historicals?.revenue) && modelInputs.historicals.revenue.length > 0
      ? modelInputs.historicals.revenue[modelInputs.historicals.revenue.length - 1]
      : null;
  const revenue = typeof latestRevenue === 'number' && Number.isFinite(latestRevenue) ? latestRevenue : 0;
  const margin =
    typeof modelInputs.assumptions?.margin === 'number' && Number.isFinite(modelInputs.assumptions.margin)
      ? modelInputs.assumptions.margin
      : 0.2;
  const ebitda = revenue > 0 ? revenue * margin : 0;
  const taxRate =
    typeof modelInputs.assumptions?.taxRate === 'number' && Number.isFinite(modelInputs.assumptions.taxRate)
      ? modelInputs.assumptions.taxRate
      : 0.25;
  const netIncome = revenue > 0 ? ebitda * (1 - taxRate) * 0.8 : 0;
  const netDebt =
    typeof modelInputs.capitalStructure?.netDebt === 'number' && Number.isFinite(modelInputs.capitalStructure.netDebt)
      ? modelInputs.capitalStructure.netDebt
      : 0;
  const marketCap =
    typeof modelInputs.pricingAnchor?.marketCap === 'number' && Number.isFinite(modelInputs.pricingAnchor.marketCap)
      ? modelInputs.pricingAnchor.marketCap
      : typeof modelInputs.pricingAnchor?.sharePrice === 'number' &&
          Number.isFinite(modelInputs.pricingAnchor.sharePrice) &&
          typeof modelInputs.pricingAnchor?.sharesOutstanding === 'number' &&
          Number.isFinite(modelInputs.pricingAnchor.sharesOutstanding) &&
          modelInputs.pricingAnchor.sharesOutstanding > 0
        ? modelInputs.pricingAnchor.sharePrice * modelInputs.pricingAnchor.sharesOutstanding
        : null;
  const sharesOutstanding =
    typeof modelInputs.pricingAnchor?.sharesOutstanding === 'number' && Number.isFinite(modelInputs.pricingAnchor.sharesOutstanding)
      ? modelInputs.pricingAnchor.sharesOutstanding
      : typeof modelInputs.capitalStructure?.sharesOutstanding === 'number' &&
          Number.isFinite(modelInputs.capitalStructure.sharesOutstanding)
        ? modelInputs.capitalStructure.sharesOutstanding
        : null;
  const cash = netDebt < 0 ? Math.abs(netDebt) : 0;
  const totalDebt = netDebt > 0 ? netDebt : 0;

  return {
    ticker,
    companyName: modelInputs.company?.name || ticker,
    sector: null,
    revenue,
    ebitda,
    netIncome,
    cash,
    totalDebt,
    sharesOutstanding,
    marketCap,
    ebitdaMargin: revenue > 0 ? ebitda / revenue : null,
    dataSource: modelInputs.metadata?.liveDataFallback ? 'demo_seed_fallback' : 'model_inputs',
    fiscalPeriod: 'LTM',
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Build partial assumptions from request and financial data
 */
function buildPartialAssumptions(
  body: any,
  ltmFinancials: any,
  enhancedData?: {
    historicalFinancials?: any;
    consensusEstimates?: any;
    peerComps?: any;
    workingCapitalDetails?: any;
  }
): PartialThreeStatementAssumptions {
  // Generate default years array (5 years starting from current year)
  const currentYear = new Date().getFullYear();
  const defaultYears = Array.from({ length: 5 }, (_, i) => currentYear + i);
  
  const partial: PartialThreeStatementAssumptions = {
    ticker: body.ticker?.trim().toUpperCase(),
    companyName: body.companyName || ltmFinancials?.companyName,
    sector: body.sector || ltmFinancials?.sector || enhancedData?.peerComps?.sector,
    currency: body.currency || 'USD',
    // Always set years array - will be used by three-statement model
    years: body.years && Array.isArray(body.years) ? body.years : defaultYears,
  };

  // Add LTM data if available - CRITICAL: This is the source of truth for ticker-specific data
  if (ltmFinancials) {
    console.log(`[buildPartialAssumptions] Using LTM financials for ${body.ticker?.trim().toUpperCase()}:`, {
      revenue: ltmFinancials.revenue,
      companyName: ltmFinancials.companyName,
      dataSource: ltmFinancials.dataSource,
    });
    
    // Only use LTM revenue if manual revenue wasn't provided
    if (!partial.revenue && ltmFinancials.revenue && ltmFinancials.revenue > 0) {
      // If years are set, create revenue array matching years length
      // Start with LTM revenue as base, then apply growth if available
      const numYears = partial.years?.length || 5;
      const baseRevenue = ltmFinancials.revenue;
      
      // If we have historical data, use it to project revenue growth
      if (enhancedData?.historicalFinancials?.revenue && enhancedData.historicalFinancials.revenue.length >= 2) {
        const histRevenue = enhancedData.historicalFinancials.revenue;
        const latestRevenue = histRevenue[histRevenue.length - 1];
        const prevRevenue = histRevenue[histRevenue.length - 2];
        const growthRate = prevRevenue > 0 ? (latestRevenue - prevRevenue) / prevRevenue : 0.05;
        
        // Project revenue forward with growth
        partial.revenue = [];
        let currentRevenue = baseRevenue;
        for (let i = 0; i < numYears; i++) {
          partial.revenue.push(currentRevenue);
          currentRevenue = currentRevenue * (1 + Math.max(0, Math.min(0.5, growthRate))); // Clamp growth to 0-50%
        }
        console.log(`[buildPartialAssumptions] Projected revenue from historical growth: ${partial.revenue.map(r => r.toFixed(0)).join(', ')}`);
      } else {
        // No historical data - use flat revenue (will be adjusted by enrichment)
        partial.revenue = Array(numYears).fill(baseRevenue);
        console.log(`[buildPartialAssumptions] Using flat revenue array: ${partial.revenue.map(r => r.toFixed(0)).join(', ')}`);
      }
    }
    if (ltmFinancials.grossProfit && ltmFinancials.revenue) {
      const numYears = partial.years?.length || 5;
      const cogsPct = (ltmFinancials.revenue - ltmFinancials.grossProfit) / ltmFinancials.revenue;
      partial.cogsPct = Array(numYears).fill(cogsPct);
    }
    if (ltmFinancials.operatingIncome && ltmFinancials.revenue) {
      const numYears = partial.years?.length || 5;
      const opexPct = (ltmFinancials.revenue - ltmFinancials.operatingIncome - (ltmFinancials.revenue - ltmFinancials.grossProfit)) / ltmFinancials.revenue;
      partial.opexPct = Array(numYears).fill(opexPct);
    }
  }

  // Enhance with historical data if available
  if (enhancedData?.historicalFinancials) {
    const hist = enhancedData.historicalFinancials;
    
    // Calculate revenue growth from historical data
    if (hist.revenue && hist.revenue.length >= 2) {
      const growthRates: number[] = [];
      for (let i = 1; i < hist.revenue.length; i++) {
        if (hist.revenue[i - 1] > 0) {
          growthRates.push((hist.revenue[i] - hist.revenue[i - 1]) / hist.revenue[i - 1]);
        }
      }
      if (growthRates.length > 0) {
        const avgGrowth = growthRates.reduce((a, b) => a + b, 0) / growthRates.length;
        const numYears = partial.years?.length || 5;
        partial.revenueGrowth = Array(numYears).fill(Math.max(0, Math.min(0.5, avgGrowth)));
      }
    }
    
    // Calculate margins from historical data
    if (hist.ebitda && hist.revenue && hist.revenue.length > 0) {
      const ebitdaMargins = hist.ebitda.map((ebitda: number, i: number) => 
        hist.revenue[i] > 0 ? ebitda / hist.revenue[i] : 0
      ).filter((m: number) => m > 0);
      if (ebitdaMargins.length > 0) {
        const avgMargin = ebitdaMargins.reduce((a: number, b: number) => a + b, 0) / ebitdaMargins.length;
        // This would be used in enrichment
      }
    }
  }

  // Enhance with consensus estimates if available
  if (enhancedData?.consensusEstimates) {
    const est = enhancedData.consensusEstimates;
    // Consensus estimates will be used in enrichment phase
    // Store for later use
    (partial as any).consensusEstimates = est;
  }

  // Enhance with peer comps if available
  if (enhancedData?.peerComps && enhancedData.peerComps.medians) {
    const medians = enhancedData.peerComps.medians;
    // Use peer medians as defaults
    if (!partial.revenueGrowth) {
      const numYears = partial.years?.length || 5;
      partial.revenueGrowth = Array(numYears).fill(medians.revenueGrowth);
    }
    // Store for enrichment
    (partial as any).peerComps = enhancedData.peerComps;
  }

  // Enhance with working capital details if available
  if (enhancedData?.workingCapitalDetails) {
    const wc = enhancedData.workingCapitalDetails;
    if (wc.arDays > 0) partial.arDays = wc.arDays;
    if (wc.inventoryDays > 0) partial.inventoryDays = wc.inventoryDays;
    if (wc.apDays > 0) partial.apDays = wc.apDays;
    
    // Calculate starting positions from working capital % revenue
    if (ltmFinancials?.revenue && wc.nwcPctRevenue > 0) {
      const nwc = ltmFinancials.revenue * wc.nwcPctRevenue;
      // Rough estimates
      if (wc.arPctRevenue > 0) partial.startingAR = ltmFinancials.revenue * wc.arPctRevenue;
      if (wc.inventoryPctRevenue > 0) partial.startingInventory = ltmFinancials.revenue * wc.inventoryPctRevenue;
      if (wc.apPctRevenue > 0) partial.startingAP = ltmFinancials.revenue * wc.apPctRevenue;
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
  normalizedFinancials?: ScaledFinancials | null,
  appliedDefaults: any[] = []
): Promise<{ dcfSummary?: any; dcfWorkbook?: ExcelJS.Workbook }> {
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
        deltaNwcPctRevenue: clampOverride(body.sliderOverrides.deltaNwcPctRevenue, -0.2, 0.2),
        capexPctRevenue: clampOverride(body.sliderOverrides.capexPctRevenue, 0, 0.2),
        taxRate: clampOverride(body.sliderOverrides.taxRate, 0, 0.5),
      }
    : {
        revenueGrowth: undefined,
        ebitdaMargin: undefined,
        wacc: undefined,
        deltaNwcPctRevenue: undefined,
        capexPctRevenue: undefined,
        taxRate: undefined,
      };
  
  // Import all required modules
  const { generateBankerDCF, computeDCFSeries, normalizeDCFInputs, buildDcfWorkbook } = await import('@/lib/dcfGenerator');
  const { fetchConsensusEstimates } = await import('@/lib/data/consensusEstimates');
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
  const sectorMapping = await import('@/lib/sectorMapping');
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
  
  // Get scenario from request (default: BASE)
  const scenario: Scenario = (body.scenario?.toUpperCase() as Scenario) || 'BASE';
  console.log(`[generateModel] Scenario: ${scenario}`);
  
  // Track API attempts for validation
  const apiAttempts: APIAttempt[] = [];
  const inferences: Record<string, any> = {};
  
  // STEP 1: Fetch Consensus Estimates (Priority 1)
  console.log(`[generateModel] STEP 1: Fetching consensus estimates...`);
  const consensusEstimate = await fetchConsensusEstimates(ticker);
  
  if (consensusEstimate) {
    apiAttempts.push(createAPIAttempt(
      'consensus',
      'success',
      undefined,
      ['revenue estimate', 'eps estimate']
    ));
    console.log(`[generateModel] ✅ Consensus estimates available: Revenue ${consensusEstimate.revenueEstimate}, EPS ${consensusEstimate.epsEstimate}`);
  } else {
    console.log(`[generateModel] ⚠️  No consensus estimates available`);
  }
  
  // STEP 2: LTM/Historical Data already fetched (Priority 2)
  // This was done in earlier steps via getLTMFinancials
  console.log(`[generateModel] STEP 2: Using LTM data from ${assumptions.dataSource || 'enrichment'}`);
  
  // STEP 3: Calculate EBIT margin from cost structure
  const cogsPct0 = Array.isArray(assumptions.cogsPct) && assumptions.cogsPct.length > 0 ? assumptions.cogsPct[0] : (assumptions.cogsPct as any) ?? 0.6;
  const opexPct0 = Array.isArray(assumptions.opexPct) && assumptions.opexPct.length > 0 ? assumptions.opexPct[0] : (assumptions.opexPct as any) ?? 0.2;
  const daPct0 = Array.isArray(assumptions.daPct) && assumptions.daPct.length > 0 ? assumptions.daPct[0] : (assumptions.daPct as any) ?? 0.05;
  let ebitMargin = 1 - cogsPct0 - opexPct0 - daPct0;
  
  // STEP 4: Ensure all monetary values are in millions (MANDATORY SCALING PROTOCOL)
  console.log(`[generateModel] STEP 3: Applying MANDATORY SCALING PROTOCOL...`);
  // NOTE: assumptions.* values can be strings/null depending on ingestion/enrichment. Coerce safely here.
  const toFinite = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const cleaned = value.replace(/,/g, '').trim();
      if (!cleaned) return null;
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const unitHint = (assumptions as any)?.units === 'millions' ? 'millions' : 'auto';
  const revenueSeriesRaw = buildRevenueSeries({
    revenueSeries: (assumptions as any).revenue ?? (assumptions as any).revenueByYear,
    revenueLtm:
      (assumptions as any).revenueLtm ??
      (assumptions as any).revenueLTM ??
      (assumptions as any).ltmRevenue,
    years: Array.isArray(assumptions?.years) ? assumptions.years.length : 5,
  });
  const referenceRevenueM =
    (normalizedFinancials as any)?.revenueM ??
    (revenueSeriesRaw.length ? toFinite(revenueSeriesRaw[0]) : null) ??
    (Array.isArray(assumptions?.revenue) ? toFinite(assumptions.revenue[0]) : toFinite(assumptions?.revenue));

  const toMillionsValue = (value: number | null, reference?: number | null): number => {
    const coerced = coerceToMillions(value, {
      unitHint,
      referenceMillions: reference ?? referenceRevenueM ?? null,
    });
    return typeof coerced === 'number' && Number.isFinite(coerced) ? coerced : 0;
  };
  const toMillionsMaybe = (value: number | null, reference?: number | null): number | null => {
    if (value === null || !Number.isFinite(value)) return null;
    const coerced = coerceToMillions(value, {
      unitHint,
      referenceMillions: reference ?? referenceRevenueM ?? null,
    });
    return typeof coerced === 'number' && Number.isFinite(coerced) ? coerced : null;
  };

  const toSharesMillions = (value: number | null, reference?: number | null): number => {
    if (value === null || !Number.isFinite(value)) return 0;
    if (unitHint === 'millions') return value;
    if (reference && Number.isFinite(reference)) {
      const ratio = value / reference;
      if (ratio > 0.1 && ratio < 10) return value; // already in millions
      if (ratio > 1e5 && ratio < 1e7) return value / 1_000_000; // likely raw shares
    }
    return value > 1_000_000 ? value / 1_000_000 : value;
  };

  const debtActual = toFinite((assumptions as any).debt);
  const cashActual = toFinite((assumptions as any).startingCash);
  const sharesActual = toFinite((assumptions as any).sharesOutstanding);

  // Treat raw ingestion/enrichment values as "actual" (USD / raw shares). Convert to millions for DCF math.
  const normalizedCash =
    typeof (normalizedFinancials as any)?.cashM === 'number'
      ? (normalizedFinancials as any).cashM
      : (normalizedFinancials as any)?.cash;
  const normalizedDebt =
    typeof (normalizedFinancials as any)?.totalDebtM === 'number'
      ? (normalizedFinancials as any).totalDebtM
      : (normalizedFinancials as any)?.totalDebt;
  const initialCashMillions = typeof normalizedCash === 'number' && Number.isFinite(normalizedCash)
    ? normalizedCash
    : toMillionsMaybe(cashActual ?? null, referenceRevenueM);
  const initialTotalDebtMillions = typeof normalizedDebt === 'number' && Number.isFinite(normalizedDebt)
    ? normalizedDebt
    : toMillionsMaybe(debtActual ?? null, referenceRevenueM);
  const initialSharesOutstandingMillions =
    (normalizedFinancials as any)?.sharesOutstandingM ??
    toSharesMillions(sharesActual ?? 0, (normalizedFinancials as any)?.sharesOutstandingM);

  const ebitdaLtmCandidate =
    toFinite((assumptions as any).ebitdaLtm) ??
    toFinite((assumptions as any).ebitdaLTM) ??
    toFinite((normalizedFinancials as any)?.ebitdaM) ??
    toFinite((normalizedFinancials as any)?.ebitda);
  const netIncomeLtmCandidate =
    toFinite((assumptions as any).netIncomeLtm) ??
    toFinite((assumptions as any).netIncomeLTM) ??
    toFinite((normalizedFinancials as any)?.netIncomeM) ??
    toFinite((normalizedFinancials as any)?.netIncome);

  const { resolveDcfReportNetDebt } = await import('@/lib/models/dcf/netDebtResolver');
  const netDebtResolution = await resolveDcfReportNetDebt({
    ticker,
    companyName: assumptions.companyName || ticker,
    sector: assumptions.sector || 'Unknown',
    revenueLtm: referenceRevenueM ?? null,
    ebitdaLtm: ebitdaLtmCandidate !== null ? toMillionsMaybe(ebitdaLtmCandidate, referenceRevenueM) : null,
    netIncomeLtm: netIncomeLtmCandidate !== null ? toMillionsMaybe(netIncomeLtmCandidate, referenceRevenueM) : null,
    cash: initialCashMillions,
    totalDebt: initialTotalDebtMillions,
    sharesOutstanding: initialSharesOutstandingMillions ?? null,
  });

  const cashMillions = netDebtResolution.cash;
  const totalDebtMillions = netDebtResolution.totalDebt;
  const netDebtMillions = netDebtResolution.netDebt;
  const netDebtSource =
    netDebtResolution.source === 'REPORTED'
      ? 'reported'
      : netDebtResolution.source === 'AI_ESTIMATED'
      ? 'estimated_ai'
      : 'unknown';
  const netDebtNote =
    (body as any)?.netDebtNote ||
    (body as any)?.netDebt_note ||
    netDebtResolution.note ||
    (netDebtSource === 'unknown' ? 'Net debt unavailable.' : undefined);
  const netDebtWarning = netDebtSource === 'unknown' ? 'Net debt unavailable' : null;

  if (process.env.NODE_ENV !== 'production') {
    console.debug({
      ticker,
      cash: cashMillions,
      total_debt: totalDebtMillions,
      netDebt: netDebtMillions,
      source: netDebtResolution.source,
    });
  }
  if (
    process.env.NODE_ENV !== 'production' &&
    netDebtMillions === 0 &&
    ((cashMillions ?? 0) !== 0 || (totalDebtMillions ?? 0) !== 0)
  ) {
    console.warn('[generateModel] Potential coercion bug: netDebt is 0 while cash/total_debt are non-zero.');
  }
  const sharesOutstandingMillions = netDebtResolution.sharesOutstanding ?? initialSharesOutstandingMillions;

  let revenueByYear = revenueSeriesRaw
    .map((r) => toFinite(r))
    .filter((r): r is number => typeof r === 'number' && Number.isFinite(r) && r > 0)
    .map((r) => toMillionsValue(r, referenceRevenueM));

  // If revenue series is unusable, fall back to a single base-year revenue (still in millions).
  if (!revenueByYear.length) {
    const baseRevenueCandidate =
      toFinite((assumptions as any).revenue?.[0]) ??
      toFinite((assumptions as any).revenue) ??
      toFinite((assumptions as any).revenueLtm) ??
      toFinite((assumptions as any).revenueLTM) ??
      toFinite((assumptions as any).ltmRevenue) ??
      null;
    if (baseRevenueCandidate && baseRevenueCandidate > 0) {
      revenueByYear = [toMillionsValue(baseRevenueCandidate, referenceRevenueM)];
    }
  }
  
  if (sliderOverrides.revenueGrowth !== undefined) {
    for (let i = 1; i < revenueByYear.length; i++) {
      revenueByYear[i] = revenueByYear[i - 1] * (1 + sliderOverrides.revenueGrowth);
    }
    console.log(
      `[generateModel] Slider override: Applied ${fmtPct(sliderOverrides.revenueGrowth, 1)} revenue growth across forecast years.`
    );
  }
  
  // STEP 5: Get sector for inference
  const getSector = sectorMapping.mapTickerToSector || (() => 'Technology');
  const sector = getSector(ticker);
  console.log(`[generateModel] Sector: ${sector}`);
  
  // STEP 6: CONDITIONAL INFERENCE PROTOCOL
  console.log(`[generateModel] STEP 4: Applying CONDITIONAL INFERENCE PROTOCOL...`);
  
  // Infer D&A if missing or zero
  let daPercentOfRevenue = Array.isArray(assumptions.daPct) && assumptions.daPct.length > 0 ? assumptions.daPct[0] : (assumptions.daPct as any) ?? 0.05;
  if (!daPercentOfRevenue || daPercentOfRevenue <= 0) {
    const capexPct0 = Array.isArray(assumptions.capexPctRevenue) && assumptions.capexPctRevenue.length > 0 ? assumptions.capexPctRevenue[0] : (assumptions.capexPctRevenue as any) ?? 0.04;
    const daInference = inferDAPercentage([], [], capexPct0, sector);
    daPercentOfRevenue = daInference.value;
    inferences.daPercentOfRevenue = daInference;
    logInferredValue('D&A % Revenue', daInference);
  }
  
  if (sliderOverrides.ebitdaMargin !== undefined) {
    const targetEbitMargin = Math.max(sliderOverrides.ebitdaMargin - daPercentOfRevenue, 0.01);
    ebitMargin = targetEbitMargin;
    console.log(
      `[generateModel] Slider override: EBITDA margin ${fmtPct(sliderOverrides.ebitdaMargin, 1)} (EBIT margin ${fmtPct(targetEbitMargin, 1)}).`
    );
  }
  
  // Infer CapEx if missing or zero
  let capexPercentOfRevenue = Array.isArray(assumptions.capexPctRevenue) && assumptions.capexPctRevenue.length > 0 ? assumptions.capexPctRevenue[0] : (assumptions.capexPctRevenue as any) ?? 0.04;
  if (!capexPercentOfRevenue || capexPercentOfRevenue <= 0) {
    const capexInference = inferCapexPercentage([], [], sector);
    capexPercentOfRevenue = capexInference.value;
    inferences.capexPercentOfRevenue = capexInference;
    logInferredValue('CapEx % Revenue', capexInference);
  }
  if (sliderOverrides.capexPctRevenue !== undefined) {
    capexPercentOfRevenue = sliderOverrides.capexPctRevenue;
    console.log(
      `[generateModel] Slider override: Capex % Revenue ${fmtPct(capexPercentOfRevenue, 1)}.`
    );
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
  if (sliderOverrides.deltaNwcPctRevenue !== undefined) {
    changeInWCPercentOfRevenue = sliderOverrides.deltaNwcPctRevenue;
    console.log(
      `[generateModel] Slider override: ΔNWC % Revenue ${fmtPct(changeInWCPercentOfRevenue, 2)}.`
    );
  }

  let taxRate = assumptions.taxRate ?? 0.25;
  if (sliderOverrides.taxRate !== undefined) {
    taxRate = sliderOverrides.taxRate;
    console.log(
      `[generateModel] Slider override: Tax Rate ${fmtPct(taxRate, 1)}.`
    );
  }
  
  // STEP 7: USER WACC PRIORITY (v7.0)
  // Note: Settings defaults are already applied in partialAssumptions, so body.wacc may already have a default
  console.log(`[generateModel] STEP 6: Applying USER WACC PRIORITY...`);
  let wacc: number = 0.10; // Default fallback
  let waccSource: 'user-defined' | 'calculated' | 'inferred' | 'settings-default' = 'inferred';
  
  if (body.wacc !== undefined && typeof body.wacc === 'number' && !isNaN(body.wacc)) {
    // Check if this was applied from settings
    const waccDefault = appliedDefaults.find(d => d.path === 'wacc');
    if (waccDefault) {
      wacc = body.wacc;
      waccSource = 'settings-default';
      console.log(`[generateModel] ✅ Using WACC from Settings: ${fmtPct(wacc, 2)}`);
    } else {
      // Priority 1: User-Defined WACC
      wacc = body.wacc;
      waccSource = 'user-defined';
      console.log(`[generateModel] ✅ Using USER-DEFINED WACC: ${fmtPct(wacc, 2)}`);
    }
  } else {
    // Priority 2: Inferred WACC
    const waccInference = inferWACC(sector);
    wacc = typeof waccInference === 'number' ? waccInference : (waccInference?.value || 0.10);
    waccSource = 'inferred';
    inferences.wacc = waccInference;
    logInferredValue('WACC', waccInference);
  }
  
  if (sliderOverrides.wacc !== undefined && body.wacc === undefined) {
    wacc = sliderOverrides.wacc;
    waccSource = 'user-defined';
    console.log(`[generateModel] Slider override: WACC ${fmtPct(wacc, 2)}`);
  }
  
  // Ensure wacc is valid
  if (typeof wacc !== 'number' || isNaN(wacc) || wacc <= 0) {
    wacc = 0.10; // Default fallback
    waccSource = 'inferred';
  }
  
  // Apply scenario adjustment to WACC
  const waccAdjustment = applyScenarioToWACC(wacc, { name: scenario, waccDelta: 0 });
  wacc = waccAdjustment.adjustedWACC;
  
  // Terminal Growth (check user input first, then settings default)
  let terminalGrowth: number = 0.025; // Default fallback
  if (body.terminalGrowth !== undefined && typeof body.terminalGrowth === 'number') {
    // Check if this was applied from settings
    const tgDefault = appliedDefaults.find(d => d.path === 'terminalGrowth');
    if (tgDefault) {
      terminalGrowth = body.terminalGrowth;
      console.log(`[generateModel] ✅ Using Terminal Growth from Settings: ${fmtPct(terminalGrowth, 2)}`);
    } else {
      terminalGrowth = body.terminalGrowth;
      console.log(`[generateModel] ✅ Using USER-DEFINED Terminal Growth: ${fmtPct(terminalGrowth, 2)}`);
    }
  } else {
    const terminalGrowthInference = inferTerminalGrowth(sector, assumptions.revenueGrowth);
    terminalGrowth = typeof terminalGrowthInference === 'number' ? terminalGrowthInference : (terminalGrowthInference?.value || 0.025);
    inferences.terminalGrowth = terminalGrowthInference;
    logInferredValue('Terminal Growth', terminalGrowthInference);
  }
  
  // Ensure terminalGrowth is valid
  if (typeof terminalGrowth !== 'number' || isNaN(terminalGrowth)) {
    terminalGrowth = 0.025; // Default fallback
  }
  
  // STEP 8: APPLY SCENARIO ADJUSTMENTS (v7.0)
  console.log(`[generateModel] STEP 7: Applying SCENARIO ADJUSTMENTS (${scenario})...`);
  const adjustedEstimatesRaw = applyScenarioToEstimates(consensusEstimate || null, scenario);
  const adjustedEstimates = {
    ...(adjustedEstimatesRaw || {}),
    adjustmentNotes: Array.isArray(adjustedEstimatesRaw?.adjustmentNotes)
      ? adjustedEstimatesRaw.adjustmentNotes
      : [],
    adjustedRevenueGrowthY1: adjustedEstimatesRaw?.adjustedRevenueGrowthY1,
    adjustedRevenueGrowthY2: adjustedEstimatesRaw?.adjustedRevenueGrowthY2,
    adjustedRevenueGrowthY3: adjustedEstimatesRaw?.adjustedRevenueGrowthY3,
    adjustedEbitdaMargin: adjustedEstimatesRaw?.adjustedEbitdaMargin,
    adjustedOperatingMargin: adjustedEstimatesRaw?.adjustedOperatingMargin,
    originalEstimates: adjustedEstimatesRaw?.originalEstimates ?? null,
  };
  
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
      if (!adjustedEstimates.adjustmentNotes) adjustedEstimates.adjustmentNotes = [];
      adjustedEstimates.adjustmentNotes.push(
        `Revenue growth forced by slider input: ${fmtPct(overrideGrowth, 1)}`
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
      if (!adjustedEstimates.adjustmentNotes) adjustedEstimates.adjustmentNotes = [];
      adjustedEstimates.adjustmentNotes.push(
        `EBITDA margin forced by slider input: ${fmtPct(overrideMargin, 1)}`
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
    console.log(`[generateModel] ✅ Applied ${scenario} margin adjustments: EBIT Margin = ${fmtPct(ebitMargin, 1)}`);
  }
  
  // Log scenario adjustments
  logScenarioAdjustments(scenario, adjustedEstimates, waccAdjustment);
  
  // Build DCF inputs using new interface
  const dcfInputs: Partial<DCFInputs> = {
    ticker,
    companyName: assumptions.companyName || ticker,
    
    // Revenue (first year for validation)
    revenue: (revenueByYear && revenueByYear.length > 0) ? revenueByYear[0] : (Array.isArray(assumptions.revenue) && assumptions.revenue.length > 0 ? assumptions.revenue[0] : (assumptions.revenue as any) || 1000),
    revenueLtm:
      (assumptions as any).revenueLtm ??
      (assumptions as any).revenueLTM ??
      (assumptions as any).ltmRevenue ??
      null,
    demoMode: isDemoMode(),
    
    // Fiscal years
    years: assumptions.years,
    
    // Revenue forecast (already in millions from enrichment)
    revenueByYear,
    
    // Operating assumptions (as decimals)
    ebitMargin,
    taxRate,
    daPercentOfRevenue,
    changeInWCPercentOfRevenue,
    capexPercentOfRevenue,
    
    // Valuation inputs (inferred)
    wacc,
    terminalGrowth,
    
    // Balance sheet (in millions)
    netDebtMillions: netDebtMillions ?? null,
    netDebt: netDebtMillions ?? null,
    netDebtSource,
    netDebtNote,
    sharesOutstandingMillions,
  };

  // STEP 7: VALIDATION & ABORT LOGIC
  console.log(`[generateModel] STEP 5: Validating DCF inputs...`);
  if (isDemoMode()) {
    console.log('[DEMO] validation inputs', {
      ticker,
      modelType: 'dcf',
      revenueLtm: (dcfInputs as any).revenueLtm ?? null,
      hasRevenueSeries: Array.isArray(revenueByYear) && revenueByYear.length > 0,
    });
  }
  const validationResult = validateDCFInputs(dcfInputs);
  logValidationResult(validationResult, ticker);
  
  // ABORT if validation fails
  if (!validationResult.isValid) {
    const errorReport = formatValidationError(validationResult);
    console.error(errorReport);
    throw new Error(`DCF validation failed for ${ticker}: ${validationResult.errors.join(', ')}`);
  }
  
  // Log inference summary
  const inferenceSummary = createInferenceSummary(inferences);
  if (inferenceSummary && inferenceSummary.length > 0) {
    console.log(`[generateModel] ========== INFERRED ASSUMPTIONS ==========`);
    console.log(`[generateModel] ${inferenceSummary}`);
    console.log(`[generateModel] ================================================`);
  }
  
  console.log(`[generateModel] ========== DCF INPUTS DEBUG ==========`);
  console.log(`[generateModel] Ticker: ${ticker}`);
  console.log(`[generateModel] Years: ${dcfInputs.years?.join(', ') || 'N/A'}`);
  const safeRevs = (dcfInputs.revenueByYear || []).filter(r => typeof r === 'number' && isFinite(r));
  console.log(`[generateModel] Revenue: ${safeRevs.length ? safeRevs.map(r => formatMillions(r)).join(', ') : 'N/A'}`);
  console.log(`[generateModel] EBIT Margin: ${fmtPct(ebitMargin, 1)}`);
  console.log(`[generateModel] Tax Rate: ${fmtPct(dcfInputs.taxRate, 1)}`);
  console.log(`[generateModel] D&A % Revenue: ${fmtPct(dcfInputs.daPercentOfRevenue, 1)}${inferences.daPercentOfRevenue ? ' (INFERRED)' : ''}`);
  console.log(`[generateModel] ΔWC % Revenue: ${fmtPct(dcfInputs.changeInWCPercentOfRevenue, 1)}${inferences.changeInWCPercentOfRevenue ? ' (INFERRED)' : ''}`);
  console.log(`[generateModel] Capex % Revenue: ${fmtPct(dcfInputs.capexPercentOfRevenue, 1)}${inferences.capexPercentOfRevenue ? ' (INFERRED)' : ''}`);
  console.log(`[generateModel] WACC: ${fmtPct(dcfInputs.wacc, 1)} (INFERRED)`);
  console.log(`[generateModel] Terminal Growth: ${fmtPct(dcfInputs.terminalGrowth, 1)} (INFERRED)`);
  console.log(`[generateModel] Net Debt: ${netDebtMillions !== null ? formatMillions(netDebtMillions) : 'N/A'}`);
  console.log(`[generateModel] Shares Outstanding: ${fmtFixed(sharesOutstandingMillions, 1)}M`);
  console.log(`[generateModel] ==========================================`);

  // Normalize and compute DCF (for diagnostics)
  const normalizedInputs = normalizeDCFInputs(dcfInputs);
  const results = computeDCFSeries(normalizedInputs);
  
  console.log(`[generateModel] ========== DCF RESULTS DEBUG ==========`);
  console.log(`[generateModel] Enterprise Value: ${formatMillions(results?.enterpriseValue)}`);
  console.log(`[generateModel] Equity Value: ${formatMillions(results?.equityValue)}`);
  console.log(`[generateModel] PV Explicit FCF: ${formatMillions(results?.pvExplicitFCF)}`);
  console.log(`[generateModel] Terminal Value: ${formatMillions(results?.terminalValue)}`);
  console.log(`[generateModel] PV Terminal Value: ${formatMillions(results?.pvTerminalValue)}`);
  console.log(`[generateModel] Enterprise Value: ${formatMillions(results?.enterpriseValue)}`);
  const netDebtForLog = (normalizedInputs as any)?.netDebtMillions ?? normalizedInputs?.netDebt ?? 0;
  console.log(`[generateModel] Net Debt: ${typeof netDebtForLog === 'number' && isFinite(netDebtForLog) ? formatMillions(netDebtForLog) : 'N/A'}`);
  console.log(`[generateModel] Equity Value: ${formatMillions(results?.equityValue)}`);
  console.log(
    `[generateModel] Price Per Share: ${
      typeof results.pricePerShare === 'number' && isFinite(results.pricePerShare)
        ? `$${fmtFixed(results.pricePerShare, 2)}`
        : 'N/A'
    }`
  );
  console.log(`[generateModel] ==========================================`);

  // Generate DCF workbook (will normalize, compute, and build Excel)
  const bankerOutput = await generateBankerDCF(dcfInputs);
  const bankerWorkbook = await buildDcfWorkbook(bankerOutput);

  // Copy all DCF sheets to main workbook (Cover, Assumptions, Operating Projections, Free Cash Flow, Discounting, Valuation Summary, Sensitivity Tables, Checks)
  const dcfSheetNames = [
    'Summary',
    'Assumptions',
    'Forecast',
    'Valuation',
    'Sensitivities',
    'Checks',
    'Sources & Notes',
  ];
  for (const sheetName of dcfSheetNames) {
    const sheet = bankerWorkbook.getWorksheet(sheetName);
    if (sheet) {
      await copyWorksheet(sheet, workbook, sheetName);
    }
  }
  
  // STEP 9: FORMAT OUTPUT (v7.0)
  console.log(`[generateModel] STEP 8: Formatting output with Analyst AI marketing...`);
  
  const scenarioAdjustmentNotes = createScenarioSummary(scenario, adjustedEstimates || {});
  
  const dcfSummary = formatDCFOutput(
    ticker,
    scenario,
    normalizedInputs,
    results,
    waccSource,
    scenarioAdjustmentNotes
  );
  if (netDebtWarning) {
    dcfSummary.warnings = Array.isArray(dcfSummary.warnings)
      ? [...dcfSummary.warnings, netDebtWarning]
      : [netDebtWarning];
  }
  
  // Log formatted output to console
  logFormattedOutput(dcfSummary);
  
  // Return DCF summary for API response
  // Include both the formatted summary AND the raw results for preview parsing
  const jsonSummary = createJSONSummary(dcfSummary);
  const projections = bankerOutput?.projections || [];
  const revenueProj = projections.map(p => p.revenue);
  const ebitProj = projections.map(p => p.ebit);
  const daProj = projections.map(p => p.depreciation);
  const ebitdaProj = projections.map(p => p.ebitda);
  const fcfProj = projections.map(p => p.freeCashFlow);
  
  // Generate years array
  const currentYear = new Date().getFullYear();
  const yearsArray = projections.map((_, i) => (currentYear + i + 1).toString());
  const dcfSensitivity = buildDcfSensitivityTable(
    {
      wacc: normalizedInputs.wacc || 0.1,
      terminalGrowth: normalizedInputs.terminalGrowth || 0.025,
      basePricePerShare: results.pricePerShare || 0,
      evaluatePrice: ({ wacc: evalWacc, terminalGrowth: evalTerminalGrowth }) => {
        const scenarioInputs = {
          ...normalizedInputs,
          wacc: evalWacc,
          terminalGrowth: evalTerminalGrowth,
        };
        const scenarioResult = computeDCFSeries(normalizeDCFInputs(scenarioInputs as any));
        return Number.isFinite(scenarioResult.pricePerShare) ? scenarioResult.pricePerShare : null;
      },
    },
    body?.sensitivity?.dcf ?? DEFAULT_DCF_SENSITIVITY_CONFIG
  );
  
  return { 
    dcfSummary: {
      ...jsonSummary,
      // Add raw results for preview parsing
      results: {
        enterpriseValue: results.enterpriseValue,
        equityValue: results.equityValue,
        pricePerShare: results.pricePerShare,
        pvExplicitFCF: results.pvExplicitFCF,
        pvTerminalValue: results.pvTerminalValue,
        terminalValue: results.terminalValue,
        netDebt: normalizedInputs.netDebtMillions,
        // Full projection arrays
        revenueByYear: revenueProj,
        ebitByYear: ebitProj,
        ebitdaByYear: ebitdaProj,
        ufcfByYear: fcfProj,
        years: yearsArray,
        // Extract first 3 years for preview (backward compatibility)
        revenueProjections: revenueProj.slice(0, 3),
        ebitdaProjections: ebitdaProj.slice(0, 3),
        fcfProjections: fcfProj.slice(0, 3),
      },
      // Include full projections array for chart data AND Excel preview
      projections: projections.map((p, i) => ({
        year: currentYear + i + 1,
        revenue: p.revenue,
        ebitda: p.ebitda,
        ebit: p.ebit,
        nopat: p.nopat,
        depreciation: p.depreciation,
        capex: p.capex,
        nwcChange: p.nwcChange,
        freeCashFlow: p.freeCashFlow,
      })),
      // Include assumptions for preview
      assumptions: {
        ...jsonSummary.assumptions,
        taxRate: normalizedInputs.taxRate,
        projectionHorizon: Array.isArray(normalizedInputs.years) ? normalizedInputs.years.length : projections.length || 0,
      },
      sensitivity: dcfSensitivity,
    },
    dcfWorkbook: bankerWorkbook,
  };
}

async function buildReverseDcfModelWithAssumptions(
  workbook: ExcelJS.Workbook,
  ticker: string,
  assumptions: ThreeStatementAssumptions,
  reverseInputs: ReverseDcfSolverInputs & { targetPrice: number; marketPrice: number },
  normalizedFinancials?: ScaledFinancials | null
): Promise<{ dcfSummary: any; dcfWorkbook: ExcelJS.Workbook }> {
  const { generateBankerDCF, buildDcfWorkbook } = await import('@/lib/dcfGenerator');

  const pickFinite = (...values: Array<unknown>): number | null => {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return null;
  };

  const firstSeriesValue = (value: unknown): number | null => {
    if (Array.isArray(value) && value.length > 0) {
      const first = value[0];
      return typeof first === 'number' && Number.isFinite(first) ? first : null;
    }
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };

  const revenueCandidate = pickFinite(
    firstSeriesValue((assumptions as any).revenue),
    normalizedFinancials?.revenue,
    (normalizedFinancials as any)?.revenueM
  );
  const revenueM = coerceToMillions(revenueCandidate, {
    unitHint: (assumptions as any)?.units === 'millions' ? 'millions' : 'auto',
  });
  if (revenueM === null || !Number.isFinite(revenueM) || revenueM <= 0) {
    throw new Error('Reverse DCF requires positive revenue in demo dataset.');
  }

  const sharesM = pickFinite(
    (assumptions as any).sharesOutstanding,
    (normalizedFinancials as any)?.sharesOutstandingM
  );
  if (sharesM === null || !Number.isFinite(sharesM) || sharesM <= 0) {
    throw new Error('Reverse DCF requires valid shares outstanding in demo dataset.');
  }

  const netDebtM = pickFinite(
    (assumptions as any).netDebt,
    (normalizedFinancials as any)?.netDebtM,
    0
  ) ?? 0;

  const ebitdaMargin = pickFinite(
    firstSeriesValue((assumptions as any).ebitdaMargin),
    typeof (assumptions as any).ebitda === 'number' &&
      typeof revenueM === 'number' &&
      revenueM > 0
      ? (assumptions as any).ebitda / revenueM
      : null,
    0.25
  ) as number;
  const taxRate = pickFinite((assumptions as any).taxRate, 0.25) as number;
  const capexPctRevenue = pickFinite(firstSeriesValue((assumptions as any).capexPctRevenue), 0.04) as number;
  const nwcPctRevenue = pickFinite(firstSeriesValue((assumptions as any).nwcPctRevenue), 0.02) as number;

  const solved = solveReverseDcfImpliedGrowth({
    ticker,
    revenue: revenueM,
    ebitdaMargin,
    taxRate,
    capexPctRevenue,
    nwcPctRevenue,
    netDebt: netDebtM,
    sharesOutstanding: sharesM,
    inputs: {
      wacc: reverseInputs.wacc,
      terminalGrowth: reverseInputs.terminalGrowth,
      projectionYears: reverseInputs.projectionYears,
      targetPrice: reverseInputs.targetPrice,
    },
  });

  if (!solved.converged) {
    const reasonText =
      solved.reason === 'target_out_of_bounds'
        ? 'target price falls outside solvable growth range'
        : 'solver reached iteration limit';
    throw new Error(`Reverse DCF solver could not converge: ${reasonText}.`);
  }

  const dcfInputs = {
    ticker,
    companyName: assumptions.companyName || ticker,
    revenue: revenueM,
    revenueGrowth: solved.impliedRevenueGrowth,
    ebitdaMargin,
    taxRate,
    capexPctRevenue,
    nwcPctRevenue,
    wacc: reverseInputs.wacc,
    terminalGrowth: reverseInputs.terminalGrowth,
    projectionYears: reverseInputs.projectionYears,
    netDebt: netDebtM,
    sharesOutstanding: sharesM,
  };

  const bankerOutput = await generateBankerDCF(dcfInputs);
  const dcfWorkbook = await buildDcfWorkbook(bankerOutput);
  const dcfSheetNames = [
    'Summary',
    'Assumptions',
    'Forecast',
    'Valuation',
    'Sensitivities',
    'Checks',
    'Sources & Notes',
  ];
  for (const sheetName of dcfSheetNames) {
    const sheet = dcfWorkbook.getWorksheet(sheetName);
    if (sheet) {
      await copyWorksheet(sheet, workbook, sheetName);
    }
  }

  const projections = bankerOutput.projections || [];
  const years = projections.map((_, idx) => `${new Date().getFullYear() + idx + 1}`);
  const reverseLabel = 'Reverse DCF (Demo assumptions)';
  const notes = [
    `${reverseLabel}: solved for implied revenue CAGR to match target price.`,
    `Target price: $${reverseInputs.targetPrice.toFixed(2)} (default market price: $${reverseInputs.marketPrice.toFixed(2)}).`,
    `Fixed assumptions: WACC ${(reverseInputs.wacc * 100).toFixed(2)}%, terminal growth ${(reverseInputs.terminalGrowth * 100).toFixed(2)}%, projection years ${reverseInputs.projectionYears}, EBITDA margin ${(ebitdaMargin * 100).toFixed(1)}%, tax rate ${(taxRate * 100).toFixed(1)}%, capex ${(capexPctRevenue * 100).toFixed(1)}% of revenue, NWC ${(nwcPctRevenue * 100).toFixed(1)}% of revenue.`,
  ];

  const dcfSummary = {
    scenario: 'BASE',
    modelLabel: reverseLabel,
    valuationResults: {
      enterpriseValue: solved.valuation.enterpriseValue,
      equityValue: solved.valuation.equityValue,
      pricePerShare: solved.valuation.pricePerShare,
      pvExplicitFCF: solved.valuation.pvExplicitFCF,
      pvTerminalValue: solved.valuation.pvTerminalValue,
      targetPrice: reverseInputs.targetPrice,
      pricingGap: solved.pricingGap,
    },
    keyAssumptions: {
      wacc: reverseInputs.wacc,
      terminalGrowth: reverseInputs.terminalGrowth,
      year1RevenueGrowth: solved.impliedRevenueGrowth,
      ebitdaMargin,
      projectionYears: reverseInputs.projectionYears,
    },
    marketContext: {
      sharePrice: reverseInputs.marketPrice,
    },
    results: {
      enterpriseValue: solved.valuation.enterpriseValue,
      equityValue: solved.valuation.equityValue,
      pricePerShare: solved.valuation.pricePerShare,
      pvExplicitFCF: solved.valuation.pvExplicitFCF,
      pvTerminalValue: solved.valuation.pvTerminalValue,
      terminalValue: bankerOutput.valuation.terminalValue,
      netDebt: netDebtM,
      revenueByYear: projections.map((p) => p.revenue),
      ebitdaByYear: projections.map((p) => p.ebitda),
      ebitByYear: projections.map((p) => p.ebit),
      ufcfByYear: projections.map((p) => p.freeCashFlow),
      years,
    },
    reverseDcf: {
      enabled: true,
      impliedRevenueCagr: solved.impliedRevenueGrowth,
      targetPrice: reverseInputs.targetPrice,
      marketPrice: reverseInputs.marketPrice,
      pricingGap: solved.pricingGap,
      converged: true,
      iterations: solved.iterations,
      notes,
    },
    warnings: [`${reverseLabel} mode applied.`],
    notes,
    formattedOutput: `${reverseLabel}: implied revenue CAGR ${(solved.impliedRevenueGrowth * 100).toFixed(2)}% to match $${reverseInputs.targetPrice.toFixed(2)} target price.`,
  };

  return {
    dcfSummary,
    dcfWorkbook,
  };
}

/**
 * Build Three-Statement Model
 * Returns workbook and calculated output for ModelDocument preview.
 */
async function buildThreeStatementModelWithAssumptions(
  workbook: ExcelJS.Workbook,
  ticker: string,
  assumptions: ThreeStatementAssumptions
): Promise<{ workbook: ExcelJS.Workbook; threeStatementSummary: import('@/lib/models/threeStatement/excel').ThreeStatementOutput }> {
  try {
    // CRITICAL: Validate inputs at the very start
    if (!workbook) {
      throw new Error('buildThreeStatementModelWithAssumptions: workbook is required');
    }
    if (!ticker) {
      throw new Error('buildThreeStatementModelWithAssumptions: ticker is required');
    }
    if (!assumptions) {
      throw new Error('buildThreeStatementModelWithAssumptions: assumptions is required');
    }

    const demoMode = isDemoMode();
    const currentYear = new Date().getFullYear();
    const years =
      Array.isArray(assumptions.years) && assumptions.years.length > 0
        ? assumptions.years
        : Array.from({ length: 5 }, (_, i) => currentYear + i);

    const padArray = <T,>(arr: T[] | undefined, length: number, fallback: T): T[] => {
      if (!Array.isArray(arr) || arr.length === 0) {
        return Array(length).fill(fallback);
      }
      if (arr.length >= length) return arr.slice(0, length);
      return [...arr, ...Array(length - arr.length).fill(arr[arr.length - 1] ?? fallback)];
    };

    const ensureSeries = (value: unknown, length: number, fallback: number): number[] => {
      if (Array.isArray(value)) {
        return padArray(value as number[], length, fallback);
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return Array(length).fill(value);
      }
      return Array(length).fill(fallback);
    };

    const revenueLtm =
      (assumptions as any).revenueLtm ??
      (assumptions as any).revenueLTM ??
      (assumptions as any).ltmRevenue ??
      null;
    const revenueSeries = demoMode
      ? buildRevenueSeries({
          revenueSeries: assumptions.revenue,
          revenueLtm,
          years: years.length,
        })
      : (assumptions.revenue as any);
    const baseRevenue = revenueSeries[0] ?? (typeof revenueLtm === 'number' && Number.isFinite(revenueLtm) ? revenueLtm : null) ?? 1000;
    const revenueGrowthSeries = demoMode
      ? ensureSeries((assumptions as any).revenueGrowth, years.length, 0.1)
      : (assumptions as any).revenueGrowth;
    const revGrowthScalar =
      typeof (assumptions as any).revenueGrowth === 'number'
        ? (assumptions as any).revenueGrowth
        : Array.isArray((assumptions as any).revenueGrowth) && (assumptions as any).revenueGrowth.length > 0
          ? (assumptions as any).revenueGrowth[0]
          : 0.08;

    const revenue: number[] =
      demoMode && typeof baseRevenue === 'number' && Number.isFinite(baseRevenue)
        ? (() => {
            const r = [baseRevenue];
            for (let i = 1; i < years.length; i++) {
              r.push(r[i - 1] * (1 + revGrowthScalar));
            }
            return r;
          })()
        : padArray(revenueSeries, years.length, revenueSeries[0] ?? 0);

    if (demoMode) {
      console.log('[DEMO] validation inputs', {
        ticker,
        modelType: 'three-statement',
        revenueLtm: baseRevenue,
        revGrowthScalar,
        revenueYears: revenue.length,
      });
    }

    const ebitdaMarginScalar =
      typeof (assumptions as any).ebitdaMargin === 'number'
        ? (assumptions as any).ebitdaMargin
        : Array.isArray((assumptions as any).ebitdaMargin) && (assumptions as any).ebitdaMargin.length > 0
          ? (assumptions as any).ebitdaMargin[0]
          : 0.25;
    const ebitdaMargin = demoMode
      ? ensureSeries(ebitdaMarginScalar, years.length, ebitdaMarginScalar)
      : (assumptions as any).ebitdaMargin;
    const cogsPct = demoMode ? ensureSeries(assumptions.cogsPct, years.length, 0.6) : assumptions.cogsPct;
    const opExPct = demoMode ? ensureSeries(assumptions.opexPct, years.length, 0.2) : assumptions.opexPct;
    const daPct = demoMode ? ensureSeries(assumptions.daPct, years.length, 0.05) : assumptions.daPct;
    const capexPctRevenue = demoMode
      ? ensureSeries(assumptions.capexPctRevenue, years.length, 0.04)
      : assumptions.capexPctRevenue;
    const nwcPctRevenue = demoMode
      ? ensureSeries(assumptions.nwcPctRevenue, years.length, 0.01)
      : assumptions.nwcPctRevenue;

    const baseRevenueForDefaults =
      (Array.isArray(revenue) && typeof revenue[0] === 'number' && isFinite(revenue[0]) ? revenue[0] : null) ??
      (typeof revenueLtm === 'number' && Number.isFinite(revenueLtm) ? revenueLtm : null);
    const defaultCash = baseRevenueForDefaults ? baseRevenueForDefaults * 0.1 : 100;
    const defaultPPE = baseRevenueForDefaults ? baseRevenueForDefaults * 0.5 : 500;
    const defaultAR = baseRevenueForDefaults ? baseRevenueForDefaults * 0.1 : 150;
    const defaultInventory = baseRevenueForDefaults ? baseRevenueForDefaults * 0.08 : 100;
    const defaultAP = baseRevenueForDefaults ? baseRevenueForDefaults * 0.07 : 80;

    const derivedCash =
      typeof baseRevenueForDefaults === 'number' && Number.isFinite(baseRevenueForDefaults)
        ? baseRevenueForDefaults * 0.1
        : undefined;
    const derivedDebt =
      typeof baseRevenueForDefaults === 'number' && Number.isFinite(baseRevenueForDefaults)
        ? baseRevenueForDefaults * 0.2
        : undefined;

    const taxRate = demoMode ? assumptions.taxRate ?? 0.25 : assumptions.taxRate;
    const debt = demoMode ? assumptions.debt ?? derivedDebt ?? 0 : assumptions.debt ?? 0;
    const interestRate = demoMode
      ? assumptions.interestRate ?? (debt && debt > 0 ? 0.055 : 0)
      : assumptions.interestRate;

    // Prefer canonical three-statement Excel generator (deterministic + validated)
    const { generateThreeStatementWorkbook } = await import('@/lib/models/threeStatement/excel');

    const threeInputs = {
      ticker,
      companyName: assumptions.assumptionNotes?.[0] || ticker,
      years,
      revenue,
      revenueGrowth: demoMode ? [revGrowthScalar] : (assumptions.revenueGrowth ?? [revGrowthScalar]),
      ebitdaMargin,
      cogsPct,
      opExPct,
      daPct,
      taxRate,
      capexPctRevenue,
      nwcPctRevenue,
      debt,
      interestRate,
      startingCash: assumptions.startingCash ?? derivedCash ?? defaultCash,
      startingPPE: assumptions.startingPPE ?? defaultPPE,
      startingAR: assumptions.startingAR ?? defaultAR,
      startingInventory: assumptions.startingInventory ?? defaultInventory,
      startingAP: assumptions.startingAP ?? defaultAP,
      arDays: assumptions.arDays ?? 45,
      inventoryDays: assumptions.inventoryDays ?? 60,
      apDays: assumptions.apDays ?? 30,
      sharesOutstanding: assumptions.sharesOutstanding,
    };

    const { workbook: threeWorkbook, output: threeStatementSummary } = await generateThreeStatementWorkbook(threeInputs);
    const threeSheetNames = [
      'Summary',
      'Assumptions',
      'IS',
      'BS',
      'CF',
      'Supporting Schedules',
      'Checks',
      'Sources & Notes',
    ];
    for (const sheetName of threeSheetNames) {
      const sheet = threeWorkbook.getWorksheet(sheetName);
      if (sheet) {
        await copyWorksheet(sheet, workbook, sheetName);
      }
    }
    return { workbook, threeStatementSummary };
  } catch (error: any) {
    // Comprehensive error logging
    console.error(`[generateModel] ❌❌❌ CRITICAL ERROR in buildThreeStatementModelWithAssumptions for ${ticker} ❌❌❌`);
    console.error(`[generateModel] Error message:`, error?.message);
    console.error(`[generateModel] Error stack:`, error?.stack);
    console.error(`[generateModel] Error name:`, error?.name);
    console.error(`[generateModel] Assumptions object:`, {
      exists: !!assumptions,
      keys: assumptions ? Object.keys(assumptions) : 'N/A',
      years: assumptions?.years,
      yearsType: typeof assumptions?.years,
      yearsIsArray: Array.isArray(assumptions?.years),
      yearsLength: assumptions?.years?.length,
      revenue: assumptions?.revenue,
      revenueType: typeof assumptions?.revenue,
      revenueIsArray: Array.isArray(assumptions?.revenue),
      revenueLength: assumptions?.revenue?.length,
      cogsPct: assumptions?.cogsPct,
      cogsPctType: typeof assumptions?.cogsPct,
      cogsPctIsArray: Array.isArray(assumptions?.cogsPct),
      cogsPctLength: assumptions?.cogsPct?.length,
      opexPct: assumptions?.opexPct,
      opexPctType: typeof assumptions?.opexPct,
      opexPctIsArray: Array.isArray(assumptions?.opexPct),
      opexPctLength: assumptions?.opexPct?.length,
    });
    console.error(`[generateModel] Full assumptions object (stringified):`, JSON.stringify(assumptions, null, 2));
    throw error;
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
  requestBody?: any,
  options?: { workbookNotes?: string[] }
): Promise<LboEngineOutput> {
  console.log(`[generateModel] Building LBO for ${ticker}`);

  const sliderOverrides = requestBody?.sliderOverrides && typeof requestBody.sliderOverrides === 'object'
    ? requestBody.sliderOverrides
    : {};
  const lboOverrides = requestBody?.lboOverrides && typeof requestBody.lboOverrides === 'object'
    ? requestBody.lboOverrides
    : {};
  const dealAssumptions = requestBody?.lboDealAssumptions && typeof requestBody.lboDealAssumptions === 'object'
    ? requestBody.lboDealAssumptions
    : {};

  const pickNumeric = (...values: Array<unknown>): number | null => {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value.replace(/[$,\s]/g, ''));
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return null;
  };

  const manualInputs = requestBody?.manualInputs ?? {};
  const revenueCandidate = pickNumeric(
    requestBody?.revenue,
    requestBody?.revenueLtm,
    requestBody?.ltmRevenue,
    manualInputs?.revenue,
    manualInputs?.revenueLtm,
    normalizedFinancials?.revenue,
    (normalizedFinancials as any)?.revenueM,
    Array.isArray(assumptions.revenue) ? assumptions.revenue[0] : (assumptions.revenue as any)
  );
  const ebitdaCandidate = pickNumeric(
    requestBody?.ebitda,
    requestBody?.ebitdaLtm,
    requestBody?.ltmEbitda,
    manualInputs?.ebitda,
    manualInputs?.ebitdaLtm,
    normalizedFinancials?.ebitda,
    (normalizedFinancials as any)?.ebitdaM,
    Array.isArray((assumptions as any).ebitda) ? (assumptions as any).ebitda[0] : (assumptions as any).ebitda
  );

  const revenueUnitHint =
    typeof normalizedFinancials?.revenue === 'number'
      ? 'actual'
      : typeof (normalizedFinancials as any)?.revenueM === 'number'
      ? 'millions'
      : (assumptions as any)?.units === 'millions'
      ? 'millions'
      : 'auto';
  const ebitdaUnitHint =
    typeof normalizedFinancials?.ebitda === 'number'
      ? 'actual'
      : typeof (normalizedFinancials as any)?.ebitdaM === 'number'
      ? 'millions'
      : (assumptions as any)?.units === 'millions'
      ? 'millions'
      : 'auto';

  let revenueM = coerceToMillions(revenueCandidate, { unitHint: revenueUnitHint });
  let ebitdaM = coerceToMillions(ebitdaCandidate, { unitHint: ebitdaUnitHint, referenceMillions: revenueM });
  const netDebtM = normalizedFinancials?.netDebt ? ensureMillions(normalizedFinancials.netDebt as number, 'actual') : undefined;

  const entryMultiple = lboOverrides.entryMultiple ?? dealAssumptions.entry?.entryMultiple;
  const exitMultiple = lboOverrides.exitMultiple ?? dealAssumptions.exit?.exitMultiple;
  const transactionFeesPercent = lboOverrides.transactionFeesPercent ?? dealAssumptions.entry?.transactionFeesPercent ?? 0;
  const exitFeesPercent = lboOverrides.exitFeesPercent ?? dealAssumptions.exit?.exitFeesPercent ?? 0;
  const debtPercent = lboOverrides.debtPercent ?? dealAssumptions.financing?.debtPercent;
  const equityPercent = lboOverrides.equityPercent ?? dealAssumptions.financing?.equityPercent;
  const interestRate = lboOverrides.interestRate ?? dealAssumptions.financing?.interestRate;
  const amortizationPercent = lboOverrides.amortizationPercent ?? dealAssumptions.financing?.amortizationPercent ?? 0;
  const cashSweepPercent = lboOverrides.cashSweepPercent ?? dealAssumptions.financing?.cashSweepPercent ?? 0;
  const revenueGrowth =
    lboOverrides.revenueGrowth ??
    dealAssumptions.operations?.revenueGrowth ??
    (typeof sliderOverrides.revenueGrowth === 'number' ? sliderOverrides.revenueGrowth : undefined);
  const ebitdaMargin =
    lboOverrides.ebitdaMargin ??
    dealAssumptions.operations?.ebitdaMargin ??
    (typeof sliderOverrides.ebitdaMargin === 'number' ? sliderOverrides.ebitdaMargin : undefined);
  const capexPctRevenue = lboOverrides.capexPercent ?? dealAssumptions.operations?.capexPctRevenue ?? 0;
  const deltaNwcPctRevenue = lboOverrides.nwcPercent ?? dealAssumptions.operations?.deltaNwcPctRevenue ?? 0;
  const taxRate =
    lboOverrides.taxRate ??
    dealAssumptions.operations?.taxRate ??
    (typeof sliderOverrides.taxRate === 'number' ? sliderOverrides.taxRate : undefined);
  const holdingPeriodYears =
    lboOverrides.holdingPeriodYears ?? dealAssumptions.exit?.holdingPeriodYears ?? lboOverrides.exitYear ?? 5;
  const minimumCash = typeof lboOverrides.minimumCash === 'number' ? lboOverrides.minimumCash : undefined;
  const depreciationPctRevenue = typeof lboOverrides.daPercent === 'number' ? lboOverrides.daPercent : undefined;

  if (
    (ebitdaM === null || !Number.isFinite(ebitdaM)) &&
    typeof revenueM === 'number' &&
    Number.isFinite(revenueM) &&
    typeof ebitdaMargin === 'number' &&
    Number.isFinite(ebitdaMargin)
  ) {
    ebitdaM = revenueM * ebitdaMargin;
  }

  if (revenueM === null || !Number.isFinite(revenueM) || ebitdaM === null || !Number.isFinite(ebitdaM)) {
    throw new Error('LBO requires revenue and EBITDA inputs');
  }

  const lboInputs: import('@/lib/lboEngine').LboInputs = {
    ticker,
    companyName: assumptions.companyName || ticker,
    revenue: revenueM,
    ebitda: ebitdaM,
    netDebt: netDebtM,
    entryMultiple,
    exitMultiple,
    transactionFeesPercent,
    exitFeesPercent,
    debtPercent,
    equityPercent,
    interestRate,
    amortizationPercent,
    cashSweepPercent,
    revenueGrowth,
    ebitdaMargin,
    capexPctRevenue,
    deltaNwcPctRevenue,
    taxRate,
    depreciationPctRevenue,
    holdingPeriodYears,
    minimumCashBalance: minimumCash,
  };

  const lboSummary = runLboModel(lboInputs);
  const lboSensitivity = buildLboSensitivityTable(
    lboInputs,
    requestBody?.sensitivity?.lbo ?? DEFAULT_LBO_SENSITIVITY_CONFIG
  );
  (lboSummary as any).sensitivity = lboSensitivity;
  const lboWorkbook = await buildLboWorkbook(lboSummary, {
    ticker,
    companyName: assumptions.companyName || ticker,
    revenue: revenueM,
    ebitda: ebitdaM,
    notes: options?.workbookNotes,
  });

  if (workbook.worksheets.length > 0) {
    workbook.worksheets.splice(0, workbook.worksheets.length);
  }
  for (const sheet of lboWorkbook.worksheets) {
    await copyWorksheet(sheet, workbook, sheet.name);
  }

  return lboSummary;
}

function inferNwcPercent(assumptions: ThreeStatementAssumptions): number {
  const revenue_comps = Array.isArray(assumptions.revenue) && assumptions.revenue.length > 0 ? assumptions.revenue[0] : (assumptions.revenue as any) ?? 1;
  const revenue = revenue_comps || 1;
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
  _workbook: ExcelJS.Workbook,
  ticker: string,
  assumptions: ThreeStatementAssumptions,
  normalizedFinancials?: ScaledFinancials | null,
  diagnostics?: DataDiagnostics[],
  options?: {
    privateManualMode?: boolean;
    modelInputs?: ModelInputs | null;
  }
): Promise<import('@/lib/compsCalculator').CompsResult | null> {
  console.log(`[generateModel] Building Comps for ${ticker}`);
  const privateManualMode = options?.privateManualMode === true;

  const buildDemoRelativeCompsFallback = async (
    reason: string,
    preferredPeers: string[] = []
  ): Promise<import('@/lib/compsCalculator').CompsResult> => {
    const { getDemoCompany, getDemoSnapshot, getDemoSnapshotsBySector, getDemoUniverse } = await import('@/lib/data/providers/demoProvider');
    const targetTicker = ticker.toUpperCase();
    const subjectRow = await getDemoCompany(targetTicker);
    if (!subjectRow) {
      throw new Error('Demo company not found in demo_company_snapshots');
    }

    const toNum = (value: unknown): number | null => {
      if (typeof value === 'number' && isFinite(value)) return value;
      if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value.replace(/[$,\s]/g, ''));
        return isFinite(parsed) ? parsed : null;
      }
      return null;
    };
    const median = (values: number[]): number | null => {
      if (!values.length) return null;
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    };
    const mean = (values: number[]): number | null => {
      if (!values.length) return null;
      return values.reduce((sum, v) => sum + v, 0) / values.length;
    };
    const minMax = (values: number[]): { min: number | null; max: number | null } => {
      if (!values.length) return { min: null, max: null };
      return { min: Math.min(...values), max: Math.max(...values) };
    };

    const sector = String(subjectRow.sector ?? '').trim() || 'Technology';
    const peerTickerSet = new Set<string>();
    for (const peer of preferredPeers) {
      const t = String(peer || '').trim().toUpperCase();
      if (t && t !== targetTicker) peerTickerSet.add(t);
    }
    const sectorRows = await getDemoSnapshotsBySector(sector);
    for (const row of sectorRows) {
      const t = String(row.ticker ?? '').trim().toUpperCase();
      if (t && t !== targetTicker) peerTickerSet.add(t);
      if (peerTickerSet.size >= 20) break;
    }
    if (peerTickerSet.size < 8) {
      const universe = await getDemoUniverse();
      for (const row of universe) {
        const t = String(row.ticker ?? '').trim().toUpperCase();
        if (t && t !== targetTicker) peerTickerSet.add(t);
        if (peerTickerSet.size >= 25) break;
      }
    }

    const mapRow = (row: any) => {
      const marketCapRaw = toNum(row?.market_cap);
      const revenue = toNum(row?.revenue_ltm);
      const ebitda = toNum(row?.ebitda_ltm);
      const netIncome = toNum(row?.net_income_ltm);
      const cash = toNum(row?.cash);
      const debt = toNum(row?.total_debt);
      const shares = toNum(row?.shares_outstanding); // in millions
      const price = toNum(row?.share_price);
      const marketCap =
        marketCapRaw !== null
          ? marketCapRaw
          : price !== null && shares !== null && shares > 0
          ? price * shares
          : null;
      const netDebt = cash !== null && debt !== null ? debt - cash : null;
      const enterpriseValue = marketCap !== null && netDebt !== null ? marketCap + netDebt : null;
      const evToRevenue =
        enterpriseValue !== null && revenue !== null && revenue > 0 ? enterpriseValue / revenue : null;
      const evToEbitda =
        enterpriseValue !== null && ebitda !== null && ebitda > 0 ? enterpriseValue / ebitda : null;
      const peRatio =
        marketCap !== null && netIncome !== null && netIncome > 0 ? marketCap / netIncome : null;
      return {
        ticker: String(row?.ticker ?? '').toUpperCase(),
        name: String(row?.company_name ?? row?.ticker ?? ''),
        sector: row?.sector ?? null,
        marketCap,
        price,
        sharesOutstanding: shares,
        shares: shares,
        cash,
        debt,
        totalDebt: debt,
        netDebt,
        ev: enterpriseValue,
        enterpriseValue,
        revenue,
        ebitda,
        netIncome,
        evToRevenue,
        evToEbitda,
        peRatio,
        userInputs: {},
      };
    };

    const subject = mapRow(subjectRow);
    const peerSnapshots = await Promise.all(
      Array.from(peerTickerSet).map(async (peerTicker) => getDemoSnapshot(peerTicker))
    );
    const peers = peerSnapshots
      .filter((row): row is NonNullable<typeof row> => !!row)
      .map((row) => mapRow(row))
      .filter((peer) => peer.ticker && peer.ticker !== targetTicker);

    const evRevenueValues = peers
      .map((peer) => peer.evToRevenue)
      .filter((v): v is number => typeof v === 'number' && isFinite(v) && v > 0);
    const evEbitdaValues = peers
      .map((peer) => peer.evToEbitda)
      .filter((v): v is number => typeof v === 'number' && isFinite(v) && v > 0);
    const peValues = peers
      .map((peer) => peer.peRatio)
      .filter((v): v is number => typeof v === 'number' && isFinite(v) && v > 0);

    const medianMultiples = {
      evToRevenue: median(evRevenueValues),
      evToEbitda: median(evEbitdaValues),
      peRatio: median(peValues),
    };
    const meanMultiples = {
      evToRevenue: mean(evRevenueValues),
      evToEbitda: mean(evEbitdaValues),
      peRatio: mean(peValues),
    };
    const minMaxMultiples = {
      evToRevenue: minMax(evRevenueValues),
      evToEbitda: minMax(evEbitdaValues),
      peRatio: minMax(peValues),
    };

    const byEvRevenue =
      medianMultiples.evToRevenue !== null && subject.revenue !== null && subject.revenue > 0
        ? medianMultiples.evToRevenue * subject.revenue
        : null;
    const byEvEbitda =
      medianMultiples.evToEbitda !== null && subject.ebitda !== null && subject.ebitda > 0
        ? medianMultiples.evToEbitda * subject.ebitda
        : null;
    const byPe =
      medianMultiples.peRatio !== null && subject.netIncome !== null && subject.netIncome > 0
        ? medianMultiples.peRatio * subject.netIncome
        : null;

    const equityValueByEvRevenue = byEvRevenue !== null && subject.netDebt !== null ? byEvRevenue - subject.netDebt : null;
    const equityValueByEvEbitda = byEvEbitda !== null && subject.netDebt !== null ? byEvEbitda - subject.netDebt : null;
    const equityValueByPe = byPe;
    const sharesMm = subject.sharesOutstanding;
    const pricePerShareByEvRevenue =
      equityValueByEvRevenue !== null && sharesMm !== null && sharesMm > 0 ? equityValueByEvRevenue / sharesMm : null;
    const pricePerShareByEvEbitda =
      equityValueByEvEbitda !== null && sharesMm !== null && sharesMm > 0 ? equityValueByEvEbitda / sharesMm : null;
    const pricePerShareByPe =
      equityValueByPe !== null && sharesMm !== null && sharesMm > 0 ? equityValueByPe / sharesMm : null;

    const weightedInputs = [
      { price: pricePerShareByEvRevenue, weight: 0.4 },
      { price: pricePerShareByEvEbitda, weight: 0.4 },
      { price: pricePerShareByPe, weight: 0.2 },
    ].filter((item) => typeof item.price === 'number' && isFinite(item.price as number) && (item.price as number) > 0);
    const totalWeight = weightedInputs.reduce((sum, item) => sum + item.weight, 0);
    const blendedPricePerShare =
      totalWeight > 0
        ? weightedInputs.reduce((sum, item) => sum + (item.price as number) * item.weight, 0) / totalWeight
        : null;
    const blendedEquityValue =
      blendedPricePerShare !== null && sharesMm !== null && sharesMm > 0 ? blendedPricePerShare * sharesMm : null;

    const warnings: string[] = [
      `Applied deterministic demo-relative comps fallback: ${reason}`,
      'Mini-model uses demo_company_snapshots only (USD millions).',
    ];
    if (peers.length < 3) warnings.push('Fewer than 3 peers available; implied valuation stability is lower.');

    return {
      subject,
      peers,
      medianMultiples,
      meanMultiples,
      minMaxMultiples,
      impliedValuation: {
        byEvEbitda,
        byEvRevenue,
        byPe,
        equityValueByEvEbitda,
        equityValueByEvRevenue,
        equityValueByPe,
        pricePerShareByEvEbitda,
        pricePerShareByEvRevenue,
        pricePerShareByPe,
        blendedPricePerShare,
        blendedEquityValue,
      },
      warnings,
      metadata: {
        sector,
        modelMode: 'demo_relative_comps',
      },
    } as any;
  };

  const buildPrivateManualCompsFallback = (
    reason: string
  ): import('@/lib/compsCalculator').CompsResult => {
    const toNum = (value: unknown): number | null => {
      if (typeof value === 'number' && isFinite(value)) return value;
      if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value.replace(/[$,\s]/g, ''));
        return isFinite(parsed) ? parsed : null;
      }
      return null;
    };
    const computeMedian = (values: number[]): number | null => {
      if (!values.length) return null;
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    };

    const companyName =
      (typeof options?.modelInputs?.company?.name === 'string' && options.modelInputs.company.name.trim()) ||
      assumptions.companyName ||
      ticker;
    const targetRevenue = toNum(normalizedFinancials?.revenueM ?? assumptions.revenue) ?? 1000;
    const targetEbitda =
      toNum(normalizedFinancials?.ebitdaM ?? assumptions.ebitda) ??
      (targetRevenue > 0
        ? targetRevenue *
          (typeof assumptions.ebitdaMargin === 'number' && isFinite(assumptions.ebitdaMargin)
            ? assumptions.ebitdaMargin
            : 0.2)
        : 200);
    const targetNetIncome =
      toNum(assumptions.netIncome) ??
      (targetRevenue > 0
        ? targetRevenue *
          (typeof assumptions.netMargin === 'number' && isFinite(assumptions.netMargin) ? assumptions.netMargin : 0.1)
        : 100);
    const targetNetDebt =
      toNum(normalizedFinancials?.netDebtM ?? assumptions.netDebt) ??
      (toNum((assumptions as any)?.totalDebt) ?? 0) - (toNum((assumptions as any)?.cash) ?? 0);
    const targetShares = toNum(normalizedFinancials?.sharesOutstandingM ?? assumptions.sharesOutstanding) ?? 100;
    const targetMarketCap =
      toNum(assumptions.marketCap) ??
      (toNum(assumptions.price) !== null && targetShares > 0 ? (toNum(assumptions.price) as number) * targetShares : null);

    const sectorLabel =
      (typeof options?.modelInputs?.company?.name === 'string' &&
      options.modelInputs.company.name.toLowerCase().includes('bank')
        ? 'Financials'
        : assumptions.sector) || 'Private / Manual';

    const peerMultiples = [
      { ticker: 'PEER_A', evToRevenue: 2.8, evToEbitda: 12.0, peRatio: 16.5 },
      { ticker: 'PEER_B', evToRevenue: 3.4, evToEbitda: 14.0, peRatio: 19.0 },
      { ticker: 'PEER_C', evToRevenue: 2.3, evToEbitda: 10.5, peRatio: 14.0 },
      { ticker: 'PEER_D', evToRevenue: 4.1, evToEbitda: 15.5, peRatio: 22.0 },
      { ticker: 'PEER_E', evToRevenue: 3.0, evToEbitda: 13.0, peRatio: 17.5 },
    ];

    const peers = peerMultiples.map((peer) => {
      const evFromRevenue = targetRevenue > 0 ? peer.evToRevenue * targetRevenue : null;
      const evFromEbitda = targetEbitda > 0 ? peer.evToEbitda * targetEbitda : null;
      const ev =
        typeof evFromRevenue === 'number' && typeof evFromEbitda === 'number'
          ? (evFromRevenue + evFromEbitda) / 2
          : evFromRevenue ?? evFromEbitda;
      const marketCap = typeof ev === 'number' ? ev - targetNetDebt : null;
      return {
        ticker: peer.ticker,
        name: `Comparable ${peer.ticker.slice(-1)}`,
        sector: sectorLabel,
        marketCap,
        price: marketCap !== null && targetShares > 0 ? marketCap / targetShares : null,
        sharesOutstanding: targetShares,
        shares: targetShares,
        cash: null,
        debt: null,
        totalDebt: null,
        netDebt: targetNetDebt,
        ev,
        enterpriseValue: ev,
        revenue: targetRevenue,
        ebitda: targetEbitda,
        netIncome: targetNetIncome,
        evToRevenue: peer.evToRevenue,
        evToEbitda: peer.evToEbitda,
        peRatio: peer.peRatio,
        userInputs: {},
      };
    });

    const evRevVals = peers.map((p) => p.evToRevenue).filter((v): v is number => typeof v === 'number' && v > 0);
    const evEbitdaVals = peers.map((p) => p.evToEbitda).filter((v): v is number => typeof v === 'number' && v > 0);
    const peVals = peers.map((p) => p.peRatio).filter((v): v is number => typeof v === 'number' && v > 0);

    const medianMultiples = {
      evToRevenue: computeMedian(evRevVals),
      evToEbitda: computeMedian(evEbitdaVals),
      peRatio: computeMedian(peVals),
    };

    const byEvRevenue =
      medianMultiples.evToRevenue !== null && targetRevenue > 0 ? medianMultiples.evToRevenue * targetRevenue : null;
    const byEvEbitda =
      medianMultiples.evToEbitda !== null && targetEbitda > 0 ? medianMultiples.evToEbitda * targetEbitda : null;
    const byPe = medianMultiples.peRatio !== null && targetNetIncome > 0 ? medianMultiples.peRatio * targetNetIncome : null;

    const equityValueByEvRevenue = byEvRevenue !== null ? byEvRevenue - targetNetDebt : null;
    const equityValueByEvEbitda = byEvEbitda !== null ? byEvEbitda - targetNetDebt : null;
    const equityValueByPe = byPe;
    const pricePerShareByEvRevenue =
      equityValueByEvRevenue !== null && targetShares > 0 ? equityValueByEvRevenue / targetShares : null;
    const pricePerShareByEvEbitda =
      equityValueByEvEbitda !== null && targetShares > 0 ? equityValueByEvEbitda / targetShares : null;
    const pricePerShareByPe = equityValueByPe !== null && targetShares > 0 ? equityValueByPe / targetShares : null;

    const weighted = [
      { value: pricePerShareByEvRevenue, weight: 0.4 },
      { value: pricePerShareByEvEbitda, weight: 0.4 },
      { value: pricePerShareByPe, weight: 0.2 },
    ].filter((item) => typeof item.value === 'number' && isFinite(item.value as number) && (item.value as number) > 0);
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    const blendedPricePerShare =
      totalWeight > 0 ? weighted.reduce((sum, item) => sum + (item.value as number) * item.weight, 0) / totalWeight : null;
    const blendedEquityValue = blendedPricePerShare !== null && targetShares > 0 ? blendedPricePerShare * targetShares : null;

    return {
      subject: {
        ticker: ticker || 'PRIVATE',
        name: companyName,
        sector: sectorLabel,
        marketCap: targetMarketCap,
        price: targetMarketCap !== null && targetShares > 0 ? targetMarketCap / targetShares : null,
        sharesOutstanding: targetShares,
        shares: targetShares,
        cash: toNum((assumptions as any)?.cash),
        debt: toNum((assumptions as any)?.totalDebt),
        totalDebt: toNum((assumptions as any)?.totalDebt),
        netDebt: targetNetDebt,
        ev:
          targetMarketCap !== null && typeof targetNetDebt === 'number'
            ? targetMarketCap + targetNetDebt
            : byEvRevenue ?? byEvEbitda,
        enterpriseValue:
          targetMarketCap !== null && typeof targetNetDebt === 'number'
            ? targetMarketCap + targetNetDebt
            : byEvRevenue ?? byEvEbitda,
        revenue: targetRevenue,
        ebitda: targetEbitda,
        netIncome: targetNetIncome,
        evToRevenue:
          targetRevenue > 0 && targetMarketCap !== null && typeof targetNetDebt === 'number'
            ? (targetMarketCap + targetNetDebt) / targetRevenue
            : null,
        evToEbitda:
          targetEbitda > 0 && targetMarketCap !== null && typeof targetNetDebt === 'number'
            ? (targetMarketCap + targetNetDebt) / targetEbitda
            : null,
        peRatio: targetNetIncome > 0 && targetMarketCap !== null ? targetMarketCap / targetNetIncome : null,
        userInputs: {},
      },
      peers,
      medianMultiples,
      meanMultiples: {
        evToRevenue: evRevVals.length ? evRevVals.reduce((sum, v) => sum + v, 0) / evRevVals.length : null,
        evToEbitda: evEbitdaVals.length ? evEbitdaVals.reduce((sum, v) => sum + v, 0) / evEbitdaVals.length : null,
        peRatio: peVals.length ? peVals.reduce((sum, v) => sum + v, 0) / peVals.length : null,
      },
      minMaxMultiples: {
        evToRevenue: evRevVals.length ? { min: Math.min(...evRevVals), max: Math.max(...evRevVals) } : { min: null, max: null },
        evToEbitda: evEbitdaVals.length
          ? { min: Math.min(...evEbitdaVals), max: Math.max(...evEbitdaVals) }
          : { min: null, max: null },
        peRatio: peVals.length ? { min: Math.min(...peVals), max: Math.max(...peVals) } : { min: null, max: null },
      },
      impliedValuation: {
        byEvEbitda,
        byEvRevenue,
        byPe,
        equityValueByEvEbitda,
        equityValueByEvRevenue,
        equityValueByPe,
        pricePerShareByEvEbitda,
        pricePerShareByEvRevenue,
        pricePerShareByPe,
        blendedPricePerShare,
        blendedEquityValue,
      },
      warnings: [
        `Private/manual comps fallback applied: ${reason}`,
        'Peer set is deterministic demo comparables; replace with custom peers for production-grade comps.',
      ],
      metadata: {
        sector: sectorLabel,
        modelMode: 'private_manual_comps',
      },
    } as any;
  };

  const { identifyPeers, mergePeerSets, cleanTickerArray } = await import('@/lib/identifyPeers');
  const { fetchAndEnrichBatch } = await import('@/lib/financialDataFetcher');

  // Get custom comps from request (if provided)
  const customComps = cleanTickerArray((assumptions as any).customComps || []);
  const useOnlyCustom = (assumptions as any).useOnlyCustom || false;

  let autoPeers: string[] = [];
  let peerSelectionDiagnostics: { warnings?: string[]; candidateCount?: number; finalCount?: number; targetSector?: string; targetIndustry?: string } | undefined;
  let peerMetadata: Record<string, any> | undefined;

  if (privateManualMode && !useOnlyCustom) {
    autoPeers = [];
    peerSelectionDiagnostics = {
      targetSector: assumptions.sector || 'Private / Manual',
      candidateCount: 0,
      finalCount: 0,
      warnings: ['Private/manual mode: auto peer discovery disabled; using custom peers or deterministic fallback.'],
    };
  } else if (isDemoMode() && !useOnlyCustom) {
    const { getDemoCompany, getDemoSnapshotsBySector, getDemoUniverse } = await import('@/lib/data/providers/demoProvider');
    const subject = await getDemoCompany(ticker);
    if (!subject) {
      const err: any = new Error('Demo company not found in demo_company_snapshots');
      err.code = 'demo_company_not_found';
      err.stage = 'peers';
      throw err;
    }
    const sector = (subject.sector || 'Technology').trim();
    const sectorRows = await getDemoSnapshotsBySector(sector);
    let sectorPeers = sectorRows
      .map((r) => String(r.ticker ?? '').trim().toUpperCase())
      .filter((t) => t && t !== ticker.toUpperCase());
    const seen = new Set<string>([ticker.toUpperCase(), ...sectorPeers]);
    autoPeers = sectorPeers.slice(0, 15);
    if (autoPeers.length < 8) {
      const fullUniverse = await getDemoUniverse();
      const allTickers = fullUniverse.map((r) => String(r.ticker ?? '').trim().toUpperCase()).filter(Boolean);
      for (const t of allTickers) {
        if (t === ticker.toUpperCase() || seen.has(t)) continue;
        seen.add(t);
        autoPeers.push(t);
        if (autoPeers.length >= 25) break;
      }
    }
    peerSelectionDiagnostics = { targetSector: sector, candidateCount: sectorPeers.length, finalCount: autoPeers.length };
  } else if (!useOnlyCustom) {
    const peerSelection = await identifyPeers(ticker, 15);
    autoPeers = peerSelection.peers;
    peerSelectionDiagnostics = peerSelection.diagnostics;
    peerMetadata = peerSelection.metadata;

    if (peerSelectionDiagnostics && diagnostics) {
      const peerDiag = createDiagnostic(ticker, 'comps', 'User-Input', 'fetch', true);
      if (peerSelectionDiagnostics.warnings && peerSelectionDiagnostics.warnings.length > 0) {
        peerDiag.warnings.push(...peerSelectionDiagnostics.warnings);
      }
      if (peerSelectionDiagnostics.candidateCount !== undefined) {
        peerDiag.rawSample = {
          candidateCount: peerSelectionDiagnostics.candidateCount,
          finalCount: peerSelectionDiagnostics.finalCount,
          targetSector: peerSelectionDiagnostics.targetSector,
          targetIndustry: peerSelectionDiagnostics.targetIndustry,
        };
      }
      diagnostics.push(peerDiag);
      logDiagnostic(peerDiag);
    }
  }

  const mergedPeers = mergePeerSets(autoPeers, customComps, useOnlyCustom);
  const finalPeers = mergedPeers;

  if (finalPeers.length === 0) {
    if (privateManualMode) {
      console.warn('[generateModel] ⚠️  No peers in private/manual mode. Using deterministic private comps fallback.');
      return buildPrivateManualCompsFallback('no custom peers provided');
    }
    if (isDemoMode()) {
      console.warn('[generateModel] ⚠️  No auto/custom peers. Using demo relative comps fallback.');
      return buildDemoRelativeCompsFallback('no auto/custom peers available');
    }
    const fallbackPeers = isDemoMode() ? [] : ['SQ', 'PYPL', 'AFRM', 'UPST', 'HOOD'];
    const err: any = new Error('Limited peer coverage in demo universe; unable to build comps for this ticker.');
    err.code = 'no_comparable_companies';
    err.stage = 'peers';
    err.requiredInputs = [
      {
        key: 'customPeers',
        label: 'Peer tickers',
        type: 'text',
        unit: 'tickers',
        hint: 'Comma-separated (e.g., SQ, PYPL, AFRM, UPST, HOOD).',
        defaultValue: fallbackPeers.join(', '),
      },
    ];
    err.suggestions = { defaultPeers: fallbackPeers };
    throw err;
  }

  const batchTickers = [
    { ticker, source: 'auto' as const },
    ...finalPeers.map((peerTicker) => ({ ticker: peerTicker, source: 'custom' as const })),
  ];
  const companyData = await fetchAndEnrichBatch(batchTickers);

  const [targetCompany, ...peerCompanies] = companyData;
  if (!targetCompany) {
    throw new Error('Failed to fetch target company financials');
  }

  const computeMedian = (values: number[]): number | null => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };

  // Apply shares resolution to target and peers (Shares Resolution)
  const { resolveSharesOutstanding, resolveMarketCap, canComputeMultiple } = await import('@/lib/sharesResolution');
  
  // Resolve shares for target
  const targetSharesResolution = resolveSharesOutstanding(
    normalizedFinancials?.sharesOutstandingM ?? targetCompany.shares,
    targetCompany.marketCap || null,
    targetCompany.price || null,
    (assumptions as any).sharesOutstanding ?? null, // User-provided shares in millions
    normalizedFinancials?.lastUpdated
  );
  
  // Resolve market cap for target
  const targetMarketCap = resolveMarketCap(
    targetCompany.marketCap || null,
    targetCompany.price || null,
    targetSharesResolution
  );

  // Track user inputs for labeling
  const manualInputs = (assumptions as any).manualInputs || {};
  const userInputs = {
    revenue: !!manualInputs.revenue,
    ebitda: !!manualInputs.ebitda,
    ebit: !!manualInputs.ebit,
    netIncome: !!manualInputs.netIncome,
    sharesOutstanding: !!manualInputs.sharesOutstanding || targetSharesResolution.source === 'User Provided',
    netDebt: !!manualInputs.netDebt,
    marketCap: !!manualInputs.marketCap,
    price: !!manualInputs.price,
  };

  const inputCash =
    typeof manualInputs.cash === 'number'
      ? manualInputs.cash
      : typeof (assumptions as any).cash === 'number'
      ? (assumptions as any).cash
      : null;
  const inputDebt =
    typeof manualInputs.totalDebt === 'number'
      ? manualInputs.totalDebt
      : typeof (assumptions as any).totalDebt === 'number'
      ? (assumptions as any).totalDebt
      : null;

  const targetCash =
    inputCash ??
    (typeof normalizedFinancials?.cash === 'number' ? normalizedFinancials.cash : null) ??
    (typeof targetCompany.cash === 'number' ? targetCompany.cash : null);
  const targetDebt =
    inputDebt ??
    (typeof (normalizedFinancials as any)?.totalDebt === 'number'
      ? (normalizedFinancials as any).totalDebt
      : typeof normalizedFinancials?.debt === 'number'
      ? normalizedFinancials.debt
      : null) ??
    (typeof targetCompany.totalDebt === 'number' ? targetCompany.totalDebt : null);
  const targetNetDebt =
    normalizedFinancials?.netDebtM ??
    targetCompany.netDebt ??
    (typeof targetDebt === 'number' && typeof targetCash === 'number' ? targetDebt - targetCash : null);

  const target = {
    ticker: targetCompany.ticker,
    name: targetCompany.name,
    sector: targetCompany.sector ?? null,
    revenue: normalizedFinancials?.revenueM ?? targetCompany.revenue,
    ebitda: normalizedFinancials?.ebitdaM ?? targetCompany.ebitda,
    ebit: normalizedFinancials?.ebitM ?? targetCompany.ebit,
    netIncome: targetCompany.netIncome,
    shares: targetSharesResolution.sharesOutstanding,
    sharesOutstanding: targetSharesResolution.sharesOutstanding,
    sharesSource: targetSharesResolution.source,
    marketCap: targetMarketCap,
    cash: targetCash,
    debt: targetDebt,
    netDebt: targetNetDebt,
    price: targetCompany.price,
    userInputs, // Track user inputs for Excel labeling
  };

  const buildAnchorMultiples = (input: {
    marketCap: number | null;
    netDebt: number | null;
    revenue: number | null;
    ebitda: number | null;
    netIncome: number | null;
  }): {
    evToRevenue: number | null;
    evToEbitda: number | null;
    peRatio: number | null;
  } => {
    const hasMarketCap = typeof input.marketCap === 'number' && isFinite(input.marketCap) && input.marketCap > 0;
    const hasNetDebt = typeof input.netDebt === 'number' && isFinite(input.netDebt);
    const enterpriseValue = hasMarketCap && hasNetDebt ? (input.marketCap as number) + (input.netDebt as number) : null;
    const evToRevenue =
      enterpriseValue !== null &&
      typeof input.revenue === 'number' &&
      isFinite(input.revenue) &&
      input.revenue > 0
        ? enterpriseValue / input.revenue
        : null;
    const evToEbitda =
      enterpriseValue !== null &&
      typeof input.ebitda === 'number' &&
      isFinite(input.ebitda) &&
      input.ebitda > 0
        ? enterpriseValue / input.ebitda
        : null;
    const peRatio =
      hasMarketCap &&
      typeof input.netIncome === 'number' &&
      isFinite(input.netIncome) &&
      input.netIncome > 0
        ? (input.marketCap as number) / input.netIncome
        : null;
    return { evToRevenue, evToEbitda, peRatio };
  };

  let demoAnchorMultiples:
    | {
        evToRevenue: number | null;
        evToEbitda: number | null;
        peRatio: number | null;
      }
    | null = buildAnchorMultiples({
      marketCap: target.marketCap ?? null,
      netDebt: target.netDebt ?? null,
      revenue: target.revenue ?? null,
      ebitda: target.ebitda ?? null,
      netIncome: target.netIncome ?? null,
    });
  if (isDemoMode()) {
    try {
      const { getDemoUniverse, getDemoSnapshot } = await import('@/lib/data/providers/demoProvider');
      const anchorRows = await getDemoUniverse();
      const anchorSnapshotSettled = await Promise.allSettled(
        anchorRows.slice(0, 200).map((row) => getDemoSnapshot(row.ticker))
      );
      const evRevVals: number[] = [];
      const evEbitdaVals: number[] = [];
      const peVals: number[] = [];
      for (const result of anchorSnapshotSettled) {
        if (result.status !== 'fulfilled') continue;
        const row = result.value;
        if (!row) continue;
        const marketCap = typeof row.market_cap === 'number' && isFinite(row.market_cap) ? row.market_cap : null;
        const revenue = typeof row.revenue_ltm === 'number' && isFinite(row.revenue_ltm) ? row.revenue_ltm : null;
        const ebitda = typeof row.ebitda_ltm === 'number' && isFinite(row.ebitda_ltm) ? row.ebitda_ltm : null;
        const netIncome = typeof row.net_income_ltm === 'number' && isFinite(row.net_income_ltm) ? row.net_income_ltm : null;
        const cash = typeof row.cash === 'number' && isFinite(row.cash) ? row.cash : null;
        const debt = typeof row.total_debt === 'number' && isFinite(row.total_debt) ? row.total_debt : null;
        const netDebt = cash !== null && debt !== null ? debt - cash : null;
        const ev = marketCap !== null && netDebt !== null ? marketCap + netDebt : null;
        if (ev !== null && revenue !== null && revenue > 0) evRevVals.push(ev / revenue);
        if (ev !== null && ebitda !== null && ebitda > 0) evEbitdaVals.push(ev / ebitda);
        if (marketCap !== null && netIncome !== null && netIncome > 0) peVals.push(marketCap / netIncome);
      }
      const universeMultiples = {
        evToRevenue: computeMedian(evRevVals),
        evToEbitda: computeMedian(evEbitdaVals),
        peRatio: computeMedian(peVals),
      };
      demoAnchorMultiples = {
        evToRevenue: universeMultiples.evToRevenue ?? demoAnchorMultiples?.evToRevenue ?? null,
        evToEbitda: universeMultiples.evToEbitda ?? demoAnchorMultiples?.evToEbitda ?? null,
        peRatio: universeMultiples.peRatio ?? demoAnchorMultiples?.peRatio ?? null,
      };
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[generateModel] Demo anchor multiples resolved', {
          ticker,
          evToRevenue: demoAnchorMultiples.evToRevenue,
          evToEbitda: demoAnchorMultiples.evToEbitda,
          peRatio: demoAnchorMultiples.peRatio,
          usableRows: anchorSnapshotSettled.filter((result) => result.status === 'fulfilled').length,
        });
      }
    } catch (err) {
      console.warn('[generateModel] Unable to build demo anchor multiples from universe; using subject anchor if available.');
    }
  }

  const estimatePeerMarketCap = (peer: typeof peerCompanies[number]): number | null => {
    if (!demoAnchorMultiples) return null;
    const revenue = typeof peer.revenue === 'number' && isFinite(peer.revenue) ? peer.revenue : null;
    const ebitda = typeof peer.ebitda === 'number' && isFinite(peer.ebitda) ? peer.ebitda : null;
    const netIncome = typeof peer.netIncome === 'number' && isFinite(peer.netIncome) ? peer.netIncome : null;
    const cash = typeof peer.cash === 'number' && isFinite(peer.cash) ? peer.cash : null;
    const debt = typeof peer.totalDebt === 'number' && isFinite(peer.totalDebt) ? peer.totalDebt : null;
    const netDebt = cash !== null && debt !== null ? debt - cash : null;

    const candidates: Array<{ value: number; weight: number }> = [];
    if (
      demoAnchorMultiples.peRatio !== null &&
      netIncome !== null &&
      netIncome > 0
    ) {
      const cap = demoAnchorMultiples.peRatio * netIncome;
      if (isFinite(cap) && cap > 0) candidates.push({ value: cap, weight: 0.2 });
    }
    if (
      demoAnchorMultiples.evToRevenue !== null &&
      revenue !== null &&
      revenue > 0 &&
      netDebt !== null
    ) {
      const cap = demoAnchorMultiples.evToRevenue * revenue - netDebt;
      if (isFinite(cap) && cap > 0) candidates.push({ value: cap, weight: 0.4 });
    }
    if (
      demoAnchorMultiples.evToEbitda !== null &&
      ebitda !== null &&
      ebitda > 0 &&
      netDebt !== null
    ) {
      const cap = demoAnchorMultiples.evToEbitda * ebitda - netDebt;
      if (isFinite(cap) && cap > 0) candidates.push({ value: cap, weight: 0.4 });
    }
    if (!candidates.length) return null;
    const totalWeight = candidates.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) return null;
    return candidates.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
  };

  const resolvePeerMarketCap = (peer: typeof peerCompanies[number]) => {
    const sharesResolution = resolveSharesOutstanding(
      peer.shares ?? null,
      peer.marketCap ?? null,
      peer.price ?? null,
      null,
      normalizedFinancials?.lastUpdated
    );
    const estimatedMarketCap = estimatePeerMarketCap(peer);
    const resolvedMarketCap =
      resolveMarketCap(peer.marketCap ?? null, peer.price ?? null, sharesResolution) ?? estimatedMarketCap;
    return {
      sharesResolution,
      marketCap: resolvedMarketCap,
      marketCapSource:
        resolveMarketCap(peer.marketCap ?? null, peer.price ?? null, sharesResolution) !== null
          ? 'reported_or_derived'
          : resolvedMarketCap !== null
          ? 'estimated_demo_anchor'
          : 'missing',
    };
  };

  const filteredPeers = peerCompanies.filter((peer) => {
    const revenueOk = typeof peer.revenue === 'number' && isFinite(peer.revenue) && peer.revenue > 0;
    const { marketCap } = resolvePeerMarketCap(peer);
    const marketCapOk = typeof marketCap === 'number' && isFinite(marketCap) && marketCap > 0;
    return revenueOk && marketCapOk;
  });

  const excludedPeers = peerCompanies
    .filter((peer) => !filteredPeers.includes(peer))
    .map((peer) => peer.ticker);

  if (excludedPeers.length > 0) {
    console.log('[generateModel] ⚠️  Excluding peers with missing core financials:', excludedPeers);
  }

  // Build comps model with enriched data including shares source, sector, and user input tracking
  const allCompanies = [
    {
      ticker: target.ticker,
      name: target.name,
      companyName: target.name,
      sector: target.sector ?? null,
      price: target.price ?? null,
      shares: targetSharesResolution.sharesOutstanding,
      sharesOutstanding: targetSharesResolution.sharesOutstanding,
      sharesSource: targetSharesResolution.source,
      marketCap: targetMarketCap,
      cash: target.cash ?? null,
      debt: target.debt ?? null,
      netDebt: target.netDebt ?? null,
      ev: null,
      enterpriseValue: null,
      revenue: target.revenue ?? null,
      ebitda: target.ebitda ?? null,
      netIncome: target.netIncome ?? null,
      evToRevenue: null,
      evToEbitda: null,
      peRatio: null,
      userInputs: userInputs,
    },
    ...filteredPeers.map(peer => {
      const { sharesResolution, marketCap, marketCapSource } = resolvePeerMarketCap(peer);
      return {
        ticker: peer.ticker,
        name: peer.name,
        companyName: peer.name,
        sector: (peer as any).sector ?? null,
        price: peer.price ?? null,
        shares: sharesResolution.sharesOutstanding,
        sharesOutstanding: sharesResolution.sharesOutstanding,
        sharesSource: sharesResolution.source,
        marketCap,
        marketCapSource,
        cash: peer.cash ?? null,
        debt: peer.totalDebt ?? null,
        netDebt: peer.netDebt ?? null,
        ev: null,
        enterpriseValue: null,
        revenue: peer.revenue ?? null,
        ebitda: peer.ebitda ?? null,
        netIncome: peer.netIncome ?? null,
        evToRevenue: null,
        evToEbitda: null,
        peRatio: null,
        userInputs: {},
      };
    })
  ];

  // Calculate multiples for all companies
  allCompanies.forEach(comp => {
    const hasMarketCap = typeof comp.marketCap === 'number' && isFinite(comp.marketCap) && comp.marketCap > 0;
    const hasNetDebt = typeof comp.netDebt === 'number' && isFinite(comp.netDebt);
    const ev = comp.ev || comp.enterpriseValue || (hasMarketCap && hasNetDebt ? comp.marketCap + comp.netDebt : null);
    comp.enterpriseValue = ev;
    comp.ev = ev;

    // EV/Revenue
    if (canComputeMultiple(ev, comp.revenue as any)) {
      comp.evToRevenue = (ev! / (comp.revenue as number));
    }

    // EV/EBITDA
    if (canComputeMultiple(ev, comp.ebitda as any)) {
      comp.evToEbitda = (ev! / (comp.ebitda as number));
    }

    // P/E
    if (canComputeMultiple(comp.marketCap as any, comp.netIncome as any)) {
      comp.peRatio = ((comp.marketCap as number) / (comp.netIncome as number));
    }
  });

  const subject = allCompanies[0];
  let peers = allCompanies.slice(1);

  // Remove peers with no valid multiples at all
  const peersWithMultiples = peers.filter((peer) =>
    [peer.evToRevenue, peer.evToEbitda, peer.peRatio].some((val) => typeof val === 'number' && isFinite(val) && val > 0)
  );
  if (peersWithMultiples.length !== peers.length) {
    const removed = peers.filter((peer) => !peersWithMultiples.includes(peer)).map((peer) => peer.ticker);
    console.log('[generateModel] ⚠️  Excluding peers with no valid multiples:', removed);
  }
  peers = peersWithMultiples;

  const computeStats = (values: number[]) => {
    if (!values.length) return null;
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    return { mean, std };
  };

  const applyOutlierFilter = (field: 'evToRevenue' | 'evToEbitda' | 'peRatio') => {
    const values = peers.map((p) => p[field]).filter((v): v is number => typeof v === 'number' && isFinite(v));
    const stats = computeStats(values);
    if (!stats || stats.std === 0) return;
    const before = peers.length;
    peers = peers.filter((peer) => {
      const val = peer[field];
      if (typeof val !== 'number' || !isFinite(val)) return true;
      const z = Math.abs((val - stats.mean) / stats.std);
      return z <= 3;
    });
    if (peers.length !== before) {
      console.log(`[generateModel] ⚠️  Excluding outliers >3σ for ${field}. Remaining peers: ${peers.length}`);
    }
  };

  // With small universes (e.g. 50 companies), outlier filtering can remove all peers. Only filter when we have enough peers; otherwise keep all.
  const MIN_PEERS_FOR_OUTLIER_FILTER = 6;
  const peersBeforeOutlier = [...peers];
  if (peers.length > MIN_PEERS_FOR_OUTLIER_FILTER) {
    applyOutlierFilter('evToRevenue');
    applyOutlierFilter('evToEbitda');
    applyOutlierFilter('peRatio');
    if (peers.length === 0) {
      console.warn('[generateModel] Outlier filtering removed all peers; using pre-filter peer set (small universe).');
      peers = peersBeforeOutlier;
    }
  }

  if (peers.length === 0) {
    if (privateManualMode) {
      console.warn('[generateModel] ⚠️  All peers filtered in private/manual mode. Using deterministic private comps fallback.');
      return buildPrivateManualCompsFallback('all peers filtered out');
    }
    if (isDemoMode()) {
      console.warn('[generateModel] ⚠️  No valid peers after filtering. Using demo relative comps fallback.');
      return buildDemoRelativeCompsFallback('all peers filtered out', finalPeers);
    }
    throw new Error('Limited peer coverage in demo universe; unable to compute comps metrics.');
  }

  // Build comps model structure
  const compsModel = {
    subject,
    peers,
    medianMultiples: {
      evToEbitda: calculateMedian(peers.map(c => c.evToEbitda).filter((v): v is number => v !== null && v > 0)),
      evToRevenue: calculateMedian(peers.map(c => c.evToRevenue).filter((v): v is number => v !== null && v > 0)),
      peRatio: calculateMedian(peers.map(c => c.peRatio).filter((v): v is number => v !== null && v > 0)),
    },
    impliedValuation: {
      byEvEbitda: null as number | null,
      byEvRevenue: null as number | null,
      byPe: null as number | null,
    },
  };

  if (
    compsModel.medianMultiples.evToEbitda === null &&
    compsModel.medianMultiples.evToRevenue === null &&
    compsModel.medianMultiples.peRatio === null
  ) {
    if (privateManualMode) {
      console.warn('[generateModel] ⚠️  No valid multiples in private/manual mode. Using deterministic private comps fallback.');
      return buildPrivateManualCompsFallback('no valid multiples computed');
    }
    if (isDemoMode()) {
      console.warn('[generateModel] ⚠️  No valid peer multiples. Using demo relative comps fallback.');
      return buildDemoRelativeCompsFallback('no valid multiples computed', finalPeers);
    }
    throw new Error('No valid multiples could be computed for the peer set');
  }
  
  // Helper function for median
  function calculateMedian(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  const toFiniteNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      return isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  // Derive implied valuation from median multiples for canonical preview/document output.
  const subjectRevenue = toFiniteNumber(compsModel.subject?.revenue);
  const subjectEbitda = toFiniteNumber(compsModel.subject?.ebitda);
  const subjectNetIncome = toFiniteNumber(compsModel.subject?.netIncome);
  if (compsModel.medianMultiples.evToRevenue !== null && subjectRevenue && subjectRevenue > 0) {
    compsModel.impliedValuation.byEvRevenue = compsModel.medianMultiples.evToRevenue * subjectRevenue;
  }
  if (compsModel.medianMultiples.evToEbitda !== null && subjectEbitda && subjectEbitda > 0) {
    compsModel.impliedValuation.byEvEbitda = compsModel.medianMultiples.evToEbitda * subjectEbitda;
  }
  if (compsModel.medianMultiples.peRatio !== null && subjectNetIncome && subjectNetIncome > 0) {
    compsModel.impliedValuation.byPe = compsModel.medianMultiples.peRatio * subjectNetIncome;
  }
  const subjectNetDebtForEquity = toFiniteNumber((compsModel as any).subject?.netDebt);
  const subjectSharesMm = toFiniteNumber((compsModel as any).subject?.sharesOutstanding ?? (compsModel as any).subject?.shares);
  const equityValueByEvRevenue =
    compsModel.impliedValuation.byEvRevenue !== null && subjectNetDebtForEquity !== null
      ? compsModel.impliedValuation.byEvRevenue - subjectNetDebtForEquity
      : null;
  const equityValueByEvEbitda =
    compsModel.impliedValuation.byEvEbitda !== null && subjectNetDebtForEquity !== null
      ? compsModel.impliedValuation.byEvEbitda - subjectNetDebtForEquity
      : null;
  const equityValueByPe = compsModel.impliedValuation.byPe ?? null;
  const pricePerShareByEvRevenue =
    equityValueByEvRevenue !== null && subjectSharesMm !== null && subjectSharesMm > 0
      ? equityValueByEvRevenue / subjectSharesMm
      : null;
  const pricePerShareByEvEbitda =
    equityValueByEvEbitda !== null && subjectSharesMm !== null && subjectSharesMm > 0
      ? equityValueByEvEbitda / subjectSharesMm
      : null;
  const pricePerShareByPe =
    equityValueByPe !== null && subjectSharesMm !== null && subjectSharesMm > 0
      ? equityValueByPe / subjectSharesMm
      : null;
  const weightedPriceInputs = [
    { value: pricePerShareByEvRevenue, weight: 0.4 },
    { value: pricePerShareByEvEbitda, weight: 0.4 },
    { value: pricePerShareByPe, weight: 0.2 },
  ].filter((item) => typeof item.value === 'number' && isFinite(item.value as number) && (item.value as number) > 0);
  const totalWeighted = weightedPriceInputs.reduce((sum, item) => sum + item.weight, 0);
  const blendedPricePerShare =
    totalWeighted > 0
      ? weightedPriceInputs.reduce((sum, item) => sum + (item.value as number) * item.weight, 0) / totalWeighted
      : null;
  const blendedEquityValue =
    blendedPricePerShare !== null && subjectSharesMm !== null && subjectSharesMm > 0
      ? blendedPricePerShare * subjectSharesMm
      : null;
  (compsModel.impliedValuation as any).equityValueByEvRevenue = equityValueByEvRevenue;
  (compsModel.impliedValuation as any).equityValueByEvEbitda = equityValueByEvEbitda;
  (compsModel.impliedValuation as any).equityValueByPe = equityValueByPe;
  (compsModel.impliedValuation as any).pricePerShareByEvRevenue = pricePerShareByEvRevenue;
  (compsModel.impliedValuation as any).pricePerShareByEvEbitda = pricePerShareByEvEbitda;
  (compsModel.impliedValuation as any).pricePerShareByPe = pricePerShareByPe;
  (compsModel.impliedValuation as any).blendedPricePerShare = blendedPricePerShare;
  (compsModel.impliedValuation as any).blendedEquityValue = blendedEquityValue;

  // Add peer metadata to comps model if available
  const compsModelWithMetadata = {
    ...compsModel,
    peerMetadata, // Include metadata for display in Excel/UI
  };

  // Canonical path: workbook is produced from ModelDocument later via mapDocumentToExcel.
  // Keep this function focused on deterministic comps summary construction.
  console.log('[generateModel] ✅ Comps summary built for canonical ModelDocument mapping');
  return compsModelWithMetadata || compsModel;
}

/**
 * Main POST handler with comprehensive error handling
 */
async function handleGenerateModel(req: NextRequest, bodyOverride?: any) {
  logKeyStatus();

  const metricsStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const requestId = crypto.randomUUID();
  const wantsJson =
    req.headers.get('accept')?.includes('application/json') ||
    req.nextUrl.searchParams.get('format') === 'json';
  let metricsTicker: string | null = null;
  let metricsModelType: MetricsModelType | null = null;
  let metricsSuccess = false;
  let runId: string | null = null;
  let currentStage: string = 'initialization';

  try {
    console.log('[generateModel] ========== Incoming request ==========');
    const diagnostics: DataDiagnostics[] = [];
  
  // STEP 1: Validate request body
  currentStage = 'validation';
  let cleanTicker: string;
  let modelType: RequestModelType;
  let body: any;
  let privateManualMode = false;
  let requestSliderOverrides: Record<string, number> = {};
  let requestedLboAdvanced: LboAdvancedOptions | undefined;
  let quickLboPayload:
    | {
        lboOverrides: Record<string, number>;
        lboDealAssumptions: any;
        appliedDefaults: any[];
        workbookNotes: string[];
      }
    | undefined;
  let reverseDcfRawInputs:
    | {
        waccPct: number;
        terminalGrowthPct: number;
        projectionYears: number;
        targetPrice?: number;
        marketCap?: number;
        sharePrice?: number;
        sharesOutstanding?: number;
      }
    | undefined;
  let reverseDcfInputs:
    | (ReverseDcfSolverInputs & {
        targetPrice: number;
        marketPrice: number;
      })
    | undefined;
  let normalizedModelInputs: ModelInputs | null = null;
  let debtCapacityLiteInputs:
    | {
        maxLeverage: number;
        minInterestCoverage: number;
        interestRate: number;
      }
    | undefined;
  let dcfSensitivityConfig = { ...DEFAULT_DCF_SENSITIVITY_CONFIG };
  let lboSensitivityConfig = { ...DEFAULT_LBO_SENSITIVITY_CONFIG };
  
  try {
    body = bodyOverride ?? (await req.json());
    privateManualMode = isPrivateManualMode(body);
    requestSliderOverrides =
      body?.sliderOverrides && typeof body.sliderOverrides === 'object'
        ? body.sliderOverrides
        : {};
    requestedLboAdvanced =
      body?.lboAdvanced && typeof body.lboAdvanced === 'object' ? body.lboAdvanced : undefined;
    console.log('[generateModel] Raw body:', JSON.stringify(body, null, 2));
    
    const validated = validateRequestBody(body);
    cleanTicker = validated.ticker;
    modelType = validated.modelType;
    metricsTicker = cleanTicker;
    const metricsType = mapModelTypeToMetrics(modelType);
    if (metricsType) {
      metricsModelType = metricsType;
    }
    const ctx: ModelRequestContext = {
      requestId,
      ticker: cleanTicker,
      modelType,
      startedAtIso: new Date().toISOString(),
    };
    
    console.log('[generateModel] ✅ Request validated:', { ticker: cleanTicker, modelType });

    try {
      const providedModelInputs =
        body?.modelInputs && typeof body.modelInputs === 'object' ? (body.modelInputs as ModelInputs) : null;
      if (
        providedModelInputs &&
        providedModelInputs.company &&
        providedModelInputs.historicals &&
        Array.isArray(providedModelInputs.historicals.revenue)
      ) {
        normalizedModelInputs = providedModelInputs;
      } else if (privateManualMode) {
        const manualPayload = manualPayloadFromRequest({
          ...body,
          ticker: cleanTicker,
        });
        normalizedModelInputs = fromManual(manualPayload as any);
      } else {
        normalizedModelInputs = await fromTicker(cleanTicker);
      }

      // Apply explicit pricing anchor overrides from the request before validation.
      // Reverse DCF needs these anchors to be visible to the normalization layer,
      // including ticker mode where the user can override demo market context.
      const requestManualInputs =
        body?.manualInputs && typeof body.manualInputs === 'object' ? body.manualInputs : {};
      const coerceFiniteInput = (value: unknown): number | null => {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim().length > 0) {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      };
      const requestMarketCap = coerceFiniteInput(
        body?.marketCap ?? body?.market_cap ?? requestManualInputs?.marketCap
      );
      const requestSharePrice = coerceFiniteInput(
        body?.sharePrice ?? body?.price ?? requestManualInputs?.price
      );
      const requestSharesOutstanding = coerceFiniteInput(
        body?.sharesOutstanding ??
          body?.shares_outstanding ??
          body?.shares_out_basic ??
          requestManualInputs?.sharesOutstanding
      );

      if (
        (requestMarketCap !== null && requestMarketCap > 0) ||
        (requestSharePrice !== null && requestSharePrice > 0) ||
        (requestSharesOutstanding !== null && requestSharesOutstanding > 0)
      ) {
        normalizedModelInputs = {
          ...normalizedModelInputs,
          pricingAnchor: {
            ...(normalizedModelInputs.pricingAnchor || {}),
            ...(requestMarketCap !== null && requestMarketCap > 0 ? { marketCap: requestMarketCap } : {}),
            ...(requestSharePrice !== null && requestSharePrice > 0 ? { sharePrice: requestSharePrice } : {}),
            ...(requestSharesOutstanding !== null && requestSharesOutstanding > 0
              ? { sharesOutstanding: requestSharesOutstanding }
              : {}),
          },
          capitalStructure: {
            ...(normalizedModelInputs.capitalStructure || {}),
            ...(requestSharesOutstanding !== null && requestSharesOutstanding > 0
              ? { sharesOutstanding: requestSharesOutstanding }
              : {}),
          },
        };
      }

      const normalizedResult = normalizeModelInputs(normalizedModelInputs, { modelType });
      if (!normalizedResult.ok || !normalizedResult.value) {
        return NextResponse.json(
          {
            ok: false,
            status: 'failed',
            state: 'failed',
            code: 'model_inputs_invalid',
            message:
              normalizedResult.issues.map((issue) => issue.message).join(' ') ||
              'Model inputs are incomplete or invalid.',
            validationErrors: normalizedResult.issues,
          },
          { status: 400 }
        );
      }
      normalizedModelInputs = normalizedResult.value;
      body.modelInputs = normalizedModelInputs;

      if (normalizedModelInputs) {
        body.companyName = body.companyName || normalizedModelInputs.company.name;
        body.currency = body.currency || normalizedModelInputs.company.currency || 'USD';
        const latestRevenue =
          normalizedModelInputs.historicals.revenue[normalizedModelInputs.historicals.revenue.length - 1];
        const taxRate = normalizedModelInputs.assumptions.taxRate;
        const growth =
          typeof normalizedModelInputs.assumptions.growth === 'number'
            ? normalizedModelInputs.assumptions.growth
            : Array.isArray((normalizedModelInputs.assumptions as any).growthSeries)
              ? (normalizedModelInputs.assumptions as any).growthSeries[0]
              : undefined;
        const normalizedMargin =
          typeof normalizedModelInputs.assumptions.margin === 'number'
            ? normalizedModelInputs.assumptions.margin
            : undefined;
        const sharesFromCapitalStructure =
          typeof normalizedModelInputs.capitalStructure?.sharesOutstanding === 'number'
            ? normalizedModelInputs.capitalStructure.sharesOutstanding
            : undefined;

        body.manualInputs = {
          ...(body.manualInputs && typeof body.manualInputs === 'object' ? body.manualInputs : {}),
          revenue:
            typeof body?.manualInputs?.revenue === 'number'
              ? body.manualInputs.revenue
              : latestRevenue,
          netDebt:
            typeof body?.manualInputs?.netDebt === 'number'
              ? body.manualInputs.netDebt
              : normalizedModelInputs.capitalStructure?.netDebt,
          sharesOutstanding:
            typeof body?.manualInputs?.sharesOutstanding === 'number'
              ? body.manualInputs.sharesOutstanding
              : normalizedModelInputs.pricingAnchor?.sharesOutstanding ?? sharesFromCapitalStructure,
          marketCap:
            typeof body?.manualInputs?.marketCap === 'number'
              ? body.manualInputs.marketCap
              : normalizedModelInputs.pricingAnchor?.marketCap,
          price:
            typeof body?.manualInputs?.price === 'number'
              ? body.manualInputs.price
              : normalizedModelInputs.pricingAnchor?.sharePrice,
          taxRatePct:
            typeof body?.manualInputs?.taxRatePct === 'number'
              ? body.manualInputs.taxRatePct
              : taxRate !== undefined
                ? taxRate * 100
                : undefined,
          revenueGrowthPct:
            typeof body?.manualInputs?.revenueGrowthPct === 'number'
              ? body.manualInputs.revenueGrowthPct
              : growth !== undefined
                ? growth * 100
                : undefined,
          ebitMarginPct:
            typeof body?.manualInputs?.ebitMarginPct === 'number'
              ? body.manualInputs.ebitMarginPct
              : normalizedMargin !== undefined
                ? normalizedMargin * 100
                : undefined,
          capexPctRevenue:
            typeof body?.manualInputs?.capexPctRevenue === 'number'
              ? body.manualInputs.capexPctRevenue
              : normalizedModelInputs.assumptions.capexPctRevenue * 100,
          nwcPctRevenue:
            typeof body?.manualInputs?.nwcPctRevenue === 'number'
              ? body.manualInputs.nwcPctRevenue
              : normalizedModelInputs.assumptions.nwcPctRevenue * 100,
          daPctRevenue:
            typeof body?.manualInputs?.daPctRevenue === 'number'
              ? body.manualInputs.daPctRevenue
              : normalizedModelInputs.assumptions.daPctRevenue !== undefined
                ? normalizedModelInputs.assumptions.daPctRevenue * 100
                : undefined,
        };

        body.sliderOverrides = {
          ...(body.sliderOverrides && typeof body.sliderOverrides === 'object' ? body.sliderOverrides : {}),
          ...(growth !== undefined ? { revenueGrowth: growth } : {}),
          ...(normalizedMargin !== undefined ? { ebitdaMargin: normalizedMargin } : {}),
          ...(taxRate !== undefined ? { taxRate } : {}),
          capexPctRevenue: normalizedModelInputs.assumptions.capexPctRevenue,
          deltaNwcPctRevenue: normalizedModelInputs.assumptions.nwcPctRevenue,
          ...(normalizedModelInputs.assumptions.daPctRevenue !== undefined
            ? { daPctRevenue: normalizedModelInputs.assumptions.daPctRevenue }
            : {}),
        };
      }
    } catch (normalizedInputError: any) {
      return NextResponse.json(
        {
          ok: false,
          status: 'failed',
          state: 'failed',
          code: privateManualMode ? 'manual_inputs_invalid' : 'ticker_inputs_invalid',
          message:
            normalizedInputError?.message ||
            (privateManualMode
              ? 'Manual inputs are incomplete or invalid.'
              : `Unable to normalize ticker inputs for ${cleanTicker}.`),
        },
        { status: 400 }
      );
    }

    if (modelType === 'lbo' && body?.quickLbo === true) {
      const normalizedQuickInputs = normalizeQuickLboInputs(body?.lboQuickInputs ?? body);
      if (!normalizedQuickInputs) {
        return NextResponse.json(
          {
            ok: false,
            status: 'failed',
            state: 'failed',
            code: 'quick_lbo_invalid',
            message:
              'Quick LBO requires entryMultiple, debtPercent, interestRatePct, revenueGrowthPct, exitMultiple, and holdingPeriodYears.',
          },
          { status: 400 }
        );
      }
      quickLboPayload = buildQuickLboPayload(normalizedQuickInputs);
      body.lboOverrides = {
        ...(body?.lboOverrides && typeof body.lboOverrides === 'object' ? body.lboOverrides : {}),
        ...quickLboPayload.lboOverrides,
      };
      body.lboDealAssumptions = quickLboPayload.lboDealAssumptions;
      body.quickLboDefaults = quickLboPayload.appliedDefaults;
      console.log('[generateModel] Quick LBO mode enabled for demo flow');
    }

    if (modelType === 'reverse-dcf') {
      const parsedReverse = parseReverseDcfInputs(body?.reverseDcfInputs ?? body);
      if (!parsedReverse) {
        return NextResponse.json(
          {
            ok: false,
            status: 'failed',
            state: 'failed',
            code: 'reverse_dcf_invalid',
            message: 'Reverse DCF requires waccPct, terminalGrowthPct, and projectionYears.',
          },
          { status: 400 }
        );
      }
      if (parsedReverse.waccPct <= 0 || parsedReverse.waccPct >= 60) {
        return NextResponse.json(
          {
            ok: false,
            status: 'failed',
            state: 'failed',
            code: 'reverse_dcf_invalid',
            message: 'Reverse DCF WACC must be between 0% and 60%.',
          },
          { status: 400 }
        );
      }
      if (parsedReverse.terminalGrowthPct <= -10 || parsedReverse.terminalGrowthPct >= parsedReverse.waccPct) {
        return NextResponse.json(
          {
            ok: false,
            status: 'failed',
            state: 'failed',
            code: 'reverse_dcf_invalid',
            message: 'Reverse DCF terminal growth must be less than WACC.',
          },
          { status: 400 }
        );
      }
      if (parsedReverse.projectionYears < 3 || parsedReverse.projectionYears > 10) {
        return NextResponse.json(
          {
            ok: false,
            status: 'failed',
            state: 'failed',
            code: 'reverse_dcf_invalid',
            message: 'Reverse DCF projection years must be between 3 and 10.',
          },
          { status: 400 }
        );
      }
      const manualInputs = body?.manualInputs && typeof body.manualInputs === 'object' ? body.manualInputs : {};
      const parsedMarketCap =
        typeof body?.marketCap === 'number'
          ? body.marketCap
          : typeof body?.market_cap === 'number'
            ? body.market_cap
            : typeof manualInputs?.marketCap === 'number'
              ? manualInputs.marketCap
              : typeof normalizedModelInputs?.pricingAnchor?.marketCap === 'number'
                ? normalizedModelInputs.pricingAnchor.marketCap
              : undefined;
      const parsedSharePrice =
        typeof body?.sharePrice === 'number'
          ? body.sharePrice
          : typeof body?.price === 'number'
            ? body.price
            : typeof manualInputs?.price === 'number'
              ? manualInputs.price
              : typeof normalizedModelInputs?.pricingAnchor?.sharePrice === 'number'
                ? normalizedModelInputs.pricingAnchor.sharePrice
              : undefined;
      const parsedSharesOutstanding =
        typeof body?.sharesOutstanding === 'number'
          ? body.sharesOutstanding
          : typeof body?.shares_outstanding === 'number'
            ? body.shares_outstanding
            : typeof body?.shares_out_basic === 'number'
              ? body.shares_out_basic
              : typeof manualInputs?.sharesOutstanding === 'number'
                ? manualInputs.sharesOutstanding
                : typeof normalizedModelInputs?.pricingAnchor?.sharesOutstanding === 'number'
                  ? normalizedModelInputs.pricingAnchor.sharesOutstanding
                : undefined;
      if (
        !privateManualMode &&
        parsedReverse.targetPrice === undefined &&
        parsedMarketCap === undefined &&
        !(parsedSharePrice !== undefined && parsedSharesOutstanding !== undefined)
      ) {
        // Public/ticker mode can still use fetched market price later.
      } else if (
        privateManualMode &&
        parsedMarketCap === undefined &&
        !(parsedSharePrice !== undefined && parsedSharesOutstanding !== undefined)
      ) {
        return NextResponse.json(
          {
            ok: false,
            status: 'failed',
            state: 'failed',
            code: 'reverse_dcf_missing_anchor',
            message: 'Reverse DCF requires market cap OR share price + shares outstanding.',
          },
          { status: 400 }
        );
      }
      parsedReverse.marketCap = parsedMarketCap;
      parsedReverse.sharePrice = parsedSharePrice;
      parsedReverse.sharesOutstanding = parsedSharesOutstanding;
      reverseDcfRawInputs = parsedReverse;
      body.reverseDcfInputs = parsedReverse;
      console.log('[generateModel] Reverse DCF mode enabled');
    }

    if (modelType === 'debt-capacity-lite') {
      const parsedDebtCapacityLite = parseDebtCapacityLiteInputs(
        body?.debtCapacityLiteInputs ?? body
      );
      if (!parsedDebtCapacityLite) {
        return NextResponse.json(
          {
            ok: false,
            status: 'failed',
            state: 'failed',
            code: 'debt_capacity_invalid',
            message:
              'Debt Capacity Lite requires maxLeverage, minInterestCoverage, and interestRate (%).',
          },
          { status: 400 }
        );
      }
      const validatedDebtCapacityLite = validateDebtCapacityLiteInputs(parsedDebtCapacityLite);
      if (!validatedDebtCapacityLite.ok) {
        return NextResponse.json(
          {
            ok: false,
            status: 'failed',
            state: 'failed',
            code: 'debt_capacity_invalid',
            message: validatedDebtCapacityLite.message,
          },
          { status: 400 }
        );
      }
      debtCapacityLiteInputs = validatedDebtCapacityLite.value;
      body.debtCapacityLiteInputs = {
        maxLeverage: debtCapacityLiteInputs.maxLeverage,
        minInterestCoverage: debtCapacityLiteInputs.minInterestCoverage,
        interestRatePct: parsedDebtCapacityLite.interestRatePct,
      };
      console.log('[generateModel] Debt Capacity Lite mode enabled');
    }

    if (modelType === 'dcf' || modelType === 'reverse-dcf') {
      const parsedDcfSensitivity = parseDcfSensitivityConfig(
        body?.sensitivity?.dcf ?? body?.dcfSensitivity
      );
      if (!parsedDcfSensitivity.ok) {
        return NextResponse.json(
          {
            ok: false,
            status: 'failed',
            state: 'failed',
            code: 'sensitivity_invalid',
            message: parsedDcfSensitivity.error,
          },
          { status: 400 }
        );
      }
      dcfSensitivityConfig = parsedDcfSensitivity.value;
      body.sensitivity = {
        ...(body?.sensitivity && typeof body.sensitivity === 'object' ? body.sensitivity : {}),
        dcf: dcfSensitivityConfig,
      };
    }

    if (modelType === 'lbo') {
      const parsedLboSensitivity = parseLboSensitivityConfig(
        body?.sensitivity?.lbo ?? body?.lboSensitivity
      );
      if (!parsedLboSensitivity.ok) {
        return NextResponse.json(
          {
            ok: false,
            status: 'failed',
            state: 'failed',
            code: 'sensitivity_invalid',
            message: parsedLboSensitivity.error,
          },
          { status: 400 }
        );
      }
      lboSensitivityConfig = parsedLboSensitivity.value;
      body.sensitivity = {
        ...(body?.sensitivity && typeof body.sensitivity === 'object' ? body.sensitivity : {}),
        lbo: lboSensitivityConfig,
      };
    }

    if (isDemoMode() && !privateManualMode) {
      const demoAllowed = await isDemoTickerAvailable(cleanTicker);
      if (!demoAllowed) {
      return NextResponse.json(
        {
          ok: false,
          state: 'failed',
          status: 'failed',
          code: 'DEMO_NOT_FOUND',
          message: 'This demo ticker is not in the curated demo set. Choose a demo company.',
        },
        { status: 400 }
      );
      }
    }
    
    // Create run record now that we have cleanTicker and modelType
    try {
      runId = await createModelRun({
        ticker: cleanTicker,
        modelType,
      });
    } catch (err) {
      console.warn('[generateModel] Failed to create run record:', err);
    }
  } catch (err: any) {
    console.error('[generateModel] ❌ Request validation / parsing failed:', err);
    throw new Error(`Invalid request: ${err?.message || 'Failed to parse or validate request body'}`);
  }

  // STEP 2: Fetch financial data (LTM + Historical + Estimates + Peers + Working Capital)
  let ltmFinancials: any = null;
  let normalizedFinancials: ScaledFinancials | null = null;
  let historicalFinancials: any = null;
  let consensusEstimates: any = null;
  let peerComps: any = null;
  let workingCapitalDetails: any = null;
  let lboIngestion: any = null;
  const runtimeFallbackWarnings: string[] = [];
  
  const fetchDiag = createDiagnostic(cleanTicker, modelType as any, 'Unknown', 'fetch', true);
  const fetchStartTime = Date.now();
  
  try {
    const demoMode = isDemoMode();
    let historicalResult: PromiseSettledResult<any> = { status: 'fulfilled', value: null };
    let consensusResult: PromiseSettledResult<any> = { status: 'fulfilled', value: null };
    let peerResult: PromiseSettledResult<any> = { status: 'fulfilled', value: null };
    let wcResult: PromiseSettledResult<any> = { status: 'fulfilled', value: null };

    if (privateManualMode && normalizedModelInputs) {
      ltmFinancials = buildLtmFinancialsFromModelInputs(cleanTicker, normalizedModelInputs);
      fetchDiag.dataSource = 'Manual' as any;
      fetchDiag.warnings.push('Manual mode active: using provided financial inputs only.');
      console.log('[generateModel] Private/manual mode active, skipping external financial fetch.');
    } else {
      // Fetch all data sources in parallel (skip live providers in demo mode)
      const ltmPromise = modelType === 'lbo' && !demoMode
        ? fetchLboIngestion(cleanTicker)
        : getOrFetchFinancialsSafe(cleanTicker);

      const settled = demoMode
        ? [
            { status: 'fulfilled', value: await ltmPromise } as PromiseFulfilledResult<any>,
            { status: 'fulfilled', value: null } as PromiseFulfilledResult<any>,
            { status: 'fulfilled', value: null } as PromiseFulfilledResult<any>,
            { status: 'fulfilled', value: null } as PromiseFulfilledResult<any>,
            { status: 'fulfilled', value: null } as PromiseFulfilledResult<any>,
          ]
        : await Promise.allSettled([
            ltmPromise,
            import('@/lib/data/historicalFinancials').then((m) => m.fetchHistoricalFinancials(cleanTicker, 5)),
            import('@/lib/data/consensusEstimates').then((m) => m.fetchConsensusEstimates(cleanTicker)),
            import('@/lib/data/peerComps').then((m) => m.fetchPeerComps(cleanTicker, undefined)),
            import('@/lib/data/workingCapitalDetails').then((m) => m.fetchWorkingCapitalDetails(cleanTicker)),
          ]);

      const [ltmResult, histResult, consResult, peersResult, workingCapitalResult] = settled;
      historicalResult = histResult;
      consensusResult = consResult;
      peerResult = peersResult;
      wcResult = workingCapitalResult;

      // Process LTM financials
      if (ltmResult.status === 'fulfilled') {
        if (modelType === 'lbo') {
          lboIngestion = ltmResult.value;
          if (lboIngestion && hasLboIngestionData(lboIngestion)) {
            ltmFinancials = mapLboIngestionToLtmFinancials(lboIngestion);
            fetchDiag.dataSource = ltmFinancials.dataSource as any;
            console.log(`[generateModel] ✅ LBO ingestion fetched (${fetchDiag.dataSource})`);
          } else {
            ltmFinancials = null;
            fetchDiag.ok = false;
            fetchDiag.warnings.push('No LBO ingestion data returned from free APIs');
            console.log('[generateModel] ⚠️  No LBO ingestion data available');
          }
        } else {
          ltmFinancials = ltmResult.value;
          if (ltmFinancials) {
            fetchDiag.dataSource = ltmFinancials.dataSource as any;
            console.log('[generateModel] ✅ LTM financial data fetched successfully');
          }
        }
      }
    }

    if (!ltmFinancials && normalizedModelInputs) {
      ltmFinancials = buildLtmFinancialsFromModelInputs(cleanTicker, normalizedModelInputs);
      runtimeFallbackWarnings.push(LIVE_DATA_FALLBACK_NOTICE);
      fetchDiag.warnings.push(LIVE_DATA_FALLBACK_NOTICE);
      fetchDiag.dataSource = 'Demo-Fallback' as any;
      console.warn('[generateModel] Live data unavailable, using normalized ModelInputs fallback.');
    }

    if (normalizedModelInputs?.metadata?.liveDataFallback) {
      runtimeFallbackWarnings.push(LIVE_DATA_FALLBACK_NOTICE);
    }

    fetchDiag.durationMs = Date.now() - fetchStartTime;

    if (
      demoMode &&
      !privateManualMode &&
      (modelType === 'dcf' || modelType === 'reverse-dcf' || modelType === 'three-statement')
    ) {
      const demoRevenue =
        typeof ltmFinancials?.revenue === 'number' ? ltmFinancials.revenue : null;
      if (demoRevenue === null || Number.isNaN(demoRevenue) || demoRevenue < 0) {
        return NextResponse.json(
          {
            ok: false,
            state: 'failed',
            status: 'failed',
            code: 'demo_missing_revenue',
            message: 'Demo row is missing revenue. Refresh demo snapshots.',
          },
          { status: 400 }
        );
      }
    }

    if (demoMode && modelType === 'lbo') {
      const readiness = assessDemoLboReadiness(ltmFinancials);
      if (!readiness.ready) {
        return NextResponse.json(
          {
            ok: false,
            state: 'failed',
            status: 'failed',
            code: 'demo_lbo_not_ready',
            message: 'Ticker is not LBO-ready in demo dataset',
            details: {
              revenue: readiness.revenue,
              ebitda: readiness.ebitda,
            },
          },
          { status: 400 }
        );
      }
    }
    
    // Process historical financials
    if (historicalResult.status === 'fulfilled' && historicalResult.value) {
      historicalFinancials = historicalResult.value;
      console.log(`[generateModel] ✅ Historical financials: ${historicalFinancials.years.length} years`);
    } else {
      console.log(`[generateModel] ⚠️  No historical financials available`);
    }
    
    // Process consensus estimates
    if (consensusResult.status === 'fulfilled' && consensusResult.value) {
      consensusEstimates = consensusResult.value;
      console.log(`[generateModel] ✅ Consensus estimates: ${consensusEstimates.analystCount} analysts`);
    } else {
      console.log(`[generateModel] ⚠️  No consensus estimates available`);
    }
    
    // Process peer comps
    if (peerResult.status === 'fulfilled' && peerResult.value) {
      peerComps = peerResult.value;
      console.log(`[generateModel] ✅ Peer comps: ${peerComps.peers.length} peers, sector: ${peerComps.sector}`);
    } else {
      console.log(`[generateModel] ⚠️  No peer comps available`);
    }
    
    // Process working capital details
    if (wcResult.status === 'fulfilled' && wcResult.value) {
      workingCapitalDetails = wcResult.value;
      console.log(`[generateModel] ✅ Working capital: AR ${workingCapitalDetails.arDays} days, Inv ${workingCapitalDetails.inventoryDays} days, AP ${workingCapitalDetails.apDays} days`);
    } else {
      console.log(`[generateModel] ⚠️  No working capital details available`);
    }
    
    if (!ltmFinancials) {
      fetchDiag.ok = false;
      fetchDiag.warnings.push('No financial data available, will use AI fallback');
      console.log(`[generateModel] ⚠️  No LTM financial data, using AI fallback`);
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

    // Get shares outstanding from multiple sources (priority: historical > LTM > derived)
    let sharesOutstanding = unifiedAssumptions.fdShares;
    
    // Try historical data first (most recent year)
    if (historicalFinancials && historicalFinancials.sharesOutstanding && historicalFinancials.sharesOutstanding.length > 0) {
      const latestShares = historicalFinancials.sharesOutstanding[historicalFinancials.sharesOutstanding.length - 1];
      if (latestShares > 0) {
        sharesOutstanding = latestShares > 1_000_000 ? latestShares / 1_000_000 : latestShares;
        console.log(`[generateModel] Using shares outstanding from historical data: ${sharesOutstanding.toFixed(2)}M`);
      }
    }
    
    // Try LTM data
    if (!sharesOutstanding && ltmFinancials?.sharesOutstanding) {
      sharesOutstanding =
        ltmFinancials.sharesOutstanding > 1_000_000
          ? ltmFinancials.sharesOutstanding / 1_000_000
          : ltmFinancials.sharesOutstanding;
      console.log(`[generateModel] Using shares outstanding from LTM data: ${sharesOutstanding.toFixed(2)}M`);
    }
    
    // Derive from market cap and price if still missing
    if (!sharesOutstanding || sharesOutstanding <= 0) {
      if (fallbackMarketCap > 0 && unifiedAssumptions.sharePrice > 0) {
        sharesOutstanding = fallbackMarketCap / unifiedAssumptions.sharePrice;
        console.log(`[generateModel] Derived shares outstanding from market cap / price: ${sharesOutstanding.toFixed(2)}M`);
      }
    }
    
    // Final fallback
    if (!sharesOutstanding || sharesOutstanding <= 0) {
      sharesOutstanding = unifiedAssumptions.fdShares || 1000; // Default to 1B shares
      console.log(`[generateModel] Using default shares outstanding: ${sharesOutstanding.toFixed(2)}M`);
    }
    
    // CRITICAL: Manual inputs take highest priority - override unified assumptions
    const manualInputs = body.manualInputs;
    const finalRevenue = manualInputs?.revenue || (unifiedAssumptions.ltmRevenue * 1_000_000);
    const finalEbitda = manualInputs?.ebitda || (unifiedAssumptions.ltmEbitda * 1_000_000);
    const finalEbit = manualInputs?.ebit || (fallbackEbit * 1_000_000);
    const finalNetDebt = manualInputs?.netDebt !== undefined ? manualInputs.netDebt : (unifiedAssumptions.netDebt * 1_000_000);
    const finalMarketCap = manualInputs?.marketCap || fallbackMarketCap * 1_000_000;
    
    if (manualInputs) {
      console.log(`[generateModel] ✅ Using manual inputs (highest priority):`, Object.keys(manualInputs));
    }
    
    const rawFinancials: RawFinancials = {
      revenue: finalRevenue,
      ebit: finalEbit,
      ebitda: finalEbitda,
      freeCashFlow: fallbackFcf * 1_000_000,
      netDebt: finalNetDebt,
      sharesOutstanding: sharesOutstanding * 1_000_000,
      marketCap: finalMarketCap,
    };

    normalizedFinancials = cleanAndScaleFinancials(rawFinancials);
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

  // STEP 3B: Build partial assumptions (with enhanced data)
  let partialAssumptions: PartialThreeStatementAssumptions;
  try {
    partialAssumptions = buildPartialAssumptions(body, ltmFinancials, {
      historicalFinancials,
      consensusEstimates,
      peerComps,
      workingCapitalDetails,
    });
    
    // Apply settings defaults to partial assumptions
    if (settings) {
      try {
        const result = await applyDefaultsToModelInputs(
          partialAssumptions,
          settings
        );
        partialAssumptions = result.inputs as PartialThreeStatementAssumptions;
        appliedDefaults = result.appliedDefaults || [];
        if (appliedDefaults.length > 0) {
          console.log('[generateModel] ✅ Applied defaults:', appliedDefaults.map(d => `${d.field}=${d.value}`).join(', '));
        }
      } catch (defaultsError: any) {
        console.warn('[generateModel] ⚠️  Failed to apply defaults:', defaultsError);
        appliedDefaults = [];
      }
    }

    if (modelType === 'lbo' && quickLboPayload?.appliedDefaults?.length) {
      appliedDefaults = [...appliedDefaults, ...quickLboPayload.appliedDefaults];
    }
    
    console.log('[generateModel] ✅ Partial assumptions built');
  } catch (err: any) {
    console.error('[generateModel] ❌ Failed to build partial assumptions:', err);
    throw new Error(err?.message || 'Failed to build assumptions');
  }

  // STEP 4: Enrich assumptions with OpenAI + Enhanced Data
  let enrichedAssumptions: ThreeStatementAssumptions;
  const aiFallbackDiag = createDiagnostic(cleanTicker, modelType as any, 'AI-Fallback', 'ai-fallback', true);
  const aiStartTime = Date.now();
  let usedAiFallback = false;
  
  try {
    const demoMode = isDemoMode();
    if (demoMode) {
      console.log('[generateModel] Demo mode: skipping AI enrichment; applying deterministic defaults.');
      enrichedAssumptions = {
        ticker: cleanTicker,
        companyName: ltmFinancials?.companyName || body.companyName,
        sector: body.sector || ltmFinancials?.sector || peerComps?.sector,
        modelType,
        currency: body.currency || 'USD',
        ...partialAssumptions,
        enriched: false,
      } as any;
      aiFallbackDiag.durationMs = Date.now() - aiStartTime;
      aiFallbackDiag.usedAiFallback = false;
      logDiagnostic(aiFallbackDiag);
      diagnostics.push(aiFallbackDiag);
    } else {
      console.log('[generateModel] Enriching assumptions with OpenAI + Enhanced Data...');
      
      // Prepare historical data for enrichment
      const historicalDataForEnrichment: Record<string, number[]> = {};
      if (historicalFinancials) {
        historicalDataForEnrichment.revenue = historicalFinancials.revenue;
        historicalDataForEnrichment.ebitda = historicalFinancials.ebitda;
        historicalDataForEnrichment.ebit = historicalFinancials.ebit;
        historicalDataForEnrichment.netIncome = historicalFinancials.netIncome;
        historicalDataForEnrichment.capex = historicalFinancials.capex;
        historicalDataForEnrichment.depreciation = historicalFinancials.depreciation;
        historicalDataForEnrichment.workingCapital = historicalFinancials.workingCapital;
      }
      
      // CRITICAL: Preserve revenue from partialAssumptions (this is the SOFI LTM data)
      // Pass it explicitly to ensure it's not lost during enrichment
      const revenueFromPartial = partialAssumptions?.revenue;
      
      enrichedAssumptions = await enrichUnifiedAssumptions({
        ticker: cleanTicker,
        companyName: ltmFinancials?.companyName || body.companyName,
        sector: body.sector || ltmFinancials?.sector || peerComps?.sector,
        modelType,
        currency: body.currency || 'USD',
        partialAssumptions,
        userNotes: body.scenarioNotes,
        // CRITICAL: Explicitly pass revenue from LTM financials to preserve it
        revenue: revenueFromPartial && Array.isArray(revenueFromPartial) && revenueFromPartial.length > 0 
          ? revenueFromPartial 
          : undefined,
        // Pass enhanced data sources
        historicalData: historicalDataForEnrichment,
        consensusEstimates,
        peerComps,
        workingCapitalDetails,
      });
      
      // CRITICAL: After enrichment, ensure revenue from partialAssumptions is preserved
      // (enrichment might have overwritten it)
      if (revenueFromPartial && Array.isArray(revenueFromPartial) && revenueFromPartial.length > 0) {
        enrichedAssumptions.revenue = revenueFromPartial;
        console.log(`[generateModel] ✅ Preserved revenue from LTM financials after enrichment: ${revenueFromPartial.map(r => r.toFixed(0)).join(', ')}`);
      }
      
      aiFallbackDiag.durationMs = Date.now() - aiStartTime;
      aiFallbackDiag.usedAiFallback = false;
      console.log('[generateModel] ✅ Assumptions enriched successfully (OpenAI)');
      logDiagnostic(aiFallbackDiag);
      diagnostics.push(aiFallbackDiag);
    }
  } catch (err: any) {
    usedAiFallback = true;
    aiFallbackDiag.ok = false;
    aiFallbackDiag.durationMs = Date.now() - aiStartTime;
    aiFallbackDiag.errors.push(err?.message || 'AI enrichment failed');
    console.error('[generateModel] ❌ AI enrichment failed:', err);
    logDiagnostic(aiFallbackDiag);
    diagnostics.push(aiFallbackDiag);
    // Fallback to defaults
    enrichedAssumptions = {
      ticker: cleanTicker,
      revenue: [1000, 1080, 1166, 1259, 1360],
      revenueGrowth: [0.08, 0.08, 0.08, 0.08, 0.08],
      cogsPct: [0.6, 0.6, 0.6, 0.6, 0.6],
      opexPct: [0.2, 0.2, 0.2, 0.2, 0.2],
      daPct: [0.05, 0.05, 0.05, 0.05, 0.05],
      capexPctRevenue: [0.04, 0.04, 0.04, 0.04, 0.04],
      taxRate: 0.25,
      // Generate default years array (5 years starting from current year)
      years: Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + i),
    } as any;
  }

  // STEP 5: Sanitize assumptions
  currentStage = 'sanitize';
  let sanitizedAssumptions: ThreeStatementAssumptions;
  const sanitizeDiag = createDiagnostic(cleanTicker, modelType as any, ltmFinancials?.dataSource as any || 'AI-Fallback', 'sanitize', true);
  const sanitizeStartTime = Date.now();
  
  console.log('[generateModel] Sanitizing assumptions...');
  console.log('[generateModel] Enriched assumptions keys:', Object.keys(enrichedAssumptions || {}));
  
  // Ensure enrichedAssumptions has required array properties before sanitization
  // Generate default years if missing
  const currentYear = new Date().getFullYear();
  const defaultYears = Array.from({ length: 5 }, (_, i) => currentYear + i);
  
  // CRITICAL: Preserve revenue from partialAssumptions if it exists (this is the SOFI data)
  // Only fall back to enrichedAssumptions if partialAssumptions doesn't have it
  const revenueFromPartial = partialAssumptions?.revenue;
  const revenueFromEnriched = enrichedAssumptions?.revenue;
  
  const safeEnrichedAssumptions = {
    ...enrichedAssumptions,
    // Always ensure years array exists and has values
    years: (enrichedAssumptions.years && Array.isArray(enrichedAssumptions.years) && enrichedAssumptions.years.length > 0)
      ? enrichedAssumptions.years
      : defaultYears,
    // PRIORITIZE revenue from partialAssumptions (LTM data) over enriched assumptions
    revenue: (Array.isArray(revenueFromPartial) && revenueFromPartial.length > 0)
      ? revenueFromPartial
      : (Array.isArray(revenueFromEnriched) ? revenueFromEnriched : [revenueFromEnriched || 1000]),
    revenueGrowth: Array.isArray(enrichedAssumptions.revenueGrowth) ? enrichedAssumptions.revenueGrowth : [enrichedAssumptions.revenueGrowth || 0.1],
    cogsPct: Array.isArray(enrichedAssumptions.cogsPct) ? enrichedAssumptions.cogsPct : [enrichedAssumptions.cogsPct || 0.6],
    opexPct: Array.isArray(enrichedAssumptions.opexPct) ? enrichedAssumptions.opexPct : [enrichedAssumptions.opexPct || 0.2],
    daPct: Array.isArray(enrichedAssumptions.daPct) ? enrichedAssumptions.daPct : [enrichedAssumptions.daPct || 0.05],
    capexPctRevenue: Array.isArray(enrichedAssumptions.capexPctRevenue) ? enrichedAssumptions.capexPctRevenue : [enrichedAssumptions.capexPctRevenue || 0.04],
  };
  
  const sanitizationResult = sanitizeAssumptions(safeEnrichedAssumptions);
  sanitizeDiag.durationMs = Date.now() - sanitizeStartTime;
  
  if (!sanitizationResult.ok) {
    sanitizeDiag.ok = false;
    sanitizeDiag.errors.push(sanitizationResult.error);
    diagnostics.push(sanitizeDiag);
    logDiagnostic(sanitizeDiag);
    return NextResponse.json(
      {
        ok: false,
        requestId,
        code: sanitizationResult.error.code,
        message: sanitizationResult.error.message,
        stage: 'sanitize',
        details: sanitizationResult.error.details,
      },
      { status: 422 }
    );
  }
  
  // Log sanitization results (pass before and after for comparison)
  try {
    const sanitizationLog = formatSanitizationLog(
      safeEnrichedAssumptions,
      sanitizationResult.value,
      { ticker: cleanTicker, modelType }
    );
    if (sanitizationLog) {
      console.log(`[generateModel] Sanitization results:\n${sanitizationLog}`);
    }
  } catch (logErr) {
    console.warn('[generateModel] Sanitization logging skipped (error):', logErr);
  }
  
  // Validate sanitized assumptions (returns ValidationResult with errors/warnings)
  const validationResult = validateSanitizedAssumptions(sanitizationResult.value);
  
  // Add validation warnings/errors to diagnostics
  if (validationResult.errors.length > 0) {
    sanitizeDiag.errors.push(...validationResult.errors.map(e => ({ issue: e })));
  }
  if (validationResult.warnings.length > 0) {
    sanitizeDiag.warnings.push(...validationResult.warnings.map(w => ({ issue: w })));
  }
  
  sanitizedAssumptions = sanitizationResult.value as ThreeStatementAssumptions;
  
  // CRITICAL: Ensure years array is always set after sanitization
  if (!sanitizedAssumptions.years || !Array.isArray(sanitizedAssumptions.years) || sanitizedAssumptions.years.length === 0) {
    const currentYear = new Date().getFullYear();
    sanitizedAssumptions.years = Array.from({ length: 5 }, (_, i) => currentYear + i);
    console.log(`[generateModel] ⚠️  Years array was missing/empty after sanitization, using defaults: ${sanitizedAssumptions.years.join(', ')}`);
  }
  
  if (normalizedFinancials) {
    sanitizedAssumptions.sharesOutstanding = normalizedFinancials.sharesOutstandingM || sanitizedAssumptions.sharesOutstanding;
    const nf = normalizedFinancials as ScaledFinancials & { netDebtM?: number; totalDebtM?: number; netDebt?: number; totalDebt?: number; cashM?: number };
    const netDebtM =
      nf.netDebtM ??
      (typeof nf.netDebt === 'number' ? normalizeToMillions(nf.netDebt, nf.scale) : undefined) ??
      (ltmFinancials && typeof ltmFinancials.totalDebt === 'number' && typeof ltmFinancials.cash === 'number'
        ? (ltmFinancials.totalDebt - ltmFinancials.cash) / 1_000_000
        : undefined);
    const totalDebtM =
      nf.totalDebtM ??
      (typeof nf.totalDebt === 'number' ? normalizeToMillions(nf.totalDebt, nf.scale) : undefined) ??
      (ltmFinancials && typeof ltmFinancials.totalDebt === 'number' ? ltmFinancials.totalDebt / 1_000_000 : undefined);
    (sanitizedAssumptions as any).netDebt = netDebtM;
    sanitizedAssumptions.debt =
      totalDebtM ??
      (netDebtM != null && sanitizedAssumptions.startingCash != null ? netDebtM + sanitizedAssumptions.startingCash : undefined);
  }
  if (requestedLboAdvanced) {
    (sanitizedAssumptions as any).lboAdvanced = requestedLboAdvanced;
  }

  // Build canonical financials (SSOT) and apply to assumptions/normalized data
  const canonicalFinancials = buildCanonicalFinancials({
    requestBody: body,
    normalizedFinancials,
    ltmFinancials,
    assumptions: sanitizedAssumptions,
    lastUpdated: normalizedFinancials?.lastUpdated || ltmFinancials?.lastUpdated,
  });

  const canonicalValues = canonicalFinancials.values;
  const canonicalSharesMillions =
    canonicalValues.sharesOutstanding.value !== null
      ? isDemoMode()
        ? canonicalValues.sharesOutstanding.value
        : canonicalValues.sharesOutstanding.value / 1_000_000
      : null;
  const canonicalMarketPrice =
    canonicalValues.price.value !== null
      ? canonicalValues.price.value
      : canonicalValues.marketCap.value !== null &&
          canonicalValues.sharesOutstanding.value !== null &&
          canonicalValues.sharesOutstanding.value > 0
        ? canonicalValues.marketCap.value / canonicalValues.sharesOutstanding.value
        : typeof ltmFinancials?.marketCap === 'number' &&
            typeof ltmFinancials?.sharesOutstanding === 'number' &&
            ltmFinancials.sharesOutstanding > 0
          ? ltmFinancials.marketCap / ltmFinancials.sharesOutstanding
          : null;
  if (canonicalSharesMillions !== null) {
    sanitizedAssumptions.sharesOutstanding = canonicalSharesMillions;
  }
  if (isDemoMode() && !privateManualMode && modelType !== 'lbo') {
    const demoRevenue =
      canonicalValues.revenue.value ??
      (typeof ltmFinancials?.revenue === 'number' ? ltmFinancials.revenue : null);
    if (demoRevenue === null || Number.isNaN(demoRevenue) || demoRevenue < 0) {
      return NextResponse.json(
        {
          ok: false,
          state: 'failed',
          status: 'failed',
          code: 'demo_invalid_revenue',
          message: 'Demo row is missing revenue or has invalid revenue.',
        },
        { status: 400 }
      );
    }
    if (
      canonicalSharesMillions === null ||
      !Number.isFinite(canonicalSharesMillions) ||
      canonicalSharesMillions <= 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          state: 'failed',
          status: 'failed',
          code: 'demo_invalid_shares',
          message: 'Demo row is missing shares outstanding or has invalid shares.',
        },
        { status: 400 }
      );
    }
    if (modelType === 'reverse-dcf') {
      const reverseSharesAnchor =
        typeof reverseDcfRawInputs?.sharesOutstanding === 'number' &&
        Number.isFinite(reverseDcfRawInputs.sharesOutstanding) &&
        reverseDcfRawInputs.sharesOutstanding > 0
          ? reverseDcfRawInputs.sharesOutstanding
          : canonicalSharesMillions;
      const reverseMarketCapAnchor =
        typeof reverseDcfRawInputs?.marketCap === 'number' &&
        Number.isFinite(reverseDcfRawInputs.marketCap) &&
        reverseDcfRawInputs.marketCap > 0
          ? reverseDcfRawInputs.marketCap
          : typeof canonicalValues.marketCap.value === 'number' &&
              Number.isFinite(canonicalValues.marketCap.value) &&
              canonicalValues.marketCap.value > 0
            ? canonicalValues.marketCap.value
            : null;
      const reverseSharePriceAnchor =
        typeof reverseDcfRawInputs?.sharePrice === 'number' &&
        Number.isFinite(reverseDcfRawInputs.sharePrice) &&
        reverseDcfRawInputs.sharePrice > 0
          ? reverseDcfRawInputs.sharePrice
          : canonicalMarketPrice;
      const reverseImpliedPrice =
        reverseMarketCapAnchor !== null &&
        reverseSharesAnchor !== null &&
        Number.isFinite(reverseSharesAnchor) &&
        reverseSharesAnchor > 0
          ? reverseMarketCapAnchor / reverseSharesAnchor
          : null;
      const hasMarketCapAnchor = reverseMarketCapAnchor !== null && reverseMarketCapAnchor > 0;
      const hasSharePairAnchor =
        reverseSharePriceAnchor !== null &&
        Number.isFinite(reverseSharePriceAnchor) &&
        reverseSharePriceAnchor > 0 &&
        reverseSharesAnchor !== null &&
        Number.isFinite(reverseSharesAnchor) &&
        reverseSharesAnchor > 0;
      if (!hasMarketCapAnchor && !hasSharePairAnchor) {
        return NextResponse.json(
          {
            ok: false,
            state: 'failed',
            status: 'failed',
            code: 'reverse_dcf_missing_anchor',
            message: 'Reverse DCF requires market cap OR share price + shares outstanding.',
          },
          { status: 400 }
        );
      }
      const reverseReadiness = assessReverseDcfDemoReadiness({
        marketPrice: reverseSharePriceAnchor ?? reverseImpliedPrice,
        sharesOutstanding: reverseSharesAnchor,
        revenue: demoRevenue,
      });
      if (!reverseReadiness.ready && reverseReadiness.missing.includes('revenue')) {
        return NextResponse.json(
          {
            ok: false,
            state: 'failed',
            status: 'failed',
            code: 'demo_reverse_dcf_missing_revenue',
            message: 'Reverse DCF requires positive demo revenue.',
            details: {
              missing: reverseReadiness.missing,
            },
          },
          { status: 400 }
        );
      }
    }
    if (modelType === 'debt-capacity-lite') {
      const demoEbitda =
        canonicalValues.ebitda.value ??
        (typeof ltmFinancials?.ebitda === 'number' ? ltmFinancials.ebitda : null);
      if (demoEbitda === null || !Number.isFinite(demoEbitda) || demoEbitda <= 0) {
        return NextResponse.json(
          {
            ok: false,
            state: 'failed',
            status: 'failed',
            code: 'demo_debt_capacity_not_ready',
            message: 'Ticker is not Debt Capacity-ready in demo dataset (EBITDA must be > 0).',
          },
          { status: 400 }
        );
      }
    }
  }
  if (modelType === 'reverse-dcf' && reverseDcfRawInputs) {
    const marketCapAnchor =
      typeof canonicalValues.marketCap.value === 'number' && Number.isFinite(canonicalValues.marketCap.value)
        ? canonicalValues.marketCap.value
        : typeof reverseDcfRawInputs.marketCap === 'number' && Number.isFinite(reverseDcfRawInputs.marketCap)
          ? reverseDcfRawInputs.marketCap
          : null;
    const sharesAnchor =
      typeof reverseDcfRawInputs.sharesOutstanding === 'number' &&
      Number.isFinite(reverseDcfRawInputs.sharesOutstanding) &&
      reverseDcfRawInputs.sharesOutstanding > 0
        ? reverseDcfRawInputs.sharesOutstanding
        : canonicalSharesMillions;
    const impliedPriceFromMarketCap =
      marketCapAnchor !== null &&
      sharesAnchor !== null &&
      Number.isFinite(marketCapAnchor) &&
      Number.isFinite(sharesAnchor) &&
      sharesAnchor > 0
        ? marketCapAnchor / sharesAnchor
        : null;
    const sharePriceAnchor =
      typeof reverseDcfRawInputs.sharePrice === 'number' &&
      Number.isFinite(reverseDcfRawInputs.sharePrice) &&
      reverseDcfRawInputs.sharePrice > 0
        ? reverseDcfRawInputs.sharePrice
        : null;
    const targetPrice =
      typeof reverseDcfRawInputs.targetPrice === 'number' &&
      Number.isFinite(reverseDcfRawInputs.targetPrice) &&
      reverseDcfRawInputs.targetPrice > 0
        ? reverseDcfRawInputs.targetPrice
        : canonicalMarketPrice ?? sharePriceAnchor ?? impliedPriceFromMarketCap;
    if (targetPrice === null || !Number.isFinite(targetPrice) || targetPrice <= 0) {
      return NextResponse.json(
        {
          ok: false,
          state: 'failed',
          status: 'failed',
          code: 'reverse_dcf_missing_anchor',
          message: 'Reverse DCF requires market cap OR share price + shares outstanding.',
        },
        { status: 400 }
      );
    }
    reverseDcfInputs = {
      wacc: reverseDcfRawInputs.waccPct / 100,
      terminalGrowth: reverseDcfRawInputs.terminalGrowthPct / 100,
      projectionYears: Math.round(reverseDcfRawInputs.projectionYears),
      targetPrice,
      marketPrice: canonicalMarketPrice ?? sharePriceAnchor ?? impliedPriceFromMarketCap ?? targetPrice,
    };
  }
  if (canonicalValues.cash.value !== null) {
    sanitizedAssumptions.startingCash = canonicalValues.cash.value;
  }
  if (canonicalValues.totalDebt.value !== null) {
    sanitizedAssumptions.debt = canonicalValues.totalDebt.value;
  }
  if (canonicalValues.netDebt.value !== null) {
    (sanitizedAssumptions as any).netDebt = canonicalValues.netDebt.value;
  }
  if (canonicalValues.revenue.value !== null && Array.isArray(sanitizedAssumptions.revenue) && sanitizedAssumptions.revenue.length > 0) {
    const rescaled = rescaleSeriesToCanonical(
      sanitizedAssumptions.revenue,
      canonicalValues.revenue.value
    );
    sanitizedAssumptions.revenue = rescaled.series as any;
    if (rescaled.applied) {
      console.warn(
        `[generateModel] ⚠️  Rescaled revenue series to match canonical units (ratio=${rescaled.ratio?.toExponential(2)}).`
      );
    }
  }
  if (canonicalValues.ebitda.value !== null && Array.isArray(sanitizedAssumptions.ebitda) && sanitizedAssumptions.ebitda.length > 0) {
    const rescaled = rescaleSeriesToCanonical(
      sanitizedAssumptions.ebitda,
      canonicalValues.ebitda.value
    );
    sanitizedAssumptions.ebitda = rescaled.series as any;
    if (rescaled.applied) {
      console.warn(
        `[generateModel] ⚠️  Rescaled EBITDA series to match canonical units (ratio=${rescaled.ratio?.toExponential(2)}).`
      );
    }
  }
  if (canonicalValues.netIncome.value !== null && Array.isArray(sanitizedAssumptions.netIncome) && sanitizedAssumptions.netIncome.length > 0) {
    const rescaled = rescaleSeriesToCanonical(
      sanitizedAssumptions.netIncome,
      canonicalValues.netIncome.value
    );
    sanitizedAssumptions.netIncome = rescaled.series as any;
    if (rescaled.applied) {
      console.warn(
        `[generateModel] ⚠️  Rescaled net income series to match canonical units (ratio=${rescaled.ratio?.toExponential(2)}).`
      );
    }
  }
  // Canonical values are defined in USD millions; tag assumptions accordingly.
  (sanitizedAssumptions as any).units = 'millions';

  // Allow explicit overrides for model-required inputs (e.g., three-statement).
  const manualInputs = body?.manualInputs ?? {};
  const manualInterestRate =
    typeof manualInputs.interestRate === 'number'
      ? manualInputs.interestRate
      : typeof body?.interestRate === 'number'
      ? body.interestRate
      : undefined;
  if (typeof manualInterestRate === 'number' && isFinite(manualInterestRate)) {
    sanitizedAssumptions.interestRate = manualInterestRate;
  }
  const manualStartingPPE =
    typeof manualInputs.startingPPE === 'number'
      ? manualInputs.startingPPE
      : typeof body?.startingPPE === 'number'
      ? body.startingPPE
      : undefined;
  if (typeof manualStartingPPE === 'number' && isFinite(manualStartingPPE)) {
    const startingPPEMillions = coerceToMillions(manualStartingPPE, {
      unitHint: (sanitizedAssumptions as any)?.units === 'millions' ? 'millions' : 'auto',
      referenceMillions: canonicalValues.revenue.value ?? null,
    });
    if (startingPPEMillions !== null) {
      sanitizedAssumptions.startingPPE = startingPPEMillions;
    }
  }

  if (normalizedFinancials) {
    (normalizedFinancials as any).revenueM = canonicalValues.revenue.value ?? (normalizedFinancials as any).revenueM;
    (normalizedFinancials as any).ebitdaM = canonicalValues.ebitda.value ?? (normalizedFinancials as any).ebitdaM;
    (normalizedFinancials as any).netIncomeM = canonicalValues.netIncome.value ?? (normalizedFinancials as any).netIncomeM;
    (normalizedFinancials as any).netDebtM = canonicalValues.netDebt.value ?? (normalizedFinancials as any).netDebtM;
    (normalizedFinancials as any).sharesOutstandingM =
      canonicalSharesMillions !== null
        ? canonicalSharesMillions
        : (normalizedFinancials as any).sharesOutstandingM;
    (normalizedFinancials as any).marketCap = canonicalValues.marketCap.value ?? (normalizedFinancials as any).marketCap;
    (normalizedFinancials as any).price = canonicalValues.price.value ?? (normalizedFinancials as any).price;
    (normalizedFinancials as any).cashM = canonicalValues.cash.value ?? (normalizedFinancials as any).cashM;
    (normalizedFinancials as any).totalDebtM = canonicalValues.totalDebt.value ?? (normalizedFinancials as any).totalDebtM;
  }

  // Guardrail: refuse to run DCF/three-statement without real fundamentals unless demo mode.
  const requiresRealData =
    !isDemoMode() && (modelType === 'dcf' || modelType === 'reverse-dcf' || modelType === 'three-statement');
  if (requiresRealData) {
    const revenueM = canonicalValues.revenue.value ?? null;
    if (!revenueM || revenueM <= 0) {
      return NextResponse.json(
        {
          ok: false,
          state: 'failed',
          status: 'failed',
          code: 'real_data_unavailable',
          message: `Real financials unavailable for ${cleanTicker}; refusing to run demo inputs (set dataSource="demo" or demo=true/demo_mode=true to allow).`,
          details: { missing: ['revenue'] },
        },
        { status: 424 }
      );
    }

    const marketCapM =
      canonicalValues.marketCap.value ??
      (typeof normalizedFinancials?.marketCap === 'number' ? normalizedFinancials.marketCap / 1_000_000 : null);

    if (marketCapM && revenueM < 1 && marketCapM > 1_000) {
      return NextResponse.json(
        {
          ok: false,
          state: 'failed',
          status: 'failed',
          code: 'unit_mismatch',
          message: `Revenue appears too small for ${cleanTicker} (likely unit mismatch). Refusing to proceed.`,
          details: { revenueM, marketCapM },
        },
        { status: 422 }
      );
    }

    const sharesM =
      canonicalValues.sharesOutstanding.value !== null
        ? canonicalValues.sharesOutstanding.value / 1_000_000
        : (normalizedFinancials as any)?.sharesOutstandingM ?? null;
    const price =
      canonicalValues.price.value ??
      (typeof normalizedFinancials?.price === 'number' ? normalizedFinancials.price : null);

    if (sharesM !== null && sharesM < 1 && price && price > 1) {
      return NextResponse.json(
        {
          ok: false,
          state: 'failed',
          status: 'failed',
          code: 'unit_mismatch',
          message: `Shares outstanding appear too small for ${cleanTicker} (likely unit mismatch). Refusing to proceed.`,
          details: { sharesM, price },
        },
        { status: 422 }
      );
    }
  }
  
  console.log('[generateModel] ✅ Assumptions sanitized and validated');
  logDiagnostic(sanitizeDiag);
  diagnostics.push(sanitizeDiag);

  // STEP 6: Perform sanity checks
  const sanityDiag = performSanityChecks({
    ticker: cleanTicker,
    modelType: modelType as any,
    dataSource: ltmFinancials?.dataSource as any || 'AI-Fallback',
    revenue: sanitizedAssumptions.revenue,
    grossMargin: 1 - (Array.isArray(sanitizedAssumptions.cogsPct) && sanitizedAssumptions.cogsPct.length > 0 ? sanitizedAssumptions.cogsPct[0] : (sanitizedAssumptions.cogsPct as any) ?? 0.6),
    ebitMargin: 1 - (Array.isArray(sanitizedAssumptions.cogsPct) && sanitizedAssumptions.cogsPct.length > 0 ? sanitizedAssumptions.cogsPct[0] : (sanitizedAssumptions.cogsPct as any) ?? 0.6) - (Array.isArray(sanitizedAssumptions.opexPct) && sanitizedAssumptions.opexPct.length > 0 ? sanitizedAssumptions.opexPct[0] : (sanitizedAssumptions.opexPct as any) ?? 0.2) - (Array.isArray(sanitizedAssumptions.daPct) && sanitizedAssumptions.daPct.length > 0 ? sanitizedAssumptions.daPct[0] : (sanitizedAssumptions.daPct as any) ?? 0.05),
    taxRate: sanitizedAssumptions.taxRate,
    capexPctRevenue: Array.isArray(sanitizedAssumptions.capexPctRevenue) && sanitizedAssumptions.capexPctRevenue.length > 0 ? sanitizedAssumptions.capexPctRevenue[0] : (sanitizedAssumptions.capexPctRevenue as any) ?? 0.04,
  });
  diagnostics.push(sanityDiag);

  // STEP 6.5: Auto-estimate required inputs and check computability
  currentStage = 'computability-check';
  let estimatedInputs: Array<{ key: string; value: number; source: string; confidence: 'low' | 'medium' | 'high' }> = [];
  let modelState: ModelStateInfo | null = null;

  try {
    // For DCF models, auto-estimate WACC components if missing
    if (modelType === 'dcf' || modelType === 'reverse-dcf') {
      const sector = ltmFinancials?.sector || peerComps?.sector || 'Technology';
      const estimates = await estimateDCFInputs(
        cleanTicker,
        sector,
        {
          interestExpense: ltmFinancials?.interestExpense,
          avgDebt: ltmFinancials?.totalDebt,
          taxExpense: ltmFinancials?.taxExpense,
          preTaxIncome: ltmFinancials?.preTaxIncome,
        }
      );

      // Apply estimates to body if inputs are missing
      const { updated, applied } = applyAutoEstimates(body, estimates);
      body = updated;
      estimatedInputs = applied;

      if (applied.length > 0) {
        console.log(`[generateModel] ✅ Auto-estimated ${applied.length} inputs:`, applied.map(e => `${e.key}=${e.value} (${e.source})`).join(', '));
      }
    }

    // Check computability
    // Map camelCase scenario inputs to snake_case for computability check
    // terminalGrowth is calculated earlier in the function and is already a decimal (0.025 = 2.5%)
    // Check body first, then the calculated terminalGrowth variable (if in scope), then sliderOverrides
    const terminalGrowthValue =
      body.terminal_growth ||
      body.terminalGrowth ||
      (typeof terminalGrowth !== 'undefined' ? terminalGrowth : undefined) ||
      requestSliderOverrides?.terminalGrowth;
    const waccValue =
      body.wacc ||
      (typeof wacc !== 'undefined' ? wacc : undefined) ||
      requestSliderOverrides?.wacc;
    
    const resolvedFundamentals =
      modelType === 'three-statement'
        ? await resolveFundamentals({
            ticker: cleanTicker,
            body,
            sanitizedAssumptions,
            ltmFinancials,
            normalizedFinancials,
            canonicalFinancials,
          })
        : null;

    if (modelType === 'three-statement' && resolvedFundamentals && isDemoMode()) {
      if (resolvedFundamentals.missing.includes('revenue')) {
        return NextResponse.json(
          {
            ok: false,
            state: 'failed',
            status: 'failed',
            code: 'demo_missing_revenue',
            message: 'Demo row is missing revenue. Refresh demo snapshots.',
            missing: resolvedFundamentals.missing,
          },
          { status: 400 }
        );
      }
    }

    if (modelType === 'three-statement' && resolvedFundamentals) {
      if (resolvedFundamentals.revenue !== null && (!Array.isArray(sanitizedAssumptions.revenue) || sanitizedAssumptions.revenue.length === 0)) {
        sanitizedAssumptions.revenue = [resolvedFundamentals.revenue];
      }
      if (resolvedFundamentals.ebitda !== null && (!Array.isArray(sanitizedAssumptions.ebitda) || sanitizedAssumptions.ebitda.length === 0)) {
        sanitizedAssumptions.ebitda = [resolvedFundamentals.ebitda];
      }
      if (resolvedFundamentals.netIncome !== null && (!Array.isArray(sanitizedAssumptions.netIncome) || sanitizedAssumptions.netIncome.length === 0)) {
        sanitizedAssumptions.netIncome = [resolvedFundamentals.netIncome];
      }
      if (resolvedFundamentals.cash !== null && (sanitizedAssumptions.startingCash === undefined || sanitizedAssumptions.startingCash === null)) {
        sanitizedAssumptions.startingCash = resolvedFundamentals.cash;
      }
      if (resolvedFundamentals.totalDebt !== null && (sanitizedAssumptions.debt === undefined || sanitizedAssumptions.debt === null)) {
        sanitizedAssumptions.debt = resolvedFundamentals.totalDebt;
      }
    }

    // Build base inputs for computability check
    const baseInputs: Record<string, any> = {
      ...body,
      ...sanitizedAssumptions,
      revenue:
        sanitizedAssumptions?.revenue?.[0] ||
        canonicalValues.revenue.value ||
        resolvedFundamentals?.revenue ||
        ltmFinancials?.revenue ||
        (normalizedFinancials as any)?.revenue ||
        (normalizedFinancials as any)?.revenueM,
      ebitda:
        sanitizedAssumptions?.ebitda?.[0] ||
        canonicalValues.ebitda.value ||
        resolvedFundamentals?.ebitda ||
        ltmFinancials?.ebitda ||
        (normalizedFinancials as any)?.ebitda ||
        (normalizedFinancials as any)?.ebitdaM,
      ebit: sanitizedAssumptions?.ebit?.[0] || ltmFinancials?.ebit,
      netIncome:
        sanitizedAssumptions?.netIncome?.[0] ||
        canonicalValues.netIncome.value ||
        resolvedFundamentals?.netIncome ||
        ltmFinancials?.netIncome ||
        (normalizedFinancials as any)?.netIncome ||
        (normalizedFinancials as any)?.netIncomeM,
      rf_rate: body.rf_rate || body.wacc_inputs?.rf_rate,
      equity_risk_premium: body.erp || body.wacc_inputs?.erp,
      beta: body.beta || body.wacc_inputs?.beta,
      cost_of_debt: body.cost_of_debt || body.wacc_inputs?.cost_of_debt,
      tax_rate_assumption: body.tax_rate || body.taxRate || body.wacc_inputs?.tax_rate,
      // Map camelCase scenario inputs to snake_case
      terminal_growth: terminalGrowthValue,
      wacc: waccValue,
    };
    
    // Add comps-specific input mapping (snake_case keys required by computability check)
    if (modelType === 'comps') {
      // Map camelCase to snake_case for comps requirements
      baseInputs.net_income = baseInputs.netIncome || baseInputs.net_income;
      
      // Extract price and market_cap from various sources
      baseInputs.price = body.price || ltmFinancials?.price || ltmFinancials?.currentPrice || normalizedFinancials?.price;
      baseInputs.market_cap = body.market_cap || body.marketCap || ltmFinancials?.marketCap || normalizedFinancials?.marketCap;
      
      // Log inputs for debugging
      console.log(`[generateModel] Comps computability inputs:`, {
        price: baseInputs.price,
        market_cap: baseInputs.market_cap,
        revenue: baseInputs.revenue,
        ebitda: baseInputs.ebitda,
        net_income: baseInputs.net_income,
        hasPrice: !!baseInputs.price,
        hasMarketCap: !!baseInputs.market_cap,
        hasPriceOrMarketCap: !!(baseInputs.price || baseInputs.market_cap),
      });
    }

    // Map common camelCase aliases to the canonical snake_case keys used by the computability gate.
    // This prevents "still missing" loops when the UI sends camelCase fields (e.g. netIncome/totalDebt).
    baseInputs.market_cap = baseInputs.market_cap ?? baseInputs.marketCap;
    baseInputs.shares_out_basic =
      baseInputs.shares_out_basic ??
      baseInputs.sharesOutstanding ??
      baseInputs.sharesOutBasic;
    baseInputs.total_debt = baseInputs.total_debt ?? baseInputs.totalDebt;
    baseInputs.net_debt = baseInputs.net_debt ?? baseInputs.netDebt;
    baseInputs.net_income = baseInputs.net_income ?? baseInputs.netIncome;
    baseInputs.interest_expense = baseInputs.interest_expense ?? baseInputs.interestExpense;
    baseInputs.tax_expense = baseInputs.tax_expense ?? baseInputs.taxExpense;

    if (modelType === 'three-statement' && resolvedFundamentals) {
      baseInputs.revenue = baseInputs.revenue ?? resolvedFundamentals.revenue;
      baseInputs.ebitda = baseInputs.ebitda ?? resolvedFundamentals.ebitda;
      baseInputs.net_income = baseInputs.net_income ?? resolvedFundamentals.netIncome;
      baseInputs.cash = baseInputs.cash ?? resolvedFundamentals.cash ?? ltmFinancials?.cash ?? normalizedFinancials?.cash;
      baseInputs.total_debt = baseInputs.total_debt ?? resolvedFundamentals.totalDebt ?? ltmFinancials?.totalDebt ?? normalizedFinancials?.totalDebt;
    }

    if (modelType === 'lbo') {
      const lboOverrides = body?.lboOverrides || {};
      const deal = body?.lboDealAssumptions || {};
      const entryMultiple =
        lboOverrides.entryMultiple ??
        deal?.entry?.entryMultiple ??
        body.entry_multiple;
      const exitMultiple =
        lboOverrides.exitMultiple ??
        deal?.exit?.exitMultiple ??
        body.exit_multiple;
      const transactionFeesPercent =
        lboOverrides.transactionFeesPercent ??
        deal?.entry?.transactionFeesPercent ??
        body.transaction_fees_percent;
      const exitFeesPercent =
        lboOverrides.exitFeesPercent ??
        deal?.exit?.exitFeesPercent ??
        body.exit_fees_percent;
      const debtPercent =
        lboOverrides.debtPercent ??
        deal?.financing?.debtPercent ??
        body.debt_percent;
      const equityPercent =
        lboOverrides.equityPercent ??
        deal?.financing?.equityPercent ??
        body.equity_percent;
      const interestRate =
        lboOverrides.interestRate ??
        deal?.financing?.interestRate ??
        body.interest_rate ??
        body.debt_rate;
      const amortizationPercent =
        lboOverrides.amortizationPercent ??
        deal?.financing?.amortizationPercent ??
        body.amortization_percent;
      const cashSweepPercent =
        lboOverrides.cashSweepPercent ??
        deal?.financing?.cashSweepPercent ??
        body.cash_sweep_percent;
      const holdingPeriod =
        lboOverrides.holdingPeriodYears ??
        deal?.exit?.holdingPeriodYears ??
        body.holding_period_years;
      const revenueGrowth =
        lboOverrides.revenueGrowth ??
        deal?.operations?.revenueGrowth ??
        body.revenue_growth;
      const ebitdaMargin =
        lboOverrides.ebitdaMargin ??
        deal?.operations?.ebitdaMargin ??
        body.ebitda_margin;
      const capexPctRevenue =
        lboOverrides.capexPercent ??
        deal?.operations?.capexPctRevenue ??
        body.capex_pct_revenue;
      const deltaNwcPctRevenue =
        lboOverrides.nwcPercent ??
        deal?.operations?.deltaNwcPctRevenue ??
        body.delta_nwc_pct_revenue;
      const taxRate =
        lboOverrides.taxRate ??
        deal?.operations?.taxRate ??
        body.tax_rate;

      if (entryMultiple !== undefined) baseInputs.entry_multiple = entryMultiple;
      if (exitMultiple !== undefined) baseInputs.exit_multiple = exitMultiple;
      if (transactionFeesPercent !== undefined) baseInputs.transaction_fees_percent = transactionFeesPercent;
      if (exitFeesPercent !== undefined) baseInputs.exit_fees_percent = exitFeesPercent;
      if (debtPercent !== undefined) baseInputs.debt_percent = debtPercent;
      if (equityPercent !== undefined) baseInputs.equity_percent = equityPercent;
      if (interestRate !== undefined) baseInputs.interest_rate = interestRate;
      if (amortizationPercent !== undefined) baseInputs.amortization_percent = amortizationPercent;
      if (cashSweepPercent !== undefined) baseInputs.cash_sweep_percent = cashSweepPercent;
      if (holdingPeriod !== undefined) baseInputs.holding_period_years = holdingPeriod;
      if (revenueGrowth !== undefined) baseInputs.revenue_growth = revenueGrowth;
      if (ebitdaMargin !== undefined) baseInputs.ebitda_margin = ebitdaMargin;
      if (capexPctRevenue !== undefined) baseInputs.capex_pct_revenue = capexPctRevenue;
      if (deltaNwcPctRevenue !== undefined) baseInputs.delta_nwc_pct_revenue = deltaNwcPctRevenue;
      if (taxRate !== undefined) baseInputs.tax_rate = taxRate;

      if (
        (baseInputs.ebitda === undefined || baseInputs.ebitda === null) &&
        typeof baseInputs.revenue === 'number' &&
        Number.isFinite(baseInputs.revenue) &&
        typeof baseInputs.ebitda_margin === 'number' &&
        Number.isFinite(baseInputs.ebitda_margin)
      ) {
        baseInputs.ebitda = baseInputs.revenue * baseInputs.ebitda_margin;
      }

      if (
        baseInputs.enterprise_value === undefined &&
        typeof entryMultiple === 'number' &&
        typeof baseInputs.ebitda === 'number'
      ) {
        baseInputs.enterprise_value = entryMultiple * baseInputs.ebitda;
      }
    }
    
    if (modelType === 'reverse-dcf' && reverseDcfRawInputs) {
      if (!baseInputs.terminal_growth && reverseDcfRawInputs.terminalGrowthPct) {
        baseInputs.terminal_growth = reverseDcfRawInputs.terminalGrowthPct / 100;
      }
      if (!baseInputs.wacc && reverseDcfRawInputs.waccPct) {
        baseInputs.wacc = reverseDcfRawInputs.waccPct / 100;
      }
    }

    const computabilityModelType =
      modelType === 'reverse-dcf' ? 'dcf' : modelType;
    const computabilityCheck =
      modelType === 'scorecard' || modelType === 'debt-capacity-lite' || modelType === 'reverse-dcf'
        ? {
            isComputable: true,
            state: 'computable' as const,
            missing: [] as string[],
            estimated: estimatedInputs,
            message: undefined,
          }
        : await checkModelComputability(
            computabilityModelType as 'comps' | 'dcf' | 'three-statement' | 'lbo' | 'merger',
            baseInputs,
            estimatedInputs
          );

    // Enhanced logging for comps model
    if (modelType === 'comps') {
      console.log(`[generateModel] Comps computability check:`, {
        isComputable: computabilityCheck.isComputable,
        state: computabilityCheck.state,
        missing: computabilityCheck.missing,
        message: computabilityCheck.message,
        inputsProvided: {
          price: !!baseInputs.price,
          market_cap: !!baseInputs.market_cap,
          revenue: !!baseInputs.revenue,
          ebitda: !!baseInputs.ebitda,
          net_income: !!baseInputs.net_income,
        },
      });
    }

    modelState = {
      state: computabilityCheck.state,
      missing: computabilityCheck.missing,
      estimated: estimatedInputs,
      canGenerate: computabilityCheck.isComputable,
      message: computabilityCheck.message,
    };

    // If not computable, return early with assumptions_required state
    if (!computabilityCheck.isComputable) {
      console.log(`[generateModel] ⚠️  Model not computable: ${computabilityCheck.message}`);
      console.log(`[generateModel] Missing: ${computabilityCheck.missing.join(', ')}`);
      
      // Additional logging for comps
      if (modelType === 'comps') {
        console.log(`[generateModel] Comps missing inputs breakdown:`, {
          missingKeys: computabilityCheck.missing,
          hasPrice: !!baseInputs.price,
          hasMarketCap: !!baseInputs.market_cap,
          hasRevenue: !!baseInputs.revenue,
          hasEbitda: !!baseInputs.ebitda,
          hasNetIncome: !!baseInputs.net_income,
          ltmFinancialsKeys: ltmFinancials ? Object.keys(ltmFinancials) : 'none',
        });
      }
      
      // Check if client wants JSON response
      const wantsJson = req.headers.get('accept')?.includes('application/json') || 
                        req.nextUrl.searchParams.get('format') === 'json';
      
      if (wantsJson) {
        return NextResponse.json(
          {
            state: 'assumptions_required',
            missing: computabilityCheck.missing,
            requiredInputs: buildRequiredInputs(
              computabilityCheck.missing,
              'Required to compute the model.'
            ),
            estimated: estimatedInputs,
            message: computabilityCheck.message,
            canGenerate: false,
          },
          { status: 200 } // 200 OK - this is a valid state, not an error
        );
      }

      // For non-JSON requests, still return 200 but with error message
      // (UI should handle this and show assumptions editor)
      return NextResponse.json(
        {
          error: 'ASSUMPTIONS_REQUIRED',
          state: 'assumptions_required',
          missing: computabilityCheck.missing,
          requiredInputs: buildRequiredInputs(
            computabilityCheck.missing,
            'Required to compute the model.'
          ),
          estimated: estimatedInputs,
          message: computabilityCheck.message,
        },
        { status: 200 }
      );
    }

    console.log('[generateModel] ✅ Model is computable, proceeding with Excel generation');
  } catch (err: any) {
    console.error('[generateModel] ❌ Computability check failed:', err);
    // Continue - let Excel generation attempt (may fail gracefully)
  }

  // STEP 7: Generate Excel model
  currentStage = 'excel-generation';
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;
  workbook.calcProperties.fullCalcOnLoad = true;

  let dcfSummary: any = undefined;
  let dcfWorkbook: ExcelJS.Workbook | undefined;
  let threeStatementSummary: import('@/lib/models/threeStatement/excel').ThreeStatementOutput | null = null;
  let lboSummary: LboEngineOutput | undefined;
  let debtCapacitySummary: DebtCapacityLiteSummary | undefined;
  let compsSummary: CompsResult | null = null;
  let scorecardSummary: import('@/lib/models/scorecard/buildScorecardSummary').ScorecardSummary | null = null;
  let modelDocument: ModelDocument | null = null;
  
  try {
    // Hard gate: Assert model is computable before Excel generation
    if (modelState && !modelState.canGenerate) {
      throw new Error(`MODEL_NOT_COMPUTABLE_YET: ${modelState.message || 'Missing required inputs'}`);
    }

    console.log('[generateModel] Building Excel workbook...');
    
    switch (modelType) {
      case 'three-statement':
        // Final defensive check before calling buildThreeStatementModelWithAssumptions
        console.log('[generateModel] 🔍 Pre-call check for three-statement:', {
          ticker: cleanTicker,
          hasAssumptions: !!sanitizedAssumptions,
          assumptionsKeys: sanitizedAssumptions ? Object.keys(sanitizedAssumptions) : [],
          yearsType: typeof sanitizedAssumptions?.years,
          yearsIsArray: Array.isArray(sanitizedAssumptions?.years),
          yearsLength: sanitizedAssumptions?.years?.length,
          yearsValue: sanitizedAssumptions?.years,
        });
        if (!sanitizedAssumptions.years || !Array.isArray(sanitizedAssumptions.years) || sanitizedAssumptions.years.length === 0) {
          const currentYear = new Date().getFullYear();
          sanitizedAssumptions.years = Array.from({ length: 5 }, (_, i) => currentYear + i);
          console.log(`[generateModel] ⚠️  CRITICAL: Years array was still missing/empty right before buildThreeStatementModelWithAssumptions call! Using defaults: ${sanitizedAssumptions.years.join(', ')}`);
        }

        const threeStatementSliderOverrides =
          body?.sliderOverrides && typeof body.sliderOverrides === 'object' ? body.sliderOverrides : {};
        const numYears = sanitizedAssumptions.years.length || 5;
        const fillArray = (value: number | undefined, fallback: number) =>
          Array(numYears).fill(typeof value === 'number' && isFinite(value) ? value : fallback);

        if (typeof threeStatementSliderOverrides.revenueGrowth === 'number') {
          sanitizedAssumptions.revenueGrowth = fillArray(threeStatementSliderOverrides.revenueGrowth, 0.05);
        }
        if (typeof threeStatementSliderOverrides.ebitdaMargin === 'number') {
          sanitizedAssumptions.ebitdaMargin = fillArray(threeStatementSliderOverrides.ebitdaMargin, 0.2);
        }
        if (typeof threeStatementSliderOverrides.daPctRevenue === 'number') {
          sanitizedAssumptions.daPct = fillArray(threeStatementSliderOverrides.daPctRevenue, 0.05);
        }
        if (typeof threeStatementSliderOverrides.capexPctRevenue === 'number') {
          sanitizedAssumptions.capexPctRevenue = fillArray(threeStatementSliderOverrides.capexPctRevenue, 0.04);
        }
        if (typeof threeStatementSliderOverrides.deltaNwcPctRevenue === 'number') {
          sanitizedAssumptions.nwcPctRevenue = fillArray(threeStatementSliderOverrides.deltaNwcPctRevenue, 0.01);
        }
        if (typeof threeStatementSliderOverrides.taxRate === 'number') {
          sanitizedAssumptions.taxRate = threeStatementSliderOverrides.taxRate;
        }
        // Ensure all required arrays exist before calling the function
        // BUT: Only use defaults if we truly don't have data - check if we have LTM financials first
        if (!Array.isArray(sanitizedAssumptions.revenue) || sanitizedAssumptions.revenue.length === 0) {
          // Try to recover from LTM financials if available
          if (ltmFinancials?.revenue && ltmFinancials.revenue > 0) {
            const numYears = sanitizedAssumptions.years?.length || 5;
            sanitizedAssumptions.revenue = Array(numYears).fill(ltmFinancials.revenue);
            console.log(`[generateModel] ⚠️  Revenue array was missing, recovered from LTM financials: ${ltmFinancials.revenue} (${ltmFinancials.dataSource})`);
          } else {
            sanitizedAssumptions.revenue = [1000];
            console.log(`[generateModel] ⚠️  CRITICAL: Revenue array was missing/empty AND no LTM data available! Using default: [1000]`);
          }
        } else {
          // Log what revenue we're using
          const revenueSum = sanitizedAssumptions.revenue.reduce((sum: number, val: number) => sum + (val || 0), 0);
          console.log(`[generateModel] ✅ Using revenue array with ${sanitizedAssumptions.revenue.length} years, total: ${revenueSum.toFixed(0)}`);
        }
        if (
          typeof threeStatementSliderOverrides.revenueGrowth === 'number' &&
          Array.isArray(sanitizedAssumptions.revenue) &&
          sanitizedAssumptions.revenue.length > 1
        ) {
          sanitizedAssumptions.revenue = [sanitizedAssumptions.revenue[0]];
          console.log('[generateModel] ✅ Collapsed revenue array to single base year for growth projection.');
        }
        if (!Array.isArray(sanitizedAssumptions.cogsPct) || sanitizedAssumptions.cogsPct.length === 0) {
          sanitizedAssumptions.cogsPct = Array(5).fill(0.6);
          console.log(`[generateModel] ⚠️  CRITICAL: COGS array was missing/empty! Using defaults`);
        }
        if (
          (!Array.isArray(sanitizedAssumptions.opexPct) || sanitizedAssumptions.opexPct.length === 0) &&
          (!Array.isArray(sanitizedAssumptions.ebitdaMargin) || sanitizedAssumptions.ebitdaMargin.length === 0)
        ) {
          sanitizedAssumptions.opexPct = Array(5).fill(0.2);
          console.log(`[generateModel] ⚠️  CRITICAL: OPEX array was missing/empty! Using defaults`);
        }
        if (!Array.isArray(sanitizedAssumptions.daPct) || sanitizedAssumptions.daPct.length === 0) {
          sanitizedAssumptions.daPct = Array(5).fill(0.05);
          console.log(`[generateModel] ⚠️  CRITICAL: D&A array was missing/empty! Using defaults`);
        }
        if (!Array.isArray(sanitizedAssumptions.capexPctRevenue) || sanitizedAssumptions.capexPctRevenue.length === 0) {
          sanitizedAssumptions.capexPctRevenue = Array(5).fill(0.04);
          console.log(`[generateModel] ⚠️  CRITICAL: Capex array was missing/empty! Using defaults`);
        }
        if (!Array.isArray(sanitizedAssumptions.nwcPctRevenue) || sanitizedAssumptions.nwcPctRevenue.length === 0) {
          const fallback = typeof (sanitizedAssumptions as any).nwcPctRevenue === 'number'
            ? (sanitizedAssumptions as any).nwcPctRevenue
            : 0.01;
          sanitizedAssumptions.nwcPctRevenue = Array(numYears).fill(fallback);
          console.log(`[generateModel] ⚠️  CRITICAL: NWC % Revenue array was missing/empty! Using defaults`);
        }
        
        // Extract debt and interest rate from financial data (three-statement uses USD millions)
        const nf = normalizedFinancials as { totalDebtM?: number; totalDebt?: number; scale?: string } | undefined;
        const totalDebtM =
          nf?.totalDebtM ??
          (typeof ltmFinancials?.totalDebt === 'number' && Number.isFinite(ltmFinancials.totalDebt)
            ? ltmFinancials.totalDebt / 1_000_000
            : undefined) ??
          (typeof nf?.totalDebt === 'number' && Number.isFinite(nf.totalDebt)
            ? (nf.scale === 'millions' ? nf.totalDebt : nf.totalDebt / 1_000_000)
            : undefined);
        const interestExpenseM =
          typeof ltmFinancials?.interestExpense === 'number' && Number.isFinite(ltmFinancials.interestExpense)
            ? (ltmFinancials.interestExpense >= 1_000 ? ltmFinancials.interestExpense / 1_000_000 : ltmFinancials.interestExpense)
            : 0;

        let interestRate: number | undefined;
        if ((totalDebtM ?? 0) > 0 && interestExpenseM > 0) {
          interestRate = interestExpenseM / (totalDebtM as number);
          console.log(`[generateModel] ✅ Derived interest rate from historical: ${(interestRate * 100).toFixed(2)}% (Interest: $${interestExpenseM.toFixed(2)}M, Debt: $${(totalDebtM as number).toFixed(2)}M)`);
        } else if ((totalDebtM ?? 0) > 0) {
          interestRate = 0.055;
          console.log(`[generateModel] ⚠️  No historical interest expense, using default rate: ${(interestRate * 100).toFixed(2)}%`);
        }

        if (totalDebtM != null && totalDebtM > 0) {
          sanitizedAssumptions.debt = totalDebtM;
          console.log(`[generateModel] ✅ Set debt from financial data (USD millions): $${totalDebtM.toFixed(2)}M`);
        }
        if (interestRate !== undefined) {
          sanitizedAssumptions.interestRate = interestRate;
          console.log(`[generateModel] ✅ Set interest rate: ${(interestRate * 100).toFixed(2)}%`);
        }
        
        const threeResult = await buildThreeStatementModelWithAssumptions(workbook, cleanTicker, sanitizedAssumptions);
        threeStatementSummary = threeResult.threeStatementSummary;
        break;
      case 'dcf':
        // Defensive: ensure revenue series exists and is numeric before DCF build (prevents false "revenue missing" validation).
        if (!Array.isArray(sanitizedAssumptions.revenue) || sanitizedAssumptions.revenue.length === 0) {
          if (ltmFinancials?.revenue && ltmFinancials.revenue > 0) {
            sanitizedAssumptions.revenue = Array(5).fill(ltmFinancials.revenue);
            console.log(
              `[generateModel] ⚠️  DCF revenue array missing; recovered from LTM financials: ${ltmFinancials.revenue} (${ltmFinancials.dataSource})`
            );
          } else if (normalizedFinancials?.revenue && normalizedFinancials.revenue > 0) {
            const fallbackRevenueM =
              (normalizedFinancials as any)?.revenueM ??
              coerceToMillions(normalizedFinancials.revenue, { unitHint: 'auto' }) ??
              normalizedFinancials.revenue;
            sanitizedAssumptions.revenue = Array(5).fill(fallbackRevenueM);
            console.log(
              `[generateModel] ⚠️  DCF revenue array missing; recovered from normalized financials: ${fallbackRevenueM}M`
            );
          } else {
            // Internal unit contract is USD millions; use $1B = 1,000 ($M) as the last-resort fallback.
            sanitizedAssumptions.revenue = [1_000];
            console.log('[generateModel] ⚠️  DCF revenue array missing and no LTM/normalized revenue available; using fallback.');
          }
        } else {
          // Coerce any string values to numbers to avoid validator treating them as missing.
          sanitizedAssumptions.revenue = sanitizedAssumptions.revenue.map((v: any) => {
            if (typeof v === 'number' && Number.isFinite(v)) return v;
            if (typeof v === 'string') {
              const parsed = Number(v.replace(/,/g, '').trim());
              return Number.isFinite(parsed) ? parsed : v;
            }
            return v;
          });
        }

        const dcfResult = await buildDcfModelWithAssumptions(
          workbook,
          cleanTicker,
          sanitizedAssumptions,
          body,
          normalizedFinancials,
          appliedDefaults
        );
        dcfSummary = dcfResult.dcfSummary;
        dcfWorkbook = dcfResult.dcfWorkbook;
        break;
      case 'reverse-dcf':
        if (!reverseDcfInputs) {
          return NextResponse.json(
            {
              ok: false,
              state: 'failed',
              status: 'failed',
              code: 'reverse_dcf_invalid',
              message: 'Reverse DCF inputs are missing.',
            },
            { status: 400 }
          );
        }
        // Defensive: ensure revenue series exists and is numeric before reverse DCF solve.
        if (!Array.isArray(sanitizedAssumptions.revenue) || sanitizedAssumptions.revenue.length === 0) {
          if (ltmFinancials?.revenue && ltmFinancials.revenue > 0) {
            sanitizedAssumptions.revenue = Array(5).fill(ltmFinancials.revenue);
          } else if (normalizedFinancials?.revenue && normalizedFinancials.revenue > 0) {
            const fallbackRevenueM =
              (normalizedFinancials as any)?.revenueM ??
              coerceToMillions(normalizedFinancials.revenue, { unitHint: 'auto' }) ??
              normalizedFinancials.revenue;
            sanitizedAssumptions.revenue = Array(5).fill(fallbackRevenueM);
          } else {
            sanitizedAssumptions.revenue = [1_000];
          }
        } else {
          sanitizedAssumptions.revenue = sanitizedAssumptions.revenue.map((v: any) => {
            if (typeof v === 'number' && Number.isFinite(v)) return v;
            if (typeof v === 'string') {
              const parsed = Number(v.replace(/,/g, '').trim());
              return Number.isFinite(parsed) ? parsed : v;
            }
            return v;
          });
        }
        try {
          const reverseResult = await buildReverseDcfModelWithAssumptions(
            workbook,
            cleanTicker,
            sanitizedAssumptions,
            reverseDcfInputs,
            normalizedFinancials
          );
          dcfSummary = reverseResult.dcfSummary;
          dcfWorkbook = reverseResult.dcfWorkbook;
        } catch (reverseErr: any) {
          return NextResponse.json(
            {
              ok: false,
              state: 'failed',
              status: 'failed',
              code: 'reverse_dcf_no_convergence',
              message: reverseErr?.message || 'Reverse DCF solver could not converge.',
            },
            { status: 422 }
          );
        }
        break;
      case 'lbo':
        try {
          lboSummary = await buildLboModelWithAssumptions(
            workbook,
            cleanTicker,
            sanitizedAssumptions,
            normalizedFinancials,
            body,
            { workbookNotes: quickLboPayload?.workbookNotes }
          );
          if (body?.quickLbo === true && lboSummary) {
            lboSummary.warnings = Array.isArray(lboSummary.warnings) ? lboSummary.warnings : [];
            lboSummary.warnings.unshift('Quick LBO (Demo assumptions) mode applied.');
            (lboSummary as any).quickLbo = {
              enabled: true,
              defaultsApplied: quickLboPayload?.appliedDefaults ?? [],
            };
          }
          console.log('[LBO_DEBUG] REAL workbook sheets:', workbook.worksheets.map((sheet) => sheet.name));
        } catch (lboError) {
          console.error('[LBO_ERROR] Failed to build real LBO workbook:', lboError);
          const fallbackWorkbook = new ExcelJS.Workbook();
          const fallbackSheet = fallbackWorkbook.addWorksheet('LBO Fallback – Error');
          fallbackSheet.getCell('A1').value = 'LBO workbook fallback (error occurred)';
          fallbackSheet.getCell('A3').value = 'Ticker';
          fallbackSheet.getCell('B3').value = cleanTicker;
          fallbackSheet.getCell('A5').value = 'Check server logs for [LBO_ERROR] to investigate the failure.';

          const fallbackBufferRaw = await fallbackWorkbook.xlsx.writeBuffer();
          const fallbackBuffer = Buffer.isBuffer(fallbackBufferRaw)
            ? fallbackBufferRaw
            : Buffer.from(fallbackBufferRaw);

          const fallbackFilename = `${cleanTicker}_${modelType}_fallback.xlsx`;
          return new NextResponse(fallbackBuffer, {
            status: 200,
            headers: {
              'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'Content-Disposition': `attachment; filename="${fallbackFilename}"`,
              'Cache-Control': 'no-store',
            },
          });
        }
        break;
      case 'debt-capacity-lite': {
        if (!debtCapacityLiteInputs) {
          return NextResponse.json(
            {
              ok: false,
              state: 'failed',
              status: 'failed',
              code: 'debt_capacity_invalid',
              message: 'Debt Capacity Lite inputs are missing.',
            },
            { status: 400 }
          );
        }

        const ebitda =
          canonicalValues.ebitda.value ??
          (typeof ltmFinancials?.ebitda === 'number' ? ltmFinancials.ebitda : null);
        if (ebitda === null || !Number.isFinite(ebitda) || ebitda <= 0) {
          return NextResponse.json(
            {
              ok: false,
              state: 'failed',
              status: 'failed',
              code: 'demo_debt_capacity_not_ready',
              message: 'Ticker is not Debt Capacity-ready in demo dataset (EBITDA must be > 0).',
            },
            { status: 400 }
          );
        }
        const currentNetDebt =
          canonicalValues.netDebt.value ??
          (typeof ltmFinancials?.totalDebt === 'number' && typeof ltmFinancials?.cash === 'number'
            ? ltmFinancials.totalDebt - ltmFinancials.cash
            : null);

        debtCapacitySummary = buildDebtCapacityLiteSummary({
          ebitda,
          currentNetDebt,
          inputs: debtCapacityLiteInputs,
        });
        break;
      }
      case 'comps':
        compsSummary = await buildCompsModelWithAssumptions(
          workbook,
          cleanTicker,
          sanitizedAssumptions,
          normalizedFinancials,
          diagnostics,
          {
            privateManualMode,
            modelInputs: normalizedModelInputs,
          }
        );
        break;
      case 'scorecard': {
        const { buildScorecardSummary } = await import('@/lib/models/scorecard/buildScorecardSummary');
        scorecardSummary = await buildScorecardSummary(cleanTicker, {
          privateManualMode,
          modelInputs: normalizedModelInputs,
        });
        break;
      }
      case 'merger':
        throw new Error('Merger models should use /api/models/merger endpoint');
      case 'operating':
        throw new Error('Operating models should use /api/models/operating endpoint');
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
    if (err?.code) {
      throw err;
    }
    throw new Error(err?.message || 'Model generation failed');
  }

  // STEP 8: Evaluate guardrails (if settings available)
  let guardrailResult: { warnings: string[]; blocks: string[] } = { warnings: [], blocks: [] };
  if (settings) {
    try {
      // Build output object for guardrail evaluation
      // Extract values from DCF summary or LBO summary
      const outputs: any = {};
      
      if ((modelType === 'dcf' || modelType === 'reverse-dcf') && dcfSummary) {
        // Extract from dcfSummary if available
        outputs.wacc = dcfSummary.wacc || dcfSummary.valuationResults?.wacc;
        outputs.terminalGrowth = dcfSummary.terminalGrowth || dcfSummary.valuationResults?.terminalGrowth;
      } else if (modelType === 'lbo' && lboSummary) {
        outputs.irr = lboSummary.irr;
        outputs.leverageMultiple = lboSummary.leverageMultiple;
        outputs.sourcesUses = lboSummary.sourcesUses;
      }
      
      const evalResult = evaluateGuardrails(
        modelType === 'dcf' || modelType === 'reverse-dcf'
          ? 'dcf'
          : modelType === 'lbo'
            ? 'lbo'
            : 'three-statement',
        outputs,
        settings
      );
      guardrailResult = evalResult || { warnings: [], blocks: [] };
      
      // Ensure arrays exist
      if (!Array.isArray(guardrailResult.blocks)) {
        guardrailResult.blocks = [];
      }
      if (!Array.isArray(guardrailResult.warnings)) {
        guardrailResult.warnings = [];
      }
      
      if (guardrailResult.blocks.length > 0) {
        console.warn('[generateModel] ⚠️  Guardrails blocked generation:', guardrailResult.blocks);
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

  if (dcfSummary) {
    dcfSummary.baseMetrics = {
      ebitda: canonicalValues.ebitda.value ?? null,
      netDebt: canonicalValues.netDebt.value ?? null,
      sharesOutstanding: canonicalValues.sharesOutstanding.value ?? null,
    };
  }

  const consistencyResult = checkModelConsistency(
    canonicalFinancials,
    [
      {
        model: 'dcf',
        ebitda: canonicalValues.ebitda.value ?? null,
        netDebt: dcfSummary?.results?.netDebt ?? canonicalValues.netDebt.value ?? null,
        sharesOutstanding: canonicalValues.sharesOutstanding.value ?? null,
      },
      {
        model: 'lbo',
        ebitda: lboSummary?.inputs?.ebitda ?? null,
        netDebt: lboSummary?.inputs?.netDebt ?? null,
      },
      {
        model: 'comps',
        ebitda: (compsSummary as any)?.subject?.ebitda ?? null,
        netDebt: (compsSummary as any)?.subject?.netDebt ?? null,
        sharesOutstanding: (compsSummary as any)?.subject?.sharesOutstanding ?? null,
      },
    ]
  );

  // Build canonical ModelDocument from model outputs (single source of truth for preview + excel mapping)
  modelDocument = buildDocumentFromModelOutputs({
    ticker: cleanTicker,
    modelType,
    asOfDate: new Date().toISOString().split('T')[0],
    currency: 'USD',
    units: 'millions',
    assumptions: sanitizedAssumptions,
    dcfSummary,
    threeStatementSummary: threeStatementSummary ?? null,
    lboSummary: lboSummary ?? null,
    debtCapacityLiteSummary: debtCapacitySummary ?? null,
    compsSummary,
    scorecardSummary,
  });

  // Legacy preview payload retained for compatibility, now derived from ModelDocument (not workbook scraping)
  const preview = buildLegacyPreviewFromDocument(modelDocument);
  console.log(
    '[MODEL_DEBUG] ModelDocument preview generated:',
    preview ? `${preview.rows?.length || 0} rows, ${preview.columns?.length || 0} columns` : 'null'
  );

  // Downloadable workbook:
  // - DCF: use the full banker-style DCF workbook generator (multi-tab, audit-friendly).
  // - Three-statement: use the full three-statement workbook (IS, BS, CF, etc.).
  // - Everything else: use ModelDocument mapping for consistent preview/export.
  let exportWorkbook: ExcelJS.Workbook;
  if ((modelType === 'dcf' || modelType === 'reverse-dcf') && dcfWorkbook && dcfWorkbook.worksheets.length > 0) {
    exportWorkbook = dcfWorkbook;
  } else if (modelType === 'three-statement' && workbook.worksheets.length > 0) {
    exportWorkbook = workbook;
  } else if (modelType === 'comps' && compsSummary) {
    const { generateCompsWorkbook } = await import('@/lib/compsExcelGenerator');
    exportWorkbook = await generateCompsWorkbook(compsSummary as Record<string, unknown>);
  } else if (modelType === 'debt-capacity-lite' && debtCapacitySummary) {
    const { generateDebtCapacityLiteWorkbook } = await import('@/lib/models/debtCapacityLite/excel');
    exportWorkbook = await generateDebtCapacityLiteWorkbook({
      ticker: cleanTicker,
      summary: debtCapacitySummary,
      asOfDate: (body?.asOfDate as string) || new Date().toISOString().slice(0, 10),
    });
  } else {
    exportWorkbook = await mapDocumentToExcel(modelDocument, DEFAULT_STYLE_TOKENS);
    if (exportWorkbook.worksheets.length === 0) {
      throw new Error('ModelDocument mapping produced an empty workbook');
    }
  }

  if (!wantsJson && (modelType === 'dcf' || modelType === 'reverse-dcf' || modelType === 'comps' || modelType === 'three-statement')) {
    const { generateModelReport, upsertModelBriefSheet } = await import('@/lib/models/modelBriefReport');

    const companyName =
      (sanitizedAssumptions as any)?.companyName ||
      (sanitizedAssumptions as any)?.assumptionNotes?.[0] ||
      cleanTicker;
    const companySnapshot = {
      companyName,
      ticker: cleanTicker,
      sector: (sanitizedAssumptions as any)?.sector || null,
      asOfDate: (body?.asOfDate as string) || new Date().toISOString().slice(0, 10),
      revenueLtm:
        canonicalValues?.revenue?.value ??
        (Array.isArray((sanitizedAssumptions as any)?.revenue)
          ? (sanitizedAssumptions as any).revenue[0]
          : null),
      ebitdaLtm: canonicalValues?.ebitda?.value ?? null,
      netIncomeLtm: canonicalValues?.netIncome?.value ?? null,
      netDebt:
        (modelType === 'dcf' || modelType === 'reverse-dcf' ? dcfSummary?.results?.netDebt : null) ??
        (modelType === 'comps' ? compsSummary?.subject?.netDebt : null) ??
        (modelType === 'three-statement' ? (sanitizedAssumptions as any)?.netDebt : null) ??
        canonicalValues?.netDebt?.value ??
        null,
      netDebtSource:
        (sanitizedAssumptions as any)?.netDebtSource === 'estimated_ai' ||
        (sanitizedAssumptions as any)?.netDebtSource === 'estimated_rules'
          ? 'Estimated'
          : (sanitizedAssumptions as any)?.netDebtSource === 'reported'
          ? 'Reported'
          : 'Unavailable',
    };

    const reportModelType = modelType === 'reverse-dcf' ? 'dcf' : modelType;
    const report = await generateModelReport({
      modelType: reportModelType as 'dcf' | 'comps' | 'three-statement',
      companySnapshot,
      modelOutputs: {
        dcfSummary,
        compsSummary,
        threeStatementSummary,
      },
      assumptions: sanitizedAssumptions,
    });
    await upsertModelBriefSheet(exportWorkbook, report);
  }

  const downloadBufferRaw = await exportWorkbook.xlsx.writeBuffer();
  const workbookBuffer = Buffer.isBuffer(downloadBufferRaw)
    ? downloadBufferRaw
    : Buffer.from(downloadBufferRaw);

  // Validate buffer is a valid XLSX (starts with PK signature)
  if (workbookBuffer.length < 4 || workbookBuffer[0] !== 0x50 || workbookBuffer[1] !== 0x4B) {
    throw new Error('Generated workbook buffer is not a valid XLSX file (missing PK signature)');
  }

  metricsSuccess = true;

  console.log('[MODEL_DEBUG] sheets:', exportWorkbook.worksheets.map((sheet) => sheet.name));
  console.log('[MODEL_DEBUG] buffer size:', workbookBuffer.length, 'bytes');

  // Make file generation idempotent: same inputs → same filename
  // Hash inputs to create deterministic filename
  const inputsHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ ticker: cleanTicker, modelType, ...sanitizedAssumptions, ...body }))
    .digest('hex')
    .substring(0, 8);
  
  const downloadFilename = `${cleanTicker}_${modelType}_${inputsHash}.xlsx`;

  // Optional: offload to object storage (R2/S3) for reliable downloads
  let signedDownloadUrl: string | undefined;
  if (!wantsJson && isObjectStoreConfigured()) {
    try {
      // Ensure key always ends with .xlsx to prevent folder paths
      const safeRequestId = (requestId || crypto.randomUUID()).replace(/[^a-zA-Z0-9-_]/g, '_');
      const key = `models/${safeRequestId}.xlsx`;
      
      // Validate key doesn't end with / (folder indicator)
      if (key.endsWith('/')) {
        throw new Error(`Invalid storage key: ${key} (ends with /)`);
      }
      
      signedDownloadUrl = await uploadBufferAndSign({
        key,
        buffer: workbookBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        expiresInSeconds: 900, // 15 minutes
      });
      
      // Validate signed URL doesn't end with / (folder indicator)
      if (signedDownloadUrl && signedDownloadUrl.endsWith('/')) {
        console.warn('[generateModel] ⚠️ Signed URL ends with /, falling back to inline download');
        signedDownloadUrl = undefined;
      } else {
        console.log('[generateModel] ✅ Uploaded workbook to object storage', { key, urlLength: signedDownloadUrl?.length });
      }
    } catch (err) {
      console.warn('[generateModel] ⚠️ Object storage upload failed, falling back to inline download:', err);
    }
  }
  
  if (wantsJson) {
    const dataUri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${workbookBuffer.toString('base64')}`;

    // Build response object
    const forceInlineDownload = req.headers.get('x-capitalbase-inline-download') === '1';

    const response: any = {
      success: true,
      state: 'generated',
      ticker: cleanTicker,
      modelType,
      preview,
      modelDocument,
      canonicalFinancials,
      overrideLog: canonicalFinancials.overrides,
      consistencyWarnings: consistencyResult.warnings,
      consistencyDetails: consistencyResult.details,
      downloadUrl: forceInlineDownload ? dataUri : signedDownloadUrl ?? dataUri,
      filename: downloadFilename,
      sheets: exportWorkbook.worksheets.map(s => s.name),
      bufferSize: workbookBuffer.length,
      appliedDefaults,
      warnings: Array.from(
        new Set([
          ...runtimeFallbackWarnings,
          ...guardrailResult.warnings,
          ...canonicalFinancials.warnings,
          ...consistencyResult.warnings,
        ])
      ),
      liveDataFallback:
        runtimeFallbackWarnings.includes(LIVE_DATA_FALLBACK_NOTICE) ||
        normalizedModelInputs?.metadata?.liveDataFallback === true,
      estimated: estimatedInputs, // Include auto-estimated inputs
      quickLbo:
        modelType === 'lbo' && body?.quickLbo === true
          ? {
              enabled: true,
              defaultsApplied: quickLboPayload?.appliedDefaults ?? [],
            }
          : undefined,
      reverseDcf:
        modelType === 'reverse-dcf'
          ? dcfSummary?.reverseDcf || {
              enabled: true,
            }
          : undefined,
      debtCapacityLite:
        modelType === 'debt-capacity-lite'
          ? debtCapacitySummary
          : undefined,
      sensitivity:
        modelType === 'dcf' || modelType === 'reverse-dcf'
          ? dcfSummary?.sensitivity
          : modelType === 'lbo'
            ? (lboSummary as any)?.sensitivity
            : undefined,
    };

    // Include model-specific summaries for preview parsing
    if ((modelType === 'dcf' || modelType === 'reverse-dcf') && dcfSummary) {
      response.dcfSummary = dcfSummary;
      // Dev logging
      if (process.env.NODE_ENV === 'development') {
        console.log('[DCF RESPONSE SHAPE]', JSON.stringify(dcfSummary, null, 2));
      }
    }
    if (modelType === 'lbo' && lboSummary) {
      response.lboSummary = lboSummary;
    }
    if (modelType === 'scorecard' && scorecardSummary) {
      response.scorecardSummary = scorecardSummary;
    }

    return NextResponse.json(response);
  }

  // Default: return binary XLSX file or redirect to signed URL
  if (signedDownloadUrl) {
    return NextResponse.redirect(signedDownloadUrl, { status: 302 });
  }

  return new NextResponse(workbookBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${downloadFilename}"`,
      'Content-Length': workbookBuffer.length.toString(),
      'Cache-Control': 'no-store',
      'X-Workbook-Sheets': exportWorkbook.worksheets.length.toString(),
      'X-Preview-Available': modelDocument ? 'true' : 'false',
    },
  });
  } catch (error: any) {
    // Update run record to failed
    if (runId) {
      await updateModelRunFailed({
        runId,
        errorMessage: error?.message || 'Unknown error',
      });
    }
    
    const resolvedStage = error?.stage || currentStage;
    console.error('[GENERATE_MODEL_ERROR] Full error:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      ticker: metricsTicker || 'unknown',
      modelType: metricsModelType || 'unknown',
      stage: resolvedStage,
    });

    if (error?.code === 'no_comparable_companies') {
      return NextResponse.json(
        {
          ok: false,
          requestId,
          state: 'assumptions_required',
          stage: 'peers',
          code: 'no_comparable_companies',
          message:
            error?.message ||
            'Could not auto-generate comparable companies. Please add peers manually.',
          requiredInputs: error?.requiredInputs || [],
          suggestions: error?.suggestions || {},
          details: {
            ticker: metricsTicker || 'unknown',
            modelType: metricsModelType || 'comps',
          },
        },
        { status: 422 }
      );
    }

    if (typeof error?.message === 'string') {
      if (error.message.includes('No valid peers remain')) {
        return NextResponse.json(
          {
            ok: false,
            requestId,
            code: 'comps_no_valid_peers',
            message: error.message,
            stage: resolvedStage,
            details: {
              ticker: metricsTicker || 'unknown',
              modelType: metricsModelType || 'comps',
            },
          },
          { status: 422 }
        );
      }
      if (error.message.includes('No valid multiples')) {
        return NextResponse.json(
          {
            ok: false,
            requestId,
            code: 'comps_no_valid_multiples',
            message: error.message,
            stage: resolvedStage,
            details: {
              ticker: metricsTicker || 'unknown',
              modelType: metricsModelType || 'comps',
            },
          },
          { status: 422 }
        );
      }
    }

    // Return consistent error JSON shape
    return NextResponse.json(
      {
        ok: false,
        requestId,
        code: 'internal_error',
        message: error?.message || 'Failed to generate model',
        stage: resolvedStage,
        details: {
          ticker: metricsTicker || 'unknown',
          modelType: metricsModelType || 'unknown',
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
      try {
        logModelRun({
          ticker: metricsTicker,
          modelType: metricsModelType,
          durationMs,
          success: metricsSuccess,
        });
      } catch (error) {
        console.error('[METRICS] Failed to log run', error);
      }
    }
  }
}
