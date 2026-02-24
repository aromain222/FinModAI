import assert from 'node:assert/strict';

import {
  assessReverseDcfDemoReadiness,
  computeReverseDcfValuation,
  parseReverseDcfInputs,
  solveReverseDcfImpliedGrowth,
} from '../lib/models/dcf/reverse.ts';

const parsed = parseReverseDcfInputs({
  waccPct: '10.0',
  terminalGrowthPct: '2.5',
  projectionYears: '5',
});
assert.ok(parsed, 'Reverse DCF inputs should parse from string form.');
assert.equal(parsed?.projectionYears, 5, 'Projection years should parse as number.');

const controlContext = {
  ticker: 'DEMO',
  revenue: 1200,
  ebitdaMargin: 0.25,
  taxRate: 0.25,
  capexPctRevenue: 0.04,
  nwcPctRevenue: 0.02,
  netDebt: 300,
  sharesOutstanding: 100,
  inputs: {
    wacc: 0.1,
    terminalGrowth: 0.025,
    projectionYears: 5,
    targetPrice: 20,
  },
} as const;
const controlBefore = computeReverseDcfValuation(controlContext, 0.08);

const successResult = solveReverseDcfImpliedGrowth({
  ticker: 'DEMO',
  revenue: 1200,
  ebitdaMargin: 0.25,
  taxRate: 0.25,
  capexPctRevenue: 0.04,
  nwcPctRevenue: 0.02,
  netDebt: 300,
  sharesOutstanding: 100,
  inputs: {
    wacc: 0.1,
    terminalGrowth: 0.025,
    projectionYears: 5,
    targetPrice: 20,
  },
});
assert.equal(successResult.converged, true, 'Reverse DCF should converge for realistic target price.');
assert.ok(
  Math.abs(successResult.valuation.pricePerShare - 20) < 0.1,
  `Solved price should be close to target; got ${successResult.valuation.pricePerShare.toFixed(4)}.`
);

const readinessMissing = assessReverseDcfDemoReadiness({
  marketPrice: null,
  sharesOutstanding: null,
  revenue: 1200,
});
assert.equal(readinessMissing.ready, false, 'Readiness should fail when demo market price/shares are missing.');
assert.ok(
  readinessMissing.missing.includes('market_price') &&
    readinessMissing.missing.includes('shares_outstanding'),
  'Readiness should identify missing market price and shares.'
);

const failResult = solveReverseDcfImpliedGrowth(
  {
    ticker: 'DEMO',
    revenue: 1200,
    ebitdaMargin: 0.25,
    taxRate: 0.25,
    capexPctRevenue: 0.04,
    nwcPctRevenue: 0.02,
    netDebt: 300,
    sharesOutstanding: 100,
    inputs: {
      wacc: 0.1,
      terminalGrowth: 0.025,
      projectionYears: 5,
      targetPrice: 10000,
    },
  },
  {
    initialLowGrowth: -0.1,
    initialHighGrowth: 0.2,
    maxIterations: 20,
  }
);
assert.equal(failResult.converged, false, 'Reverse DCF should report non-convergence for extreme target.');
assert.equal(failResult.reason, 'target_out_of_bounds', 'Failure should report out-of-bounds target.');

const controlAfter = computeReverseDcfValuation(controlContext, 0.08);
assert.equal(
  controlBefore.pricePerShare,
  controlAfter.pricePerShare,
  'Baseline DCF valuation math should remain unchanged by reverse DCF solve flow.'
);

console.log('reverse DCF tests passed');
