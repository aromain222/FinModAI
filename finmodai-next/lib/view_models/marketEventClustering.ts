import { z } from 'zod';

import { normalizeTitle } from '@/lib/macro/normalize';
import { extractMentionedTickers } from '@/lib/view_models/eventImpact';

export const MarketEventSchema = z.object({
  id: z.string().min(1).max(80),
  eventSeriesId: z.string().min(1).max(80),
  event_type: z.enum(['macro', 'sector', 'company']),
  scope: z.enum(['GLOBAL', 'REGIONAL', 'LOCAL']),
  title: z.string().min(1).max(140),
  subtitle: z.string().min(1).max(240),
  impact_direction: z.enum(['up', 'down', 'mixed', 'neutral']),
  affected_sectors: z.array(z.string()).max(8),
  affected_tickers: z.array(z.string()).max(12),
  why_it_matters: z.string().min(1).max(520),
  confidence: z.enum(['high', 'medium', 'low']),
  source: z.string().min(1).max(80),
  publishedAt: z.string().min(1),
  url: z.string().url().optional(),
  source_links: z
    .array(z.object({ source: z.string().min(1).max(80), url: z.string().url() }))
    .max(3)
    .optional(),
  sources: z.array(z.string()).min(1).max(3),
});

export type MarketEvent = z.infer<typeof MarketEventSchema>;

export type MarketHeadlineInput = {
  title: string;
  source?: string;
  publishedAt: string;
  url?: string | null;
  language?: string | null;
  tickers?: string[] | null;
  asset_class?: string | null;
  summary?: string | null;
};

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'to',
  'of',
  'and',
  'in',
  'on',
  'for',
  'with',
  'as',
  'at',
  'from',
  'after',
  'before',
  'amid',
  'says',
  'say',
  'report',
  'reports',
  'update',
  'live',
  'breaking',
  'stocks',
  'stock',
  'market',
  'markets',
  'shares',
  'futures',
  'price',
  'prices',
  'today',
]);

const SECTOR_BY_ETF: Record<string, string> = {
  XLK: 'Technology',
  XLF: 'Financials',
  XLE: 'Energy',
  XLV: 'Health Care',
  XLY: 'Consumer Discretionary',
  XLP: 'Consumer Staples',
  XLI: 'Industrials',
  XLB: 'Materials',
  XLU: 'Utilities',
  XLRE: 'Real Estate',
  XLC: 'Communication Services',
};

const KNOWN_ETFS = new Set<string>([
  'SPY',
  'QQQ',
  'DIA',
  'IWM',
  'TLT',
  'IEF',
  'SHY',
  'HYG',
  'LQD',
  'UUP',
  'GLD',
  ...Object.keys(SECTOR_BY_ETF),
]);

const NON_LATIN_SCRIPT_RE = /[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/;

const isFiniteTimestamp = (value: string) => Number.isFinite(Date.parse(value));

const BASIC_EN_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'to',
  'of',
  'and',
  'in',
  'on',
  'for',
  'with',
  'as',
  'at',
  'from',
  'after',
  'before',
  'amid',
  'vs',
]);

const ENGLISH_MARKET_HINTS = new Set([
  'fed',
  'fomc',
  'powell',
  'rates',
  'rate',
  'yield',
  'yields',
  'treasury',
  'inflation',
  'cpi',
  'pce',
  'jobs',
  'payroll',
  'unemployment',
  'gdp',
  'recession',
  'earnings',
  'guidance',
  'revenue',
  'profit',
  'eps',
  'upgrade',
  'downgrade',
  'merger',
  'acquire',
  'acquisition',
  'lawsuit',
  'investigation',
  'sanction',
  'tariff',
  'war',
  'attack',
  'oil',
  'crude',
  'opec',
  'rally',
  'surge',
  'jump',
  'drop',
  'fall',
  'plunge',
  'slump',
  'beats',
  'misses',
]);

