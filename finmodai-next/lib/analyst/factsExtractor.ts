/**
 * Analyst Chat Facts Extractor
 *
 * Transforms raw retrieved data into a structured `VerifiedFacts` object.
 * This object is injected into the LLM context so the model reasons on
 * verified data rather than guessing.
 *
 * verified_facts = { events, numbers, companies, timeline, sources }
 */

import type { AnalystRoute } from './router';
import type { RetrievedData, NewsArticle, CompanyFinancials } from './dataRetrieval';
import type { CuratedHeadline } from '@/lib/headlineFilter';

/* ────────── Types ────────── */

export type VerifiedEvent = {
  headline: string;
  source: string;
  date: string;
  url: string;
  keyFacts: string[];
};

export type VerifiedCompany = {
  ticker: string;
  companyName: string;
  price: string;
  marketCap: string;
  latestQuarterDate: string | null;
  latestQuarterFiscalPeriod?: string | null;
  latestQuarterSource?: string | null;
  quarterlyRevenue: string;
  quarterlyOperatingIncome?: string;
  quarterlyEbitda: string;
  quarterlyNetIncome: string;
  quarterlyEps: string;
  annualRevenue: string;
  annualEbitda: string;
  annualNetIncome: string;
  latestAnnualSource?: string | null;
  transcriptHighlights?: string[];
  latestQuarterReportUrl?: string | null;
  latestQuarterReportForm?: string | null;
  latestQuarterReportFiledAt?: string | null;
};

export type VerifiedFacts = {
  asOf: string;
  intent: string;
  events: VerifiedEvent[];
  companies: VerifiedCompany[];
  curatedHeadlines: CuratedHeadline[];
  numbers: string[];
  timeline: string[];
  sources: string[];
  dataGaps: string[];
};

/* ────────── Formatting Helpers ────────── */

