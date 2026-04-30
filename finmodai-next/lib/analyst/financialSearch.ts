import type { StockLookupResult } from '@/lib/data/company/lookupStock';
import { lookupStock } from '@/lib/data/company/lookupStock';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';
import {
  extractVerifiedFacts,
  serializeFactsBriefForContext,
  type VerifiedFacts,
} from '@/lib/analyst/factsExtractor';
import { retrieveDataForRoute, type RetrievedData } from '@/lib/analyst/dataRetrieval';
import { gatherAnalystRetrievalContext } from '@/lib/analyst/retrieval';
import type { AnalystRoute } from '@/lib/analyst/router';

export type FinancialSearchQueryClassification =
  | 'company_metric_lookup'
  | 'filing_lookup'
  | 'company_news_context'
  | 'macro_context';

export type FinancialSearchSourceTier = 'stored' | 'filing' | 'provider' | 'news';

export type FinancialSearchRankedSource = {
  label: string;
  url: string | null;
  sourceType: FinancialSearchSourceTier;
  asOfDate: string | null;
  precedence: number;
};

export type FinancialSearchRankedFact = {
  label: string;
  value: string;
  metricKey: string;
  sourceLabel: string;
  sourceUrl: string | null;
  asOfDate: string | null;
};

export type FinancialSearchResolvedIdentity = {
  ticker: string | null;
  companyName: string | null;
};

export type FinancialSearchSummary = {
  topFacts: FinancialSearchRankedFact[];
  topSources: FinancialSearchRankedSource[];
};

export type PublicFinancialSearchResult = {
  handled: boolean;
  fanoutUsed: number;
  maxFanout: number;
  queryClassification: FinancialSearchQueryClassification;
  resolvedSubjectIdentity: FinancialSearchResolvedIdentity | null;
  rankedFacts: FinancialSearchRankedFact[];
  rankedSources: FinancialSearchRankedSource[];
  warnings: string[];
  reply: string;
  summary: FinancialSearchSummary;
  stockLookup: StockLookupResult | null;
};

type FinancialSearchParams = {
  route: AnalystRoute;
  userMessage: string;
  explicitTicker?: string | null;
  preloadedStockLookup?: StockLookupResult | null;
  hasAttachment?: boolean;
};

type RetrievalAgentOutput = {
  retrievedData: RetrievedData;
  retrievalContext: {
    context: string;
    sourceLines: string[];
    warnings: string[];
  } | null;
  stockLookup: StockLookupResult | null;
};

