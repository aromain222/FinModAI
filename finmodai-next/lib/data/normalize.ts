/**
 * Data normalization layer for headlines and macro data
 * Ensures UI-safe objects with guaranteed fields and proper fallbacks
 */

export type NormalizedHeadline = {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  topic: string;
  impact: string;
  region: string;
  confidence: number | null;
  bullets: string[];
  // Optional fields
  url?: string;
  canonicalTitle?: string;
  country?: string;
};

export type NormalizedMacroSnapshot = {
  inflation: number | null;
  growth: number | null;
  labor: number | null;
  rates: number | null;
  summary: any | null;
};

/**
 * Helper to infer region from various fields
 * Uses keyword rules to detect region from tags, source, title, etc.
 */
export function inferRegion(item: any): string {
  // Check explicit region fields
  if (item.region && typeof item.region === 'string') {
    const region = item.region.toLowerCase();
    if (['global', 'us', 'europe', 'asia'].includes(region)) {
      return region;
    }
  }

  // Check geo fields
  const geoRegion = item.geo?.region || item.country?.region;
  if (geoRegion && typeof geoRegion === 'string') {
    const region = geoRegion.toLowerCase();
    if (['global', 'us', 'europe', 'asia'].includes(region)) {
      return region;
    }
  }

  // Infer from tags
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const tagsStr = tags.join(' ').toLowerCase();
  if (tagsStr.includes('us') || tagsStr.includes('usa') || tagsStr.includes('united states')) {
    return 'us';
  }
  if (tagsStr.includes('europe') || tagsStr.includes('eu') || tagsStr.includes('eurozone')) {
    return 'europe';
  }
  if (tagsStr.includes('asia') || tagsStr.includes('china') || tagsStr.includes('japan')) {
    return 'asia';
  }

  // Infer from source
  const source = (item.source || item.publisher || item.provider || '').toLowerCase();
  if (source.includes('federal reserve') || source.includes('fed ') || source.includes('treasury')) {
    return 'us';
  }
  if (source.includes('ecb') || source.includes('european central bank')) {
    return 'europe';
  }
  if (source.includes('pboc') || source.includes('boj') || source.includes('reserve bank')) {
    return 'asia';
  }

  // Default to global
  return 'global';
}

/**
 * Normalize headlines to UI-safe format with guaranteed fields
 */
export function normalizeHeadlines(rawHeadlines: any): NormalizedHeadline[] {
  if (!rawHeadlines) return [];
  
  // Extract items from various API response formats
  let items: any[] = [];
  if (Array.isArray(rawHeadlines)) {
    items = rawHeadlines;
  } else if (rawHeadlines.data?.items) {
    items = rawHeadlines.data.items;
  } else if (rawHeadlines.items) {
    items = rawHeadlines.items;
  } else if (rawHeadlines.ok && rawHeadlines.data?.items) {
    items = rawHeadlines.data.items;
  }

  return items.map((item: any, idx: number): NormalizedHeadline => {
    // Required fields with fallbacks
    const id = item.id || item.url || `headline-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 9)}`;
    
    const canonicalTitle = item.canonicalTitle || item.title || item.headline || null;
    const title = canonicalTitle || item.title || item.headline || 'Untitled';
    
    const source = item.publisher || item.source || item.provider || item.domain || 'Unknown';
    
    const publishedAt = item.publishedAt || item.ts || item.date || item.timestamp || new Date().toISOString();
    
    const topic = item.topic || item.category || item.sector || 'equities';
    
    // Normalize impact (ensure it's one of the valid values)
    const rawImpact = item.impact || item.sentiment || item.impactLevel || 'neutral';
    const impact = ['positive', 'neutral', 'negative'].includes(String(rawImpact).toLowerCase())
      ? String(rawImpact).toLowerCase()
      : 'neutral';
    
    // Infer region if missing
    const region = inferRegion(item);
    
    // Confidence: default to null if unavailable (not 0)
    const confidence = typeof item.confidence === 'number' && Number.isFinite(item.confidence)
      ? item.confidence
      : typeof item.score === 'number' && Number.isFinite(item.score)
      ? item.score
      : null;
    
    // Bullets array (required, default to empty)
    const bullets = Array.isArray(item.impactBullets) 
      ? item.impactBullets.filter((b: any) => b != null && String(b).trim().length > 0)
      : Array.isArray(item.bullets)
      ? item.bullets.filter((b: any) => b != null && String(b).trim().length > 0)
      : [];
    
    // Optional fields
    const url = item.url || item.sourceUrl || undefined;
    const country = item.country || item.geo?.country || item.sourceCountry || undefined;

    return {
      id,
      title,
      source,
      publishedAt,
      topic,
      impact,
      region,
      confidence,
      bullets,
      url,
      canonicalTitle: canonicalTitle || undefined,
      country,
    };
  });
}

