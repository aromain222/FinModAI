/**
 * Financial Data Fetcher with OpenAI Fallback
 * 
 * Fetches company financials from APIs, with intelligent
 * OpenAI-powered estimation for missing data.
 */

import OpenAI from 'openai';
import type {
  CompanyFinancials,
  PartialCompanyFinancials,
  FinancialEnrichmentRequest,
} from '@/types/compsModel';
import { cleanAndScaleFinancials, type RawFinancials } from '@/lib/financials';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const FINANCIAL_ENRICHMENT_PROMPT = `You are a financial data analyst filling in missing company financial metrics.

Given partial financial data for a public company, estimate missing values using:
- Peer company medians (if provided)
- Typical industry margins and ratios
- Company size and business model
- Logical relationships between metrics

Rules for estimation:
- Enterprise Value = Market Cap + Net Debt
- EBITDA typically 10-30% of revenue (varies by sector)
- EBIT = EBITDA - D&A (D&A typically 2-5% of revenue)
- Net Income = EBIT × (1 - tax rate), tax rate ~21%
- Net Debt = Total Debt - Cash (typically 0-2x EBITDA)
- Shares Outstanding: estimate from Market Cap / Price if needed
- Price: estimate from Market Cap / Shares if needed

Return complete financial data with NO null values.
Mark which fields were estimated in the "aiEstimated" array.

Return valid JSON matching this structure:
{
  "name": "Company Name",
  "ticker": "TICKER",
  "marketCap": 1000,
  "enterpriseValue": 1200,
  "revenue": 5000,
  "ebitda": 1000,
  "ebit": 900,
  "netIncome": 700,
  "shares": 100,
  "price": 10,
  "netDebt": 200,
  "aiEstimated": ["field1", "field2"]
}`;

/**
 * Fetch company financials using centralized LTM fetcher
 */
export async function fetchCompanyFinancials(
  ticker: string,
  source: 'auto' | 'custom'
): Promise<PartialCompanyFinancials> {
  try {
    console.log(`[fetchCompanyFinancials] Fetching data for ${ticker}`);

    // Use centralized LTM financials fetcher
    const { getLTMFinancials } = await import('@/lib/getLTMFinancials');
    const ltmData = await getLTMFinancials(ticker);

    console.log(`[fetchCompanyFinancials] ✅ Got data for ${ticker} from ${ltmData.dataSource}`);

    const raw: RawFinancials = {
      revenue: (ltmData.revenue ?? 0) * 1_000_000,
      ebitda: (ltmData.ebitda ?? 0) * 1_000_000,
      ebit: (ltmData.ebit ?? 0) * 1_000_000,
      freeCashFlow: (ltmData.netIncome ?? 0) * 1_000_000,
      netDebt: (ltmData.netDebt ?? 0) * 1_000_000,
      sharesOutstanding: (ltmData.sharesOutstanding ?? 0) * 1_000_000,
      marketCap: (ltmData.marketCap ?? 0) * 1_000_000,
    };
    const normalized = cleanAndScaleFinancials(raw);

    return {
      ticker: ltmData.ticker,
      name: ltmData.companyName,
      source,
      marketCap: normalized.marketCapM ?? ltmData.marketCap,
      enterpriseValue: normalized.marketCapM !== undefined ? normalized.marketCapM + normalized.netDebtM : ltmData.enterpriseValue,
      revenue: normalized.revenueM,
      ebitda: normalized.ebitdaM,
      ebit: normalized.ebitM,
      netIncome: ltmData.netIncome,
      shares: normalized.sharesOutstandingM,
      price: ltmData.price,
      cash: ltmData.cash ?? 0,
      netDebt: normalized.netDebtM,
    };

  } catch (error) {
    console.error(`[fetchCompanyFinancials] ❌ Failed to fetch ${ticker}:`, error);
    
    // Even on error, use fallback
    const { getLTMFinancials } = await import('@/lib/getLTMFinancials');
    const fallbackData = await getLTMFinancials(ticker);
    
    const raw: RawFinancials = {
      revenue: (fallbackData.revenue ?? 0) * 1_000_000,
      ebitda: (fallbackData.ebitda ?? 0) * 1_000_000,
      ebit: (fallbackData.ebit ?? 0) * 1_000_000,
      freeCashFlow: (fallbackData.netIncome ?? 0) * 1_000_000,
      netDebt: (fallbackData.netDebt ?? 0) * 1_000_000,
      sharesOutstanding: (fallbackData.sharesOutstanding ?? 0) * 1_000_000,
      marketCap: (fallbackData.marketCap ?? 0) * 1_000_000,
    };
    const normalized = cleanAndScaleFinancials(raw);

    return {
      ticker: fallbackData.ticker,
      name: fallbackData.companyName,
      source,
      marketCap: normalized.marketCapM ?? fallbackData.marketCap,
      enterpriseValue: normalized.marketCapM !== undefined ? normalized.marketCapM + normalized.netDebtM : fallbackData.enterpriseValue,
      revenue: normalized.revenueM,
      ebitda: normalized.ebitdaM,
      ebit: normalized.ebitM,
      netIncome: fallbackData.netIncome,
      shares: normalized.sharesOutstandingM,
      price: fallbackData.price,
      cash: fallbackData.cash ?? 0,
      netDebt: normalized.netDebtM,
    };
  }
}

