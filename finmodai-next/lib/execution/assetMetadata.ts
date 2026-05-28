/**
 * AssetMetadata — lightweight business-context layer for agent grounding.
 *
 * Provides name, sector, industry, and a 1-2 sentence business_summary for
 * every ticker that reaches the agent stage. This is the data that lets
 * personas say "this is a bond ETF, not an AI stock" rather than writing
 * a hallucinated thesis.
 *
 * Sourcing priority:
 *   1. Module-level cache (1-hour TTL)
 *   2. Yahoo Finance quoteSummary (free, no key required)
 *   3. companyBriefs static table (covers top ~40 names)
 *   4. LLM-generated summary (gpt-4o-mini, ~80 tokens, cached on first call)
 *   5. Minimal fallback (ticker only, no crash)
 */

import type OpenAI from 'openai';
import { getCompanyBrief } from '@/lib/ranking/companyBriefs';

export interface AssetMetadata {
  ticker:           string;
  name:             string;
  sector:           string;
  industry:         string;
  asset_class:      'common_stock' | 'etf' | 'unknown';
  business_summary: string;
}

const EMPTY_METADATA = (ticker: string): AssetMetadata => ({
  ticker,
  name:             ticker,
  sector:           'Unknown',
  industry:         'Unknown',
  asset_class:      'unknown',
  business_summary: `${ticker} — no business description available.`,
});

// ── Module-level cache ────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 60 * 1_000; // 1 hour

type CacheEntry = { meta: AssetMetadata; expiresAt: number };
const _cache = new Map<string, CacheEntry>();

function fromCache(ticker: string): AssetMetadata | null {
  const entry = _cache.get(ticker);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.meta;
}

function toCache(meta: AssetMetadata): void {
  _cache.set(meta.ticker, { meta, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Yahoo Finance ─────────────────────────────────────────────────────────────

type YahooAssetProfile = {
  sector?: string;
  industry?: string;
  longBusinessSummary?: string;
};

type YahooQuoteSummary = {
  quoteSummary?: {
    result?: Array<{ assetProfile?: YahooAssetProfile }>;
    error?: { description?: string };
  };
};

type YahooQuoteResponse = {
  quoteResponse?: {
    result?: Array<{ shortName?: string; quoteType?: string }>;
  };
};

async function fetchFromYahoo(ticker: string): Promise<Partial<AssetMetadata> | null> {
  try {
    const [profileRes, quoteRes] = await Promise.allSettled([
      fetch(
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=assetProfile`,
        { signal: AbortSignal.timeout(5_000), headers: { 'User-Agent': 'Mozilla/5.0' } },
      ),
      fetch(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}&fields=shortName,quoteType`,
        { signal: AbortSignal.timeout(5_000), headers: { 'User-Agent': 'Mozilla/5.0' } },
      ),
    ]);

    let name: string | undefined;
    let sector: string | undefined;
    let industry: string | undefined;
    let summary: string | undefined;
    let quoteType: string | undefined;

    if (quoteRes.status === 'fulfilled' && quoteRes.value.ok) {
      const q = await quoteRes.value.json() as YahooQuoteResponse;
      const r = q.quoteResponse?.result?.[0];
      name      = r?.shortName ?? undefined;
      quoteType = r?.quoteType ?? undefined;
    }

    if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
      const p = await profileRes.value.json() as YahooQuoteSummary;
      const profile = p.quoteSummary?.result?.[0]?.assetProfile;
      sector   = profile?.sector   ?? undefined;
      industry = profile?.industry ?? undefined;
      if (profile?.longBusinessSummary) {
        // Trim to two sentences to keep prompt tokens low
        const sentences = profile.longBusinessSummary.split('. ').slice(0, 2);
        summary = sentences.join('. ').trim();
        if (!summary.endsWith('.')) summary += '.';
      }
    }

    if (!name && !sector) return null;

    const isETF = quoteType === 'ETF' || quoteType === 'MUTUALFUND';

    return {
      name:             name    ?? ticker,
      sector:           sector  ?? 'Unknown',
      industry:         industry ?? 'Unknown',
      asset_class:      isETF ? 'etf' : 'common_stock',
      business_summary: summary ?? '',
    };
  } catch {
    return null;
  }
}

// ── Company briefs fallback ───────────────────────────────────────────────────

const DEFAULT_BRIEF_PREFIX = 'This stock is in the ranked universe';

function fromCompanyBrief(ticker: string): Partial<AssetMetadata> | null {
  const brief = getCompanyBrief(ticker);
  // getCompanyBrief never returns null — it returns a generic DEFAULT_BRIEF for unknown tickers
  if (brief.strategicContext.startsWith(DEFAULT_BRIEF_PREFIX)) return null;
  return { business_summary: brief.strategicContext };
}

// ── LLM fallback ──────────────────────────────────────────────────────────────

async function generateSummaryWithLLM(
  ticker: string,
  name: string,
  sector: string,
  client: OpenAI | null,
): Promise<string> {
  if (!client) return `${name} (${ticker}) — a publicly listed company.`;
  try {
    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 80,
      messages: [
        {
          role: 'user',
          content: `Write a 1-2 sentence factual description of what ${name} (ticker: ${ticker}, sector: ${sector}) does as a business. Be specific about their core product or service. No filler.`,
        },
      ],
    });
    return resp.choices[0].message.content?.trim() ?? `${name} — publicly listed ${sector} company.`;
  } catch {
    return `${name} — publicly listed ${sector} company.`;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchAssetMetadata(
  ticker: string,
  client: OpenAI | null = null,
): Promise<AssetMetadata> {
  const cached = fromCache(ticker);
  if (cached) return cached;

  // Layer 1: Yahoo Finance
  const yahoo = await fetchFromYahoo(ticker);

  // Layer 2: companyBriefs static table
  const brief = fromCompanyBrief(ticker);

  const name     = yahoo?.name     ?? ticker;
  const sector   = yahoo?.sector   ?? 'Unknown';
  const industry = yahoo?.industry ?? 'Unknown';
  const assetClass = yahoo?.asset_class ?? 'common_stock';

  // Layer 3: build business_summary
  let business_summary = yahoo?.business_summary ?? brief?.business_summary ?? '';
  if (!business_summary) {
    business_summary = await generateSummaryWithLLM(ticker, name, sector, client);
  }

  const meta: AssetMetadata = {
    ticker,
    name,
    sector,
    industry,
    asset_class: assetClass,
    business_summary,
  };

  toCache(meta);
  return meta;
}