function fmtUsd(value: number | null): string {
  if (value === null) return 'n/a';
  if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function fmtDate(isoDate: string | null): string {
  if (!isoDate) return 'n/a';
  try {
    return new Date(isoDate).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

/* ────────── Event Extraction ────────── */

function extractEvents(articles: NewsArticle[]): VerifiedEvent[] {
  return articles.slice(0, 6).map(article => {
    const keyFacts: string[] = [];
    if (article.summary) {
      const sentences = article.summary
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 15 && s.length < 200);
      keyFacts.push(...sentences.slice(0, 3));
    }
    if (keyFacts.length === 0) {
      keyFacts.push(article.title);
    }
    return {
      headline: article.title,
      source: article.source,
      date: fmtDate(article.publishedAt),
      url: article.url,
      keyFacts,
    };
  });
}

/* ────────── Company Extraction ────────── */

function extractCompany(f: CompanyFinancials): VerifiedCompany {
  return {
    ticker: f.ticker,
    companyName: f.companyName,
    price: fmtUsd(f.price),
    marketCap: fmtUsd(f.marketCap),
    latestQuarterDate: f.latestQuarter.date,
    latestQuarterFiscalPeriod: f.latestQuarter.fiscalPeriod ?? null,
    latestQuarterSource: f.latestQuarter.source ?? null,
    quarterlyRevenue: fmtUsd(f.latestQuarter.revenue),
    quarterlyOperatingIncome: fmtUsd(f.latestQuarter.operatingIncome ?? null),
    quarterlyEbitda: fmtUsd(f.latestQuarter.ebitda),
    quarterlyNetIncome: fmtUsd(f.latestQuarter.netIncome),
    quarterlyEps: f.latestQuarter.eps !== null ? `$${f.latestQuarter.eps.toFixed(2)}` : 'n/a',
    annualRevenue: fmtUsd(f.latestAnnual.revenue),
    annualEbitda: fmtUsd(f.latestAnnual.ebitda),
    annualNetIncome: fmtUsd(f.latestAnnual.netIncome),
    latestAnnualSource: f.latestAnnual.source ?? null,
    transcriptHighlights: f.earningsContext?.transcriptHighlights ?? [],
    latestQuarterReportUrl: f.filingContext?.latestQuarterUrl ?? null,
    latestQuarterReportForm: f.filingContext?.latestQuarterForm ?? null,
    latestQuarterReportFiledAt: f.filingContext?.latestQuarterFiledAt ?? null,
  };
}

/* ────────── Timeline Builder ────────── */

function buildTimeline(data: RetrievedData): string[] {
  const entries: Array<{ date: Date; label: string }> = [];

  for (const article of data.news) {
    try {
      entries.push({ date: new Date(article.publishedAt), label: `${fmtDate(article.publishedAt)}: ${article.title}` });
    } catch {
      // skip unparseable dates
    }
  }

  for (const f of data.financials) {
    if (f.latestQuarter.date) {
      entries.push({
        date: new Date(f.latestQuarter.date),
        label: `${fmtDate(f.latestQuarter.date)}: ${f.ticker} latest quarterly report`,
      });
    }
  }

  entries.sort((a, b) => b.date.getTime() - a.date.getTime());
  return entries.slice(0, 8).map(e => e.label);
}

/* ────────── Numbers Extractor ────────── */

function extractKeyNumbers(data: RetrievedData): string[] {
  const numbers: string[] = [];

  for (const f of data.financials) {
    if (f.price !== null) numbers.push(`${f.ticker} price: ${fmtUsd(f.price)}`);
    if (f.marketCap !== null) numbers.push(`${f.ticker} market cap: ${fmtUsd(f.marketCap)}`);
    if (f.latestQuarter.revenue !== null) {
      numbers.push(`${f.ticker} Q revenue (${f.latestQuarter.date || 'latest'}): ${fmtUsd(f.latestQuarter.revenue)}`);
    }
    if (f.latestQuarter.netIncome !== null) {
      numbers.push(`${f.ticker} Q net income: ${fmtUsd(f.latestQuarter.netIncome)}`);
    }
    if (f.latestQuarter.operatingIncome != null) {
      numbers.push(`${f.ticker} Q operating income: ${fmtUsd(f.latestQuarter.operatingIncome)}`);
    }
    if (f.latestQuarter.eps !== null) {
      numbers.push(`${f.ticker} Q EPS: $${f.latestQuarter.eps.toFixed(2)}`);
    }
    if (f.latestAnnual.revenue !== null) {
      numbers.push(`${f.ticker} annual revenue (${f.latestAnnual.date || 'latest'}): ${fmtUsd(f.latestAnnual.revenue)}`);
    }
  }

  return numbers;
}

/* ────────── Data Gap Detection ────────── */

function detectDataGaps(route: AnalystRoute, data: RetrievedData): string[] {
  const gaps: string[] = [];

  if (route.requiresNews && data.news.length === 0) {
    gaps.push('No recent news articles were retrieved for this query.');
  }
  if (route.requiresFinancials && data.financials.length === 0) {
    gaps.push('No financial data was retrieved for the requested tickers.');
  }
  if (route.requiresLiveData && data.webSnippets.length === 0 && data.news.length === 0) {
    gaps.push('No live web data was available for this query.');
  }

  for (const f of data.financials) {
    if (f.price === null) gaps.push(`${f.ticker}: live price unavailable.`);
    if (f.latestQuarter.revenue === null) gaps.push(`${f.ticker}: quarterly financials unavailable.`);
  }

  return gaps;
}

/* ────────── Main Extractor ────────── */

export function extractVerifiedFacts(
  route: AnalystRoute,
  data: RetrievedData
): VerifiedFacts {
  return {
    asOf: new Date().toISOString(),
    intent: route.intent,
    events: extractEvents(data.news),
    companies: data.financials.map(extractCompany),
    curatedHeadlines: data.curatedHeadlines ?? [],
    numbers: extractKeyNumbers(data),
    timeline: buildTimeline(data),
    sources: data.sources,
    dataGaps: detectDataGaps(route, data),
  };
}

/**
 * Serialize verified facts into a concise text block for LLM injection.
 * The model must reference this when generating its response.
 */
export function serializeFactsForContext(facts: VerifiedFacts): string {
  const sections: string[] = [];

  sections.push(`AS OF: ${fmtDate(facts.asOf)}`);
  sections.push(`INTENT: ${facts.intent}`);

  if (facts.numbers.length > 0) {
    sections.push('VERIFIED NUMBERS:\n' + facts.numbers.map(n => `  - ${n}`).join('\n'));
  }

  if (facts.curatedHeadlines.length > 0) {
    sections.push('TOP MARKET-MOVING HEADLINES (pre-curated):\n' + facts.curatedHeadlines.map((h, i) =>
      `  ${i + 1}. [${h.category}] ${h.headline}\n     ${h.summary}\n     Impact: ${h.marketImpact}`
    ).join('\n'));
  }

  if (facts.events.length > 0) {
    sections.push('VERIFIED EVENTS:\n' + facts.events.map(e => {
      const facts_str = e.keyFacts.length > 0 ? `\n    Facts: ${e.keyFacts.join('; ')}` : '';
      return `  - [${e.date}] ${e.headline} (${e.source})${facts_str}`;
    }).join('\n'));
  }

  if (facts.companies.length > 0) {
    sections.push('COMPANY DATA:\n' + facts.companies.map(c =>
      `  ${c.ticker} (${c.companyName}): Price ${c.price}, MCap ${c.marketCap}` +
      (c.latestQuarterDate ? `, Q(${c.latestQuarterDate}) Rev ${c.quarterlyRevenue} / NI ${c.quarterlyNetIncome} / EPS ${c.quarterlyEps}` : '') +
      (c.annualRevenue !== 'n/a' ? `, Annual Rev ${c.annualRevenue}` : '')
    ).join('\n'));
  }

  if (facts.timeline.length > 0) {
    sections.push('TIMELINE:\n' + facts.timeline.map(t => `  - ${t}`).join('\n'));
  }

  if (facts.dataGaps.length > 0) {
    sections.push('DATA GAPS (must disclose to user):\n' + facts.dataGaps.map(g => `  - ${g}`).join('\n'));
  }

  if (facts.sources.length > 0) {
    sections.push('SOURCES:\n' + facts.sources.map((s, i) => `  [${i + 1}] ${s}`).join('\n'));
  }

  return sections.join('\n\n');
}

function relevantMetricLabels(userMessage: string): {
  wantsPrice: boolean;
  wantsRevenue: boolean;
  wantsMargin: boolean;
  wantsCash: boolean;
  wantsEarnings: boolean;
} {
  const text = userMessage.toLowerCase();
  return {
    wantsPrice: /\b(price|stock|shares?|trading|valuation|multiple|market cap)\b/.test(text),
    wantsRevenue: /\b(revenue|sales|growth|top line|topline)\b/.test(text),
    wantsMargin: /\b(margin|profitability|gross margin|ebitda|ebit|operating margin)\b/.test(text),
    wantsCash: /\b(cash|debt|balance sheet|liquidity|free cash flow|fcf)\b/.test(text),
    wantsEarnings: /\b(earnings|eps|quarter|quarterly|results|net income|guidance)\b/.test(text),
  };
}

function companyBriefLine(company: VerifiedCompany, userMessage: string): string {
  const metrics = relevantMetricLabels(userMessage);
  const parts: string[] = [];

  if (metrics.wantsPrice && company.price !== 'n/a') {
    parts.push(`price ${company.price}`);
  }
  if (metrics.wantsPrice && company.marketCap !== 'n/a') {
    parts.push(`market cap ${company.marketCap}`);
  }
  if (metrics.wantsRevenue && company.quarterlyRevenue !== 'n/a') {
    parts.push(`latest quarter revenue ${company.quarterlyRevenue}`);
  }
  if (metrics.wantsRevenue && company.annualRevenue !== 'n/a') {
    parts.push(`annual revenue ${company.annualRevenue}`);
  }
  if (metrics.wantsMargin && company.quarterlyOperatingIncome && company.quarterlyOperatingIncome !== 'n/a') {
    parts.push(`latest quarter operating income ${company.quarterlyOperatingIncome}`);
  }
  if (metrics.wantsMargin && company.quarterlyEbitda !== 'n/a') {
    parts.push(`latest quarter EBITDA ${company.quarterlyEbitda}`);
  }
  if (metrics.wantsEarnings && company.quarterlyNetIncome !== 'n/a') {
    parts.push(`latest quarter net income ${company.quarterlyNetIncome}`);
  }
  if (metrics.wantsEarnings && company.quarterlyEps !== 'n/a') {
    parts.push(`EPS ${company.quarterlyEps}`);
  }
  if (metrics.wantsEarnings && company.transcriptHighlights && company.transcriptHighlights.length > 0) {
    parts.push(`management commentary: ${company.transcriptHighlights[0]}`);
  }

  if (parts.length === 0) {
    if (company.price !== 'n/a') parts.push(`price ${company.price}`);
    if (company.quarterlyRevenue !== 'n/a') parts.push(`latest quarter revenue ${company.quarterlyRevenue}`);
    if (company.quarterlyEps !== 'n/a') parts.push(`EPS ${company.quarterlyEps}`);
    if (company.annualRevenue !== 'n/a') parts.push(`annual revenue ${company.annualRevenue}`);
  }

  return `${company.ticker} (${company.companyName}): ${parts.join('; ') || 'no usable financial metrics available'}`;
}

export function serializeFactsBriefForContext(facts: VerifiedFacts, userMessage = ''): string {
  const sections: string[] = [];
  const isCompanyLike = facts.intent === 'company_question' || facts.intent === 'financial_model';
  const isMarketLike = facts.intent === 'market_question' || facts.intent === 'event_intelligence';

  sections.push(`As of ${fmtDate(facts.asOf)}. Use these sourced facts first. If a metric is missing, say so instead of guessing.`);

  if (isCompanyLike && facts.companies.length > 0) {
    sections.push(
      'Company facts:\n' +
      facts.companies
        .slice(0, 2)
        .map((company) => `- ${companyBriefLine(company, userMessage)}`)
        .join('\n')
    );
    const filingLines = facts.companies
      .slice(0, 2)
      .flatMap((company) =>
        company.latestQuarterReportUrl
          ? [
              `- ${company.ticker} latest quarterly report: ${company.latestQuarterReportForm ?? 'filing'}${company.latestQuarterReportFiledAt ? ` filed ${fmtDate(company.latestQuarterReportFiledAt)}` : ''} — ${company.latestQuarterReportUrl}`,
            ]
          : []
      );
    if (filingLines.length > 0) {
      sections.push('Quarterly report links:\n' + filingLines.join('\n'));
    }
    const transcriptLines = facts.companies
      .slice(0, 2)
      .flatMap((company) =>
        (company.transcriptHighlights ?? []).slice(0, 2).map(
          (highlight) => `- ${company.ticker} management commentary: ${highlight}`
        )
      );
    if (transcriptLines.length > 0) {
      sections.push('Transcript context:\n' + transcriptLines.join('\n'));
    }
  }

  if (isMarketLike && facts.curatedHeadlines.length > 0) {
    sections.push(
      'Market context:\n' +
      facts.curatedHeadlines
        .slice(0, 3)
        .map((headline, index) => `- ${index + 1}. [${headline.category}] ${headline.headline} — ${headline.marketImpact}`)
        .join('\n')
    );
  } else if (isMarketLike && facts.events.length > 0) {
    sections.push(
      'Market context:\n' +
      facts.events
        .slice(0, 3)
        .map((event) => `- ${event.headline} (${event.source}, ${event.date}) — ${event.keyFacts[0] ?? 'no additional detail'}`)
        .join('\n')
    );
  }

  if (!isCompanyLike && !isMarketLike && facts.numbers.length > 0) {
    sections.push(
      'Relevant numbers:\n' +
      facts.numbers
        .slice(0, 4)
        .map((number) => `- ${number}`)
        .join('\n')
    );
  }

  if (facts.dataGaps.length > 0) {
    sections.push(
      'Missing or incomplete data:\n' +
      facts.dataGaps
        .slice(0, 2)
        .map((gap) => `- ${gap}`)
        .join('\n')
    );
  }

  if (facts.sources.length > 0) {
    sections.push(`Sources: ${facts.sources.slice(0, 4).join(' | ')}`);
  }

  return sections.join('\n\n');
}
