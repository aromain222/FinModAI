import { describe, it, expect } from 'vitest';
import { MarketHeadlineSchema, MarketIndexSeriesSchema } from './market';

describe('market schemas', () => {
  it('validates MarketHeadline', () => {
    const parsed = MarketHeadlineSchema.parse({
      title: 'Fed signals pause',
      source: 'Reuters',
      url: 'https://example.com',
      publishedAt: new Date().toISOString(),
      sentiment: 'neu',
    });
    expect(parsed.title).toBe('Fed signals pause');
  });

  it('validates MarketIndexSeries', () => {
    const parsed = MarketIndexSeriesSchema.parse({
      symbol: 'SPY',
      interval: '1m',
      points: [
        { t: new Date().toISOString(), v: 450.12 },
        { t: new Date().toISOString(), v: 452.34 },
      ],
    });
    expect(parsed.symbol).toBe('SPY');
  });
});
