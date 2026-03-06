import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { z } from 'zod';
import { getOpenAIKey, getOpenAIModelCandidates } from '@/lib/openaiKey';
import { headlineEnrichmentSchema, type HeadlineEnrichment, type SectorName } from '@/lib/news/types';
import { inferEventImpact } from '@/lib/news/eventImpact';
import { assessHeadlineRelevance } from '@/lib/news/relevance';

const EVENT_INTELLIGENCE_SYSTEM_PROMPT = `You are CapitalBase Analyst, a financial markets analyst writing structured macro intelligence for investors.

You are not rewriting the article. You are interpreting it for market implications.

Output rules:
- Use concise, plain-English sentences.
- No bullet points.
- No markdown.
- Keep total analysis concise and easy to scan.
- Keep "why_it_matters" under 150 words.
- Stay grounded in macro logic (rates, FX, liquidity, risk sentiment, geopolitics).
- Do not speculate beyond what the headline supports.

Output must be valid JSON matching the schema.`;

const dbRowSchema = z.object({
  url: z.string().url(),
  ai_summary: z.string().nullable().optional(),
  why_it_matters: z.string().nullable().optional(),
  affected_tickers: z.array(z.string()).nullable().optional(),
  affected_sectors: z.array(z.string()).nullable().optional(),
  confidence: z.enum(['high', 'medium', 'low']).nullable().optional(),
});

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('SUPABASE_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false } });
}

