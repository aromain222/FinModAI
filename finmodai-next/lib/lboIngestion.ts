import { rateLimitedFetch } from './apiClient';

export type LboIngestionResult = {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  industry: string | null;
  marketData: {
    sharePrice: number | null;
    marketCap: number | null; // USD millions
    sharesOutstanding: number | null; // raw shares
  };
  operatingHistory: {
    revenueLTM: number | null; // USD millions
    ebitdaLTM: number | null; // USD millions
    ebit: number | null; // USD millions
    netIncome: number | null; // USD millions
    depreciationAmortization: number | null; // USD millions
    capex: number | null; // USD millions
    deltaNWC: number | null; // USD millions
  };
  balanceSheet: {
    cash: number | null; // USD millions
    totalDebt: number | null; // USD millions
    netDebt: number | null; // USD millions
    equity: number | null; // USD millions
  };
  historicalRatios: {
    revenueGrowth: number | null;
    ebitdaMargin: number | null;
    capexPercentRevenue: number | null;
    deltaNWCPercentRevenue: number | null;
  };
  metadata: {
    source: string;
    period: string | null;
  };
};

type PartialLboData = Partial<LboIngestionResult> & {
  metadata?: {
    period?: string | null;
  };
  _revenuePrior?: number | null;
};

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const toMillions = (value: unknown): number | null => {
  const num = toNumber(value);
  return num === null ? null : num / 1_000_000;
};

const mergeString = (current: string | null, incoming: string | null): string | null =>
  current || !incoming ? current : incoming;

const mergeNumber = (current: number | null, incoming: number | null): number | null =>
  current !== null && current !== undefined ? current : incoming ?? null;

export function mapLboIngestionToLtmFinancials(facts: LboIngestionResult) {
  const toActual = (value: number | null): number | undefined =>
    value === null || value === undefined ? undefined : value * 1_000_000;

  return {
    ticker: facts.ticker,
    companyName: facts.companyName ?? undefined,
    sector: facts.sector ?? undefined,
    industry: facts.industry ?? undefined,
    revenue: toActual(facts.operatingHistory.revenueLTM) ?? 0,
    ebitda: toActual(facts.operatingHistory.ebitdaLTM),
    operatingIncome: toActual(facts.operatingHistory.ebit),
    ebit: toActual(facts.operatingHistory.ebit),
    netIncome: toActual(facts.operatingHistory.netIncome),
    cash: toActual(facts.balanceSheet.cash),
    totalDebt: toActual(facts.balanceSheet.totalDebt),
    totalEquity: toActual(facts.balanceSheet.equity),
    marketCap: toActual(facts.marketData.marketCap),
    sharesOutstanding: facts.marketData.sharesOutstanding ?? undefined,
    price: facts.marketData.sharePrice ?? undefined,
    dataSource: facts.metadata.source || 'LBO Ingestion',
    fiscalPeriod: facts.metadata.period ?? undefined,
    lastUpdated: new Date().toISOString(),
  };
}

export function hasLboIngestionData(facts: LboIngestionResult): boolean {
  return [
    facts.marketData.sharePrice,
    facts.marketData.marketCap,
    facts.marketData.sharesOutstanding,
    facts.operatingHistory.revenueLTM,
    facts.operatingHistory.ebitdaLTM,
    facts.operatingHistory.netIncome,
    facts.balanceSheet.totalDebt,
    facts.balanceSheet.cash,
  ].some((value) => value !== null && value !== undefined);
}

