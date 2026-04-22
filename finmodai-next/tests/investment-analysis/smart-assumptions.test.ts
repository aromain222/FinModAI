import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAnalystSmartAssumptionOverrides,
  buildNormalizedSmartAssumptionOverrides,
  buildSmartAssumptionReply,
} from '@/lib/smart-assumptions/shared';
import {
  buildAnalystCustomAssumptionOverrides,
  buildCustomAssumptionReply,
  buildCustomAssumptionResult,
  looksLikeCustomAssumptionPrompt,
  parseCustomAssumptionPrompt,
} from '@/lib/analyst/customAssumptions';
import type { SmartAssumptionResult } from '@/lib/smart-assumptions/types';

function makeSmartAssumptionResult(): SmartAssumptionResult {
  return {
    sourceType: 'smart_assumption_agent',
    subject: {
      companyName: 'Palantir Technologies Inc.',
      ticker: 'PLTR',
      sector: 'Technology',
      industry: 'Software',
      regime: 'mature_compounder',
    },
    modelType: 'DCF',
    suggestions: {
      revenue_growth: 0.11,
      operating_margin: 0.24,
      wacc: 0.0975,
      terminal_growth_rate: 0.0275,
    },
    changedDrivers: [
      {
        driver: 'revenue_growth',
        label: 'Revenue growth',
        old: 0.08,
        new: 0.11,
        rationale: 'Growth is anchored to the software sector regime.',
        confidence: 'medium',
      },
      {
        driver: 'wacc',
        label: 'WACC',
        old: 0.09,
        new: 0.0975,
        rationale: 'WACC reflects higher-for-longer rate pressure.',
        confidence: 'high',
      },
    ],
    driverRationales: {
      revenue_growth: 'Growth is anchored to the software sector regime.',
      operating_margin: 'Margin blends company evidence with peers.',
      wacc: 'WACC reflects higher-for-longer rate pressure.',
      terminal_growth_rate: 'Terminal growth stays close to steady-state sector ranges.',
    },
    driverConfidence: {
      revenue_growth: 'medium',
      operating_margin: 'high',
      wacc: 'high',
      terminal_growth_rate: 'medium',
    },
    provenanceSummary: {
      companyProfile: 'Palantir Technologies Inc. (PLTR) screens as mature compounder in Technology.',
      peerContext: '4 peer anchors from Software with median margin 21.0%.',
      macroContext: 'Current macro overlay reflects Fed boxed in as oil risk revives inflation.',
      sources: ['CapitalBase company snapshot (company_snapshot)', 'Macro context (Reuters)'],
    },
    warnings: [],
    normalizedOverrides: {
      revenue_growth: 0.11,
      ebit_margin: 0.24,
      wacc: 0.0975,
      terminal_growth: 0.0275,
    },
  };
}

test('buildNormalizedSmartAssumptionOverrides maps only the four writable drivers', () => {
  const result = makeSmartAssumptionResult();
  assert.deepEqual(buildNormalizedSmartAssumptionOverrides(result), {
    revenue_growth: 0.11,
    ebit_margin: 0.24,
    wacc: 0.0975,
    terminal_growth: 0.0275,
  });
});

test('buildAnalystSmartAssumptionOverrides maps into current model fields only', () => {
  const result = makeSmartAssumptionResult();
  const overrides = buildAnalystSmartAssumptionOverrides(
    {
      revenueGrowth: [0.08, 0.07, 0.06],
      ebitMargin: [0.2, 0.21, 0.22],
      wacc: 0.09,
      terminalGrowth: 0.025,
      companyName: 'Palantir Technologies Inc.',
    },
    result,
  );

  assert.deepEqual(overrides.revenueGrowth, [0.11, 0.11, 0.11]);
  assert.deepEqual(overrides.ebitMargin, [0.24, 0.24, 0.24]);
  assert.equal(overrides.wacc, 0.0975);
  assert.equal(overrides.terminalGrowth, 0.0275);
});