function directionFromBias(bias: 'Risk-On' | 'Risk-Off' | 'Hawkish' | 'Dovish' | 'Neutral'): 'up' | 'down' | 'mixed' | 'unknown' {
  if (bias === 'Risk-On' || bias === 'Dovish') return 'up';
  if (bias === 'Risk-Off' || bias === 'Hawkish') return 'down';
  return 'mixed';
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function simplifyDenseProse(text: string): string {
  return text
    .replace(/\s*;\s*/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function toSentence(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  const capped = /^[a-z]/.test(compact) ? `${compact.charAt(0).toUpperCase()}${compact.slice(1)}` : compact;
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

function wordCount(text: string): number {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}

function clipWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(' ').replace(/[.,;:!?-]+$/g, '')}.`;
}

const MACRO_SECTION_ORDER = [
  'MACRO EVENT',
  'WHAT HAPPENED',
  'WHY MARKETS CARE',
  'MARKET IMPACT',
  'TICKERS / ASSETS TO WATCH',
] as const;

type MacroSectionLabel = (typeof MACRO_SECTION_ORDER)[number];

const MACRO_SECTION_ALIASES: Record<MacroSectionLabel, string[]> = {
  'MACRO EVENT': ['MACRO EVENT'],
  'WHAT HAPPENED': ['WHAT HAPPENED'],
  'WHY MARKETS CARE': ['WHY MARKETS CARE'],
  'MARKET IMPACT': ['MARKET IMPACT'],
  'TICKERS / ASSETS TO WATCH': [
    'TICKERS / ASSETS TO WATCH',
    'TICKERS/ASSETS TO WATCH',
    'TICKERS TO WATCH',
    'ASSETS TO WATCH',
  ],
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseStructuredSections(text: string): Partial<Record<MacroSectionLabel, string>> {
  const sections: Partial<Record<MacroSectionLabel, string>> = {};
  const allLabels = MACRO_SECTION_ORDER.flatMap((label) => MACRO_SECTION_ALIASES[label]);
  const allPattern = allLabels.map((label) => escapeRegExp(label)).join('|');
  for (const label of MACRO_SECTION_ORDER) {
    const aliases = MACRO_SECTION_ALIASES[label];
    let matched: string | null = null;
    for (const alias of aliases) {
      const regex = new RegExp(
        `(?:^|\\n)\\s*${escapeRegExp(alias)}\\s*:?\\s*([\\s\\S]*?)(?=(?:\\n\\s*(?:${allPattern})\\s*:?)|$)`,
        'i'
      );
      const capture = text.match(regex)?.[1]?.trim();
      if (capture) {
        matched = capture;
        break;
      }
    }
    if (matched) sections[label] = matched;
  }
  return sections;
}

function formatStructuredAnalysis(sections: Record<MacroSectionLabel, string>): string {
  return MACRO_SECTION_ORDER.map((label) => `${label}: ${sections[label]}`).join('\n\n');
}

function limitStructuredAnalysisWords(text: string, maxWords = 150): string {
  if (wordCount(text) <= maxWords) return text;
  const parsed = parseStructuredSections(text);
  if (Object.keys(parsed).length < 3) {
    return clipWords(text.replace(/\n+/g, ' '), maxWords);
  }
  const caps: Record<MacroSectionLabel, number> = {
    'MACRO EVENT': 18,
    'WHAT HAPPENED': 36,
    'WHY MARKETS CARE': 32,
    'MARKET IMPACT': 34,
    'TICKERS / ASSETS TO WATCH': 16,
  };
  const clipped = formatStructuredAnalysis({
    'MACRO EVENT': clipWords(parsed['MACRO EVENT'] ?? '', caps['MACRO EVENT']),
    'WHAT HAPPENED': clipWords(parsed['WHAT HAPPENED'] ?? '', caps['WHAT HAPPENED']),
    'WHY MARKETS CARE': clipWords(parsed['WHY MARKETS CARE'] ?? '', caps['WHY MARKETS CARE']),
    'MARKET IMPACT': clipWords(parsed['MARKET IMPACT'] ?? '', caps['MARKET IMPACT']),
    'TICKERS / ASSETS TO WATCH': clipWords(
      parsed['TICKERS / ASSETS TO WATCH'] ?? '',
      caps['TICKERS / ASSETS TO WATCH']
    ),
  });
  if (wordCount(clipped) <= maxWords) return clipped;
  return clipWords(clipped.replace(/\n+/g, ' '), maxWords);
}

function ensureConciseSummary(text: string, fallbackText: string): string {
  const candidate = simplifyDenseProse(ensureNaturalSummary(text, fallbackText, 1));
  const concise = splitSentences(candidate).slice(0, 2).join(' ');
  return clipWords(concise || fallbackText, 45);
}

function ensureStructuredImpact(text: string | null, fallback: HeadlineEnrichment): string {
  const merged = `${text ?? ''}`.trim();
  const parsed = parseStructuredSections(merged);
  const fallbackParsed = parseStructuredSections(fallback.why_it_matters ?? '');

  const macroEvent = toSentence(
    parsed['MACRO EVENT'] ??
      fallbackParsed['MACRO EVENT'] ??
      splitSentences(fallback.ai_summary ?? '')[0] ??
      'Macro development with potential cross-asset implications.'
  );
  const happened = toSentence(
    parsed['WHAT HAPPENED'] ??
      fallbackParsed['WHAT HAPPENED'] ??
      splitSentences(fallback.ai_summary ?? '').slice(1).join(' ') ??
      fallback.ai_summary ??
      'The headline signals a change in market narrative.'
  );
  const marketsCare = toSentence(
    parsed['WHY MARKETS CARE'] ??
      fallbackParsed['WHY MARKETS CARE'] ??
      'This matters through expected changes in rates, FX, and risk appetite.'
  );
  const marketImpact = toSentence(
    parsed['MARKET IMPACT'] ??
      fallbackParsed['MARKET IMPACT'] ??
      'Rate-sensitive assets and sectors are likely to react first.'
  );
  const watchFallback = fallback.impacted_tickers.length > 0
    ? fallback.impacted_tickers.slice(0, 4).map((item) => item.ticker).join(', ')
    : 'SPY, QQQ, TLT, DXY';
  const watch = toSentence(
    parsed['TICKERS / ASSETS TO WATCH'] ??
      fallbackParsed['TICKERS / ASSETS TO WATCH'] ??
      watchFallback
  );

  return limitStructuredAnalysisWords(
    formatStructuredAnalysis({
      'MACRO EVENT': macroEvent,
      'WHAT HAPPENED': happened,
      'WHY MARKETS CARE': marketsCare,
      'MARKET IMPACT': marketImpact,
      'TICKERS / ASSETS TO WATCH': watch,
    }),
    150
  );
}

function ensureMinSentences(text: string, minimum: number, extras: string[]): string {
  const base = splitSentences(text);
  for (const extra of extras) {
    if (base.length >= minimum) break;
    if (!base.includes(extra)) base.push(extra);
  }
  return base.join(' ');
}

function ensureNaturalSummary(text: string, fallbackText: string, minimum = 2): string {
  const primary = text.trim();
  if (primary && splitSentences(primary).length >= minimum) return primary;
  return ensureMinSentences(primary || fallbackText, minimum, splitSentences(fallbackText));
}

const SUMMARY_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'over', 'under', 'amid', 'after', 'before', 'while',
  'that', 'this', 'will', 'would', 'could', 'should', 'their', 'about', 'today', 'market', 'markets',
  'stocks', 'stock', 'shares', 'global', 'report', 'reports', 'says', 'said', 'new', 'more', 'than',
  'has', 'have', 'had', 'its', 'are', 'was', 'were', 'been', 'also', 'only', 'very', 'just',
  'across', 'first', 'second', 'third', 'near', 'term', 'headline', 'article', 'update', 'latest',
]);

const GENERIC_SUMMARY_PATTERNS = [
  /primary market posture is/i,
  /first-order transmission channel/i,
  /cross-asset confirmation/i,
  /factor rotation/i,
  /discount-rate and risk-premium repricing/i,
  /relative-value tilts/i,
  /near-term direction is rates-led and valuation-sensitive/i,
  /what to watch:\s*2y\/10y,\s*dxy,\s*vix,\s*and\s*ig\/hy spreads/i,
];

type HeadlineTheme = {
  channel: string;
  baseCase: string;
  watch: string[];
};

function inferHeadlineTheme(title: string, description: string | null): HeadlineTheme {
  const text = `${title} ${description ?? ''}`.toLowerCase();
  if (/\b(fed|fomc|minutes|central bank|policy statement|rate decision)\b/.test(text)) {
    return {
      channel: 'policy-rate expectations and front-end yield repricing',
      baseCase: 'rates-sensitive sectors and USD direction',
      watch: ['2Y Treasury', 'Fed funds futures', 'DXY'],
    };
  }
  if (/\b(cpi|inflation|pce|price pressures?)\b/.test(text)) {
    return {
      channel: 'real-rate and inflation-expectation repricing',
      baseCase: 'duration vs cyclicals rotation',
      watch: ['US 10Y real yield', '5y5y inflation', 'VIX'],
    };
  }
  if (/\b(oil|wti|brent|opec|energy|crude)\b/.test(text)) {
    return {
      channel: 'commodity-price pass-through into inflation and margins',
      baseCase: 'energy leadership vs consumer margin pressure',
      watch: ['WTI', 'Brent', 'energy sector breadth'],
    };
  }
  if (/\b(dollar|usd|dxy|yen|euro|fx|currency)\b/.test(text)) {
    return {
      channel: 'FX translation and global liquidity sensitivity',
      baseCase: 'multinational earnings translation pressure',
      watch: ['DXY', 'EURUSD', 'US 10Y'],
    };
  }
  if (/\b(gdp|jobs|payrolls?|unemployment|growth|recession)\b/.test(text)) {
    return {
      channel: 'growth-surprise repricing in earnings and yields',
      baseCase: 'cyclical vs defensive dispersion',
      watch: ['Payrolls revisions', 'ISM/PMI', '10Y yield'],
    };
  }
  return {
    channel: 'risk-premium repricing through rates, USD, and credit',
    baseCase: 'broad risk sentiment with sector dispersion',
    watch: ['2Y/10Y yields', 'DXY', 'IG/HY spreads'],
  };
}

function extractSpecificTokens(headline: { title: string; description: string | null }): string[] {
  const text = `${headline.title} ${headline.description ?? ''}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');
  const counts = new Map<string, number>();
  for (const token of text.split(/\s+/)) {
    if (!token || token.length < 4 || /^\d+$/.test(token) || SUMMARY_STOPWORDS.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token)
    .slice(0, 6);
}

function extractHeadlineEntities(headline: { title: string; description: string | null }): string[] {
  const text = `${headline.title} ${headline.description ?? ''}`;
  const matches = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}|[A-Z]{2,5}|\d{1,2}Y\/\d{1,2}Y|CPI|GDP|PCE)\b/g) ?? [];
  const blacklist = new Set([
    'The',
    'And',
    'For',
    'With',
    'From',
    'This',
    'That',
    'US',
    'USA',
    'EU',
    'ECB',
    'BOJ',
    'BOE',
    'FED',
    'FOMC',
    'APAC',
    'EMEA',
  ]);
  const deduped = Array.from(
    new Set(
      matches
        .map((item) => item.trim())
        .filter((item) => item.length >= 2 && item.length <= 24 && !blacklist.has(item))
    )
  );
  return deduped.slice(0, 4);
}

