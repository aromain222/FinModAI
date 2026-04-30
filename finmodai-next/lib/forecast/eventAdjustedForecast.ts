import type { MarketEvent, MarketEventType } from '@/lib/news/marketEventsTypes';

export type PriceForecastPayload = {
  ticker: string;
  historical: { dates: string[]; prices: number[] };
  forecast: {
    dates: string[];
    values: number[];
    lower: number[];
    upper: number[];
  } | null;
  model_available: boolean;
  horizon_days: number;
};

export type EventAdjustmentInput = {
  valuationDeltaPct: number;
  direction?: 'positive' | 'negative' | 'mixed';
  magnitude?: 'low' | 'medium' | 'high';
  confidence?: number;
  eventType?: MarketEventType | string | null;
  label?: string | null;
};

export type EventAdjustedForecast = {
  ticker: string;
  horizon_days: number;
  baseline: {
    start_price: number;
    end_price: number;
    return_pct: number;
    source: 'timesfm';
  };
  event_adjustment: {
    label: string | null;
    valuation_delta_pct: number;
    price_proxy_pct: number;
    confidence: number;
    horizon_weight: number;
    event_type_weight: number;
    source: 'event_impact' | 'market_events';
  };
  combined: {
    end_price: number;
    return_pct: number;
    direction: 'up' | 'down' | 'flat';
  };
  series: {
    historical_dates: string[];
    historical_prices: number[];
    dates: string[];
    baseline: number[];
    event_adjusted: number[];
    lower: number[];
    upper: number[];
  };
  caveat: string;
};

const EVENT_TYPE_WEIGHTS: Record<string, number> = {
  EarningsMegaCap: 0.85,
  RegulatoryShock: 0.7,
  SystemicRisk: 0.65,
  Sanctions: 0.6,
  Conflict: 0.55,
  Geopolitics: 0.5,
  CentralBank: 0.45,
  Macro: 0.4,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals = 2): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function confidenceFromMagnitude(magnitude: EventAdjustmentInput['magnitude']): number {
  if (magnitude === 'high') return 0.8;
  if (magnitude === 'medium') return 0.65;
  if (magnitude === 'low') return 0.45;
  return 0.55;
}

function horizonWeight(horizonDays: number): number {
  return clamp(horizonDays / 45, 0.25, 0.85);
}

function eventTypeWeight(eventType: EventAdjustmentInput['eventType']): number {
  return eventType ? EVENT_TYPE_WEIGHTS[String(eventType)] ?? 0.65 : 0.65;
}

export function computeEventPriceProxyPct(
  event: EventAdjustmentInput,
  horizonDays: number,
): {
  priceProxyPct: number;
  confidence: number;
  horizonWeight: number;
  eventTypeWeight: number;
} {
  const confidence = clamp(event.confidence ?? confidenceFromMagnitude(event.magnitude), 0, 1);
  const hWeight = horizonWeight(horizonDays);
  const typeWeight = eventTypeWeight(event.eventType);
  const directionalDelta =
    event.direction === 'negative' && event.valuationDeltaPct > 0
      ? -Math.abs(event.valuationDeltaPct)
      : event.direction === 'positive' && event.valuationDeltaPct < 0
        ? Math.abs(event.valuationDeltaPct)
        : event.valuationDeltaPct;
  return {
    priceProxyPct: round(clamp(directionalDelta * confidence * hWeight * typeWeight, -15, 15), 2),
    confidence,
    horizonWeight: round(hWeight, 3),
    eventTypeWeight: typeWeight,
  };
}

