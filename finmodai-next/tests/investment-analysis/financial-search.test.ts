import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import {
  financialSearchDeps,
  runPublicFinancialSearch,
  shouldRunPublicFinancialSearch,
} from '@/lib/analyst/financialSearch';
import { routeAnalystQuery } from '@/lib/analyst/router';

const baseRetrievedData = {
  news: [],
  financials: [],
  webSnippets: [],
  curatedHeadlines: [],
  sources: [],
  warnings: [],
};

const baseFacts = {
  asOf: '2026-04-18T12:00:00.000Z',
  intent: 'company_question',
  events: [],
  companies: [],
  curatedHeadlines: [],
  numbers: [],
  timeline: [],
  sources: [],
  dataGaps: [],
};

test('financial search guard runs for public-company and macro queries but skips attachment-backed requests', () => {
  const companyRoute = routeAnalystQuery('What is Apple latest revenue?');
  assert.equal(
    shouldRunPublicFinancialSearch({
      route: companyRoute,
      userMessage: 'What is Apple latest revenue?',
      explicitTicker: 'AAPL',
      hasAttachment: false,
    }),
    true,
  );

  const macroRoute = routeAnalystQuery('What major macro events moved rates this week?');
  assert.equal(
    shouldRunPublicFinancialSearch({
      route: macroRoute,
      userMessage: 'What major macro events moved rates this week?',
      hasAttachment: false,
    }),
    true,
  );

  assert.equal(
    shouldRunPublicFinancialSearch({
      route: companyRoute,
      userMessage: 'What is Apple latest revenue?',
      explicitTicker: 'AAPL',
      hasAttachment: true,
    }),
    false,
  );
});

test('financial search uses single-lane deterministic reply for trivial structured company lookup', async () => {
  const route = routeAnalystQuery('What is Apple latest revenue and market cap?');
  const retrieveDataMock = mock.method(financialSearchDeps, 'retrieveDataForRoute', async () => {
    throw new Error('retrieveDataForRoute should not run for trivial lookup');
  });
  const lookupMock = mock.method(financialSearchDeps, 'lookupStock', async () => {
    throw new Error('lookupStock should not run when preloaded stock lookup is provided');
  });
  const contextMock = mock.method(financialSearchDeps, 'gatherAnalystRetrievalContext', async () => ({
    context: 'Stored company snapshot',
    sourceLines: ['Company snapshot'],
    warnings: [],
  }));
  const factsMock = mock.method(financialSearchDeps, 'extractVerifiedFacts', () => baseFacts);
  const llmMock = mock.method(financialSearchDeps, 'generateTextWithProviderFallback', async () => {
    throw new Error('LLM synthesis should not run for single-lane deterministic lookup');
  });

  try {
    const result = await runPublicFinancialSearch({
      route,
      userMessage: 'What is Apple latest revenue and market cap?',
      explicitTicker: 'AAPL',
      preloadedStockLookup: {
        ticker: 'AAPL',
        companyName: 'Apple Inc.',
        sector: 'Technology',
        industry: 'Consumer Electronics',
        exchange: 'NASDAQ',
        country: 'US',
        marketCap: 3000000000000,
        price: 210,
        sharesOutstanding: 15000000000,
        currency: 'USD',
        revenueLtm: 410000000000,
        ebitdaLtm: 140000000000,
        netIncomeLtm: 100000000000,
        cash: 65000000000,
        totalDebt: 98000000000,
        asOfDate: '2026-04-17',
        priceAsOfDate: '2026-04-17',
        source: {
          company: 'company_cache',
          fundamentals: 'company_snapshot',
          price: 'company_prices',
        },
        chart: { kind: 'fundamentals', points: [] },
        fallbackUsed: { yfinance: false, financedatabase: false },
      },
      hasAttachment: false,
    });

    assert.ok(result);
    assert.equal(result?.fanoutUsed, 1);
    assert.equal(result?.maxFanout, 5);
    assert.equal(result?.queryClassification, 'company_metric_lookup');
    assert.equal(result?.resolvedSubjectIdentity?.ticker, 'AAPL');
    assert.match(result?.reply ?? '', /Apple Inc\./);
    assert.match(result?.reply ?? '', /LTM revenue/i);
    assert.match(result?.reply ?? '', /Market cap/i);
    assert.equal(
      result?.rankedSources.some((source) => source.sourceType === 'stored' || source.sourceType === 'filing'),
      true,
    );
  } finally {
    retrieveDataMock.mock.restore();
    lookupMock.mock.restore();
    contextMock.mock.restore();
    factsMock.mock.restore();
    llmMock.mock.restore();
  }
});

