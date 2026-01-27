/**
 * LBO Assumptions Enrichment
 * 
 * Uses OpenAI to fill missing LBO model inputs with realistic,
 * PE-standard assumptions based on sector, leverage norms, and peer data.
 */

import OpenAI from 'openai';
import type {
  PartialLBOAssumptions,
  CompleteLBOAssumptions,
  LBOEnrichmentRequest,
  DEFAULT_LBO_ASSUMPTIONS,
} from '@/types/lboModel';
import { buildFallbackEstimates, type Sector, sectorLeverageLimit } from '@/lib/fallbackEngine';
import { getSector } from '@/lib/sectorMapping';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const LBO_ENRICHMENT_PROMPT = `You are a private equity financial modeling expert.

Your job is to fill missing LBO model assumptions with realistic, PE-standard values based on:
- Sector norms and leverage capacity
- Historical buyout multiples
- Typical debt structures and pricing
- Operating improvement assumptions

You MUST return complete JSON with NO null values.

Rules for filling missing data:

TARGET COMPANY:
- currentPrice: Use recent trading price or estimate from market cap
- sharesOutstanding: Estimate from market cap / price
- ltmRevenue: Use latest annual revenue
- ltmEBITDA: Typically 15-30% of revenue (sector-dependent)
- ltmEBIT: EBITDA - D&A (D&A typically 3-5% of revenue)
- currentNetDebt: Estimate using typical leverage (1-3x EBITDA)

TRANSACTION:
- offerPremium: 25-35% typical for LBOs
- entryMultiple: 8-12x EBITDA (sector-dependent)
- exitMultiple: Typically +0.5x to +1.0x vs entry (multiple expansion)

OPERATING PROJECTIONS:
- projectionYears: 5 years standard
- revenueGrowth: Start with sector growth, improve over time (PE value creation)
- ebitdaMargin: Start with current, improve 200-400bps over 5 years (operational improvements)
- daPercent: 3-5% of revenue (asset-light = 3%, capital-intensive = 5%)
- taxRate: 21% (US federal)
- capexPercent: 3-5% of revenue (maintenance capex)
- nwcPercent: 1-3% of revenue

DEBT STRUCTURE (as % of total debt):
- Revolver: 5-10% (undrawn facility)
- Term Loan A: 20-30% (amortizing)
- Term Loan B: 40-50% (bullet)
- Senior Notes: 10-20%
- Sub Notes: 5-10%

Target leverage: 4-6x EBITDA for healthy companies, 3-4x for stable/mature

INTEREST RATES:
- Revolver: SOFR + 300-400bps (4.5-5.5%)
- Term Loan A: SOFR + 400-500bps (5.5-6.5%)
- Term Loan B: SOFR + 500-600bps (6.5-7.5%)
- Senior Notes: 6.5-8.0%
- Sub Notes: 9.0-11.0%

Return complete JSON matching the CompleteLBOAssumptions schema.
Mark which fields were estimated in aiEstimatedFields array.`;

/**
 * Enrich partial LBO assumptions using OpenAI
 */
export async function enrichLBOAssumptions(
  request: LBOEnrichmentRequest
): Promise<CompleteLBOAssumptions> {
  try {
    console.log('[enrichLBOAssumptions] Calling OpenAI for:', request.ticker);

    const userMessage = JSON.stringify({
      ticker: request.ticker,
      companyName: request.companyName || request.ticker,
      sector: request.sector || 'Unknown',
      partialAssumptions: request.partialAssumptions,
      peerData: request.peerData || {},
      instructions: 'Fill in all missing LBO assumptions with realistic PE-standard values. Ensure debt structure is appropriate for the company size and sector.',
    }, null, 2);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: LBO_ENRICHMENT_PROMPT },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 2500,
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('OpenAI returned empty response');
    }

    console.log('[enrichLBOAssumptions] OpenAI response received');
    
    const enriched = JSON.parse(responseText) as CompleteLBOAssumptions;

    // Validate completeness
    validateLBOAssumptions(enriched);

    return enriched;

  } catch (error) {
    console.error('[enrichLBOAssumptions] OpenAI call failed:', error);
    
    // Fall back to sensible defaults
    return buildFallbackLBOAssumptions(request.partialAssumptions);
  }
}

/**
 * Validate that LBO assumptions are complete
 */