function directionalTriplet(bias: 'Risk-On' | 'Risk-Off' | 'Hawkish' | 'Dovish' | 'Neutral'): {
  equities: string;
  rates: string;
  usd: string;
} {
  if (bias === 'Hawkish') return { equities: 'down', rates: 'up', usd: 'up' };
  if (bias === 'Dovish') return { equities: 'up', rates: 'down', usd: 'down' };
  if (bias === 'Risk-Off') return { equities: 'down', rates: 'mixed-to-lower', usd: 'up' };
  if (bias === 'Risk-On') return { equities: 'up', rates: 'mixed-to-higher', usd: 'down' };
  return { equities: 'mixed', rates: 'mixed', usd: 'mixed' };
}

function hasArticleSpecificity(text: string | null | undefined, headline: { title: string; description: string | null }): boolean {
  if (!text) return false;
  const lowered = text.toLowerCase();
  const tokens = extractSpecificTokens(headline);
  const entities = extractHeadlineEntities(headline).map((value) => value.toLowerCase());
  const entityHits = entities.filter((entity) => lowered.includes(entity)).length;
  if (entityHits >= 1) return true;
  if (tokens.length === 0) return false;
  let hits = 0;
  for (const token of tokens) {
    if (lowered.includes(token)) hits += 1;
    if (hits >= 2) return true;
  }
  return false;
}

