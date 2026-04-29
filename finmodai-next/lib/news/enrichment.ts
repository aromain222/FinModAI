import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';
import { headlineEnrichmentSchema, modelImpactSchema, type HeadlineEnrichment, type ModelImpact, type SectorName } from '@/lib/news/types';
import { inferEventImpact, isBroadProxyTicker } from '@/lib/news/eventImpact';
import { assessHeadlineRelevance } from '@/lib/news/relevance';

const HEADLINE_INTELLIGENCE_SYSTEM_PROMPT = `You are writing for an asset manager, not a general audience.

Output must read like a short internal desk note.

Rules:
- No labels (no "SUMMARY", "IMPACT", etc.)
- No long paragraphs
- No filler language
- No explanations of obvious concepts
- Keep it under 5 lines total

Structure:
1. One-line takeaway
2. 3–4 bullet points (short, direct)
3. Optional bias + risk

Tone: concise, directional, confident, minimal words.

Bad: "The update signals easier policy expectations and could support risk assets…"
Good: "Rates expectations easing → supportive for risk assets."

Output must be valid JSON matching the schema.`;

const GENERAL_INTELLIGENCE_SYSTEM_PROMPT = `You are writing for an asset manager, not a general audience.

Output must read like a short internal desk note.

Rules:
- No labels (no "SUMMARY", "IMPACT", etc.)
- No long paragraphs
- No filler language
- No explanations of obvious concepts
- Keep it under 5 lines total

Structure:
1. One-line takeaway
2. 3–4 bullet points (short, direct)
3. Optional bias + risk

Tone: concise, directional, confident, minimal words.

Bad: "The update signals easier policy expectations and could support risk assets…"
Good: "Rates expectations easing → supportive for risk assets."

Your goal is clarity and speed, not completeness.

Output must be valid JSON matching the schema.`;

function isPoliticalProcessHeadline(headline: { title: string; description: string | null }): boolean {
  const text = `${headline.title} ${headline.description ?? ''}`.toLowerCase();
  const processPattern =
    /\b(senator|senate|nomination|nominee|chair pick|meets with|meeting with|blockade|committee|confirmation|hearing|whip count|white house)\b/i;
  const hardMacroPattern =
    /\b(rate|rates|yield|yields|inflation|cpi|pce|jobs|payrolls|treasury|tariff|sanction|oil|wti|brent|fomc|fed funds)\b/i;
  return processPattern.test(text) && !hardMacroPattern.test(text);
}

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

function clipWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(' ').replace(/[.,;:!?-]+$/g, '')}.`;
}

const MACRO_SECTION_ORDER = ['SUMMARY', 'IMPACT', 'ANALYSIS', 'MOST AFFECTED STOCKS/SECTORS'] as const;

type MacroSectionLabel = (typeof MACRO_SECTION_ORDER)[number];

const MACRO_SECTION_ALIASES: Record<MacroSectionLabel, string[]> = {
  SUMMARY: ['SUMMARY', 'EVENT', 'INVESTOR TAKEAWAY', 'MACRO EVENT'],
  IMPACT: ['IMPACT', 'WHY IT MATTERS', 'DRIVERS'],
  ANALYSIS: [
    'ANALYSIS',
    'MARKET IMPACT',
    'PREDICTION',
    'BASE CASE',
    'BULL CASE',
    'BEAR CASE',
    'SECTOR IMPACT',
    'MODEL IMPLICATIONS',
  ],
  'MOST AFFECTED STOCKS/SECTORS': [
    'MOST AFFECTED STOCKS/SECTORS',
    'MOST AFFECTED STOCKS AND SECTORS',
    'WATCH ITEMS',
    'WATCH NEXT',
    'TICKERS TO WATCH',
    'ASSETS TO WATCH',
    'TICKERS / ASSETS TO WATCH',
    'TICKERS/ASSETS TO WATCH',
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

function extractSectionByAliases(text: string, aliases: string[]): string | null {
  const allLabels = Array.from(
    new Set([...MACRO_SECTION_ORDER.flatMap((label) => MACRO_SECTION_ALIASES[label]), ...aliases])
  );
  const allPattern = allLabels.map((label) => escapeRegExp(label)).join('|');
  for (const alias of aliases) {
    const regex = new RegExp(
      `(?:^|\\n)\\s*${escapeRegExp(alias)}\\s*:?\\s*([\\s\\S]*?)(?=(?:\\n\\s*(?:${allPattern})\\s*:?)|$)`,
      'i'
    );
    const capture = text.match(regex)?.[1]?.trim();
    if (capture) return capture;
  }
  return null;
}

function parseBulletItems(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const normalized = raw.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const lineItems = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter((line) => line.length > 0 && !/^[A-Z][A-Z\s/:-]{2,}$/.test(line));
  if (lineItems.length > 0) return lineItems;
  return normalized
    .split(/(?<=[.!?])\s+|;\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function wordCount(text: string): number {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}

function toBullet(item: string): string {
  const clean = item.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.includes('→') ? clean : toSentence(clean);
}

function formatStructuredAnalysis(sections: Record<MacroSectionLabel, string[]>): string {
  return MACRO_SECTION_ORDER
    .map((label) => {
      const items = sections[label]
        .map((item) => toBullet(item))
        .filter(Boolean);
      if (items.length === 0) return '';
      return `${label}\n${items.map((item) => `- ${item}`).join('\n')}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function limitStructuredAnalysisWords(text: string, maxWords = 340): string {
  if (wordCount(text) <= maxWords) return text;
  const parsed = parseStructuredSections(text);
  if (Object.keys(parsed).length < 3) {
    return clipWords(text.replace(/\n+/g, ' '), maxWords);
  }
  const caps: Record<MacroSectionLabel, number> = {
    SUMMARY: 42,
    IMPACT: 88,
    ANALYSIS: 96,
    'MOST AFFECTED STOCKS/SECTORS': 54,
  };
  const clipped = formatStructuredAnalysis({
    SUMMARY: [clipWords(parsed.SUMMARY ?? '', caps.SUMMARY)],
    IMPACT: [clipWords(parsed.IMPACT ?? '', caps.IMPACT)],
    ANALYSIS: [clipWords(parsed.ANALYSIS ?? '', caps.ANALYSIS)],
    'MOST AFFECTED STOCKS/SECTORS': [clipWords(parsed['MOST AFFECTED STOCKS/SECTORS'] ?? '', caps['MOST AFFECTED STOCKS/SECTORS'])],
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
  const legacySummary = extractSectionByAliases(merged, ['EVENT']);
  const fallbackLegacySummary = extractSectionByAliases(fallback.why_it_matters ?? '', ['EVENT']);
  const baseSummarySentences = splitSentences(fallback.ai_summary ?? '');
  const summary =
    parseBulletItems(parsed.SUMMARY ?? legacySummary ?? fallbackParsed.SUMMARY ?? fallbackLegacySummary)[0] ??
    baseSummarySentences[0] ??
    'The headline introduces a real but bounded market read-through.';

  const impact = parseBulletItems(
    parsed.IMPACT ??
      extractSectionByAliases(merged, ['WHY IT MATTERS', 'DRIVERS']) ??
      fallbackParsed.IMPACT ??
      extractSectionByAliases(fallback.why_it_matters ?? '', ['WHY IT MATTERS', 'DRIVERS'])
  );
  if (impact.length === 0 && baseSummarySentences.length > 1) {
    impact.push(baseSummarySentences[1]);
  }
  if (impact.length === 0) {
    impact.push('The economic significance depends on whether this change flows through revenue, margins, financing conditions, or regulatory pressure.');
  }

  const analysis = parseBulletItems(
    parsed.ANALYSIS ??
      extractSectionByAliases(merged, ['MARKET IMPACT', 'PREDICTION', 'BASE CASE', 'SECTOR IMPACT', 'MODEL IMPLICATIONS']) ??
      extractSectionByAliases(merged, ['PREDICTION', 'BASE CASE', 'SECTOR IMPACT', 'MODEL IMPLICATIONS']) ??
      fallbackParsed.ANALYSIS ??
      extractSectionByAliases(fallback.why_it_matters ?? '', ['MARKET IMPACT', 'PREDICTION', 'BASE CASE', 'SECTOR IMPACT', 'MODEL IMPLICATIONS'])
  );
  if (analysis.length === 0) {
    if (fallback.impacted_tickers.length > 0) {
      analysis.push(
        ...fallback.impacted_tickers.slice(0, 3).map((item) => {
          const directionLabel =
            item.direction === 'up' ? 'incrementally positive' : item.direction === 'down' ? 'mildly negative' : 'mixed';
          return `${item.ticker}: ${directionLabel}${item.rationale ? `; ${item.rationale}` : ''}`;
        })
      );
    } else if (fallback.impacted_sectors.length > 0) {
      analysis.push(
        ...fallback.impacted_sectors.slice(0, 3).map((item) => `${item.sector}: ${item.direction === 'up' ? 'relatively positive' : item.direction === 'down' ? 'sentiment negative' : 'mixed reaction likely'}`)
      );
    } else {
      analysis.push('The likely market reaction is selective rather than broad unless follow-through changes earnings, policy, or financing expectations.');
    }
  }

  const mostAffected = parseBulletItems(
    parsed['MOST AFFECTED STOCKS/SECTORS'] ??
      extractSectionByAliases(merged, ['MOST AFFECTED STOCKS/SECTORS', 'MOST AFFECTED STOCKS AND SECTORS']) ??
      fallbackParsed['MOST AFFECTED STOCKS/SECTORS'] ??
      extractSectionByAliases(fallback.why_it_matters ?? '', ['MOST AFFECTED STOCKS/SECTORS', 'MOST AFFECTED STOCKS AND SECTORS'])
  );
  if (mostAffected.length === 0) {
    if (fallback.impacted_tickers.length > 0) {
      mostAffected.push(
        fallback.impacted_tickers
          .slice(0, 4)
          .map((item) => `${item.ticker}${item.rationale ? `: ${item.rationale}` : ''}`)
          .join(', ')
      );
    } else if (fallback.impacted_sectors.length > 0) {
      mostAffected.push(
        fallback.impacted_sectors
          .slice(0, 4)
          .map((item) => `${item.sector}${item.rationale ? `: ${item.rationale}` : ''}`)
          .join(', ')
      );
    } else {
      mostAffected.push('None beyond the directly exposed company or sector.');
    }
  }

  return limitStructuredAnalysisWords(
    formatStructuredAnalysis({
      SUMMARY: [summary],
      IMPACT: impact.slice(0, 3),
      ANALYSIS: analysis.slice(0, 4),
      'MOST AFFECTED STOCKS/SECTORS': mostAffected.slice(0, 3),
    }),
    340
  );
}

function ensureGeneralImpact(text: string | null, fallback: HeadlineEnrichment): string {
  const candidate = simplifyDenseProse((text ?? '').trim());
  const fallbackText = simplifyDenseProse((fallback.why_it_matters ?? '').trim());
  if (candidate && splitSentences(candidate).length >= 2) return candidate;
  if (fallbackText) return fallbackText;
  return 'This development matters through potential effects on rates, FX, and risk sentiment.';
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

function isQuestionStyleTitle(title: string): boolean {
  const trimmed = title.trim();
  return /^(what|will|should|can|is|are|do|does|did|how)\b/i.test(trimmed) || trimmed.endsWith('?');
}

function normalizedFallbackEventLine(headline: { title: string; description: string | null }): string {
  const title = headline.title.trim();
  const description = headline.description?.trim();
  if (description && (isQuestionStyleTitle(title) || title.length < 24)) {
    return description.replace(/\s+/g, ' ').trim();
  }
  return title || description || 'Macro update';
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
  const eventLine = normalizedFallbackEventLine(headline);
  const directional = directionalTriplet(impact.bias);
  const lowRelevance = !relevance.accepted || relevance.score < 45;
  const politicalProcessOnly = isPoliticalProcessHeadline(headline);

  const stocksImpact = /\b(oil|wti|brent|opec|energy|crude)\b/i.test(eventLine)
    ? directional.equities === 'down'
      ? 'equities may stay under pressure as higher oil reinforces inflation and delays rate-cut relief'
      : 'energy leadership can offset some broader index pressure if oil strength holds'
    : directional.equities === 'up'
      ? 'equities could benefit as risk appetite improves'
      : directional.equities === 'down'
        ? 'equities may face pressure from discount-rate or risk-off repricing'
        : `equity reaction should stay selective, with the focus on ${theme.baseCase}`;
  const ratesImpact = directional.rates.includes('up') || directional.rates.includes('higher')
    ? 'yields may move higher on tighter policy expectations'
    : directional.rates.includes('down') || directional.rates.includes('lower')
      ? 'yields may drift lower as easing expectations build'
      : `rates should stay range-bound unless ${theme.channel} starts to reprice materially`;
  const fxImpact = directional.usd === 'up'
    ? 'the dollar could strengthen on relative rate support'
    : directional.usd === 'down'
      ? 'the dollar could soften as policy expectations turn easier'
      : 'FX should stay contained unless yields or risk appetite move decisively';

  const leadSectors = impact.affectedSectors.slice(0, 2);
  const winnerSectors = leadSectors
    .filter((s) => s.direction === 'up')
    .map((s) => s.sector);
  const loserSectors = leadSectors
    .filter((s) => s.direction === 'down')
    .map((s) => s.sector);

  const summaryLine = lowRelevance || politicalProcessOnly
    ? 'The headline adds political or process uncertainty, but the immediate market read-through appears limited unless it changes policy expectations directly.'
    : impact.bias === 'Hawkish'
    ? 'The update signals tighter policy expectations with broader cross-asset effects.'
    : impact.bias === 'Dovish'
      ? 'The update signals easier policy expectations and support for risk assets.'
      : impact.bias === 'Risk-Off'
        ? 'The update signals a defensive macro tone with risk-premium repricing.'
        : impact.bias === 'Risk-On'
          ? 'The update signals improving risk appetite and cyclical sensitivity.'
          : 'The update appears incremental and may not reset the macro baseline.';
  const whyLine = lowRelevance || politicalProcessOnly
    ? 'Markets are unlikely to reprice materially unless follow-up reporting changes the expected policy path, timing, or credibility of the underlying institution.'
    : impact.bias === 'Hawkish'
    ? 'Higher rate expectations can lift yields and USD while pressuring long-duration equities.'
    : impact.bias === 'Dovish'
      ? 'Easing expectations can lower yields and USD while supporting risk assets.'
      : impact.bias === 'Risk-Off'
        ? 'Risk aversion can support USD and defensives while weighing on cyclicals.'
        : impact.bias === 'Risk-On'
          ? 'Risk appetite can support cyclicals and broad equities while easing dollar demand.'
          : 'Without new macro information, cross-asset repricing is typically limited.';
  const aiSummarySentences = lowRelevance || politicalProcessOnly
    ? [
        toSentence(summaryLine),
        toSentence(whyLine),
      ].filter(Boolean)
    : [
        toSentence(eventLine),
        toSentence(headline.description && headline.description.trim().length > 0 && !isQuestionStyleTitle(headline.title) ? headline.description : whyLine),
      ].filter(Boolean);
  const aiSummary = ensureConciseSummary(aiSummarySentences.join(' '), aiSummarySentences.join(' '));
  const formattedImpactWatch = impact.affectedTickers
    .filter((item) => !isBroadProxyTicker(item.ticker))
    .slice(0, 4)
    .map((item) => {
      const directionLabel =
        item.direction === 'up' ? 'Positive' : item.direction === 'down' ? 'Negative' : item.direction === 'mixed' ? 'Mixed' : 'Watch';
      return `${item.ticker} — ${directionLabel}; ${item.rationale}`;
    })
    .join(' ');
  const fallbackWatch = Array.from(
    new Set([
      ...impact.affectedTickers.slice(0, 4).map((item) => item.ticker),
      ...(theme.watch.length > 0 ? theme.watch.slice(0, 1) : ['TLT']),
    ])
  ).join(', ');
  const horizon = lowRelevance || politicalProcessOnly ? 'near-term sentiment only' : 'near-term reaction, longer-term impact depends on scope';
  const displayedConfidence = lowRelevance || politicalProcessOnly ? 'low' : (impact.confidence || 'medium');
  const marketImpactLines =
    lowRelevance || politicalProcessOnly
      ? [
          'Immediate market impact appears limited unless follow-up reporting changes policy expectations directly.',
          'Rate-sensitive groups would move first if the story broadens into a policy or credibility issue.',
        ]
      : formattedImpactWatch
        ? formattedImpactWatch.split(/(?<=\.)\s+/).filter(Boolean).slice(0, 4)
        : [
            `${(winnerSectors[0] ?? 'Defensives')}: relatively positive if the move stays narrow.`,
            `${(loserSectors[0] ?? 'Rate-sensitive cyclicals')}: more exposed if repricing broadens.`,
          ];
  const watchNextLines =
    lowRelevance || politicalProcessOnly
      ? ['policy follow-through', 'yield reaction', 'management response']
      : Array.from(
          new Set([
            ...theme.watch.slice(0, 2),
            ...(impact.affectedTickers.length > 0 ? impact.affectedTickers.slice(0, 2).map((item) => item.ticker) : []),
          ])
        );

  const structuredFallback = formatStructuredAnalysis({
    SUMMARY: [summaryLine],
    IMPACT: [
      headline.description?.trim() && !isQuestionStyleTitle(headline.title)
        ? headline.description.trim()
        : `The market focus is ${theme.channel}, with the base case centered on ${theme.baseCase}.`,
      whyLine,
    ],
    ANALYSIS: [
      `Equities: ${stocksImpact}.`,
      `Rates: ${ratesImpact}.`,
      `FX: ${fxImpact}.`,
      ...marketImpactLines,
    ],
    'MOST AFFECTED STOCKS/SECTORS': [
      ...watchNextLines,
      `${horizon}; confidence ${displayedConfidence}.`,
    ],
  });
  const whyItMatters = limitStructuredAnalysisWords(structuredFallback, 320);

  return headlineEnrichmentSchema.parse({
    ai_summary: aiSummary,
    why_it_matters: whyItMatters,
    impacted_sectors: lowRelevance || politicalProcessOnly
      ? []
      : impact.affectedSectors.length > 0
      ? impact.affectedSectors.map((sector) => ({
          sector: sector.sector,
          direction: sector.direction,
          rationale: sector.rationale,
        }))
      : [{ sector: 'Financials', direction, rationale: 'Broad market sensitivity.' }],
    impacted_tickers: lowRelevance || politicalProcessOnly
      ? []
      : impact.affectedTickers.length > 0
      ? impact.affectedTickers.map((ticker) => ({
          ticker: ticker.ticker,
          direction: ticker.direction,
          rationale: ticker.rationale,
        }))
      : [{ ticker: 'SPY', direction, rationale: 'Broad market proxy only when company-specific exposure is not clear.' }],
    confidence: lowRelevance || politicalProcessOnly ? 'low' : impact.confidence,
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
  const shouldUseFallbackExposure =
    enrichment.confidence === 'low' || isPoliticalProcessHeadline(headline);
  const hasInformativeDirection = (direction: 'up' | 'down' | 'mixed' | 'unknown') =>
    direction === 'up' || direction === 'down' || direction === 'mixed';
  const sectorsHaveDirectionalSignal = enrichment.impacted_sectors.some((sector) =>
    hasInformativeDirection(sector.direction)
  );
  const tickersHaveDirectionalSignal = enrichment.impacted_tickers.some((ticker) =>
    hasInformativeDirection(ticker.direction)
  );
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
  const normalizedImpact = ensureStructuredImpact(
    ensureConcreteImpact(enrichment.why_it_matters, fallback.why_it_matters),
    {
      ...fallback,
      confidence: enrichment.confidence || fallback.confidence,
    }
  );

  return headlineEnrichmentSchema.parse({
    ai_summary: ensureSpecificSummary(enrichment.ai_summary),
    why_it_matters: normalizedImpact,
    impacted_sectors:
      shouldUseFallbackExposure
        ? fallback.impacted_sectors
        : enrichment.impacted_sectors.length > 0 && sectorsHaveDirectionalSignal
        ? enrichment.impacted_sectors
        : fallback.impacted_sectors,
    impacted_tickers:
      shouldUseFallbackExposure
        ? fallback.impacted_tickers
        : enrichment.impacted_tickers.filter((ticker) => normalizeTickerLabel(ticker.ticker) !== null).length > 0 &&
      tickersHaveDirectionalSignal
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
  const normalized = tickers
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean);
  const allBroadProxies = normalized.length > 0 && normalized.every((ticker) => isBroadProxyTicker(ticker));
  return allBroadProxies || normalized.some((ticker) => {
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

function cachedEnrichmentLooksOverstatedForWeakHeadline(
  headline: { title: string; description: string | null },
  row: {
    confidence?: 'high' | 'medium' | 'low' | null;
    why_it_matters?: string | null;
    affected_tickers?: string[] | null;
    affected_sectors?: string[] | null;
  }
): boolean {
  if (!isPoliticalProcessHeadline(headline)) return false;
  if (row.confidence && row.confidence !== 'low') return true;

  const text = (row.why_it_matters ?? '').toUpperCase();
  return (
    text.includes('CONFIDENCE') ||
    text.includes('HIGH') ||
    (row.affected_tickers?.length ?? 0) > 0 ||
    (row.affected_sectors?.length ?? 0) > 0
  );
}

export async function getEnrichmentForHeadline(headline: {
  title: string;
  description: string | null;
  url: string;
  contextLines?: string[];
  mode?: 'headline' | 'general';
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
          !hasLowQualityTickers(row.data.affected_tickers ?? []) &&
          !cachedEnrichmentLooksOverstatedForWeakHeadline(headline, {
            confidence: row.data.confidence,
            why_it_matters: row.data.why_it_matters,
            affected_tickers: row.data.affected_tickers ?? [],
            affected_sectors: row.data.affected_sectors ?? [],
          })
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

  try {
    const mode = headline.mode ?? 'headline';
    const isHeadlineMode = mode === 'headline';
    const response = await generateTextWithProviderFallback({
      clientType: 'user',
      preferredProvider: 'anthropic',
      maxTokens: 1400,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: isHeadlineMode
            ? HEADLINE_INTELLIGENCE_SYSTEM_PROMPT
            : GENERAL_INTELLIGENCE_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: isHeadlineMode ? `Headline: ${headline.title}
Description: ${headline.description ?? 'None'}

Return JSON with these fields:

"ai_summary": one concise paragraph explaining the most important thing that changed. This should read like the Summary paragraph.

"why_it_matters": Use this exact section structure:
SUMMARY
IMPACT
ANALYSIS
MOST AFFECTED STOCKS/SECTORS

Hard requirement:
- keep each section in natural paragraph form, not bullets
- do not use bullets
- do not include TIME HORIZON or WATCH ITEMS
- keep each section concrete, decision-useful, and developed enough to stand on its own
- SUMMARY should be 2 to 3 sentences
- IMPACT should be 2 to 4 sentences focused on the economic mechanism
- ANALYSIS should be 2 to 4 sentences focused on how investors should interpret the development
- MOST AFFECTED STOCKS/SECTORS should be 1 to 3 sentences naming the clearest exposures and why

IMPORTANT:
- Do NOT rewrite the article.
- Never copy article text verbatim.
- Be decisive and avoid vague language.
- Keep language concrete and causally grounded.
- Avoid repeating the article headline.
- If the headline is not truly market-moving, say that clearly and keep the implications narrow.
- In IMPACT, explain why the change matters economically.
- In ANALYSIS, say whether the read-through is fundamental, sentiment-driven, mixed, or mostly noise.
- In MOST AFFECTED STOCKS/SECTORS, name only the most directly exposed companies, sectors, or groups in plain English.

"impacted_tickers": array of {ticker, direction, rationale}
"impacted_sectors": array of {sector, direction, rationale}
  Allowed sectors: Technology, Financials, Healthcare, Consumer Discretionary, Consumer Staples, Industrials, Energy, Materials, Utilities, Real Estate, Communication Services
  Directions: up, down, mixed, unknown
"confidence": high, medium, or low

Rules:
- No pseudo-tickers like EU, ECB, US, APAC.
- If this headline has weak market relevance, say so and set confidence=low.
- Do not invent facts not in the headline.
- Prefer fewer, higher-confidence tickers and sectors over broad lists.`
              : `Headline: ${headline.title}
Description: ${headline.description ?? 'None'}

Return JSON with these fields:

"ai_summary": concise paragraph leading with the most important takeaway.
"why_it_matters": concise paragraph explaining the economic mechanism and whether the impact is fundamental, sentiment-driven, mixed, or mostly noise.
"impacted_tickers": array of {ticker, direction, rationale}
"impacted_sectors": array of {sector, direction, rationale}
  Allowed sectors: Technology, Financials, Healthcare, Consumer Discretionary, Consumer Staples, Industrials, Energy, Materials, Utilities, Real Estate, Communication Services
  Directions: up, down, mixed, unknown
"confidence": high, medium, or low

Rules:
- No bullets or section headers.
- No pseudo-tickers like EU, ECB, US, APAC.
- If this headline has weak market relevance, say so and set confidence=low.
- Do not invent facts not in the headline.
- Explain the mechanism, not just the headline.
- Do not sound like a generic finance chatbot.`,
        },
      ],
    });
    if (!response?.text) {
      throw new Error('LLM enrichment failed across all provider candidates');
    }

    const parsed = JSON.parse(response.text || '{}');
    const enriched = ensureCompleteness(coerceToHeadlineEnrichment(parsed), headline);
    const fallback = deterministicFallback(headline);
    const enrichment = headlineEnrichmentSchema.parse({
      ...enriched,
      ai_summary: ensureConciseSummary(enriched.ai_summary ?? '', fallback.ai_summary ?? ''),
      why_it_matters:
        isHeadlineMode
          ? ensureStructuredImpact(enriched.why_it_matters ?? '', fallback)
          : ensureGeneralImpact(enriched.why_it_matters ?? '', fallback),
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
      console.error('[news/enrichment] llm enrichment failed', error);
    }
    return deterministicFallback(headline);
  }
}

const MODEL_IMPACT_SYSTEM_PROMPT = `You are the CapitalBase Model Impact Engine.

Your job is to take a market event and convert it into financial model changes and a clear investment implication.

---

## INPUT

{
  "event": "",
  "context": "optional headline or summary"
}

---

## TASK

1. Identify the primary financial impact of the event

2. Map to model changes:

* revenue growth
* operating margin
* discount rate

3. Estimate valuation impact

4. Generate a clear signal

---

## OUTPUT (JSON ONLY)

{
  "impact_summary": {
    "direction": "bullish | bearish | neutral",
    "primary_driver": "growth | margin | discount_rate",
    "valuation_change": number
  },

  "model_changes": {
    "growth_delta": number,
    "margin_delta": number,
    "discount_rate_delta": number
  },

  "scenarios": {
    "bull": number,
    "base": number,
    "bear": number
  },

  "signal": {
    "position": "LONG | SHORT | NEUTRAL",
    "conviction": number,
    "size_pct": number
  }
}

---

## RULES

* Keep values realistic and small
* Always produce non-zero outputs
* Be directional and decisive
* No text outside JSON

Your goal is to translate events into model-level impact and investment decisions.`;

const llmModelImpactSchema = z.object({
  impact_summary: z.object({
    direction: z.enum(['bullish', 'bearish', 'neutral']),
    primary_driver: z.enum(['growth', 'margin', 'discount_rate']),
    valuation_change: z.number(),
  }),
  model_changes: z.object({
    growth_delta: z.number(),
    margin_delta: z.number(),
    discount_rate_delta: z.number(),
  }),
  scenarios: z.object({
    bull: z.number(),
    base: z.number(),
    bear: z.number(),
  }),
  signal: z.object({
    position: z.enum(['LONG', 'SHORT', 'NEUTRAL']),
    conviction: z.number().min(0).max(1),
    size_pct: z.number().min(0),
  }),
});

export async function getModelImpactForEvent(event: {
  title: string;
  description: string | null;
}): Promise<ModelImpact | null> {
  try {
    const input = JSON.stringify({
      event: event.title,
      context: event.description ?? undefined,
    });

    const response = await generateTextWithProviderFallback({
      clientType: 'service',
      preferredProvider: 'anthropic',
      temperature: 0.1,
      maxTokens: 400,
      messages: [
        { role: 'system', content: MODEL_IMPACT_SYSTEM_PROMPT },
        { role: 'user', content: input },
      ],
    });

    if (!response?.text) return null;

    const raw = response.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace < 0 || lastBrace <= firstBrace) return null;

    const parsed = llmModelImpactSchema.safeParse(JSON.parse(raw.slice(firstBrace, lastBrace + 1)));
    if (!parsed.success) return null;

    return parsed.data;
  } catch {
    return null;
  }
}
