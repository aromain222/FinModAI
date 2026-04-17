import test from 'node:test';
import assert from 'node:assert/strict';

import { extractInputs } from '@/lib/model-generator/extractInputs';
import type { DemoCompanySnapshot } from '@/lib/demo/demoSnapshotStore';

function buildSnapshot(
  ticker: string,
  companyName: string,
  overrides: Partial<DemoCompanySnapshot>
): DemoCompanySnapshot {
  return {
    ticker,
    companyName,
    sector: 'Utilities',
    revenueLtm: 1_000,
    ebitdaLtm: 200,
    cash: 100,
    totalDebt: 500,
    sharesOutstanding: 100,
    sharePrice: 10,
    marketCap: 1_000,
    ...overrides,
  };
}

test('football field widens collapsed peer quartiles into distinct low mid high ranges', async () => {
  const snapshots: Record<string, DemoCompanySnapshot> = {
    ACME: buildSnapshot('ACME', 'Acme Utilities', {}),
    UTL1: buildSnapshot('UTL1', 'Utility One', { marketCap: 1_100, totalDebt: 0, cash: 0, revenueLtm: 100, ebitdaLtm: 50 }),
    UTL2: buildSnapshot('UTL2', 'Utility Two', { marketCap: 2_200, totalDebt: 0, cash: 0, revenueLtm: 200, ebitdaLtm: 100 }),
    UTL3: buildSnapshot('UTL3', 'Utility Three', { marketCap: 3_300, totalDebt: 0, cash: 0, revenueLtm: 300, ebitdaLtm: 150 }),
    UTL4: buildSnapshot('UTL4', 'Utility Four', { marketCap: 4_400, totalDebt: 0, cash: 0, revenueLtm: 400, ebitdaLtm: 200 }),
    UTL5: buildSnapshot('UTL5', 'Utility Five', { marketCap: 5_500, totalDebt: 0, cash: 0, revenueLtm: 500, ebitdaLtm: 250 }),
  };

  const result = await extractInputs('Build a football field for Acme Utilities', 'FOOTBALL_FIELD', {
    demoSnapshotsOverride: snapshots,
  });

  assert.equal(result.extractedInputs.modelType, 'FOOTBALL_FIELD');
  const revenueRange = result.extractedInputs.ranges.find((range) => range.label === 'Trading Comps EV / Revenue');
  assert.ok(revenueRange);
  assert.ok((revenueRange.lowMultiple ?? 0) < (revenueRange.midMultiple ?? 0));
  assert.ok((revenueRange.midMultiple ?? 0) < (revenueRange.highMultiple ?? 0));
  assert.ok((revenueRange.lowValue ?? 0) < (revenueRange.midValue ?? 0));
  assert.ok((revenueRange.midValue ?? 0) < (revenueRange.highValue ?? 0));
  assert.match(revenueRange.commentary, /minimum spread floor applied/i);

  const precedentRange = result.extractedInputs.ranges.find((range) => range.label === 'Precedents EV / EBITDA');
  assert.ok(precedentRange);
  assert.ok((precedentRange.lowValue ?? 0) < (precedentRange.midValue ?? 0));
  assert.ok((precedentRange.midValue ?? 0) < (precedentRange.highValue ?? 0));
});

test('football field preserves naturally dispersed peer quartiles', async () => {
  const snapshots: Record<string, DemoCompanySnapshot> = {
    ACME: buildSnapshot('ACME', 'Acme Utilities', {}),
    UTL1: buildSnapshot('UTL1', 'Utility One', { marketCap: 1_000, totalDebt: 0, cash: 0, revenueLtm: 100, ebitdaLtm: 50 }),
    UTL2: buildSnapshot('UTL2', 'Utility Two', { marketCap: 1_650, totalDebt: 0, cash: 0, revenueLtm: 150, ebitdaLtm: 75 }),
    UTL3: buildSnapshot('UTL3', 'Utility Three', { marketCap: 2_400, totalDebt: 0, cash: 0, revenueLtm: 200, ebitdaLtm: 100 }),
    UTL4: buildSnapshot('UTL4', 'Utility Four', { marketCap: 3_250, totalDebt: 0, cash: 0, revenueLtm: 250, ebitdaLtm: 125 }),
    UTL5: buildSnapshot('UTL5', 'Utility Five', { marketCap: 4_200, totalDebt: 0, cash: 0, revenueLtm: 300, ebitdaLtm: 150 }),
  };

  const result = await extractInputs('Build a football field for Acme Utilities', 'FOOTBALL_FIELD', {
    demoSnapshotsOverride: snapshots,
  });

  assert.equal(result.extractedInputs.modelType, 'FOOTBALL_FIELD');
  const revenueRange = result.extractedInputs.ranges.find((range) => range.label === 'Trading Comps EV / Revenue');
  assert.ok(revenueRange);
  assert.equal(revenueRange.lowMultiple, 11);
  assert.equal(revenueRange.midMultiple, 12);
  assert.equal(revenueRange.highMultiple, 13);
  assert.equal(revenueRange.lowValue, 11_000);
  assert.equal(revenueRange.midValue, 12_000);
  assert.equal(revenueRange.highValue, 13_000);
  assert.doesNotMatch(revenueRange.commentary, /minimum spread floor applied/i);
});
