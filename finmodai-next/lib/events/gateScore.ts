import type { TriggerQueryId } from '@/lib/events/queries';

export type GateCategory = 'GEO' | 'MACRO' | 'EARNINGS' | 'REJECT';

export type EventCandidate = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  source: string;
  imageUrl?: string;
  provider: 'newsapi' | 'perigon' | 'benzinga';
  publishedAt: string;
  queryId: TriggerQueryId;
};

export type GatedCandidate = EventCandidate & {
  gateCategory: Exclude<GateCategory, 'REJECT'>;
  score: number;
  entities: string[];
  matchedIntensity: string[];
  matchedCrossAsset: string[];
};

const KEY_ENTITY_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: 'US', pattern: /\b(us|united states|washington)\b/i },
  { key: 'China', pattern: /\b(china|beijing)\b/i },
  { key: 'Russia', pattern: /\b(russia|moscow)\b/i },
  { key: 'EU', pattern: /\b(eu|european union|europe)\b/i },
  { key: 'Fed', pattern: /\b(fed|fomc|federal reserve)\b/i },
  { key: 'ECB', pattern: /\b(ecb|european central bank)\b/i },
  { key: 'BoJ', pattern: /\b(boj|bank of japan)\b/i },
  { key: 'PBoC', pattern: /\b(pboc|people's bank of china)\b/i },
  { key: 'OPEC', pattern: /\b(opec)\b/i },
];

const INTENSITY_TERMS = [
  'emergency',
  'invasion',
  'airstrike',
  'missile',
  'retaliation',
  'sanctions',
  'default',
  'bank failure',
  'capital controls',
  'mobilization',
  'embargo',
];

const CROSS_ASSET_TERMS = ['oil', 'rates', 'yield', 'fx', 'usd', 'dxy', 'credit', 'spread', 'volatility', 'vix'];

const MEGA_CAP_PATTERN =
  /\b(nvidia|nvda|apple|aapl|microsoft|msft|amazon|amzn|alphabet|googl|meta|tsla)\b/i;
const EARNINGS_PATTERN = /\b(earnings|guidance|outlook|results|revenue|margin|capex)\b/i;

const GEO_PATTERN =
  /\b(invade|invasion|airstrike|missile|retaliation|mobilization|sanctions|export controls|embargo|coup|assassination|border closure|pipeline|strait|shipping)\b/i;
const MACRO_PATTERN =
  /\b(fed|fomc|ecb|boj|pboc|rate decision|emergency meeting|liquidity facility|cpi|inflation|jobs report|payrolls|gdp|default|restructuring|bank failure|capital controls|opec|production cut)\b/i;

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function detectEntities(text: string): string[] {
  const entities: string[] = [];
  for (const item of KEY_ENTITY_PATTERNS) {
    if (item.pattern.test(text)) entities.push(item.key);
  }
  return entities;
}

function findMatchedTerms(text: string, terms: string[]): string[] {
  const lower = text.toLowerCase();
  return terms.filter((term) => lower.includes(term.toLowerCase()));
}

function resolveGateCategory(candidate: EventCandidate, text: string): GateCategory {
  if (candidate.queryId === 'earnings') {
    return MEGA_CAP_PATTERN.test(text) && EARNINGS_PATTERN.test(text) ? 'EARNINGS' : 'REJECT';
  }
  if (candidate.queryId === 'geo') {
    return GEO_PATTERN.test(text) ? 'GEO' : 'REJECT';
  }
  if (candidate.queryId === 'macro') {
    return MACRO_PATTERN.test(text) ? 'MACRO' : 'REJECT';
  }

  if (MEGA_CAP_PATTERN.test(text) && EARNINGS_PATTERN.test(text)) return 'EARNINGS';
  if (GEO_PATTERN.test(text)) return 'GEO';
  if (MACRO_PATTERN.test(text)) return 'MACRO';
  return 'REJECT';
}

function baseScoreForCategory(category: Exclude<GateCategory, 'REJECT'>): number {
  if (category === 'GEO') return 58;
  if (category === 'MACRO') return 56;
  return 60;
}

export function gateAndScoreCandidate(candidate: EventCandidate): GatedCandidate | null {
  const text = `${candidate.title} ${candidate.description || ''}`;
  const category = resolveGateCategory(candidate, text);
  if (category === 'REJECT') return null;

  const entities = detectEntities(text);
  const matchedIntensity = findMatchedTerms(text, INTENSITY_TERMS);
  const matchedCrossAsset = findMatchedTerms(text, CROSS_ASSET_TERMS);
  const megaCapHits = category === 'EARNINGS' && MEGA_CAP_PATTERN.test(text) ? 1 : 0;

  let score = baseScoreForCategory(category);
  score += Math.min(entities.length, 4) * 6;
  score += Math.min(matchedIntensity.length, 3) * 8;
  score += Math.min(matchedCrossAsset.length, 3) * 5;
  score += megaCapHits * 10;

  const finalScore = clampScore(score);
  if (finalScore < 55) return null;

  return {
    ...candidate,
    gateCategory: category,
    score: finalScore,
    entities,
    matchedIntensity,
    matchedCrossAsset,
  };
}

export function gateAndScoreCandidates(candidates: EventCandidate[]): GatedCandidate[] {
  return candidates
    .map(gateAndScoreCandidate)
    .filter((item): item is GatedCandidate => item !== null);
}
