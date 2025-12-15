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

import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
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
import { cleanAndScaleFinancials, type RawFinancials, type ScaledFinancials } from '@/lib/financials';
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
import { applyDefaultsToModelInputs } from '@/lib/models/shared/applyDefaults';
import { evaluateGuardrails } from '@/lib/models/shared/guardrails';

const deepClone = <T,>(value: T): T => {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

export const runtime = 'nodejs';

/**
 * Validate request body
 */
function validateRequestBody(body: any): { ticker: string; modelType: RequestModelType; rest: any } {
  if (!body || typeof body !== 'object') {
    throw new Error('Missing or invalid JSON body');
  }

  const { ticker, modelType, ...rest } = body;

  if (!ticker || typeof ticker !== 'string' || ticker.trim().length === 0) {
    throw new Error('Ticker is required and must be a non-empty string');
  }

  const allowedTypes: RequestModelType[] = ['three-statement', 'dcf', 'lbo', 'comps'];
  if (!modelType || !allowedTypes.includes(modelType)) {
    throw new Error(`Invalid modelType "${modelType}". Must be one of: ${allowedTypes.join(', ')}`);
  }

  return {
    ticker: ticker.trim().toUpperCase(),
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
    if (ltmFinancials.revenue) {
      partial.revenue = [ltmFinancials.revenue];
    }
    if (ltmFinancials.grossProfit && ltmFinancials.revenue) {
      partial.cogsPct = [(ltmFinancials.revenue - ltmFinancials.grossProfit) / ltmFinancials.revenue];
    }
    if (ltmFinancials.operatingIncome && ltmFinancials.revenue) {
      partial.opexPct = [(ltmFinancials.revenue - ltmFinancials.operatingIncome - (ltmFinancials.revenue - ltmFinancials.grossProfit)) / ltmFinancials.revenue];
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
): Promise<{ dcfSummary?: any }> {
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
  
  // Get scenario from request (default: BASE)
  const scenario: Scenario = (body.scenario?.toUpperCase() as Scenario) || 'BASE';
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
  const netDebtMillions = normalizedFinancials?.netDebtM ?? ensureMillions(assumptions.debt - assumptions.startingCash, 'netDebt');
  const sharesOutstandingMillions = normalizedFinancials?.sharesOutstandingM ?? ensureMillions(assumptions.sharesOutstanding, 'sharesOutstanding');
  const revenueByYear = assumptions.revenue.map(r => ensureMillions(r, 'revenue'));
  
  if (sliderOverrides.revenueGrowth !== undefined) {
    for (let i = 1; i < revenueByYear.length; i++) {
      revenueByYear[i] = revenueByYear[i - 1] * (1 + sliderOverrides.revenueGrowth);
    }
    console.log(
      `[generateModel] Slider override: Applied ${(sliderOverrides.revenueGrowth * 100).toFixed(1)}% revenue growth across forecast years.`
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
  };

  // STEP 7: VALIDATION & ABORT LOGIC
  console.log(`[generateModel] STEP 5: Validating DCF inputs...`);
  const validationResult = validateDCFInputs(dcfInputs, apiAttempts);
  logValidationResult(validationResult, ticker);
  
  // ABORT if validation fails
  if (!validationResult.canProceed) {
    const errorReport = formatValidationError(validationResult, ticker);
    console.error(errorReport);
    throw new Error(`DCF validation failed for ${ticker}: ${validationResult.missingCriticalFields.join(', ')} missing`);
  }
  
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

  // Generate DCF workbook (will normalize, compute, and build Excel)
  const bankerWorkbook = await generateBankerDCF(dcfInputs);

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
  
  const scenarioAdjustmentNotes = createScenarioSummary(scenario, adjustedEstimates, waccAdjustment);
  
  const dcfSummary = formatDCFOutput(
    ticker,
    scenario,
    normalizedInputs,
    results,
    waccSource,
    scenarioAdjustmentNotes
  );
  
  // Log formatted output to console
  logFormattedOutput(dcfSummary);
  
  // Return DCF summary for API response
  // Include both the formatted summary AND the raw results for preview parsing
  const jsonSummary = createJSONSummary(dcfSummary);
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
        revenueByYear: normalizedInputs.revenueByYear,
        ebitByYear: results.ebitByYear,
        ufcfByYear: results.ufcfByYear,
        // Extract first 3 years for preview
        revenueProjections: normalizedInputs.revenueByYear.slice(0, 3),
        ebitdaProjections: results.ebitByYear.slice(0, 3).map((ebit, i) => 
          ebit + (results.daByYear[i] || 0)
        ),
        fcfProjections: results.ufcfByYear.slice(0, 3),
      },
      // Include assumptions for preview
      assumptions: {
        ...jsonSummary.assumptions,
        taxRate: normalizedInputs.taxRate,
        projectionHorizon: normalizedInputs.years.length,
      },
    }
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

  // Interest Expense
  sheet.getCell(row, 1).value = 'Interest Expense';
  const interestExpense = assumptions.debt * assumptions.interestRate;
  assumptions.years.forEach((_, idx) => {
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
    const ebt = ebit - interestExpense;
    const taxes = ebt * assumptions.taxRate;
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
    const ebt = ebit - interestExpense;
    const taxes = ebt * assumptions.taxRate;
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
  diagnostics?: DataDiagnostics[]
): Promise<void> {
  console.log(`[generateModel] Building Comps for ${ticker}`);
  
  const { identifyPeers, mergePeerSets, cleanTickerArray } = await import('@/lib/identifyPeers');
  const { fetchAndEnrichBatch } = await import('@/lib/financialDataFetcher');
  const { buildCompsModel } = await import('@/lib/compsCalculator');
  const { generateCompsExcel } = await import('@/lib/compsExcelGenerator');

  // Get custom comps from request (if provided)
  const customComps = cleanTickerArray((assumptions as any).customComps || []);
  const useOnlyCustom = (assumptions as any).useOnlyCustom || false;

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
  
  // Create run record at start
  try {
    runId = await createModelRun({
      ticker: cleanTicker,
      modelType,
    });
  } catch (err) {
    console.warn('[generateModel] Failed to create run record:', err);
  }

  try {
    console.log('[generateModel] ========== Incoming request ==========');
    const diagnostics: DataDiagnostics[] = [];
  
  // STEP 1: Validate request body
  let cleanTicker: string;
  let modelType: RequestModelType;
  let body: any;
  let requestedLboAdvanced: LboAdvancedOptions | undefined;
  
  try {
    body = await req.json();
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
    
    console.log('[generateModel] ✅ Request validated:', { ticker: cleanTicker, modelType });
  } catch (err: any) {
    console.error('[generateModel] ❌ Request validation / parsing failed:', err);
    throw new Error(`Invalid request: ${err?.message || 'Failed to parse or validate request body'}`);
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

    const rawFinancials: RawFinancials = {
      revenue: unifiedAssumptions.ltmRevenue * 1_000_000,
      ebit: fallbackEbit * 1_000_000,
      ebitda: unifiedAssumptions.ltmEbitda * 1_000_000,
      freeCashFlow: fallbackFcf * 1_000_000,
      netDebt: unifiedAssumptions.netDebt * 1_000_000,
      sharesOutstanding: unifiedAssumptions.fdShares * 1_000_000,
      marketCap: fallbackMarketCap * 1_000_000,
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
  let enrichedAssumptions: ThreeStatementAssumptions;
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

  // STEP 5: Sanitize assumptions
  let sanitizedAssumptions: ThreeStatementAssumptions;
  const sanitizeDiag = createDiagnostic(cleanTicker, modelType as any, ltmFinancials?.dataSource as any || 'AI-Fallback', 'sanitize', true);
  const sanitizeStartTime = Date.now();
  
  try {
    console.log('[generateModel] Sanitizing assumptions...');
    const sanitizationResult = sanitizeAssumptions(enrichedAssumptions);
    sanitizeDiag.durationMs = Date.now() - sanitizeStartTime;
    
    // Log sanitization results
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
    
    // Validate sanitized assumptions (throws if critical errors)
    validateSanitizedAssumptions(sanitizationResult);
    sanitizedAssumptions = sanitizationResult.sanitized;
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
  } catch (err: any) {
    sanitizeDiag.ok = false;
    sanitizeDiag.durationMs = Date.now() - sanitizeStartTime;
    sanitizeDiag.errors.push(err?.message || 'Sanitization failed');
    console.error('[generateModel] ❌ Sanitization/validation failed:', err);
    logDiagnostic(sanitizeDiag);
    diagnostics.push(sanitizeDiag);
    throw new Error(err?.message || 'Invalid financial assumptions');
  }

  // STEP 6: Perform sanity checks
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
  
  try {
    console.log('[generateModel] Building Excel workbook...');
    
    switch (modelType) {
      case 'three-statement':
        await buildThreeStatementModelWithAssumptions(workbook, cleanTicker, sanitizedAssumptions);
        break;
      case 'dcf':
        const dcfResult = await buildDcfModelWithAssumptions(
          workbook,
          cleanTicker,
          sanitizedAssumptions,
          body,
          normalizedFinancials,
          appliedDefaults
        );
        dcfSummary = dcfResult.dcfSummary;
        break;
      case 'lbo':
        try {
          lboSummary = await buildLboModelWithAssumptions(
            workbook,
            cleanTicker,
            sanitizedAssumptions,
            normalizedFinancials,
            body
          );
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
      case 'comps':
        await buildCompsModelWithAssumptions(
          workbook,
          cleanTicker,
          sanitizedAssumptions,
          normalizedFinancials,
          diagnostics
        );
        break;
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

  const downloadFilename = `${cleanTicker}_${modelType}.xlsx`;
  
  // Check if client wants JSON response with preview (via query param or header)
  const wantsJson = req.headers.get('accept')?.includes('application/json') || 
                    req.nextUrl.searchParams.get('format') === 'json';
  
  if (wantsJson) {
    // Build response object
    const response: any = {
      success: true,
      ticker: cleanTicker,
      modelType,
      preview,
      downloadUrl: `/api/models/[modelId]/download?ticker=${encodeURIComponent(cleanTicker)}&type=${encodeURIComponent(modelType)}`,
      filename: downloadFilename,
      sheets: workbook.worksheets.map(s => s.name),
      bufferSize: workbookBuffer.length,
      appliedDefaults,
      warnings: guardrailResult.warnings,
    };

    // Include model-specific summaries for preview parsing
    if (modelType === 'dcf' && dcfSummary) {
      response.dcfSummary = dcfSummary;
      // Dev logging
      if (process.env.NODE_ENV === 'development') {
        console.log('[DCF RESPONSE SHAPE]', JSON.stringify(dcfSummary, null, 2));
      }
    }
    if (modelType === 'lbo' && lboSummary) {
      response.lboSummary = lboSummary;
    }

    return NextResponse.json(response);
  }

  // Default: return binary XLSX file
  return new NextResponse(workbookBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${downloadFilename}"`,
      'Content-Length': workbookBuffer.length.toString(),
      'Cache-Control': 'no-store',
      'X-Workbook-Sheets': workbook.worksheets.length.toString(),
      'X-Preview-Available': preview ? 'true' : 'false',
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
    
    console.error('[GENERATE_MODEL_ERROR]', error);
    return NextResponse.json(
      {
        error: 'Failed to generate model',
        details: error?.message ?? null,
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
