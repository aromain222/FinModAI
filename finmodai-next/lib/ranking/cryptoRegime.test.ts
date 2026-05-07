import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCryptoRegimeToBreakdown,
  buildCryptoMarketRegime,
  isCryptoSensitiveTicker,
} from './cryptoRegime';
import type { ScoreBreakdown } from './types';

const BASE_BREAKDOWN: ScoreBreakdown = {
  forecastSignal:   5.0,
  catalystStrength: 5.0,
  momentum:         5.0,
  earningsSetup:    5.0,
  valuationSignal:  5.0,
  riskAdjustment:   5.0,
};

function linearSeries(start: number, step: number, length = 35): number[] {
  return Array.from({ length }, (_, index) => start + step * index);
}

test('isCryptoSensitiveTicker identifies crypto-linked equities', () => {
  assert.equal(isCryptoSensitiveTicker('COIN'), true);
  assert.equal(isCryptoSensitiveTicker('hood'), true);
  assert.equal(isCryptoSensitiveTicker('GOOGL'), false);
});

test('buildCryptoMarketRegime classifies clean BTC/ETH uptrends as risk-on', () => {
  const regime = buildCryptoMarketRegime({
    btcCloses: linearSeries(100, 1.2),
    ethCloses: linearSeries(100, 2.4),
    asOf: '2026-05-07T00:00:00.000Z',
  });

  assert.ok(regime);
  assert.equal(regime.regime, 'risk-on');
  assert.equal(regime.leader, 'ETH');
  assert.equal(regime.source, 'binance');
  assert.match(regime.pmRead, /Crypto tape is confirming crypto beta/);
});

test('buildCryptoMarketRegime classifies sharp downtrends as risk-off', () => {
  const regime = buildCryptoMarketRegime({
    btcCloses: linearSeries(150, -1.3),
    ethCloses: linearSeries(150, -1.6),
  });

  assert.ok(regime);
  assert.equal(regime.regime, 'risk-off');
});

test('applyCryptoRegimeToBreakdown boosts crypto-linked score factors in risk-on tape', () => {
  const regime = buildCryptoMarketRegime({
    btcCloses: linearSeries(100, 1.2),
    ethCloses: linearSeries(100, 1.6),
  });

  const updated = applyCryptoRegimeToBreakdown(BASE_BREAKDOWN, regime);

  assert.ok(updated.forecastSignal > BASE_BREAKDOWN.forecastSignal);
  assert.ok(updated.catalystStrength > BASE_BREAKDOWN.catalystStrength);
  assert.ok(updated.momentum > BASE_BREAKDOWN.momentum);
  assert.ok(updated.riskAdjustment >= BASE_BREAKDOWN.riskAdjustment);
  assert.equal(updated.earningsSetup, BASE_BREAKDOWN.earningsSetup);
  assert.equal(updated.valuationSignal, BASE_BREAKDOWN.valuationSignal);
});

test('applyCryptoRegimeToBreakdown penalizes risk in risk-off tape', () => {
  const regime = buildCryptoMarketRegime({
    btcCloses: linearSeries(150, -1.3),
    ethCloses: linearSeries(150, -1.6),
  });

  const updated = applyCryptoRegimeToBreakdown(BASE_BREAKDOWN, regime);

  assert.ok(updated.forecastSignal < BASE_BREAKDOWN.forecastSignal);
  assert.ok(updated.catalystStrength < BASE_BREAKDOWN.catalystStrength);
  assert.ok(updated.momentum < BASE_BREAKDOWN.momentum);
  assert.ok(updated.riskAdjustment < BASE_BREAKDOWN.riskAdjustment);
});