function isGenericSummary(text: string | null | undefined): boolean {
  if (!text) return true;
  if (text.trim().length < 80) return true;
  return GENERIC_SUMMARY_PATTERNS.some((pattern) => pattern.test(text));
}


export function deterministicFallback(headline: {
  title: string;
  description: string | null;
  contextLines?: string[];
}): HeadlineEnrichment {
  const relevance = assessHeadlineRelevance({
    title: headline.title,
    description: headline.description,
    source: 'unknown',
    minScore: 0,
  });
  const impact = inferEventImpact({
    eventType: relevance.eventType,
    title: headline.title,
    description: headline.description,
  });
  const direction = directionFromBias(impact.bias);
  const theme = inferHeadlineTheme(headline.title, headline.description);
  const directional = directionalTriplet(impact.bias);

  const biasPlain: Record<string, string> = {
    'Risk-On': 'generally positive for stocks',
    'Risk-Off': 'a cautious signal — investors may pull back from risky assets',
    Hawkish: 'a signal that interest rates could stay higher, which tends to pressure stocks',
    Dovish: 'a signal that rate cuts are more likely, which tends to help stocks',
    Neutral: 'unlikely to move markets much on its own',
  };

  const stocksImpact = directional.equities === 'up'
    ? 'equities could benefit as risk appetite improves'
    : directional.equities === 'down'
      ? 'equities may face pressure from discount-rate or risk-off repricing'
      : 'equity reaction is likely mixed';
  const ratesImpact = directional.rates.includes('up') || directional.rates.includes('higher')
    ? 'yields may move higher on tighter policy expectations'
    : directional.rates.includes('down') || directional.rates.includes('lower')
      ? 'yields may drift lower as easing expectations build'
      : 'rates may trade in a mixed range';
  const fxImpact = directional.usd === 'up'
    ? 'the dollar could strengthen on relative rate support'
    : directional.usd === 'down'
      ? 'the dollar could soften as policy expectations turn easier'
      : 'FX impact is likely mixed';

  const leadSectors = impact.affectedSectors.slice(0, 2);
  const winnerSectors = leadSectors
    .filter((s) => s.direction === 'up')
    .map((s) => s.sector);
  const loserSectors = leadSectors
    .filter((s) => s.direction === 'down')
    .map((s) => s.sector);

  const summaryLine = biasPlain[impact.bias] ?? 'A market signal worth watching';
  const whyLine = impact.bias === 'Hawkish'
    ? 'Why it matters: higher rates tend to lift yields and the dollar, and pressure stocks and duration-sensitive assets.'
    : impact.bias === 'Dovish'
      ? 'Why it matters: rate-cut expectations tend to support stocks and pressure the dollar and bond yields.'
      : impact.bias === 'Risk-Off'
        ? 'Why it matters: risk-off sentiment tends to support the dollar and pressure equities.'
        : impact.bias === 'Risk-On'
          ? 'Why it matters: risk-on sentiment tends to support stocks and pressure the dollar.'
          : 'Watch how rates, the dollar, and sector leadership respond.';
  const aiSummarySentences = [
    toSentence(headline.title),
    toSentence(headline.description && headline.description.trim().length > 0 ? headline.description : summaryLine),
  ].filter(Boolean);
  const aiSummary = ensureConciseSummary(aiSummarySentences.join(' '), aiSummarySentences.join(' '));
  const fallbackWatch = Array.from(
    new Set([
      ...impact.affectedTickers.slice(0, 3).map((item) => item.ticker),
      ...(theme.watch.length > 0 ? theme.watch.slice(0, 2) : ['SPY', 'TLT']),
    ])
  ).join(', ');
  const marketImpactDetail = [
    toSentence(`${stocksImpact}; ${ratesImpact}; ${fxImpact}`),
    winnerSectors.length > 0 ? toSentence(`Likely beneficiaries include ${winnerSectors.join(', ')}`) : '',
    loserSectors.length > 0 ? toSentence(`Potential laggards include ${loserSectors.join(', ')}`) : '',
  ]
    .filter(Boolean)
    .join(' ');
  const structuredFallback = formatStructuredAnalysis({
    'MACRO EVENT': toSentence(headline.title || summaryLine),
    'WHAT HAPPENED': toSentence(headline.description?.trim() || summaryLine),
    'WHY MARKETS CARE': toSentence(whyLine.replace(/^Why it matters:\s*/i, 'This matters because ')),
    'MARKET IMPACT': toSentence(marketImpactDetail || `${stocksImpact}, ${ratesImpact}, and ${fxImpact}`),
    'TICKERS / ASSETS TO WATCH': toSentence(fallbackWatch || 'SPY, QQQ, TLT, DXY'),
  });
  const whyItMatters = limitStructuredAnalysisWords(structuredFallback, 150);

  return headlineEnrichmentSchema.parse({
    ai_summary: aiSummary,
    why_it_matters: whyItMatters,
    impacted_sectors: impact.affectedSectors.length > 0
      ? impact.affectedSectors.map((sector) => ({
          sector: sector.sector,
          direction: sector.direction,
          rationale: sector.rationale,
        }))
      : [{ sector: 'Financials', direction, rationale: 'Broad market sensitivity.' }],
    impacted_tickers: impact.affectedTickers.length > 0
      ? impact.affectedTickers.map((ticker) => ({
          ticker: ticker.ticker,
          direction: ticker.direction,
          rationale: ticker.rationale,
        }))
      : [{ ticker: 'SPY', direction, rationale: 'Tracks the overall stock market.' }],
    confidence: impact.confidence,
  });
}

