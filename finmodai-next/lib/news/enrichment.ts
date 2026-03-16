import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { z } from 'zod';
import { getOpenAIKey, getOpenAIModelCandidates } from '@/lib/openaiKey';
import { headlineEnrichmentSchema, type HeadlineEnrichment, type SectorName } from '@/lib/news/types';
import { inferEventImpact, isBroadProxyTicker } from '@/lib/news/eventImpact';
import { assessHeadlineRelevance } from '@/lib/news/relevance';

const HEADLINE_INTELLIGENCE_SYSTEM_PROMPT = `You are CapitalBase Analyst, a financial markets analyst writing structured market intelligence for investors.

You are not rewriting the article. You are translating a headline into a market view.

Reasoning order:
Event -> economic driver -> transmission channel -> market impact -> sector / company implications

Output rules:
- Keep the analysis causally grounded and finance-native.
- Distinguish between what happened and why markets should care.
- Be explicit about the channel: growth, inflation, rates, FX, commodity, credit, regulation, or positioning.
- Use concise short sections and keep the output scannable for a dashboard.
- Keep "why_it_matters" in a 90-140 word range and never above 140 words.
- If the market relevance is weak, say so directly and lower confidence.
- Do not speculate beyond what the headline supports.
- Do not paraphrase the headline as analysis.

Output must be valid JSON matching the schema.`;

const GENERAL_INTELLIGENCE_SYSTEM_PROMPT = `You are CapitalBase Analyst, a financial markets analyst.

Write concise, plain-English market intelligence focused on investor implications, not article summary.

Rules:
- No bullets.
- No markdown.
- Lead with the market-relevant point, then explain the transmission.
- Keep logic grounded in rates, FX, liquidity, credit, sector exposure, and valuation where relevant.
- If relevance is weak or indirect, state that explicitly.
- Do not speculate beyond what the headline supports.

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

const MACRO_SECTION_ORDER = ['SUMMARY', 'WHY IT MATTERS', 'MARKET IMPACT', 'TIME HORIZON', 'WATCH ITEMS'] as const;

type MacroSectionLabel = (typeof MACRO_SECTION_ORDER)[number];

const MACRO_SECTION_ALIASES: Record<MacroSectionLabel, string[]> = {
  SUMMARY: ['SUMMARY', 'EVENT', 'INVESTOR TAKEAWAY', 'MACRO EVENT'],
  'WHY IT MATTERS': ['WHY IT MATTERS', 'DRIVERS'],
  'MARKET IMPACT': [
    'MARKET IMPACT',
    'PREDICTION',
    'BASE CASE',
    'BULL CASE',
    'BEAR CASE',
    'SECTOR IMPACT',
    'MODEL IMPLICATIONS',
  ],
  'TIME HORIZON': ['TIME HORIZON', 'HORIZON', 'CONFIDENCE'],
  'WATCH ITEMS': ['WATCH ITEMS', 'WATCH NEXT', 'TICKERS TO WATCH', 'ASSETS TO WATCH', 'TICKERS / ASSETS TO WATCH', 'TICKERS/ASSETS TO WATCH'],
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

function limitStructuredAnalysisWords(text: string, maxWords = 250): string {
  if (wordCount(text) <= maxWords) return text;
  const parsed = parseStructuredSections(text);
  if (Object.keys(parsed).length < 3) {
    return clipWords(text.replace(/\n+/g, ' '), maxWords);
  }
  const caps: Record<MacroSectionLabel, number> = {
    SUMMARY: 24,
    'WHY IT MATTERS': 34,
    'MARKET IMPACT': 32,
    'TIME HORIZON': 12,
    'WATCH ITEMS': 26,
  };
  const clipped = formatStructuredAnalysis({
    SUMMARY: [clipWords(parsed.SUMMARY ?? '', caps.SUMMARY)],
    'WHY IT MATTERS': [clipWords(parsed['WHY IT MATTERS'] ?? '', caps['WHY IT MATTERS'])],
    'MARKET IMPACT': [clipWords(parsed['MARKET IMPACT'] ?? '', caps['MARKET IMPACT'])],
    'TIME HORIZON': [clipWords(parsed['TIME HORIZON'] ?? '', caps['TIME HORIZON'])],
    'WATCH ITEMS': [clipWords(parsed['WATCH ITEMS'] ?? '', caps['WATCH ITEMS'])],
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
    'Macro development with cross-asset implications.';
  const whyItMatters = parseBulletItems(parsed['WHY IT MATTERS'] ?? fallbackParsed['WHY IT MATTERS']);
  if (whyItMatters.length === 0 && baseSummarySentences.length > 1) {
    whyItMatters.push(baseSummarySentences[1]);
  }
  if (whyItMatters.length === 0) {
    whyItMatters.push('This matters if it changes earnings durability, regulatory risk, or valuation assumptions.');
  }

  const marketImpact = parseBulletItems(
    parsed['MARKET IMPACT'] ??
      extractSectionByAliases(merged, ['PREDICTION', 'BASE CASE', 'SECTOR IMPACT', 'MODEL IMPLICATIONS']) ??
      fallbackParsed['MARKET IMPACT'] ??
      extractSectionByAliases(fallback.why_it_matters ?? '', ['PREDICTION', 'BASE CASE', 'SECTOR IMPACT', 'MODEL IMPLICATIONS'])
  );
  if (marketImpact.length === 0) {
    if (fallback.impacted_tickers.length > 0) {
      marketImpact.push(
        ...fallback.impacted_tickers.slice(0, 3).map((item) => {
          const directionLabel =
            item.direction === 'up' ? 'relatively positive' : item.direction === 'down' ? 'mildly bearish near term' : 'mixed';
          return `${item.ticker}: ${directionLabel}${item.rationale ? `; ${item.rationale}` : ''}`;
        })
      );
    } else if (fallback.impacted_sectors.length > 0) {
      marketImpact.push(
        ...fallback.impacted_sectors.slice(0, 3).map((item) => `${item.sector}: ${item.direction === 'up' ? 'relatively positive' : item.direction === 'down' ? 'sentiment negative' : 'mixed reaction likely'}`)
      );
    } else {
      marketImpact.push('Immediate market reaction should stay selective unless the development forces a real change in policy, regulation, or earnings expectations.');
    }
  }

  const timeHorizon = parseBulletItems(
    parsed['TIME HORIZON'] ??
      extractSectionByAliases(merged, ['HORIZON']) ??
      fallbackParsed['TIME HORIZON'] ??
      extractSectionByAliases(fallback.why_it_matters ?? '', ['HORIZON'])
  );
  const confidence = parseBulletItems(
    extractSectionByAliases(merged, ['CONFIDENCE']) ??
      extractSectionByAliases(fallback.why_it_matters ?? '', ['CONFIDENCE'])
  );
  if (timeHorizon.length === 0) {
    timeHorizon.push(`Near-term sentiment hit; confidence ${fallback.confidence ?? 'medium'}`);
  } else if (confidence.length > 0 && !timeHorizon[0].toLowerCase().includes('confidence')) {
    timeHorizon[0] = `${timeHorizon[0]} | confidence ${confidence[0].toLowerCase()}`;
  }

  const watchItems = parseBulletItems(
    parsed['WATCH ITEMS'] ??
      extractSectionByAliases(merged, ['WATCH NEXT', 'TICKERS TO WATCH']) ??
      fallbackParsed['WATCH ITEMS'] ??
      extractSectionByAliases(fallback.why_it_matters ?? '', ['WATCH NEXT', 'TICKERS TO WATCH'])
  );
  if (watchItems.length === 0) {
    if (fallback.impacted_tickers.length > 0) {
      watchItems.push(...fallback.impacted_tickers.slice(0, 4).map((item) => item.ticker));
    } else {
      watchItems.push('size of fine', 'required remedies', 'whether scope broadens');
    }
  }

  return limitStructuredAnalysisWords(
    formatStructuredAnalysis({
      SUMMARY: [summary],
      'WHY IT MATTERS': whyItMatters.slice(0, 2),
      'MARKET IMPACT': marketImpact.slice(0, 4),
      'TIME HORIZON': timeHorizon.slice(0, 1),
      'WATCH ITEMS': watchItems.slice(0, 4),
    }),
    140
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
    'WHY IT MATTERS': [
      headline.description?.trim() && !isQuestionStyleTitle(headline.title)
        ? headline.description.trim()
        : `The market focus is ${theme.channel}, with the base case centered on ${theme.baseCase}.`,
      whyLine,
    ],
    'MARKET IMPACT': [
      `Equities: ${stocksImpact}.`,
      `Rates: ${ratesImpact}.`,
      `FX: ${fxImpact}.`,
      ...marketImpactLines,
    ],
    'TIME HORIZON': [`${horizon}; confidence ${displayedConfidence}.`],
    'WATCH ITEMS': watchNextLines,
  });
  const whyItMatters = limitStructuredAnalysisWords(structuredFallback, 140);

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
    const mode = headline.mode ?? 'headline';
    const isHeadlineMode = mode === 'headline';
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
              content: isHeadlineMode
                ? HEADLINE_INTELLIGENCE_SYSTEM_PROMPT
                : GENERAL_INTELLIGENCE_SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: isHeadlineMode ? `Headline: ${headline.title}