/**
 * Enrich partial financials using OpenAI
 */
export async function enrichFinancials(
  request: FinancialEnrichmentRequest
): Promise<CompanyFinancials> {
  try {
    console.log(`[enrichFinancials] Enriching data for ${request.ticker}`);

    const userMessage = JSON.stringify({
      ticker: request.ticker,
      companyName: request.companyName || request.ticker,
      sector: request.sector || 'Unknown',
      partialFinancials: request.partialFinancials,
      peerMedians: request.peerMedians || {},
      instructions: 'Fill in all missing financial metrics with realistic estimates based on available data and peer medians.',
    }, null, 2);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: FINANCIAL_ENRICHMENT_PROMPT },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1000,
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('OpenAI returned empty response');
    }

    const enriched = JSON.parse(responseText);

    // Compute multiples
    const evToRevenue = enriched.revenue > 0 ? enriched.enterpriseValue / enriched.revenue : 0;
    const evToEbitda = enriched.ebitda > 0 ? enriched.enterpriseValue / enriched.ebitda : 0;
    const evToEbit = enriched.ebit > 0 ? enriched.enterpriseValue / enriched.ebit : 0;
    const pe = enriched.netIncome > 0 ? enriched.marketCap / enriched.netIncome : 0;

    const result: CompanyFinancials = {
      name: enriched.name || `${request.ticker} Inc.`,
      ticker: request.ticker,
      marketCap: enriched.marketCap,
      enterpriseValue: enriched.enterpriseValue,
      revenue: enriched.revenue,
      ebitda: enriched.ebitda,
      ebit: enriched.ebit,
      netIncome: enriched.netIncome,
      shares: enriched.shares,
      price: enriched.price,
      netDebt: enriched.netDebt,
      evToRevenue,
      evToEbitda,
      evToEbit,
      pe,
      source: request.partialFinancials.source,
      aiEstimated: enriched.aiEstimated || [],
    };

    console.log(`[enrichFinancials] Enriched ${request.ticker}, AI estimated: ${result.aiEstimated?.join(', ') || 'none'}`);

    return result;

  } catch (error) {
    console.error(`[enrichFinancials] Failed to enrich ${request.ticker}:`, error);
    
    // Return fallback with defaults
    return await buildFallbackFinancials(request.partialFinancials, request.peerMedians);
  }
}

/**
 * Build fallback financials when OpenAI fails
 * Now uses centralized getLTMFinancials for consistency
 */