export const financialSearchDeps = {
  lookupStock,
  gatherAnalystRetrievalContext,
  retrieveDataForRoute,
  extractVerifiedFacts,
  generateTextWithProviderFallback,
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms.`)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)),
  );
}

function parseSourceUrl(source: string): string | null {
  const trimmed = source.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const match = trimmed.match(/https?:\/\/\S+/i);
  return match ? match[0] : null;
}

function sourceTierFor(label: string, url: string | null): FinancialSearchSourceTier {
  const haystack = `${label} ${url ?? ''}`.toLowerCase();
  if (haystack.includes('company_cache') || haystack.includes('snapshot') || haystack.includes('company_prices')) {
    return 'stored';
  }
  if (haystack.includes('sec') || haystack.includes('10-k') || haystack.includes('10-q') || haystack.includes('investor')) {
    return 'filing';
  }
  if (
    haystack.includes('fmp') ||
    haystack.includes('polygon') ||
    haystack.includes('alphavantage') ||
    haystack.includes('tiingo') ||
    haystack.includes('twelvedata') ||
    haystack.includes('quote api') ||
    haystack.includes('income statement')
  ) {
    return 'provider';
  }
  return 'news';
}

function sourcePrecedence(tier: FinancialSearchSourceTier): number {
  if (tier === 'stored') return 0;
  if (tier === 'filing') return 1;
  if (tier === 'provider') return 2;
  return 3;
}

function fmtUsd(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

// Snapshot fields (marketCap, revenueLtm, etc.) are stored in millions in Supabase.
function fmtUsdM(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return fmtUsd(value * 1e6);
}

function fmtRawNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function classifyFinancialSearchQuery(route: AnalystRoute, userMessage: string): FinancialSearchQueryClassification | null {
  const text = userMessage.toLowerCase();
  if (route.intent === 'market_question' || route.intent === 'event_intelligence') return 'macro_context';
  if (route.intent !== 'company_question') return null;
  if (/\b(10-k|10-q|8-k|filing|transcript|investor relations|quarterly report|annual report)\b/.test(text)) {
    return 'filing_lookup';
  }
  if (/\b(news|headline|event|reaction|market reaction|what happened)\b/.test(text)) {
    return 'company_news_context';
  }
  if (
    /\b(latest|current|revenue|sales|ebitda|ebit|eps|cash|debt|shares outstanding|share count|market cap|price|trading|results|guidance|quarter|annual|financials?)\b/.test(
      text,
    )
  ) {
    return 'company_metric_lookup';
  }
  return null;
}

export function shouldRunPublicFinancialSearch(params: {
  route: AnalystRoute;
  userMessage: string;
  explicitTicker?: string | null;
  hasAttachment?: boolean;
}): boolean {
  if (params.hasAttachment) return false;
  const classification = classifyFinancialSearchQuery(params.route, params.userMessage);
  if (!classification) return false;
  if (classification !== 'macro_context' && !params.explicitTicker && params.route.tickers.length === 0) return false;
  return true;
}

function inferRequestedMetrics(userMessage: string): Array<'price' | 'marketCap' | 'revenue' | 'ebitda' | 'cash' | 'debt' | 'eps'> {
  const text = userMessage.toLowerCase();
  const metrics: Array<'price' | 'marketCap' | 'revenue' | 'ebitda' | 'cash' | 'debt' | 'eps'> = [];
  if (/\b(price|trading|share price|stock)\b/.test(text)) metrics.push('price');
  if (/\b(market cap|valuation)\b/.test(text)) metrics.push('marketCap');
  if (/\b(revenue|sales|top line|topline)\b/.test(text)) metrics.push('revenue');
  if (/\b(ebitda|ebit|operating income|margin)\b/.test(text)) metrics.push('ebitda');
  if (/\b(cash|liquidity)\b/.test(text)) metrics.push('cash');
  if (/\b(debt|leverage|balance sheet)\b/.test(text)) metrics.push('debt');
  if (/\b(eps|earnings per share)\b/.test(text)) metrics.push('eps');
  return metrics;
}

function canAnswerTrivially(stockLookup: StockLookupResult | null, classification: FinancialSearchQueryClassification, userMessage: string): boolean {
  if (!stockLookup || classification !== 'company_metric_lookup') return false;
  const metrics = inferRequestedMetrics(userMessage);
  if (metrics.length === 0) return stockLookup.price !== null || stockLookup.revenueLtm !== null;
  return metrics.every((metric) => {
    if (metric === 'price') return stockLookup.price !== null;
    if (metric === 'marketCap') return stockLookup.marketCap !== null;
    if (metric === 'revenue') return stockLookup.revenueLtm !== null;
    if (metric === 'ebitda') return stockLookup.ebitdaLtm !== null;
    if (metric === 'cash') return stockLookup.cash !== null;
    if (metric === 'debt') return stockLookup.totalDebt !== null;
    if (metric === 'eps') return false;
    return false;
  });
}

async function runRetrievalAgent(
  params: FinancialSearchParams,
  fanoutUsed: number,
): Promise<RetrievalAgentOutput> {
  const ticker = params.explicitTicker?.trim().toUpperCase() || params.route.tickers[0] || undefined;
  const needsLiveRetrieval = fanoutUsed > 1;

  const [stockLookup, retrievalContext, retrievedData] = await Promise.all([
    params.preloadedStockLookup !== undefined
      ? Promise.resolve(params.preloadedStockLookup)
      : ticker
        ? financialSearchDeps.lookupStock({ prompt: params.userMessage, ticker })
        : Promise.resolve(null),
    ticker
      ? withTimeout(
          financialSearchDeps.gatherAnalystRetrievalContext({ ticker, userMessage: params.userMessage }),
          4500,
          'Financial search structured retrieval',
        ).catch(() => ({ context: '', sourceLines: [], warnings: ['Structured retrieval timed out.'] }))
      : Promise.resolve(null),
    needsLiveRetrieval
      ? withTimeout(
          financialSearchDeps.retrieveDataForRoute(params.route, params.userMessage),
          8000,
          'Financial search live retrieval',
        ).catch(() => ({
          news: [],
          financials: [],
          webSnippets: [],
          curatedHeadlines: [],
          sources: [],
          warnings: ['Live retrieval timed out.'],
        }))
      : Promise.resolve({
          news: [],
          financials: [],
          webSnippets: [],
          curatedHeadlines: [],
          sources: [],
          warnings: [],
        }),
  ]);

  return {
    retrievedData,
    retrievalContext,
    stockLookup,
  };
}

function buildRankedSources(
  stockLookup: StockLookupResult | null,
  facts: VerifiedFacts,
  retrievalContext: RetrievalAgentOutput['retrievalContext'],
): FinancialSearchRankedSource[] {
  const seen = new Set<string>();
  const rows: FinancialSearchRankedSource[] = [];

  const push = (label: string, url: string | null, asOfDate: string | null) => {
    const key = `${label}::${url ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    const tier = sourceTierFor(label, url);
    rows.push({
      label,
      url,
      asOfDate,
      sourceType: tier,
      precedence: sourcePrecedence(tier),
    });
  };

  if (stockLookup?.source.company) push(stockLookup.source.company, null, stockLookup.asOfDate);
  if (stockLookup?.source.fundamentals) push(stockLookup.source.fundamentals, null, stockLookup.asOfDate);
  if (stockLookup?.source.price) push(stockLookup.source.price, null, stockLookup.priceAsOfDate);

  for (const company of facts.companies) {
    if (company.latestQuarterSource) push(company.latestQuarterSource, company.latestQuarterReportUrl ?? null, company.latestQuarterDate);
    if (company.latestAnnualSource) push(company.latestAnnualSource, null, null);
    if (company.latestQuarterReportUrl) {
      push(company.latestQuarterReportForm ?? 'Quarterly filing', company.latestQuarterReportUrl, company.latestQuarterReportFiledAt ?? company.latestQuarterDate);
    }
  }

  for (const event of facts.events) {
    push(event.source, event.url, event.date);
  }

  for (const sourceLine of retrievalContext?.sourceLines ?? []) {
    push(sourceLine, parseSourceUrl(sourceLine), null);
  }

  for (const sourceLine of facts.sources) {
    push(sourceLine, parseSourceUrl(sourceLine), null);
  }

  return rows.sort((left, right) => {
    if (left.precedence !== right.precedence) return left.precedence - right.precedence;
    return left.label.localeCompare(right.label);
  });
}