function validateLBOAssumptions(assumptions: any): asserts assumptions is CompleteLBOAssumptions {
  const required = [
    'ticker',
    'companyName',
    'currentPrice',
    'sharesOutstanding',
    'ltmRevenue',
    'ltmEBITDA',
    'ltmEBIT',
    'currentNetDebt',
    'offerPremium',
    'entryMultiple',
    'exitMultiple',
    'projectionYears',
    'revenueGrowth',
    'ebitdaMargin',
    'daPercent',
    'taxRate',
    'capexPercent',
    'nwcPercent',
    'debtStructure',
    'revolverRate',
    'termLoanARate',
    'termLoanBRate',
    'seniorNotesRate',
    'subNotesRate',
  ];

  for (const field of required) {
    if (!(field in assumptions) || assumptions[field] === null || assumptions[field] === undefined) {
      // Special case: if companyName is missing/null, use ticker as fallback
      if (field === 'companyName' && assumptions.ticker) {
        assumptions.companyName = assumptions.ticker;
        continue;
      }
      throw new Error(`Missing required LBO field: ${field}`);
    }
    // Special case: if companyName is empty string, use ticker as fallback
    if (field === 'companyName' && assumptions.companyName === '' && assumptions.ticker) {
      assumptions.companyName = assumptions.ticker;
    }
  }

  // Validate array lengths
  if (assumptions.revenueGrowth.length !== assumptions.projectionYears) {
    throw new Error('revenueGrowth array must match projectionYears');
  }
  if (assumptions.ebitdaMargin.length !== assumptions.projectionYears) {
    throw new Error('ebitdaMargin array must match projectionYears');
  }
  if (assumptions.capexPercent.length !== assumptions.projectionYears) {
    throw new Error('capexPercent array must match projectionYears');
  }
}

/**
 * Build fallback LBO assumptions when OpenAI fails
 */