test('financial search uses default three-lane flow and returns synthesized sourced answer for normal company search', async () => {
  const route = routeAnalystQuery('What happened with Nvidia earnings and what is the latest revenue?');
  const lookupMock = mock.method(financialSearchDeps, 'lookupStock', async () => ({
    ticker: 'NVDA',
    companyName: 'NVIDIA Corporation',
    exchange: 'NASDAQ',
    marketCap: 2200000000000,
    price: 880,
    sharesOutstanding: 2480000000,
    currency: 'USD',
    year: 2026,
    revenueLtm: 118000000000,
    ebitdaLtm: 72000000000,
    cash: 31000000000,
    totalDebt: 12000000000,
    asOfDate: '2026-04-17',
    priceAsOfDate: '2026-04-17',
    source: {
      company: 'company_cache',
      fundamentals: 'company_snapshot',
      price: 'company_prices',
    },
  }));
  const contextMock = mock.method(financialSearchDeps, 'gatherAnalystRetrievalContext', async () => ({
    context: 'Context',
    sourceLines: ['SEC 10-Q https://www.sec.gov/ixviewer/doc'],
    warnings: [],
  }));
  const retrieveDataMock = mock.method(financialSearchDeps, 'retrieveDataForRoute', async () => ({
    ...baseRetrievedData,
    news: [
      {
        title: 'Nvidia beats expectations on data center demand',
        source: 'Reuters',
        url: 'https://www.reuters.com/example',
        publishedAt: '2026-04-17T10:00:00.000Z',
        summary: 'Data center demand remained strong.',
      },
    ],
    sources: ['Reuters https://www.reuters.com/example'],
  }));
  const factsMock = mock.method(financialSearchDeps, 'extractVerifiedFacts', () => ({
    ...baseFacts,
    events: [
      {
        headline: 'Nvidia beats expectations on data center demand',
        source: 'Reuters',
        date: 'Apr 17, 2026',
        url: 'https://www.reuters.com/example',
        keyFacts: ['Data center demand remained strong.'],
      },
    ],
    companies: [
      {
        ticker: 'NVDA',
        companyName: 'NVIDIA Corporation',
        price: '$880.00',
        marketCap: '$2.20T',
        latestQuarterDate: '2026-04-17',
        latestQuarterSource: 'SEC 10-Q',
        quarterlyRevenue: '$31.0B',
        quarterlyEbitda: '$18.0B',
        quarterlyNetIncome: '$16.0B',
        quarterlyEps: '$6.20',
        annualRevenue: '$118.0B',
        annualEbitda: '$72.0B',
        annualNetIncome: '$59.0B',
        latestAnnualSource: 'SEC 10-K',
        latestQuarterReportUrl: 'https://www.sec.gov/ixviewer/doc',
        latestQuarterReportForm: '10-Q',
        latestQuarterReportFiledAt: '2026-04-17',
      },
    ],
    sources: ['SEC 10-Q https://www.sec.gov/ixviewer/doc', 'Reuters https://www.reuters.com/example'],
  }));
  const llmMock = mock.method(financialSearchDeps, 'generateTextWithProviderFallback', async () => ({
    text: 'NVIDIA latest LTM revenue is $118.0B, and Reuters reported the earnings beat. Sources: SEC 10-Q; Reuters.',
    provider: 'anthropic',
    model: 'claude-sonnet',
  }));

  try {
    const result = await runPublicFinancialSearch({
      route,
      userMessage: 'What happened with Nvidia earnings and what is the latest revenue?',
      explicitTicker: 'NVDA',
      hasAttachment: false,
    });

    assert.ok(result);
    assert.equal(result?.fanoutUsed, 3);
    assert.equal(result?.queryClassification, 'company_news_context');
    assert.match(result?.reply ?? '', /Sources:/);
    assert.equal(
      result?.rankedSources.some((source) => /Reuters/i.test(source.label)),
      true,
    );
    assert.equal(
      result?.rankedSources.some((source) => source.sourceType === 'stored' || source.sourceType === 'filing'),
      true,
    );
  } finally {
    lookupMock.mock.restore();
    contextMock.mock.restore();
    retrieveDataMock.mock.restore();
    factsMock.mock.restore();
    llmMock.mock.restore();
  }
});