function normalizeDirection(value: unknown): 'up' | 'down' | 'mixed' | 'unknown' {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'up' || normalized === 'down' || normalized === 'mixed' || normalized === 'unknown') {
    return normalized;
  }
  if (normalized === 'positive' || normalized === 'bullish') return 'up';
  if (normalized === 'negative' || normalized === 'bearish') return 'down';
  if (normalized === 'neutral') return 'mixed';
  return 'unknown';
}

const ALLOWED_SECTORS = new Set([
  'Technology',
  'Financials',
  'Healthcare',
  'Consumer Discretionary',
  'Consumer Staples',
  'Industrials',
  'Energy',
  'Materials',
  'Utilities',
  'Real Estate',
  'Communication Services',
]);

const INVALID_TICKER_TOKENS = new Set([
  'US',
  'USA',
  'EU',
  'ECB',
  'BOJ',
  'BOE',
  'RBNZ',
  'PBOC',
  'RBI',
  'RBA',
  'CBN',
  'BIS',
  'IMF',
  'OECD',
  'FED',
  'FOMC',
  'EMEA',
  'APAC',
  'DXY',
  'VIX',
  'WTI',
  'BRENT',
  'CPI',
  'PCE',
  'GDP',
]);

function normalizeSectorLabel(value: unknown): string {
  if (typeof value !== 'string') return 'Technology';
  const clean = value.trim();
  if (ALLOWED_SECTORS.has(clean)) return clean;
  return 'Technology';
}

function normalizeTickerLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value
    .trim()
    .toUpperCase()
    .replace(/^\$/g, '')
    .replace(/[^A-Z]/g, '');
  if (!clean || clean.length < 1 || clean.length > 5) return null;
  if (INVALID_TICKER_TOKENS.has(clean)) return null;
  return clean;
}

function coerceToHeadlineEnrichment(payload: unknown): HeadlineEnrichment {
  const row = (payload && typeof payload === 'object') ? (payload as Record<string, unknown>) : {};

  const impactedSectorsRaw = Array.isArray(row.impacted_sectors) ? row.impacted_sectors : [];
  const impactedTickersRaw = Array.isArray(row.impacted_tickers) ? row.impacted_tickers : [];

  const normalized: HeadlineEnrichment = {
    ai_summary: typeof row.ai_summary === 'string' && row.ai_summary.trim().length > 0 ? row.ai_summary.trim() : null,
    why_it_matters:
      typeof row.why_it_matters === 'string' && row.why_it_matters.trim().length > 0
        ? row.why_it_matters.trim()
        : null,
    impacted_sectors: impactedSectorsRaw
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => ({
        sector: normalizeSectorLabel(item.sector) as SectorName,
        direction: normalizeDirection(item.direction),
        rationale: typeof item.rationale === 'string' ? item.rationale : undefined,
      })),
    impacted_tickers: Array.from(
      new Map(
        impactedTickersRaw
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
          .map((item) => {
            const ticker = normalizeTickerLabel(item.ticker);
            if (!ticker) return null;
            return {
              ticker,
              direction: normalizeDirection(item.direction),
              rationale: typeof item.rationale === 'string' ? item.rationale : undefined,
            };
          })
          .filter((item) => item != null)
          .map((item) => [`${item.ticker}:${item.direction}`, item] as const)
      ).values()
    ) as HeadlineEnrichment['impacted_tickers'],
    confidence:
      row.confidence === 'high' || row.confidence === 'medium' || row.confidence === 'low'
        ? row.confidence
        : 'medium',
  };

  return headlineEnrichmentSchema.parse(normalized);
}

