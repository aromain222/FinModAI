import assert from 'node:assert/strict';
import test from 'node:test';
import { pmAnalysisSchema } from '@/lib/pm/analyzer/positionAnalysis';

test('PM analysis trims overlong LLM prose at the contract boundary', () => {
  const longRisk = `Execution risk ${'remains material '.repeat(20)}`;
  const result = pmAnalysisSchema.parse({
    targetPrice: 10,
    stopLoss: 7,
    thesisSummary: 'A sufficiently detailed thesis summary for the test case.',
    whyWeOwnIt: 'A sufficiently detailed ownership rationale for the test case.',
    primaryDriver: 'Margin recovery',
    mainRisk: longRisk,
    keyRisks: [longRisk],
    catalysts: ['Quarterly results'],
    sellConditions: ['Revenue misses plan'],
    invalidationConditions: ['Liquidity deteriorates'],
    convictionScore: 40,
    timeHorizon: 'position',
    nextCatalyst: 'Next quarterly results',
  });

  assert.equal(result.mainRisk.length, 160);
  assert.equal(result.keyRisks[0].length, 260);
});
