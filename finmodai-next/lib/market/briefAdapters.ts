/**
 * Adapters for Market Brief API endpoints
 * 
 * Normalizes raw API responses into consistent shapes for Ant Design components.
 */

import { toPct } from '@/lib/utils/percent';

export interface ChartPoint {
  t: string; // ISO timestamp
  v: number; // Value (price or return %)
}

export interface BriefHeadline {
  id: string;
  title: string;
  source?: string;
  ts?: string; // ISO timestamp
  impact?: 'Low' | 'Med' | 'High';
  bullets?: string[];
  // Deterministic fields (if available)
  canonicalTitle?: string;
  impactBullets?: string[];
  topic?: string;
  confidence?: number;
  url?: string;
  tickers?: string[];
}

export interface BriefMover {
  symbol: string;
  name?: string;
  changePct?: number;
  changePctValid?: boolean; // Validation flag
  changePctReason?: string; // Reason if invalid
  returnPct?: number; // Alias for changePct
  price?: number;
}

export interface BriefSector {
  sector: string;
  score?: number;
  changePct?: number;
  changePctValid?: boolean; // Validation flag
  changePctReason?: string; // Reason if invalid
  returnPct?: number; // Alias for changePct
  returnPctValid?: boolean; // Validation flag
  returnPctReason?: string; // Reason if invalid
  etf?: string;
  ticker?: string;
}

/**
 * Normalize array extraction from common wrapper patterns
 * Logs what it picked in debug mode
 */
export function normalizeArray<T>(
  raw: any,
  key?: string,
  debug?: boolean,
  debugTag?: string
): T[] {
  if (!raw) {
    if (debug) {
      console.log(`[normalizeArray${debugTag ? `:${debugTag}` : ''}] raw is null/undefined`);
    }
    return [];
  }
  
  // If raw is already an array, return it
  if (Array.isArray(raw)) {
    if (debug) {
      console.log(`[normalizeArray${debugTag ? `:${debugTag}` : ''}] raw is array, length=${raw.length}`);
    }
    return raw as T[];
  }
  
  if (typeof raw !== 'object') {
    if (debug) {
      console.log(`[normalizeArray${debugTag ? `:${debugTag}` : ''}] raw is not object/array, type=${typeof raw}`);
    }
    return [];
  }
  
  // If key specified, try that first
  if (key && Array.isArray(raw[key])) {
    if (debug) {
      console.log(`[normalizeArray${debugTag ? `:${debugTag}` : ''}] found array at key="${key}", length=${raw[key].length}`);
    }
    return raw[key] as T[];
  }
  
  // Try common wrapper patterns
  if (Array.isArray(raw.data)) {
    if (debug) {
      console.log(`[normalizeArray${debugTag ? `:${debugTag}` : ''}] found array at "data", length=${raw.data.length}`);
    }
    return raw.data as T[];
  }
  if (Array.isArray(raw.items)) {
    if (debug) {
      console.log(`[normalizeArray${debugTag ? `:${debugTag}` : ''}] found array at "items", length=${raw.items.length}`);
    }
    return raw.items as T[];
  }
  if (Array.isArray(raw.results)) {
    if (debug) {
      console.log(`[normalizeArray${debugTag ? `:${debugTag}` : ''}] found array at "results", length=${raw.results.length}`);
    }
    return raw.results as T[];
  }
  if (Array.isArray(raw.sectors)) {
    if (debug) {
      console.log(`[normalizeArray${debugTag ? `:${debugTag}` : ''}] found array at "sectors", length=${raw.sectors.length}`);
    }
    return raw.sectors as T[];
  }
  if (Array.isArray(raw.scores)) {
    if (debug) {
      console.log(`[normalizeArray${debugTag ? `:${debugTag}` : ''}] found array at "scores", length=${raw.scores.length}`);
    }
    return raw.scores as T[];
  }
  
  // Try nested: { data: { items: [...] } }
  if (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
    if (Array.isArray(raw.data.items)) {
      if (debug) {
        console.log(`[normalizeArray${debugTag ? `:${debugTag}` : ''}] found array at "data.items", length=${raw.data.items.length}`);
      }
      return raw.data.items as T[];
    }
    if (Array.isArray(raw.data.data)) {
      if (debug) {
        console.log(`[normalizeArray${debugTag ? `:${debugTag}` : ''}] found array at "data.data", length=${raw.data.data.length}`);
      }
      return raw.data.data as T[];
    }
  }
  
  if (debug) {
    console.log(`[normalizeArray${debugTag ? `:${debugTag}` : ''}] no array found, keys=${Object.keys(raw).join(',')}`);
  }
  return [];
}

