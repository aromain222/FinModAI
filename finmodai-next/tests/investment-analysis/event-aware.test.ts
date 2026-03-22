import assert from 'node:assert/strict';
import test from 'node:test';

import { applyEventAssumptionDeltas } from '@/lib/investment-analysis/eventAssumptionApplication';
import { deriveEventAwareAssumptionDeltas } from '@/lib/investment-analysis/eventAssumptions';
import { classifyInvestmentEvent } from '@/lib/investment-analysis/eventClassifier';
import { normalizeGeneratedMemoPayload } from '@/lib/investment-analysis/generateAnalysis';
import { refreshInvestmentAnalysisModel } from '@/lib/investment-analysis/modelRefresh';
import { parseInvestmentPromptContext } from '@/lib/investment-analysis/promptParser';
import type {
  InvestmentEventAssumptionDeltaResult,
  InvestmentEventClassificationResult,
} from '@/lib/investment-analysis/eventTypes';

import {
  BASE_DCF_ASSUMPTIONS,
  INVALID_EDGE_ASSUMPTIONS,
  TEST_COMPANY,
  TEST_DEFENSE_COMPANY,
} from './fixtures';

function assertAlmostEqual(actual: number, expected: number, epsilon = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `Expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

function makeEvent(
  overrides: Partial<InvestmentEventClassificationResult>,
): InvestmentEventClassificationResult {
  return {
    category: 'management_transition',
    confidence: 'high',
    score: 5,
    normalizedEventSummary: 'The CEO announced he is stepping down',
    rationale: 'Deterministic test event.',
    matchedSignals: ['explicit_ceo_departure'],
    ...overrides,
  };
}

function makeDeltaResult(
  overrides: Partial<InvestmentEventAssumptionDeltaResult>,
): InvestmentEventAssumptionDeltaResult {
  return {
    eventCategory: 'management_transition',
    confidence: 'high',
    normalizedEventSummary: 'The CEO announced he is stepping down',
    scenarioBias: 'bearish',
    rationaleSummary: 'Test rationale summary.',
    deltas: [],
    adjustedAssumptions: {
      revenueGrowthByYear: [...BASE_DCF_ASSUMPTIONS.revenueGrowthByYear],
      operatingMarginByYear: [...BASE_DCF_ASSUMPTIONS.operatingMarginByYear],
      wacc: BASE_DCF_ASSUMPTIONS.wacc,
      terminalGrowthRate: BASE_DCF_ASSUMPTIONS.terminalGrowthRate,
    },
    ...overrides,
  };
}

test('prompt parser extracts company, analysis type, event context, and horizon', () => {
  const parsed = parseInvestmentPromptContext(
    'Build a DCF for Nvidia knowing the CEO announced he is stepping down for the next 5 years',
  );

  assert.equal(parsed.companyName, 'NVIDIA Corporation');
  assert.equal(parsed.ticker, 'NVDA');
  assert.equal(parsed.analysisType, 'DCF');
  assert.match(parsed.eventContextText ?? '', /ceo announced he is stepping down/i);
  assert.deepEqual(parsed.timeHorizon, {
    value: 5,
    unit: 'years',
    rawText: 'for the next 5 years',
  });
});

test('prompt parser extracts sector-only prompts and avoids weak event false positives', () => {
  const sectorParsed = parseInvestmentPromptContext(
    'Analyze a defense tech company assuming we are in a war environment for 5 years',
  );
  assert.equal(sectorParsed.companyName, undefined);
  assert.equal(sectorParsed.sector, 'Defense Tech');
  assert.equal(sectorParsed.analysisType, 'COMPANY_ANALYSIS');
  assert.match(sectorParsed.eventContextText ?? '', /war environment for 5 years/i);

  const nonEventParsed = parseInvestmentPromptContext('Build a DCF for Apple with 10% revenue growth');
  assert.equal(nonEventParsed.eventContextText, null);
});

test('event classifier returns management transition with high confidence', () => {
  const result = classifyInvestmentEvent({
    rawEventText: 'CEO announced he is stepping down',
    companyName: 'NVIDIA Corporation',
    sector: 'Semiconductors',
  });

  assert.equal(result.category, 'management_transition');
  assert.equal(result.confidence, 'high');
  assert.match(result.normalizedEventSummary, /CEO announced he is stepping down/i);
  assert.ok(result.matchedSignals.includes('explicit_ceo_departure'));
});

test('event classifier uses sector context to support geopolitical conflict in defense', () => {
  const result = classifyInvestmentEvent({
    rawEventText: 'we are in a war environment for 5 years',
    sector: 'Defense Tech',
  });

  assert.equal(result.category, 'geopolitical_conflict');
  assert.equal(result.confidence, 'high');
  assert.ok(result.matchedSignals.includes('war'));
});

test('event classifier falls back safely to unknown on weak text', () => {
  const result = classifyInvestmentEvent({
    rawEventText: 'there may be some pressure on the business',
    sector: 'Software',
  });

  assert.equal(result.category, 'unknown');
  assert.equal(result.confidence, 'low');
});

test('assumption delta generation produces bearish CEO transition shocks', () => {
  const result = deriveEventAwareAssumptionDeltas({
    baseAssumptions: BASE_DCF_ASSUMPTIONS,
    event: makeEvent({ category: 'management_transition' }),
    company: TEST_COMPANY,
  });

  assert.equal(result.scenarioBias, 'bearish');
  assertAlmostEqual(result.adjustedAssumptions.wacc, 0.1);
  assertAlmostEqual(result.adjustedAssumptions.terminalGrowthRate, 0.0275);
  assertAlmostEqual(result.adjustedAssumptions.revenueGrowthByYear[0] ?? 0, 0.115);
  assertAlmostEqual(result.adjustedAssumptions.operatingMarginByYear[0] ?? 0, 0.337);
  assert.equal(result.deltas.length, 4);
});

test('assumption delta generation produces bullish defense war shocks', () => {
  const event = makeEvent({
    category: 'geopolitical_conflict',
    normalizedEventSummary: 'We are in a war environment for 5 years',
    matchedSignals: ['war', 'defense_sector_context'],
  });

  const result = deriveEventAwareAssumptionDeltas({
    baseAssumptions: BASE_DCF_ASSUMPTIONS,
    event,
    company: TEST_DEFENSE_COMPANY,
  });

  assert.equal(result.scenarioBias, 'bullish');
  assertAlmostEqual(result.adjustedAssumptions.wacc, 0.0925);
  assertAlmostEqual(result.adjustedAssumptions.revenueGrowthByYear[0] ?? 0, 0.135);
  assertAlmostEqual(result.adjustedAssumptions.operatingMarginByYear[0] ?? 0, 0.3425);
});

test('delta application preserves base assumptions and creates display-friendly change log', () => {
  const deltaResult = deriveEventAwareAssumptionDeltas({
    baseAssumptions: BASE_DCF_ASSUMPTIONS,
    event: makeEvent({ category: 'management_transition' }),
    company: TEST_COMPANY,
  });

  const applied = applyEventAssumptionDeltas(BASE_DCF_ASSUMPTIONS, deltaResult);

  assert.equal(BASE_DCF_ASSUMPTIONS.wacc, 0.095);
  assert.equal(applied.adjustedAssumptions.wacc, 0.1);
  assert.equal(applied.baseAssumptions.wacc, 0.095);
  assert.equal(applied.hasMaterialChanges, true);
  assert.equal(applied.changes.length, 4);
  assert.equal(applied.changes[2]?.label, 'WACC');
  assert.equal(applied.changes[2]?.display.delta, '+50 bps');
  assert.deepEqual(applied.validationIssues, []);
});

test('delta application flags invalid terminal growth relationships', () => {
  const applied = applyEventAssumptionDeltas(
    {
      revenueGrowthByYear: [0.05, 0.05, 0.05],
      operatingMarginByYear: [0.2, 0.2, 0.2],
      wacc: 0.06,
      terminalGrowthRate: 0.04,
    },
    makeDeltaResult({
      deltas: [
        {
          lever: 'wacc',
          direction: 'down',
          unit: 'bps',
          amount: -200,
          rationale: 'Force a validation error for testing.',
          confidence: 'high',
        },
      ],
    }),
  );

  assert.ok(
    applied.validationIssues.some(
      (issue) =>
        issue.field === 'terminalGrowthRate' &&
        issue.severity === 'error' &&
        /below WACC/i.test(issue.message),
    ),
  );
});

test('unknown events keep assumptions unchanged and produce no material changes', () => {
  const deltaResult = deriveEventAwareAssumptionDeltas({
    baseAssumptions: BASE_DCF_ASSUMPTIONS,
    event: makeEvent({
      category: 'unknown',
      confidence: 'low',
      score: 0,
      normalizedEventSummary: 'Ambiguous event text',
      matchedSignals: [],
    }),
    company: TEST_COMPANY,
  });

  const applied = applyEventAssumptionDeltas(BASE_DCF_ASSUMPTIONS, deltaResult);

  assert.deepEqual(applied.adjustedAssumptions.revenueGrowthByYear, BASE_DCF_ASSUMPTIONS.revenueGrowthByYear);
  assert.equal(applied.adjustedAssumptions.wacc, BASE_DCF_ASSUMPTIONS.wacc);
  assert.equal(applied.hasMaterialChanges, false);
  assert.equal(applied.changes.length, 0);
});

test('deterministic model refresh reruns the model with adjusted assumptions', () => {
  const deltaResult = deriveEventAwareAssumptionDeltas({
    baseAssumptions: BASE_DCF_ASSUMPTIONS,
    event: makeEvent({ category: 'management_transition' }),
    company: TEST_COMPANY,
  });
  const applied = applyEventAssumptionDeltas(BASE_DCF_ASSUMPTIONS, deltaResult);

  const before = refreshInvestmentAnalysisModel({
    company: TEST_COMPANY,
    adjustedAssumptions: BASE_DCF_ASSUMPTIONS,
  });
  const after = refreshInvestmentAnalysisModel({
    company: TEST_COMPANY,
    adjustedAssumptions: {
      ...BASE_DCF_ASSUMPTIONS,
      ...applied.adjustedAssumptions,
    },
  });

  assert.equal(after.refreshedForecast.length, 5);
  assert.equal(after.workspaceCharts.revenueForecast.data.length, 5);
  assert.equal(after.writePayload.assumptions.wacc, 0.1);
  assert.ok(after.refreshedValuation.enterpriseValue < before.refreshedValuation.enterpriseValue);
  assert.ok(after.document.scenarios.bull.result.valuation.enterpriseValue > after.document.scenarios.base.result.valuation.enterpriseValue);
});

test('deterministic model refresh sanitizes invalid assumptions instead of failing', () => {
  const refreshed = refreshInvestmentAnalysisModel({
    company: TEST_COMPANY,
    adjustedAssumptions: INVALID_EDGE_ASSUMPTIONS,
  });

  assert.ok(refreshed.refreshedForecast.length >= 1);
  assert.ok(refreshed.refreshedValuation.enterpriseValue !== 0);
  assert.ok(refreshed.activeScenario.result.warnings.length > 0);
  assert.ok(refreshed.activeScenario.result.assumptionsAdjusted.includes('terminalGrowthRate'));
});

test('event-aware memo normalization accepts the richer Claude summary schema', () => {
  const normalized = normalizeGeneratedMemoPayload({
    executiveSummary: 'The event weakens the case mainly through a higher risk premium.',
    investmentView: 'The business remains solid, but the valuation is less supported after the event-aware adjustment.',
    whyEventMatters: 'The event matters because it raises near-term execution risk more than it changes long-run demand.',
    keyRisks: [
      'The discount-rate move could prove too harsh if execution remains intact.',
      'Terminal value still drives a large share of value.',
    ],
    scenarioCommentary: {
      bull: 'The transition proves orderly and valuation support recovers.',
      base: 'Execution risk is manageable, but the stock looks less attractive.',
      bear: 'Risk premium stays elevated and valuation compresses further.',
    },
  });

  assert.ok(normalized);
  assert.match(normalized?.summary ?? '', /event weakens the case/i);
  assert.match(normalized?.whyItMatters ?? '', /raises near-term execution risk/i);
  assert.match(normalized?.analysis ?? '', /Scenario Commentary/i);
  assert.match(normalized?.analysis ?? '', /Key Risks/i);
  assert.match(normalized?.analysis ?? '', /Bull: The transition proves orderly/i);
});
