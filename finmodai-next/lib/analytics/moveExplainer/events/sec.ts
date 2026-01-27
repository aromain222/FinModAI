/**
 * SEC Filings Events Enrichment
 * Fetches SEC filings from EDGAR API
 */

import { fetchWithTimeout } from '@/lib/providers/utils';
import { ProviderError, providerFailure } from '@/lib/providers/errors';
import type { EventItem } from '../types';
import { normalizeMarketDate } from '../providers/registry';

export type SecFilingEvent = EventItem & {
  type: 'filing';
  source: 'SEC' | 'news-detected';
  formType: string; // e.g., '10-K', '10-Q', '8-K'
  accessionNumber?: string;
};

const SEC_EDGAR_BASE = 'https://data.sec.gov';
const SEC_SUBMISSIONS_BASE = 'https://data.sec.gov/submissions';
const USER_AGENT = 'FinModAI Research Tool contact@finmodai.com'; // Required by SEC

/**
 * Relevant filing types for move explanation
 */
const RELEVANT_FILING_TYPES = [
  '10-K',   // Annual report
  '10-Q',   // Quarterly report
  '8-K',    // Current report (material events)
  '10-K/A', // Amended annual report
  '10-Q/A', // Amended quarterly report
  '8-K/A',  // Amended current report
];

/**
 * Get CIK from ticker using SEC company tickers mapping
 */
async function getCikFromTicker(ticker: string): Promise<string | null> {
  try {
    // SEC provides a JSON mapping of tickers to CIKs
    const url = 'https://www.sec.gov/files/company_tickers.json';
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    }, 10000);
    
    if (!res.ok) {
      return null;
    }
    
    const data = await res.json();
    
    // The JSON structure is { "0": { "cik_str": "0000789019", "ticker": "AAPL" }, ... }
    const entries = Object.values(data) as Array<{ cik_str: string; ticker: string }>;
    const match = entries.find(entry => entry.ticker.toUpperCase() === ticker.toUpperCase());
    
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
 * Fetch SEC filings from EDGAR API
 */
async function fetchSecFilingsEdgar(
  cik: string,
  start: string,
  end: string
): Promise<SecFilingEvent[]> {
  try {
    const url = `${SEC_SUBMISSIONS_BASE}/CIK${cik}.json`;
    
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    }, 10000);
    
    if (!res.ok) {
      if (res.status === 429) {
        throw providerFailure('sec', 'Rate limit exceeded', 429);
      }
      throw providerFailure('sec', `HTTP ${res.status}`, res.status);
    }
    
    const data = await res.json();
    const filings = data.filings?.recent;
    
    if (!filings || !Array.isArray(filings.form) || filings.form.length === 0) {
      return [];
    }
    
    const startStr = normalizeMarketDate(start);
    const endStr = normalizeMarketDate(end);
    
    const events: SecFilingEvent[] = [];
    
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
      // Format: https://www.sec.gov/cgi-bin/viewer?action=view&cik={cik}&accession_number={accessionNumber}
      let url: string | undefined;
      if (accessionNumber) {
        // Remove dashes from accession number for URL
        const cleanAccession = accessionNumber.replace(/-/g, '');
        url = `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${cik}&accession_number=${cleanAccession}`;
      }
      
      // Build title
      const title = `${form} - ${reportDate || filingDate}`;
      
      events.push({
        type: 'filing',
        title,
        date: normalizedDate,
        url,
        source: 'SEC',
        formType: form,
        accessionNumber,
      });
    }
    
    return events.sort((a, b) => a.date.localeCompare(b.date));
  } catch (error: any) {
    if (error instanceof ProviderError) throw error;
    throw providerFailure('sec', error?.message || 'SEC filings fetch failed', 0);
  }
}

/**
 * Infer SEC filings from news items (fallback)
 */
export function inferSecFilingsFromNews(
  news: Array<{ title: string; url?: string; source?: string; publishedAt: string; summary?: string }>
): SecFilingEvent[] {
  const filings: SecFilingEvent[] = [];
  
  const filingKeywords = ['sec', '10-k', '10-q', '8-k', 'filing', 'form 10', 'edgar'];
  
  for (const item of news) {
    const text = (item.title + ' ' + (item.summary || '')).toLowerCase();
    
    // Check for filing mentions
    const hasFilingKeyword = filingKeywords.some(keyword => text.includes(keyword));
    const hasFormType = RELEVANT_FILING_TYPES.some(form => text.toLowerCase().includes(form.toLowerCase()));
    
    if (hasFilingKeyword || hasFormType) {
      const date = normalizeMarketDate(item.publishedAt);
      
      // Extract form type if mentioned
      let formType = 'filing';
      for (const form of RELEVANT_FILING_TYPES) {
        if (text.includes(form.toLowerCase())) {
          formType = form;
          break;
        }
      }
      
      filings.push({
        type: 'filing',
        title: item.title,
        date,
        url: item.url,
        source: 'news-detected',
        formType,
      });
    }
  }
  
  return filings;
}

/**
 * Get SEC filings with fallback
 */
export async function getSecFilings(
  ticker: string,
  start: string,
  end: string,
  newsFallback?: Array<{ title: string; url?: string; source?: string; publishedAt: string; summary?: string }>
): Promise<SecFilingEvent[]> {
  const allFilings: SecFilingEvent[] = [];
  
  // 1. Try SEC EDGAR API (authoritative)
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
  if (newsFallback && newsFallback.length > 0) {
    const inferredFilings = inferSecFilingsFromNews(newsFallback);
    
    // Deduplicate with existing filings (by date + form type)
    const existingKeys = new Set(allFilings.map(f => `${f.date}:${f.formType || 'filing'}`));
    const uniqueInferred = inferredFilings.filter(f => !existingKeys.has(`${f.date}:${f.formType || 'filing'}`));
    
    allFilings.push(...uniqueInferred);
  }
  
  return allFilings.sort((a, b) => a.date.localeCompare(b.date));
}