/**
 * Normalize macro snapshot to UI-safe format with guaranteed fields
 */
export function normalizeMacroSnapshot(raw: any): NormalizedMacroSnapshot {
  if (!raw) {
    return {
      inflation: null,
      growth: null,
      labor: null,
      rates: null,
      summary: null,
    };
  }

  // Extract data from various API response formats
  const data = raw.data ?? raw;

  // Inflation
  const inflation = typeof data.inflation === 'number' && Number.isFinite(data.inflation)
    ? data.inflation
    : typeof data.indicators?.cpi?.value === 'number' && Number.isFinite(data.indicators.cpi.value)
    ? data.indicators.cpi.value
    : null;

  // Growth (GDP) - FRED returns raw GDP in billions, so values > 100 are likely raw dollars
  // If it's a raw GDP value (typically 20,000-40,000 for US), return null as we need YoY growth %
  // If it's already a percentage (between -20 and 20), use it directly
  // If data.growth exists and is reasonable, prefer that
  let growth: number | null = null;
  
  if (typeof data.growth === 'number' && Number.isFinite(data.growth)) {
    // If growth is already a percentage (reasonable range), use it
    growth = Math.abs(data.growth) < 50 ? data.growth : null;
  } else if (typeof data.gdp === 'number' && Number.isFinite(data.gdp)) {
    // GDP from FRED is raw dollar amount in billions (20k-40k range)
    // Values > 100 are likely raw GDP, not percentage - return null
    // Values < 50 might be percentage, but still suspicious - return null to be safe
    // We need YoY growth calculation, not raw GDP
    growth = null;
  } else if (typeof data.indicators?.gdp?.value === 'number' && Number.isFinite(data.indicators.gdp.value)) {
    const gdpValue = data.indicators.gdp.value;
    // Same logic - if it's a reasonable percentage, use it
    growth = Math.abs(gdpValue) < 50 ? gdpValue : null;
  }

  // Labor (Unemployment)
  const labor = typeof data.unemployment === 'number' && Number.isFinite(data.unemployment)
    ? data.unemployment
    : typeof data.labor === 'number' && Number.isFinite(data.labor)
    ? data.labor
    : typeof data.indicators?.unemployment?.value === 'number' && Number.isFinite(data.indicators.unemployment.value)
    ? data.indicators.unemployment.value
    : null;

  // Rates (Fed Funds / Treasury 10Y)
  const rates = typeof data.fedFunds === 'number' && Number.isFinite(data.fedFunds)
    ? data.fedFunds
    : typeof data.rates === 'number' && Number.isFinite(data.rates)
    ? data.rates
    : typeof data.indicators?.treasury10y?.value === 'number' && Number.isFinite(data.indicators.treasury10y.value)
    ? data.indicators.treasury10y.value
    : typeof data.yield10y === 'number' && Number.isFinite(data.yield10y)
    ? data.yield10y
    : null;

  // Summary (optional object)
  const summary = data.summary || null;

  return {
    inflation,
    growth,
    labor,
    rates,
    summary,
  };
}

