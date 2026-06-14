import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDeterministicNewsSentiment } from '@/lib/pm/monitoring/newsSentiment';

describe('buildDeterministicNewsSentiment', () => {
  it('treats a SpaceX IPO headline as indirect to Tesla', () => {
    const read = buildDeterministicNewsSentiment('TSLA', [
      {
        title: 'Red-hot SpaceX IPO may draw retail buyers',
        description: 'Investors debate the valuation of Elon Musk led SpaceX.',
        source: 'Example',
      },
    ], 'Tesla Inc.');

    assert.equal(read.signal, 'neutral');
    assert.match(read.reasoning, /indirect to Tesla/i);
    assert.match(read.reasoning, /does not change Tesla revenue or EPS/i);
    assert.match(read.watch, /Tesla-SpaceX transaction/i);
  });

  it('identifies a direct estimate-sensitive Tesla headline', () => {
    const read = buildDeterministicNewsSentiment('TSLA', [
      {
        title: 'Tesla raises annual delivery guidance',
        description: 'Tesla expects higher vehicle deliveries and revenue.',
        source: 'Example',
      },
    ], 'Tesla Inc.');

    assert.equal(read.signal, 'bullish');
    assert.ok(read.score > 50);
    assert.match(read.reasoning, /operating estimates or guidance/i);
  });
});