test('buildSmartAssumptionReply stays short and includes changed drivers plus confidence', () => {
  const reply = buildSmartAssumptionReply(makeSmartAssumptionResult());
  assert.match(reply, /Applied smart assumptions/i);
  assert.match(reply, /Revenue growth 8\.0% → 11\.0%/i);
  assert.match(reply, /WACC 9\.0% → 9\.8%/i);
  assert.match(reply, /Confidence:/i);
});

test('looksLikeCustomAssumptionPrompt detects explicit assumption edits', () => {
  assert.equal(looksLikeCustomAssumptionPrompt('Set WACC to 10% and terminal growth to 2.5%'), true);
  assert.equal(looksLikeCustomAssumptionPrompt('What does this mean for Palantir?'), false);
});

test('parseCustomAssumptionPrompt extracts explicit values only', () => {
  const parsed = parseCustomAssumptionPrompt({
    prompt: 'Set WACC to 10% and terminal growth to 2.5%',
    companyName: 'Palantir Technologies Inc.',
    ticker: 'PLTR',
    currentAssumptions: {
      revenue_growth: 0.08,
      operating_margin: 0.22,
      wacc: 0.09,
      terminal_growth_rate: 0.02,
    },
  });

  assert.equal(parsed.reply, null);
  assert.deepEqual(parsed.summary?.changedDrivers.map((driver) => [driver.driver, driver.new]), [
    ['wacc', 0.1],
    ['terminal_growth_rate', 0.025],
  ]);
});

test('buildCustomAssumptionResult rejects invalid structured inputs and no-op values', () => {
  const invalid = buildCustomAssumptionResult({
    companyName: 'Palantir Technologies Inc.',
    ticker: 'PLTR',
    currentAssumptions: {
      revenue_growth: 0.08,
      operating_margin: 0.22,
      wacc: 0.09,
      terminal_growth_rate: 0.02,
    },
    requestedValues: {
      revenue_growth: Number.NaN,
      wacc: 0.09,
      terminal_growth_rate: 0.2,
    },
  });

  assert.equal(invalid.summary, null);
  assert.match(invalid.errors.join(' '), /Revenue growth must be a valid percentage/i);
  assert.match(invalid.errors.join(' '), /Terminal growth must be between/i);
});

test('buildAnalystCustomAssumptionOverrides maps only compatible active-model fields', () => {
  const overrides = buildAnalystCustomAssumptionOverrides(
    {
      revenueGrowth: [0.08, 0.07, 0.06],
      ebitMargin: [0.2, 0.21, 0.22],
      wacc: 0.09,
      terminalGrowth: 0.025,
    },
    {
      revenue_growth: 0.09,
      operating_margin: 0.24,
      wacc: 0.1,
      terminal_growth_rate: 0.0225,
    },
  );

  assert.deepEqual(overrides.revenueGrowth, [0.09, 0.09, 0.09]);
  assert.deepEqual(overrides.ebitMargin, [0.24, 0.24, 0.24]);
  assert.equal(overrides.wacc, 0.1);
  assert.equal(overrides.terminalGrowth, 0.0225);
});

test('buildCustomAssumptionReply stays short and enumerates changed drivers', () => {
  const { summary } = buildCustomAssumptionResult({
    companyName: 'Palantir Technologies Inc.',
    ticker: 'PLTR',
    currentAssumptions: {
      revenue_growth: 0.08,
      operating_margin: 0.22,
      wacc: 0.09,
      terminal_growth_rate: 0.02,
    },
    requestedValues: {
      wacc: 0.1,
      terminal_growth_rate: 0.025,
    },
  });

  assert.ok(summary);
  const reply = buildCustomAssumptionReply(summary);
  assert.match(reply, /Applied custom assumptions/i);
  assert.match(reply, /WACC 9\.0% → 10\.0%/i);
  assert.match(reply, /Terminal growth 2\.0% → 2\.5%/i);
});
