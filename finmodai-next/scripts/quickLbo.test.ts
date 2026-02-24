import assert from 'node:assert/strict';

import { validateModelInputs } from '../lib/modelInputValidation.ts';
import {
  assessDemoLboReadiness,
  buildQuickLboPayload,
  normalizeQuickLboInputs,
} from '../lib/models/lbo/quick.ts';

const quickRaw = {
  entryMultiple: '10.5',
  debtPercent: '62',
  interestRatePct: '7.5',
  revenueGrowthPct: '6',
  exitMultiple: '11.0',
  holdingPeriodYears: '5',
};

const quickInputs = normalizeQuickLboInputs(quickRaw);
assert.ok(quickInputs, 'Quick LBO inputs should normalize from string form payload.');

const quickValidation = validateModelInputs(
  {
    entryMultiple: quickInputs!.entryMultiple,
    debtPercent: quickInputs!.debtPercent,
    interestRate: quickInputs!.interestRatePct / 100,
    revenueGrowth: quickInputs!.revenueGrowthPct / 100,
    exitMultiple: quickInputs!.exitMultiple,
    holdingPeriodYears: quickInputs!.holdingPeriodYears,
  },
  { quickLbo: true }
);
assert.equal(quickValidation.isValid, true, `Quick LBO validation should pass: ${quickValidation.errors.join(', ')}`);

const quickPayload = buildQuickLboPayload(quickInputs!);
assert.equal(quickPayload.lboOverrides.debtPercent, 0.62, 'Debt % should convert from percent to decimal.');
assert.equal(quickPayload.lboOverrides.equityPercent, 0.38, 'Equity % should be auto-derived from debt %.');
assert.equal(quickPayload.lboOverrides.amortizationPercent, 0.05, 'Amortization default should be 5%.');
assert.ok(quickPayload.appliedDefaults.length >= 6, 'Quick LBO should emit applied defaults metadata.');

const invalidQuickValidation = validateModelInputs(
  {
    entryMultiple: 10,
    debtPercent: 60,
    interestRate: 0.07,
    revenueGrowth: 0.05,
    // exitMultiple missing
    holdingPeriodYears: 5,
  },
  { quickLbo: true }
);
assert.equal(invalidQuickValidation.isValid, false, 'Quick LBO should fail when required quick fields are missing.');
assert.ok(
  (invalidQuickValidation.missingKeys || []).includes('exit_multiple'),
  'Quick LBO missing keys should include exit_multiple.'
);

const notReady = assessDemoLboReadiness({ revenue: 1200, ebitda: 0 });
assert.equal(notReady.ready, false, 'Demo LBO readiness should fail when EBITDA is not positive.');
const notReadyRevenue = assessDemoLboReadiness({ revenue: 0, ebitda: 200 });
assert.equal(notReadyRevenue.ready, false, 'Demo LBO readiness should fail when revenue is not positive.');

const fullValidation = validateModelInputs({
  entryMultiple: 10,
  exitMultiple: 10,
  transactionFeesPercent: 0.015,
  exitFeesPercent: 0.01,
  debtPercent: 60,
  equityPercent: 40,
  interestRate: 0.07,
  amortizationPercent: 0.05,
  cashSweepPercent: 1.0,
  revenueGrowth: 0.05,
  ebitdaMargin: 0.25,
  capexPctRevenue: 0.04,
  deltaNwcPctRevenue: 0.02,
  taxRate: 0.25,
  holdingPeriodYears: 5,
});
assert.equal(fullValidation.isValid, true, `Full LBO validation should remain intact: ${fullValidation.errors.join(', ')}`);

console.log('quick LBO tests passed');
