import { createHash } from 'crypto';
import { normalizeCategory, type MacroEventImageCategory } from '@/lib/macroEventImageQueries';

const FILLER_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'into', 'is', 'it', 'its',
  'of', 'on', 'or', 'the', 'to', 'with', 'after', 'amid', 'over', 'under', 'signals', 'signal',
  'shows', 'show', 'showing', 'says', 'say', 'said', 'announces', 'announce', 'announced', 'new',
  'latest', 'update', 'updates', 'today', 'tomorrow', 'yesterday', 'this', 'that', 'these', 'those',
  'could', 'would', 'should', 'may', 'might', 'will', 'market', 'markets', 'stock', 'stocks',
]);

const BRAND_BLOCKLIST = new Set([
  'amazon', 'apple', 'microsoft', 'google', 'alphabet', 'meta', 'nvidia', 'tesla',
  'palantir', 'lockheed', 'northrop', 'blacksky', 'leidos', 'caci', 'bigbear', 'redwire',
  'crowdstrike', 'booz', 'allen', 'exxon', 'chevron',
]);

const CATEGORY_ANCHORS: Record<MacroEventImageCategory, string[]> = {
  geopolitics: ['diplomacy', 'military'],
  rates_inflation: ['central bank', 'interest rates'],
  energy: ['oil tanker', 'shipping route'],
  ai_semis: ['semiconductor factory', 'chips'],
  supply_chain: ['cargo ship', 'logistics'],
  crypto: ['digital finance', 'servers'],
  default: ['global markets', 'landscape'],
};

const PHRASE_HINTS: Array<{ pattern: RegExp; phrases: string[] }> = [
  { pattern: /\bmiddle east\b/i, phrases: ['middle east'] },
  { pattern: /\b(export controls?|chip|chips|gpu|gpus|semiconductor|semis?)\b/i, phrases: ['semiconductor'] },
  { pattern: /\b(oil|opec|refinery|crude|brent|wti)\b/i, phrases: ['oil tanker'] },
  { pattern: /\b(ship|shipping|route|strait|canal|cargo|port|freight)\b/i, phrases: ['shipping route'] },
  { pattern: /\b(fed|fomc|ecb|boj|rates?|yield|inflation|cpi)\b/i, phrases: ['central bank'] },
  { pattern: /\b(satellite|isr|reconnaissance|drone)\b/i, phrases: ['satellite imagery'] },
  { pattern: /\b(cyber|cybersecurity|hacking)\b/i, phrases: ['cyber defense'] },
  { pattern: /\b(data center|datacenter|ai)\b/i, phrases: ['data center'] },
];

function normalizeHeadline(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,\s+\d{2,4})?\b/g, ' ')
    .replace(/\b\d{1,4}(?:\/\d{1,2}(?:\/\d{1,4})?)?\b/g, ' ')
    .replace(/\(([A-Z]{1,5})\)/g, ' ')
    .replace(/\b[A-Z]{1,5}\b/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(headline: string): string[] {
  return normalizeHeadline(headline)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !FILLER_WORDS.has(token))
    .filter((token) => !BRAND_BLOCKLIST.has(token));
}

function uniquePush(target: string[], value: string) {
  if (!value || target.includes(value)) return;
  target.push(value);
}

export function hashHeadline(headline: string): string {
  return createHash('sha256').update((headline || '').trim().toLowerCase()).digest('hex');
}

export function buildHeadlineImageQuery(input: {
  headline: string | null | undefined;
  category: string | null | undefined;
}): string {
  const category = normalizeCategory(input.category);
  const headline = typeof input.headline === 'string' ? input.headline : '';
  const parts: string[] = [];

  for (const hint of PHRASE_HINTS) {
    if (hint.pattern.test(headline)) {
      for (const phrase of hint.phrases) uniquePush(parts, phrase);
    }
    if (parts.length >= 2) break;
  }

  for (const token of tokenize(headline)) {
    uniquePush(parts, token);
    if (parts.length >= 4) break;
  }

  for (const anchor of CATEGORY_ANCHORS[category]) {
    uniquePush(parts, anchor);
    if (parts.length >= 4) break;
  }

  if (parts.length === 0) {
    return CATEGORY_ANCHORS[category].join(' ');
  }

  return parts.slice(0, 4).join(' ');
}
