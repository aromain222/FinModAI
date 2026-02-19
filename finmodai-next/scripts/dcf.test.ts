import assert from 'node:assert/strict';

import { buildCanonicalFinancials } from '../lib/canonicalFinancials';
import { normalizeDCFInputs, computeDCFSeries } from '../lib/dcfGenerator';
import { AMZN_FIXTURE } from './fixtures/amzn';

const canonical = buildCanonicalFinancials({
  requestBody: { manualInputs: AMZN_FIXTURE },
});

const revenueM = canonical.values.revenue.value ?? 0;
const cashM = canonical.values.cash.value ?? 0;
const debtM = canonical.values.totalDebt.value ?? 0;
const netDebtM = debtM - cashM;
const sharesM = (canonical.values.sharesOutstanding.value ?? 0) / 1_000_000;

const inputs = normalizeDCFInputs({
  ticker: AMZN_FIXTURE.ticker,
  revenue: revenueM,
  revenueGrowth: 0.08,
  ebitdaMargin: 0.22,
  taxRate: 0.21,
  capexPctRevenue: 0.05,
  nwcPctRevenue: 0.02,
  wacc: 0.09,
  terminalGrowth: 0.025,
  projectionYears: 5,
  netDebtMillions: netDebtM,
  sharesOutstandingMillions: sharesM,
});

const results = computeDCFSeries(inputs);

assert.ok(results.enterpriseValue > 100_000, 'Enterprise value should be > $100B (in millions).');
assert.ok(results.enterpriseValue < 10_000_000, 'Enterprise value should be < $10T (in millions).');
assert.ok(results.pricePerShare > 10 && results.pricePerShare < 1_000, 'Price/share should be plausible.');

const pvSum = results.pvExplicitFCF + results.pvTerminalValue;
assert.ok(
  Math.abs(pvSum - results.enterpriseValue) / results.enterpriseValue < 1e-8,
  'PV components should sum to enterprise value within tolerance.'
);

console.log('dcf pipeline tests passed');
