/**
 * OpenAI Assumption Enrichment
 * 
 * Uses OpenAI to fill in missing DCF assumptions with realistic,
 * banker-quality values based on sector, growth profile, and capital intensity.
 */

import OpenAI from 'openai';
import { APP_NAME } from '@/lib/branding';
import type {
  DcfAssumptions,
  PartialDcfAssumptions,
  AssumptionEnrichmentRequest,
  DEFAULT_DCF_ASSUMPTIONS,
} from '@/types/dcfAssumptions';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are ${APP_NAME}, an investment banking modeling assistant.

Your job is to take partial financial data about a public company and return a COMPLETE, internally consistent set of modeling assumptions for a professional, private-equity-quality Excel model.

You MUST fill in missing fields using reasonable assumptions based on sector, growth profile, margins, and capital intensity.

Never leave a field null or undefined. If data is missing, infer it and mark the source as "assumed" in the assumptionNotes.

Do NOT calculate free cash flow or valuation. That is done in Excel. You only output inputs and high-level scenario deltas.

Use conservative base-case assumptions by default; bull and bear cases are small, coherent deviations around the base case.

Your response MUST be valid JSON that matches the DcfAssumptions schema provided. No extra fields, comments, or prose.

Rules for filling missing data:
- forecastYears: If missing, use 6 years starting from current year + 1
- revenue: If missing or has nulls, extrapolate from available data using sector-appropriate growth rates
- ebitMargin: If missing, use sector median (tech ~25%, retail ~8%, industrials ~12%)
- taxRate: If missing, use 0.21 (US federal rate) or country-specific rate
- daPctRevenue: If missing, use 3-5% depending on capital intensity
- capexPctRevenue: If missing, use 3-4% for asset-light, 6-8% for capital-intensive
- wcPctRevenue: If missing, use 2-3% for most businesses
- wacc: If missing, use 8-12% depending on risk profile (higher for smaller/volatile companies)
- terminalGrowth: If missing, use 2-3% (GDP growth rate)
- netDebt: If missing and critical, estimate from typical leverage ratios
- sharesOutstandingMillions: If missing, estimate from market cap / stock price if available

