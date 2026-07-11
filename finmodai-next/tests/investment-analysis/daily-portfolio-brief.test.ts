import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPositionSnapshots, fallbackAnalysis } from '@/lib/pm/dailyBrief/generator';
import type { InvestmentDecision, PMAlert, PortfolioPosition, PositionThesis } from '@/lib/pm/types';

const now = '2026-07-11T20:00:00.000Z';

function position(): PortfolioPosition {
  return {
    id: 'position-1', ticker: 'NVDA', companyName: 'NVIDIA', shares: 10, notionalExposure: 1800,
    costBasis: 170, currentPrice: 180, targetAllocation: 0.1, currentAllocation: 0.1,
    portfolioTheme: 'AI', portfolioRole: 'Core growth', timeHorizon: '3 months', status: 'active',
    createdAt: now, updatedAt: now, targetPrice: 210, stopLoss: 165, convictionScore: 75,
  };
}

function thesis(): PositionThesis {
  return {
    id: 'thesis-1', ticker: 'NVDA', thesisSummary: 'Demand stays strong.', whyWeOwnIt: 'Compute demand.',
    addConditions: [], sellConditions: [], invalidationConditions: ['Below the stop'], keyRisks: ['Capex slows'], catalysts: ['Next earnings'],
    convictionScore: 72, thesisStatus: 'weakening', timeHorizon: '3 months', lastReviewedAt: now, createdAt: now, updatedAt: now,
  };
}

test('daily portfolio brief snapshots calculate attribution, weights, and stored thesis context', () => {
  const snapshots = buildPositionSnapshots({
    positions: [position()],
    quotes: new Map([['NVDA', { ticker: 'NVDA', price: 180, changePct: -2, changeAbs: -3.67, volume: null, marketCap: null, high52w: null, low52w: null, name: 'NVIDIA' }]]),
    theses: [thesis()],
    alerts: [{ id: 'alert-1', ticker: 'NVDA', alertType: 'thesis_break', severity: 'high', title: 'Demand risk', summary: 'Watch orders.', impactDirection: 'bearish', suggestedAction: 'review', confidence: 80, affectedTheme: null, affectedThesis: null, shouldNotifyPM: true, createdAt: now, acknowledged: false } as PMAlert],
    decisions: [{ id: 'decision-1', ticker: 'NVDA', action: 'hold', recommendation: 'Hold', approvalStatus: 'pending', approvedBy: null, rationale: 'Thesis in review', evidence: [], linkedAlertId: null, confidence: 70, createdAt: now, updatedAt: now } as InvestmentDecision],
  });
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0]?.marketValue, 1800);
  assert.equal(snapshots[0]?.dayPnl, -36.7);
  assert.equal(snapshots[0]?.weightPct, 100);
  assert.equal(snapshots[0]?.thesisStatus, 'weakening');
  assert.equal(snapshots[0]?.alerts[0]?.severity, 'high');
});

test('fallback memo does not invent a trade and escalates weakening positions for review', () => {
  const snapshots = buildPositionSnapshots({ positions: [position()], quotes: new Map(), theses: [thesis()], alerts: [], decisions: [] });
  const analysis = fallbackAnalysis({
    positions: snapshots,
    market: { regime: 'mixed', regimeConfidence: 60, spyChangePct: null, vix: null, us10y: null, breadthNetPct: null, sectorLeaders: [], sectorLaggards: [] },
    upcoming: ['2026-07-15: CPI (Jun)'],
  });
  assert.equal(analysis.positionViews[0]?.action, 'review');
  assert.ok(analysis.lookingAhead[0]?.includes('CPI'));
});
