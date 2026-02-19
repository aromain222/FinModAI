/**
 * Merger Model Excel Download API
 * 
 * Returns binary .xlsx buffer with correct headers.
 */

import { NextResponse } from 'next/server';
import { MergerModelInputSchema, getMissingMergerInputs } from '@/lib/models/merger/schema';
import { generateMergerWorkbook } from '@/lib/models/merger/excel';
import { getLTMFinancials } from '@/lib/getLTMFinancials';
import { isDemoMode } from '@/lib/demo/isDemoMode';
import { isDemoTickerAvailable } from '@/lib/data/providers/demoProvider';

export const runtime = 'nodejs';

function derivePriceFromMarketCap(ltm: any): number {
  const marketCap = typeof ltm?.marketCap === 'number' ? ltm.marketCap : null;
  const shares = typeof ltm?.sharesOutstanding === 'number' ? ltm.sharesOutstanding : null;
  if (!marketCap || !shares || shares <= 0) return 0;
  return marketCap / shares;
}

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
    price: derivePriceFromMarketCap(ltm),
    taxRate: 0.21,
  };
}

function toMergerWorkbookInputs(input: any, buyerTicker: string, buyerLTM: any, targetLTM: any) {
  const buyerPrice = derivePriceFromMarketCap(buyerLTM);
  const targetPrice = derivePriceFromMarketCap(targetLTM);
  const buyerMarketCap =
    buyerLTM?.marketCap ??
    (buyerPrice > 0 && buyerLTM?.sharesOutstanding ? buyerPrice * buyerLTM.sharesOutstanding : undefined);
  const targetMarketCap =
    targetLTM?.marketCap ??
    (targetPrice > 0 && targetLTM?.sharesOutstanding ? targetPrice * targetLTM.sharesOutstanding : undefined);

  return {
    acquirerTicker: buyerTicker,
    acquirerName: buyerLTM?.companyName,
    acquirerRevenue: buyerLTM?.revenue,
    acquirerEBITDA: buyerLTM?.ebitda,
    acquirerEBIT: buyerLTM?.operatingIncome,
    acquirerNetIncome: buyerLTM?.netIncome,
    acquirerShares: buyerLTM?.sharesOutstanding,
    acquirerMarketCap: buyerMarketCap,
    acquirerPrice: buyerPrice || undefined,

    targetTicker: input.targetTicker,
    targetName: targetLTM?.companyName,
    targetRevenue: targetLTM?.revenue,
    targetEBITDA: targetLTM?.ebitda,
    targetEBIT: targetLTM?.operatingIncome,
    targetNetIncome: targetLTM?.netIncome,
    targetShares: targetLTM?.sharesOutstanding,
    targetMarketCap: targetMarketCap,
    targetPrice: targetPrice || undefined,

    purchasePrice: input.purchasePrice,
    offerPrice: input.offerPrice,
    dealValue: input.dealValue || input.purchasePrice,
    cashPct: input.cashPct,
    stockPct: input.stockPct,
    debtPct: input.debtPct,
    exchangeRatio: input.exchangeRatio,
    newDebt: input.newDebt,
    newDebtRate: input.newDebtRate,
    synergies: input.synergies,
    integrationCosts: input.integrationCosts,
    oneTimeCosts: input.oneTimeCosts,
    taxRate: input.taxRate,
  };
}

export async function POST(req: Request) {
  try {
    if (!isDemoMode()) {
      return NextResponse.json(
        { error: 'Demo mode is required.' },
        { status: 400 }
      );
    }
    const body = await req.json();
    
    // Pull data for validation
    // Support both buyerTicker and acquirerTicker
    const buyerTickerRaw = body.acquirerTicker || body.buyerTicker;
    
    let buyerLTM = null;
    let targetLTM = null;
    if (buyerTickerRaw) {
      const demoAllowed = await isDemoTickerAvailable(buyerTickerRaw);
      if (!demoAllowed) {
        return NextResponse.json(
          { error: 'This demo ticker is not in the curated demo set. Choose a demo company.' },
          { status: 400 }
        );
      }
    }
    if (body.targetTicker) {
      const demoAllowed = await isDemoTickerAvailable(body.targetTicker);
      if (!demoAllowed) {
        return NextResponse.json(
          { error: 'This demo ticker is not in the curated demo set. Choose a demo company.' },
          { status: 400 }
        );
      }
    }
    try {
      if (buyerTickerRaw) buyerLTM = await getLTMFinancials(buyerTickerRaw);
    } catch (e) {}
    try {
      if (body.targetTicker) targetLTM = await getLTMFinancials(body.targetTicker);
    } catch (e) {}
    
    const pulledData = {
      buyer: buyerLTM
        ? {
            price: derivePriceFromMarketCap(buyerLTM),
            shares: buyerLTM.sharesOutstanding,
            cash: buyerLTM.cash,
          }
        : undefined,
      target: targetLTM
        ? {
            price: derivePriceFromMarketCap(targetLTM),
            shares: targetLTM.sharesOutstanding,
            cash: targetLTM.cash,
            debt: targetLTM.totalDebt,
          }
        : undefined,
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
    
    // Normalize field names: support both buyerTicker and acquirerTicker
    const buyerTicker = input.acquirerTicker || (input as any).buyerTicker;
    if (!buyerTicker) {
      return NextResponse.json(
        { error: 'acquirerTicker or buyerTicker is required' },
        { status: 400 }
      );
    }
    
    // Use already-pulled data or fetch
    if (!buyerLTM) buyerLTM = await getLTMFinancials(buyerTicker);
    if (!targetLTM) targetLTM = await getLTMFinancials(input.targetTicker);

    // Generate Excel (excel layer computes the model from inputs)
    const workbookInputs = toMergerWorkbookInputs(input, buyerTicker, buyerLTM, targetLTM);
    const workbook = await generateMergerWorkbook(workbookInputs);
    
    // Convert to buffer
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Return binary with correct headers
    const filename = `Merger_Model_${buyerTicker}_${input.targetTicker}_${new Date().toISOString().split('T')[0]}.xlsx`;
    
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