/**
 * Extract array from common wrapper patterns (backward compatibility)
 */
function extractArray<T>(raw: any, key?: string): T[] {
  return normalizeArray<T>(raw, key, false);
}

/**
 * Adapter for chart data from /api/market/chart or /api/macro/market
 */
export function adaptChartData(raw: any): ChartPoint[] {
  if (!raw || typeof raw !== 'object') return [];
  
  // Try new format: { series: [{ t, v }] }
  const series = extractArray<ChartPoint>(raw, 'series');
  if (series.length > 0) {
    return series
      .filter((p): p is ChartPoint => {
        return p && typeof p === 'object' && 
               typeof p.t === 'string' && 
               typeof p.v === 'number' && 
               Number.isFinite(p.v);
      })
      .map(p => ({ t: String(p.t), v: Number(p.v) }));
  }
  
  // Try legacy format: { data: { points: [{ t, close }] } }
  const legacyPoints = extractArray<any>(raw.data, 'points');
  if (legacyPoints.length > 0) {
    return legacyPoints
      .filter((p: any) => {
        return p && typeof p === 'object' &&
               (typeof p.t === 'string' || typeof p.date === 'string') &&
               (typeof p.close === 'number' || typeof p.v === 'number') &&
               Number.isFinite(p.close ?? p.v);
      })
      .map((p: any) => ({
        t: String(p.t ?? p.date ?? ''),
        v: Number(p.close ?? p.v ?? 0),
      }));
  }
  
  return [];
}

/**
 * Adapter for headlines from /api/market-brief/headlines or /api/market/headlines
 * Never drops items - renders even if optional fields are missing
 */
export function adaptHeadlines(raw: any, debug?: boolean): BriefHeadline[] {
  // Loosen check: treat object with nested list as not empty
  if (!raw) return [];
  if (Array.isArray(raw) && raw.length === 0) return [];
  
  const items = normalizeArray<any>(raw, 'items', debug, 'headlines');
  
  // If no items found, try direct array or other patterns
  if (items.length === 0 && Array.isArray(raw)) {
    return raw.map((item: any, idx: number) => adaptHeadlineItem(item, idx, debug));
  }
  
  return items
    .filter((item: any) => item && typeof item === 'object') // Keep all valid objects
    .map((item: any, idx: number) => adaptHeadlineItem(item, idx, debug))
    .filter((h: BriefHeadline | null): h is BriefHeadline => h !== null); // Only drop nulls
}

/**
 * Adapt a single headline item - never returns null if item has any title
 */
function adaptHeadlineItem(item: any, idx: number, debug?: boolean): BriefHeadline | null {
  // Prioritize deterministic fields, fallback to raw fields
  const canonicalTitle = item.canonicalTitle ?? item.title ?? item.headline ?? item.headlineText ?? '';
  const rawTitle = item.title ?? item.headline ?? item.headlineText ?? '';
  const title = canonicalTitle || rawTitle || `Headline ${idx + 1}`;
  
  // Only drop if truly no title at all
  if (!title || title.trim().length === 0) {
    if (debug) {
      console.warn(`[adaptHeadlineItem] Dropping item ${idx} - no title found`, item);
    }
    return null;
  }
  
  // Generate stable ID
  const id = item.id ?? 
             (item.url ? `url-${item.url}` : null) ?? 
             `title-${title.slice(0, 50).replace(/[^a-z0-9]/gi, '-')}`;
  
  // Impact bullets: use deterministic if available, else empty array (never require)
  const impactBullets = Array.isArray(item.impactBullets) && item.impactBullets.length >= 2
    ? item.impactBullets
    : (Array.isArray(item.bullets) ? item.bullets : []);
  
  // Impact level: derive from deterministic impact or fallback to confidence
  let impact: 'Low' | 'Med' | 'High' | undefined = undefined;
  if (item.impact === 'positive' || item.impact === 'negative') {
    const conf = typeof item.confidence === 'number' ? item.confidence : 0.5;
    impact = conf >= 0.7 ? 'High' : conf >= 0.5 ? 'Med' : 'Low';
  } else if (typeof item.confidence === 'number') {
    impact = item.confidence >= 0.7 ? 'High' : item.confidence >= 0.5 ? 'Med' : 'Low';
  }
  
  return {
    id,
    title, // Always present (we filtered nulls above)
    canonicalTitle: item.canonicalTitle || undefined, // Optional
    source: item.source ?? item.publisher ?? item.provider ?? item.domain ?? undefined,
    ts: item.publishedAt ?? item.published_at ?? item.published ?? item.time ?? item.date ?? undefined,
    impact,
    bullets: impactBullets, // Can be empty array
    impactBullets: impactBullets.length >= 2 ? impactBullets : undefined, // Only set if >= 2
    topic: item.topic ?? undefined,
    confidence: typeof item.confidence === 'number' ? item.confidence : undefined,
    url: item.url ?? item.link ?? item.href ?? undefined,
    tickers: Array.isArray(item.tickers) ? item.tickers.map((t: any) => String(t)) : undefined,
  };
}

