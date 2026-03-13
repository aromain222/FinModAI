import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeterministicAssumptions, parseDcfPrompt } from './dcfDemo';

test('parseDcfPrompt extracts years and explicit valuation overrides', () => {
  const parsed = parseDcfPrompt('Build a 5-year DCF model for Google with 9% WACC and 3% terminal growth');

  assert.equal(parsed.years, 5);
  assert.equal(parsed.impliedTicker, 'GOOGL');
  assert.equal(parsed.overrides.wacc, 0.09);
  assert.equal(parsed.overrides.terminalGrowth, 0.03);
});

test('buildDeterministicAssumptions returns bounded arrays sized to the forecast horizon', () => {
  const assumptions = buildDeterministicAssumptions(
    {
      ticker: 'GOOGL',
      companyName: 'Alphabet Inc.',
      sector: 'Communication Services',
      revenueLtm: 350000,
      ebitdaLtm: 120000,
      netIncomeLtm: 90000,
      cash: 100000,
      totalDebt: 25000,
      sharesOutstanding: 12000,
      sharePrice: 180,
      marketCap: 2160000,
      updatedAt: '2026-03-07',
    },
    parseDcfPrompt('Build a 5-year DCF model for Google')
  );

  assert.equal(assumptions.revenueGrowth.length, 5);
  assert.equal(assumptions.ebitMargin.length, 5);
  assert.ok(assumptions.revenueGrowth[0] > assumptions.revenueGrowth[4]);
  assert.ok(assumptions.wacc >= 0.06 && assumptions.wacc <= 0.16);
  assert.ok(assumptions.terminalGrowth >= 0.01 && assumptions.terminalGrowth <= 0.04);
});
