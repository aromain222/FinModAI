import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { z } from 'zod';
import { getOpenAIKey, getOpenAIModelCandidates } from '@/lib/openaiKey';
import { headlineEnrichmentSchema, type HeadlineEnrichment, type SectorName } from '@/lib/news/types';
import { inferEventImpact } from '@/lib/news/eventImpact';
import { assessHeadlineRelevance } from '@/lib/news/relevance';

const EVENT_INTELLIGENCE_SYSTEM_PROMPT = `You are CapitalBase Analyst, a professional financial markets analyst.

Your job is to convert financial news into clear, structured market intelligence.

PRIMARY RULE: RESPONSES MUST BE EASY TO READ.

Formatting rules:
- Never write long paragraphs.
- Each section must use bullet points (lines starting with "• ").
- Each bullet must be one short sentence.
- Maximum 12 words per bullet when possible.
- Leave a blank line between sections.
- Do not combine multiple sections in one paragraph.
- Only include sections that are relevant.
- Avoid dense text blocks.
- The output should be scannable in a dashboard card.

If a section has no clear impact, omit it entirely.
Never output text like "Stocks: ... Bonds: ... Dollar: ..." on one line.
Each asset class must appear on its own line with bullets underneath.

EXPLAIN THE "WHY": For every direction you give (up, down, pressure, strength), add a brief reason in the same bullet — e.g. "Yields may rise because higher policy rates push bond yields up" or "Dollar could strengthen as higher rates attract capital into USD." Do not just state the direction; give the one-line cause so readers understand why things are moving.

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
  const entities = extractHeadlineEntities(headline);
  const directional = directionalTriplet(impact.bias);

  const biasPlain: Record<string, string> = {
    'Risk-On': 'generally positive for stocks',
    'Risk-Off': 'a cautious signal — investors may pull back from risky assets',
    Hawkish: 'a signal that interest rates could stay higher, which tends to pressure stocks',
    Dovish: 'a signal that rate cuts are more likely, which tends to help stocks',
    Neutral: 'unlikely to move markets much on its own',
  };

  const stocksBullet = directional.equities === 'up' ? '• Stocks could move higher — risk appetite improves' : directional.equities === 'down' ? '• Stocks could come under pressure — higher discount rates or risk-off sentiment' : '• Stock reaction is likely mixed';
  const ratesBullet = directional.rates.includes('up') || directional.rates.includes('higher') ? '• Yields may rise — higher policy rates or inflation expectations push bond yields up' : directional.rates.includes('down') || directional.rates.includes('lower') ? '• Yields may fall — rate-cut expectations or flight to safety' : null;
  const fxBullet = directional.usd === 'up' ? '• Dollar could strengthen — higher US rates attract capital into USD' : directional.usd === 'down' ? '• Dollar could weaken — rate cuts or risk-on flows favor other currencies' : null;

  const leadSectors = impact.affectedSectors.slice(0, 2);
  const winnerBullets = leadSectors.filter((s) => s.direction === 'up').map((s) => `• ${s.sector}: ${s.rationale ?? 'tends to benefit when rates or risk sentiment move this way'}`);
  const loserBullets = leadSectors.filter((s) => s.direction === 'down').map((s) => `• ${s.sector}: ${s.rationale ?? 'duration-sensitive or hurt by higher discount rates'}`);

  const aiSummary = headline.description
    ? `${headline.title}. ${headline.description}`
    : `${headline.title}.`;

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

  const sections: string[] = [
    'SUMMARY',
    `• ${summaryLine}`,
    `• ${whyLine}`,
    '',
    'MARKET IMPACT',
    '',
    'Equities',
    stocksBullet,
    ...(ratesBullet ? ['', 'Rates', ratesBullet] : []),
    ...(fxBullet ? ['', 'FX', fxBullet] : []),
    ...(winnerBullets.length > 0 ? ['', 'WINNERS', ...winnerBullets] : []),
    ...(loserBullets.length > 0 ? ['', 'LOSERS', ...loserBullets] : []),
    '',
    'WATCH NEXT',
    ...theme.watch.slice(0, 3).map((w) => `• ${w}`),
  ];

  const whyItMatters = sections.join('\n');

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

"ai_summary": 2-3 plain-English sentences explaining what happened and why it matters. Write as one short paragraph (no bullets, no markdown).

"why_it_matters": A structured analysis using this EXACT format. Each section header is on its own line. Every content line starts with "• ". Only include sections that are relevant — omit any section with no clear impact.

SUMMARY
• 1-2 short bullets explaining the event
• One bullet that states why this moves markets (e.g. "Why it matters: higher rates tend to lift yields and the dollar, and pressure stocks.")

DRIVERS
• key economic drivers
• policy changes or supply/demand shifts

MARKET IMPACT
Only include relevant asset classes. Each asset class gets its own sub-header.
For each bullet: state the direction AND a brief reason why (one short phrase).

Equities
• [direction] — [why, e.g. "higher rates tend to pressure valuations"]

Rates
• [direction] — [why, e.g. "policy expectations push bond yields up"]

FX
• [direction] — [why, e.g. "higher US rates attract flows into the dollar"]

Commodities
• [direction] — [why, e.g. "supply concern supports prices"]

WINNERS
• sector or asset — brief reason why they benefit (e.g. "banks earn more when rates rise")

LOSERS
• sector or asset — brief reason why they lose (e.g. "duration-sensitive assets hurt by higher yields")

WATCH NEXT
• upcoming catalysts
• economic data releases

IMPORTANT:
- Every content line MUST start with "• "
- Each bullet is ONE short sentence, max ~12 words for the main claim; you may add a short "because X" or "— X" for the why
- For MARKET IMPACT and WINNERS/LOSERS: always include a brief "why" (e.g. "Yields may rise — higher policy rates push bond yields up" or "Financials: benefit from wider net interest margins")
- Leave blank lines between sections
- Omit sections with no clear impact
- Never combine multiple ideas in one bullet
- For "ai_summary", do NOT use bullets. Use 2-3 complete sentences in paragraph form.

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
    const enrichment = headlineEnrichmentSchema.parse({
      ...enriched,
      ai_summary: ensureNaturalSummary(
        enriched.ai_summary ?? '',
        deterministicFallback(headline).ai_summary ?? '',
        2
      ),
      why_it_matters: ensureMinSentences(
        enriched.why_it_matters ?? '',
        4,
        splitSentences(deterministicFallback(headline).why_it_matters ?? '')
      ),
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