For bull/bear cases:
- Bull: +3-5% revenue growth, +1-2% EBIT margin, -50bps WACC
- Bear: -3-5% revenue growth, -1-2% EBIT margin, +50bps WACC`;

/**
 * Enrich partial DCF assumptions using OpenAI
 */
export async function enrichDcfAssumptions(
  request: AssumptionEnrichmentRequest
): Promise<DcfAssumptions> {
  try {
    console.log('[enrichDcfAssumptions] Calling OpenAI for:', request.ticker);

    const userMessage = JSON.stringify({
      ticker: request.ticker,
      companyName: request.companyName || request.ticker,
      sector: request.sector || 'Unknown',
      modelType: request.modelType,
      currency: request.currency || 'USD',
      partialAssumptions: request.partialAssumptions,
      instructions: request.userNotes || 'Fill in all missing fields with realistic assumptions.',
    }, null, 2);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3, // Lower temperature for more consistent outputs
      max_tokens: 2000,
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('OpenAI returned empty response');
    }

    console.log('[enrichDcfAssumptions] OpenAI response received');
    
    const enrichedAssumptions = JSON.parse(responseText) as DcfAssumptions;

    // Validate that all required fields are present
    validateDcfAssumptions(enrichedAssumptions);

    return enrichedAssumptions;

  } catch (error) {
    console.error('[enrichDcfAssumptions] OpenAI call failed:', error);
    
    // Fall back to sensible defaults
    return buildFallbackAssumptions(request.partialAssumptions);
  }
}

/**
 * Validate that DCF assumptions are complete
 */
function validateDcfAssumptions(assumptions: any): asserts assumptions is DcfAssumptions {
  const required = [
    'forecastYears',
    'revenue',
    'ebitMargin',
    'taxRate',
    'daPctRevenue',
    'capexPctRevenue',
    'wcPctRevenue',
    'wacc',
    'terminalGrowth',
    'netDebt',
    'sharesOutstandingMillions',
    'assumptionNotes',
  ];

  for (const field of required) {
    if (!(field in assumptions) || assumptions[field] === null || assumptions[field] === undefined) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // Validate arrays have same length
  if (assumptions.forecastYears.length !== assumptions.revenue.length) {
    throw new Error('forecastYears and revenue arrays must have same length');
  }

  if (assumptions.forecastYears.length !== assumptions.ebitMargin.length) {
    throw new Error('forecastYears and ebitMargin arrays must have same length');
  }
}

/**
 * Build fallback assumptions when OpenAI fails
 */
function buildFallbackAssumptions(partial: PartialDcfAssumptions): DcfAssumptions {
  console.log('[buildFallbackAssumptions] Using default values');

  const currentYear = new Date().getFullYear();
  const forecastYears = partial.forecastYears || [
    currentYear + 1,
    currentYear + 2,
    currentYear + 3,
    currentYear + 4,
    currentYear + 5,
    currentYear + 6,
  ];

  // Extrapolate revenue if partially available
  const revenue = buildRevenueProjection(partial.revenue, forecastYears.length);

  // Use sector-typical EBIT margin or default to 15%
  const baseMargin = partial.ebitMargin?.[0] || 0.15;
  const ebitMargin = forecastYears.map(() => baseMargin);

  return {
    forecastYears,
    revenue,
    ebitMargin,
    taxRate: partial.taxRate ?? 0.21,
    daPctRevenue: partial.daPctRevenue ?? 0.04,
    capexPctRevenue: partial.capexPctRevenue ?? 0.035,
    wcPctRevenue: partial.wcPctRevenue ?? 0.02,
    wacc: partial.wacc ?? 0.10,
    terminalGrowth: partial.terminalGrowth ?? 0.025,
    netDebt: partial.netDebt ?? 0,
    sharesOutstandingMillions: partial.sharesOutstandingMillions ?? 100,
    assumptionNotes: [
      'Assumptions generated using fallback defaults due to OpenAI unavailability',
      'Tax rate: 21% (US federal corporate rate)',
      'D&A: 4% of revenue (industry typical)',
      'Capex: 3.5% of revenue (moderate capital intensity)',
      'Working capital: 2% of revenue',
      'WACC: 10% (moderate risk profile)',
      'Terminal growth: 2.5% (GDP growth)',
      ...partial.assumptionNotes || [],
    ],
  };
}

/**
 * Build revenue projection from partial data
 */
function buildRevenueProjection(
  partialRevenue: (number | null)[] | undefined,
  length: number
): number[] {
  if (!partialRevenue || partialRevenue.length === 0) {
    // No data - use simple growth from $1B base
    const baseRevenue = 1000; // $1B
    const growthRate = 0.07; // 7% growth
    return Array.from({ length }, (_, i) => baseRevenue * Math.pow(1 + growthRate, i));
  }

  // Find last known revenue value
  const lastKnownIndex = partialRevenue.findLastIndex(r => r !== null && r !== undefined);
  if (lastKnownIndex === -1) {
    return buildRevenueProjection(undefined, length);
  }

  const lastKnownRevenue = partialRevenue[lastKnownIndex]!;
  
  // Calculate growth rate from available data
  let growthRate = 0.07; // default 7%
  if (lastKnownIndex > 0) {
    const firstKnownIndex = partialRevenue.findIndex(r => r !== null && r !== undefined);
    if (firstKnownIndex >= 0 && firstKnownIndex < lastKnownIndex) {
      const firstRevenue = partialRevenue[firstKnownIndex]!;
      const years = lastKnownIndex - firstKnownIndex;
      growthRate = Math.pow(lastKnownRevenue / firstRevenue, 1 / years) - 1;
      // Cap growth rate at reasonable bounds
      growthRate = Math.max(-0.05, Math.min(0.30, growthRate));
    }
  }

  // Project forward
  const result: number[] = [];
  for (let i = 0; i < length; i++) {
    if (i <= lastKnownIndex && partialRevenue[i] !== null && partialRevenue[i] !== undefined) {
      result.push(partialRevenue[i]!);
    } else {
      const yearsAhead = i - lastKnownIndex;
      result.push(lastKnownRevenue * Math.pow(1 + growthRate, yearsAhead));
    }
  }

  return result;
}
