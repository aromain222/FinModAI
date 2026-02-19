import { NextResponse } from 'next/server';
import { calculateCompsFromData, type CompsInputCompany } from '@/lib/compsCalculator';
import { fetchCompsCompany } from '@/lib/compsIngestion';

const MAX_SYMBOLS = 20;

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
    const message = (err as Error)?.message || 'COMPS_FAILED';
    const status = message.includes('required') || message.includes('missing') || message.includes('No valid peers') || message.includes('Limited peer coverage')
      ? 422
      : 500;
    return NextResponse.json({ ok: false, error: 'COMPS_FAILED', message }, { status });
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
    .filter((company): company is CompsInputCompany => Boolean(company));

  if (!targetEntry?.company) {
    throw new Error('Failed to build target company');
  }

  if (comps.length === 0) {
    throw new Error('No comparable companies succeeded');
  }

  const compsModel = calculateCompsFromData(
    targetEntry.company,
    comps,
    { method: 'median', includeMean: true, includeMinMax: true }
  );
  return {
    model: compsModel,
    failures: rawData.filter((entry) => !entry.ok).map((entry) => ({ symbol: entry.symbol, error: entry.error })),
  };
}

type FetchResult = {
  symbol: string;
  ok: boolean;
  company?: CompsInputCompany;
  error?: string;
};

async function fetchCompsDataForSymbols(symbols: string[]): Promise<FetchResult[]> {
  const tasks = symbols.map(async (symbol) => {
    try {
      const company = await fetchCompsCompany(symbol);
      const companyInput: CompsInputCompany = {
        ticker: company.ticker,
        name: company.companyName ?? company.ticker,
        marketCap: Number.isFinite(company.marketCap) ? company.marketCap : null,
        price: Number.isFinite(company.sharePrice) ? company.sharePrice : null,
        sharesOutstanding: Number.isFinite(company.sharesOutstanding) ? company.sharesOutstanding : null,
        totalDebt: Number.isFinite(company.totalDebt) ? company.totalDebt : null,
        cash: Number.isFinite(company.cashAndEquivalents) ? company.cashAndEquivalents : null,
        revenue: Number.isFinite(company.revenueLTM) ? company.revenueLTM : null,
        ebitda: Number.isFinite(company.ebitdaLTM) ? company.ebitdaLTM : null,
        netIncome: Number.isFinite(company.netIncomeLTM) ? company.netIncomeLTM : null,
      };

      return { symbol, ok: true, company: companyInput };
    } catch (err) {
      console.error('[COMPS] Failed for symbol', symbol, err);
      return { symbol, ok: false, error: (err as Error).message };
    }
  });

  return Promise.all(tasks);
}
