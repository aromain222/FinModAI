import { NextResponse } from 'next/server';
import { buildCompsModel } from '@/lib/compsCalculator';
import type { CompanyFinancials, TargetCompany } from '@/types/compsModel';
import { getStockQuoteWithTimeout, withTimeout } from '@/lib/marketstack';
import { getLTMFinancials } from '@/lib/getLTMFinancials';
import { cleanAndScaleFinancials, type RawFinancials } from '@/lib/financials';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SYMBOLS = 20;
const DEFAULT_TIMEOUT_MS = 8000;

type CompsRequestBody = {
  symbols?: string[];
};

export async function POST(req: Request) {
  const start = Date.now();
  console.log('[COMPS] Route hit at', new Date(start).toISOString());

  try {
    const body: CompsRequestBody = await req.json();
    let symbols = Array.isArray(body.symbols) ? body.symbols : [];
    symbols = symbols.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean);

    if (symbols.length === 0) {
      return NextResponse.json({ ok: false, error: 'NO_SYMBOLS' }, { status: 400 });
    }

    if (symbols.length > MAX_SYMBOLS) {
      console.warn('[COMPS] Too many symbols, truncating', { originalLength: symbols.length });
      symbols = symbols.slice(0, MAX_SYMBOLS);
    }

    const modelResult = await runCompsModel(symbols);
    console.log('[COMPS] Completed in', Date.now() - start, 'ms');

    return NextResponse.json({ ok: true, result: modelResult });
  } catch (err) {
    console.error('[COMPS] Error:', err);
    return NextResponse.json({ ok: false, error: 'COMPS_FAILED' }, { status: 500 });
  }
}

async function runCompsModel(symbols: string[]) {
  const rawData = await fetchCompsDataForSymbols(symbols);
  const successes = rawData.filter((item) => item.ok && item.company);
  if (successes.length === 0) {
    throw new Error('No symbols returned valid financial data');
  }

  const symbolOrder = new Map(symbols.map((symbol, index) => [symbol, index]));
  successes.sort((a, b) => {
    const orderA = symbolOrder.get(a.symbol) ?? Number.MAX_SAFE_INTEGER;
    const orderB = symbolOrder.get(b.symbol) ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });

  const targetSymbol = symbols[0];
  let targetEntry = successes.find((entry) => entry.symbol === targetSymbol);
  if (!targetEntry) {
    targetEntry = successes[0];
  }

  const comps = successes
    .filter((entry) => entry !== targetEntry)
    .map((entry) => entry.company!)
    .filter((company): company is CompanyFinancials => Boolean(company));

  if (!targetEntry?.company) {
    throw new Error('Failed to build target company');
  }

  if (comps.length === 0) {
    throw new Error('No comparable companies succeeded');
  }

  const targetCompany = toTargetCompany(targetEntry.company);
  const compsModel = buildCompsModel(targetCompany, comps);
  return {
    model: compsModel,
    failures: rawData.filter((entry) => !entry.ok).map((entry) => ({ symbol: entry.symbol, error: entry.error })),
  };
}

type FetchResult = {
  symbol: string;
  ok: boolean;
  company?: CompanyFinancials;
  error?: string;
};

async function fetchCompsDataForSymbols(symbols: string[]): Promise<FetchResult[]> {
  const tasks = symbols.map(async (symbol) => {
    try {
      const [quote, fundamentals] = await Promise.all([
        getStockQuoteWithTimeout(symbol, DEFAULT_TIMEOUT_MS),
        getFundamentalsWithTimeout(symbol, DEFAULT_TIMEOUT_MS),
      ]);

      const latestPrice = Number(quote?.close ?? quote?.last ?? quote?.price ?? fundamentals.price ?? 0);
      const company = mapFundamentalsToCompanyFinancials(fundamentals, latestPrice);
      return { symbol, ok: true, company };
    } catch (err) {
      console.error('[COMPS] Failed for symbol', symbol, err);
      return { symbol, ok: false, error: (err as Error).message };
    }
  });

  return Promise.all(tasks);
}

async function getFundamentalsWithTimeout(symbol: string, ms: number) {
  return withTimeout(getLTMFinancials(symbol), ms, `getFundamentals(${symbol})`);
}

function mapFundamentalsToCompanyFinancials(
  ltmData: Awaited<ReturnType<typeof getLTMFinancials>>,
  latestPrice: number
): CompanyFinancials {
  const fallbackNetDebt =
    typeof ltmData.totalDebt === 'number' && typeof ltmData.cash === 'number'
      ? ltmData.totalDebt - ltmData.cash
      : 0;

  const raw: RawFinancials = {
    revenue: (ltmData.revenue ?? 0) * 1_000_000,
    ebitda: (ltmData.ebitda ?? 0) * 1_000_000,
    ebit: (ltmData.ebit ?? 0) * 1_000_000,
    freeCashFlow: (ltmData.netIncome ?? 0) * 1_000_000,
    netDebt: (ltmData.netDebt ?? fallbackNetDebt ?? 0) * 1_000_000,
    sharesOutstanding: (ltmData.sharesOutstanding ?? 0) * 1_000_000,
    marketCap: (ltmData.marketCap ?? 0) * 1_000_000,
  };

  const normalized = cleanAndScaleFinancials(raw);
  const price = Number.isFinite(latestPrice) && latestPrice > 0 ? latestPrice : ltmData.price ?? 0;
  const shares = normalized.sharesOutstandingM || 0;
  const marketCap = normalized.marketCapM ?? (shares > 0 ? price * shares : ltmData.marketCap ?? 0);
  const netDebt = normalized.netDebtM;
  const enterpriseValue = marketCap + netDebt;
  const netIncome = ltmData.netIncome ?? normalized.fcfM;

  return {
    name: ltmData.companyName,
    ticker: ltmData.ticker,
    marketCap,
    enterpriseValue,
    revenue: normalized.revenueM,
    ebitda: normalized.ebitdaM,
    ebit: normalized.ebitM,
    netIncome,
    shares,
    price,
    netDebt,
    evToRevenue: normalized.revenueM > 0 ? enterpriseValue / normalized.revenueM : 0,
    evToEbitda: normalized.ebitdaM > 0 ? enterpriseValue / normalized.ebitdaM : 0,
    evToEbit: normalized.ebitM > 0 ? enterpriseValue / normalized.ebitM : 0,
    pe: netIncome > 0 ? marketCap / netIncome : 0,
    source: 'auto',
  };
}

function toTargetCompany(company: CompanyFinancials): TargetCompany {
  return {
    ticker: company.ticker,
    name: company.name,
    revenue: company.revenue,
    ebitda: company.ebitda,
    ebit: company.ebit,
    netIncome: company.netIncome,
    shares: company.shares,
    netDebt: company.netDebt,
    price: company.price,
  };
}
