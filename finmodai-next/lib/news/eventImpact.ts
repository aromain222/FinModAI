import type { RelevanceEventType } from '@/lib/news/relevance';

export type ImpactDirection = 'up' | 'down' | 'mixed' | 'unknown';
export type BiasDirection = 'Risk-On' | 'Risk-Off' | 'Hawkish' | 'Dovish' | 'Neutral';

export type EventImpact = {
  bias: BiasDirection;
  confidence: 'low' | 'medium' | 'high';
  affectedSectors: Array<{ sector: string; direction: ImpactDirection; rationale: string }>;
  affectedTickers: Array<{ ticker: string; direction: ImpactDirection; rationale: string }>;
  watchItems: string[];
  whyItMatters: string;
};

function biasToDirection(bias: BiasDirection): ImpactDirection {
  if (bias === 'Risk-On' || bias === 'Dovish') return 'up';
  if (bias === 'Risk-Off' || bias === 'Hawkish') return 'down';
  return 'mixed';
}

function dedupeSectors(
  sectors: Array<{ sector: string; direction: ImpactDirection; rationale: string }>
): Array<{ sector: string; direction: ImpactDirection; rationale: string }> {
  const seen = new Set<string>();
  const out: Array<{ sector: string; direction: ImpactDirection; rationale: string }> = [];
  for (const item of sectors) {
    const key = `${item.sector.toLowerCase()}:${item.direction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function dedupeTickers(
  tickers: Array<{ ticker: string; direction: ImpactDirection; rationale: string }>
): Array<{ ticker: string; direction: ImpactDirection; rationale: string }> {
  const byTicker = new Map<string, { ticker: string; direction: ImpactDirection; rationale: string }>();
  for (const item of tickers) {
    const key = item.ticker.toUpperCase();
    if (!byTicker.has(key)) byTicker.set(key, { ...item, ticker: key });
  }
  return Array.from(byTicker.values());
}

function mergeWatchItems(existing: string[], additions: string[]): string[] {
  return Array.from(new Set([...existing, ...additions])).slice(0, 6);
}

function applyMexicoAirlineOverlay(impact: EventImpact, text: string): EventImpact {
  const lower = text.toLowerCase();
  const hasMexico = /\b(mexico|mexican|mxn|cdmx|cancun|guadalajara|monterrey)\b/.test(lower);
  if (!hasMexico) return impact;

  const hasTravelChannel = /\b(airline|airlines|flight|flights|airport|tourism|travel|passenger|border|visa|hotel|booking)\b/.test(
    lower
  );
  if (!hasTravelChannel) return impact;

  const positiveTravel = /\b(reopen|reopening|normalization|record tourism|strong bookings?|visa easing|de-escalation|improvement)\b/.test(
    lower
  );
  const negativeTravel = /\b(violence|security|cartel|disruption|shutdown|outage|storm|hurricane|ban|restriction|strike|warning)\b/.test(
    lower
  );

  const directional: ImpactDirection = positiveTravel ? 'up' : negativeTravel ? 'down' : biasToDirection(impact.bias);
  const directionalBias: BiasDirection = positiveTravel ? 'Risk-On' : negativeTravel ? 'Risk-Off' : impact.bias;

  const travelSectors: Array<{ sector: string; direction: ImpactDirection; rationale: string }> = [
    {
      sector: 'Industrials',
      direction: directional,
      rationale: 'Airline and airport-exposed names react to Mexico route demand, load factors, and operational risk.',
    },
    {
      sector: 'Consumer Discretionary',
      direction: directional,
      rationale: 'Leisure travel demand and booking trends can reprice travel platform and hospitality expectations.',
    },
    {
      sector: 'Energy',
      direction: 'mixed',
      rationale: 'Jet fuel and crude moves can amplify or offset route-demand effects on airline margins.',
    },
  ];

  const airlineTickers = ['UAL', 'AAL', 'DAL', 'LUV', 'JBLU', 'ALGT'];
  const travelTickers = ['BKNG', 'EXPE', 'ABNB'];
  const tickerDirection = directional === 'unknown' ? 'mixed' : directional;
  const overlayTickers = [...airlineTickers, ...travelTickers].map((ticker) => ({
    ticker,
    direction: tickerDirection,
    rationale: 'Material sensitivity to Mexico-related travel demand, route economics, and cross-border risk sentiment.',
  }));

  const watchItems = [
    'USD/MXN and broad USD direction',
    'Airline booking/capacity commentary for Mexico routes',
    'Jet fuel versus crude spread',
    'Travel advisories and border policy updates',
  ];

  return {
    ...impact,
    bias: directionalBias,
    confidence: impact.confidence === 'low' ? 'medium' : impact.confidence,
    affectedSectors: dedupeSectors([...travelSectors, ...impact.affectedSectors]),
    affectedTickers: dedupeTickers([...overlayTickers, ...impact.affectedTickers]),
    watchItems: mergeWatchItems(impact.watchItems, watchItems),
    whyItMatters:
      `${impact.whyItMatters} Mexico-linked headlines can transmit into airline and travel equities through route demand, pricing power, and operational risk on cross-border corridors.`,
  };
}

function parseTickers(text: string): string[] {
  const explicitSymbols = text.match(/\$[A-Z]{1,5}\b/g)?.map((token) => token.slice(1)) ?? [];
  const tokens = text.match(/\b[A-Z]{2,5}\b/g) ?? [];
  const blacklist = new Set([
    'THE',
    'AND',
    'FOR',
    'WITH',
    'THIS',
    'THAT',
    'USD',
    'US',
    'USA',
    'CPI',
    'GDP',
    'PCE',
    'PMI',
    'OPEC',
    'FED',
    'ECB',
    'BOE',
    'EIA',
    'WTI',
    'DXY',
    'CEO',
    'ETF',
    'EU',
    'ECB',
    'BOJ',
    'BOC',
    'SNB',
    'EMEA',
    'APAC',
    'UK',
    'UAE',
    'ASIA',
    'EUR',
    'JPY',
    'GBP',
  ]);
  const unique = Array.from(
    new Set([...explicitSymbols, ...tokens].filter((token) => !blacklist.has(token)))
  );
  return unique.slice(0, 5);
}

function baseByType(eventType: RelevanceEventType): EventImpact {
  switch (eventType) {
    case 'policy':
      return {
        bias: 'Hawkish',
        confidence: 'high',
        affectedSectors: [
          { sector: 'Financials', direction: 'up', rationale: 'Higher policy rates can support net interest margins.' },
          { sector: 'Real Estate', direction: 'down', rationale: 'Higher discount rates pressure duration-sensitive assets.' },
          { sector: 'Technology', direction: 'down', rationale: 'Long-duration cash flows de-rate when yields rise.' },
        ],
        affectedTickers: [],
        watchItems: ['2Y Treasury yield', 'Fed funds futures pricing', 'Growth vs value rotation'],
        whyItMatters:
          'Policy shocks propagate through discount rates, valuation multiples, and liquidity conditions across equities, rates, and credit.',
      };
    case 'rates':
      return {
        bias: 'Hawkish',
        confidence: 'high',
        affectedSectors: [
          { sector: 'Financials', direction: 'up', rationale: 'Steeper curves can support spread income.' },
          { sector: 'Utilities', direction: 'down', rationale: 'Defensive bond-proxy sectors underperform as yields rise.' },
          { sector: 'Real Estate', direction: 'down', rationale: 'Funding and cap-rate sensitivity increases with rates.' },
        ],
        affectedTickers: [],
        watchItems: ['10Y yield trend', 'Term premium', 'Credit spread reaction'],
        whyItMatters:
          'Rates are a core transmission channel for equity valuation, corporate funding costs, and risk appetite.',
      };
    case 'inflation':
      return {
        bias: 'Risk-Off',
        confidence: 'high',
        affectedSectors: [
          { sector: 'Consumer Staples', direction: 'mixed', rationale: 'Pricing power helps, but volume elasticity can weaken.' },
          { sector: 'Energy', direction: 'up', rationale: 'Commodity-linked sectors often benefit from inflation pressure.' },
          { sector: 'Consumer Discretionary', direction: 'down', rationale: 'Real income pressure can slow discretionary demand.' },
        ],
        affectedTickers: [],
        watchItems: ['Breakeven inflation', 'Real yields', 'Consumer spending data'],
        whyItMatters:
          'Inflation surprises alter expected policy path and real rates, driving rapid re-pricing in both equities and bonds.',
      };
    case 'growth':
      return {
        bias: 'Risk-On',
        confidence: 'medium',
        affectedSectors: [
          { sector: 'Industrials', direction: 'up', rationale: 'Cyclicals benefit from stronger demand expectations.' },
          { sector: 'Consumer Discretionary', direction: 'up', rationale: 'Growth momentum supports spending-sensitive sectors.' },
          { sector: 'Utilities', direction: 'down', rationale: 'Defensive sectors lag in pro-growth regimes.' },
        ],
        affectedTickers: [],
        watchItems: ['PMI trend', 'Payroll revisions', 'Forward earnings guidance'],
        whyItMatters:
          'Growth impulses influence earnings expectations, cyclicality, and equity risk premium direction.',
      };
    case 'energy':
      return {
        bias: 'Risk-Off',
        confidence: 'medium',
        affectedSectors: [
          { sector: 'Energy', direction: 'up', rationale: 'Higher commodity prices support revenue and cash flow.' },
          { sector: 'Industrials', direction: 'mixed', rationale: 'Input costs rise while capex demand can stay firm.' },
          { sector: 'Consumer Discretionary', direction: 'down', rationale: 'Energy inflation can squeeze consumer purchasing power.' },
        ],
        affectedTickers: [],
        watchItems: ['WTI/Brent curve', 'Inventory trend', 'Shipping and refining spreads'],
        whyItMatters:
          'Energy shocks feed inflation expectations and can tighten financial conditions through cost channels.',
      };
    case 'fx':
      return {
        bias: 'Risk-Off',
        confidence: 'medium',
        affectedSectors: [
          { sector: 'Materials', direction: 'mixed', rationale: 'Dollar moves impact commodity translation effects.' },
          { sector: 'Technology', direction: 'down', rationale: 'Stronger USD can pressure multinational revenue translation.' },
          { sector: 'Industrials', direction: 'mixed', rationale: 'Export competitiveness shifts with FX moves.' },
        ],
        affectedTickers: [],
        watchItems: ['DXY level', 'Real rate differentials', 'EM FX stress'],
        whyItMatters:
          'FX moves alter global liquidity, earnings translation, and relative asset attractiveness.',
      };
    case 'credit':
      return {
        bias: 'Risk-Off',
        confidence: 'high',
        affectedSectors: [
          { sector: 'Financials', direction: 'down', rationale: 'Spread widening raises funding and credit-loss concerns.' },
          { sector: 'Real Estate', direction: 'down', rationale: 'Credit stress tightens refinancing conditions.' },
          { sector: 'Utilities', direction: 'mixed', rationale: 'Defensive demand can offset financing headwinds.' },
        ],
        affectedTickers: [],
        watchItems: ['HY OAS', 'IG spread trend', 'Default cycle indicators'],
        whyItMatters:
          'Credit stress is a key early-warning signal for broader risk-off repricing across equities and rates.',
      };
    case 'geopolitics':
      return {
        bias: 'Risk-Off',
        confidence: 'medium',
        affectedSectors: [
          { sector: 'Energy', direction: 'up', rationale: 'Supply-risk premiums typically rise under geopolitical stress.' },
          { sector: 'Industrials', direction: 'mixed', rationale: 'Trade and logistics risk can pressure margins.' },
          { sector: 'Communication Services', direction: 'mixed', rationale: 'Risk sentiment can dominate fundamentals short term.' },
        ],
        affectedTickers: [],
        watchItems: ['Commodity risk premium', 'Shipping rates', 'Volatility regime'],
        whyItMatters:
          'Geopolitical shocks can move commodity prices, inflation expectations, and global risk premia.',
      };
    case 'equities':
      return {
        bias: 'Neutral',
        confidence: 'low',
        affectedSectors: [
          { sector: 'Technology', direction: 'mixed', rationale: 'Leadership depends on rate and earnings backdrop.' },
          { sector: 'Financials', direction: 'mixed', rationale: 'Performance is tied to yields and credit conditions.' },
          { sector: 'Consumer Discretionary', direction: 'mixed', rationale: 'Demand outlook remains cycle-dependent.' },
        ],
        affectedTickers: [],
        watchItems: ['Breadth', 'Earnings revisions', 'Volatility term structure'],
        whyItMatters:
          'Equity headlines matter most when they signal broader macro regime changes in rates, growth, or liquidity.',
      };
    default:
      return {
        bias: 'Neutral',
        confidence: 'low',
        affectedSectors: [],
        affectedTickers: [],
        watchItems: ['Cross-asset confirmation', 'Policy commentary', 'Macro data follow-through'],
        whyItMatters:
          'Signal quality is low without a clear macro transmission channel.',
      };
  }
}

export function inferEventImpact(params: {
  eventType: RelevanceEventType;
  title: string;
  description: string | null;
}): EventImpact {
  const impact = baseByType(params.eventType);
  const text = `${params.title} ${params.description ?? ''}`;
  const tickers = parseTickers(text);
  if (tickers.length > 0) {
    impact.affectedTickers = tickers.map((ticker) => ({
      ticker,
      direction: biasToDirection(impact.bias),
      rationale: 'Ticker appears in headline context and is likely part of first-order reaction.',
    }));
  }

  if (/\b(cooling|softer|disinflation|cuts)\b/i.test(text)) {
    impact.bias = 'Dovish';
    impact.confidence = impact.confidence === 'low' ? 'medium' : impact.confidence;
  }
  if (/\b(hotter|sticky inflation|higher for longer|surge)\b/i.test(text)) {
    impact.bias = 'Hawkish';
    impact.confidence = impact.confidence === 'low' ? 'medium' : impact.confidence;
  }
  if (/\b(tariff|tariffs|trade war|import duties?|levies)\b/i.test(text)) {
    impact.bias = 'Risk-Off';
    impact.confidence = 'high';
    impact.affectedSectors = [
      { sector: 'Industrials', direction: 'down', rationale: 'Input cost and supply-chain risk can pressure margins.' },
      { sector: 'Consumer Discretionary', direction: 'down', rationale: 'Higher landed costs can reduce demand elasticity.' },
      { sector: 'Consumer Staples', direction: 'mixed', rationale: 'Pricing power may offset part of cost pressure.' },
    ];
    impact.watchItems = ['Import price pass-through', 'Retail margin revisions', 'Trade policy retaliation headlines'];
    impact.whyItMatters =
      'Tariff shocks raise effective input costs and can tighten financial conditions via inflation and growth channels, pressuring equity multiples and earnings expectations.';
  }

  const geoAdjusted = applyMexicoAirlineOverlay(impact, text);
  return {
    ...geoAdjusted,
    affectedTickers: dedupeTickers(geoAdjusted.affectedTickers),
    affectedSectors: dedupeSectors(geoAdjusted.affectedSectors),
    watchItems: mergeWatchItems([], geoAdjusted.watchItems),
  };
}
