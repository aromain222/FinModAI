import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeCalibration, type AgentOutcome } from '@/lib/pm/calibration/agentOutcomes';

function outcome(index: number, correct: boolean): AgentOutcome {
  return {
    id: String(index), ticker: 'TEST', agentViewId: `view-${index}`, agentName: 'Desk', stance: 'bullish',
    predictedConfidence: 70, referencePrice: 100, horizonDays: 45, dueAt: '2026-08-24T00:00:00.000Z',
    status: 'settled', realizedPrice: correct ? 105 : 95, realizedReturnPct: correct ? 5 : -5,
    directionCorrect: correct, brierScore: correct ? 0.09 : 0.49,
    createdAt: '2026-07-10T00:00:00.000Z', updatedAt: '2026-08-24T00:00:00.000Z', settledAt: '2026-08-24T00:00:00.000Z',
  };
}

test('requires five settled observations before changing confidence', () => {
  assert.equal(summarizeCalibration([outcome(1, true)], 'Desk').confidenceMultiplier, 1);
});

test('shrinks confidence using the realized hit rate after enough observations', () => {
  const rows = [true, false, false, true, false, false, true, false, false, true].map((correct, index) => outcome(index, correct));
  const summary = summarizeCalibration(rows, 'Desk');
  assert.equal(summary.sampleSize, 10);
  assert.equal(summary.hitRate, 40);
  assert.ok(summary.confidenceMultiplier < 1);
});
