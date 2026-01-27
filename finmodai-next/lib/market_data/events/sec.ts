/**
 * SEC Filings Events Detection
 * Fetches SEC filings from EDGAR API or infers from news
 */

import { fetchWithTimeout } from '@/lib/providers/utils';
import type { EventItem, NewsItem } from '../providers/types';
import { normalizeMarketDate } from '../providers/registry';

const SEC_SUBMISSIONS_BASE = 'https://data.sec.gov/submissions';
const USER_AGENT = 'FinModAI Research Tool contact@finmodai.com'; // Required by SEC

/**
 * Relevant filing types for corporate events
 */
const RELEVANT_FILING_TYPES = [
  '10-K', // Annual report
  '10-Q', // Quarterly report
  '8-K', // Current report (material events)
  '10-K/A', // Amended annual report
  '10-Q/A', // Amended quarterly report
  '8-K/A', // Amended current report
];

/**
 * Get CIK from ticker using SEC company tickers mapping
 */
async function getCikFromTicker(ticker: string): Promise<string | null> {
  try {
    // SEC provides a JSON mapping of tickers to CIKs
    const url = 'https://www.sec.gov/files/company_tickers.json';
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
      },
      10000
    );

    if (!res.ok) {
      return null;
    }

    const data = await res.json();

    // The JSON structure is { "0": { "cik_str": "0000789019", "ticker": "AAPL" }, ... }
    const entries = Object.values(data) as Array<{ cik_str: string; ticker: string }>;
    const match = entries.find((entry) => entry.ticker.toUpperCase() === ticker.toUpperCase());

    if (match && match.cik_str) {
      return match.cik_str.padStart(10, '0'); // Pad to 10 digits
    }

    return null;
  } catch (error: any) {
    console.warn(`[SEC] Failed to get CIK for ${ticker}: ${error?.message}`);
    return null;
  }
}

/**
 * Fetch SEC filings from EDGAR API (authoritative source)
 */
async function fetchSecFilingsEdgar(
  cik: string,
  start: string,
  end: string
): Promise<EventItem[]> {
  try {
    const url = `${SEC_SUBMISSIONS_BASE}/CIK${cik}.json`;

    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
      },
      10000
    );

    if (!res.ok) {
      if (res.status === 429) {
        throw new Error('SEC EDGAR rate limit exceeded');
      }
      throw new Error(`SEC EDGAR HTTP ${res.status}`);
    }

    const data = await res.json();
    const filings = data.filings?.recent;

    if (!filings || !Array.isArray(filings.form) || filings.form.length === 0) {
      return [];
    }

    const startStr = normalizeMarketDate(start);
    const endStr = normalizeMarketDate(end);

    const events: EventItem[] = [];

    // Process recent filings array
    for (let i = 0; i < filings.form.length; i++) {
      const form = filings.form[i];
      const filingDate = filings.filingDate?.[i];
      const accessionNumber = filings.accessionNumber?.[i];
      const reportDate = filings.reportDate?.[i];

      // Filter by form type and date range
      if (!RELEVANT_FILING_TYPES.includes(form) || !filingDate) {
        continue;
      }

      const normalizedDate = normalizeMarketDate(filingDate);
      if (normalizedDate < startStr || normalizedDate > endStr) {
        continue;
      }

      // Build filing URL
      let url: string | undefined;
      if (accessionNumber) {
        // Remove dashes from accession number for URL
        const cleanAccession = accessionNumber.replace(/-/g, '');
        url = `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${cik}&accession_number=${cleanAccession}`;
      }

      // Build title (never fabricate information)
      const title = `${form} - ${reportDate || filingDate}`;

      events.push({
        type: 'filing',
        title,
        date: normalizedDate,
        url,
        source: 'SEC',
      });
    }

    return events.sort((a, b) => a.date.localeCompare(b.date));
  } catch (error: any) {
    throw new Error(`SEC EDGAR fetch failed: ${error?.message || String(error)}`);
  }
}

/**
 * Infer SEC filings from news items (fallback)
 * Label as "news-detected" to indicate it's inferred
 */
export function inferSecFilingsFromNews(news: NewsItem[]): EventItem[] {
  const filings: EventItem[] = [];

  const filingKeywords = ['sec', '10-k', '10-q', '8-k', 'filing', 'form 10', 'edgar'];

  for (const item of news) {
    const text = (item.title + ' ' + (item.summary || '')).toLowerCase();

    // Check for filing mentions
    const hasFilingKeyword = filingKeywords.some((keyword) => text.includes(keyword));
    const hasFormType = RELEVANT_FILING_TYPES.some((form) => text.toLowerCase().includes(form.toLowerCase()));

    if (hasFilingKeyword || hasFormType) {
      const date = normalizeMarketDate(item.publishedAt);

      // Extract form type if mentioned (never fabricate)
      let formType = 'filing';
      for (const form of RELEVANT_FILING_TYPES) {
        if (text.includes(form.toLowerCase())) {
          formType = form;
          break;
        }
      }

      filings.push({
        type: 'filing',
        title: item.title, // Use original title from news
        date,
        url: item.url,
        source: 'news-detected', // Always label as inferred
      });
    }
  }

  return filings;
}

/**
 * Get SEC filings with fallback
 * Prefers authoritative sources (SEC EDGAR), falls back to news inference
 */
export async function getSecFilings(
  ticker: string,
  start: string,
  end: string,
  newsFallback?: NewsItem[]
): Promise<EventItem[]> {
  const allFilings: EventItem[] = [];

  // 1. Try SEC EDGAR API (authoritative source)
  try {
    const cik = await getCikFromTicker(ticker);

    if (cik) {
      const edgarFilings = await fetchSecFilingsEdgar(cik, start, end);
      if (edgarFilings.length > 0) {
        allFilings.push(...edgarFilings);
      }
    } else {
      console.warn(`[SEC] Could not resolve CIK for ticker ${ticker}`);
    }
  } catch (error: any) {
    // Continue to fallback
    console.warn(`[SEC] EDGAR API failed: ${error?.message}`);
  }

  // 2. Infer from news (if no authoritative data or as supplement)
  // Label as "news-detected" to indicate it's inferred, not authoritative
  if (newsFallback && newsFallback.length > 0) {
    const inferredFilings = inferSecFilingsFromNews(newsFallback);

    // Deduplicate with existing filings (by date + type)
    const existingKeys = new Set(allFilings.map((f) => `${f.date}:${f.type}`));
    const uniqueInferred = inferredFilings.filter((f) => !existingKeys.has(`${f.date}:${f.type}`));

    allFilings.push(...uniqueInferred);
  }

  return allFilings.sort((a, b) => a.date.localeCompare(b.date));
}

