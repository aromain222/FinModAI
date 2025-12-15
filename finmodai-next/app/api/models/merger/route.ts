/**
 * Merger Model Generation API
 * 
 * Validates inputs, pulls financial data, computes model, returns outputs + report.
 */

import { NextResponse } from 'next/server';
import { MergerModelInputSchema, getMissingMergerInputs } from '@/lib/models/merger/schema';
import { computeMergerModel } from '@/lib/models/merger/compute';
import { generateMergerReport } from '@/lib/models/merger/report';
import { generateMergerWorkbook } from '@/lib/models/merger/excel';
import { getLTMFinancials, type LTMFinancials } from '@/lib/getLTMFinancials';
import { getCurrentUserSettings } from '@/lib/settings/store';
import { applyDefaultsToModelInputs } from '@/lib/models/shared/applyDefaults';
import { evaluateGuardrails } from '@/lib/models/shared/guardrails';

export const runtime = 'nodejs';

/**
 * Convert LTMFinancials to CompanyFinancials format
 */
function convertToCompanyFinancials(ltm: LTMFinancials, ticker: string): any {
  // Derive missing fields
  const cogs = ltm.revenue && ltm.ebitda ? 
    Math.max(0, ltm.revenue - ltm.ebitda - (ltm.revenue * 0.15)) : // Rough estimate if missing
    0;
  
  const grossProfit = ltm.revenue - cogs;
  const opex = ltm.revenue && ltm.ebitda ? 
    Math.max(0, ltm.revenue - cogs - ltm.ebitda) : 
    0;
  
  const da = ltm.ebitda && ltm.ebit ? 
    Math.max(0, ltm.ebitda - ltm.ebit) : 
    0;
  
  return {
    ticker,
    revenue: ltm.revenue || 0,
    cogs,
    grossProfit,
    opex,
    ebitda: ltm.ebitda || 0,
    ebit: ltm.ebit || 0,
    da,
    interestExpense: 0, // Will need to be pulled or estimated
    netIncome: ltm.netIncome || 0,
    sharesOutstanding: ltm.sharesOutstanding || 0,
    cash: ltm.cash || 0,
    debt: ltm.totalDebt || 0,
    price: ltm.price || 0,
    taxRate: 0.21, // Default, can be overridden
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Pull financial data first to check what's available
    let buyerLTM: LTMFinancials | null = null;
    let targetLTM: LTMFinancials | null = null;
    
    try {
      if (body.buyerTicker) {
        buyerLTM = await getLTMFinancials(body.buyerTicker);
      }
    } catch (e) {
      console.warn(`[merger] Failed to pull buyer data: ${e}`);
    }
    
    try {
      if (body.targetTicker) {
        targetLTM = await getLTMFinancials(body.targetTicker);
      }
    } catch (e) {
      console.warn(`[merger] Failed to pull target data: ${e}`);
    }
    
    // Build pulled data structure
    const pulledData = {
      buyer: buyerLTM ? {
        price: buyerLTM.price,
        shares: buyerLTM.sharesOutstanding,
        cash: buyerLTM.cash,
        taxRate: undefined, // TODO: Pull tax rate if available
      } : undefined,
      target: targetLTM ? {
        price: targetLTM.price,
        shares: targetLTM.sharesOutstanding,
        cash: targetLTM.cash,
        debt: targetLTM.totalDebt,
        taxRate: undefined, // TODO: Pull tax rate if available
      } : undefined,
    };
    
    // Validate inputs with pulled data context
    const missing = getMissingMergerInputs(body, pulledData);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: 'Missing required inputs',
          missingRequired: missing,
        },
        { status: 400 }
      );
    }
    
    // Parse and validate with Zod
    const parseResult = MergerModelInputSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid input data',
          details: parseResult.error.errors,
        },
        { status: 400 }
      );
    }
    
    // Load settings and apply defaults
    const settings = await getCurrentUserSettings(req);
    const { effectiveInputs, appliedDefaults } = applyDefaultsToModelInputs('merger', parseResult.data, settings);
    
    // Re-parse with defaults applied
    const finalParseResult = MergerModelInputSchema.safeParse(effectiveInputs);
    if (!finalParseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid input data after applying defaults',
          details: finalParseResult.error.errors,
        },
        { status: 400 }
      );
    }
    
    const input = finalParseResult.data;
    
    // Use already-pulled data or fetch if not available
    if (!buyerLTM) {
      console.log(`[merger] Fetching financials for buyer: ${input.buyerTicker}`);
      buyerLTM = await getLTMFinancials(input.buyerTicker);
    }
    const buyerFinancials = convertToCompanyFinancials(buyerLTM, input.buyerTicker);
    
    if (!targetLTM) {
      console.log(`[merger] Fetching financials for target: ${input.targetTicker}`);
      targetLTM = await getLTMFinancials(input.targetTicker);
    }
    const targetFinancials = convertToCompanyFinancials(targetLTM, input.targetTicker);
    
    // Compute model (will throw if invariants violated)
    console.log(`[merger] Computing merger model...`);
    let output;
    try {
      output = computeMergerModel(input, buyerFinancials, targetFinancials);
    } catch (computeError: any) {
      console.error('[merger] Compute error:', computeError);
      return NextResponse.json(
        {
          error: computeError.message || 'Model computation failed',
          details: computeError.stack,
        },
        { status: 400 }
      );
    }
    
    // Generate report (only if compute succeeded and checks passed)
    console.log(`[merger] Generating report...`);
    let report;
    try {
      if (output.checks.allInvariantsPassed && output.checks.sourcesUsesBalanced) {
        report = generateMergerReport(
          input,
          output,
          input.buyerTicker,
          input.targetTicker
        );
      } else {
        console.warn('[merger] Skipping report generation - invariants not passed');
        report = null;
      }
    } catch (reportError: any) {
      console.warn('[merger] Report generation failed:', reportError);
      report = null;
    }
    
    // Evaluate guardrails
    const guardrailResult = evaluateGuardrails('merger', output, settings);
    
    // If any blocks exist, return 400
    if (guardrailResult.blocks.length > 0) {
      return NextResponse.json(
        {
          error: 'Model outputs violate guardrails',
          blocks: guardrailResult.blocks,
          warnings: guardrailResult.warnings,
        },
        { status: 400 }
      );
    }
    
    // Generate Excel (for preview/download)
    console.log(`[merger] Generating Excel workbook...`);
    const workbook = await generateMergerWorkbook(
      input,
      output,
      buyerFinancials,
      targetFinancials
    );
    
    // Convert workbook to buffer for preview
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Return response
    return NextResponse.json({
      success: true,
      modelId: `merger-${Date.now()}`,
      ticker: `${input.buyerTicker}/${input.targetTicker}`,
      modelType: 'merger',
      output: {
        dealConsideration: output.dealConsideration,
        sourcesUses: output.sourcesUses,
        combinedIS: output.combinedIS,
        epsAnalysis: output.epsAnalysis,
        purchaseAccounting: output.purchaseAccounting,
        checks: output.checks,
      },
      report: report || null,
      preview: {
        sheetName: 'Combined IS',
        columns: ['Line Item', ...Array.from({ length: input.forecastYears }, (_, i) => `Year ${i + 1}`)],
        rows: [
          ['Revenue', ...output.combinedIS.map(is => is.revenue.total.toFixed(0))],
          ['EBITDA', ...output.combinedIS.map(is => is.ebitda.toFixed(0))],
          ['Net Income', ...output.combinedIS.map(is => is.netIncome.toFixed(0))],
        ],
      },
      appliedDefaults,
      warnings: guardrailResult.warnings,
      diagnostics: [],
    });
  } catch (error: any) {
    console.error('[merger] Error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to generate merger model',
        details: error.stack,
      },
      { status: 500 }
    );
  }
}
