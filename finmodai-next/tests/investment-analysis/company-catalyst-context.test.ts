import assert from 'node:assert/strict';
import test from 'node:test';

import { __private__extractCatalystSentences } from '@/lib/models/shared/companyCatalystContext';
import { buildDocumentFromPreview } from '@/lib/models/schema/fromPreview';

test('extractCatalystSentences keeps transcript lines with actual catalyst language', () => {
  const transcript = [
    'Demand remained strong across AI infrastructure and backlog conversion improved through the quarter.',
    'We are raising full-year margin guidance as pricing and mix continue to improve.',
    'Capex will step up next year as we expand capacity for the next product cycle.',
    'Operator: thank you for joining the call.',
  ].join(' ');

  const highlights = __private__extractCatalystSentences(transcript, 3);

  assert.equal(highlights.length, 3);
  assert.match(highlights[0] ?? '', /demand|guidance|capex/i);
  assert.ok(highlights.every((entry) => entry.length >= 40));
});

test('buildDocumentFromPreview appends company catalyst context section', () => {
  const document = buildDocumentFromPreview(
    {
      sheetName: 'Summary',
      columns: ['Metric', 'Value'],
      rows: [['Revenue', 100]],
    },
    {
      ticker: 'AAPL',
      modelType: 'dcf',
      asOfDate: '2026-03-26',
      currency: 'USD',
      units: 'millions',
      companyCatalystContext: {
        asOf: '2026-03-26',
        summary: 'Next earnings on Apr 30, 2026; capital allocation read: net buyback tailwind.',
        warnings: [],
        calendarItems: [
          {
            kind: 'earnings',
            title: 'Next earnings date',
            date: '2026-04-30',
            displayDate: 'Apr 30, 2026',
            source: 'FMP earnings',
            status: 'reported',
            relevance: 'primary',
          },
        ],
        ownershipItems: [
          {
            key: 'buybackSignal',
            label: 'Buyback / dilution signal',
            value: -0.03,
            displayValue: 'Net buyback tailwind',
            source: 'company_snapshots',
            asOf: '2026-03-14',
            status: 'reported',
            relevance: 'primary',
          },
        ],
        transcriptItems: [
          {
            label: 'Latest transcript catalyst (Q1 2026)',
            excerpt: 'Management raised margin guidance as services mix improved.',
            source: 'FMP earning-call-transcript',
            asOf: '2026-01-30',
            status: 'reported',
            relevance: 'primary',
          },
        ],
      },
    },
  );

  assert.ok(document);
  assert.equal(document?.sections.length, 2);
  assert.equal(document?.sections[1]?.title, 'Company Catalyst Context');
});
