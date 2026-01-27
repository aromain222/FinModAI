/**
 * Macro Events Normalization
 * Deterministic mapping of raw headlines to canonical event titles
 */

import type { RawNewsItem, MacroEventCategory } from './types';

/**
 * Reputable sources for confidence scoring
 */
const REPUTABLE_SOURCES = new Set([
  'reuters',
  'ap',
  'associated press',
  'bloomberg',
  'wsj',
  'wall street journal',
  'ft',
  'financial times',
  'cnbc',
  'marketwatch',
  'yahoo finance',
  'yahoo',
  'bbc',
  'cnn',
  'the new york times',
  'nytimes',
]);

/**
 * Normalize source name for comparison
 */
function normalizeSource(source: string): string {
  return source.toLowerCase().trim();
}

/**
 * Check if source is reputable
 */
export function isReputableSource(source: string): boolean {
  const normalized = normalizeSource(source);
  return REPUTABLE_SOURCES.has(normalized) || REPUTABLE_SOURCES.has(normalized.split(/\s+/)[0] || '');
}

/**
 * Deterministic mapping of headlines to canonical event titles
 */
export function normalizeToCanonicalTitle(item: RawNewsItem): { canonicalTitle: string; category: MacroEventCategory } {
  const title = item.title || '';
  const summary = item.summary || '';
  const haystack = `${title} ${summary}`.toLowerCase();

  // Rule-based canonical title mapping
  // CPI / Inflation releases
  if (/cpi|consumer.*price|inflation.*print|inflation.*data|price.*index/i.test(haystack) && /release|report|data|print/i.test(haystack)) {
    return { canonicalTitle: 'US CPI release', category: 'inflation' };
  }
  if (/ppi|producer.*price/i.test(haystack) && /release|report|data/i.test(haystack)) {
    return { canonicalTitle: 'US PPI release', category: 'inflation' };
  }
  if (/pce|personal.*consumption|core.*pce/i.test(haystack) && /release|report|data/i.test(haystack)) {
    return { canonicalTitle: 'US PCE release', category: 'inflation' };
  }

  // Fed / Rates / Monetary Policy
  if (/fomc|fed.*minutes|federal.*reserve.*minutes/i.test(haystack)) {
    return { canonicalTitle: 'Federal Reserve FOMC minutes', category: 'rates' };
  }
  if (/powell|fed.*chair|federal.*reserve.*chair/i.test(haystack) && /speech|statement|testimony/i.test(haystack)) {
    return { canonicalTitle: 'Federal Reserve signaling', category: 'rates' };
  }
  if (/fed.*funds|interest.*rate|rate.*decision/i.test(haystack) && /announce|decision|meeting/i.test(haystack)) {
    return { canonicalTitle: 'Federal Reserve rate decision', category: 'rates' };
  }
  if (/federal.*reserve|fed.*policy|monetary.*policy/i.test(haystack) && /signaling|guidance|statement/i.test(haystack)) {
    return { canonicalTitle: 'Federal Reserve signaling', category: 'rates' };
  }

  // Jobs / Employment
  if (/jobs.*report|nonfarm.*payrolls|nfp|employment.*report/i.test(haystack)) {
    return { canonicalTitle: 'US labor market data', category: 'jobs' };
  }
  if (/unemployment|jobless.*claims|initial.*claims/i.test(haystack) && /release|report|data/i.test(haystack)) {
    return { canonicalTitle: 'US labor market data', category: 'jobs' };
  }
  if (/adp.*employment|adp.*payroll/i.test(haystack)) {
    return { canonicalTitle: 'US ADP employment report', category: 'jobs' };
  }

  // Geopolitics
  if (/sanctions|embargo/i.test(haystack) && /impose|announce|extend/i.test(haystack)) {
    return { canonicalTitle: 'Geopolitical escalation', category: 'geopolitics' };
  }
  if (/missile|strike|attack/i.test(haystack) && /war|conflict|military/i.test(haystack)) {
    return { canonicalTitle: 'Geopolitical escalation', category: 'geopolitics' };
  }
  if (/invasion|military.*action|troop.*deployment/i.test(haystack)) {
    return { canonicalTitle: 'Geopolitical escalation', category: 'geopolitics' };
  }
  if (/war|conflict|hostilities/i.test(haystack) && /escalate|intensify|expand/i.test(haystack)) {
    return { canonicalTitle: 'Geopolitical escalation', category: 'geopolitics' };
  }
  if (/venezuela|iran|north.*korea|china.*taiwan|russia.*ukraine/i.test(haystack) && /tension|threat|sanction/i.test(haystack)) {
    return { canonicalTitle: 'Geopolitical escalation', category: 'geopolitics' };
  }

  // Oil / Commodities
  if (/opec|organization.*petroleum/i.test(haystack) && /meeting|decision|production|cut|increase/i.test(haystack)) {
    return { canonicalTitle: 'Oil market shock', category: 'commodities' };
  }
  if (/(oil|crude|brent|wti|west.*texas).*(surge|plunge|spike|crash|rally|drop)/i.test(haystack)) {
    return { canonicalTitle: 'Oil market shock', category: 'commodities' };
  }
  if (/brent|wti.*price/i.test(haystack) && /break|surge|plunge|hit.*high|hit.*low/i.test(haystack)) {
    return { canonicalTitle: 'Oil market shock', category: 'commodities' };
  }

  // GDP / Economic Data
  if (/gdp|gross.*domestic.*product/i.test(haystack) && /release|report|data/i.test(haystack)) {
    return { canonicalTitle: 'US GDP release', category: 'policy' };
  }

  // Trade / Tariffs
  if (/tariff|trade.*war|trade.*dispute|trade.*tension/i.test(haystack) && /impose|announce|escalate/i.test(haystack)) {
    return { canonicalTitle: 'Trade policy change', category: 'policy' };
  }

  // Earnings (only if explicit)
  if (/earnings|revenue|profit|eps|guidance/i.test(haystack) && /beat|miss|surprise/i.test(haystack)) {
    return { canonicalTitle: 'Corporate earnings update', category: 'earnings' };
  }

  // Default: Clean up title but keep it recognizable
  // Remove publisher-specific noise while preserving meaning
  let canonical = title
    .replace(/^(BREAKING|UPDATE|EXCLUSIVE|LIVE|JUST.*IN|URGENT):\s*/i, '')
    .replace(/^\d+:\d+\s*[AP]M\s*/i, '')
    .replace(/^(Reuters|AP|Bloomberg|WSJ|FT|CNN|BBC):\s*/i, '')
    .replace(/\s*-\s*(Reuters|AP|Bloomberg|WSJ|FT|CNN|BBC)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Infer category for default titles
  const category = inferCategoryFromText(canonical);

  // Limit length to reasonable size
  if (canonical.length > 100) {
    canonical = canonical.slice(0, 97) + '...';
  }

  return { canonicalTitle: canonical || 'Macro Event', category };
}

/**
 * Infer category from text content (used for default titles)
 */
function inferCategoryFromText(text: string): MacroEventCategory {
  const haystack = text.toLowerCase();

  if (/fed|federal.*reserve|interest.*rate|fomc|powell|monetary.*policy/i.test(haystack)) {
    return 'rates';
  }
  if (/inflation|cpi|ppi|pce|price.*level/i.test(haystack)) {
    return 'inflation';
  }
  if (/unemployment|jobs|employment|payroll|labor/i.test(haystack)) {
    return 'jobs';
  }
  if (/war|conflict|sanctions|geopolitical|tension|military/i.test(haystack)) {
    return 'geopolitics';
  }
  if (/oil|crude|brent|wti|opec|commodit/i.test(haystack)) {
    return 'commodities';
  }
  if (/earnings|revenue|profit|eps|corporate/i.test(haystack)) {
    return 'earnings';
  }
  if (/trade|tariff|policy|regulation|congress|government/i.test(haystack)) {
    return 'policy';
  }

  return 'other';
}

