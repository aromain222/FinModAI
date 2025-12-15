/**
 * Merger Model Excel Download API
 * 
 * Returns binary .xlsx buffer with correct headers.
 */

import { NextResponse } from 'next/server';
import { MergerModelInputSchema, getMissingMergerInputs } from '@/lib/models/merger/schema';
import { computeMergerModel } from '@/lib/models/merger/compute';
import { generateMergerWorkbook } from '@/lib/models/merger/excel';
import { getLTMFinancials } from '@/lib/getLTMFinancials';

export const runtime = 'nodejs';

function convertToCompanyFinancials(ltm: any, ticker: string): any {
  const cogs = ltm.revenue && ltm.ebitda ? 
    Math.max(0, ltm.revenue - ltm.ebitda - (ltm.revenue * 0.15)) : 
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
    interestExpense: 0,
    netIncome: ltm.netIncome || 0,
    sharesOutstanding: ltm.sharesOutstanding || 0,
    cash: ltm.cash || 0,
    debt: ltm.totalDebt || 0,
    price: ltm.price || 0,
    taxRate: 0.21,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Pull data for validation
    let buyerLTM = null;
    let targetLTM = null;
    try {
      if (body.buyerTicker) buyerLTM = await getLTMFinancials(body.buyerTicker);
    } catch (e) {}
    try {
      if (body.targetTicker) targetLTM = await getLTMFinancials(body.targetTicker);
    } catch (e) {}
    
    const pulledData = {
      buyer: buyerLTM ? { price: buyerLTM.price, shares: buyerLTM.sharesOutstanding, cash: buyerLTM.cash } : undefined,
      target: targetLTM ? { price: targetLTM.price, shares: targetLTM.sharesOutstanding, cash: targetLTM.cash, debt: targetLTM.totalDebt } : undefined,
    };
    
    // Validate inputs
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
    
    const input = parseResult.data;
    
    // Use already-pulled data or fetch
    if (!buyerLTM) buyerLTM = await getLTMFinancials(input.buyerTicker);
    const buyerFinancials = convertToCompanyFinancials(buyerLTM, input.buyerTicker);
    
    if (!targetLTM) targetLTM = await getLTMFinancials(input.targetTicker);
    const targetFinancials = convertToCompanyFinancials(targetLTM, input.targetTicker);
    
    // Compute model (will throw if invariants violated)
    let output;
    try {
      output = computeMergerModel(input, buyerFinancials, targetFinancials);
    } catch (computeError: any) {
      return NextResponse.json(
        {
          error: computeError.message || 'Model computation failed',
        },
        { status: 400 }
      );
    }
    
    // Generate Excel
    const workbook = await generateMergerWorkbook(
      input,
      output,
      buyerFinancials,
      targetFinancials
    );
    
    // Convert to buffer
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Return binary with correct headers
    const filename = `Merger_Model_${input.buyerTicker}_${input.targetTicker}_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('[merger download] Error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to generate merger model Excel',
      },
      { status: 500 }
    );
  }
}
