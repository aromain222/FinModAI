import { DEFAULT_BASE_MODEL, runDCF } from '@/lib/finance/dcfEngine';
import type { EventItem, ValuationSignalSummary } from '@/lib/ranking/types';

type BuildValuationSignalInput = {
  forecastReturnPct: number | null;
  events?: EventItem[];
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
  forecastReturnPct,
  events = [],
}: BuildValuationSignalInput): ValuationSignalSummary {
  const forecastGrowth = clamp((forecastReturnPct ?? 0) / 100, -0.25, 0.25);
  const eventTilt = eventValuationTilt(events);
  const baseValue = runDCF(DEFAULT_BASE_MODEL).value;
  const scenarioValue = runDCF({
    ...DEFAULT_BASE_MODEL,
    growth: clamp(DEFAULT_BASE_MODEL.growth + forecastGrowth * 0.35, -0.05, 0.28),
  }).value;

  const dcfMovePct = baseValue > 0 ? ((scenarioValue / baseValue) - 1) * 100 : 0;
  const impliedUpside = round1(clamp(dcfMovePct + eventTilt, -35, 35));
  const impliedGrowth = round1(
    clamp((DEFAULT_BASE_MODEL.growth + Math.max(0, forecastGrowth) * 0.45) * 100, 2, 35),
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
    )}% growth. Stock looks ${directionText}.`,
  };
}