export async function fetchLboIngestion(ticker: string): Promise<LboIngestionResult> {
  const symbol = ticker.toUpperCase().trim();
  const sources = new Set<string>();

  const base: LboIngestionResult = {
    ticker: symbol,
    companyName: null,
    sector: null,
    industry: null,
    marketData: {
      sharePrice: null,
      marketCap: null,
      sharesOutstanding: null,
    },
    operatingHistory: {
      revenueLTM: null,
      ebitdaLTM: null,
      ebit: null,
      netIncome: null,
      depreciationAmortization: null,
      capex: null,
      deltaNWC: null,
    },
    balanceSheet: {
      cash: null,
      totalDebt: null,
      netDebt: null,
      equity: null,
    },
    historicalRatios: {
      revenueGrowth: null,
      ebitdaMargin: null,
      capexPercentRevenue: null,
      deltaNWCPercentRevenue: null,
    },
    metadata: {
      source: 'unknown',
      period: null,
    },
  };

  const applyPartial = (partial: PartialLboData | null, source: string) => {
    if (!partial) return;
    let used = false;
    base.companyName = mergeString(base.companyName, partial.companyName ?? null);
    base.sector = mergeString(base.sector, partial.sector ?? null);
    base.industry = mergeString(base.industry, partial.industry ?? null);

    const market = partial.marketData;
    if (market) {
      base.marketData.sharePrice = mergeNumber(base.marketData.sharePrice, market.sharePrice ?? null);
      base.marketData.marketCap = mergeNumber(base.marketData.marketCap, market.marketCap ?? null);
      base.marketData.sharesOutstanding = mergeNumber(base.marketData.sharesOutstanding, market.sharesOutstanding ?? null);
    }

    const operating = partial.operatingHistory;
    if (operating) {
      base.operatingHistory.revenueLTM = mergeNumber(base.operatingHistory.revenueLTM, operating.revenueLTM ?? null);
      base.operatingHistory.ebitdaLTM = mergeNumber(base.operatingHistory.ebitdaLTM, operating.ebitdaLTM ?? null);
      base.operatingHistory.ebit = mergeNumber(base.operatingHistory.ebit, operating.ebit ?? null);
      base.operatingHistory.netIncome = mergeNumber(base.operatingHistory.netIncome, operating.netIncome ?? null);
      base.operatingHistory.depreciationAmortization = mergeNumber(
        base.operatingHistory.depreciationAmortization,
        operating.depreciationAmortization ?? null
      );
      base.operatingHistory.capex = mergeNumber(base.operatingHistory.capex, operating.capex ?? null);
      base.operatingHistory.deltaNWC = mergeNumber(base.operatingHistory.deltaNWC, operating.deltaNWC ?? null);
    }

    const balance = partial.balanceSheet;
    if (balance) {
      base.balanceSheet.cash = mergeNumber(base.balanceSheet.cash, balance.cash ?? null);
      base.balanceSheet.totalDebt = mergeNumber(base.balanceSheet.totalDebt, balance.totalDebt ?? null);
      base.balanceSheet.equity = mergeNumber(base.balanceSheet.equity, balance.equity ?? null);
    }

    const ratios = partial.historicalRatios;
    if (ratios) {
      base.historicalRatios.revenueGrowth = mergeNumber(base.historicalRatios.revenueGrowth, ratios.revenueGrowth ?? null);
      base.historicalRatios.ebitdaMargin = mergeNumber(base.historicalRatios.ebitdaMargin, ratios.ebitdaMargin ?? null);
      base.historicalRatios.capexPercentRevenue = mergeNumber(
        base.historicalRatios.capexPercentRevenue,
        ratios.capexPercentRevenue ?? null
      );
      base.historicalRatios.deltaNWCPercentRevenue = mergeNumber(
        base.historicalRatios.deltaNWCPercentRevenue,
        ratios.deltaNWCPercentRevenue ?? null
      );
    }

    if (partial.metadata?.period && !base.metadata.period) {
      base.metadata.period = partial.metadata.period;
    }

    if (
      (partial.companyName ?? partial.sector ?? partial.industry) ||
      market ||
      operating ||
      balance ||
      ratios
    ) {
      used = true;
    }

    if (used) {
      sources.add(source);
    }
  };

  const fmp = await fetchFromFmp(symbol);
  applyPartial(fmp, 'FMP');

  const nasdaq = await fetchFromNasdaqFastTrack(symbol);
  applyPartial(nasdaq, nasdaq?._fastTrackSource || 'NASDAQ_DATA_LINK');

  const marketstack = await fetchFromMarketstack(symbol);
  applyPartial(marketstack, 'MARKETSTACK');

  // Derived metrics (mechanical only)
  if (
    base.balanceSheet.netDebt === null &&
    base.balanceSheet.totalDebt !== null &&
    base.balanceSheet.cash !== null
  ) {
    base.balanceSheet.netDebt = base.balanceSheet.totalDebt - base.balanceSheet.cash;
  }

  if (
    base.historicalRatios.ebitdaMargin === null &&
    base.operatingHistory.ebitdaLTM !== null &&
    base.operatingHistory.revenueLTM
  ) {
    base.historicalRatios.ebitdaMargin = base.operatingHistory.ebitdaLTM / base.operatingHistory.revenueLTM;
  }

  if (
    base.historicalRatios.capexPercentRevenue === null &&
    base.operatingHistory.capex !== null &&
    base.operatingHistory.revenueLTM
  ) {
    base.historicalRatios.capexPercentRevenue = base.operatingHistory.capex / base.operatingHistory.revenueLTM;
  }

  if (
    base.historicalRatios.deltaNWCPercentRevenue === null &&
    base.operatingHistory.deltaNWC !== null &&
    base.operatingHistory.revenueLTM
  ) {
    base.historicalRatios.deltaNWCPercentRevenue = base.operatingHistory.deltaNWC / base.operatingHistory.revenueLTM;
  }

  base.metadata.source = sources.size ? Array.from(sources).join(', ') : 'unknown';

  const missingFields: string[] = [];
  if (base.marketData.sharePrice === null) missingFields.push('sharePrice');
  if (base.marketData.marketCap === null) missingFields.push('marketCap');
  if (base.marketData.sharesOutstanding === null) missingFields.push('sharesOutstanding');
  if (base.operatingHistory.revenueLTM === null) missingFields.push('revenueLTM');
  if (base.operatingHistory.ebitdaLTM === null) missingFields.push('ebitdaLTM');
  if (base.operatingHistory.ebit === null) missingFields.push('ebit');
  if (base.operatingHistory.netIncome === null) missingFields.push('netIncome');
  if (base.operatingHistory.depreciationAmortization === null) missingFields.push('depreciationAmortization');
  if (base.operatingHistory.capex === null) missingFields.push('capex');
  if (base.operatingHistory.deltaNWC === null) missingFields.push('deltaNWC');
  if (base.balanceSheet.cash === null) missingFields.push('cash');
  if (base.balanceSheet.totalDebt === null) missingFields.push('totalDebt');
  if (base.balanceSheet.equity === null) missingFields.push('equity');

  if (missingFields.length > 0) {
    console.warn(`[lboIngestion] ${symbol} missing fields:`, missingFields);
  }

  return base;
}

