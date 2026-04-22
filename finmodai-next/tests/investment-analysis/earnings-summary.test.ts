import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDeterministicEarningsSummaryCard,
  buildDeterministicEarningsSummaryReply,
  isGenericEarningsSummaryPrompt,
} from '@/lib/analyst/earningsSummary';

test('generic earnings summary prompt detector catches simple company earnings asks', () => {
  assert.equal(isGenericEarningsSummaryPrompt("Tell me about Amazon's earnings"), true);
  assert.equal(isGenericEarningsSummaryPrompt('Walk me through Nvidia earnings'), true);
  assert.equal(isGenericEarningsSummaryPrompt('What is Amazon latest revenue?'), false);
});

test('deterministic earnings summary reply includes latest quarter metrics and next date', () => {
  const reply = buildDeterministicEarningsSummaryReply({
    result: {
      ticker: 'AMZN',
      companyName: 'Amazon.com, Inc.',
      quarter: {
        fiscalPeriod: 'Q4',
        reportEndDate: '2025-12-31',
        filedAt: '2026-02-05',
        revenue: 213_400,
        operatingIncome: 25_000,
        netIncome: 21_200,
        eps: 1.68,
        source: 'fmp_latest_quarter',
        reportUrl: 'https://ir.aboutamazon.com/example',
      },
      annual: {
        reportEndDate: '2025-12-31',
        revenue: 716_924,
        ebitda: 165_341,
        netIncome: 59_248,
        source: 'sec_edgar_annual',
      },
      commentary: {
        highlights: ['AWS margins improved year over year.', 'Advertising remained strong.'],
        sourceNotes: ['FMP earnings release summary Q4 2025', 'FMP earnings transcript Q4 2025'],
      },
      dataQuality: {
        usedCachedPackage: true,
        usedEarningsRelease: true,
        usedTranscript: true,
        usedFinancials: true,
        usedFallback: false,
        gaps: [],
      },
    },
    nextEarnings: {
      displayDate: 'Apr 29, 2026',
      source: 'FMP earnings',
      note: null,
    },
  });

  assert.match(reply, /Amazon\.com, Inc\. \(AMZN\) last reported Q4 2025/i);
  assert.match(reply, /revenue was \$213,400M/i);
  assert.match(reply, /operating income was \$25,000M/i);
  assert.match(reply, /The next scheduled earnings date is Apr 29, 2026/i);
  assert.match(reply, /AWS margins improved year over year/i);
});

test('deterministic earnings summary card returns compact structured metrics', () => {
  const card = buildDeterministicEarningsSummaryCard({
    result: {
      ticker: 'AMZN',
      companyName: 'Amazon.com, Inc.',
      quarter: {
        fiscalPeriod: 'Q4',
        reportEndDate: '2025-12-31',
        filedAt: '2026-02-05',
        revenue: 213_400,
        operatingIncome: 25_000,
        netIncome: 21_200,
        eps: 1.68,
        source: 'fmp_latest_quarter',
        reportUrl: 'https://ir.aboutamazon.com/example',
      },
      annual: {
        reportEndDate: '2025-12-31',
        revenue: 716_924,
        ebitda: 165_341,
        netIncome: 59_248,
        source: 'sec_edgar_annual',
      },
      commentary: {
        highlights: ['AWS margins improved year over year.', 'Advertising remained strong.'],
        sourceNotes: ['FMP earnings release summary Q4 2025'],
      },
      dataQuality: {
        usedCachedPackage: true,
        usedEarningsRelease: true,
        usedTranscript: true,
        usedFinancials: true,
        usedFallback: false,
        gaps: [],
      },
    },
    nextEarnings: {
      displayDate: 'Apr 29, 2026',
      source: 'FMP earnings',
      note: null,
    },
  });

  assert.equal(card.companyName, 'Amazon.com, Inc.');
  assert.equal(card.ticker, 'AMZN');
  assert.equal(card.quarterLabel, 'Q4 2025');
  assert.equal(card.nextEarningsDate, 'Apr 29, 2026');
  assert.equal(card.metrics[0]?.label, 'Revenue');
  assert.equal(card.metrics[0]?.value, '$213,400M');
  assert.deepEqual(card.highlights, ['AWS margins improved year over year.', 'Advertising remained strong.']);
});