export function buildEventAdjustedForecast(
  priceForecast: PriceForecastPayload,
  event: EventAdjustmentInput,
  source: 'event_impact' | 'market_events' = 'event_impact',
): EventAdjustedForecast | null {
  if (!priceForecast.model_available || !priceForecast.forecast || !priceForecast.historical) return null;

  const startPrice = priceForecast.historical.prices.at(-1);
  const endBaseline = priceForecast.forecast.values.at(-1);
  if (
    typeof startPrice !== 'number' ||
    !Number.isFinite(startPrice) ||
    startPrice <= 0 ||
    typeof endBaseline !== 'number' ||
    !Number.isFinite(endBaseline)
  ) {
    return null;
  }

  const horizonDays = priceForecast.forecast.values.length || priceForecast.horizon_days || 30;
  const proxy = computeEventPriceProxyPct(event, horizonDays);
  const adjusted = priceForecast.forecast.values.map((value, index) => {
    const ramp = (index + 1) / horizonDays;
    return round(value * (1 + (proxy.priceProxyPct / 100) * ramp), 4);
  });
  const endCombined = adjusted.at(-1);
  if (typeof endCombined !== 'number' || !Number.isFinite(endCombined)) return null;

  const baselineReturnPct = ((endBaseline - startPrice) / startPrice) * 100;
  const combinedReturnPct = ((endCombined - startPrice) / startPrice) * 100;

  return {
    ticker: priceForecast.ticker,
    horizon_days: horizonDays,
    baseline: {
      start_price: round(startPrice, 2),
      end_price: round(endBaseline, 2),
      return_pct: round(baselineReturnPct, 2),
      source: 'timesfm',
    },
    event_adjustment: {
      label: event.label ?? null,
      valuation_delta_pct: round(event.valuationDeltaPct, 2),
      price_proxy_pct: proxy.priceProxyPct,
      confidence: round(proxy.confidence, 2),
      horizon_weight: proxy.horizonWeight,
      event_type_weight: proxy.eventTypeWeight,
      source,
    },
    combined: {
      end_price: round(endCombined, 2),
      return_pct: round(combinedReturnPct, 2),
      direction: combinedReturnPct > 1 ? 'up' : combinedReturnPct < -1 ? 'down' : 'flat',
    },
    series: {
      historical_dates: priceForecast.historical.dates,
      historical_prices: priceForecast.historical.prices,
      dates: priceForecast.forecast.dates,
      baseline: priceForecast.forecast.values,
      event_adjusted: adjusted,
      lower: priceForecast.forecast.lower,
      upper: priceForecast.forecast.upper,
    },
    caveat:
      'Event adjustment converts valuation impact into a short-horizon price proxy using confidence, event type, and horizon weights; it is directional, not a precise price target.',
  };
}

function directionFromText(value: string): 1 | -1 | 0 {
  const text = value.toLowerCase();
  if (/\b(upside|rally|bull|positive|support|tailwind|risk-on|higher|recover|benefit)\b/.test(text)) return 1;
  if (/\b(downside|selloff|bear|negative|pressure|headwind|risk-off|lower|fall|weak)\b/.test(text)) return -1;
  return 0;
}

function eventSignalDirection(event: MarketEvent): 1 | -1 | 0 {
  if (event.signal?.position === 'LONG') return 1;
  if (event.signal?.position === 'SHORT') return -1;
  const fields = [
    event.marketImpact.equities,
    event.marketImpact.sectors,
    event.marketImpact.rates,
    ...event.drivers,
    ...event.transmissionPath,
  ]
    .filter((item): item is string => Boolean(item))
    .join(' ');
  return directionFromText(fields);
}

export function deriveMarketEventAdjustment(events: MarketEvent[], ticker: string): EventAdjustmentInput | null {
  const relevant = events
    .map((event) => {
      const direction = eventSignalDirection(event);
      const confidence = event.signal?.conviction ?? clamp(event.severity / 100, 0.25, 0.8);
      const mentioned =
        event.title.toUpperCase().includes(ticker.toUpperCase()) ||
        event.drivers.some((driver) => driver.toUpperCase().includes(ticker.toUpperCase())) ||
        event.transmissionPath.some((step) => step.toUpperCase().includes(ticker.toUpperCase()));
      const relevance = mentioned ? 1 : event.eventType === 'EarningsMegaCap' ? 0.8 : 0.55;
      return { event, direction, confidence, relevance };
    })
    .filter((item) => item.direction !== 0)
    .slice(0, 3);

  if (relevant.length === 0) return null;

  const weightedDelta = relevant.reduce((sum, item) => {
    const severityPct = clamp(item.event.severity / 100, 0, 1);
    const eventMove = clamp(severityPct * item.confidence * item.relevance * 8, 0.5, 8);
    return sum + item.direction * eventMove;
  }, 0);
  const top = relevant[0];

  return {
    valuationDeltaPct: round(clamp(weightedDelta, -12, 12), 2),
    direction: weightedDelta > 0.25 ? 'positive' : weightedDelta < -0.25 ? 'negative' : 'mixed',
    magnitude: Math.abs(weightedDelta) >= 6 ? 'high' : Math.abs(weightedDelta) >= 2.5 ? 'medium' : 'low',
    confidence: round(clamp(top.confidence, 0.25, 0.85), 2),
    eventType: top.event.eventType,
    label: top.event.title,
  };
}
