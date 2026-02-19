import assert from 'node:assert/strict';

import { buildCanonicalFinancials } from '../lib/canonicalFinancials';
import { rescaleSeriesToCanonical } from '../lib/models/shared/unitNormalization';
import { AMZN_FIXTURE } from './fixtures/amzn';

const canonical = buildCanonicalFinancials({
  requestBody: { manualInputs: AMZN_FIXTURE },
});

const revenueM = canonical.values.revenue.value;
const netIncomeM = canonical.values.netIncome.value;
const shares = canonical.values.sharesOutstanding.value;

assert.ok(revenueM && revenueM > 1_000, 'Revenue should be > $1B (in millions).');
assert.ok(netIncomeM && netIncomeM > 1_000, 'Net income should be > $1B (in millions).');
assert.ok(shares && shares > 1_000_000, 'Shares outstanding should be actual share count.');

// Simulate common-size/normalized revenue series (buggy decimals) and rescale to canonical units.
const normalizedRevenueSeries = [0.6325, 0.6831, 0.730917, 0.774772, 0.813511];
const rescaled = rescaleSeriesToCanonical(normalizedRevenueSeries, revenueM ?? null);

assert.equal(rescaled.applied, true, 'Expected normalized series to rescale to canonical units.');
assert.ok((rescaled.series[0] ?? 0) > 1_000, 'Rescaled revenue should be > $1B (in millions).');
assert.ok(
  Math.abs((rescaled.series[0] ?? 0) - (revenueM ?? 0)) < 1e-6,
  'Rescaled revenue should match canonical base.'
);

console.log('threeStatement unit tests passed');
