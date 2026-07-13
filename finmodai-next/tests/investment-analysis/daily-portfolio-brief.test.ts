import assert from 'node:assert/strict';
import test from 'node:test';
import { attachRecentNews, buildPositionSnapshots, fallbackAnalysis, selectSectorExtremes } from '@/lib/pm/dailyBrief/generator';
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
    researchEvidence: {
      builtAt: now, horizonDays: 45, coveragePct: 80, degraded: false, marketRegime: 'mixed', available: [], missing: [], warnings: [], sources: [],
      priceForecast: { currentPrice: 180, baseCasePrice: 205, bearCasePrice: 155, bullCasePrice: 225, expectedReturnPct: 13.9, lowerReturnPct: -13.9, upperReturnPct: 25, horizonDays: 45, asOf: now, source: 'TimesFM', methodology: 'provider forecast' },
    },
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
  assert.equal(snapshots[0]?.returnSinceCostPct, 5.9);
  assert.equal(snapshots[0]?.priceForecast?.baseCasePrice, 205);
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
  assert.ok(analysis.positionViews[0]?.pricePlan.includes('base $205.00'));
});

test('sector tables require enough coverage and never repeat a sector', () => {
  assert.deepEqual(selectSectorExtremes([{ name: 'Tech', changePct: 1 }]), { sectorLeaders: [], sectorLaggards: [] });
  const result = selectSectorExtremes([
    { name: 'Tech', changePct: 2 }, { name: 'Energy', changePct: 1 }, { name: 'Health', changePct: -1 }, { name: 'Utilities', changePct: -2 },
  ]);
  assert.deepEqual(result.sectorLeaders.map(item => item.name), ['Tech', 'Energy']);
  assert.deepEqual(result.sectorLaggards.map(item => item.name), ['Utilities', 'Health']);
  assert.equal(result.sectorLeaders.some(leader => result.sectorLaggards.some(laggard => laggard.name === leader.name)), false);
});

test('daily brief attaches sourced ticker news without duplicating headlines', () => {
  const snapshots = buildPositionSnapshots({ positions: [position()], quotes: new Map(), theses: [thesis()], alerts: [], decisions: [] });
  const withNews = attachRecentNews(snapshots, [{
    title: 'NVIDIA announces a new product', published_at: now,
    impacted_tickers: [{ ticker: 'NVDA' }],
    sources: [{ source: 'Reuters', url: 'https://example.com/nvda', published_at: now }],
  }, {
    title: 'NVIDIA announces a new product', published_at: now,
    impacted_tickers: [{ ticker: 'NVDA' }],
  }]);
  assert.equal(withNews[0]?.recentNews.length, 1);
  assert.equal(withNews[0]?.recentNews[0]?.source, 'Reuters');
  const analysis = fallbackAnalysis({
    positions: withNews,
    market: { regime: 'mixed', regimeConfidence: 60, spyChangePct: null, vix: null, us10y: null, breadthNetPct: null, sectorLeaders: [], sectorLaggards: [] },
    upcoming: [],
  });
  assert.ok(analysis.positionViews[0]?.recentNewsSummary.includes('new product'));
  assert.ok(analysis.positionViews[0]?.forwardThesis.includes('research') || analysis.positionViews[0]?.forwardThesis.includes('evidence'));
});
