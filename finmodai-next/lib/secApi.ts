/**
 * SEC API (sec-api.io) — Typed wrappers
 * Server-only. Never expose SEC_API_IO_API_KEY to client.
 */

import type { CompanyIdentity, SecFilingIndex, SecFilingRef } from './secPipeline/types';

const BASE = 'https://api.sec-api.io';
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;
const DEFAULT_MNA_FORMS = [
  'S-4',
  'S-4/A',
  'F-4',
  'F-4/A',
  'DEFM14A',
  'PREM14A',
  'SC TO-T',
  'SC TO-T/A',
  'SC 14D9',
  'SC 14D9/A',
] as const;

export type SecMnaForm = (typeof DEFAULT_MNA_FORMS)[number] | string;

export interface SecMnaEntity {
  cik?: string;
  companyName?: string;
  ticker?: string;
}

export interface SecMnaFiling {
  form: string;
  accessionNo: string;
  filedAt: string;
  periodEnd: string | null;
  url: string | null;
  primaryDocumentUrl: string | null;
  title: string | null;
  filingCategory: 'registration' | 'proxy' | 'tender_offer' | 'board_response' | 'other';
  counterparties: string[];
  entities: SecMnaEntity[];
}

export interface SecMnaSearchResult {
  company: CompanyIdentity;
  filings: SecMnaFiling[];
  formsQueried: string[];
  asOfDate: string;
  source: 'sec-api' | 'edgar-submissions';
}

export interface SecRecentFilingsParams {
  ticker: string;
  asOfDate?: string;
  limit?: number;
  forms?: string[];
}

function getApiKey(): string | null {
  if (process.env.SEC_DISABLE_SEC_API === '1') {
    return null;
  }
  return process.env.SEC_API_IO_API_KEY ?? null;
}

function getEdgarUserAgent(): string {
  const email = process.env.SEC_UA_EMAIL?.trim();
  if (email) return `FinModAI (${email})`;
  return 'FinModAI (contact@example.com)';
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
      const url = `${BASE}?token=${encodeURIComponent(apiKey)}`;
      const body = {
        query: `ticker:${normalizedTicker}`,
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
    const url = `${BASE}?token=${encodeURIComponent(apiKey)}`;
    const body = {
      query: `cik:${paddedCik} AND formType:("10-K" OR "10-Q") AND filedAt:[* TO ${asOfDate}]`,
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
    const endpoint = `${BASE}/xbrl-to-json?htm-url=${encodeURIComponent(filingUrl)}&token=${encodeURIComponent(apiKey)}`;
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

function toMnaCategory(form: string): SecMnaFiling['filingCategory'] {
  if (form === 'S-4' || form === 'S-4/A' || form === 'F-4' || form === 'F-4/A') return 'registration';
  if (form === 'DEFM14A' || form === 'PREM14A') return 'proxy';
  if (form === 'SC TO-T' || form === 'SC TO-T/A') return 'tender_offer';
  if (form === 'SC 14D9' || form === 'SC 14D9/A') return 'board_response';
  return 'other';
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => (value ?? '').trim()).filter(Boolean))];
}

function parseEntities(raw: unknown): SecMnaEntity[] {
  if (!Array.isArray(raw)) return [];
  const entities: SecMnaEntity[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    entities.push({
      cik: typeof record.cik === 'string' ? record.cik : undefined,
      companyName:
        typeof record.companyName === 'string'
          ? record.companyName
          : typeof record.companyNameLong === 'string'
            ? record.companyNameLong
            : undefined,
      ticker: typeof record.ticker === 'string' ? record.ticker : undefined,
    });
  }
  return entities;
}