function buildFallbackLBOAssumptions(
  partial: PartialLBOAssumptions
): CompleteLBOAssumptions {
  console.log('[buildFallbackLBOAssumptions] Using fallback engine for', partial.ticker);

  const projectionYears = partial.projectionYears || 5;
  
  // Get sector for intelligent defaults
  const sector: Sector = getSector(partial.ticker, partial.companyName);
  console.log(`[buildFallbackLBOAssumptions] Sector: ${sector}`);

  // Use fallback engine for intelligent estimates
  const fallbacks = buildFallbackEstimates({
    sector,
    forecastYears: projectionYears,
    revenueHistory: undefined, // TODO: pass from API if available
    marginHistory: undefined,
    peerMetrics: undefined,
    ltmEbitdaForDebt: partial.ltmEBITDA || 1000,
    blendedCostOfDebt: 0.065, // Blended rate for LBO debt stack
  });

  // Estimate LTM financials using fallback engine
  const ltmRevenue = partial.ltmRevenue || fallbacks.revenue.baseYearRevenue;
  const ltmEBITDA = partial.ltmEBITDA || (ltmRevenue * fallbacks.ebitdaMargin.ebitdaMargin);
  const ltmEBIT = partial.ltmEBIT || (ltmEBITDA * 0.90);
  const currentNetDebt = partial.currentNetDebt || (fallbacks.debtCapacity.chosenDebt * 0.5);
  
  // Build projection arrays using fallback engine
  const revenueGrowth = partial.revenueGrowth && partial.revenueGrowth.every(v => v !== null)
    ? partial.revenueGrowth as number[]
    : Array(projectionYears).fill(fallbacks.revenue.cagrUsed);
  
  // EBITDA margin expansion (PE value creation)
  const baseMargin = fallbacks.ebitdaMargin.ebitdaMargin;
  const ebitdaMargin = partial.ebitdaMargin && partial.ebitdaMargin.every(v => v !== null)
    ? partial.ebitdaMargin as number[]
    : Array(projectionYears).fill(0).map((_, i) => baseMargin + (i * 0.005)); // 50bps per year
  
  const capexPercent = partial.capexPercent && partial.capexPercent.every(v => v !== null)
    ? partial.capexPercent as number[]
    : Array(projectionYears).fill(fallbacks.capexPctRevenue);
  
  // Calculate debt structure using fallback engine capacity
  const totalDebt = fallbacks.debtCapacity.chosenDebt;
  
  const debtStructure = partial.customDebtStructure || {
    revolver: totalDebt * 0.05,
    termLoanA: totalDebt * 0.25,
    termLoanB: totalDebt * 0.45,
    seniorNotes: totalDebt * 0.15,
    subNotes: totalDebt * 0.10,
  };

  const targetLeverage = fallbacks.debtCapacity.impliedNetLeverage;

  return {
    ticker: partial.ticker,
    companyName: partial.companyName || `${partial.ticker} Inc.`,
    currentPrice: partial.currentPrice || 100,
    sharesOutstanding: partial.sharesOutstanding || 100,
    ltmRevenue,
    ltmEBITDA,
    ltmEBIT,
    currentNetDebt,
    offerPremium: partial.offerPremium || 0.30,
    entryMultiple: partial.entryMultiple || 10.0,
    exitMultiple: partial.exitMultiple || 10.5,
    projectionYears,
    revenueGrowth,
    ebitdaMargin,
    daPercent: partial.daPercent || (fallbacks.capexPctRevenue * 1.2),
    taxRate: partial.taxRate || 0.21,
    capexPercent,
    nwcPercent: partial.nwcPercent || fallbacks.workingCapital.deltaNwcPctRevenue,
    debtStructure,
    revolverRate: partial.revolverRate || 0.045,
    termLoanARate: partial.termLoanARate || 0.055,
    termLoanBRate: partial.termLoanBRate || 0.065,
    seniorNotesRate: partial.seniorNotesRate || 0.070,
    subNotesRate: partial.subNotesRate || 0.095,
    termLoanAAmortization: 0.05,
    managementRollover: 0,
    transactionFees: 0.02,
    minimumCash: 50,
    assumptionNotes: [
      `LBO assumptions generated using fallback engine (sector: ${sector})`,
      `Entry multiple: ${partial.entryMultiple || 10.0}x EBITDA`,
      `Exit multiple: ${partial.exitMultiple || 10.5}x EBITDA`,
      `Target leverage: ${targetLeverage.toFixed(1)}x EBITDA (sector limit: ${sectorLeverageLimit(sector).toFixed(1)}x)`,
      `Revenue CAGR: ${(fallbacks.revenue.cagrUsed * 100).toFixed(1)}%`,
      `EBITDA margin: ${(baseMargin * 100).toFixed(1)}% to ${(ebitdaMargin[projectionYears - 1] * 100).toFixed(1)}% (50bps expansion/year)`,
      `Capex: ${(fallbacks.capexPctRevenue * 100).toFixed(1)}% of revenue`,
      `Working Capital: ${(fallbacks.workingCapital.deltaNwcPctRevenue * 100).toFixed(1)}% of revenue change`,
      `Debt Coverage: ${fallbacks.debtCapacity.coverageAtIssue.toFixed(1)}x at issue`,
      'Debt structure: 5% Revolver, 25% TLA, 45% TLB, 15% Notes, 10% Sub',
    ],
    aiEstimatedFields: [
      'ltmRevenue',
      'ltmEBITDA',
      'ltmEBIT',
      'currentNetDebt',
      'revenueGrowth',
      'ebitdaMargin',
      'debtStructure',
      'capexPercent',
      'nwcPercent',
    ],
  };
}

/**
 * Generate summary commentary for LBO model
 */
export function generateLBOCommentary(
  ticker: string,
  assumptions: CompleteLBOAssumptions,
  exitAnalysis: any
): string {
  const entryEV = assumptions.ltmEBITDA * assumptions.entryMultiple;
  const leverage = (assumptions.debtStructure.termLoanA + 
                   assumptions.debtStructure.termLoanB + 
                   assumptions.debtStructure.seniorNotes + 
                   assumptions.debtStructure.subNotes) / assumptions.ltmEBITDA;
  
  return `${ticker} LBO model assumes a ${(assumptions.offerPremium * 100).toFixed(0)}% premium acquisition at ${assumptions.entryMultiple.toFixed(1)}x LTM EBITDA ($${(entryEV / 1000).toFixed(1)}B enterprise value). ` +
    `The transaction is financed with ${leverage.toFixed(1)}x leverage and projects ${(assumptions.revenueGrowth[0] * 100).toFixed(1)}% annual revenue growth with EBITDA margin expansion from ${(assumptions.ebitdaMargin[0] * 100).toFixed(1)}% to ${(assumptions.ebitdaMargin[assumptions.projectionYears - 1] * 100).toFixed(1)}%. ` +
    `Exit at Year ${assumptions.projectionYears} at ${assumptions.exitMultiple.toFixed(1)}x EBITDA implies a ${exitAnalysis.moic.toFixed(2)}x MOIC and ${(exitAnalysis.irr * 100).toFixed(1)}% IRR for the sponsor.`;
}

