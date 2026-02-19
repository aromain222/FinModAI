import assert from 'node:assert/strict';

import { coerceToMillions, rescaleSeriesToCanonical } from '../lib/models/shared/unitNormalization';

// Rescale actual-dollar series to millions.
{
  const series = [632_500_000_000, 680_000_000_000];
  const rescaled = rescaleSeriesToCanonical(series, 632_500);
  assert.equal(rescaled.applied, true);
  assert.ok(Math.abs((rescaled.series[0] ?? 0) - 632_500) < 1e-6);
  assert.ok(Math.abs((rescaled.series[1] ?? 0) - 680_000) < 1e-6);
}

// Leave already-millions series unchanged.
{
  const series = [632_500, 680_000];
  const rescaled = rescaleSeriesToCanonical(series, 632_500);
  assert.equal(rescaled.applied, false);
  assert.ok(Math.abs((rescaled.series[0] ?? 0) - 632_500) < 1e-6);
  assert.ok(Math.abs((rescaled.series[1] ?? 0) - 680_000) < 1e-6);
}

// Coerce with explicit unit hint.
{
  const value = coerceToMillions(632_500, { unitHint: 'millions' });
  assert.equal(value, 632_500);
}

// Coerce using reference (actual dollars -> millions).
{
  const value = coerceToMillions(632_500_000_000, { referenceMillions: 632_500 });
  assert.ok(Math.abs((value ?? 0) - 632_500) < 1e-6);
}

console.log('unitNormalization tests passed');
