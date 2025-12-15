/**
 * Operating Model Generation API
 * 
 * Validates inputs, computes model, returns outputs + report.
 */

import { NextResponse } from 'next/server';
import { OperatingModelInputSchema, getMissingOperatingInputs } from '@/lib/models/operating/schema';
import { computeOperatingModel } from '@/lib/models/operating/compute';
import { computeVariances } from '@/lib/models/operating/variance';
import { generateOperatingReport } from '@/lib/models/operating/report';
import { generateOperatingWorkbook } from '@/lib/models/operating/excel';
import { getCurrentUserSettings } from '@/lib/settings/store';
import { applyDefaultsToModelInputs } from '@/lib/models/shared/applyDefaults';
import { evaluateGuardrails } from '@/lib/models/shared/guardrails';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Validate inputs
    const missing = getMissingOperatingInputs(body);
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
    const parseResult = OperatingModelInputSchema.safeParse(body);
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
    const { effectiveInputs, appliedDefaults } = applyDefaultsToModelInputs('operating', parseResult.data, settings);
    
    // Re-parse with defaults applied
    const finalParseResult = OperatingModelInputSchema.safeParse(effectiveInputs);
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
    
    // Compute model (will throw if invariants violated)
    console.log(`[operating] Computing operating model...`);
    let output;
    try {
      output = computeOperatingModel(input);
    } catch (computeError: any) {
      console.error('[operating] Compute error:', computeError);
      return NextResponse.json(
        {
          error: computeError.message || 'Model computation failed',
          details: computeError.stack,
        },
        { status: 400 }
      );
    }
    
    // Compute variances (if actuals exist)
    console.log(`[operating] Computing variances...`);
    let variance = null;
    try {
      variance = computeVariances(input, output);
    } catch (varianceError: any) {
      console.error('[operating] Variance computation error:', varianceError);
      return NextResponse.json(
        {
          error: varianceError.message || 'Variance computation failed',
          details: varianceError.stack,
        },
        { status: 400 }
      );
    }
    
    // Generate report (only if compute succeeded)
    console.log(`[operating] Generating report...`);
    let report;
    try {
      if (output.checks.allInvariantsPassed) {
        report = generateOperatingReport(input, output, variance);
      } else {
        console.warn('[operating] Skipping report generation - invariants not passed');
        report = null;
      }
    } catch (reportError: any) {
      console.warn('[operating] Report generation failed:', reportError);
      report = null;
    }
    
    // Evaluate guardrails
    const guardrailResult = evaluateGuardrails('operating', output, settings);
    
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
    console.log(`[operating] Generating Excel workbook...`);
    const workbook = await generateOperatingWorkbook(input, output, variance);
    
    // Convert workbook to buffer for preview
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Return response
    return NextResponse.json({
      success: true,
      modelId: `operating-${Date.now()}`,
      ticker: `Operating Model - ${input.startMonth}`,
      modelType: 'operating',
      output: {
        monthly: output.monthly,
        summary: output.summary,
        checks: output.checks,
      },
      variance: variance || null,
      report,
      preview: {
        sheetName: 'Monthly P&L',
        columns: ['Line Item', ...output.monthly.map(m => m.monthLabel)],
        rows: [
          ['Revenue', ...output.monthly.map(m => m.revenue.total.toFixed(0))],
          ['EBITDA', ...output.monthly.map(m => m.ebitda.toFixed(0))],
          ['Cash', ...output.monthly.map(m => m.cash.toFixed(0))],
        ],
      },
      appliedDefaults,
      warnings: guardrailResult.warnings,
      diagnostics: [],
    });
  } catch (error: any) {
    console.error('[operating] Error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to generate operating model',
        details: error.stack,
      },
      { status: 500 }
    );
  }
}
