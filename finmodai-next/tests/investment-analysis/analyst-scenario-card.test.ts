import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ScenarioCard } from '@/components/scenario/ScenarioCard';
import {
  buildScenarioDcfAdjustmentFromPayload,
  buildAnalystScenarioCardPayload,
  looksLikeScenarioDcfWorkflowPrompt,
  looksLikeTeslaMacroScenarioPrompt,
} from '@/lib/analyst/scenarioCard';
import { buildAiSmartDcfReport } from '@/lib/scenarios/aiSmartDcf';
import type { AnalystDcfDemoPayload } from '@/lib/analyst/dcfDemo';

test('tesla macro prompts trigger the deterministic scenario-card detector', () => {
  assert.equal(looksLikeTeslaMacroScenarioPrompt('What happens to Tesla if rates drop 100bps?'), true);
  assert.equal(looksLikeTeslaMacroScenarioPrompt('Impact on TSLA if interest rates move down 100bps?'), true);
});

test('non-tesla or non-scenario prompts do not trigger the detector', () => {
  assert.equal(looksLikeTeslaMacroScenarioPrompt('What happens to Nvidia if rates drop 100bps?'), false);
  assert.equal(looksLikeTeslaMacroScenarioPrompt('Tell me about Tesla earnings'), false);
});

test('scenario workflow follow-up prompts target the DCF workflow', () => {
  assert.equal(looksLikeScenarioDcfWorkflowPrompt('How does this affect a DCF model of Tesla?'), true);
  assert.equal(looksLikeScenarioDcfWorkflowPrompt('Apply this scenario to the model'), true);
  assert.equal(looksLikeScenarioDcfWorkflowPrompt('Tell me about Tesla earnings'), false);
});

test('scenario card payload adapts the deterministic API response into card fields', () => {
  const payload = buildAnalystScenarioCardPayload(buildAiSmartDcfReport());

  assert.equal(payload.modeLabel, 'Scenario Analysis Mode');
  assert.equal(payload.title, 'AI Scenario: Rates ↓ 100bps');
  assert.equal(payload.company, 'Tesla');
  assert.equal(payload.primaryDriver, 'Discount rate compression');
  assert.equal(payload.assumptions[0]?.metric, 'Growth');
  assert.equal(payload.assumptions[1]?.metric, 'Margin');
  assert.equal(payload.assumptions[2]?.metric, 'Discount Rate');
  assert.ok(payload.baseValuation > 0);
  assert.ok(payload.scenarioValuation > payload.baseValuation);
  assert.equal(payload.drivers.length, 3);
  assert.equal(payload.interpretation.length, 3);
  assert.equal(payload.risks.length, 3);
});

test('scenario card renders valuation impact and assumptions table', () => {
  const payload = buildAnalystScenarioCardPayload(buildAiSmartDcfReport());
  const markup = renderToStaticMarkup(React.createElement(ScenarioCard, payload));

  assert.match(markup, /Scenario Analysis Mode/);
  assert.match(markup, /AI Scenario: Rates ↓ 100bps/);
  assert.match(markup, /Valuation Impact/);
  assert.match(markup, /Primary Driver:/);
  assert.match(markup, /Discount rate compression/);
  assert.match(markup, /Base EV/);
  assert.match(markup, /Scenario EV/);
  assert.match(markup, /AI Smart Assumptions/);
  assert.match(markup, /Discount Rate/);
});

test('scenario card builds a delta-based DCF adjustment for the active Tesla DCF', () => {
  const payload = buildAnalystScenarioCardPayload(buildAiSmartDcfReport());
  const currentDcf = {
    assumptions: {
      revenueGrowth: [0.12, 0.1, 0.08, 0.06, 0.05],
      ebitMargin: [0.15, 0.16, 0.16, 0.17, 0.17],
      taxRate: 0.18,
      daPctRevenue: 0.06,
      capexPctRevenue: 0.08,
      nwcPctRevenue: 0.02,
      wacc: 0.09,
      terminalGrowth: 0.025,
    },
  } as AnalystDcfDemoPayload;

  const adjustment = buildScenarioDcfAdjustmentFromPayload(payload, currentDcf);

  assert.deepEqual(adjustment.revenueGrowth, [0.17, 0.15, 0.13, 0.11, 0.1]);
  assert.deepEqual(adjustment.ebitMargin, [0.145, 0.155, 0.155, 0.165, 0.165]);
  assert.equal(adjustment.wacc, 0.08);
});
