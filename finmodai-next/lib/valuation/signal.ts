import { DEFAULT_BASE_MODEL, runDCF } from '@/lib/finance/dcfEngine';
import type { EventItem, ValuationSignalSummary } from '@/lib/ranking/types';

type BuildValuationSignalInput = {
  ticker?: string;
  forecastReturnPct: number | null;
  events?: EventItem[];
};

type ValuationProfile = {
  baseUpside: number;
  marketGrowth: number;
  description: string;
};

const DEFAULT_PROFILE: ValuationProfile = {
  baseUpside: 0,
  marketGrowth: 8,
  description: 'market expectations look balanced against the available score inputs',
};

const VALUATION_PROFILES: Record<string, ValuationProfile> = {
  SOFI: { baseUpside: 18, marketGrowth: 16, description: 'valuation still depends on loan growth, credit quality, and operating leverage' },
  HOOD: { baseUpside: 10, marketGrowth: 13, description: 'valuation is tied to trading activity, crypto beta, and asset growth' },
  COIN: { baseUpside: 6, marketGrowth: 18, description: 'valuation is highly sensitive to crypto volume and fee-cycle assumptions' },
  PLTR: { baseUpside: -14, marketGrowth: 24, description: 'the market is already underwriting strong AI software adoption' },
  AMD: { baseUpside: 8, marketGrowth: 17, description: 'the stock needs visible AI accelerator traction and data-center share gains' },
  NVDA: { baseUpside: -18, marketGrowth: 28, description: 'expectations already embed durable AI accelerator leadership and high margins' },
  TSLA: { baseUpside: -12, marketGrowth: 20, description: 'valuation depends heavily on autonomy optionality and margin recovery' },
  META: { baseUpside: 7, marketGrowth: 11, description: 'cash-flow strength supports valuation if AI capex stays productive' },
  AMZN: { baseUpside: 9, marketGrowth: 12, description: 'valuation depends on AWS acceleration and retail margin expansion' },
  GOOGL: { baseUpside: 5, marketGrowth: 10, description: 'Search durability and Cloud growth offset antitrust and AI capex risk' },
  MSFT: { baseUpside: -4, marketGrowth: 15, description: 'the market is pricing continued Azure AI and Copilot monetization' },
  AAPL: { baseUpside: -6, marketGrowth: 9, description: 'the market needs services durability and an AI-supported upgrade cycle' },
  UBER: { baseUpside: 12, marketGrowth: 14, description: 'valuation is supported by mobility growth and margin expansion' },
  SHOP: { baseUpside: -8, marketGrowth: 18, description: 'the market is pricing sustained merchant growth and operating leverage' },
  SNOW: { baseUpside: -10, marketGrowth: 22, description: 'valuation needs reaccelerating consumption growth' },
  NFLX: { baseUpside: 3, marketGrowth: 10, description: 'valuation depends on ad-tier monetization and content-cost discipline' },
  ROKU: { baseUpside: 14, marketGrowth: 15, description: 'valuation is levered to ad-market recovery and platform monetization' },
  AFRM: { baseUpside: 16, marketGrowth: 19, description: 'valuation depends on credit quality and GMV growth through the cycle' },
  SQ: { baseUpside: 11, marketGrowth: 12, description: 'valuation needs Cash App and seller ecosystem growth to stabilize' },
  PYPL: { baseUpside: 13, marketGrowth: 7, description: 'valuation is less demanding but needs branded checkout stabilization' },
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function eventValuationTilt(events: EventItem[] = []): number {
  return events.reduce((total, event) => {
    const direction = event.direction ?? event.eventForecast?.direction ?? 'neutral';
    const kind = String(event.kind ?? '').toLowerCase();
    const title = `${event.title ?? ''} ${event.headline ?? ''}`.toLowerCase();
    const touchesValuation =
      /\b(rate|fed|inflation|cpi|pce|antitrust|regulat|margin|capex|cloud|earnings|guidance|multiple)\b/.test(
        `${kind} ${title}`,
      );
    if (!touchesValuation) return total;
    if (direction === 'positive') return total + 1.2;
    if (direction === 'negative') return total - 1.4;
    return total;
  }, 0);
}

export function scoreValuationSignal(signal: ValuationSignalSummary): number {
  const upside = signal.impliedUpside ?? 0;
  if (upside >= 25) return 9;
  if (upside >= 12) return 7.5;
  if (upside >= 5) return 6.2;
  if (upside > -5) return 5;
  if (upside > -12) return 4;
  if (upside > -25) return 2.8;
  return 1.8;
}

export function buildValuationSignal({
  ticker,
  forecastReturnPct,
  events = [],
}: BuildValuationSignalInput): ValuationSignalSummary {
  const profile = ticker ? (VALUATION_PROFILES[ticker.toUpperCase()] ?? DEFAULT_PROFILE) : DEFAULT_PROFILE;
  const forecastGrowth = clamp((forecastReturnPct ?? 0) / 100, -0.25, 0.25);
  const eventTilt = eventValuationTilt(events);
  const baseValue = runDCF(DEFAULT_BASE_MODEL).value;
  const scenarioValue = runDCF({
    ...DEFAULT_BASE_MODEL,
    growth: clamp(DEFAULT_BASE_MODEL.growth + forecastGrowth * 0.35, -0.05, 0.28),
  }).value;

  const dcfMovePct = baseValue > 0 ? ((scenarioValue / baseValue) - 1) * 100 : 0;
  const impliedUpside = round1(clamp(profile.baseUpside + dcfMovePct + eventTilt, -35, 35));
  const impliedGrowth = round1(
    clamp(profile.marketGrowth + Math.max(0, forecastGrowth) * 25, 2, 35),
  );
  const valuationSignal =
    impliedUpside >= 8 ? 'undervalued' : impliedUpside <= -8 ? 'overvalued' : 'fair';
  const directionText =
    valuationSignal === 'undervalued'
      ? 'not fully priced'
      : valuationSignal === 'overvalued'
        ? 'pricing a demanding setup'
        : 'close to fair value';

  return {
    impliedUpside,
    impliedGrowth,
    valuationSignal,
    summary: `DCF-lite implies ${impliedUpside >= 0 ? '+' : ''}${impliedUpside.toFixed(
      1,
    )}% upside/downside; reverse DCF suggests the market needs roughly ${impliedGrowth.toFixed(
      1,
    )}% growth. ${profile.description}; stock looks ${directionText}.`,
  };
}