/**
 * Adapter for top movers from /api/market/top-movers
 * Never drops items - renders even if optional fields are missing
 */
export function adaptMovers(raw: any, debug?: boolean): BriefMover[] {
  if (!raw) return [];
  if (typeof raw !== 'object') return [];
  
  // Extract gainers and losers - loosen check
  const gainers = normalizeArray<any>(raw, 'gainers', debug, 'movers:gainers');
  const losers = normalizeArray<any>(raw, 'losers', debug, 'movers:losers');
  
  // Combine and normalize
  const allMovers = [...gainers, ...losers].map((m: any) => {
    const symbol = m.ticker ?? m.symbol ?? '';
    if (!symbol) {
      if (debug) {
        console.warn('[adaptMovers] Dropping mover - no symbol', m);
      }
      return null;
    }
    
    const rawChangePct = typeof m.returnPct === 'number' 
      ? m.returnPct 
      : (typeof m.changePct === 'number' ? m.changePct : undefined);
    
    // Normalize percentage to decimal format (API returns as percentage like 12, normalize to 0.12)
    // Use 'weekly' context for validation (top movers typically use weekly/monthly ranges)
    const normalizedResult = rawChangePct !== undefined ? toPct(rawChangePct, 'weekly') : { value: undefined, isValid: false, reason: 'missing_value' };
    
    return {
      symbol: String(symbol).toUpperCase(),
      name: m.name ?? m.company ?? undefined,
      changePct: normalizedResult.value,
      changePctValid: normalizedResult.isValid,
      changePctReason: normalizedResult.reason,
      returnPct: normalizedResult.value, // Alias for compatibility (already normalized)
      price: typeof m.price === 'number' && Number.isFinite(m.price) ? m.price : undefined,
    };
  });
  
  return allMovers.filter((m): m is BriefMover => m !== null && m.symbol.length > 0);
}

/**
 * Adapter for sector momentum from /api/market/sector-momentum
 * Never drops items - renders even if optional fields are missing
 */
export function adaptSectors(raw: any, debug?: boolean): BriefSector[] {
  if (!raw) return [];
  
  // Try multiple possible response shapes - loosen check
  const sectors = normalizeArray<any>(raw, 'sectors', debug, 'sectors') ||
                  normalizeArray<any>(raw, 'data', debug, 'sectors:data') ||
                  normalizeArray<any>(raw, 'scores', debug, 'sectors:scores') ||
                  [];
  
  return sectors
    .filter((s: any) => s && typeof s === 'object')
    .map((s: any) => {
      const sector = s.sector ?? s.name ?? s.symbol ?? 'Unknown';
      if (!sector || sector === 'Unknown') {
        if (debug) {
          console.warn('[adaptSectors] Dropping sector - no name', s);
        }
        return null;
      }
      
      // Try multiple fields for return percentage
      const rawChangePct = typeof s.returnPct === 'number'
        ? s.returnPct
        : (typeof s.changePct === 'number' ? s.changePct : undefined);
      
      // Normalize percentage to decimal format (API may return as percentage or decimal)
      // Use 'monthly' context for validation (sector momentum typically uses monthly ranges)
      const normalizedResult = rawChangePct !== undefined ? toPct(rawChangePct, 'monthly') : { value: undefined, isValid: false, reason: 'missing_value' };
      
      // Score may be a 0-10 scale, convert to percentage if needed
      let score: number | undefined = undefined;
      if (typeof s.score === 'number') {
        score = s.score;
      }
      
      return {
        sector: String(sector),
        score,
        changePct: normalizedResult.value, // Normalized to decimal format
        changePctValid: normalizedResult.isValid,
        changePctReason: normalizedResult.reason,
        returnPct: normalizedResult.value, // Alias for compatibility (already normalized)
        returnPctValid: normalizedResult.isValid,
        returnPctReason: normalizedResult.reason,
        etf: s.etf ?? s.ticker ?? undefined,
        ticker: s.ticker ?? s.etf ?? undefined,
      };
    })
    .filter((s): s is BriefSector => s !== null && s.sector !== 'Unknown');
}