function toDateBucket(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return 'unknown';
  const d = new Date(ts);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function isEnglishHeadline(headline: MarketHeadlineInput): boolean {
  const lang = (headline.language || '').trim().toLowerCase();
  if (lang && lang !== 'en' && !lang.startsWith('en-')) return false;

  const title = headline.title || '';
  if (!title.trim()) return false;
  if (NON_LATIN_SCRIPT_RE.test(title)) return false;

  const nonSpace = title.replace(/\s+/g, '').length;
  const asciiLetters = (title.match(/[A-Za-z]/g) || []).length;
  if (nonSpace >= 12 && asciiLetters / nonSpace < 0.35) return false;

  // Best-effort English detection when language is missing.
  const normalized = normalizeTitle(title);
  const tokens = normalized.split(' ').map((t) => t.trim()).filter(Boolean);
  const stopwordCount = tokens.filter((t) => BASIC_EN_STOPWORDS.has(t)).length;
  const marketHintCount = tokens.filter((t) => ENGLISH_MARKET_HINTS.has(t)).length;
  const hasTickerHint = normalizeTickers(headline.tickers).length > 0 || extractMentionedTickers(title).length > 0;

  if (stopwordCount > 0) return true;
  if (marketHintCount >= 2) return true;
  if (marketHintCount >= 1 && hasTickerHint) return true;
  if (tokens.length <= 4 && marketHintCount >= 1) return true;

  return false;
}

function isOpinionHeadline(title: string): boolean {
  const lower = (title || '').toLowerCase();
  const opinionSignals = [
    'opinion:',
    'analysis:',
    'column:',
    'editorial',
    "here's why",
    'what to watch',
    'stocks to buy',
    'should you',
    'why ',
  ];
  const hardEventSignals = [
    'earnings',
    'guidance',
    'cpi',
    'inflation',
    'jobs',
    'unemployment',
    'fed',
    'fomc',
    'rates',
    'yield',
    'opec',
    'crude',
    'oil',
    'sanction',
    'war',
    'attack',
    'merger',
    'acquire',
    'lawsuit',
    'fda',
    'doj',
    'sec',
  ];
  const looksOpinion = opinionSignals.some((s) => lower.includes(s));
  if (!looksOpinion) return false;
  const isHardEvent = hardEventSignals.some((s) => lower.includes(s));
  return !isHardEvent;
}

function tokenize(text: string): Set<string> {
  return new Set(
    normalizeTitle(text || '')
      .split(' ')
      .map((t) => t.trim())
      .filter(Boolean)
      .filter((t) => !STOPWORDS.has(t))
      .filter((t) => t.length >= 3)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function sourceQualityWeight(source: string): number {
  const s = (source || '').toLowerCase();
  if (s.includes('reuters')) return 1.35;
  if (s.includes('bloomberg')) return 1.35;
  if (s.includes('wsj') || s.includes('wall street journal')) return 1.25;
  if (s.includes('financial times') || s.includes('ft.com')) return 1.2;
  if (s.includes('cnbc')) return 1.15;
  if (s.includes('marketwatch')) return 1.1;
  return 1.0;
}

function recencyScore(publishedAt: string): number {
  const ts = Date.parse(publishedAt);
  if (!Number.isFinite(ts)) return 0.1;
  const hours = Math.max(0, (Date.now() - ts) / (60 * 60 * 1000));
  return Math.max(0, 72 - hours) / 72; // 0..1 over 72h
}

function normalizeTickers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const sym = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (!sym) continue;
    if (seen.has(sym)) continue;
    seen.add(sym);
    out.push(sym);
    if (out.length >= 12) break;
  }
  return out;
}

function normalizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function hashId(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `evt-${Math.abs(hash)}`;
}

function toSubtitle(value: unknown): string {
  if (typeof value !== 'string') return '';
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (cleaned.length <= 240) return cleaned;
  return `${cleaned.slice(0, 236).trimEnd()}…`;
}

function inferScope(params: { eventType: MarketEvent['event_type']; text: string }): MarketEvent['scope'] {
  if (params.eventType === 'company') return 'LOCAL';

  const lower = (params.text || '').toLowerCase();
  const globalSignals = [
    'opec',
    'brent',
    'wti',
    'china',
    'beijing',
    'japan',
    'boj',
    'eurozone',
    'ecb',
    'uk',
    'boe',
    'germany',
    'france',
    'russia',
    'ukraine',
    'israel',
    'iran',
    'middle east',
    'red sea',
    'taiwan',
    'global',
    'world',
    'geopolit',
    'sanction',
    'tariff',
    'war',
    'attack',
  ];
  if (globalSignals.some((s) => lower.includes(s))) return 'GLOBAL';

  return 'REGIONAL';
}

function isEtfTicker(symbol: string): boolean {
  return KNOWN_ETFS.has(symbol);
}

function inferEventType(headline: MarketHeadlineInput): MarketEvent['event_type'] {
  const title = (headline.title || '').toLowerCase();
  const tickers = normalizeTickers(headline.tickers);
  const nonEtf = tickers.filter((t) => !isEtfTicker(t));

  const macroSignals = [
    'fed',
    'fomc',
    'powell',
    'rates',
    'rate',
    'yield',
    'treasury',
    'inflation',
    'cpi',
    'pce',
    'jobs',
    'payroll',
    'unemployment',
    'gdp',
    'recession',
    'opec',
    'crude',
    'oil',
    'geopolit',
    'sanction',
    'tariff',
    'election',
    'war',
    'attack',
    'ceasefire',
  ];
  const sectorSignals = [
    'sector',
    'industry',
    'banks',
    'financials',
    'semiconductor',
    'chips',
    'retail',
    'airlines',
    'travel',
    'housing',
    'homebuilder',
    'utilities',
    'reits',
    'pharma',
    'biotech',
    'healthcare',
    'software',
    'cloud',
  ];
  const companySignals = [
    'earnings',
    'guidance',
    'profit',
    'revenue',
    'eps',
    'buyback',
    'dividend',
    'acquire',
    'acquisition',
    'merger',
    'deal',
    'downgrade',
    'upgrade',
    'lawsuit',
    'sec',
    'doj',
    'fda',
    'outage',
    'recall',
    'ceo',
  ];

  const macroScore = macroSignals.reduce((acc, s) => acc + (title.includes(s) ? 1 : 0), 0);
  const sectorScore = sectorSignals.reduce((acc, s) => acc + (title.includes(s) ? 1 : 0), 0);
  const companyScore = companySignals.reduce((acc, s) => acc + (title.includes(s) ? 1 : 0), 0);

  if (macroScore >= 2) return 'macro';
  if (nonEtf.length >= 2) return 'sector';
  if (nonEtf.length === 1 && companyScore >= 1) return 'company';
  if (sectorScore >= 2 || tickers.some((t) => t in SECTOR_BY_ETF)) return 'sector';
  if (nonEtf.length === 1) return 'company';
  if (sectorScore >= 1 && companyScore === 0) return 'sector';
  return 'macro';
}

function inferTheme(text: string): 'rates' | 'geopolitics' | 'oil' | 'earnings' | 'credit' | 'policy' | 'other' {
  const lower = (text || '').toLowerCase();
  if (lower.includes('cpi') || lower.includes('inflation') || lower.includes('fed') || lower.includes('fomc') || lower.includes('rates') || lower.includes('yield'))
    return 'rates';
  if (lower.includes('war') || lower.includes('attack') || lower.includes('sanction') || lower.includes('tariff') || lower.includes('geopolit') || lower.includes('election'))
    return 'geopolitics';
  if (lower.includes('oil') || lower.includes('opec') || lower.includes('crude') || lower.includes('gas') || lower.includes('wti') || lower.includes('brent'))
    return 'oil';
  if (lower.includes('earnings') || lower.includes('guidance') || lower.includes('profit') || lower.includes('revenue') || lower.includes('eps') || lower.includes('margin'))
    return 'earnings';
  if (lower.includes('credit') || lower.includes('spread') || lower.includes('default') || lower.includes('liquidity') || lower.includes('bank'))
    return 'credit';
  if (lower.includes('doj') || lower.includes('sec') || lower.includes('ftc') || lower.includes('fda') || lower.includes('regulation') || lower.includes('antitrust'))
    return 'policy';
  return 'other';
}

function inferImpactDirection(params: { title: string; eventType: MarketEvent['event_type'] }): MarketEvent['impact_direction'] {
  const lower = (params.title || '').toLowerCase();
  const theme = inferTheme(lower);

  if (params.eventType === 'macro') {
    if (theme === 'rates') {
      const hawkish = /rate\s*hike|hawkish|inflation\s*(hot|heats|re-accelerat)|yields?\s*(jump|rise|surge)|cuts?\s*pushed\s*out/i.test(lower);
      const dovish = /rate\s*cut|dovish|inflation\s*(cool|falls|eases)|yields?\s*(fall|drop|slide)|cuts?\s*(pulled|brought)\s*forward/i.test(lower);
      if (hawkish && !dovish) return 'down';
      if (dovish && !hawkish) return 'up';
      return hawkish || dovish ? 'mixed' : 'neutral';
    }
    if (theme === 'geopolitics') {
      const escalation = /attack|war|invasion|strike|sanction|tariff|escalat/i.test(lower);
      const deescalation = /truce|ceasefire|de-?escalat|peace talks/i.test(lower);
      if (escalation && !deescalation) return 'down';
      if (deescalation && !escalation) return 'up';
      return escalation || deescalation ? 'mixed' : 'neutral';
    }
    if (theme === 'oil') return 'mixed';
    if (theme === 'credit') return 'down';
  }

  const upSignals = [
    'rally',
    'surge',
    'soar',
    'jump',
    'gain',
    'beats',
    'beat',
    'raises guidance',
    'guidance raised',
    'upgrade',
    'approved',
    'approval',
    'record',
  ];
  const downSignals = [
    'selloff',
    'drop',
    'fall',
    'plunge',
    'slump',
    'misses',
    'miss',
    'cuts guidance',
    'guidance cut',
    'downgrade',
    'investigation',
    'lawsuit',
    'recall',
    'outage',
  ];

  const hasUp = upSignals.some((s) => lower.includes(s));
  const hasDown = downSignals.some((s) => lower.includes(s));
  if (hasUp && !hasDown) return 'up';
  if (hasDown && !hasUp) return 'down';
  if (hasUp && hasDown) return 'mixed';
  return 'neutral';
}

function inferSectorsFromText(text: string): string[] {
  const lower = (text || '').toLowerCase();
  const sectors: string[] = [];
  const push = (value: string) => {
    if (!sectors.includes(value)) sectors.push(value);
  };

  if (lower.includes('bank') || lower.includes('credit') || lower.includes('financial')) push('Financials');
  if (lower.includes('oil') || lower.includes('opec') || lower.includes('energy') || lower.includes('crude') || lower.includes('gas')) push('Energy');
  if (lower.includes('chip') || lower.includes('semiconductor') || lower.includes('ai') || lower.includes('software') || lower.includes('cloud')) push('Technology');
  if (lower.includes('retail') || lower.includes('consumer') || lower.includes('autos') || lower.includes('airlines') || lower.includes('travel')) push('Consumer Discretionary');
  if (lower.includes('staples')) push('Consumer Staples');
  if (lower.includes('drug') || lower.includes('biotech') || lower.includes('pharma') || lower.includes('health')) push('Health Care');
  if (lower.includes('utility')) push('Utilities');
  if (lower.includes('reit') || lower.includes('real estate')) push('Real Estate');
  if (lower.includes('industrial')) push('Industrials');
  if (lower.includes('materials') || lower.includes('copper') || lower.includes('steel')) push('Materials');
  if (lower.includes('telecom') || lower.includes('media') || lower.includes('streaming')) push('Communication Services');

  return sectors.slice(0, 4);
}

function inferAffectedSectors(params: { title: string; tickers: string[] }): string[] {
  const fromEtfs = params.tickers
    .filter((t) => t in SECTOR_BY_ETF)
    .map((t) => SECTOR_BY_ETF[t]!)
    .filter(Boolean);
  const inferred = inferSectorsFromText(params.title);
  const merged = Array.from(new Set([...fromEtfs, ...inferred]));
  return merged.slice(0, 4);
}

function cleanTitle(title: string): string {
  let value = (title || '').trim();
  value = value.replace(/^(breaking|exclusive|analysis|opinion|update)\s*:\s*/i, '');
  value = value.replace(/^why\s+/i, '');
  value = value.replace(/^how\s+/i, '');
  value = value.replace(/^what\s+you\s+need\s+to\s+know\s+about\s+/i, '');
  return value.trim().slice(0, 140);
}

function buildWhyItMatters(params: {
  eventType: MarketEvent['event_type'];
  theme: ReturnType<typeof inferTheme>;
  impactDirection: MarketEvent['impact_direction'];
  sectors: string[];
  tickers: string[];
}): string {
  const sectors = params.sectors.slice(0, 2);
  const tickers = params.tickers.slice(0, 4);

  const sectorClause = sectors.length ? `Sectors in focus: ${sectors.join(', ')}.` : '';
  const tickerClause = tickers.length ? `Key tickers: ${tickers.join(', ')}.` : '';

  if (params.eventType === 'macro') {
    if (params.theme === 'rates') {
      if (params.impactDirection === 'down') {
        return [
          'Rates repricing tightens financial conditions and raises the equity discount rate, compressing duration multiples.',
          sectorClause || 'Duration-heavy sectors and rate-sensitive defensives absorb the pressure first.',
          tickerClause || 'Watch the front-end and credit spreads for follow-through.',
        ]
          .filter(Boolean)
          .slice(0, 3)
          .join(' ');
      }
      if (params.impactDirection === 'up') {
        return [
          'Easier rate expectations loosen financial conditions and support duration multiples, shifting leadership toward growth.',
          sectorClause || 'Rate-sensitive sectors re-rate as the discount rate falls.',
          tickerClause || 'Follow-through shows up in duration ETFs and tighter credit spreads.',
        ]
          .filter(Boolean)
          .slice(0, 3)
          .join(' ');
      }
      return [
        'The rate path is the marginal driver of equity multiples and credit conditions in this window.',
        sectorClause || 'Leadership rotates with real yields and the front-end policy path.',
        tickerClause || 'Confirmation comes from yields, USD, and spreads.',
      ]
        .filter(Boolean)
        .slice(0, 3)
        .join(' ');
    }

    if (params.theme === 'geopolitics') {
      if (params.impactDirection === 'down') {
        return [
          'Geopolitical risk premium rises, pushing a risk-off rotation and widening dispersion across sectors.',
          sectorClause || 'Defense and energy attract flows while cyclicals de-risk.',
          tickerClause || 'Confirmation shows up in volatility and safe-haven demand.',
        ]
          .filter(Boolean)
          .slice(0, 3)
          .join(' ');
      }
      if (params.impactDirection === 'up') {
        return [
          'De-escalation removes tail risk, tightening risk premia and supporting beta.',
          sectorClause || 'Cyclicals regain leadership as safe-haven demand fades.',
          tickerClause || 'Confirmation shows up in lower volatility and tighter spreads.',
        ]
          .filter(Boolean)
          .slice(0, 3)
          .join(' ');
      }
      return [
        'Geopolitical uncertainty keeps a risk premium embedded and raises cross-asset volatility.',
        sectorClause || 'Sector leadership depends on energy pass-through and risk sentiment.',
        tickerClause || 'Confirmation shows up in oil, USD, and volatility.',
      ]
        .filter(Boolean)
        .slice(0, 3)
        .join(' ');
    }

    if (params.theme === 'oil') {
      return [
        'Oil-driven inflation impulse reshapes the policy path and forces sector dispersion rather than a broad index move.',
        sectorClause || 'Energy and transport sensitivity defines the winners/losers.',
        tickerClause || 'Follow-through shows up in breakevens and energy credit.',
      ]
        .filter(Boolean)
        .slice(0, 3)
        .join(' ');
    }

    if (params.theme === 'credit') {
      return [
        'Tighter credit conditions transmit quickly into equity risk premia and cap high-beta participation.',
        sectorClause || 'Financials and cyclicals absorb the pressure first as spreads widen.',
        tickerClause || 'Follow-through shows up in HY ETFs and funding markets.',
      ]
        .filter(Boolean)
        .slice(0, 3)
        .join(' ');
    }
  }

  if (params.eventType === 'sector') {
    if (params.theme === 'earnings') {
      return [
        'Earnings revisions reset forward margins and drive sector leadership via multiple expansion or compression.',
        sectorClause || 'Relative performance concentrates in the sectors with positive revision breadth.',
        tickerClause || 'Follow-through shows up in sector ETF trend and estimate revisions.',
      ]
        .filter(Boolean)
        .slice(0, 3)
        .join(' ');
    }
    if (params.theme === 'policy') {
      return [
        'Regulatory and policy actions re-price sector risk premia and shift capital allocation within the industry.',
        sectorClause || 'Sector leadership rotates as compliance and margin expectations reset.',
        tickerClause || 'Follow-through shows up in dispersion across peers.',
      ]
        .filter(Boolean)
        .slice(0, 3)
        .join(' ');
    }
    return [
      'Sector-level positioning and revisions drive relative performance when the index is range-bound.',
      sectorClause || 'Leadership rotates toward the segments with the cleanest revision and pricing power signal.',
      tickerClause || 'Follow-through shows up in sector ETFs and peer dispersion.',
    ]
      .filter(Boolean)
      .slice(0, 3)
      .join(' ');
  }

  // company
  if (params.theme === 'earnings') {
    return [
      'Company-specific guidance and earnings revisions reset the forward cash-flow path and force a multiple repricing.',
      sectorClause || 'The move transmits through peers via estimate revisions and positioning.',
      tickerClause || 'Follow-through shows up in post-event drift and revisions.',
    ]
      .filter(Boolean)
      .slice(0, 3)
      .join(' ');
  }
  if (params.theme === 'policy') {
    return [
      'Regulatory actions re-price idiosyncratic risk and shift the valuation anchor for the name.',
      sectorClause || 'Peers reprice as the regulatory overhang resets sector risk premia.',
      tickerClause || 'Follow-through shows up in implied volatility and peer dispersion.',
    ]
      .filter(Boolean)
      .slice(0, 3)
      .join(' ');
  }
  return [
    'Idiosyncratic catalysts drive stock-specific repricing and spill over through peers via positioning and revision cycles.',
    sectorClause || 'The impact expresses as dispersion rather than broad index direction.',
    tickerClause || 'Follow-through shows up in relative strength and revisions.',
  ]
    .filter(Boolean)
    .slice(0, 3)
    .join(' ');
}

type Cluster = {
  items: Array<MarketHeadlineInput & { tokens: Set<string>; tickersNorm: string[] }>;
  representative: MarketHeadlineInput & { tokens: Set<string>; tickersNorm: string[] };
};

function pickPrimaryUrl(items: Cluster['items']): string | undefined {
  let bestUrl: string | undefined;
  let bestScore = -1;
  for (const item of items) {
    const url = normalizeUrl(item.url);
    if (!url) continue;
    const score = sourceQualityWeight(item.source || '') * 2 + recencyScore(item.publishedAt);
    if (score > bestScore) {
      bestScore = score;
      bestUrl = url;
    }
  }
  return bestUrl;
}

function pickRepresentative(items: Cluster['items']): Cluster['representative'] {
  let best = items[0]!;
  let bestScore = -1;
  for (const item of items) {
    const score =
      sourceQualityWeight(item.source || '') * 2 +
      recencyScore(item.publishedAt) * 2 +
      Math.min((item.title || '').length / 120, 1) * 0.8 +
      (normalizeTickers(item.tickersNorm).length ? 0.4 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

function clusterBySimilarity(params: {
  items: Array<MarketHeadlineInput & { tokens: Set<string>; tickersNorm: string[] }>;
  threshold: number;
  timeWindowHours: number;
}): Cluster[] {
  const sorted = [...params.items].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  const used = new Set<number>();
  const clusters: Cluster[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    if (used.has(i)) continue;
    const base = sorted[i]!;
    const clusterItems: Cluster['items'] = [base];
    used.add(i);

    const baseTs = Date.parse(base.publishedAt);

    for (let j = i + 1; j < sorted.length; j += 1) {
      if (used.has(j)) continue;
      const cand = sorted[j]!;
      const candTs = Date.parse(cand.publishedAt);
      if (Number.isFinite(baseTs) && Number.isFinite(candTs)) {
        const hoursDiff = (baseTs - candTs) / (60 * 60 * 1000);
        if (hoursDiff > params.timeWindowHours) break;
      }
      const sim = jaccard(base.tokens, cand.tokens);
      if (sim >= params.threshold) {
        clusterItems.push(cand);
        used.add(j);
      }
    }

    const representative = pickRepresentative(clusterItems);
    clusters.push({ items: clusterItems, representative });
  }

  return clusters;
}

function scoreCluster(params: { eventType: MarketEvent['event_type']; cluster: Cluster }): number {
  const eventWeight = params.eventType === 'macro' ? 100 : params.eventType === 'sector' ? 60 : 30;
  const size = params.cluster.items.length;
  const recency = recencyScore(params.cluster.representative.publishedAt);
  const source = sourceQualityWeight(params.cluster.representative.source || '');
  return eventWeight + size * 2.4 + recency * 10 + source * 4;
}

function pickSources(items: MarketHeadlineInput[]): string[] {
  const seen = new Set<string>();
  const ranked = [...items]
    .map((h) => ({ source: (h.source || '').trim() || 'Unknown', score: sourceQualityWeight(h.source || '') }))
    .sort((a, b) => b.score - a.score || a.source.localeCompare(b.source));
  const out: string[] = [];
  for (const row of ranked) {
    const src = row.source;
    if (!src || src === 'Unknown') continue;
    const key = src.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(src);
    if (out.length >= 3) break;
  }
  return out.length ? out : ['Unknown'];
}

function pickSourceLinks(items: Cluster['items']): Array<{ source: string; url: string }> | undefined {
  const seen = new Set<string>();
  const ranked = [...items]
    .map((h) => ({
      source: (h.source || '').trim() || 'Unknown',
      url: normalizeUrl(h.url),
      score: sourceQualityWeight(h.source || '') * 2 + recencyScore(h.publishedAt),
    }))
    .filter((row) => row.url && row.source !== 'Unknown')
    .sort((a, b) => b.score - a.score || a.source.localeCompare(b.source));

  const out: Array<{ source: string; url: string }> = [];
  for (const row of ranked) {
    if (!row.url) continue;
    const key = row.source.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ source: row.source, url: row.url });
    if (out.length >= 3) break;
  }

  return out.length ? out : undefined;
}

function buildMarketEvent(eventType: MarketEvent['event_type'], cluster: Cluster): MarketEvent {
  const representative = cluster.representative;
  const rawTitle = cleanTitle(representative.title || 'Untitled');
  const combinedText = cluster.items.map((h) => h.title).join(' | ');
  const impactDirection = inferImpactDirection({ title: combinedText, eventType });

  const allTickers = Array.from(
    new Set([
      ...cluster.items.flatMap((h) => h.tickersNorm),
      ...extractMentionedTickers(combinedText),
    ])
  )
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  const preferredTickers = (() => {
    if (eventType === 'macro') {
      const etfs = allTickers.filter((t) => isEtfTicker(t));
      const withDefaults = Array.from(new Set([...etfs, 'SPY', 'QQQ', 'TLT', 'GLD', 'UUP']));
      return withDefaults.slice(0, 8);
    }
    if (eventType === 'sector') {
      const sectorEtfs = allTickers.filter((t) => t in SECTOR_BY_ETF);
      const names = allTickers.filter((t) => !isEtfTicker(t));
      return Array.from(new Set([...sectorEtfs, ...names])).slice(0, 8);
    }
    const names = allTickers.filter((t) => !isEtfTicker(t));
    if (names.length) return names.slice(0, 6);
    return allTickers.slice(0, 6);
  })();

  const resolvedTickers: string[] = preferredTickers.length > 0 ? preferredTickers : ['SPY', 'QQQ', 'TLT', 'GLD', 'XLE'];

  const affectedSectors = inferAffectedSectors({ title: rawTitle, tickers: resolvedTickers });
  const theme = inferTheme(combinedText);
  const why = buildWhyItMatters({
    eventType,
    theme,
    impactDirection,
    sectors: affectedSectors,
    tickers: resolvedTickers,
  });

  const confidence: MarketEvent['confidence'] = (() => {
    const size = cluster.items.length;
    const distinctSources = new Set(cluster.items.map((h) => (h.source || '').trim().toLowerCase()).filter(Boolean)).size;
    if (size >= 3 && distinctSources >= 2 && impactDirection !== 'neutral') return 'high';
    if (size >= 2) return 'medium';
    return 'low';
  })();

  const sources = pickSources(cluster.items);
  const primaryUrl = normalizeUrl(representative.url) || pickPrimaryUrl(cluster.items);
  const source = (representative.source || '').trim() || sources[0] || 'Unknown';
  const publishedAt = representative.publishedAt;
  const idSeed = primaryUrl || `${normalizeTitle(rawTitle)}|${source}|${toDateBucket(publishedAt)}|${eventType}`;
  const id = hashId(idSeed);
  const seriesSeed = `${normalizeTitle(rawTitle)}|${eventType}|${theme}|${resolvedTickers
    .filter((t) => !isEtfTicker(t))
    .slice(0, 3)
    .join(',')}`;
  const eventSeriesId = hashId(seriesSeed);
  const scope = inferScope({ eventType, text: combinedText });
  const subtitle = toSubtitle(representative.summary) || toSubtitle(representative.title) || rawTitle;
  const sourceLinks = pickSourceLinks(cluster.items);

  return {
    id,
    eventSeriesId,
    event_type: eventType,
    scope,
    title: rawTitle,
    subtitle,
    impact_direction: impactDirection,
    affected_sectors: affectedSectors,
    affected_tickers: resolvedTickers,
    why_it_matters: why,
    confidence,
    source,
    publishedAt,
    sources,
    ...(primaryUrl ? { url: primaryUrl } : {}),
    ...(sourceLinks ? { source_links: sourceLinks } : {}),
  };
}

/**
 * Cluster raw headlines into 3–5 MarketEvent objects.
 * Deterministic (no LLM): filters non-English + opinion, clusters by category, ranks by relevance.
 */
export function clusterMarketEvents(params: { headlines: MarketHeadlineInput[]; maxEvents?: number }): MarketEvent[] {
  const maxEvents = typeof params.maxEvents === 'number' ? Math.min(5, Math.max(3, params.maxEvents)) : 5;

  const cleaned = (Array.isArray(params.headlines) ? params.headlines : [])
    .filter((h) => typeof h?.title === 'string' && h.title.trim().length)
    .map((h) => ({
      ...h,
      publishedAt: isFiniteTimestamp(h.publishedAt) ? h.publishedAt : new Date().toISOString(),
      source: (h.source || '').trim() || 'Unknown',
      tickersNorm: normalizeTickers(h.tickers),
      tokens: tokenize(`${h.title} ${h.summary || ''}`),
    }))
    .filter((h) => h.tokens.size > 0)
    .filter((h) => isEnglishHeadline(h))
    .filter((h) => !isOpinionHeadline(h.title));

  // De-dupe within day bucket by normalized title (keeps one English version if multilingual duplicates exist).
  const seen = new Set<string>();
  const deduped: typeof cleaned = [];
  for (const h of cleaned) {
    const key = `${normalizeTitle(h.title)}|${toDateBucket(h.publishedAt)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(h);
  }

  if (!deduped.length) return [];

  const byType: Record<MarketEvent['event_type'], typeof deduped> = {
    macro: [],
    sector: [],
    company: [],
  };

  for (const h of deduped) {
    const eventType = inferEventType(h);
    byType[eventType].push(h);
  }

  const clusters: Array<{ eventType: MarketEvent['event_type']; cluster: Cluster; score: number }> = [];

  const configs: Record<MarketEvent['event_type'], { threshold: number; timeWindowHours: number }> = {
    macro: { threshold: 0.26, timeWindowHours: 60 },
    sector: { threshold: 0.33, timeWindowHours: 60 },
    company: { threshold: 0.36, timeWindowHours: 48 },
  };

  (Object.keys(byType) as Array<MarketEvent['event_type']>).forEach((eventType) => {
    const items = byType[eventType];
    if (!items.length) return;
    const clustered = clusterBySimilarity({
      items,
      threshold: configs[eventType].threshold,
      timeWindowHours: configs[eventType].timeWindowHours,
    });
    for (const c of clustered) {
      clusters.push({ eventType, cluster: c, score: scoreCluster({ eventType, cluster: c }) });
    }
  });

  clusters.sort((a, b) => b.score - a.score);

  const picked: MarketEvent[] = [];
  const seenTitles = new Set<string>();

  for (const row of clusters) {
    if (picked.length >= maxEvents) break;
    const event = buildMarketEvent(row.eventType, row.cluster);
    const titleKey = normalizeTitle(event.title);
    if (!titleKey || seenTitles.has(titleKey)) continue;
    seenTitles.add(titleKey);
    picked.push(event);
  }

  // Ensure we never return an empty feed if we have headlines: fall back to top items as single-headline events.
  if (!picked.length) {
    const fallback = deduped
      .slice(0, maxEvents)
      .map((h) => buildMarketEvent(inferEventType(h), { items: [h], representative: h }));
    return fallback;
  }

  // If fewer than 3 events are available, return whatever we have (still real headlines).
  return picked.slice(0, maxEvents);
}
