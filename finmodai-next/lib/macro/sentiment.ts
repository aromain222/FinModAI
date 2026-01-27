export type Sentiment = 'bullish' | 'neutral' | 'bearish';
export type Impact = 'low' | 'med' | 'high';
export type Region = 'global' | 'us' | 'europe' | 'asia';

const positiveKeywords = [
  'beat',
  'surge',
  'rally',
  'growth',
  'eases',
  'cooling',
  'soft landing',
  'decline',
  'drops',
  'improves',
  'rebound',
];

const negativeKeywords = [
  'miss',
  'recession',
  'slump',
  'plunge',
  'spike',
  'tighten',
  'downgrade',
  'warning',
  'crisis',
  'collapse',
  'inflation',
];

const impactHigh = ['recession', 'crisis', 'default', 'war', 'emergency', 'collapse'];
const impactMed = ['inflation', 'jobs', 'rate', 'cpi', 'central bank', 'gdp', 'yield'];

const regionKeywords: Record<Region, string[]> = {
  us: ['us', 'u.s.', 'united states', 'fed', 'treasury', 'cpi', 'jobs', 'payrolls', 'fomc'],
  europe: ['eurozone', 'ecb', 'europe', 'germany', 'france', 'uk', 'boe', 'euro'],
  asia: ['china', 'japan', 'asia', 'boj', 'rbi', 'india', 'korea', 'asean'],
  global: [],
};

const normalize = (text: string) => text.toLowerCase();

export const classifySentiment = (text: string): Sentiment => {
  const lower = normalize(text);
  if (negativeKeywords.some((word) => lower.includes(word))) return 'bearish';
  if (positiveKeywords.some((word) => lower.includes(word))) return 'bullish';
  return 'neutral';
};

export const classifyImpact = (text: string): Impact => {
  const lower = normalize(text);
  if (impactHigh.some((word) => lower.includes(word))) return 'high';
  if (impactMed.some((word) => lower.includes(word))) return 'med';
  return 'low';
};

export const detectRegion = (text: string): Region => {
  const lower = normalize(text);
  for (const [region, words] of Object.entries(regionKeywords) as [Region, string[]][]) {
    if (region === 'global') continue;
    if (words.some((word) => lower.includes(word))) return region;
  }
  return 'global';
};