Description: ${headline.description ?? 'None'}

Return JSON with these fields:

"ai_summary": Concise plain-English summary in sentence form (no bullets, no markdown). Keep it brief, investor-focused, and include the core market angle.

"why_it_matters": Use this exact compact section structure:
SUMMARY
WHY IT MATTERS
MARKET IMPACT
TIME HORIZON
WATCH ITEMS

Hard requirement: keep "why_it_matters" between 90 and 140 words, and never above 140 words.

IMPORTANT:
- Do NOT rewrite the article.
- Never copy article text verbatim.
- Be decisive and avoid vague language.
- Keep language concrete and causally grounded.
- Avoid repeating the article headline.
- If the headline is not truly market-moving, say that clearly in WHY IT MATTERS and keep the implications narrow.
- In MARKET IMPACT, list the exposed companies, sectors, or groups and the directional read-through in plain English.
- In TIME HORIZON, state one bounded horizon and the confidence on the same line.
- In WATCH ITEMS, list the specific datapoints, enforcement details, or follow-up signals that would change the view.

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

"ai_summary": concise sentence-form summary of the key development and the main investor implication.
"why_it_matters": 2-4 sentence narrative in plain English explaining the transmission to markets (rates, FX, liquidity, credit, risk sentiment, sector leadership, or valuation).
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
- Explain the mechanism, not just the headline.`,
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
      console.error('[news/enrichment] openai enrichment failed', error);
    }
    return deterministicFallback(headline);
  }
}