async function buildFallbackFinancials(
  partial: PartialCompanyFinancials,
  peerMedians?: any
): Promise<CompanyFinancials> {
  console.log(`[buildFallbackFinancials] Building fallback for ${partial.ticker}`);
  
  // Use centralized system if we have no data at all
  if (!partial.revenue || partial.revenue === 0) {
    const { getLTMFinancials } = await import('@/lib/getLTMFinancials');
    const ltmData = await getLTMFinancials(partial.ticker);
    
    return {
      name: ltmData.companyName,
      ticker: ltmData.ticker,
      marketCap: ltmData.marketCap,
      enterpriseValue: ltmData.enterpriseValue,
      revenue: ltmData.revenue,
      ebitda: ltmData.ebitda,
      ebit: ltmData.ebit,
      netIncome: ltmData.netIncome,
      shares: ltmData.sharesOutstanding,
      price: ltmData.price,
      netDebt: ltmData.netDebt,
      evToRevenue: ltmData.enterpriseValue / ltmData.revenue,
      evToEbitda: ltmData.enterpriseValue / ltmData.ebitda,
      evToEbit: ltmData.enterpriseValue / ltmData.ebit,
      pe: ltmData.marketCap / ltmData.netIncome,
      source: partial.source,
      aiEstimated: ltmData.estimatedFields,
    };
  }
  
  // We have some data - fill gaps intelligently
  const revenue = partial.revenue;
  const ebitda = partial.ebitda || revenue * 0.20;
  const ebit = partial.ebit || ebitda * 0.90;
  const netIncome = partial.netIncome || ebit * 0.79;
  const marketCap = partial.marketCap || peerMedians?.marketCap || netIncome * 20;
  const netDebt = partial.netDebt !== null && partial.netDebt !== undefined ? partial.netDebt : ebitda * 1.5;
  const enterpriseValue = partial.enterpriseValue || marketCap + netDebt;
  const shares = partial.shares || 100;
  const price = partial.price || marketCap / shares;

  const aiEstimated: string[] = [];
  if (!partial.ebitda) aiEstimated.push('ebitda');
  if (!partial.ebit) aiEstimated.push('ebit');
  if (!partial.netIncome) aiEstimated.push('netIncome');
  if (!partial.marketCap) aiEstimated.push('marketCap');
  if (partial.netDebt === null || partial.netDebt === undefined) aiEstimated.push('netDebt');
  if (!partial.enterpriseValue) aiEstimated.push('enterpriseValue');

  return {
    name: partial.name || `${partial.ticker} Inc.`,
    ticker: partial.ticker,
    marketCap,
    enterpriseValue,
    revenue,
    ebitda,
    ebit,
    netIncome,
    shares,
    price,
    netDebt,
    evToRevenue: revenue > 0 ? enterpriseValue / revenue : 0,
    evToEbitda: ebitda > 0 ? enterpriseValue / ebitda : 0,
    evToEbit: ebit > 0 ? enterpriseValue / ebit : 0,
    pe: netIncome > 0 ? marketCap / netIncome : 0,
    source: partial.source,
    aiEstimated,
  };
}

/**
 * Fetch and enrich financials for multiple companies
 */
export async function fetchAndEnrichBatch(
  tickers: { ticker: string; source: 'auto' | 'custom' }[],
  sector?: string
): Promise<CompanyFinancials[]> {
  console.log(`[fetchAndEnrichBatch] Processing ${tickers.length} companies`);

  const results: CompanyFinancials[] = [];

  // Fetch all partial data first with Promise.allSettled for resilience
  const partialDataResults = await Promise.allSettled(
    tickers.map(t => 
      fetchCompanyFinancials(t.ticker, t.source).catch((err) => {
        console.warn(`[fetchAndEnrichBatch] Failed to fetch ${t.ticker}:`, err);
        // Return minimal partial data
        return {
          ticker: t.ticker,
          name: t.ticker,
          source: t.source,
          marketCap: undefined,
          enterpriseValue: undefined,
          revenue: undefined,
          ebitda: undefined,
          ebit: undefined,
          netIncome: undefined,
          shares: undefined,
          price: undefined,
          cash: undefined,
          netDebt: undefined,
        } as PartialCompanyFinancials;
      })
    )
  );
  
  const partialData = partialDataResults.map((result, idx) => 
    result.status === 'fulfilled' ? result.value : {
      ticker: tickers[idx].ticker,
      name: tickers[idx].ticker,
      source: tickers[idx].source,
      marketCap: undefined,
      enterpriseValue: undefined,
      revenue: undefined,
      ebitda: undefined,
      ebit: undefined,
      netIncome: undefined,
      shares: undefined,
      price: undefined,
      cash: undefined,
      netDebt: undefined,
    } as PartialCompanyFinancials
  );

  // Calculate peer medians for enrichment context
  const peerMedians = calculatePeerMedians(partialData);

  // Enrich each company
  for (const partial of partialData) {
    const enriched = await enrichFinancials({
      ticker: partial.ticker,
      sector,
      partialFinancials: partial,
      peerMedians,
    });
    results.push(enriched);
  }

  console.log(`[fetchAndEnrichBatch] Completed ${results.length} companies`);

  return results;
}

/**
 * Calculate peer medians from partial data
 */
function calculatePeerMedians(partialData: PartialCompanyFinancials[]): any {
  const revenues = partialData.map(d => d.revenue).filter(v => v !== null && v !== undefined) as number[];
  const marketCaps = partialData.map(d => d.marketCap).filter(v => v !== null && v !== undefined) as number[];
  const ebitdas = partialData.map(d => d.ebitda).filter(v => v !== null && v !== undefined) as number[];

  return {
    revenue: revenues.length > 0 ? median(revenues) : undefined,
    marketCap: marketCaps.length > 0 ? median(marketCaps) : undefined,
    ebitda: ebitdas.length > 0 ? median(ebitdas) : undefined,
  };
}

/**
 * Calculate median of array
 */
function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
