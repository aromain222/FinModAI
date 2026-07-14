import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPortfolioChatContext } from './portfolioContext';
import type { PMAlert, PortfolioPosition, PositionThesis } from '@/lib/pm/types';

function position(ticker: string, shares: number, currentPrice: number, costBasis: number): PortfolioPosition {
  return {
    id: ticker,
    ticker,
    companyName: ticker,
    shares,
    currentPrice,
    costBasis,
    notionalExposure: null,
    targetAllocation: null,
    currentAllocation: null,
    portfolioTheme: null,
    portfolioRole: null,
    timeHorizon: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
  };
}

function thesis(ticker: string, updatedAt: string, summary: string): PositionThesis {
  return {
    id: `${ticker}-${updatedAt}`,
    ticker,
    createdAt: updatedAt,
    updatedAt,
    thesisSummary: summary,
    whyWeOwnIt: 'Test thesis',
    addConditions: [],
    sellConditions: [],
    invalidationConditions: [],
    keyRisks: [],
    catalysts: [],
    convictionScore: 70,
    thesisStatus: 'holding',
    timeHorizon: '1-3 months',
    lastReviewedAt: updatedAt,
  };
}

test('buildPortfolioChatContext computes market weights and unrealized returns', () => {
  const context = buildPortfolioChatContext({
    positions: [position('AAA', 10, 20, 10), position('BBB', 5, 40, 50)],
    theses: [],
    alerts: [],
    builtAt: '2026-07-13T00:00:00.000Z',
  });
  assert.equal(context.totalMarketValue, 400);
  assert.equal(context.positions[0].weightPct, 50);
  assert.equal(context.positions.find(item => item.ticker === 'AAA')?.unrealizedReturnPct, 100);
  assert.equal(context.positions.find(item => item.ticker === 'BBB')?.unrealizedReturnPct, -20);
});

test('buildPortfolioChatContext uses the latest thesis and excludes closed positions', () => {
  const closed = { ...position('OLD', 2, 10, 10), status: 'closed' as const };
  const context = buildPortfolioChatContext({
    positions: [position('AAA', 10, 20, 10), closed],
    theses: [
      thesis('AAA', '2026-01-01T00:00:00.000Z', 'Old'),
      thesis('AAA', '2026-07-13T00:00:00.000Z', 'Latest'),
    ],
    alerts: [] as PMAlert[],
  });
  assert.deepEqual(context.positions.map(item => item.ticker), ['AAA']);
  assert.equal(context.positions[0].thesis?.summary, 'Latest');
});
