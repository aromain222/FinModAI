/**
 * Analyst Chat Data Retrieval Layer
 *
 * Orchestrates multiple data sources based on the question route:
 *   1. Perigon News API   – verified news coverage, event sourcing
 *   2. FMP Financial API  – company fundamentals, quotes, earnings
 *   3. DuckDuckGo scrape  – supplementary web context
 *
 * Each retrieval function returns normalized data that feeds into the
 * facts extraction layer. All calls run in parallel where possible.
 */

import type { AnalystRoute } from './router';
import { filterHeadlines, type CuratedHeadline } from '@/lib/headlineFilter';
import { fetchPolygonQuote } from '@/lib/data/providers/polygon';
import { fetchAlphaVantageFundamentals, fetchAlphaVantageQuote } from '@/lib/data/providers/alphavantage';
import { fetchTiingoFundamentals, fetchTiingoQuote } from '@/lib/data/providers/tiingo';
import { fetchTwelveDataQuote } from '@/lib/data/providers/twelvedata';
import { fetchSecEdgarAnnualFundamentals, fetchSecEdgarQuarterlyFundamentals } from '@/lib/data/providers/secEdgar';
import { serverEnv } from '@/lib/env/server';
import { fetchFilingIndex, resolveCompanyIdentity } from '@/lib/secApi';
import type { EarningsRequestTarget } from './earningsRequest';

/* ────────── Types ────────── */

export type NewsArticle = {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary: string | null;
};

export type CompanyFinancials = {
  ticker: string;
  companyName: string;
  price: number | null;
  marketCap: number | null;
  sharesOutstanding?: number | null;
  provenance?: Record<string, string>;
  latestQuarter: {
    date: string | null;
    fiscalPeriod?: string | null;
    revenue: number | null;
    operatingIncome?: number | null;
    ebitda: number | null;
    netIncome: number | null;
    eps: number | null;
    source?: string | null;
  };
  latestAnnual: {
    date: string | null;
    fiscalYear?: number | null;
    revenue: number | null;
    ebitda: number | null;
    netIncome: number | null;
    source?: string | null;
  };
  earningsContext?: {
    releaseHighlights: string[];
    releaseSourceNotes: string[];
    releaseUrl: string | null;
    releaseFiscalPeriod?: string | null;
    releaseFiscalYear?: number | null;
    releaseReportEndDate?: string | null;
    releaseRevenue?: number | null;
    releaseEps?: number | null;
    transcriptHighlights: string[];
    transcriptSourceNotes: string[];
    transcriptFiscalPeriod?: string | null;
    transcriptFiscalYear?: number | null;
    transcriptReportEndDate?: string | null;
    sourceNotes: string[];
  };
  filingContext?: {
    latestQuarterForm: string | null;
    latestQuarterPeriodEnd: string | null;
    latestQuarterFiledAt: string | null;
    latestQuarterUrl: string | null;
  };
};

export type WebSnippet = {
  title: string;
  url: string;
  snippet: string;
};

export type RetrievedData = {
  news: NewsArticle[];
  financials: CompanyFinancials[];
  webSnippets: WebSnippet[];
  curatedHeadlines: CuratedHeadline[];
  sources: string[];
  warnings: string[];
};

export type CompanyFinancialsRequest = {
  fiscalPeriod?: string | null;
  fiscalYear?: number | null;
  reportEndDate?: string | null;
  mode?: 'latest' | 'explicit_quarter' | 'yearless_quarter';
};

/* ────────── Perigon News Retrieval ────────── */

async function fetchPerigonNews(query: string, limit = 8): Promise<NewsArticle[]> {
  const apiKey = process.env.PERIGON_API_KEY;
  if (!apiKey) return [];

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 7);

  const params = new URLSearchParams({
    apiKey,
    q: query,
    from: fromDate.toISOString(),
    sortBy: 'date',
    size: String(limit),
    language: 'en',
  });

  try {
    const response = await fetch(`https://api.goperigon.com/v1/all?${params.toString()}`, {
      next: { revalidate: 300 },
    });
    if (!response.ok) return [];

    const json = await response.json();
    const articles = Array.isArray(json?.articles) ? json.articles : [];

    return articles
      .map((a: any) => ({
        title: a?.title?.trim() || '',
        source: a?.source?.name || a?.source?.domain || a?.source || 'Perigon',
        url: a?.url?.trim() || '',
        publishedAt: a?.publishedAt || a?.pubDate || new Date().toISOString(),
        summary: a?.summary || a?.description || null,
      }))
      .filter((a: NewsArticle) => a.title && a.url)
      .slice(0, limit);
  } catch {
    return [];
  }
}

function buildNewsQuery(route: AnalystRoute, userMessage: string): string {
  const base = userMessage.replace(/[?!.]+$/, '').trim();

  if (route.intent === 'event_intelligence') {
    return `${base} market-moving events economy`;
  }
  if (route.intent === 'market_question') {
    return `${base} financial markets`;
  }
  if (route.intent === 'company_question' && route.tickers.length > 0) {
    return `${route.tickers[0]} ${base}`;
  }
  return base;
}

/* ────────── FMP Financial Data Retrieval ────────── */

