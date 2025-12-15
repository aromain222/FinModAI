/**
 * Operating Model Excel Download API
 * 
 * Returns binary .xlsx buffer with correct headers.
 */

import { NextResponse } from 'next/server';
import { OperatingModelInputSchema, getMissingOperatingInputs } from '@/lib/models/operating/schema';
import { computeOperatingModel } from '@/lib/models/operating/compute';
import { computeVariances } from '@/lib/models/operating/variance';
import { generateOperatingWorkbook } from '@/lib/models/operating/excel';

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
    
    const input = parseResult.data;
    
    // Compute model (will throw if invariants violated)
    let output;
    try {
      output = computeOperatingModel(input);
    } catch (computeError: any) {
      return NextResponse.json(
        {
          error: computeError.message || 'Model computation failed',
        },
        { status: 400 }
      );
    }
    
    // Compute variances (if actuals exist)
    let variance = null;
    try {
      variance = computeVariances(input, output);
    } catch (varianceError: any) {
      return NextResponse.json(
        {
          error: varianceError.message || 'Variance computation failed',
        },
        { status: 400 }
      );
    }
    
    // Generate Excel
    const workbook = await generateOperatingWorkbook(input, output, variance);
    
    // Convert to buffer
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Return binary with correct headers
    const filename = `Operating_Model_${input.startMonth}_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('[operating download] Error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to generate operating model Excel',
      },
      { status: 500 }
    );
  }
}
