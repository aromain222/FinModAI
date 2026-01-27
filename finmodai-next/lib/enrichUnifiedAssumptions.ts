/**
 * Unified Assumption Enrichment System
 * 
 * Uses OpenAI to fill missing financial data for ALL model types.
 * Ensures internally consistent three statements with NO ZERO VALUES.
 */

import OpenAI from 'openai';
import { APP_NAME } from '@/lib/branding';
import type {
  ThreeStatementAssumptions,
  PartialThreeStatementAssumptions,
  AssumptionEnrichmentRequest,
  DEFAULT_THREE_STATEMENT_ASSUMPTIONS,
} from '@/types/threeStatementAssumptions';
import { buildFallbackEstimates, type Sector } from '@/lib/fallbackEngine';
import { getSector } from '@/lib/sectorMapping';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are ${APP_NAME}, an investment-banking modeling system.

Your job is to fill missing base-year and projected financial statement items based on typical sector norms.

You MUST return complete JSON with no missing fields.

You MUST infer realistic values using margins, capex intensity, working capital ratios, PP&E turnover, and tax rates typical for the sector.

Never return zeros unless the sector norm is actually zero (e.g., inventory for software companies).

Your job is to make all three statements internally consistent:
- Income Statement (Revenue → COGS → OpEx → D&A → EBIT → Taxes → Net Income)
- Balance Sheet (Assets = Liabilities + Equity)
- Cash Flow Statement (Operating + Investing + Financing = Change in Cash)

Ensure that:
- Working capital ties to balance sheet and cash flow
- PP&E roll-forward ties (Beginning + Capex - D&A = Ending)
- Cash rolls forward correctly
- Balance sheet balances (Assets = Liabilities + Equity)

Return strictly valid JSON matching the ThreeStatementAssumptions schema. No commentary, no extra fields.

CRITICAL: ALL PERCENTAGE VALUES MUST BE RETURNED AS DECIMALS (0.10 for 10%, NOT 10 or "10%")

Rules for filling missing data:
- years: If missing, use 6 years starting from current year
- revenue: Extrapolate from available data using sector-appropriate growth (tech 15-25%, retail 3-7%, industrials 5-10%)
- revenueGrowth: DECIMAL ARRAY (e.g., [0.15, 0.12, 0.10, 0.08, 0.06]) - Range: -0.50 to +0.50
- cogsPct: DECIMAL ARRAY - Tech 0.25-0.35, Retail 0.65-0.75, Manufacturing 0.55-0.65 - Range: 0.10 to 1.20
- opexPct: DECIMAL ARRAY - Tech 0.25-0.35, Retail 0.15-0.20, Services 0.20-0.30 - Range: 0.01 to 0.80
- daPct: DECIMAL ARRAY - Asset-light 0.02-0.04, Capital-intensive 0.05-0.08 - Range: 0 to 0.20
- taxRate: DECIMAL (e.g., 0.21 for 21%) - Range: 0 to 0.50
- interestRate: DECIMAL (e.g., 0.05 for 5%) - Range: 0 to 0.20
- capexPctRevenue: DECIMAL ARRAY (e.g., [0.04, 0.04, 0.03, 0.03, 0.03]) - Range: 0 to 0.25
- startingCash: 5-10% of revenue for healthy companies
- startingPPE: Use PP&E turnover (Revenue/PPE) typical for sector
- startingAR: Use arDays (typically 30-60 days)
- startingInventory: Use inventoryDays (0 for services, 30-90 for retail/manufacturing)
- startingAP: Use apDays (typically 30-45 days)
- arDays: INTEGER 0-180 days (30-45 for B2B, 15-30 for B2C)
- inventoryDays: INTEGER 0-365 days (0 for services, 30-60 for retail, 60-90 for manufacturing)
- apDays: INTEGER 0-180 days (typically 30-45)
- debt: Estimate from typical leverage ratios (Debt/EBITDA 1-3x)
- sharesOutstanding: Estimate from market cap if available

HARD BOUNDS (values outside these ranges will be rejected):
- revenueGrowth: -0.50 to +0.50 (never return values like 10 or 15)
- cogsPct: 0.10 to 1.20 (never return values like 65 or 75)
- opexPct: 0.01 to 0.80 (never return values like 20 or 30)
- daPct: 0 to 0.20 (never return values like 4 or 5)
- taxRate: 0 to 0.50 (never return values like 21 or 25)
- capexPctRevenue: 0 to 0.25 (never return values like 4 or 6)
- interestRate: 0 to 0.20 (never return values like 5 or 6)

