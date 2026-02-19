import assert from 'node:assert/strict';

import { buildRevenueSeries } from '../lib/models/shared/revenueSeries';
import { validateDCFInputs } from '../lib/data/dcfValidation';

const revenueLtm = 227_000; // USD millions (demo MSFT scale)

const series = buildRevenueSeries({
  revenueSeries: [],
  revenueLtm,
  years: 5,
});

assert.equal(series.length, 5, 'Revenue series should be padded to 5 years.');
assert.equal(series[0], revenueLtm, 'Revenue series should use revenueLtm base.');

const validation = validateDCFInputs({
  ticker: 'MSFT',
  revenue: null as any,
  revenueByYear: [],
  revenueLtm,
  demoMode: true,
  wacc: 0.1,
  terminalGrowth: 0.025,
});

assert.ok(validation.isValid, `Demo validation should pass when revenueLtm exists. Errors: ${validation.errors.join(', ')}`);

console.log('demo mode validation tests passed');
