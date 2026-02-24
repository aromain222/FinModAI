import assert from 'node:assert/strict';

import { runLboModel } from '../lib/lboEngine.ts';
import { computeReverseDcfValuation } from '../lib/models/dcf/reverse.ts';
import {
  buildDcfSensitivityTable,
  buildLboSensitivityTable,
  parseDcfSensitivityConfig,
  parseLboSensitivityConfig,
} from '../lib/models/sensitivity.ts';

const dcfSolveContext = {
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
const dcfGrowthAssumption = 0.08;
const dcfBefore = computeReverseDcfValuation(dcfSolveContext, dcfGrowthAssumption).pricePerShare;
const dcfBaseSnapshot = JSON.stringify(dcfSolveContext);

const dcfTable = buildDcfSensitivityTable(
  {
    wacc: dcfSolveContext.inputs.wacc,
    terminalGrowth: dcfSolveContext.inputs.terminalGrowth,
    basePricePerShare: dcfBefore,
    evaluatePrice: ({ wacc, terminalGrowth }) =>
      computeReverseDcfValuation(
        {
          ...dcfSolveContext,
          inputs: {
            ...dcfSolveContext.inputs,
            wacc,
            terminalGrowth,
          },
        },
        dcfGrowthAssumption
      ).pricePerShare,
  },
  {
  waccRangePct: 2.0,
  waccStepPct: 0.5,
  terminalGrowthRangePct: 1.0,
  terminalGrowthStepPct: 0.25,
  }
);

assert.equal(dcfTable.rows.length, 9, 'DCF sensitivity should have 9 WACC rows with +/-2.0% and 0.5% step.');
assert.equal(
  dcfTable.cols.length,
  9,
  'DCF sensitivity should have 9 terminal-growth columns with +/-1.0% and 0.25% step.'
);
assert.ok(
  dcfTable.values.every((row) => row.length === dcfTable.cols.length),
  'DCF sensitivity grid should have consistent row widths.'
);
const dcfNumericCell = dcfTable.values.flat().find((value) => typeof value === 'number');
assert.ok(typeof dcfNumericCell === 'number', 'DCF sensitivity should return numeric price/share cells.');

const dcfAfter = computeReverseDcfValuation(dcfSolveContext, dcfGrowthAssumption).pricePerShare;
assert.equal(dcfBefore, dcfAfter, 'Base DCF valuation should remain unchanged after sensitivity build.');
assert.equal(
  JSON.stringify(dcfSolveContext),
  dcfBaseSnapshot,
  'DCF solve context must not be mutated by sensitivity generation.'
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
const lboBefore = runLboModel({ ...lboBaseInputs });
const lboBaseSnapshot = JSON.stringify(lboBaseInputs);

const lboTable = buildLboSensitivityTable({ ...lboBaseInputs }, {
  entryRange: 2.0,
  entryStep: 0.5,
  exitRange: 2.0,
  exitStep: 0.5,
});

assert.equal(lboTable.rows.length, 9, 'LBO sensitivity should have 9 entry-multiple rows.');
assert.equal(lboTable.cols.length, 9, 'LBO sensitivity should have 9 exit-multiple columns.');
assert.ok(
  lboTable.irr.every((row) => row.length === lboTable.cols.length),
  'LBO IRR grid should have consistent row widths.'
);
assert.ok(
  lboTable.moic.every((row) => row.length === lboTable.cols.length),
  'LBO MOIC grid should have consistent row widths.'
);
const lboNumericCell = lboTable.irr.flat().find((value) => typeof value === 'number');
assert.ok(typeof lboNumericCell === 'number', 'LBO sensitivity should return numeric IRR cells.');

const lboAfter = runLboModel({ ...lboBaseInputs });
assert.equal(lboBefore.returns.irr, lboAfter.returns.irr, 'Base LBO IRR should remain unchanged.');
assert.equal(lboBefore.returns.moic, lboAfter.returns.moic, 'Base LBO MOIC should remain unchanged.');
assert.equal(
  JSON.stringify(lboBaseInputs),
  lboBaseSnapshot,
  'LBO base inputs must not be mutated by sensitivity generation.'
);

const invalidDcf = parseDcfSensitivityConfig({
  waccRangePct: 2,
  waccStepPct: 0,
  terminalGrowthRangePct: 1,
  terminalGrowthStepPct: 0.25,
});
assert.equal(invalidDcf.ok, false, 'Invalid DCF range/step inputs should fail validation.');

const invalidLbo = parseLboSensitivityConfig({
  entryRange: 2,
  entryStep: 0.01,
  exitRange: 2,
  exitStep: 0.01,
});
assert.equal(invalidLbo.ok, false, 'Oversized LBO grids should fail validation.');

console.log('sensitivity tests passed');