async function fetchFromFmp(ticker: string): Promise<PartialLboData | null> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return null;

  try {
    const profileUrl = `https://financialmodelingprep.com/api/v3/profile/${ticker}?apikey=${apiKey}`;
    const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${ticker}?apikey=${apiKey}`;
    const incomeUrl = `https://financialmodelingprep.com/api/v3/income-statement/${ticker}?limit=2&apikey=${apiKey}`;
    const balanceUrl = `https://financialmodelingprep.com/api/v3/balance-sheet-statement/${ticker}?limit=1&apikey=${apiKey}`;
    const cashFlowUrl = `https://financialmodelingprep.com/api/v3/cash-flow-statement/${ticker}?limit=2&apikey=${apiKey}`;

    const [profileRes, quoteRes, incomeRes, balanceRes, cashFlowRes] = await Promise.allSettled([
      rateLimitedFetch('FMP', profileUrl),
      rateLimitedFetch('FMP', quoteUrl),
      rateLimitedFetch('FMP', incomeUrl),
      rateLimitedFetch('FMP', balanceUrl),
      rateLimitedFetch('FMP', cashFlowUrl),
    ]);

    const profile = profileRes.status === 'fulfilled' && profileRes.value.ok ? await profileRes.value.json() : null;
    const quote = quoteRes.status === 'fulfilled' && quoteRes.value.ok ? await quoteRes.value.json() : null;
    const income = incomeRes.status === 'fulfilled' && incomeRes.value.ok ? await incomeRes.value.json() : null;
    const balance = balanceRes.status === 'fulfilled' && balanceRes.value.ok ? await balanceRes.value.json() : null;
    const cashFlow = cashFlowRes.status === 'fulfilled' && cashFlowRes.value.ok ? await cashFlowRes.value.json() : null;

    const profileRow = Array.isArray(profile) ? profile[0] : null;
    const quoteRow = Array.isArray(quote) ? quote[0] : null;
    const incomeRows = Array.isArray(income) ? income : [];
    const incomeRow = incomeRows[0] ?? null;
    const priorIncomeRow = incomeRows[1] ?? null;
    const balanceRow = Array.isArray(balance) ? balance[0] : null;
    const cashFlowRows = Array.isArray(cashFlow) ? cashFlow : [];
    const cashFlowRow = cashFlowRows[0] ?? null;

    const revenue = toMillions(incomeRow?.revenue);
    const prevRevenue = toMillions(priorIncomeRow?.revenue);
    const ebitda = toMillions(incomeRow?.ebitda);
    const ebit = toMillions(incomeRow?.operatingIncome ?? incomeRow?.ebit);
    const netIncome = toMillions(incomeRow?.netIncome);

    const capex =
      toMillions(cashFlowRow?.capitalExpenditure ?? cashFlowRow?.capitalExpenditures ?? cashFlowRow?.capex);
    const deltaNwc = toMillions(
      cashFlowRow?.changeInWorkingCapital ??
        cashFlowRow?.changeInWorkingCapital ??
        cashFlowRow?.changeInNetWorkingCapital ??
        cashFlowRow?.deltaWorkingCapital
    );
    const depreciation = toMillions(
      cashFlowRow?.depreciationAndAmortization ?? cashFlowRow?.depreciationAmortization ?? cashFlowRow?.depreciation
    );

    const cash = toMillions(balanceRow?.cashAndCashEquivalents ?? balanceRow?.cashAndShortTermInvestments ?? balanceRow?.cash);
    const totalDebt =
      toMillions(balanceRow?.totalDebt) ??
      (toMillions(balanceRow?.shortTermDebt) !== null && toMillions(balanceRow?.longTermDebt) !== null
        ? (toMillions(balanceRow?.shortTermDebt) as number) + (toMillions(balanceRow?.longTermDebt) as number)
        : null);
    const equity = toMillions(balanceRow?.totalStockholdersEquity ?? balanceRow?.totalEquity);

    const revenueGrowth =
      revenue !== null && prevRevenue !== null && prevRevenue !== 0 ? (revenue - prevRevenue) / prevRevenue : null;
    const ebitdaMargin = revenue && ebitda !== null ? ebitda / revenue : null;
    const capexPercentRevenue = revenue && capex !== null ? capex / revenue : null;
    const deltaNwcPercentRevenue = revenue && deltaNwc !== null ? deltaNwc / revenue : null;

    return {
      ticker,
      companyName: profileRow?.companyName ?? quoteRow?.name ?? null,
      sector: profileRow?.sector ?? null,
      industry: profileRow?.industry ?? null,
      marketData: {
        sharePrice: toNumber(quoteRow?.price ?? profileRow?.price),
        marketCap: toMillions(quoteRow?.marketCap ?? profileRow?.mktCap),
        sharesOutstanding: toNumber(quoteRow?.sharesOutstanding ?? profileRow?.sharesOutstanding),
      },
      operatingHistory: {
        revenueLTM: revenue,
        ebitdaLTM: ebitda,
        ebit,
        netIncome,
        depreciationAmortization: depreciation,
        capex,
        deltaNWC: deltaNwc,
      },
      balanceSheet: {
        cash,
        totalDebt,
        netDebt: null,
        equity,
      },
      historicalRatios: {
        revenueGrowth,
        ebitdaMargin,
        capexPercentRevenue,
        deltaNWCPercentRevenue: deltaNwcPercentRevenue,
      },
      metadata: {
        source: 'FMP',
        period: incomeRow?.date ?? cashFlowRow?.date ?? balanceRow?.date ?? null,
      },
    };
  } catch (error: any) {
    console.warn(`[lboIngestion] FMP fetch failed for ${ticker}:`, error?.message || error);
    return null;
  }
}