function buildRankedFacts(
  classification: FinancialSearchQueryClassification,
  stockLookup: StockLookupResult | null,
  facts: VerifiedFacts,
  sources: FinancialSearchRankedSource[],
): FinancialSearchRankedFact[] {
  const rows: FinancialSearchRankedFact[] = [];
  const seen = new Set<string>();

  const topSourceLabel = sources[0]?.label ?? 'CapitalBase';
  const topSourceUrl = sources[0]?.url ?? null;

  const push = (
    label: string,
    value: string,
    metricKey: string,
    sourceLabel: string,
    sourceUrl: string | null,
    asOfDate: string | null,
  ) => {
    if (!value || value === 'n/a') return;
    const key = `${label}::${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ label, value, metricKey, sourceLabel, sourceUrl, asOfDate });
  };

  if (stockLookup) {
    push('Current price', fmtUsd(stockLookup.price), 'price', stockLookup.source.price ?? topSourceLabel, null, stockLookup.priceAsOfDate);
    push('Market cap', fmtUsdM(stockLookup.marketCap), 'marketCap', stockLookup.source.price ?? topSourceLabel, null, stockLookup.priceAsOfDate);
    push('LTM revenue', fmtUsdM(stockLookup.revenueLtm), 'revenueLtm', stockLookup.source.fundamentals ?? topSourceLabel, null, stockLookup.asOfDate);
    push('LTM EBITDA', fmtUsdM(stockLookup.ebitdaLtm), 'ebitdaLtm', stockLookup.source.fundamentals ?? topSourceLabel, null, stockLookup.asOfDate);
    push('Cash', fmtUsdM(stockLookup.cash), 'cash', stockLookup.source.fundamentals ?? topSourceLabel, null, stockLookup.asOfDate);
    push('Total debt', fmtUsdM(stockLookup.totalDebt), 'totalDebt', stockLookup.source.fundamentals ?? topSourceLabel, null, stockLookup.asOfDate);
    push('Shares outstanding', fmtRawNumber(stockLookup.sharesOutstanding), 'sharesOutstanding', stockLookup.source.fundamentals ?? topSourceLabel, null, stockLookup.asOfDate);
  }

  const firstCompany = facts.companies[0];
  if (firstCompany) {
    push('Latest quarter revenue', firstCompany.quarterlyRevenue, 'quarterlyRevenue', firstCompany.latestQuarterSource ?? topSourceLabel, firstCompany.latestQuarterReportUrl ?? topSourceUrl, firstCompany.latestQuarterDate);
    push('Latest quarter EBITDA', firstCompany.quarterlyEbitda, 'quarterlyEbitda', firstCompany.latestQuarterSource ?? topSourceLabel, firstCompany.latestQuarterReportUrl ?? topSourceUrl, firstCompany.latestQuarterDate);
    push('Latest quarter net income', firstCompany.quarterlyNetIncome, 'quarterlyNetIncome', firstCompany.latestQuarterSource ?? topSourceLabel, firstCompany.latestQuarterReportUrl ?? topSourceUrl, firstCompany.latestQuarterDate);
    push('Latest quarter EPS', firstCompany.quarterlyEps, 'quarterlyEps', firstCompany.latestQuarterSource ?? topSourceLabel, firstCompany.latestQuarterReportUrl ?? topSourceUrl, firstCompany.latestQuarterDate);
    push('Latest annual revenue', firstCompany.annualRevenue, 'annualRevenue', firstCompany.latestAnnualSource ?? topSourceLabel, topSourceUrl, null);
  }

  if (classification === 'macro_context' || classification === 'company_news_context') {
    for (const event of facts.events.slice(0, 3)) {
      push(event.headline, `${event.source} on ${event.date}`, 'event', event.source, event.url, event.date);
    }
  }

  return rows.slice(0, 8);
}

function buildConflictWarnings(output: RetrievalAgentOutput): string[] {
  const warnings: string[] = [];
  const company = output.retrievedData.financials[0];
  if (
    output.stockLookup?.revenueLtm != null &&
    company?.latestAnnual.revenue != null &&
    Math.abs(output.stockLookup.revenueLtm - company.latestAnnual.revenue) / Math.max(Math.abs(company.latestAnnual.revenue), 1) > 0.1
  ) {
    warnings.push('Structured sources disagree on annual revenue; answer ranked the higher-precedence source and surfaced this conflict.');
  }
  if (
    output.stockLookup?.price != null &&
    company?.price != null &&
    Math.abs(output.stockLookup.price - company.price) / Math.max(Math.abs(company.price), 1) > 0.05
  ) {
    warnings.push('Structured sources disagree on current price; answer ranked the higher-precedence source and surfaced this conflict.');
  }
  return warnings;
}

function buildInsufficientReply(
  classification: FinancialSearchQueryClassification,
  identity: FinancialSearchResolvedIdentity | null,
  warnings: string[],
  topSources: FinancialSearchRankedSource[],
): string {
  const subject = identity?.ticker ? `${identity.companyName ?? identity.ticker} (${identity.ticker})` : 'this topic';
  const reason =
    classification === 'macro_context'
      ? `I could not verify a strong enough macro or market context package for ${subject} from current primary or trusted sources.`
      : `I could not verify enough public financial facts for ${subject} from current primary or trusted sources.`;
  const sourceText =
    topSources.length > 0
      ? ` Sources checked: ${topSources.slice(0, 3).map((source) => source.label).join('; ')}.`
      : '';
  const warningText = warnings.length > 0 ? ` ${warnings[0]}` : '';
  return `${reason}${warningText}${sourceText}`.trim();
}

function buildDeterministicReply(
  params: {
    classification: FinancialSearchQueryClassification;
    identity: FinancialSearchResolvedIdentity | null;
    stockLookup: StockLookupResult | null;
    facts: VerifiedFacts;
    rankedFacts: FinancialSearchRankedFact[];
    rankedSources: FinancialSearchRankedSource[];
    warnings: string[];
  },
): string {
  const subject = params.identity?.ticker
    ? `${params.identity.companyName ?? params.identity.ticker} (${params.identity.ticker})`
    : 'the market context';

  if (params.rankedFacts.length === 0) {
    return buildInsufficientReply(params.classification, params.identity, params.warnings, params.rankedSources);
  }

  if (params.classification === 'macro_context' || params.classification === 'company_news_context') {
    const eventFacts = params.rankedFacts.filter((fact) => fact.metricKey === 'event').slice(0, 3);
    const eventSentence =
      eventFacts.length > 0
        ? eventFacts.map((fact) => `${fact.label} (${fact.value})`).join(' ')
        : 'Current sourced event context is limited.';
    const sourceLine = params.rankedSources.slice(0, 3).map((source) => source.label).join('; ');
    const warningLine = params.warnings.length > 0 ? ` Warning: ${params.warnings[0]}` : '';
    return `${eventSentence} Sources: ${sourceLine}.${warningLine}`.trim();
  }

  const metrics = params.rankedFacts
    .filter((fact) => fact.metricKey !== 'event')
    .slice(0, 5)
    .map((fact) => `${fact.label.toLowerCase()} ${fact.value} (Source: ${fact.sourceLabel}${fact.asOfDate ? `, ${formatDate(fact.asOfDate)}` : ''})`)
    .join('; ');
  const filing = params.facts.companies[0]?.latestQuarterReportUrl
    ? ` Latest filing link: ${params.facts.companies[0]?.latestQuarterReportUrl}.`
    : '';
  // Only surface warnings when no facts were found — warnings alongside good data are confusing.
  const warningLine = params.warnings.length > 0 && params.rankedFacts.length === 0 ? ` Warning: ${params.warnings[0]}` : '';
  return `${subject}: ${metrics}.${filing}${warningLine}`.trim();
}

async function runSynthesisAgent(params: {
  userMessage: string;
  classification: FinancialSearchQueryClassification;
  identity: FinancialSearchResolvedIdentity | null;
  facts: VerifiedFacts;
  rankedFacts: FinancialSearchRankedFact[];
  rankedSources: FinancialSearchRankedSource[];
  warnings: string[];
}): Promise<string> {
  if (params.rankedFacts.length === 0) {
    return buildInsufficientReply(params.classification, params.identity, params.warnings, params.rankedSources);
  }

  const identityLine = params.identity?.ticker
    ? `${params.identity.companyName ?? params.identity.ticker} (${params.identity.ticker})`
    : 'No single company identity resolved';
  const factsBlock = params.rankedFacts
    .slice(0, 8)
    .map((fact) => `- ${fact.label}: ${fact.value} [${fact.sourceLabel}${fact.asOfDate ? `, ${formatDate(fact.asOfDate)}` : ''}]`)
    .join('\n');
  const sourcesBlock = params.rankedSources
    .slice(0, 6)
    .map((source) => `- ${source.label}${source.url ? ` — ${source.url}` : ''}`)
    .join('\n');

  const providerReply = await financialSearchDeps.generateTextWithProviderFallback({
    clientType: 'user',
    preferredProvider: 'anthropic',
    temperature: 0,
    maxTokens: 500,
    messages: [
      {
        role: 'system',
        content:
          'You are CapitalBase financial search synthesis. Answer only from the normalized facts provided. Be concise, finance-native, and explicit about source attribution. If support is weak or conflicting, say so directly. Do not invent values.',
      },
      {
        role: 'system',
        content: `Resolved subject: ${identityLine}\nQuery classification: ${params.classification}\n\nNormalized facts:\n${factsBlock}\n\nRanked sources:\n${sourcesBlock}\n\nWarnings:\n${params.warnings.join('\n') || 'None'}\n\nAdditional sourced facts:\n${serializeFactsBriefForContext(params.facts, params.userMessage)}`,
      },
      {
        role: 'user',
        content: params.userMessage,
      },
    ],
  });

  const text = providerReply?.text?.trim();
  if (!text) {
    return buildDeterministicReply({
      classification: params.classification,
      identity: params.identity,
      stockLookup: null,
      facts: params.facts,
      rankedFacts: params.rankedFacts,
      rankedSources: params.rankedSources,
      warnings: params.warnings,
    });
  }

  if (/sources?:/i.test(text)) return text;
  const sourceLine = params.rankedSources.slice(0, 3).map((source) => source.label).join('; ');
  return `${text}\n\nSources: ${sourceLine}.`;
}

export async function runPublicFinancialSearch(
  params: FinancialSearchParams,
): Promise<PublicFinancialSearchResult | null> {
  if (!shouldRunPublicFinancialSearch(params)) return null;

  const queryClassification = classifyFinancialSearchQuery(params.route, params.userMessage);
  if (!queryClassification) return null;

  const initialStockLookup = params.preloadedStockLookup ?? null;
  const fanoutUsed = canAnswerTrivially(initialStockLookup, queryClassification, params.userMessage) ? 1 : 3;
  const retrievalOutput = await runRetrievalAgent(params, fanoutUsed);
  const facts = financialSearchDeps.extractVerifiedFacts(params.route, retrievalOutput.retrievedData);
  const resolvedSubjectIdentity: FinancialSearchResolvedIdentity | null =
    retrievalOutput.stockLookup || params.explicitTicker || params.route.tickers[0]
      ? {
          ticker: retrievalOutput.stockLookup?.ticker ?? params.explicitTicker ?? params.route.tickers[0] ?? null,
          companyName: retrievalOutput.stockLookup?.companyName ?? null,
        }
      : null;

  const rankedSources = buildRankedSources(retrievalOutput.stockLookup, facts, retrievalOutput.retrievalContext);
  const rankedFacts = buildRankedFacts(queryClassification, retrievalOutput.stockLookup, facts, rankedSources);
  const warnings = uniqueStrings([
    ...(retrievalOutput.retrievalContext?.warnings ?? []),
    ...retrievalOutput.retrievedData.warnings,
    ...facts.dataGaps,
    ...buildConflictWarnings(retrievalOutput),
    rankedSources.length === 0 ? 'No traceable sources were available for this financial search.' : null,
  ]);

  const reply =
    fanoutUsed === 1
      ? buildDeterministicReply({
          classification: queryClassification,
          identity: resolvedSubjectIdentity,
          stockLookup: retrievalOutput.stockLookup,
          facts,
          rankedFacts,
          rankedSources,
          warnings,
        })
      : await withTimeout(
          runSynthesisAgent({
            userMessage: params.userMessage,
            classification: queryClassification,
            identity: resolvedSubjectIdentity,
            facts,
            rankedFacts,
            rankedSources,
            warnings,
          }),
          5000,
          'Financial search synthesis',
        ).catch(() =>
          buildDeterministicReply({
            classification: queryClassification,
            identity: resolvedSubjectIdentity,
            stockLookup: retrievalOutput.stockLookup,
            facts,
            rankedFacts,
            rankedSources,
            warnings,
          }),
        );

  return {
    handled: true,
    fanoutUsed,
    maxFanout: 5,
    queryClassification,
    resolvedSubjectIdentity,
    rankedFacts,
    rankedSources,
    warnings,
    reply,
    summary: {
      topFacts: rankedFacts.slice(0, 5),
      topSources: rankedSources.slice(0, 5),
    },
    stockLookup: retrievalOutput.stockLookup,
  };
}