function normalizeMnaFiling(source: Record<string, unknown>, company: CompanyIdentity): SecMnaFiling {
  const form =
    typeof source.formType === 'string'
      ? source.formType
      : typeof source.form === 'string'
        ? source.form
        : 'UNKNOWN';
  const entities = parseEntities(source.entities);
  const counterparties = uniqueStrings(
    entities.flatMap((entity) => {
      const sameTicker = entity.ticker?.toUpperCase() === company.ticker.toUpperCase();
      const sameCik = entity.cik?.padStart(10, '0') === company.cik;
      return sameTicker || sameCik ? [] : [entity.companyName ?? entity.ticker ?? null];
    })
  );

  return {
    form,
    accessionNo:
      typeof source.accessionNo === 'string'
        ? source.accessionNo
        : typeof source.accessionNumber === 'string'
          ? source.accessionNumber
          : '',
    filedAt:
      typeof source.filedAt === 'string'
        ? source.filedAt
        : typeof source.filingDate === 'string'
          ? source.filingDate
          : '',
    periodEnd:
      typeof source.periodOfReport === 'string'
        ? source.periodOfReport
        : typeof source.periodEnd === 'string'
          ? source.periodEnd
          : null,
    url:
      typeof source.linkToFilingDetails === 'string'
        ? source.linkToFilingDetails
        : typeof source.url === 'string'
          ? source.url
          : null,
    primaryDocumentUrl:
      typeof source.linkToTxt === 'string'
        ? source.linkToTxt
        : typeof source.linkToHtml === 'string'
          ? source.linkToHtml
          : null,
    title:
      typeof source.description === 'string'
        ? source.description
        : typeof source.primaryDocument === 'string'
          ? source.primaryDocument
          : null,
    filingCategory: toMnaCategory(form),
    counterparties,
    entities,
  };
}

async function fetchMnaFilingsFromSecApi(
  company: CompanyIdentity,
  forms: string[],
  asOfDate: string,
  limit: number
): Promise<SecMnaSearchResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const paddedCik = String(company.cik).padStart(10, '0');
  const quotedForms = forms.map((form) => `"${form}"`).join(' OR ');

  try {
    const url = `${BASE}?token=${encodeURIComponent(apiKey)}`;
    const body = {
      query: `cik:${paddedCik} AND formType:(${quotedForms}) AND filedAt:[* TO ${asOfDate}]`,
      from: 0,
      size: Math.max(1, Math.min(limit, 50)),
      sort: [{ filedAt: { order: 'desc' } }],
      _source: [
        'formType',
        'filedAt',
        'periodOfReport',
        'linkToFilingDetails',
        'linkToTxt',
        'linkToHtml',
        'accessionNo',
        'description',
        'entities',
        'primaryDocument',
      ],
    };
    const res = await fetchWithRetry(url, { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) {
      console.warn('[secApi] fetchMnaFilingsFromSecApi failed', res.status, await res.text());
      return null;
    }

    const data = (await res.json()) as { hits?: { hits?: Array<{ _source?: Record<string, unknown> }> } };
    const hits = data.hits?.hits ?? [];
    const filings = hits
      .map((hit) => hit._source ?? null)
      .filter((entry): entry is Record<string, unknown> => entry !== null)
      .map((entry) => normalizeMnaFiling(entry, company));

    return {
      company,
      filings,
      formsQueried: forms,
      asOfDate,
      source: 'sec-api',
    };
  } catch (error) {
    console.error('[secApi] fetchMnaFilingsFromSecApi exception', error);
    return null;
  }
}

