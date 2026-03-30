import assert from 'node:assert/strict';
import test from 'node:test';

import { formatCompactCurrency } from '@/lib/analyst/dcfFormatting';

test('formatCompactCurrency renders actual-dollar valuation values with compact suffixes', () => {
  assert.equal(formatCompactCurrency(3_487_327_602), '$3.5B');
  assert.equal(formatCompactCurrency(124_300_000_000), '$124B');
  assert.equal(formatCompactCurrency(45_317_000_000), '$45.3B');
  assert.equal(formatCompactCurrency(null), 'n/a');
});