function ensureCompleteness(
  enrichment: HeadlineEnrichment,
  headline: { title: string; description: string | null; contextLines?: string[] }
): HeadlineEnrichment {
  const fallback = deterministicFallback(headline);
  const ensureSpecificSummary = (text: string | null): string | null => {
    const candidate = (text ?? '').trim();
    const shouldFallback = !candidate || isGenericSummary(candidate) || !hasArticleSpecificity(candidate, headline);
    const picked = shouldFallback ? (fallback.ai_summary ?? '').trim() : candidate;
    if (!picked) return null;
    const withSpecificity = hasArticleSpecificity(picked, headline)
      ? picked
      : `${picked} Catalyst from headline: ${headline.title}.`;
    return simplifyDenseProse(ensureNaturalSummary(withSpecificity, fallback.ai_summary ?? '', 2));
  };
  const ensureConcreteImpact = (text: string | null, fallbackText: string | null): string | null => {
    const candidate = (text ?? '').trim();
    const fb = (fallbackText ?? '').trim();
    if (candidate && candidate.length > 40) return candidate;
    if (fb) return fb;
    return null;
  };
  return headlineEnrichmentSchema.parse({
    ai_summary: ensureSpecificSummary(enrichment.ai_summary),
    why_it_matters: ensureConcreteImpact(enrichment.why_it_matters, fallback.why_it_matters),
    impacted_sectors: enrichment.impacted_sectors.length > 0 ? enrichment.impacted_sectors : fallback.impacted_sectors,
    impacted_tickers:
      enrichment.impacted_tickers.filter((ticker) => normalizeTickerLabel(ticker.ticker) !== null).length > 0
        ? enrichment.impacted_tickers
            .map((ticker) => ({
              ...ticker,
              ticker: normalizeTickerLabel(ticker.ticker) ?? ticker.ticker,
            }))
            .filter((ticker): ticker is { ticker: string; direction: 'up' | 'down' | 'mixed' | 'unknown'; rationale?: string } =>
              normalizeTickerLabel(ticker.ticker) !== null
            )
        : fallback.impacted_tickers,
    confidence: enrichment.confidence || fallback.confidence,
  });
}

function hasLowQualityLegacySummary(summary: string | null | undefined): boolean {
  if (!summary) return true;
  const text = summary.toLowerCase();
  return (
      text.includes('primary market posture is') ||
    text.includes('first-order transmission channel') ||
      text.includes('additional context unavailable') ||
      text.includes('near-term direction is rates-led and valuation-sensitive') ||
      text.length < 80 ||
      !/(market impact|yields?|dxy|vix|credit|spread|sector|transmission)/i.test(text)
  );
}

function hasLowQualityTickers(tickers: string[] | null | undefined): boolean {
  if (!tickers || tickers.length === 0) return false;
  return tickers.some((ticker) => {
    const clean = ticker.trim().toUpperCase();
    return (
      clean.length < 2 ||
      clean === 'US' ||
      clean === 'USA' ||
      clean === 'EU' ||
      clean === 'ECB' ||
      clean === 'BOJ' ||
      clean === 'EMEA'
    );
  });
}

