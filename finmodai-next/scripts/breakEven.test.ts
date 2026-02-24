import assert from 'node:assert/strict';

import { runLboModel } from '../lib/lboEngine.ts';
import { computeReverseDcfValuation } from '../lib/models/dcf/reverse.ts';
import { solveDcfBreakEven, solveLboBreakEven } from '../lib/models/breakEven.ts';

const dcfInputs = {
  ticker: 'DEMO',
  targetPrice: 20,
  solveFor: 'revenueGrowth' as const,
  revenue: 1200,
  revenueGrowth: 0.08,
  ebitdaMargin: 0.25,
  taxRate: 0.25,
  capexPctRevenue: 0.04,
  nwcPctRevenue: 0.02,
  netDebt: 300,
  sharesOutstanding: 100,
  wacc: 0.1,
  terminalGrowth: 0.025,
  projectionYears: 5,
  marketPrice: 20,
};

const dcfBaselineContext = {
  ticker: dcfInputs.ticker,
  revenue: dcfInputs.revenue,
  ebitdaMargin: dcfInputs.ebitdaMargin,
  taxRate: dcfInputs.taxRate,
  capexPctRevenue: dcfInputs.capexPctRevenue,
  nwcPctRevenue: dcfInputs.nwcPctRevenue,
  netDebt: dcfInputs.netDebt,
  sharesOutstanding: dcfInputs.sharesOutstanding,
  inputs: {
    wacc: dcfInputs.wacc,
    terminalGrowth: dcfInputs.terminalGrowth,
    projectionYears: dcfInputs.projectionYears,
    targetPrice: dcfInputs.targetPrice,
  },
} as const;
const baselineDcfValue = computeReverseDcfValuation(dcfBaselineContext, dcfInputs.revenueGrowth).pricePerShare;
const solvedDcf = solveDcfBreakEven(dcfInputs);
assert.equal(solvedDcf.converged, true, 'DCF break-even should converge for a realistic target.');
assert.ok(
  solvedDcf.achievedValue !== null && Math.abs((solvedDcf.achievedValue as number) - dcfInputs.targetPrice) < 0.1,
  'Solved DCF value/share should be close to target.'
);

const lboBaseInputs = {
  ticker: 'DEMO',
  companyName: 'Demo Co',
  revenue: 1200,
  ebitda: 300,
  netDebt: 200,
  entryMultiple: 10,
  exitMultiple: 10,
  transactionFeesPercent: 0.015,
  exitFeesPercent: 0.01,
  debtPercent: 0.6,
  equityPercent: 0.4,
  interestRate: 0.07,
  amortizationPercent: 0.05,
  cashSweepPercent: 1.0,
  revenueGrowth: 0.05,
  ebitdaMargin: 0.25,
  capexPctRevenue: 0.04,
  deltaNwcPctRevenue: 0.02,
  taxRate: 0.25,
  holdingPeriodYears: 5,
  minimumCashBalance: 0,
} as const;
const lboBaseOutput = runLboModel({ ...lboBaseInputs });
const solvedLbo = solveLboBreakEven({
  ticker: 'DEMO',
  targetIrr: lboBaseOutput.returns.irr + 0.01,
  solveFor: 'exitMultiple',
  lboInputs: { ...lboBaseInputs },
});
assert.equal(solvedLbo.converged, true, 'LBO break-even should converge for a nearby target IRR.');
assert.ok(
  solvedLbo.achievedValue !== null &&
    Math.abs((solvedLbo.achievedValue as number) - (lboBaseOutput.returns.irr + 0.01)) < 0.01,
  'Solved LBO IRR should be close to target.'
);

const nonConverged = solveDcfBreakEven({
  ...dcfInputs,
  targetPrice: 10000,
});
assert.equal(nonConverged.converged, false, 'DCF break-even should report non-convergence for extreme target.');
assert.equal(nonConverged.reason, 'target_out_of_bounds', 'Non-convergence should indicate out-of-bounds target.');

let invalidTargetError = '';
try {
  solveDcfBreakEven({
    ...dcfInputs,
    targetPrice: 0,
  });
} catch (err: any) {
  invalidTargetError = err?.message || '';
}
assert.ok(invalidTargetError.includes('targetPrice'), 'Invalid target input should throw a clear DCF error.');

const dcfPostSolveValue = computeReverseDcfValuation(dcfBaselineContext, dcfInputs.revenueGrowth).pricePerShare;
assert.equal(baselineDcfValue, dcfPostSolveValue, 'Baseline DCF valuation should remain unchanged after solving.');

const lboPostSolveOutput = runLboModel({ ...lboBaseInputs });
assert.equal(
  lboBaseOutput.returns.irr,
  lboPostSolveOutput.returns.irr,
  'Baseline LBO IRR should remain unchanged after break-even solve.'
);
assert.equal(
  lboBaseOutput.returns.moic,
  lboPostSolveOutput.returns.moic,
  'Baseline LBO MOIC should remain unchanged after break-even solve.'
);

console.log('break-even tests passed');