async function fetchFromNasdaqFastTrack(ticker: string): Promise<(PartialLboData & { _fastTrackSource?: string }) | null> {
  const apiKey = process.env.FASTTRACK_API_KEY || process.env.NASDAQ_DATA_LINK_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://data.nasdaq.com/api/v3/datasets/SHARADAR/SF1/${ticker}_MRQ.json?api_key=${apiKey}`;
    const response = await rateLimitedFetch('NASDAQ_DATA_LINK', url);
    if (!response.ok) {
      console.warn(`[lboIngestion] Nasdaq Data Link failed for ${ticker}: ${response.status}`);
      return null;
    }
    const json = await response.json();
    const columns: string[] = json?.dataset?.column_names ?? [];
    const rows: unknown[] = json?.dataset?.data ?? [];
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const pick = (row: unknown[], candidates: string[]): number | null => {
      for (const name of candidates) {
        const idx = columns.indexOf(name);
        if (idx >= 0) {
          const value = row[idx];
          const num = toNumber(value);
          if (num !== null) return num;
        }
      }
      return null;
    };

    const row0 = rows[0] as unknown[];
    const row1 = rows[1] as unknown[] | undefined;

    const revenue0 = pick(row0, ['revenue', 'revenueusd']);
    const revenue1 = row1 ? pick(row1, ['revenue', 'revenueusd']) : null;
    const ebitda0 = pick(row0, ['ebitda', 'ebitdausd']);
    const ebit0 = pick(row0, ['ebit', 'ebitusd', 'opinc', 'opincusd']);
    const netIncome0 = pick(row0, ['netinc', 'netincusd', 'netinccmn', 'netinccmnusd']);
    const capex0 = pick(row0, ['capex', 'capexusd']);
    const dep0 = pick(row0, ['depamor', 'depamort', 'depamortusd', 'depreciation']);
    const deltaNwc0 = pick(row0, ['ncwc', 'chgworkingcapital', 'changeinworkingcapital']);

    const cash0 = pick(row0, ['cashneq', 'cashnequsd']);
    const debt0 = pick(row0, ['debt', 'debtusd']);
    const equity0 = pick(row0, ['equity', 'equityusd', 'equityeq', 'equityequityusd']);
    const shares0 = pick(row0, ['sharesbas', 'shareswa', 'sharesbasusd', 'shareswausd']);
    const marketCap0 = pick(row0, ['marketcap', 'marketcapusd']);
    const price0 = pick(row0, ['price', 'priceusd', 'priceclose', 'close']);

    const periodIdx = columns.indexOf('calendardate');
    const period = periodIdx >= 0 ? String(row0[periodIdx]) : null;

    const revenueGrowth =
      revenue0 !== null && revenue1 !== null && revenue1 !== 0 ? (revenue0 - revenue1) / revenue1 : null;
    const ebitdaMargin = revenue0 && ebitda0 !== null ? ebitda0 / revenue0 : null;
    const capexPercentRevenue = revenue0 && capex0 !== null ? capex0 / revenue0 : null;
    const deltaNwcPercentRevenue = revenue0 && deltaNwc0 !== null ? deltaNwc0 / revenue0 : null;

    return {
      ticker,
      companyName: null,
      sector: null,
      industry: null,
      marketData: {
        sharePrice: price0,
        marketCap: marketCap0 !== null ? marketCap0 / 1_000_000 : null,
        sharesOutstanding: shares0,
      },
      operatingHistory: {
        revenueLTM: revenue0 !== null ? revenue0 / 1_000_000 : null,
        ebitdaLTM: ebitda0 !== null ? ebitda0 / 1_000_000 : null,
        ebit: ebit0 !== null ? ebit0 / 1_000_000 : null,
        netIncome: netIncome0 !== null ? netIncome0 / 1_000_000 : null,
        depreciationAmortization: dep0 !== null ? dep0 / 1_000_000 : null,
        capex: capex0 !== null ? capex0 / 1_000_000 : null,
        deltaNWC: deltaNwc0 !== null ? deltaNwc0 / 1_000_000 : null,
      },
      balanceSheet: {
        cash: cash0 !== null ? cash0 / 1_000_000 : null,
        totalDebt: debt0 !== null ? debt0 / 1_000_000 : null,
        netDebt: null,
        equity: equity0 !== null ? equity0 / 1_000_000 : null,
      },
      historicalRatios: {
        revenueGrowth,
        ebitdaMargin,
        capexPercentRevenue,
        deltaNWCPercentRevenue: deltaNwcPercentRevenue,
      },
      metadata: {
        source: process.env.FASTTRACK_API_KEY ? 'FASTTRACK' : 'NASDAQ_DATA_LINK',
        period,
      },
      _fastTrackSource: process.env.FASTTRACK_API_KEY ? 'FASTTRACK' : 'NASDAQ_DATA_LINK',
    };
  } catch (error: any) {
    console.warn(`[lboIngestion] Nasdaq Data Link error for ${ticker}:`, error?.message || error);
    return null;
  }
}

async function fetchFromMarketstack(ticker: string): Promise<PartialLboData | null> {
  const apiKey = process.env.MARKETSTACK_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `http://api.marketstack.com/v1/eod/latest?access_key=${apiKey}&symbols=${ticker}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[lboIngestion] Marketstack failed for ${ticker}: ${response.status}`);
      return null;
    }
    const json = await response.json();
    const row = json?.data?.[0];
    if (!row) return null;

    return {
      ticker,
      marketData: {
        sharePrice: toNumber(row.close),
        marketCap: null,
        sharesOutstanding: null,
      },
      metadata: {
        source: 'MARKETSTACK',
        period: row?.date ?? null,
      },
    };
  } catch (error: any) {
    console.warn(`[lboIngestion] Marketstack error for ${ticker}:`, error?.message || error);
    return null;
  }
}
