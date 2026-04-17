import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMarketEventModelCreateHref,
  buildMarketEventPrefillText,
} from '@/lib/model-events/marketEventPrefill';
import type { MarketEvent } from '@/lib/news/marketEventsTypes';

const sampleEvent: MarketEvent = {
  id: 'oil-shock-1',
  title: 'Oil supply disruption raises inflation risks',
  eventType: 'Macro',
  severity: 82,
  horizon: 'NearTerm',
  drivers: [
    'Oil supply disruption is raising inflation concerns across energy-sensitive sectors',
    'Higher fuel input costs are pressuring transport and consumer cyclicals',
  ],
  marketImpact: {
    equities: 'Cyclicals underperform while energy outperforms.',
    oil: 'Crude prices move higher.',
  },
  transmissionPath: [
    'Higher crude prices lift inflation expectations',
    'Higher inflation keeps policy tighter for longer',
  ],
  watchNext: ['Watch OPEC commentary'],
  status: 'developing',
  firstSeenAt: '2026-04-17T12:00:00.000Z',
  lastUpdatedAt: '2026-04-17T13:00:00.000Z',
  sources: [
    {
      name: 'Reuters',
      url: 'https://example.com/oil-shock',
      publishedAt: '2026-04-17T12:30:00.000Z',
      title: 'Oil shock',
    },
  ],
};

test('market event prefill text prioritizes drivers and transmission path', () => {
  const text = buildMarketEventPrefillText(sampleEvent);
  assert.match(text, /Oil supply disruption is raising inflation concerns/i);
  assert.match(text, /Key drivers:/i);
  assert.match(text, /Transmission path:/i);
  assert.doesNotMatch(text, /sources|severity|status/i);
});

test('market event model-create href reuses the existing event-prefill contract', () => {
  const href = buildMarketEventModelCreateHref(sampleEvent);
  const url = new URL(href, 'http://localhost');

  assert.equal(url.pathname, '/models/create');
  assert.equal(url.searchParams.get('eventSourceType'), 'feed_item');
  assert.equal(url.searchParams.get('eventId'), sampleEvent.id);
  assert.equal(url.searchParams.get('eventTitle'), sampleEvent.title);
  assert.equal(url.searchParams.get('eventUrl'), sampleEvent.sources[0]?.url);
  assert.equal(url.searchParams.get('eventSource'), sampleEvent.sources[0]?.name);
  assert.equal(url.searchParams.get('eventPublishedAt'), sampleEvent.sources[0]?.publishedAt);
  assert.match(String(url.searchParams.get('eventText')), /Transmission path:/i);
});
