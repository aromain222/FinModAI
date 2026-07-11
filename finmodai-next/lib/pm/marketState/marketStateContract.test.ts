import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMarketStateForPrompt, isMarketStatePacket, type MarketStateMetric, type MarketStatePacket } from '@/lib/pm/marketState/marketStateContract';

const metric = (value: number | null, unit: string): MarketStateMetric => ({ value, unit, source: 'test', asOf: '2026-07-10' });

const packet: MarketStatePacket = {
  version: 1,
  builtAt: '2026-07-10T12:00:00.000Z',
  asOf: '2026-07-10',
  regime: 'risk_on',
  regimeConfidence: 76,
  indices: [
    { symbol: 'SPY', return1mPct: 3.2, source: 'test', asOf: '2026-07-10' },
    { symbol: 'QQQ', return1mPct: 4.1, source: 'test', asOf: '2026-07-10' },
  ],
  tape: {
    spyPrice: metric(620, 'USD'), spyChangePct: metric(0.8, '%'), vix: metric(15, 'index'),
    us2y: metric(3.8, '%'), us10y: metric(4.1, '%'), curve2s10sBps: metric(30, 'bps'),
    dxy: metric(98, 'index'), wti: metric(72, 'USD'), gold: metric(2600, 'USD'),
  },
  breadth: { risingCount: 320, fallingCount: 180, netPct: 28 },
  sectors: [{ name: 'Technology', changePct: 1.2 }],
  quality: { provider: 'live', fallback: false, coveragePct: 100, missing: [], warnings: [] },
};

test('validates and formats sourced market state', () => {
  assert.equal(isMarketStatePacket(packet), true);
  const prompt = formatMarketStateForPrompt(packet);
  assert.match(prompt, /Regime: risk_on \(76\/100 confidence\)/);
  assert.match(prompt, /320 rising \/ 180 falling/);
  assert.match(prompt, /Technology \+1.2%/);
});
