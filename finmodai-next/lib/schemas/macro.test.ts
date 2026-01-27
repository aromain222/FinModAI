import { describe, it, expect } from 'vitest';
import { MacroEventSchema, MacroSnapshotSchema } from './macro';

describe('macro schemas', () => {
  it('validates MacroEvent', () => {
    const parsed = MacroEventSchema.parse({
      title: 'Inflation cools',
      country: 'US',
      date: new Date().toISOString(),
      impact: 'med',
      sourceUrl: 'https://example.com',
    });
    expect(parsed.country).toBe('US');
  });

  it('validates MacroSnapshot', () => {
    const parsed = MacroSnapshotSchema.parse({
      asOf: new Date().toISOString(),
      inflation: 3.2,
    });
    expect(parsed.inflation).toBe(3.2);
  });
});
