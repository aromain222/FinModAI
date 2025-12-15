/**
 * Diagnostics API - Data Pipeline Testing
 * 
 * GET /api/diagnostics/engines?ticker=AAPL&modelType=dcf
 * 
 * Tests the entire data pipeline:
 * 1. External providers (Polygon, Finnhub, FMP)
 * 2. Fallback engine
 * 3. OpenAI enrichment
 * 4. Sanitization
 * 
 * Returns detailed diagnostics for debugging
 */

import { NextRequest, NextResponse } from 'next/server';
import type { ProviderLTMResult } from '@/lib/data/providers';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const ticker = searchParams.get('ticker')?.trim().toUpperCase();
  const modelType = searchParams.get('modelType') || 'dcf';
  
  if (!ticker) {
    return NextResponse.json(
      { error: 'Missing ticker parameter' },
      { status: 400 }
    );
  }
  
  console.log(`[Diagnostics] Testing pipeline for ${ticker}`);
  
  const results: any = {
    ticker,
    modelType,
    timestamp: new Date().toISOString(),
    providers: [],
    fallback: null,
    enrichment: null,
    sanitization: null,
  };
  
  // Test each provider
  try {
    const { fetchFromPolygon, fetchFromFinnhub, fetchFromFMP } = await import('@/lib/data/providers');
    
    // Test Polygon
    const polygonStart = Date.now();
    const polygonResult = await fetchFromPolygon(ticker);
    const polygonDuration = Date.now() - polygonStart;
    
    results.providers.push({
      provider: 'polygon',
      ok: polygonResult.ok,
      status: polygonResult.status,
      reason: polygonResult.reason,
      durationMs: polygonDuration,
      data: polygonResult.ok ? {
        revenueMillions: polygonResult.revenueMillions,
        ebitdaMillions: polygonResult.ebitdaMillions,
        marketCapMillions: polygonResult.marketCapMillions,
        sharesOutstandingMillions: polygonResult.sharesOutstandingMillions,
        companyName: polygonResult.companyName,
      } : null,
    });
    
    // Test Finnhub
    const finnhubStart = Date.now();
    const finnhubResult = await fetchFromFinnhub(ticker);
    const finnhubDuration = Date.now() - finnhubStart;
    
    results.providers.push({
      provider: 'finnhub',
      ok: finnhubResult.ok,
      status: finnhubResult.status,
      reason: finnhubResult.reason,
      durationMs: finnhubDuration,
      data: finnhubResult.ok ? {
        revenueMillions: finnhubResult.revenueMillions,
        ebitdaMillions: finnhubResult.ebitdaMillions,
        marketCapMillions: finnhubResult.marketCapMillions,
        sharesOutstandingMillions: finnhubResult.sharesOutstandingMillions,
        companyName: finnhubResult.companyName,
      } : null,
    });
    
    // Test FMP
    const fmpStart = Date.now();
    const fmpResult = await fetchFromFMP(ticker);
    const fmpDuration = Date.now() - fmpStart;
    
    results.providers.push({
      provider: 'fmp',
      ok: fmpResult.ok,
      status: fmpResult.status,
      reason: fmpResult.reason,
      durationMs: fmpDuration,
      data: fmpResult.ok ? {
        revenueMillions: fmpResult.revenueMillions,
        ebitdaMillions: fmpResult.ebitdaMillions,
        marketCapMillions: fmpResult.marketCapMillions,
        sharesOutstandingMillions: fmpResult.sharesOutstandingMillions,
        companyName: fmpResult.companyName,
      } : null,
    });
    
  } catch (error) {
    results.providers.push({
      provider: 'all',
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
  
  // Test fallback engine
  try {
    const { getLTMFinancials } = await import('@/lib/getLTMFinancials');
    
    const fallbackStart = Date.now();
    const ltmFinancials = await getLTMFinancials(ticker);
    const fallbackDuration = Date.now() - fallbackStart;
    
    results.fallback = {
      ok: true,
      durationMs: fallbackDuration,
      dataSource: ltmFinancials.dataSource,
      data: {
        revenue: ltmFinancials.revenue,
        ebitda: ltmFinancials.ebitda,
        ebit: ltmFinancials.ebit,
        netIncome: ltmFinancials.netIncome,
        marketCap: ltmFinancials.marketCap,
        sharesOutstanding: ltmFinancials.sharesOutstanding,
        price: ltmFinancials.price,
        estimatedFields: ltmFinancials.estimatedFields,
      },
    };
  } catch (error) {
    results.fallback = {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
  
  // Test enrichment (without calling OpenAI - just build fallback assumptions)
  try {
    const { buildFallbackEstimates } = await import('@/lib/fallbackEngine');
    const { getSector } = await import('@/lib/sectorMapping');
    
    const sector = getSector(ticker);
    const enrichmentStart = Date.now();
    
    const fallbackAssumptions = buildFallbackEstimates({
      sector,
      forecastYears: 5,
      revenueHistory: undefined,
      marginHistory: undefined,
      peerMetrics: undefined,
      ltmEbitdaForDebt: 1000,
      blendedCostOfDebt: 0.07,
    });
    
    const enrichmentDuration = Date.now() - enrichmentStart;
    
    results.enrichment = {
      ok: true,
      durationMs: enrichmentDuration,
      sector,
      assumptions: {
        revenueCAGR: fallbackAssumptions.revenue.cagrUsed,
        ebitdaMargin: fallbackAssumptions.ebitdaMargin.ebitdaMargin,
        capexPctRevenue: fallbackAssumptions.capexPctRevenue,
        workingCapital: fallbackAssumptions.workingCapital,
        debtCapacity: {
          chosenDebt: fallbackAssumptions.debtCapacity.chosenDebt,
          impliedLeverage: fallbackAssumptions.debtCapacity.impliedNetLeverage,
        },
      },
    };
  } catch (error) {
    results.enrichment = {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
  
  // Test sanitization
  try {
    const { sanitizeAssumptions, formatSanitizationLog } = await import('@/lib/sanitizeAssumptions');
    
    const testAssumptions = {
      ticker,
      revenue: [1000, 1100, 1210, 1331, 1464],
      revenueGrowth: [0.10, 0.10, 0.10, 0.10, 0.10],
      cogsPct: [0.65, 0.64, 0.63, 0.62, 0.61],
      opexPct: [0.15, 0.15, 0.14, 0.14, 0.13],
      daPct: [0.03, 0.03, 0.03, 0.03, 0.03],
      taxRate: 0.21,
      interestRate: 0.05,
      capexPctRevenue: [0.04, 0.04, 0.03, 0.03, 0.03],
      arDays: 45,
      inventoryDays: 60,
      apDays: 30,
      debt: 500,
      startingCash: 100,
      sharesOutstanding: 100,
    };
    
    const sanitizationStart = Date.now();
    const sanitizationResult = sanitizeAssumptions(testAssumptions);
    const sanitizationDuration = Date.now() - sanitizationStart;
    
    results.sanitization = {
      ok: true,
      durationMs: sanitizationDuration,
      errors: sanitizationResult.errors,
      warnings: sanitizationResult.warnings,
      log: formatSanitizationLog(sanitizationResult),
    };
  } catch (error) {
    results.sanitization = {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
  
  // Summary
  const providerSuccess = results.providers.filter((p: any) => p.ok).length;
  const allFailed = providerSuccess === 0;
  
  results.summary = {
    providersWorking: providerSuccess,
    providersTotal: results.providers.length,
    fallbackWorking: results.fallback?.ok || false,
    enrichmentWorking: results.enrichment?.ok || false,
    sanitizationWorking: results.sanitization?.ok || false,
    status: allFailed && !results.fallback?.ok ? 'CRITICAL' : allFailed ? 'DEGRADED' : 'HEALTHY',
  };
  
  console.log(`[Diagnostics] ${ticker} status: ${results.summary.status}`);
  
  return NextResponse.json(results, { status: 200 });
}