export async function getEnrichmentForHeadline(headline: {
  title: string;
  description: string | null;
  url: string;
  contextLines?: string[];
}): Promise<HeadlineEnrichment> {
  try {
    const supabase = getSupabaseClient();
    const existing = await supabase
      .from('news_enrichments')
      .select('*')
      .eq('url', headline.url)
      .maybeSingle();

    if (!existing.error && existing.data) {
      const row = dbRowSchema.safeParse(existing.data);
      if (row.success && row.data.ai_summary) {
        if (
          !hasLowQualityLegacySummary(row.data.ai_summary) &&
          !hasLowQualityTickers(row.data.affected_tickers ?? [])
        ) {
        const fromCache = headlineEnrichmentSchema.parse({
          ai_summary: row.data.ai_summary,
          why_it_matters: row.data.why_it_matters || 'No additional context available.',
          impacted_sectors: (row.data.affected_sectors ?? []).map((sector) => ({
            sector,
            direction: 'unknown',
          })),
          impacted_tickers: (row.data.affected_tickers ?? []).map((ticker) => ({
            ticker,
            direction: 'unknown',
          })),
          confidence: row.data.confidence || 'medium',
        });
        return ensureCompleteness(fromCache, headline);
        }
      }
    }
  } catch (error) {
    // continue to best-effort enrichment
  }

  // Prefer user key for interactive headline expands; fall back to service key.
  const userKey = getOpenAIKey('user');
  const serviceKey = getOpenAIKey('service');
  const apiKey = userKey ?? serviceKey;
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[news/enrichment] key source', {
      source: userKey ? 'user' : serviceKey ? 'service' : 'none',
      hasUserKey: Boolean(userKey),
      hasServiceKey: Boolean(serviceKey),
    });
  }
  if (!apiKey) {
    return deterministicFallback(headline);
  }

  const openai = new OpenAI({ apiKey });
  try {
    const models = getOpenAIModelCandidates(process.env.OPENAI_MODEL);
    let response: Awaited<ReturnType<typeof openai.responses.create>> | null = null;
    let lastError: unknown = null;
    for (const model of models) {
      try {
        response = await openai.responses.create({
          model,
          temperature: 0.2,
          input: [
            {
              role: 'system',
              content: EVENT_INTELLIGENCE_SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: `Headline: ${headline.title}
Description: ${headline.description ?? 'None'}

Return JSON with these fields:

"ai_summary": Concise plain-English summary in sentence form (no bullets, no markdown). Keep it brief and investor-focused.

"why_it_matters": Use this exact structure with short sentence-based paragraphs (no bullets, no markdown):
MACRO EVENT: one sentence describing the key macro development.
WHAT HAPPENED: 2-3 factual sentences.
WHY MARKETS CARE: explain the macro transmission mechanism (rates, FX, liquidity, geopolitics, or risk sentiment).
MARKET IMPACT: explain which assets/sectors may benefit or face pressure, with brief reasoning.
TICKERS / ASSETS TO WATCH: list relevant ETFs, commodities, sectors, or equities in one concise sentence.

Hard requirement: keep the total "why_it_matters" output under 150 words.

IMPORTANT:
- Never copy article text verbatim.
- Keep language concrete and causally grounded.

"impacted_tickers": array of {ticker, direction, rationale}
"impacted_sectors": array of {sector, direction, rationale}
  Allowed sectors: Technology, Financials, Healthcare, Consumer Discretionary, Consumer Staples, Industrials, Energy, Materials, Utilities, Real Estate, Communication Services
  Directions: up, down, mixed, unknown
"confidence": high, medium, or low

Rules:
- No pseudo-tickers like EU, ECB, US, APAC.
- If this headline has weak market relevance, say so and set confidence=low.
- Do not invent facts not in the headline.`,
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'headline_enrichment',
              strict: true,
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  ai_summary: { type: 'string' },
                  why_it_matters: { type: 'string' },
                  impacted_tickers: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        ticker: { type: 'string' },
                        direction: { type: 'string' },
                        rationale: { type: ['string', 'null'] },
                      },
                      required: ['ticker', 'direction', 'rationale'],
                    },
                  },
                  impacted_sectors: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        sector: { type: 'string' },
                        direction: { type: 'string' },
                        rationale: { type: ['string', 'null'] },
                      },
                      required: ['sector', 'direction', 'rationale'],
                    },
                  },
                  confidence: { type: 'string' },
                },
                required: ['ai_summary', 'why_it_matters', 'impacted_tickers', 'impacted_sectors', 'confidence'],
              },
            },
          },
        } as never);
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[news/enrichment] model selected', { model });
        }
        break;
      } catch (error) {
        lastError = error;
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[news/enrichment] model failed', {
            model,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    if (!response) {
      throw (lastError instanceof Error ? lastError : new Error('OpenAI enrichment failed across all model candidates'));
    }

    const parsed = JSON.parse(response.output_text || '{}');
    const enriched = ensureCompleteness(coerceToHeadlineEnrichment(parsed), headline);
    const fallback = deterministicFallback(headline);
    const enrichment = headlineEnrichmentSchema.parse({
      ...enriched,
      ai_summary: ensureConciseSummary(enriched.ai_summary ?? '', fallback.ai_summary ?? ''),
      why_it_matters: ensureStructuredImpact(enriched.why_it_matters ?? '', fallback),
    });

    try {
      const supabase = getSupabaseClient();
      await supabase.from('news_enrichments').upsert(
        {
          url: headline.url,
          title: headline.title,
          ai_summary: enrichment.ai_summary,
          why_it_matters: enrichment.why_it_matters,
          affected_tickers: enrichment.impacted_tickers.map((t) => t.ticker),
          affected_sectors: enrichment.impacted_sectors.map((s) => s.sector),
          confidence: enrichment.confidence,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'url' }
      );
    } catch {
      // cache write is best-effort
    }

    return enrichment;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[news/enrichment] openai enrichment failed', error);
    }
    return deterministicFallback(headline);
  }
}
