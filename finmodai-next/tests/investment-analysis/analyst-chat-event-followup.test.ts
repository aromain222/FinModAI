import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import {
  buildEventContextFromPrompt,
  looksLikeEventLinkedModelFollowUp,
} from '@/lib/analyst/eventFollowUp';

test('event follow-up detector catches pasted macro links that ask about model impact', () => {
  assert.equal(
    looksLikeEventLinkedModelFollowUp(
      'https://www.imf.org/en/Publications/WEO/Issues/2026/04/14/world-economic-outlook-april-2026 how does this affect a dcf model of palantir',
    ),
    true,
  );

  assert.equal(
    looksLikeEventLinkedModelFollowUp('Build me a DCF model for Palantir.'),
    false,
  );
});

test('event follow-up context builder enriches pasted URLs with article context', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    new Response(
      `
        <html>
          <head>
            <title>World Economic Outlook April 2026</title>
            <meta name="description" content="The IMF cuts global growth expectations and warns on weaker investment demand." />
          </head>
          <body>
            <article>
              <p>The IMF lowered its growth outlook and warned that uncertainty is weighing on corporate investment.</p>
              <p>Higher macro uncertainty and softer demand expectations are likely to pressure long-duration valuations.</p>
            </article>
          </body>
        </html>
      `,
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    ),
  );

  try {
    const context = await buildEventContextFromPrompt(
      'https://www.imf.org/en/Publications/WEO/Issues/2026/04/14/world-economic-outlook-april-2026 how does this affect a dcf model of palantir',
    );

    assert.equal(context.sourceType, 'pasted_text');
    assert.equal(context.sourceUrl?.includes('imf.org'), true);
    assert.equal(context.sourceLabel, 'imf.org');
    assert.match(context.rawEventText, /World Economic Outlook April 2026/i);
    assert.match(context.rawEventText, /IMF lowered its growth outlook/i);
    assert.match(context.rawEventText, /how does this affect a dcf model of palantir/i);
  } finally {
    fetchMock.mock.restore();
  }
});
