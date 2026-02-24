import assert from 'node:assert/strict';

import {
  buildDebtCapacityLiteSummary,
  parseDebtCapacityLiteInputs,
  validateDebtCapacityLiteInputs,
} from '../lib/models/debtCapacityLite.ts';

const leverageBindingParsed = parseDebtCapacityLiteInputs({
  maxLeverage: '4.0',
  minInterestCoverage: '2.0',
  interestRatePct: '10.0',
});
assert.ok(leverageBindingParsed, 'Inputs should parse from string payload.');

const leverageBindingValidated = validateDebtCapacityLiteInputs(leverageBindingParsed!);
assert.equal(leverageBindingValidated.ok, true, 'Leverage-binding inputs should validate.');
if (!leverageBindingValidated.ok) {
  throw new Error(leverageBindingValidated.message);
}
const leverageBinding = buildDebtCapacityLiteSummary({
  ebitda: 100,
  currentNetDebt: 150,
  inputs: leverageBindingValidated.value,
});
assert.equal(leverageBinding.bindingConstraint, 'leverage', 'Leverage cap should bind in leverage-binding case.');
assert.equal(leverageBinding.leverageCap, 400, 'Leverage cap should be EBITDA * maxLeverage.');
assert.equal(leverageBinding.coverageCap, 500, 'Coverage cap should be EBITDA / coverage / rate.');
assert.equal(leverageBinding.maxDebt, 400, 'Max debt should choose the lower cap.');

const coverageBindingValidated = validateDebtCapacityLiteInputs({
  maxLeverage: 6,
  minInterestCoverage: 2.5,
  interestRatePct: 10,
});
assert.equal(coverageBindingValidated.ok, true, 'Coverage-binding inputs should validate.');
if (!coverageBindingValidated.ok) {
  throw new Error(coverageBindingValidated.message);
}
const coverageBinding = buildDebtCapacityLiteSummary({
  ebitda: 100,
  currentNetDebt: 150,
  inputs: coverageBindingValidated.value,
});
assert.equal(coverageBinding.bindingConstraint, 'coverage', 'Coverage cap should bind in coverage-binding case.');
assert.equal(coverageBinding.leverageCap, 600, 'Leverage cap should compute correctly.');
assert.equal(coverageBinding.coverageCap, 400, 'Coverage cap should compute correctly.');
assert.equal(coverageBinding.maxDebt, 400, 'Max debt should choose coverage cap when lower.');

let invalidEbitdaThrown = false;
try {
  buildDebtCapacityLiteSummary({
    ebitda: 0,
    inputs: coverageBindingValidated.value,
  });
} catch (error) {
  invalidEbitdaThrown = true;
  assert.ok(
    error instanceof Error && error.message.includes('EBITDA must be positive'),
    'Invalid EBITDA error message should be clear.'
  );
}
assert.equal(invalidEbitdaThrown, true, 'Invalid EBITDA case should throw.');

const invalidInterest = validateDebtCapacityLiteInputs({
  maxLeverage: 5,
  minInterestCoverage: 2,
  interestRatePct: 0,
});
assert.equal(invalidInterest.ok, false, 'Zero interest rate should fail validation.');

const invalidCoverage = validateDebtCapacityLiteInputs({
  maxLeverage: 5,
  minInterestCoverage: 0,
  interestRatePct: 8,
});
assert.equal(invalidCoverage.ok, false, 'Non-positive coverage should fail validation.');

console.log('debt capacity lite tests passed');
