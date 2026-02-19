/**
 * SEC API (sec-api.io) — Typed wrappers
 * Server-only. Never expose SEC_API_IO_API_KEY to client.
 */

import type { CompanyIdentity, SecFilingIndex, SecFilingRef } from './secPipeline/types';

const BASE = 'https://api.sec-api.io';
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;

function getApiKey(): string | null {
  return process.env.SEC_API_IO_API_KEY ?? null;
}

async function fetchWithRetry(
  url: string,
  opts: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = opts;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...(init.headers as Record<string, string>),
        },
      });
      clearTimeout(id);
      if (res.status === 429 && attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  clearTimeout(id);
  throw lastError ?? new Error('fetchWithRetry failed');
}

/**
 * STEP 1 — Resolve Company Identity (ticker → CIK)
 * Tries sec-api.io mapping; fallback to EDGAR company_tickers.json (no key).
 */
export async function resolveCompanyIdentity(ticker: string): Promise<CompanyIdentity | null> {
  const normalizedTicker = ticker.toUpperCase().trim();
  const apiKey = getApiKey();

  if (apiKey) {
    try {
      const url = `${BASE}/?apiKey=${encodeURIComponent(apiKey)}`;
      const body = {
        query: { query_string: { query: `ticker:${normalizedTicker}` } },
        from: 0,
        size: 1,
        _source: ['ticker', 'cik', 'companyName', 'sector', 'exchange'],
      };
      const res = await fetchWithRetry(url, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        const hits = data?.hits?.hits ?? [];
        if (hits.length > 0) {
          const src = hits[0]._source ?? hits[0];
          const cik = String(src.cik ?? '').padStart(10, '0');
          return {
            ticker: (src.ticker ?? normalizedTicker).toUpperCase(),
            cik,
            companyName: src.companyName ?? normalizedTicker,
            sector: src.sector ?? undefined,
            exchange: src.exchange ?? undefined,
          };
        }
      }
    } catch (e) {
      console.warn('[secApi] resolveCompanyIdentity (sec-api) failed', e);
    }
  }

  try {
    const edgarRes = await fetchWithRetry(
      'https://www.sec.gov/files/company_tickers.json',
      { headers: { 'User-Agent': 'FinModAI (contact@example.com)' } }
    );
    if (!edgarRes.ok) return null;
    const data = await edgarRes.json();
    const entry = Object.values(data as Record<string, { ticker: string; cik_str: number; title: string }>).find(
      (e: { ticker: string }) => e.ticker.toUpperCase() === normalizedTicker
    );
    if (!entry) return null;
    const cik = String(entry.cik_str).padStart(10, '0');
    return {
      ticker: normalizedTicker,
      cik,
      companyName: entry.title ?? normalizedTicker,
      sector: undefined,
      exchange: undefined,
    };
  } catch (e) {
    console.error('[secApi] resolveCompanyIdentity (EDGAR fallback) failed', e);
    return null;
  }
}

/**
 * STEP 2 — Fetch Filing Index (most recent 10-K, optional 10-Q)
 */
export async function fetchFilingIndex(
  cik: string,
  asOfDate: string
): Promise<SecFilingIndex | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  const paddedCik = String(cik).padStart(10, '0');
  try {
    const url = `${BASE}/?apiKey=${encodeURIComponent(apiKey)}`;
    const body = {
      query: {
        query_string: {
          query: `cik:${paddedCik} AND formType:("10-K" OR "10-Q") AND filedAt:[* TO ${asOfDate}]`,
        },
      },
      from: 0,
      size: 20,
      sort: [{ filedAt: { order: 'desc' } }],
      _source: ['formType', 'filedAt', 'periodOfReport', 'linkToFilingDetails', 'accessionNo'],
    };
    const res = await fetchWithRetry(url, { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) {
      console.warn('[secApi] filing index failed', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const hits = (data?.hits?.hits ?? []).map((h: any) => h._source ?? h);
    const toRef = (f: any): SecFilingRef => ({
      form: f.formType ?? f.form ?? '10-K',
      accessionNo: f.accessionNo ?? f.accessionNumber ?? '',
      filedAt: f.filedAt ?? f.filed ?? '',
      periodEnd: f.periodOfReport ?? f.periodEnd ?? f.filedAt ?? '',
      url: f.linkToFilingDetails ?? f.url,
    });
    const tenK = hits.find((f: any) => (f.formType ?? f.form) === '10-K');
    const tenQ = hits.find((f: any) => (f.formType ?? f.form) === '10-Q');
    if (!tenK) return null;
    return {
      annualFiling: toRef(tenK),
      latestQuarter: tenQ ? toRef(tenQ) : undefined,
    };
  } catch (e) {
    console.error('[secApi] fetchFilingIndex failed', e);
    return null;
  }
}

/**
 * STEP 3 — Convert filing to structured data (XBRL-to-JSON)
 * Returns raw JSON from sec-api XBRL-to-JSON; normalizer will map to RawXbrlPayload.
 */
export async function xbrlFilingToJson(filingUrl: string): Promise<Record<string, unknown> | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  try {
    // sec-api.io XBRL-to-JSON: pass URL of filing (htm or xml)
    const endpoint = `${BASE}/xbrl-to-json?htm-url=${encodeURIComponent(filingUrl)}&apiKey=${encodeURIComponent(apiKey)}`;
    const res = await fetchWithRetry(endpoint, { method: 'GET' });
    if (!res.ok) {
      console.warn('[secApi] xbrl-to-json failed', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data as Record<string, unknown>;
  } catch (e) {
    console.error('[secApi] xbrlFilingToJson failed', e);
    return null;
  }
}

/**
 * Get filing URL for EDGAR (used when sec-api returns accession without full URL)
 */
export function edgarFilingUrl(accessionNo: string): string {
  const normalized = String(accessionNo).replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${normalized}.htm`;
}