test('financial search surfaces conflict warnings when structured sources disagree', async () => {
  const route = routeAnalystQuery('What is Microsoft latest annual revenue?');
  const lookupMock = mock.method(financialSearchDeps, 'lookupStock', async () => ({
    ticker: 'MSFT',
    companyName: 'Microsoft Corporation',
    exchange: 'NASDAQ',
    marketCap: 2900000000000,
    price: 410,
    sharesOutstanding: 7440000000,
    currency: 'USD',
    year: 2026,
    revenueLtm: 300000000000,
    ebitdaLtm: 140000000000,
    cash: 82000000000,
    totalDebt: 78000000000,
    asOfDate: '2026-04-17',
    priceAsOfDate: '2026-04-17',
    source: {
      company: 'company_cache',
      fundamentals: 'company_snapshot',
      price: 'company_prices',
    },
  }));
  const contextMock = mock.method(financialSearchDeps, 'gatherAnalystRetrievalContext', async () => ({
    context: '',
    sourceLines: [],
    warnings: ['Structured retrieval was partial.'],
  }));
  const retrieveDataMock = mock.method(financialSearchDeps, 'retrieveDataForRoute', async () => ({
    ...baseRetrievedData,
    financials: [
      {
        ticker: 'MSFT',
        companyName: 'Microsoft Corporation',
        price: 380,
        marketCap: 2800000000000,
        latestQuarter: {
          date: '2026-03-31',
          revenue: null,
          ebitda: null,
          netIncome: null,
          eps: null,
          source: 'SEC 10-Q',
        },
        latestAnnual: {
          date: '2025-06-30',
          revenue: 240000000000,
          ebitda: null,
          netIncome: null,
          source: 'SEC 10-K',
        },
      },
    ],
    warnings: ['Provider annual dataset is incomplete.'],
  }));
  const factsMock = mock.method(financialSearchDeps, 'extractVerifiedFacts', () => ({
    ...baseFacts,
    dataGaps: ['Recent verified annual revenue package is incomplete.'],
  }));
  const llmMock = mock.method(financialSearchDeps, 'generateTextWithProviderFallback', async () => ({
    text: '',
    provider: 'anthropic',
    model: 'claude-sonnet',
  }));

  try {
    const result = await runPublicFinancialSearch({
      route,
      userMessage: 'What is Microsoft latest annual revenue?',
      explicitTicker: 'MSFT',
      hasAttachment: false,
    });

    assert.ok(result);
    assert.equal(result?.fanoutUsed, 3);
    assert.equal(
      result?.warnings.some((warning) => /disagree on annual revenue/i.test(warning)),
      true,
    );
    assert.match(result?.reply ?? '', /Microsoft Corporation \(MSFT\)/i);
    assert.match(result?.reply ?? '', /Structured retrieval was partial/i);
  } finally {
    lookupMock.mock.restore();
    contextMock.mock.restore();
    retrieveDataMock.mock.restore();
    factsMock.mock.restore();
    llmMock.mock.restore();
  }
});

test('financial search returns insufficiency reply when retrieval is weak and unsourced', async () => {
  const route = {
    intent: 'company_question' as const,
    tickers: ['ACME'],
    requiresLiveData: true,
    requiresNews: false,
    requiresFinancials: true,
    prefersEarningsContext: false,
    requiresQuarterReportContext: false,
  };
  const lookupMock = mock.method(financialSearchDeps, 'lookupStock', async () => null);
  const contextMock = mock.method(financialSearchDeps, 'gatherAnalystRetrievalContext', async () => ({
    context: '',
    sourceLines: [],
    warnings: ['Structured retrieval was partial.'],
  }));
  const retrieveDataMock = mock.method(financialSearchDeps, 'retrieveDataForRoute', async () => ({
    ...baseRetrievedData,
    warnings: ['No trusted live provider answer was available.'],
  }));
  const factsMock = mock.method(financialSearchDeps, 'extractVerifiedFacts', () => ({
    ...baseFacts,
    dataGaps: ['No verified revenue datapoint was recovered.'],
  }));
  const llmMock = mock.method(financialSearchDeps, 'generateTextWithProviderFallback', async () => ({
    text: '',
    provider: 'anthropic',
    model: 'claude-sonnet',
  }));

  try {
    const result = await runPublicFinancialSearch({
      route,
      userMessage: 'What is Acme latest annual revenue?',
      explicitTicker: 'ACME',
      hasAttachment: false,
    });

    assert.ok(result);
    assert.equal(result?.fanoutUsed, 3);
    assert.equal(result?.rankedFacts.length, 0);
    assert.match(result?.reply ?? '', /could not verify enough public financial facts/i);
    assert.match(result?.reply ?? '', /Structured retrieval was partial/i);
  } finally {
    lookupMock.mock.restore();
    contextMock.mock.restore();
    retrieveDataMock.mock.restore();
    factsMock.mock.restore();
    llmMock.mock.restore();
  }
});