If you cannot infer a reasonable value for a field, return null instead of guessing.

For arrays (revenue, revenueGrowth, cogsPct, opexPct, daPct, capexPctRevenue):
- Ensure all arrays have the same length as years
- Show gradual improvement in margins over time (operating leverage)
- Revenue growth should moderate over time (high growth → steady state)
- ALL VALUES MUST BE DECIMALS, NOT PERCENTAGES`;

/**
 * Enrich partial assumptions using OpenAI
 */
export async function enrichUnifiedAssumptions(
  request: AssumptionEnrichmentRequest
): Promise<ThreeStatementAssumptions> {
  try {
    console.log('[enrichUnifiedAssumptions] Calling OpenAI for:', request.ticker);

    const userMessage = JSON.stringify({
      ticker: request.ticker,
      companyName: request.companyName || request.ticker,
      sector: request.sector || 'Unknown',
      modelType: request.modelType,
      currency: request.currency || 'USD',
      partialAssumptions: request.partialAssumptions,
      instructions: request.userNotes || 'Fill in all missing fields with realistic, sector-appropriate assumptions. Ensure internal consistency across all three statements.',
    }, null, 2);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 3000,
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('OpenAI returned empty response');
    }

    console.log('[enrichUnifiedAssumptions] OpenAI response received');
    
    const aiResponse = JSON.parse(responseText);

    // Validate and fill any missing fields (NEVER throws)
    const enrichedAssumptions = validateAndFillAssumptions(
      aiResponse,
      request.partialAssumptions,
      request.ticker
    );

    return enrichedAssumptions;

  } catch (error) {
    console.error('[enrichUnifiedAssumptions] OpenAI call failed:', error);
    
    // Fall back to sensible defaults
    console.log(`[enrichUnifiedAssumptions] Using fallback engine for ${request.ticker}`);
    return buildFallbackAssumptions(request.partialAssumptions, request.ticker);
  }
}

/**
 * Validate and fill missing fields in assumptions
 * NEVER throws - always returns valid assumptions by filling gaps
 */
function validateAndFillAssumptions(
  assumptions: any,
  partial: PartialThreeStatementAssumptions,
  ticker: string
): ThreeStatementAssumptions {
  const warnings: string[] = [];
  
  // Get fallback for any missing fields
  const fallback = buildFallbackAssumptions(partial, ticker);
  
  // Merge AI response with fallback (AI takes precedence if valid)
  const merged: ThreeStatementAssumptions = {
    years: assumptions.years || fallback.years,
    revenue: assumptions.revenue || fallback.revenue,
    revenueGrowth: assumptions.revenueGrowth || fallback.revenueGrowth,
    cogsPct: assumptions.cogsPct || fallback.cogsPct,
    opexPct: assumptions.opexPct || fallback.opexPct,
    daPct: assumptions.daPct || fallback.daPct,
    taxRate: assumptions.taxRate ?? fallback.taxRate,
    interestRate: assumptions.interestRate ?? fallback.interestRate,
    capexPctRevenue: assumptions.capexPctRevenue || fallback.capexPctRevenue,
    arDays: assumptions.arDays ?? fallback.arDays,
    inventoryDays: assumptions.inventoryDays ?? fallback.inventoryDays,
    apDays: assumptions.apDays ?? fallback.apDays,
    debt: assumptions.debt ?? fallback.debt,
    startingCash: assumptions.startingCash ?? fallback.startingCash,
    startingPPE: assumptions.startingPPE ?? fallback.startingPPE,
    startingAR: assumptions.startingAR ?? fallback.startingAR,
    startingInventory: assumptions.startingInventory ?? fallback.startingInventory,
    startingAP: assumptions.startingAP ?? fallback.startingAP,
    sharesOutstanding: assumptions.sharesOutstanding ?? fallback.sharesOutstanding,
    companyName: assumptions.companyName || fallback.companyName,
    ticker: assumptions.ticker || fallback.ticker,
    currency: assumptions.currency || fallback.currency,
    sector: assumptions.sector || fallback.sector,
    dataSource: assumptions.dataSource || 'ai-enriched',
    generatedAt: assumptions.generatedAt || new Date().toISOString(),
    assumptionNotes: assumptions.assumptionNotes || fallback.assumptionNotes,
  };
  
  // Validate array lengths and fix if needed
  const yearCount = merged.years.length;
  
  if (merged.revenue.length !== yearCount) {
    warnings.push(`revenue array length mismatch (${merged.revenue.length} vs ${yearCount}), using fallback`);
    merged.revenue = fallback.revenue;
  }
  
  if (merged.revenueGrowth.length !== yearCount) {
    warnings.push(`revenueGrowth array length mismatch, using fallback`);
    merged.revenueGrowth = fallback.revenueGrowth;
  }
  
  if (merged.cogsPct.length !== yearCount) {
    warnings.push(`cogsPct array length mismatch, using fallback`);
    merged.cogsPct = fallback.cogsPct;
  }
  
  if (merged.opexPct.length !== yearCount) {
    warnings.push(`opexPct array length mismatch, using fallback`);
    merged.opexPct = fallback.opexPct;
  }
  
  if (merged.daPct.length !== yearCount) {
    warnings.push(`daPct array length mismatch, using fallback`);
    merged.daPct = fallback.daPct;
  }
  
  if (merged.capexPctRevenue.length !== yearCount) {
    warnings.push(`capexPctRevenue array length mismatch, using fallback`);
    merged.capexPctRevenue = fallback.capexPctRevenue;
  }
  
  // Check for missing critical fields
  if (!merged.sharesOutstanding || merged.sharesOutstanding <= 0) {
    warnings.push('Missing sharesOutstanding, using fallback heuristic');
    merged.sharesOutstanding = fallback.sharesOutstanding;
  }
  
  if (!merged.startingCash || merged.startingCash === 0) {
    warnings.push('startingCash is zero or missing, using fallback');
    merged.startingCash = fallback.startingCash;
  }
  
  if (!merged.startingPPE || merged.startingPPE === 0) {
    warnings.push('startingPPE is zero or missing, using fallback');
    merged.startingPPE = fallback.startingPPE;
  }
  
  // Log warnings
  if (warnings.length > 0) {
    console.warn(`[validateAndFillAssumptions] ${ticker}: ${warnings.join('; ')}`);
  }
  
  return merged;
}

/**
 * Build fallback assumptions when OpenAI fails
 */
function buildFallbackAssumptions(
  partial: PartialThreeStatementAssumptions,
  ticker: string
): ThreeStatementAssumptions {
  console.log('[buildFallbackAssumptions] Using fallback engine for', ticker);

  const currentYear = new Date().getFullYear();
  const years = partial.years || [
    currentYear,
    currentYear + 1,
    currentYear + 2,
    currentYear + 3,
    currentYear + 4,
    currentYear + 5,
  ];

  // Get sector for intelligent defaults
  const sector: Sector = getSector(ticker);
  console.log(`[buildFallbackAssumptions] Sector: ${sector}`);

  // Use fallback engine for intelligent estimates
  const fallbacks = buildFallbackEstimates({
    sector,
    forecastYears: years.length,
    revenueHistory: undefined, // TODO: pass from API if available
    marginHistory: undefined,
    peerMetrics: undefined,
    ltmEbitdaForDebt: partial.revenue?.[0] ? partial.revenue[0] * 0.20 : 1000,
    blendedCostOfDebt: 0.07,
  });

  // Build revenue using fallback engine
  const revenue = fallbacks.revenue.projections;
  const revenueGrowth = Array(years.length).fill(fallbacks.revenue.cagrUsed);

  // Build margin arrays using fallback engine
  const ebitdaMargin = fallbacks.ebitdaMargin.ebitdaMargin;
  const cogsPct = Array(years.length).fill(1 - ebitdaMargin - 0.10); // EBITDA = Revenue - COGS - OpEx
  const opexPct = Array(years.length).fill(0.10);
  const daPct = Array(years.length).fill(fallbacks.capexPctRevenue * 1.2); // D&A typically 120% of capex
  const capexPctRevenue = Array(years.length).fill(fallbacks.capexPctRevenue);

  return {
    years,
    revenue,
    revenueGrowth,
    cogsPct,
    opexPct,
    daPct,
    taxRate: partial.taxRate ?? 0.21,
    startingCash: partial.startingCash ?? revenue[0] * 0.08,
    startingPPE: partial.startingPPE ?? revenue[0] * 0.5,
    startingAR: partial.startingAR ?? (revenue[0] * fallbacks.workingCapital.daysAR) / 365,
    startingInventory: partial.startingInventory ?? (revenue[0] * (1 - ebitdaMargin) * fallbacks.workingCapital.daysInventory) / 365,
    startingAP: partial.startingAP ?? (revenue[0] * (1 - ebitdaMargin) * fallbacks.workingCapital.daysAP) / 365,
    arDays: partial.arDays ?? fallbacks.workingCapital.daysAR,
    inventoryDays: partial.inventoryDays ?? fallbacks.workingCapital.daysInventory,
    apDays: partial.apDays ?? fallbacks.workingCapital.daysAP,
    capexPctRevenue,
    debt: partial.debt ?? fallbacks.debtCapacity.chosenDebt,
    interestRate: partial.interestRate ?? 0.05,
    sharesOutstanding: partial.sharesOutstanding ?? 100,
    assumptionNotes: [
      `Assumptions generated using fallback engine (sector: ${sector})`,
      `Revenue CAGR: ${(fallbacks.revenue.cagrUsed * 100).toFixed(1)}% (sector default)`,
      `EBITDA Margin: ${(ebitdaMargin * 100).toFixed(1)}% (source: ${fallbacks.ebitdaMargin.source})`,
      `Capex: ${(fallbacks.capexPctRevenue * 100).toFixed(1)}% of revenue`,
      `Working Capital: ${fallbacks.workingCapital.daysAR} days AR, ${fallbacks.workingCapital.daysInventory} days inventory, ${fallbacks.workingCapital.daysAP} days AP`,
      `Debt Capacity: ${fallbacks.debtCapacity.impliedNetLeverage.toFixed(1)}x leverage`,
      `Coverage: ${fallbacks.debtCapacity.coverageAtIssue.toFixed(1)}x at issue`,
      ...partial.assumptionNotes || [],
    ],
  };
}

/**
 * Build array projection from partial data
 */
function buildArrayProjection(
  partial: (number | null)[] | undefined,
  length: number,
  defaultValue: number,
  growthRate: number
): number[] {
  if (!partial || partial.length === 0) {
    // No data - use default with growth
    return Array.from({ length }, (_, i) => defaultValue * Math.pow(1 + growthRate, i));
  }

  // Find last known value
  const lastKnownIndex = partial.findLastIndex(v => v !== null && v !== undefined);
  if (lastKnownIndex === -1) {
    return buildArrayProjection(undefined, length, defaultValue, growthRate);
  }

  const result: number[] = [];
  for (let i = 0; i < length; i++) {
    if (i <= lastKnownIndex && partial[i] !== null && partial[i] !== undefined) {
      result.push(partial[i]!);
    } else if (lastKnownIndex >= 0) {
      // Use last known value
      result.push(partial[lastKnownIndex]!);
    } else {
      result.push(defaultValue);
    }
  }

  return result;
}

/**
 * Generate summary text for the model
 */
export function generateModelSummary(
  ticker: string,
  modelType: string,
  assumptions: ThreeStatementAssumptions
): string {
  const firstYearRevenue = assumptions.revenue[0];
  const lastYearRevenue = assumptions.revenue[assumptions.revenue.length - 1];
  const years = assumptions.years.length - 1;
  const cagr = years > 0 ? Math.pow(lastYearRevenue / firstYearRevenue, 1 / years) - 1 : 0;
  
  const avgCogsMargin = assumptions.cogsPct.reduce((a, b) => a + b, 0) / assumptions.cogsPct.length;
  const grossMargin = 1 - avgCogsMargin;

  return `${ticker} ${modelType.toUpperCase()} model projects revenue growth from $${(firstYearRevenue / 1000).toFixed(1)}B to $${(lastYearRevenue / 1000).toFixed(1)}B (${(cagr * 100).toFixed(1)}% CAGR) with an average gross margin of ${(grossMargin * 100).toFixed(1)}%. The model uses realistic working capital assumptions (${assumptions.arDays} days AR, ${assumptions.inventoryDays} days inventory) and ${(assumptions.capexPctRevenue[0] * 100).toFixed(1)}% capex intensity, reflecting sector-typical capital requirements.`;
}
