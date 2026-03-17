'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  RefreshCw,
  Clock,
  Zap,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Eye,
  Newspaper,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import ImpactChips from '@/components/news/ImpactChips';
import { getMacroEventFallbackImage } from '@/lib/macroEventImageQueries';
import { headlineEnrichmentSchema, type HeadlineEnrichment, type NewsRange, type NewsTopic } from '@/lib/news/types';
import { cn } from '@/lib/utils';

const imageLoader = ({ src }: { src: string }) => src;

/* ---------- constants ---------- */

const RANGE_OPTIONS: Array<{ key: NewsRange; label: string }> = [
  { key: '1D', label: 'Today' },
  { key: '3D', label: '3 Days' },
  { key: '1W', label: 'Week' },
  { key: '1M', label: 'Month' },
];

const TOPIC_OPTIONS: Array<{ key: NewsTopic; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'policy', label: 'Policy' },
  { key: 'rates', label: 'Rates' },
  { key: 'inflation', label: 'Inflation' },
  { key: 'energy', label: 'Energy' },
  { key: 'fx', label: 'FX' },
  { key: 'equities', label: 'Equities' },
];

/* ---------- types ---------- */

type NewsItem = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl?: string;
};

type NewsSuccessResponse = {
  ok?: true;
  items: NewsItem[];
  provider?: 'perigon' | 'benzinga' | 'newsapi' | 'supabase' | 'demo' | 'none';
};

type NewsErrorResponse = {
  ok?: false;
  error: string;
  details?: Record<string, unknown>;
};

type MarketImpactSections = {
  summary: string[];
  drivers: string[];
  assetImpacts: Array<{ asset: string; bullets: string[] }>;
  winners: string[];
  losers: string[];
  watchItems: string[];
  fallback: string;
};

/* ---------- helpers ---------- */

function inferHeadlineImageCategory(item: NewsItem): string {
  const text = `${item.title} ${item.description ?? ''}`.toLowerCase();
  if (/(war|ukraine|russia|china|middle east|israel|iran|sanction|tariff|export control|missile|strike|invasion)/i.test(text)) return 'geopolitics';
  if (/(fed|fomc|ecb|boj|rates?|yield|inflation|cpi|pce|treasury|jobs|payrolls)/i.test(text)) return 'rates_inflation';
  if (/(oil|opec|brent|wti|refinery|gas|energy)/i.test(text)) return 'energy';
  if (/(ai|chip|chips|gpu|semiconductor|nvidia|data center|server)/i.test(text)) return 'ai_semis';
  if (/(shipping|freight|cargo|port|container|route|canal|supply chain)/i.test(text)) return 'supply_chain';
  if (/(crypto|bitcoin|ether|blockchain)/i.test(text)) return 'crypto';
  return 'default';
}

function providerLabel(provider?: string): string {
  const map: Record<string, string> = { perigon: 'Perigon', benzinga: 'Benzinga', newsapi: 'NewsAPI', supabase: 'Supabase', demo: 'Demo', none: 'None' };
  return provider ? map[provider] ?? 'Unknown' : 'Unknown';
}

function parseResponse(payload: unknown): NewsSuccessResponse | NewsErrorResponse {
  if (!payload || typeof payload !== 'object') {
    return { error: 'invalid_response', details: { message: 'Response is not an object' } };
  }
  const data = payload as Record<string, unknown>;
  if (typeof data.error === 'string') {
    return { error: data.error, details: data.details && typeof data.details === 'object' ? (data.details as Record<string, unknown>) : undefined };
  }
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items = rawItems
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      if (typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.url !== 'string' || typeof row.source !== 'string' || typeof row.publishedAt !== 'string') return null;
      return {
        id: row.id,
        title: row.title,
        description: typeof row.description === 'string' ? row.description : null,
        url: row.url,
        source: row.source,
        publishedAt: row.publishedAt,
        imageUrl: typeof row.imageUrl === 'string' ? row.imageUrl : undefined,
      } satisfies NewsItem;
    })
    .filter((item) => item != null) as NewsItem[];

  const validProviders = ['perigon', 'benzinga', 'newsapi', 'supabase', 'demo', 'none'] as const;
  const provider = validProviders.includes(data.provider as (typeof validProviders)[number])
    ? (data.provider as NewsSuccessResponse['provider'])
    : undefined;
  return { items, provider };
}

function errorDisplay(error: NewsErrorResponse): string {
  const env = typeof error.details?.env === 'string' ? error.details.env : null;
  return env ? `${error.error} (${env})` : error.error;
}

