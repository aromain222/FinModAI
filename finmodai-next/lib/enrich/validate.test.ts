import { describe, expect, it } from 'vitest';
import { chooseBestCandidate, normalizeSharesMm } from './validate';

describe('enrich validation', () => {
  it('normalizes shares from raw count to millions', () => {
    const normalized = normalizeSharesMm({
      value: 2_000_000_000,
      source: 'sec',
      confidence: 0.8,
      unit: 'shares',
    });
    expect(normalized.value).toBe(2000);
  });

  it('prefers higher-ranked sources for shares', () => {
    const chosen = chooseBestCandidate(
      [
        { value: 50, source: 'openai', confidence: 0.4, unit: 'millions' },
        { value: 55, source: 'fmp', confidence: 0.7, unit: 'millions' },
      ],
      { kind: 'shares' }
    );
    expect(chosen.source).toBe('fmp');
    expect(chosen.value).toBe(55);
  });

  it('rejects invalid price values', () => {
    const chosen = chooseBestCandidate(
      [
        { value: -1, source: 'polygon', confidence: 0.7, unit: 'usd' },
        { value: 125, source: 'fmp', confidence: 0.6, unit: 'usd' },
      ],
      { kind: 'price' }
    );
    expect(chosen.value).toBe(125);
    expect(chosen.source).toBe('fmp');
  });
});