async function fetchMnaFilingsFromEdgarSubmissions(
  company: CompanyIdentity,
  forms: string[],
  asOfDate: string,
  limit: number
): Promise<SecMnaSearchResult | null> {
  try {
    const url = `https://data.sec.gov/submissions/CIK${company.cik}.json`;
    const res = await fetchWithRetry(url, {
      headers: { 'User-Agent': getEdgarUserAgent() },
    });
    if (!res.ok) {
      console.warn('[secApi] fetchMnaFilingsFromEdgarSubmissions failed', res.status, await res.text());
      return null;
    }

    const data = (await res.json()) as {
      filings?: {
        recent?: {
          accessionNumber?: string[];
          filingDate?: string[];
          reportDate?: string[];
          form?: string[];
          primaryDocument?: string[];
        };
      };
    };
    const recent = data.filings?.recent;
    if (!recent?.form || !recent.filingDate || !recent.accessionNumber) return null;

    const filings: SecMnaFiling[] = [];
    const maxCount = Math.min(recent.form.length, recent.filingDate.length, recent.accessionNumber.length);
    const acceptedForms = new Set(forms);
    const asOfTs = Date.parse(asOfDate);

    for (let index = 0; index < maxCount; index += 1) {
      const form = recent.form[index] ?? '';
      if (!acceptedForms.has(form)) continue;

      const filedAt = recent.filingDate[index] ?? '';
      if (Number.isFinite(asOfTs) && Date.parse(filedAt) > asOfTs) continue;

      const accessionNo = recent.accessionNumber[index] ?? '';
      const primaryDocument = recent.primaryDocument?.[index] ?? '';
      const accessionNoDigits = accessionNo.replace(/-/g, '');
      const cikNoLeadingZeros = String(Number(company.cik));
      const filingBaseUrl =
        accessionNo && cikNoLeadingZeros !== 'NaN'
          ? `https://www.sec.gov/Archives/edgar/data/${cikNoLeadingZeros}/${accessionNoDigits}`
          : null;

      filings.push({
        form,
        accessionNo,
        filedAt,
        periodEnd: recent.reportDate?.[index] ?? null,
        url: filingBaseUrl && primaryDocument ? `${filingBaseUrl}/${primaryDocument}` : filingBaseUrl,
        primaryDocumentUrl: filingBaseUrl && primaryDocument ? `${filingBaseUrl}/${primaryDocument}` : null,
        title: primaryDocument || null,
        filingCategory: toMnaCategory(form),
        counterparties: [],
        entities: [{ cik: company.cik, ticker: company.ticker, companyName: company.companyName }],
      });

      if (filings.length >= limit) break;
    }

    return {
      company,
      filings,
      formsQueried: forms,
      asOfDate,
      source: 'edgar-submissions',
    };
  } catch (error) {
    console.error('[secApi] fetchMnaFilingsFromEdgarSubmissions exception', error);
    return null;
  }
}

export async function fetchRecentFilings(params: SecRecentFilingsParams): Promise<SecMnaSearchResult | null> {
  const ticker = params.ticker.trim().toUpperCase();
  if (!ticker) return null;

  const company = await resolveCompanyIdentity(ticker);
  if (!company) return null;

  const asOfDate = (params.asOfDate ?? new Date().toISOString().slice(0, 10)).trim();
  const limit = Math.max(1, Math.min(params.limit ?? 10, 50));
  const forms = uniqueStrings(params.forms?.length ? params.forms : [...DEFAULT_MNA_FORMS]);
  if (forms.length === 0) return null;

  const apiResult = await fetchMnaFilingsFromSecApi(company, forms, asOfDate, limit);
  if (apiResult && apiResult.filings.length > 0) return apiResult;
  if (apiResult) {
    console.info(
      `[secApi] sec-api returned ${apiResult.filings.length} M&A filings for ${company.ticker}; falling back to EDGAR submissions`
    );
  }

  const edgarResult = await fetchMnaFilingsFromEdgarSubmissions(company, forms, asOfDate, limit);
  if (edgarResult && edgarResult.filings.length > 0) return edgarResult;

  return {
    company,
    filings: [],
    formsQueried: forms,
    asOfDate,
    source: apiResult ? 'sec-api' : 'edgar-submissions',
  };
}

export async function fetchRecentMnaFilings(params: SecRecentFilingsParams): Promise<SecMnaSearchResult | null> {
  return fetchRecentFilings({
    ...params,
    forms: params.forms?.length ? params.forms : [...DEFAULT_MNA_FORMS],
  });
}