function relativeTimeLabel(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

function formatAiSummaryText(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return 'Summary unavailable.';
  const trimmed = raw.trim();
  if (!trimmed) return 'Summary unavailable.';

  const cleaned = trimmed
    .replace(/[•·◦▪▫●∙]/g, ' ')
    .replace(/\b(EVENT|SUMMARY|BOTTOM LINE|KEY FACTS|DRIVERS|WHY IT MATTERS|TRANSMISSION PATH|PREDICTION|MARKET IMPACT|WINNERS?|LOSERS?|HORIZON|CONFIDENCE|BASE CASE|BULL CASE|BEAR CASE|SECTOR IMPACT|TICKERS TO WATCH|MODEL IMPLICATIONS|WATCH NEXT|SOURCES|ASSETS TO WATCH|MACRO EVENT|INVESTOR TAKEAWAY|WHAT HAPPENED|WHAT ACTUALLY CHANGED|WHY MARKETS CARE|MARKET LOGIC|DIRECTIONAL SIGNAL|MARKET REACTION FRAMEWORK|MACRO SIGNAL|TICKERS\s*\/\s*ASSETS TO WATCH)\b:?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const parts = cleaned
    .split(/(?<=[.!?])\s+|;\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const normalized = parts
    .map((part) => (/^[a-z]/.test(part) ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part))
    .map((part) => (/[.!?]$/.test(part) ? part : `${part}.`))
    .filter(Boolean)
    .slice(0, 2);

  if (normalized.length === 0) return 'Summary unavailable.';
  return normalized.join(' ');
}

function formatPlainNarrative(raw: string | null | undefined, maxSentences = 5): string {
  if (!raw || typeof raw !== 'string') return 'Additional context unavailable.';
  const cleaned = raw
    .replace(/\r\n/g, '\n')
    .replace(/[•·◦▪▫●∙]/g, ' ')
    .replace(/\b(EVENT|SUMMARY|BOTTOM LINE|KEY FACTS|DRIVERS|WHY IT MATTERS|TRANSMISSION PATH|PREDICTION|MARKET IMPACT|WINNERS?|LOSERS?|HORIZON|CONFIDENCE|BASE CASE|BULL CASE|BEAR CASE|SECTOR IMPACT|TICKERS TO WATCH|MODEL IMPLICATIONS|WATCH NEXT|SOURCES|ASSETS TO WATCH|MACRO EVENT|INVESTOR TAKEAWAY|WHAT HAPPENED|WHAT ACTUALLY CHANGED|WHY MARKETS CARE|MARKET LOGIC|DIRECTIONAL SIGNAL|MARKET REACTION FRAMEWORK|MACRO SIGNAL|TICKERS\s*\/\s*ASSETS TO WATCH|EQUITIES|RATES|FX|COMMODITIES|CREDIT)\b:?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Additional context unavailable.';

  const pieces = cleaned
    .split(/(?<=[.!?])\s+|;\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const normalized = pieces
    .map((part) => (/^[a-z]/.test(part) ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part))
    .map((part) => (/[.!?]$/.test(part) ? part : `${part}.`))
    .slice(0, maxSentences);

  if (normalized.length === 0) return 'Additional context unavailable.';
  if (normalized.length === 1) {
    normalized.push('Near-term moves will depend on rates, sector positioning, and follow-up policy signals.');
  }
  return normalized.join(' ');
}

/* ---------- market impact parsing ---------- */

function preprocessImpactText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\s+•\s+/g, '\n• ')
    .replace(
      /\s+(?=(EVENT|SUMMARY|BOTTOM LINE|KEY FACTS|DRIVERS|WHY IT MATTERS|TRANSMISSION PATH|PREDICTION|MARKET IMPACT|WINNERS?|LOSERS?|HORIZON|CONFIDENCE|BASE CASE|BULL CASE|BEAR CASE|SECTOR IMPACT|TICKERS TO WATCH|MODEL IMPLICATIONS|WATCH NEXT|SOURCES|ASSETS TO WATCH)\b)/gi,
      '\n'
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseMarketImpactSections(raw: string | null | undefined): MarketImpactSections | null {
  if (!raw || typeof raw !== 'string') return null;
  const fallback = raw.replace(/\s+/g, ' ').trim();
  if (!fallback) return null;

  const normalized = preprocessImpactText(raw);
  const lines = normalized.split(/\n/).map((l) => l.trim());

  const summary: string[] = [];
  const drivers: string[] = [];
  const assetImpacts: Array<{ asset: string; bullets: string[] }> = [];
  const winners: string[] = [];
  const losers: string[] = [];
  const watchItems: string[] = [];

type Section = 'none' | 'summary' | 'drivers' | 'impact' | 'impact_asset' | 'winners' | 'losers' | 'watch' | 'skip';
  let section: Section = 'none';
  let currentAsset: string | null = null;

  const ASSET_HEADERS = /^(equities|rates|fx|commodities|credit|stocks?|bonds?|dollar|usd|currencies?)$/i;

  for (const line of lines) {
    if (!line) continue;

    const upper = line.toUpperCase().replace(/[:\s]+$/, '');

    if (upper === 'SUMMARY' || upper === 'BOTTOM LINE') { section = 'summary'; continue; }
    if (upper === 'DRIVERS') { section = 'drivers'; continue; }
    if (/^MARKET\s*IMPACT/.test(upper)) { section = 'impact'; currentAsset = null; continue; }
    if (/^WINNERS?$/.test(upper)) { section = 'winners'; continue; }
    if (/^LOSERS?$/.test(upper)) { section = 'losers'; continue; }
    if (/^WATCH\s*(NEXT)?$/.test(upper)) { section = 'watch'; continue; }
    if (/^(INVALIDATION|TRANSMISSION|HORIZON)/.test(upper)) { section = 'skip'; continue; }

    if ((section === 'impact' || section === 'impact_asset') && ASSET_HEADERS.test(line.replace(/[:\s]+$/, ''))) {
      currentAsset = normalizeAssetLabel(line.replace(/[:\s]+$/, ''));
      section = 'impact_asset';
      continue;
    }

    const bullet = line.replace(/^\(?\d+\)\s*/, '').replace(/^[-•*]\s*/, '').trim();
    if (!bullet) continue;

    if (section === 'summary') {
      summary.push(bullet);
    } else if (section === 'drivers') {
      drivers.push(bullet);
    } else if (section === 'impact_asset' && currentAsset) {
      const existing = assetImpacts.find((a) => a.asset === currentAsset);
      if (existing) existing.bullets.push(bullet);
      else assetImpacts.push({ asset: currentAsset, bullets: [bullet] });
    } else if (section === 'impact') {
      const inlineMatch = bullet.match(/^(Stocks?|Bonds?|Dollar|Equities|Rates?|FX|Commodities?|Credit)\s*[:\-–—]\s*/i);
      if (inlineMatch) {
        const asset = normalizeAssetLabel(inlineMatch[1]);
        const detail = bullet.slice(inlineMatch[0].length).trim();
        if (detail) {
          const existing = assetImpacts.find((a) => a.asset === asset);
          if (existing) existing.bullets.push(detail);
          else assetImpacts.push({ asset, bullets: [detail] });
        }
      } else {
        assetImpacts.push({ asset: 'Market', bullets: [bullet] });
      }
    } else if (section === 'winners') {
      winners.push(bullet.replace(/\.$/, ''));
    } else if (section === 'losers') {
      losers.push(bullet.replace(/\.$/, ''));
    } else if (section === 'watch') {
      watchItems.push(bullet.replace(/\.$/, ''));
    } else if (section === 'none') {
      summary.push(bullet);
    }
  }

  return { summary, drivers, assetImpacts, winners, losers, watchItems, fallback };
}

type MacroStructuredSection = {
  label: string;
  content: string;
};

const STRUCTURED_LABELS = [
  'EVENT',
  'SUMMARY',
  'BOTTOM LINE',
  'KEY FACTS',
  'DRIVERS',
  'WHY IT MATTERS',
  'TRANSMISSION PATH',
  'PREDICTION',
  'MARKET IMPACT',
  'WINNERS',
  'LOSERS',
  'HORIZON',
  'CONFIDENCE',
  'BASE CASE',
  'BULL CASE',
  'BEAR CASE',
  'SECTOR IMPACT',
  'TICKERS TO WATCH',
  'MODEL IMPLICATIONS',
  'WATCH NEXT',
  'SOURCES',
  'ASSETS TO WATCH',
  'MACRO EVENT',
  'INVESTOR TAKEAWAY',
  'WHAT HAPPENED',
  'WHAT ACTUALLY CHANGED',
  'WHY MARKETS CARE',
  'MARKET LOGIC',
  'DIRECTIONAL SIGNAL',
  'MARKET REACTION FRAMEWORK',
  'MACRO SIGNAL',
  'TICKERS / ASSETS TO WATCH',
] as const;

const STRUCTURED_LABEL_PATTERN = STRUCTURED_LABELS
  .map((label) => escapeRegExp(label))
  .sort((a, b) => b.length - a.length)
  .join('|');

function normalizeStructuredAnalysisText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/(?:\s*[-–—]{3,}\s*)+/g, '\n')
    .replace(/\s+(?=(?:EVENT|SUMMARY|BOTTOM LINE|KEY FACTS|DRIVERS|WHY IT MATTERS|TRANSMISSION PATH|PREDICTION|MARKET IMPACT|WINNERS|LOSERS|HORIZON|CONFIDENCE|BASE CASE|BULL CASE|BEAR CASE|SECTOR IMPACT|TICKERS TO WATCH|MODEL IMPLICATIONS|WATCH NEXT|SOURCES|ASSETS TO WATCH|MACRO EVENT|INVESTOR TAKEAWAY|WHAT HAPPENED|WHAT ACTUALLY CHANGED|WHY MARKETS CARE|MARKET LOGIC|DIRECTIONAL SIGNAL|MARKET REACTION FRAMEWORK|MACRO SIGNAL|TICKERS \/ ASSETS TO WATCH)\b)/g, '\n')
    .replace(new RegExp(`(?:^|\\n)\\s*[-•*]+\\s*(?=${STRUCTURED_LABEL_PATTERN}\\b)`, 'g'), '\n')
    .replace(new RegExp(`([^\\n])\\s*(?=${STRUCTURED_LABEL_PATTERN}\\b\\s*:?)`, 'g'), '$1\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanStructuredLine(line: string): string {
  return line
    .replace(/^[\s\-–—•*]+/, '')
    .replace(/[\-–—]{2,}/g, ' ')
    .replace(/\s*→\s*\/\s*/g, ' → ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripAnalysisNoise(text: string | null | undefined): string | null {
  if (!text) return null;
  const cleaned = text
    .replace(/\bTIME\s*\.\s*$/i, '')
    .replace(/\bTIME HORIZON\s*:\s*/gi, '')
    .replace(/\bCONFIDENCE\s*:\s*/gi, '')
    .replace(/\bSUMMARY\s*:\s*/gi, '')
    .replace(/\bMARKET IMPACT\s*:\s*/gi, '')
    .replace(/\bWHY IT MATTERS\s*:\s*/gi, '')
    .replace(/\bANALYSIS\s*:\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || null;
}

function structuredSectionLines(content: string): string[] {
  return content
    .split('\n')
    .map((line) => cleanStructuredLine(line))
    .filter((line) => {
      if (!line) return false;
      const upper = line.toUpperCase().replace(/[:.\s]+$/g, '');
      if (STRUCTURED_LABELS.includes(upper as (typeof STRUCTURED_LABELS)[number])) return false;
      if (upper === 'TIME' || upper === 'TIME HORIZON' || upper === 'CONFIDENCE') return false;
      return true;
    });
}

function structuredSectionParagraph(content: string, maxSentences = 3): string | null {
  const lines = structuredSectionLines(content);
  return toParagraph(lines, maxSentences);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseMacroStructuredAnalysis(raw: string | null | undefined): MacroStructuredSection[] | null {
  if (!raw || typeof raw !== 'string') return null;
  const text = normalizeStructuredAnalysisText(raw);
  if (!text) return null;

  const labels = [
    { label: 'SUMMARY', aliases: ['SUMMARY', 'EVENT', 'INVESTOR TAKEAWAY', 'MACRO EVENT'] },
    { label: 'WHY IT MATTERS', aliases: ['WHY IT MATTERS', 'DRIVERS'] },
    { label: 'MARKET IMPACT', aliases: ['MARKET IMPACT', 'PREDICTION', 'BASE CASE', 'SECTOR IMPACT', 'MODEL IMPLICATIONS'] },
    { label: 'TIME HORIZON', aliases: ['TIME HORIZON', 'HORIZON', 'CONFIDENCE'] },
    { label: 'WATCH ITEMS', aliases: ['WATCH ITEMS', 'WATCH NEXT', 'TICKERS TO WATCH', 'ASSETS TO WATCH', 'TICKERS / ASSETS TO WATCH', 'TICKERS/ASSETS TO WATCH'] },
  ] as const;

  const allAliases = labels.flatMap((item) => item.aliases);
  const allPattern = allAliases.map((alias) => escapeRegExp(alias)).join('|');
  const sections: MacroStructuredSection[] = [];

  for (const item of labels) {
    let sectionText: string | null = null;
    for (const alias of item.aliases) {
      const regex = new RegExp(
        `(?:^|\\n)\\s*${escapeRegExp(alias)}\\s*:?\\s*([\\s\\S]*?)(?=(?:\\n\\s*(?:${allPattern})\\s*:?)|$)`,
        'i'
      );
      const captured = text.match(regex)?.[1]?.trim();
      if (captured) {
        sectionText = captured;
        break;
      }
    }
    if (sectionText) {
      sections.push({
        label: item.label,
        content: sectionText
          .replace(/\n{3,}/g, '\n\n')
          .replace(/\s*[-–—]{3,}\s*/g, '\n')
          .trim(),
      });
    }
  }

  return sections.length >= 3 ? sections : null;
}

function buildStructuredLead(text: string | null | undefined): string | null {
  const structured = parseMacroStructuredAnalysis(text);
  if (!structured) return null;

  const getSection = (label: string) => structured.find((section) => section.label === label)?.content ?? null;
  const summary = structuredSectionParagraph(getSection('SUMMARY') ?? getSection('EVENT') ?? '', 1);
  const why = structuredSectionParagraph(getSection('WHY IT MATTERS') ?? '', 2);
  const impact = structuredSectionParagraph(getSection('MARKET IMPACT') ?? getSection('BASE CASE') ?? '', 1);

  const parts = [summary, why, impact]
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replace(/^That said,\s*/i, '').trim());

  if (parts.length === 0) return null;
  return parts.join(' ');
}

function buildAnalysisLead(enrichment: HeadlineEnrichment): string {
  const structuredLead = buildStructuredLead(enrichment.why_it_matters);
  if (structuredLead) return structuredLead;

  const aiSummary = formatAiSummaryText(enrichment.ai_summary);
  if (aiSummary !== 'Summary unavailable.') return aiSummary;

  return formatPlainNarrative(enrichment.why_it_matters, 2);
}

function tickerTag(ticker: string): string {
  return ticker.startsWith('$') ? ticker : `$${ticker}`;
}

function highlightTickers(text: string): React.ReactNode {
  const parts = text.split(/(\$[A-Z]{1,6})/g);
  return parts.map((part, index) =>
    /^\$[A-Z]{1,6}$/.test(part) ? (
      <span key={`${part}-${index}`} className="font-semibold text-zinc-100">
        {part}
      </span>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    )
  );
}

function toTickerSentence(items: Array<{ ticker: string; rationale?: string }>, fallback: string[]): string {
  const labels = items.slice(0, 4).map((item) => tickerTag(item.ticker));
  if (labels.length > 0) return labels.join(', ');
  const normalized = fallback
    .slice(0, 4)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item.startsWith('$') ? item : /^\w{1,6}$/.test(item) ? tickerTag(item.toUpperCase()) : item));
  return normalized.join(', ');
}

function sparklinePoints(seed: string, direction: 'up' | 'down' | 'mixed' | 'unknown'): string {
  const values: number[] = [];
  let baseline = direction === 'up' ? 24 : direction === 'down' ? 72 : 48;
  for (let index = 0; index < 12; index += 1) {
    const code = seed.charCodeAt(index % seed.length) || 71;
    const drift = direction === 'up' ? -1.8 : direction === 'down' ? 1.8 : 0.35;
    baseline = Math.max(8, Math.min(88, baseline + drift + ((code % 11) - 5) * 0.9));
    values.push(baseline);
  }
  return values.map((value, index) => `${index * 14},${value.toFixed(1)}`).join(' ');
}

function SparklineMiniCard({
  ticker,
  direction,
  rationale,
}: {
  ticker: string;
  direction: 'up' | 'down' | 'mixed' | 'unknown';
  rationale?: string;
}) {
  const stroke =
    direction === 'up'
      ? '#34d399'
      : direction === 'down'
        ? '#fb7185'
        : '#60a5fa';
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
  return (
    <div className="rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.03)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-zinc-100">{tickerTag(ticker)}</div>
        <div
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
            direction === 'up'
              ? 'bg-emerald-500/12 text-emerald-300'
              : direction === 'down'
                ? 'bg-rose-500/12 text-rose-300'
                : 'bg-sky-500/12 text-sky-300'
          )}
        >
          <Icon className="h-3 w-3" />
          24h
        </div>
      </div>
      <svg viewBox="0 0 154 96" className="mt-3 h-16 w-full overflow-visible">
        <defs>
          <linearGradient id={`spark-${ticker}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.36" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <polyline fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={sparklinePoints(ticker, direction)} />
      </svg>
      {rationale && <p className="mt-2 text-[11px] leading-5 text-zinc-400">{rationale}</p>}
    </div>
  );
}

function SentimentMeter({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'bull' | 'bear';
}) {
  const accent = tone === 'bull' ? 'emerald' : 'rose';
  return (
    <div className={cn('rounded-2xl border p-4', tone === 'bull' ? 'border-emerald-500/20 bg-emerald-500/6' : 'border-rose-500/20 bg-rose-500/6')}>
      <div className="flex items-center justify-between gap-3">
        <div className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', tone === 'bull' ? 'text-emerald-300' : 'text-rose-300')}>{title}</div>
        <div className="h-2 w-24 overflow-hidden rounded-full bg-white/6">
          <div
            className={cn('h-full rounded-full', tone === 'bull' ? 'bg-emerald-400' : 'bg-rose-400')}
            style={{ width: `${items.length > 0 ? Math.min(100, 34 + items.length * 18) : 28}%` }}
          />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {items.length > 0 ? (
          items.slice(0, 3).map((item, index) => (
            <div key={`${title}-${index}`} className="flex items-start gap-2 text-[13px] leading-6 text-zinc-200">
              <span className={cn('mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full', tone === 'bull' ? 'bg-emerald-400' : 'bg-rose-400')} />
              <span>{item}</span>
            </div>
          ))
        ) : (
          <div className="text-[12px] leading-5 text-zinc-400">No strong {tone === 'bull' ? 'bullish' : 'bearish'} skew yet.</div>
        )}
      </div>
    </div>
  );
}

function normalizeSentence(text: string): string {
  const cleaned = text
    .replace(/^why it matters:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function normalizeAssetLabel(raw: string): string {
  const lower = raw.toLowerCase().replace(/[:\s]+$/, '');
  if (lower === 'stocks' || lower === 'stock' || lower === 'equities') return 'Equities';
  if (lower === 'bonds' || lower === 'bond' || lower === 'rates' || lower === 'rate') return 'Rates';
  if (lower === 'dollar' || lower === 'usd' || lower === 'fx' || lower === 'currencies' || lower === 'currency') return 'FX';
  if (lower === 'commodities' || lower === 'commodity' || lower === 'oil') return 'Commodities';
  if (lower === 'credit') return 'Credit';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function sentenceCase(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const withFirstUpper = /^[a-z]/.test(cleaned)
    ? `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`
    : cleaned;
  return /[.!?]$/.test(withFirstUpper) ? withFirstUpper : `${withFirstUpper}.`;
}

function toParagraph(items: string[], maxSentences = 3): string | null {
  const sentences = items
    .map((item) => sentenceCase(item))
    .filter(Boolean)
    .slice(0, maxSentences);
  return sentences.length > 0 ? sentences.join(' ') : null;
}

/* ---------- sub-components ---------- */

function NewsImage({ src, alt, fallbackSrc, className }: { src?: string; alt: string; fallbackSrc: string; className?: string }) {
  const [hidden, setHidden] = useState(false);
  const imgSrc = !src || hidden ? fallbackSrc : src;
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg',
        !src || hidden ? 'border border-zinc-800/50' : '',
        className
      )}
    >
      <Image
        loader={imageLoader}
        unoptimized
        fill
        sizes="(max-width: 768px) 100vw, 320px"
        src={imgSrc}
        alt={alt}
        className="object-cover"
        onError={() => setHidden(true)}
      />
    </div>
  );
}

function ConfidenceBadge({ level }: { level: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    high: { bg: 'bg-emerald-500/12 border-emerald-500/30', text: 'text-emerald-400', label: 'High confidence' },
    medium: { bg: 'bg-amber-500/10 border-amber-500/25', text: 'text-amber-400', label: 'Medium confidence' },
    low: { bg: 'bg-zinc-700/30 border-zinc-600/30', text: 'text-zinc-400', label: 'Low confidence' },
  };
  const c = config[level] ?? config.low;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium', c.bg, c.text)}>
      <Zap className="h-2.5 w-2.5" />
      {c.label}
    </span>
  );
}

function AssetBadge({ asset }: { asset: string }) {
  const colorMap: Record<string, string> = {
    Equities: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    Rates: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    FX: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    USD: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    Commodities: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    Oil: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    Credit: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  };
  return (
    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border', colorMap[asset] ?? 'bg-zinc-800/40 text-zinc-400 border-zinc-700/30')}>
      {asset}
    </span>
  );
}

function BulletList({ items, className }: { items: string[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={cn('space-y-1', className)}>
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-[13px] leading-snug text-zinc-300">
          <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-zinc-500" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function buildImpactedSectorParagraph(
  sectors: Array<{ sector: string; direction: 'up' | 'down' | 'mixed' | 'unknown'; rationale?: string }>
): string | null {
  if (!sectors.length) return null;

  const groups = {
    up: sectors.filter((sector) => sector.direction === 'up'),
    down: sectors.filter((sector) => sector.direction === 'down'),
    mixed: sectors.filter((sector) => sector.direction === 'mixed'),
  };

  const parts: string[] = [];
  if (groups.up.length) {
    parts.push(`Likely relative beneficiaries include ${groups.up.map((item) => item.sector).join(', ')}`);
  }
  if (groups.down.length) {
    parts.push(`Likely pressured sectors include ${groups.down.map((item) => item.sector).join(', ')}`);
  }
  if (groups.mixed.length) {
    parts.push(`More balanced or mixed read-throughs sit in ${groups.mixed.map((item) => item.sector).join(', ')}`);
  }

  return parts.length ? `${parts.join('. ')}.` : null;
}

function buildExposureParagraph(enrichment: HeadlineEnrichment): string | null {
  const sectorParagraph = buildImpactedSectorParagraph(enrichment.impacted_sectors ?? []);
  const tickers = (enrichment.impacted_tickers ?? [])
    .map((item) => tickerTag(item.ticker))
    .slice(0, 6);
  if (sectorParagraph && tickers.length > 0) {
    return `${sectorParagraph} Closest public-market names to watch include ${tickers.join(', ')}.`;
  }
  if (sectorParagraph) return sectorParagraph;
  if (tickers.length > 0) {
    return `Closest public-market names to watch include ${tickers.join(', ')}.`;
  }
  return null;
}

function MarketImpactBlock({ enrichment }: { enrichment: HeadlineEnrichment }) {
  const text = enrichment.why_it_matters ?? enrichment.ai_summary ?? 'Additional context unavailable.';
  const structured = parseMacroStructuredAnalysis(text);
  const exposureParagraph = buildExposureParagraph(enrichment);
  if (structured) {
    const getSection = (label: string) => structured.find((section) => section.label === label)?.content ?? null;
    const summary =
      stripAnalysisNoise(structuredSectionParagraph(getSection('SUMMARY') ?? getSection('EVENT') ?? '', 3)) ??
      stripAnalysisNoise(formatAiSummaryText(enrichment.ai_summary));
    const impact =
      stripAnalysisNoise(structuredSectionParagraph(getSection('WHY IT MATTERS') ?? '', 4)) ??
      stripAnalysisNoise(formatPlainNarrative(enrichment.why_it_matters, 4));
    const analysis =
      stripAnalysisNoise(structuredSectionParagraph(getSection('MARKET IMPACT') ?? getSection('BASE CASE') ?? '', 4)) ??
      stripAnalysisNoise(structuredSectionParagraph(getSection('WHY IT MATTERS') ?? '', 3));

    return (
      <div className="space-y-6">
        {summary && (
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Summary</div>
            <p className="text-[14px] leading-7 text-zinc-200">{summary}</p>
          </div>
        )}

        {impact && (
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Impact</div>
            <p className="text-[14px] leading-7 text-zinc-300">{impact}</p>
          </div>
        )}

        {analysis && (
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Analysis</div>
            <p className="text-[14px] leading-7 text-zinc-300">{analysis}</p>
          </div>
        )}

        {exposureParagraph && (
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Impacted Stocks And Sectors</div>
            <p className="text-[14px] leading-7 text-zinc-300">{highlightTickers(exposureParagraph)}</p>
          </div>
        )}
      </div>
    );
  }

  const parsed = parseMarketImpactSections(text);
  if (!parsed) {
    return <p className="text-[13px] leading-relaxed text-zinc-400">Additional context unavailable.</p>;
  }
  const summaryParagraph = stripAnalysisNoise(formatAiSummaryText(enrichment.ai_summary)) ?? stripAnalysisNoise(formatPlainNarrative(parsed.fallback, 3));
  const impactParagraph =
    stripAnalysisNoise(toParagraph(parsed.drivers, 3)) ??
    stripAnalysisNoise(formatPlainNarrative(parsed.fallback, 4));
  const analysisParagraph = stripAnalysisNoise(
    toParagraph(
      [
        ...parsed.assetImpacts.flatMap((group) => group.bullets),
        ...parsed.winners.map((item) => `Relative beneficiaries include ${item}`),
        ...parsed.losers.map((item) => `Likely pressured areas include ${item}`),
      ],
      4
    )
  );
  const winnersParagraph =
    parsed.winners.length > 0
      ? sentenceCase(`Likely beneficiaries include ${parsed.winners.slice(0, 3).join(', ')}`)
      : null;
  const losersParagraph =
    parsed.losers.length > 0
      ? sentenceCase(`Likely pressured areas include ${parsed.losers.slice(0, 3).join(', ')}`)
      : null;
  const isEmpty = parsed.summary.length === 0 && parsed.drivers.length === 0 && parsed.assetImpacts.length === 0 && parsed.winners.length === 0 && parsed.losers.length === 0 && parsed.watchItems.length === 0;

  if (isEmpty) {
    return <p className="text-[13px] leading-relaxed text-zinc-300">{parsed.fallback}</p>;
  }

  return (
    <div className="space-y-5">
      {summaryParagraph && (
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Summary</div>
          <p className="text-[14px] leading-7 text-zinc-200">{summaryParagraph}</p>
        </div>
      )}

      {impactParagraph && (
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Impact</div>
          <p className="text-[14px] leading-7 text-zinc-300">{impactParagraph}</p>
        </div>
      )}

      {analysisParagraph && (
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Analysis</div>
          <p className="text-[14px] leading-7 text-zinc-300">{analysisParagraph}</p>
        </div>
      )}

      {(exposureParagraph || parsed.assetImpacts.length > 0 || winnersParagraph || losersParagraph) && (
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Impacted Stocks And Sectors</div>
          <p className="text-[14px] leading-7 text-zinc-300">
            {highlightTickers(
              exposureParagraph ??
              [
                parsed.assetImpacts.length > 0
                  ? parsed.assetImpacts
                      .map((group) => `${group.asset}: ${toParagraph(group.bullets, 1) ?? sentenceCase(group.bullets.join(' '))}`)
                      .join(' ')
                  : null,
                winnersParagraph,
                losersParagraph,
              ]
                .filter(Boolean)
                .join(' ')
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
      {icon}
      {label}
    </div>
  );
}

/* ---------- main component ---------- */

export default function HeadlinesPanel({
  range,
  topic,
  onRangeChange,
  onTopicChange,
}: {
  range: NewsRange;
  topic: NewsTopic;
  onRangeChange: (next: NewsRange) => void;
  onTopicChange: (next: NewsTopic) => void;
}) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [provider, setProvider] = useState<NewsSuccessResponse['provider']>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<NewsErrorResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [enrichLoadingId, setEnrichLoadingId] = useState<string | null>(null);
  const [enrichMap, setEnrichMap] = useState<Record<string, HeadlineEnrichment>>({});

  const buildLocalFallback = useCallback(
    (headline: NewsItem): HeadlineEnrichment => {
      const text = `${headline.title} ${headline.description ?? ''}`.toLowerCase();
      const mentionsRates = /(fed|minutes|yield|rates?|cpi|inflation|treasury)/i.test(text);
      const mentionsEnergy = /(oil|wti|brent|energy|opec)/i.test(text);
      const mentionsFx = /(dollar|usd|dxy|fx|yen|euro|currency)/i.test(text);

      const sectors = [
        mentionsRates
          ? { sector: 'Financials', direction: 'up' as const, rationale: 'Banks tend to benefit when rates rise.' }
          : { sector: 'Technology', direction: 'mixed' as const, rationale: 'Tech stocks are sensitive to rate expectations.' },
        mentionsEnergy
          ? { sector: 'Energy', direction: 'up' as const, rationale: 'Higher oil prices help energy companies.' }
          : { sector: 'Industrials', direction: 'mixed' as const, rationale: 'Industrial companies are sensitive to economic conditions.' },
      ];

      const summary = headline.description
        ? `${headline.title}. ${headline.description}`
        : headline.title;
      const whyMarketsCare = mentionsRates
        ? 'This matters because policy-rate expectations can quickly reprice yields, discount rates, and USD demand.'
        : mentionsEnergy
          ? 'This matters because energy shocks can feed inflation expectations and pressure margin assumptions across exposed sectors.'
          : mentionsFx
            ? 'This matters because FX moves can change imported inflation and multinational earnings translation.'
            : 'This matters if follow-up reporting turns the headline into a real change in policy, earnings, or risk sentiment.';
      const marketImpact = mentionsRates
        ? ['Rate-sensitive equities: mildly bearish if yields keep rising', 'Financials: relatively better if higher rates support net interest income', 'USD: relatively positive if policy expectations stay firm']
        : mentionsEnergy
          ? ['Energy producers: relatively positive if oil stays elevated', 'Consumer and transport names: mildly bearish if fuel costs stay high', 'Broad equities: selective pressure if inflation concerns broaden']
          : mentionsFx
            ? ['USD-sensitive multinationals: mixed on translation effects', 'Domestic earners: relatively better if FX volatility rises', 'Risk assets: selective reaction unless rates move with the currency signal']
            : ['Most equities: limited immediate reaction unless the story broadens', 'Policy-sensitive sectors: first to move if follow-up reporting raises the stakes'];
      const watchItems = mentionsRates
        ? ['2Y Treasury yield', 'Fed funds futures', 'Management commentary on demand sensitivity']
        : mentionsEnergy
          ? ['Oil price follow-through', 'Margin commentary from exposed sectors', 'Any policy or supply response']
          : mentionsFx
            ? ['DXY follow-through', 'EURUSD / USDJPY reaction', 'Management guidance on FX impact']
            : ['Size of the development', 'Whether follow-up reporting broadens the scope', 'Management response or regulator clarification'];
      const horizon = mentionsRates ? 'Near-term reaction, confidence low.' : 'Near-term sentiment hit, confidence low.';

      const whyItMatters = [
        'SUMMARY',
        `- ${sentenceCase(headline.title || 'Market-relevant development reported')}`,
        '',
        'WHY IT MATTERS',
        `- ${whyMarketsCare}`,
        '',
        'MARKET IMPACT',
        ...marketImpact.map((item) => `- ${item}`),
        '',
        'TIME HORIZON',
        `- ${horizon}`,
        '',
        'WATCH ITEMS',
        ...watchItems.map((item) => `- ${item}`),
      ].join('\n');

      return headlineEnrichmentSchema.parse({
        ai_summary: summary,
        why_it_matters: whyItMatters,
        impacted_sectors: sectors,
        impacted_tickers: [],
        confidence: 'low',
      });
    },
    []
  );

  const fetchHeadlines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/news?range=${range}&topic=${topic}&limit=20`, { cache: 'no-store' });
      const raw = await response.json();
      const payload = parseResponse(raw);
      if (!response.ok || 'error' in payload) {
        setItems([]);
        setProvider(undefined);
        setError('error' in payload ? payload : { error: 'request_failed' });
        return;
      }
      setItems(payload.items);
      setProvider(payload.provider);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to load headlines';
      setItems([]);
      setProvider(undefined);
      setError({ error: message });
    } finally {
      setLoading(false);
    }
  }, [range, topic]);

  useEffect(() => {
    void fetchHeadlines();
  }, [fetchHeadlines]);

  useEffect(() => {
    if (items.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0].id);
    }
  }, [items, selectedId]);

  const loadEnrichment = useCallback(
    async (headline: NewsItem) => {
      if (enrichMap[headline.id]) return;
      setEnrichLoadingId(headline.id);
      try {
        const response = await fetch('/api/news/headlines/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            headline: { id: headline.id, title: headline.title, description: headline.description, source: headline.source, published_at: headline.publishedAt, url: headline.url, tags: [] },
          }),
        });
        if (!response.ok) {
          setEnrichMap((c) => ({ ...c, [headline.id]: buildLocalFallback(headline) }));
          return;
        }
        const raw = await response.json();
        const parsed = headlineEnrichmentSchema.safeParse(raw);
        const payload = parsed.success ? parsed.data : buildLocalFallback(headline);
        setEnrichMap((c) => ({ ...c, [headline.id]: payload }));
      } catch {
        setEnrichMap((c) => ({ ...c, [headline.id]: buildLocalFallback(headline) }));
      } finally {
        setEnrichLoadingId(null);
      }
    },
    [buildLocalFallback, enrichMap]
  );

  const resolvedProviderLabel = useMemo(() => providerLabel(provider), [provider]);
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId]
  );
  const selectedEnrichment = selectedItem ? enrichMap[selectedItem.id] : null;

  useEffect(() => {
    if (!selectedItem) return;
    if (!selectedEnrichment && enrichLoadingId !== selectedItem.id) {
      void loadEnrichment(selectedItem);
    }
  }, [selectedEnrichment, selectedItem, enrichLoadingId, loadEnrichment]);

  return (
    <div className="space-y-5">
      {/* ---- header bar ---- */}
      <div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              CapitalBase News Desk
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-100">
              Market Headlines
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-lg border border-zinc-800/50 bg-zinc-900/40 px-3 py-1.5 text-xs text-zinc-400 sm:flex">
              <span className="font-medium text-zinc-300">{items.length}</span> headlines via <span className="font-medium text-zinc-300">{resolvedProviderLabel}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={() => void fetchHeadlines()}
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        {/* filters */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onRangeChange(opt.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                range === opt.key
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              )}
            >
              {opt.label}
            </button>
          ))}
          <div className="mx-1.5 h-4 w-px bg-zinc-800" />
          {TOPIC_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onTopicChange(opt.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                topic === opt.key
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:bg-zinc-800/40 hover:text-zinc-300'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/7 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-4 py-3 backdrop-blur-md">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              <Newspaper className="h-3.5 w-3.5" />
              Live Feed
            </div>
            <p className="mt-1 text-sm text-zinc-400">Read the headline first, then expand the one that deserves a market-impact view.</p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-zinc-300">
            {items.length} headlines
          </div>
        </div>

        <div className="space-y-3">
          {loading && (
            <>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-800/30 bg-zinc-900/20" />
              ))}
            </>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/8 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-rose-300">
                <AlertTriangle className="h-4 w-4" /> Failed to load headlines
              </div>
              <div className="mt-1 text-xs text-rose-300/70">{errorDisplay(error)}</div>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="rounded-lg border border-zinc-800/40 bg-zinc-900/20 p-6 text-center">
              <div className="text-sm text-zinc-400">No headlines found for this filter.</div>
              <div className="mt-1 text-xs text-zinc-500">Try widening the time range or changing the topic.</div>
            </div>
          )}

          {!loading &&
            !error &&
            items.map((item) => {
              const fallbackImg = getMacroEventFallbackImage(inferHeadlineImageCategory(item), 'thumb');
              const isSelected = selectedItem?.id === item.id;
              const enrichment = enrichMap[item.id];

              return (
                <div
                  key={item.id}
                  className={cn(
                    'overflow-hidden rounded-2xl border transition-all duration-200',
                    isSelected
                      ? 'border-cyan-400/30 bg-[linear-gradient(180deg,rgba(14,165,233,0.12),rgba(255,255,255,0.02))] shadow-[0_0_0_1px_rgba(34,211,238,0.08)]'
                      : 'border-white/7 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))]'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(isSelected ? null : item.id);
                      if (!enrichment) void loadEnrichment(item);
                    }}
                    className={cn(
                      'group w-full p-4 text-left transition-colors duration-200',
                      !isSelected && 'hover:bg-[rgba(255,255,255,0.025)]'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <NewsImage
                        src={item.imageUrl}
                        alt={item.title}
                        fallbackSrc={fallbackImg}
                        className="h-16 w-16 shrink-0 rounded-xl"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                          <span className="font-medium text-zinc-300">{item.source}</span>
                          <span className="text-zinc-700">·</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {relativeTimeLabel(item.publishedAt)}
                          </span>
                          {enrichment ? <ConfidenceBadge level={enrichment.confidence ?? 'low'} /> : null}
                        </div>
                        <div className="mt-1 line-clamp-2 text-[15px] font-semibold leading-[1.35] text-zinc-100">
                          {item.title}
                        </div>
                        {item.description && (
                          <div className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-zinc-400">
                            {item.description}
                          </div>
                        )}
                        {enrichment && !isSelected && (
                          <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-zinc-300">
                            {buildAnalysisLead(enrichment)}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  </button>

                  {isSelected && (
                    <div className="border-t border-white/8 px-4 pb-4 pt-4">
                      {enrichLoadingId === item.id && !enrichment ? (
                        <div className="space-y-3">
                          <div className="h-8 animate-pulse rounded-xl bg-white/[0.05]" />
                          <div className="h-28 animate-pulse rounded-2xl bg-white/[0.04]" />
                        </div>
                      ) : enrichment ? (
                        <div className="space-y-4">
                          <div className="rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.03)] p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                <Eye className="h-3.5 w-3.5" />
                                Investor Read-Through
                              </div>
                            </div>
                            <MarketImpactBlock enrichment={enrichment} />
                          </div>

                        </div>
                      ) : (
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6 text-center">
                          <div className="text-sm text-zinc-300">Could not load analysis for this headline.</div>
                          <button
                            type="button"
                            className="mt-2 text-xs font-medium text-zinc-200 underline underline-offset-2 hover:text-zinc-100"
                            onClick={() => void loadEnrichment(item)}
                          >
                            Retry
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
