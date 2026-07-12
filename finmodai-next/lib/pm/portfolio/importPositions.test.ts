import assert from 'node:assert/strict';
import test from 'node:test';
import type { PortfolioPosition } from '@/lib/pm/types';
import { buildHoldingsImportPlan, holdingsImportSchema } from './importPositions';

function position(overrides: Partial<PortfolioPosition>): PortfolioPosition {
  return {
    id: 'position-1',
    ticker: 'MSFT',
    companyName: null,
    shares: 1,
    notionalExposure: 100,
    costBasis: 90,
    currentPrice: 100,
    targetAllocation: null,
    currentAllocation: null,
    portfolioTheme: null,
    portfolioRole: null,
    timeHorizon: null,
    status: 'active',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

test('full holdings import preserves watch rows and closes missing held positions', () => {
  const plan = buildHoldingsImportPlan({
    now: '2026-07-12T00:00:00.000Z',
    existing: [
      position({ id: 'msft-active', ticker: 'MSFT', account: 'Robinhood' }),
      position({ id: 'aapl-paper', ticker: 'AAPL', account: null }),
      position({ id: 'amd-watch', ticker: 'AMD', status: 'watch' }),
    ],
    holdings: [{ ticker: 'MSFT', shares: 1.25, costBasis: 410.5, currentPrice: 418.2, account: 'Robinhood' }],
  });

  assert.equal(plan.updated, 1);
  assert.equal(plan.created, 0);
  assert.equal(plan.upserts[0]?.id, 'msft-active');
  assert.equal(plan.upserts[0]?.shares, 1.25);
  assert.deepEqual(plan.closes, [{ id: 'aapl-paper', ticker: 'AAPL' }]);
  assert.equal(plan.closes.some(item => item.id === 'amd-watch'), false);
});

test('full holdings import adopts one legacy active row and keeps fractional notional precise', () => {
  const plan = buildHoldingsImportPlan({
    existing: [position({ id: 'legacy-sofi', ticker: 'SOFI', account: null })],
    holdings: [{ ticker: 'sofi', shares: 3.333, costBasis: 17.25, currentPrice: 18.11, account: 'Robinhood Individual' }],
  });

  assert.equal(plan.upserts[0]?.id, 'legacy-sofi');
  assert.equal(plan.upserts[0]?.ticker, 'SOFI');
  assert.equal(plan.upserts[0]?.account, 'Robinhood Individual');
  assert.equal(plan.upserts[0]?.notionalExposure, 60.36);
  assert.equal(plan.closes.length, 0);
});

test('holdings import rejects duplicate ticker/account rows', () => {
  const parsed = holdingsImportSchema.safeParse([
    { ticker: 'QQQ', shares: 1, costBasis: 500, currentPrice: 510, account: 'Robinhood' },
    { ticker: 'qqq', shares: 2, costBasis: 505, currentPrice: 510, account: 'Robinhood' },
  ]);

  assert.equal(parsed.success, false);
});
