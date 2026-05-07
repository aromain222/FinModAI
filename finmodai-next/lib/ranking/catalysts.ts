import type {
  CatalystChannel,
  CatalystDirection,
  EventItem,
  RankedCatalyst,
} from './types';

type CompanyHeadlineInput = {
  title: string;
  url?: string | null;
  source?: string | null;
  publishedAt?: string | null;
};

type ClassifyInput = {
  ticker: string;
  title: string;
  description?: string | null;
  source?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  kind: RankedCatalyst['kind'];
};

const GROWTH_TECH = new Set([
  'NVDA', 'AMD', 'AVGO', 'ARM', 'SMCI', 'PLTR', 'SNOW', 'NET', 'DDOG', 'CRWD',
  'PANW', 'ZS', 'SHOP', 'TSLA', 'META', 'AMZN', 'GOOGL', 'MSFT', 'AAPL',
]);

const FINANCIALS = new Set([
  'JPM', 'BAC', 'C', 'GS', 'MS', 'BLK', 'SCHW', 'AXP', 'COF', 'ALLY', 'DFS',
  'SOFI', 'HOOD', 'COIN', 'AFRM', 'SQ', 'PYPL', 'KKR', 'BX', 'APO',
]);

const ENERGY = new Set(['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'OXY', 'LNG']);

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function textOf(input: Pick<ClassifyInput, 'title' | 'description'>): string {
  return `${input.title} ${input.description ?? ''}`.toLowerCase();
}

function detectDirection(text: string): CatalystDirection {
  if (/\b(beat|beats|raise|raises|raised|guide.?up|accelerat|strong demand|record|approval|approved|partnership|buyback|cooler inflation|dovish|rate cut|cuts rates|lower yields|cloud growth|margin expansion)\b/i.test(text)) {
    return 'positive';
  }
  if (/\b(miss|misses|cut|cuts|guide.?down|probe|investigation|lawsuit|antitrust|regulator|ban|restriction|delay|delayed|weak|slowing|hot inflation|hawkish|higher for longer|higher yields|margin pressure|capex pressure|default|delinquen)\b/i.test(text)) {
    return 'negative';
  }
  return 'neutral';
}

function detectChannel(text: string, kind: RankedCatalyst['kind']): CatalystChannel {
  if (kind === 'macro' || /\b(fed|fomc|cpi|pce|inflation|payroll|jobs|treasury|yield|rates?|oil|opec|dollar|credit spreads?)\b/i.test(text)) return 'macro';
  if (/\b(earnings|guidance|eps|revenue|sales|bookings|orders|gmv|cloud|loan growth|margin|capex|demand|shipments)\b/i.test(text)) return 'estimate';
  if (/\b(valuation|multiple|antitrust|regulat|lawsuit|probe|risk premium|terminal|moat)\b/i.test(text)) return 'multiple';
  if (/\b(short interest|flows|etf|positioning|crowded|rotation|upgrade|downgrade|initiates|raises target|cuts target)\b/i.test(text)) return 'positioning';
  return 'risk';
}

function macroDirectionForTicker(ticker: string, text: string, base: CatalystDirection): CatalystDirection {
  if (!/\b(fed|fomc|cpi|pce|inflation|payroll|jobs|treasury|yield|rates?|oil|opec|dollar|credit)\b/i.test(text)) return base;
  const isGrowth = GROWTH_TECH.has(ticker);
  const isFinancial = FINANCIALS.has(ticker);
  const isEnergy = ENERGY.has(ticker);

  if (/\b(cooler inflation|dovish|rate cut|lower yields|soft landing|easing)\b/i.test(text)) {
    if (isGrowth) return 'positive';
    if (isFinancial) return 'neutral';
    return 'positive';
  }
  if (/\b(hot inflation|hawkish|higher for longer|higher yields|sticky inflation|reaccelerat)\b/i.test(text)) {
    if (isGrowth) return 'negative';
    if (isFinancial) return 'positive';
    return 'negative';
  }
  if (/\b(oil|opec|brent|wti|crude|energy supply)\b/i.test(text)) {
    if (isEnergy) return 'positive';
    if (isGrowth) return 'negative';
  }
  return base;
}

function impactFor(channel: CatalystChannel, direction: CatalystDirection, text: string): number {
  if (direction === 'neutral') return 0;
  const sign = direction === 'positive' ? 1 : -1;
  let base =
    channel === 'estimate' ? 1.6 :
    channel === 'multiple' ? 1.3 :
    channel === 'macro' ? 1.1 :
    channel === 'positioning' ? 0.9 :
    0.8;
  if (/\b(earnings|guidance|antitrust|fomc|cpi|pce|payroll|blackwell|cloud|ai capex|crypto|delinquen)\b/i.test(text)) base += 0.5;
  if (/\b(probe|investigation|lawsuit|ban|restriction|default|crash|surge|plunge)\b/i.test(text)) base += 0.4;
  return round1(clamp(sign * base, -3.5, 3.5));
}

function confidenceFor(kind: RankedCatalyst['kind'], channel: CatalystChannel, text: string): number {
  let confidence = kind === 'company_news' ? 0.6 : 0.52;
  if (channel === 'estimate') confidence += 0.1;
  if (/\b(earnings|guidance|cpi|fomc|pce|payroll|fed|regulator|antitrust)\b/i.test(text)) confidence += 0.08;
  if (/\b(rumor|could|may|reportedly|sources say)\b/i.test(text)) confidence -= 0.12;
  return round1(clamp(confidence, 0.35, 0.82));
}

function templateFor(channel: CatalystChannel, direction: CatalystDirection): Pick<RankedCatalyst, 'priced' | 'estimateRisk' | 'multipleImpact' | 'positioningRisk' | 'horizon'> {
  if (channel === 'macro') {
    return {
      priced: 'Market prices a rate and growth path; the surprise versus that path matters.',
      estimateRisk: 'Company estimates usually move little at first, but discount-rate assumptions can move quickly.',
      multipleImpact: direction === 'negative' ? 'Higher real yields compress long-duration multiples.' : direction === 'positive' ? 'Lower real yields support growth multiples.' : 'Multiple impact depends on the surprise direction.',
      positioningRisk: 'Crowded growth exposure can amplify the first move around macro prints.',
      horizon: 'Same day to 1 month',
    };
  }
  if (channel === 'estimate') {
    return {
      priced: 'The market may already price part of the operating improvement; guidance and revisions decide the next move.',
      estimateRisk: 'High if the catalyst changes revenue, margin, bookings, GMV, credit, or capex assumptions.',
      multipleImpact: 'Multiple expands only if the estimate change looks durable, not one-off.',
      positioningRisk: 'Crowded longs punish good headlines if forward guidance is weak.',
      horizon: 'Event day to 6 weeks',
    };
  }
  if (channel === 'multiple') {
    return {
      priced: 'Some risk is usually discounted, but concrete remedies or moat changes are not fully priced.',
      estimateRisk: 'Near-term numbers may not move unless distribution, pricing, or monetization changes.',
      multipleImpact: direction === 'negative' ? 'Primary channel is higher risk premium and lower terminal multiple.' : 'Lower perceived risk can lift the terminal multiple.',
      positioningRisk: 'Event-driven flows can pressure the stock around remedy or policy headlines.',
      horizon: '1 to 12 months',
    };
  }
  if (channel === 'positioning') {
    return {
      priced: 'The headline matters if it challenges current crowding, factor exposure, or flow direction.',
      estimateRisk: 'Low unless positioning is tied to estimate revisions.',
      multipleImpact: 'Multiple impact is usually temporary unless flows reveal a broader narrative change.',
      positioningRisk: 'High because fast-money flows can move swing-trade setups before fundamentals change.',
      horizon: '1 day to 1 month',
    };
  }
  return {
    priced: 'Market may discount generic risk, but concrete risk changes still matter.',
    estimateRisk: 'Estimate risk depends on whether the headline affects demand, costs, or financing.',
    multipleImpact: 'Risk-premium changes can move the stock before estimates change.',
    positioningRisk: 'Weak risk headlines can trigger de-risking if the stock is already crowded.',
    horizon: '1 week to 3 months',
  };
}

function reasonFor(channel: CatalystChannel, direction: CatalystDirection, ticker: string): string {
  const directionText = direction === 'positive' ? 'supports' : direction === 'negative' ? 'pressures' : 'could swing';
  if (channel === 'macro') return `Macro catalyst ${directionText} ${ticker} through rates, risk appetite, and factor positioning.`;
  if (channel === 'estimate') return `Operating catalyst ${directionText} ${ticker} through estimate revisions.`;
  if (channel === 'multiple') return `Moat/risk catalyst ${directionText} ${ticker} through the valuation multiple.`;
  if (channel === 'positioning') return `Flow catalyst ${directionText} ${ticker} through positioning and sentiment.`;
  return `Risk catalyst ${directionText} ${ticker} through risk premium.`;
}

export function classifyCatalyst(input: ClassifyInput): RankedCatalyst {
  const ticker = input.ticker.toUpperCase();
  const text = textOf(input);
  const channel = detectChannel(text, input.kind);
  const rawDirection = detectDirection(text);
  const direction = macroDirectionForTicker(ticker, text, rawDirection);
  const impactPct = impactFor(channel, direction, text);
  const confidence = confidenceFor(input.kind, channel, text);
  const template = templateFor(channel, direction);
  const rankScore = round1(
    clamp(
      Math.abs(impactPct) * 18 +
        confidence * 35 +
        (input.kind === 'company_news' ? 12 : 8) +
        (channel === 'estimate' ? 10 : channel === 'multiple' ? 8 : channel === 'macro' ? 7 : 4),
      0,
      100,
    ),
  );

  return {
    title: input.title.trim(),
    source: input.source ?? null,
    url: input.url ?? null,
    publishedAt: input.publishedAt ?? null,
    kind: input.kind,
    channel,
    direction,
    impactPct,
    confidence,
    rankScore,
    reason: reasonFor(channel, direction, ticker),
    ...template,
  };
}

export function companyHeadlinesToCatalysts(ticker: string, headlines: CompanyHeadlineInput[]): RankedCatalyst[] {
  return headlines
    .filter((headline) => headline.title.trim().length > 0)
    .map((headline) => classifyCatalyst({
      ticker,
      title: headline.title,
      source: headline.source ?? null,
      url: headline.url ?? null,
      publishedAt: headline.publishedAt ?? null,
      kind: 'company_news',
    }));
}

export function macroEventsToCatalysts(ticker: string, events: EventItem[]): RankedCatalyst[] {
  return events
    .map((event) => {
      const source = event.sources?.[0];
      return classifyCatalyst({
        ticker,
        title: event.title ?? event.headline ?? 'Macro event',
        description: event.why_it_matters ?? event.what_happened ?? event.impact ?? null,
        source: source?.source ?? null,
        url: source?.url ?? null,
        publishedAt: event.published_at ?? source?.published_at ?? null,
        kind: event.kind === 'earnings' || event.kind === 'transcript' ? 'earnings' : 'macro',
      });
    });
}

export function catalystsToRankingEvents(catalysts: RankedCatalyst[]): EventItem[] {
  return catalysts.map((catalyst) => ({
    title: catalyst.title,
    headline: catalyst.title,
    kind: catalyst.kind,
    direction: catalyst.direction,
    magnitude: Math.abs(catalyst.impactPct) >= 2 ? 'high' : Math.abs(catalyst.impactPct) >= 1 ? 'medium' : 'low',
    impact: catalyst.reason,
    published_at: catalyst.publishedAt ?? undefined,
    sources: catalyst.source || catalyst.url || catalyst.publishedAt
      ? [{ source: catalyst.source ?? 'source unavailable', url: catalyst.url ?? '', published_at: catalyst.publishedAt ?? '' }]
      : undefined,
    eventForecast: {
      direction: catalyst.direction,
      confidence: catalyst.confidence,
      priceImpactPct: catalyst.impactPct,
    },
    rank: {
      score: catalyst.rankScore,
      reason: catalyst.reason,
    },
  }));
}

export function rankCatalysts(catalysts: RankedCatalyst[], limit: number): RankedCatalyst[] {
  const seen = new Set<string>();
  return catalysts
    .filter((catalyst) => {
      const key = catalyst.title.toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => right.rankScore - left.rankScore)
    .slice(0, limit);
}
