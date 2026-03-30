import test from 'node:test';
import assert from 'node:assert/strict';

import { formatAnalystModelValue } from '@/components/analyst/AnalystModelCard';

test('attachment-driven DCF values render in finance-native units', () => {
  assert.equal(formatAnalystModelValue(74_525, 'baseRevenue', 'DCF'), '$74.5B');
  assert.equal(formatAnalystModelValue(14_810.356, 'sharesOutstanding', 'DCF'), '14.8B');
  assert.equal(formatAnalystModelValue([0.2, 0.18, 0.14], 'revenueGrowth', 'DCF'), '20%, 18%, 14%');
  assert.equal(formatAnalystModelValue([0.354, 0.359], 'ebitMargin', 'DCF'), '35.4%, 35.9%');
  assert.equal(formatAnalystModelValue(0.06, 'daPctRevenue', 'DCF'), '6%');
  assert.equal(formatAnalystModelValue(0.08, 'capexPctRevenue', 'DCF'), '8%');
  assert.equal(formatAnalystModelValue(0.02, 'nwcPctRevenue', 'DCF'), '2%');
});