async function fetchJson(url: string, timeoutMs = 5000): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'user-agent': 'CapitalBase Analyst/1.0' },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function toNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeRows<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const row = value as { data?: unknown; results?: unknown };
    if (Array.isArray(row.data)) return row.data as T[];
    if (Array.isArray(row.results)) return row.results as T[];
  }
  return [];
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNum(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function normalizeFiscalPeriod(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().toUpperCase().match(/^Q([1-4])$/);
  return match ? `Q${match[1]}` : null;
}

function deriveQuarterYear(record: Record<string, unknown>): number | null {
  const fiscalYear = pickNumber(record, ['calendarYear', 'fiscalYear', 'year']);
  if (fiscalYear !== null) return fiscalYear;
  const date = pickString(record, ['date', 'acceptedDate', 'fillingDate']);
  if (!date) return null;
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function matchesRequestedQuarter(record: Record<string, unknown>, request?: CompanyFinancialsRequest): boolean {
  if (!request || request.mode === 'latest') return true;

  const requestedDate = request.reportEndDate?.trim();
  const requestedPeriod = normalizeFiscalPeriod(request.fiscalPeriod ?? null);
  const requestedYear = typeof request.fiscalYear === 'number' ? request.fiscalYear : null;

  if (requestedDate) {
    const recordDate = pickString(record, ['date', 'acceptedDate', 'fillingDate']);
    return recordDate === requestedDate;
  }

  const recordPeriod = normalizeFiscalPeriod(pickString(record, ['period', 'fiscalPeriod']));
  const recordYear = deriveQuarterYear(record);

  if (requestedPeriod && recordPeriod !== requestedPeriod) return false;
  if (request.mode === 'explicit_quarter' && requestedYear !== null && recordYear !== requestedYear) return false;
  return requestedPeriod !== null || requestedYear !== null;
}

function selectQuarterRow(rows: Record<string, unknown>[], request?: CompanyFinancialsRequest): Record<string, unknown> | null {
  if (rows.length === 0) return null;
  if (!request || request.mode === 'latest') return rows[0] ?? null;
  const matched = rows.find((row) => matchesRequestedQuarter(row, request));
  return matched ?? null;
}

function extractTranscriptHighlights(text: string, limit = 3): string[] {
  const normalized = text
    .replace(/\s+/g, ' ')
    .replace(/\u2019/g, "'")
    .trim();
  if (!normalized) return [];

  const keywords = [
    'guidance', 'demand', 'pricing', 'margin', 'margins', 'capex', 'backlog', 'inventory',
    'bookings', 'capacity', 'supply', 'tariff', 'macro', 'customer', 'ai', 'growth',
  ];

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 40 && sentence.length <= 280);

  const scored = sentences
    .map((sentence) => ({
      sentence,
      score: keywords.reduce((count, keyword) => count + (sentence.toLowerCase().includes(keyword) ? 1 : 0), 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.sentence.length - right.sentence.length);

  const unique: string[] = [];
  for (const entry of scored) {
    const normalizedSentence = entry.sentence.toLowerCase();
    if (unique.some((candidate) => candidate.toLowerCase() === normalizedSentence)) continue;
    unique.push(entry.sentence);
    if (unique.length >= limit) break;
  }
  return unique;
}

type ProviderCompanySnapshot = {
  price: number | null;
  marketCap: number | null;
  sharesOutstanding: number | null;
  latestQuarter: CompanyFinancials['latestQuarter'];
  latestAnnual: CompanyFinancials['latestAnnual'];
  provenance: Record<string, string>;
};

async function fetchProviderBackedFinancials(ticker: string): Promise<ProviderCompanySnapshot | null> {
  const [polygonQuote, tiingoQuote, twelveQuote, alphaQuote, tiingoFundamentals, alphaFundamentals] =
    await Promise.all([
      fetchPolygonQuote(ticker),
      fetchTiingoQuote(ticker),
      fetchTwelveDataQuote(ticker),
      fetchAlphaVantageQuote(ticker),
      fetchTiingoFundamentals(ticker),
      fetchAlphaVantageFundamentals(ticker),
    ]);

  const provenance: Record<string, string> = {};

  const priceCandidates = [
    { provider: 'polygon', result: polygonQuote, pick: (data: any) => toNum(data?.price), asOf: (data: any) => data?.asOf ?? null },
    { provider: 'tiingo', result: tiingoQuote, pick: (data: any) => toNum(data?.price), asOf: (data: any) => data?.asOf ?? null },
    { provider: 'twelvedata', result: twelveQuote, pick: (data: any) => toNum(data?.price), asOf: (data: any) => data?.asOf ?? null },
    { provider: 'alphavantage', result: alphaQuote, pick: (data: any) => toNum(data?.price), asOf: (data: any) => data?.asOf ?? null },
  ];

  let price: number | null = null;
  let quoteAsOf: string | null = null;
  for (const candidate of priceCandidates) {
    if (candidate.result.ok) {
      const value = candidate.pick(candidate.result.data);
      if (value !== null) {
        price = value;
        quoteAsOf = candidate.asOf(candidate.result.data);
        provenance.price = candidate.provider;
        break;
      }
    }
  }

  const sharesCandidates = [
    { provider: 'alphavantage', result: alphaFundamentals, pick: (data: any) => toNum(data?.sharesOutstanding) },
    { provider: 'tiingo', result: tiingoFundamentals, pick: (data: any) => toNum(data?.sharesOutstanding) },
    { provider: 'alphavantage_quote', result: alphaQuote, pick: (data: any) => toNum(data?.sharesOutstanding) },
  ];
  let sharesOutstanding: number | null = null;
  for (const candidate of sharesCandidates) {
    if (candidate.result.ok) {
      const value = candidate.pick(candidate.result.data);
      if (value !== null) {
        sharesOutstanding = value;
        provenance.sharesOutstanding = candidate.provider;
        break;
      }
    }
  }

  const marketCapCandidates = [
    { provider: 'alphavantage', result: alphaFundamentals, pick: (data: any) => toNum(data?.marketCap) },
    { provider: 'alphavantage_quote', result: alphaQuote, pick: (data: any) => toNum(data?.marketCap) },
    { provider: 'tiingo', result: tiingoFundamentals, pick: (data: any) => toNum(data?.marketCap) },
  ];
  let marketCap: number | null = null;
  for (const candidate of marketCapCandidates) {
    if (candidate.result.ok) {
      const value = candidate.pick(candidate.result.data);
      if (value !== null) {
        marketCap = value;
        provenance.marketCap = candidate.provider;
        break;
      }
    }
  }
  if (marketCap === null && price !== null && sharesOutstanding !== null) {
    marketCap = price * sharesOutstanding;
    provenance.marketCap = provenance.price || 'derived';
  }

  const revenueCandidates = [
    { provider: 'alphavantage', result: alphaFundamentals, pick: (data: any) => toNum(data?.revenueLTM) },
    { provider: 'tiingo', result: tiingoFundamentals, pick: (data: any) => toNum(data?.revenueLTM) },
  ];
  const ebitdaCandidates = [
    { provider: 'alphavantage', result: alphaFundamentals, pick: (data: any) => toNum(data?.ebitdaLTM) },
    { provider: 'tiingo', result: tiingoFundamentals, pick: (data: any) => toNum(data?.ebitdaLTM) },
  ];
  const netIncomeCandidates = [
    { provider: 'alphavantage', result: alphaFundamentals, pick: (data: any) => toNum(data?.netIncomeLTM) },
    { provider: 'tiingo', result: tiingoFundamentals, pick: (data: any) => toNum(data?.netIncomeLTM) },
  ];

  let revenueLTM: number | null = null;
  let ebitdaLTM: number | null = null;
  let netIncomeLTM: number | null = null;

  for (const candidate of revenueCandidates) {
    if (candidate.result.ok) {
      const value = candidate.pick(candidate.result.data);
      if (value !== null) {
        revenueLTM = value;
        provenance.revenue = candidate.provider;
        break;
      }
    }
  }
  for (const candidate of ebitdaCandidates) {
    if (candidate.result.ok) {
      const value = candidate.pick(candidate.result.data);
      if (value !== null) {
        ebitdaLTM = value;
        provenance.ebitda = candidate.provider;
        break;
      }
    }
  }
  for (const candidate of netIncomeCandidates) {
    if (candidate.result.ok) {
      const value = candidate.pick(candidate.result.data);
      if (value !== null) {
        netIncomeLTM = value;
        provenance.netIncome = candidate.provider;
        break;
      }
    }
  }

  const hasAny =
    price !== null || marketCap !== null || sharesOutstanding !== null || revenueLTM !== null || ebitdaLTM !== null || netIncomeLTM !== null;
  if (!hasAny) return null;

  return {
    price,
    marketCap,
    sharesOutstanding,
    latestQuarter: {
      date: quoteAsOf,
      fiscalPeriod: null,
      revenue: revenueLTM,
      operatingIncome: null,
      ebitda: ebitdaLTM,
      netIncome: netIncomeLTM,
      eps: sharesOutstanding && netIncomeLTM ? netIncomeLTM / sharesOutstanding : null,
      source: provenance.revenue ? `${provenance.revenue}_ltm_fallback` : null,
    },
    latestAnnual: {
      date: quoteAsOf,
      fiscalYear: null,
      revenue: revenueLTM,
      ebitda: ebitdaLTM,
      netIncome: netIncomeLTM,
      source: provenance.revenue ? `${provenance.revenue}_ltm_fallback` : null,
    },
    provenance,
  };
}

async function fetchFmpTranscriptContext(
  ticker: string,
  request?: CompanyFinancialsRequest,
): Promise<{
  transcriptHighlights: string[];
  transcriptSourceNotes: string[];
  transcriptFiscalPeriod: string | null;
  transcriptFiscalYear: number | null;
  transcriptReportEndDate: string | null;
}> {
  const apiKey = serverEnv.FMP_API_KEY;
  if (!apiKey) {
    return {
      transcriptHighlights: [],
      transcriptSourceNotes: [],
      transcriptFiscalPeriod: null,
      transcriptFiscalYear: null,
      transcriptReportEndDate: null,
    };
  }

  const dateRows = normalizeRows<Record<string, unknown>>(
    await fetchJson(`https://financialmodelingprep.com/stable/earning-call-transcript-dates?symbol=${ticker}&apikey=${apiKey}`)
  );

  const candidates = [...dateRows]
    .map((row) => ({
      date: pickString(row, ['date']),
      year: pickNumber(row, ['year']),
      quarter: pickNumber(row, ['quarter']),
    }))
    .filter((row) => row.date && row.year !== null && row.quarter !== null)
    .sort((left, right) => String(right.date).localeCompare(String(left.date)));

  const latest =
    request?.mode === 'explicit_quarter'
      ? candidates.find((row) => {
          const requestedPeriod = normalizeFiscalPeriod(request.fiscalPeriod ?? null);
          const requestedQuarter = requestedPeriod ? Number(requestedPeriod.replace('Q', '')) : null;
          if (requestedQuarter !== null && row.quarter !== requestedQuarter) return false;
          if (typeof request.fiscalYear === 'number' && row.year !== request.fiscalYear) return false;
          if (request.reportEndDate && row.date !== request.reportEndDate) return false;
          return true;
        }) ?? null
      : candidates[0] ?? null;

  if (!latest || latest.year === null || latest.quarter === null) {
    return {
      transcriptHighlights: [],
      transcriptSourceNotes: [],
      transcriptFiscalPeriod: null,
      transcriptFiscalYear: null,
      transcriptReportEndDate: null,
    };
  }

  const transcriptRows = normalizeRows<Record<string, unknown>>(
    await fetchJson(
      `https://financialmodelingprep.com/stable/earning-call-transcript?symbol=${ticker}&year=${latest.year}&quarter=${latest.quarter}&apikey=${apiKey}`,
      7000,
    )
  );
  const transcriptRow = transcriptRows[0] ?? {};
  const transcriptText = pickString(transcriptRow, ['content', 'transcript', 'text']) ?? '';
  const transcriptHighlights = extractTranscriptHighlights(transcriptText, 3);

  return {
    transcriptHighlights,
    transcriptSourceNotes:
      transcriptHighlights.length > 0
        ? [`FMP earnings transcript Q${latest.quarter} ${latest.year}`]
        : [],
    transcriptFiscalPeriod: `Q${latest.quarter}`,
    transcriptFiscalYear: latest.year,
    transcriptReportEndDate: latest.date,
  };
}

function summarizeEarningsReleaseRow(row: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const eps = pickNumber(row, ['eps', 'epsActual', 'actualEps']);
  const epsEstimate = pickNumber(row, ['epsEstimated', 'estimatedEps']);
  const revenue = pickNumber(row, ['revenue', 'revenueActual', 'actualRevenue']);
  const revenueEstimate = pickNumber(row, ['revenueEstimated', 'estimatedRevenue']);
  const releaseDate = pickString(row, ['date', 'fillingDate', 'fiscalDateEnding', 'acceptedDate']);
  const timeOfDay = pickString(row, ['time', 'timeOfDay']);

  if (eps !== null && epsEstimate !== null) {
    const delta = eps - epsEstimate;
    lines.push(`Reported EPS of ${eps} versus consensus ${epsEstimate}, a ${delta >= 0 ? 'beat' : 'miss'} of ${Math.abs(delta).toFixed(2)}.`);
  } else if (eps !== null) {
    lines.push(`Reported EPS was ${eps}.`);
  }

  if (revenue !== null && revenueEstimate !== null) {
    const delta = revenue - revenueEstimate;
    lines.push(
      `Reported revenue of ${revenue.toLocaleString('en-US')} versus consensus ${revenueEstimate.toLocaleString('en-US')}, a ${delta >= 0 ? 'beat' : 'miss'} of ${Math.abs(delta).toLocaleString('en-US')}.`,
    );
  } else if (revenue !== null) {
    lines.push(`Reported revenue was ${revenue.toLocaleString('en-US')}.`);
  }

  if (releaseDate || timeOfDay) {
    lines.push(
      [releaseDate ? `Release date ${releaseDate}` : null, timeOfDay ? `scheduled ${timeOfDay}` : null]
        .filter((item): item is string => Boolean(item))
        .join(' • '),
    );
  }

  return lines.filter((line) => line.length > 0).slice(0, 3);
}

async function fetchFmpEarningsReleaseContext(
  ticker: string,
  request?: CompanyFinancialsRequest,
): Promise<{
  releaseHighlights: string[];
  releaseSourceNotes: string[];
  releaseUrl: string | null;
  releaseFiscalPeriod: string | null;
  releaseFiscalYear: number | null;
  releaseReportEndDate: string | null;
  releaseRevenue: number | null;
  releaseEps: number | null;
}> {
  const apiKey = serverEnv.FMP_API_KEY;
  if (!apiKey) {
    return {
      releaseHighlights: [],
      releaseSourceNotes: [],
      releaseUrl: null,
      releaseFiscalPeriod: null,
      releaseFiscalYear: null,
      releaseReportEndDate: null,
      releaseRevenue: null,
      releaseEps: null,
    };
  }

  const rows = normalizeRows<Record<string, unknown>>(
    await fetchJson(`https://financialmodelingprep.com/stable/earnings?symbol=${ticker}&apikey=${apiKey}`)
  );
  if (rows.length === 0) {
    return {
      releaseHighlights: [],
      releaseSourceNotes: [],
      releaseUrl: null,
      releaseFiscalPeriod: null,
      releaseFiscalYear: null,
      releaseReportEndDate: null,
      releaseRevenue: null,
      releaseEps: null,
    };
  }

  const selected = selectQuarterRow(rows, request);
  if (!selected) {
    return {
      releaseHighlights: [],
      releaseSourceNotes: [],
      releaseUrl: null,
      releaseFiscalPeriod: null,
      releaseFiscalYear: null,
      releaseReportEndDate: null,
      releaseRevenue: null,
      releaseEps: null,
    };
  }

  const fiscalPeriod = normalizeFiscalPeriod(pickString(selected, ['period', 'fiscalPeriod']));
  const fiscalYear = deriveQuarterYear(selected);
  const releaseHighlights = summarizeEarningsReleaseRow(selected);

  return {
    releaseHighlights,
    releaseSourceNotes:
      releaseHighlights.length > 0
        ? [`FMP earnings release summary${fiscalPeriod && fiscalYear ? ` ${fiscalPeriod} ${fiscalYear}` : ''}`.trim()]
        : [],
    releaseUrl: pickString(selected, ['link', 'finalLink', 'url']),
    releaseFiscalPeriod: fiscalPeriod,
    releaseFiscalYear: fiscalYear,
    releaseReportEndDate: pickString(selected, ['date', 'fillingDate', 'fiscalDateEnding', 'acceptedDate']),
    releaseRevenue: pickNumber(selected, ['revenue', 'revenueActual', 'actualRevenue']),
    releaseEps: pickNumber(selected, ['eps', 'epsActual', 'actualEps']),
  };
}

function isYearEndRequest(request?: CompanyFinancialsRequest): boolean {
  if (!request || (request.mode !== 'explicit_quarter' && request.mode !== 'yearless_quarter')) return false;
  return normalizeFiscalPeriod(request.fiscalPeriod ?? null) === 'Q4';
}

function selectAnnualRow(rows: Record<string, unknown>[], request?: CompanyFinancialsRequest): Record<string, unknown> | null {
  if (rows.length === 0) return null;
  if (!isYearEndRequest(request)) return rows[0] ?? null;

  const requestedYear =
    typeof request?.fiscalYear === 'number'
      ? request.fiscalYear
      : request?.reportEndDate
        ? Number(request.reportEndDate.slice(0, 4))
        : null;

  if (requestedYear !== null) {
    const matched = rows.find((row) => {
      const year = pickNumber(row, ['calendarYear', 'fiscalYear', 'year']);
      if (year !== null) return year === requestedYear;
      const date = pickString(row, ['date', 'acceptedDate', 'fillingDate']);
      return date ? Number(date.slice(0, 4)) === requestedYear : false;
    });
    if (matched) return matched;
  }

  return null;
}

async function fetchLatestQuarterFilingContext(ticker: string): Promise<CompanyFinancials['filingContext']> {
  try {
    const company = await resolveCompanyIdentity(ticker);
    if (!company?.cik) {
      return {
        latestQuarterForm: null,
        latestQuarterPeriodEnd: null,
        latestQuarterFiledAt: null,
        latestQuarterUrl: null,
      };
    }
    const asOfDate = new Date().toISOString().slice(0, 10);
    const filingIndex = await fetchFilingIndex(company.cik, asOfDate);
    const latestQuarter = filingIndex?.latestQuarter;
    return {
      latestQuarterForm: latestQuarter?.form ?? null,
      latestQuarterPeriodEnd: latestQuarter?.periodEnd ?? null,
      latestQuarterFiledAt: latestQuarter?.filedAt ?? null,
      latestQuarterUrl: latestQuarter?.url ?? null,
    };
  } catch {
    return {
      latestQuarterForm: null,
      latestQuarterPeriodEnd: null,
      latestQuarterFiledAt: null,
      latestQuarterUrl: null,
    };
  }
}

export async function fetchCompanyFinancials(ticker: string, request?: CompanyFinancialsRequest): Promise<CompanyFinancials | null> {
  const apiKey = serverEnv.FMP_API_KEY;
  const providerFallbackPromise = fetchProviderBackedFinancials(ticker);
  const secQuarterPromise = fetchSecEdgarQuarterlyFundamentals(ticker);
  const secAnnualPromise = fetchSecEdgarAnnualFundamentals(ticker);
  const releaseContextPromise = fetchFmpEarningsReleaseContext(ticker, request);
  const transcriptContextPromise = fetchFmpTranscriptContext(ticker, request);
  const filingContextPromise = fetchLatestQuarterFilingContext(ticker);
  if (!apiKey) {
    const [providerFallback, secQuarter, secAnnual, releaseContext, transcriptContext, filingContext] = await Promise.all([
      providerFallbackPromise,
      secQuarterPromise,
      secAnnualPromise,
      releaseContextPromise,
      transcriptContextPromise,
      filingContextPromise,
    ]);
    if (!providerFallback && !secQuarter.ok && !secAnnual.ok) return null;
    return {
      ticker: ticker.toUpperCase(),
      companyName: ticker.toUpperCase(),
      price: providerFallback?.price ?? null,
      marketCap: providerFallback?.marketCap ?? null,
      sharesOutstanding: providerFallback?.sharesOutstanding ?? null,
      provenance: providerFallback?.provenance ?? {},
      latestQuarter: {
        date: (secQuarter.ok ? secQuarter.data.reportEndDate : null) ?? providerFallback?.latestQuarter.date ?? null,
        fiscalPeriod: (secQuarter.ok ? secQuarter.data.period : null) ?? providerFallback?.latestQuarter.fiscalPeriod ?? null,
        revenue: (secQuarter.ok ? secQuarter.data.revenueQ : null) ?? providerFallback?.latestQuarter.revenue ?? null,
        operatingIncome: (secQuarter.ok ? secQuarter.data.operatingIncomeQ : null) ?? providerFallback?.latestQuarter.operatingIncome ?? null,
        ebitda: providerFallback?.latestQuarter.ebitda ?? null,
        netIncome: (secQuarter.ok ? secQuarter.data.netIncomeQ : null) ?? providerFallback?.latestQuarter.netIncome ?? null,
        eps: (secQuarter.ok ? secQuarter.data.epsQ : null) ?? providerFallback?.latestQuarter.eps ?? null,
        source: secQuarter.ok ? 'sec_edgar_quarterly' : providerFallback?.latestQuarter.source ?? null,
      },
      latestAnnual: {
        date: (secAnnual.ok ? secAnnual.data.reportEndDate : null) ?? providerFallback?.latestAnnual.date ?? null,
        fiscalYear: (secAnnual.ok ? secAnnual.data.fiscalYear : null) ?? providerFallback?.latestAnnual.fiscalYear ?? null,
        revenue: (secAnnual.ok ? secAnnual.data.revenueFY : null) ?? providerFallback?.latestAnnual.revenue ?? null,
        ebitda: (secAnnual.ok ? secAnnual.data.ebitdaFY : null) ?? providerFallback?.latestAnnual.ebitda ?? null,
        netIncome: (secAnnual.ok ? secAnnual.data.netIncomeFY : null) ?? providerFallback?.latestAnnual.netIncome ?? null,
        source: secAnnual.ok ? 'sec_edgar_annual' : providerFallback?.latestAnnual.source ?? null,
      },
      earningsContext: {
        releaseHighlights: releaseContext.releaseHighlights,
        releaseSourceNotes: releaseContext.releaseSourceNotes,
        releaseUrl: releaseContext.releaseUrl,
        releaseFiscalPeriod: releaseContext.releaseFiscalPeriod,
        releaseFiscalYear: releaseContext.releaseFiscalYear,
        releaseReportEndDate: releaseContext.releaseReportEndDate,
        releaseRevenue: releaseContext.releaseRevenue,
        releaseEps: releaseContext.releaseEps,
        transcriptHighlights: transcriptContext.transcriptHighlights,
        transcriptSourceNotes: transcriptContext.transcriptSourceNotes,
        transcriptFiscalPeriod: transcriptContext.transcriptFiscalPeriod,
        transcriptFiscalYear: transcriptContext.transcriptFiscalYear,
        transcriptReportEndDate: transcriptContext.transcriptReportEndDate,
        sourceNotes: [...releaseContext.releaseSourceNotes, ...transcriptContext.transcriptSourceNotes],
      },
      filingContext,
    };
  }

  const [quoteJson, quarterJson, annualJson, providerFallback, secQuarter, secAnnual, releaseContext, transcriptContext, filingContext] = await Promise.all([
    fetchJson(`https://financialmodelingprep.com/api/v3/quote/${ticker}?apikey=${apiKey}`),
    fetchJson(`https://financialmodelingprep.com/api/v3/income-statement/${ticker}?period=quarter&limit=${request?.mode && request.mode !== 'latest' ? 12 : 2}&apikey=${apiKey}`),
    fetchJson(`https://financialmodelingprep.com/api/v3/income-statement/${ticker}?limit=${isYearEndRequest(request) ? 4 : 1}&apikey=${apiKey}`),
    providerFallbackPromise,
    secQuarterPromise,
    secAnnualPromise,
    releaseContextPromise,
    transcriptContextPromise,
    filingContextPromise,
  ]);

  const q = Array.isArray(quoteJson) ? (quoteJson[0] as any) : null;
  const qrRows = normalizeRows<Record<string, unknown>>(quarterJson);
  const qr = selectQuarterRow(qrRows, request) as any;
  const arRows = normalizeRows<Record<string, unknown>>(annualJson);
  const ar = selectAnnualRow(arRows, request) as any;

  if (!q && !qr && !ar && !providerFallback && !secQuarter.ok && !secAnnual.ok) return null;

  const quotePrice = toNum(q?.price) ?? providerFallback?.price ?? null;
  const quoteMarketCap = toNum(q?.marketCap) ?? providerFallback?.marketCap ?? null;
  const allowLatestQuarterFallback = request?.mode !== 'explicit_quarter';
  const explicitReleaseRevenue = request?.mode && request.mode !== 'latest' ? releaseContext.releaseRevenue : null;
  const explicitReleaseEps = request?.mode && request.mode !== 'latest' ? releaseContext.releaseEps : null;
  const quarterlyRevenue =
    toNum(qr?.revenue) ??
    explicitReleaseRevenue ??
    (allowLatestQuarterFallback && secQuarter.ok ? secQuarter.data.revenueQ : null) ??
    (allowLatestQuarterFallback ? providerFallback?.latestQuarter.revenue : null) ??
    null;
  const quarterlyOperatingIncome =
    toNum(qr?.operatingIncome) ??
    toNum(qr?.operatingIncomeLoss) ??
    (allowLatestQuarterFallback && secQuarter.ok ? secQuarter.data.operatingIncomeQ : null) ??
    (allowLatestQuarterFallback ? providerFallback?.latestQuarter.operatingIncome : null) ??
    null;
  const quarterlyEbitda = toNum(qr?.ebitda) ?? (allowLatestQuarterFallback ? providerFallback?.latestQuarter.ebitda : null) ?? null;
  const quarterlyNetIncome =
    toNum(qr?.netIncome) ??
    (allowLatestQuarterFallback && secQuarter.ok ? secQuarter.data.netIncomeQ : null) ??
    (allowLatestQuarterFallback ? providerFallback?.latestQuarter.netIncome : null) ??
    null;
  const quarterlyEps =
    toNum(qr?.eps) ??
    explicitReleaseEps ??
    (allowLatestQuarterFallback && secQuarter.ok ? secQuarter.data.epsQ : null) ??
    (allowLatestQuarterFallback ? providerFallback?.latestQuarter.eps : null) ??
    null;
  const annualRevenue =
    toNum(ar?.revenue) ??
    (secAnnual.ok ? secAnnual.data.revenueFY : null) ??
    providerFallback?.latestAnnual.revenue ??
    null;
  const annualEbitda =
    toNum(ar?.ebitda) ??
    (secAnnual.ok ? secAnnual.data.ebitdaFY : null) ??
    providerFallback?.latestAnnual.ebitda ??
    null;
  const annualNetIncome =
    toNum(ar?.netIncome) ??
    (secAnnual.ok ? secAnnual.data.netIncomeFY : null) ??
    providerFallback?.latestAnnual.netIncome ??
    null;
  const provenance: Record<string, string> = { ...(providerFallback?.provenance ?? {}) };
  if (toNum(q?.price) !== null) provenance.price = 'fmp';
  if (toNum(q?.marketCap) !== null) provenance.marketCap = 'fmp';
  if (toNum(qr?.revenue) !== null) provenance.revenue = 'fmp_latest_quarter';
  else if (explicitReleaseRevenue !== null) provenance.revenue = 'fmp_earnings_release_summary';
  else if (secQuarter.ok && secQuarter.data.revenueQ !== null) provenance.revenue = 'sec_edgar_quarterly';
  if (toNum(qr?.operatingIncome) !== null || toNum(qr?.operatingIncomeLoss) !== null) provenance.operatingIncome = 'fmp_latest_quarter';
  else if (secQuarter.ok && secQuarter.data.operatingIncomeQ !== null) provenance.operatingIncome = 'sec_edgar_quarterly';
  if (toNum(qr?.ebitda) !== null) provenance.ebitda = 'fmp_latest_quarter';
  else if (secAnnual.ok && secAnnual.data.ebitdaFY !== null) provenance.ebitda = 'sec_edgar_annual';
  if (toNum(qr?.netIncome) !== null) provenance.netIncome = 'fmp_latest_quarter';
  else if (secQuarter.ok && secQuarter.data.netIncomeQ !== null) provenance.netIncome = 'sec_edgar_quarterly';
  if (toNum(qr?.eps) !== null) provenance.eps = 'fmp_latest_quarter';
  else if (explicitReleaseEps !== null) provenance.eps = 'fmp_earnings_release_summary';
  else if (secQuarter.ok && secQuarter.data.epsQ !== null) provenance.eps = 'sec_edgar_quarterly';
  if (toNum(ar?.revenue) !== null) provenance.annualRevenue = 'fmp_annual';
  else if (secAnnual.ok && secAnnual.data.revenueFY !== null) provenance.annualRevenue = 'sec_edgar_annual';

  return {
    ticker: (q?.symbol || ticker).toUpperCase(),
    companyName: q?.name?.trim() || ticker.toUpperCase(),
    price: quotePrice,
    marketCap: quoteMarketCap,
    sharesOutstanding: providerFallback?.sharesOutstanding ?? null,
    provenance,
    latestQuarter: {
      date:
        qr?.date ??
        releaseContext.releaseReportEndDate ??
        (allowLatestQuarterFallback && secQuarter.ok ? secQuarter.data.reportEndDate : null) ??
        (allowLatestQuarterFallback ? providerFallback?.latestQuarter.date : null) ??
        request?.reportEndDate ??
        null,
      fiscalPeriod:
        normalizeFiscalPeriod(qr?.period ?? qr?.fiscalPeriod) ??
        releaseContext.releaseFiscalPeriod ??
        (allowLatestQuarterFallback && secQuarter.ok ? secQuarter.data.period : null) ??
        (allowLatestQuarterFallback ? providerFallback?.latestQuarter.fiscalPeriod : null) ??
        request?.fiscalPeriod ??
        null,
      revenue: quarterlyRevenue,
      operatingIncome: quarterlyOperatingIncome,
      ebitda: quarterlyEbitda,
      netIncome: quarterlyNetIncome,
      eps: quarterlyEps,
      source: provenance.revenue ?? providerFallback?.latestQuarter.source ?? null,
    },
    latestAnnual: {
      date: ar?.date ?? (secAnnual.ok ? secAnnual.data.reportEndDate : null) ?? providerFallback?.latestAnnual.date ?? null,
      fiscalYear: (ar?.calendarYear ? Number(ar.calendarYear) : null) ?? (secAnnual.ok ? secAnnual.data.fiscalYear : null) ?? providerFallback?.latestAnnual.fiscalYear ?? null,
      revenue: annualRevenue,
      ebitda: annualEbitda,
      netIncome: annualNetIncome,
      source: provenance.annualRevenue ?? providerFallback?.latestAnnual.source ?? null,
    },
    earningsContext: {
      releaseHighlights: releaseContext.releaseHighlights,
      releaseSourceNotes: releaseContext.releaseSourceNotes,
      releaseUrl: releaseContext.releaseUrl,
      releaseFiscalPeriod: releaseContext.releaseFiscalPeriod,
      releaseFiscalYear: releaseContext.releaseFiscalYear,
      releaseReportEndDate: releaseContext.releaseReportEndDate,
      releaseRevenue: releaseContext.releaseRevenue,
      releaseEps: releaseContext.releaseEps,
      transcriptHighlights: transcriptContext.transcriptHighlights,
      transcriptSourceNotes: transcriptContext.transcriptSourceNotes,
      transcriptFiscalPeriod: transcriptContext.transcriptFiscalPeriod,
      transcriptFiscalYear: transcriptContext.transcriptFiscalYear,
      transcriptReportEndDate: transcriptContext.transcriptReportEndDate,
      sourceNotes: [...releaseContext.releaseSourceNotes, ...transcriptContext.transcriptSourceNotes],
    },
    filingContext,
  };
}

/* ────────── DuckDuckGo Web Scraping (supplementary) ────────── */

async function fetchTextWithTimeout(url: string, timeoutMs = 4500): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'user-agent': 'CapitalBase AnalystBot/1.0' },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDdgUrl(url: string): string {
  if (!url.startsWith('/l/?')) return url;
  try {
    const resolved = new URLSearchParams(url.slice(4)).get('uddg');
    return resolved ? decodeURIComponent(resolved) : url;
  } catch {
    return url;
  }
}

async function scrapeWebSnippets(query: string, limit = 5): Promise<WebSnippet[]> {
  const html = await fetchTextWithTimeout(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  if (!html) return [];

  const titleMatches = Array.from(html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g));
  const snippetMatches = Array.from(html.matchAll(/<(?:a|div)[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/g));

  const items: WebSnippet[] = [];
  for (let i = 0; i < Math.min(titleMatches.length, limit); i++) {
    const url = parseDdgUrl(titleMatches[i]?.[1] ?? '');
    const title = stripHtml(titleMatches[i]?.[2] ?? '');
    const snippet = stripHtml(snippetMatches[i]?.[1] ?? '');
    if (!/^https?:\/\//i.test(url) || !title || !snippet) continue;
    items.push({ title, url, snippet: snippet.length > 240 ? snippet.slice(0, 240) + '...' : snippet });
  }
  return items;
}

/* ────────── Main Orchestrator ────────── */

export async function retrieveDataForRoute(
  route: AnalystRoute,
  userMessage: string
): Promise<RetrievedData> {
  const warnings: string[] = [];
  const allSources: string[] = [];

  const promises: {
    news: Promise<NewsArticle[]>;
    financials: Promise<(CompanyFinancials | null)[]>;
    web: Promise<WebSnippet[]>;
  } = {
    news: Promise.resolve([]),
    financials: Promise.resolve([]),
    web: Promise.resolve([]),
  };

  if (route.requiresNews) {
    const newsQuery = buildNewsQuery(route, userMessage);
    promises.news = fetchPerigonNews(newsQuery).then(articles => {
      if (articles.length === 0 && process.env.PERIGON_API_KEY) {
        warnings.push('Perigon returned no articles for this query.');
      } else if (!process.env.PERIGON_API_KEY) {
        warnings.push('PERIGON_API_KEY not configured; news retrieval skipped.');
      }
      return articles;
    });
  }

  if (route.requiresFinancials && route.tickers.length > 0) {
    const tickerSlice = route.tickers.slice(0, 3);
    promises.financials = Promise.all(tickerSlice.map(t => fetchCompanyFinancials(t))).then(results => {
      if (results.every(r => r === null) && process.env.FMP_API_KEY) {
        warnings.push('FMP returned no data for the requested tickers.');
      } else if (!process.env.FMP_API_KEY) {
        warnings.push('FMP_API_KEY not configured; financial data retrieval skipped.');
      }
      return results;
    });
  }

  if (route.requiresLiveData) {
    const webQuery = route.tickers.length > 0
      ? `${route.tickers[0]} ${userMessage.slice(0, 60)}`
      : userMessage.slice(0, 80);
    promises.web = scrapeWebSnippets(webQuery, 4);
  }

  const [news, financialsRaw, webSnippets] = await Promise.all([
    promises.news,
    promises.financials,
    promises.web,
  ]);

  const financials = financialsRaw.filter((f): f is CompanyFinancials => f !== null);

  let curatedHeadlines: CuratedHeadline[] = [];
  if (route.intent === 'event_intelligence' && news.length > 0) {
    try {
      curatedHeadlines = await filterHeadlines(
        news.map((a) => ({
          title: a.title,
          source: a.source,
          publishedAt: a.publishedAt,
          summary: a.summary ?? undefined,
        })),
        { maxResults: 10 }
      );
    } catch {
      warnings.push('Headline curation unavailable; using raw news feed.');
    }
  }

  for (const article of news) {
    allSources.push(`${article.source}: ${article.title} — ${article.url}`);
  }
  for (const f of financials) {
    const sourceLabels = Object.entries(f.provenance ?? {})
      .map(([field, provider]) => `${field}:${provider}`)
      .slice(0, 6)
      .join(', ');
    allSources.push(`Company data providers — ${f.ticker}${sourceLabels ? ` (${sourceLabels})` : ''}`);
    for (const note of f.earningsContext?.sourceNotes ?? []) {
      allSources.push(`${f.ticker} earnings context — ${note}`);
    }
    if (f.filingContext?.latestQuarterUrl) {
      allSources.push(
        `${f.ticker} latest quarterly filing — ${f.filingContext.latestQuarterForm ?? 'filing'} (${f.filingContext.latestQuarterPeriodEnd ?? 'period n/a'}) — ${f.filingContext.latestQuarterUrl}`
      );
    }
  }
  for (const s of webSnippets) {
    allSources.push(`${s.title} — ${s.url}`);
  }

  return {
    news,
    financials,
    webSnippets,
    curatedHeadlines,
    sources: allSources.slice(0, 12),
    warnings,
  };
}
