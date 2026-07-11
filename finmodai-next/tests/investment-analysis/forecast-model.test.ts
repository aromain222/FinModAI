import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AnalystModelCard } from '@/components/analyst/AnalystModelCard';
import { generateAnalystStructuredModel, type AnalystGeneratedModelPayload } from '@/lib/analyst/modelChat';
import { classifyPrompt } from '@/lib/model-generator/classifyPrompt';
import { extractInputs } from '@/lib/model-generator/extractInputs';

const FORECAST_PROMPT =
  'Build a 5-year three-statement forecast model for Nvidia (NVDA). Output a structured model, not narrative prose. Include yearly revenue, EBITDA, EBIT, net income, capex, working capital, debt, and ending cash.';

test('forecast prompts classify into THREE_STATEMENT', () => {
  const modelType = classifyPrompt(FORECAST_PROMPT);

  assert.equal(modelType, 'THREE_STATEMENT');
});

test('event valuation prompts classify into DCF even when forecast language is present', () => {
  const modelType = classifyPrompt(
    "Alphabet is raising AI and cloud capex while EU regulators push Google to share search data with rivals. Forecast how this affects Google's valuation.",
  );

  assert.equal(modelType, 'DCF');
});

test('forecast prompts build three-statement inputs with a five-year horizon', async () => {
  const result = await extractInputs(FORECAST_PROMPT, 'THREE_STATEMENT');

  assert.equal(result.extractedInputs.modelType, 'THREE_STATEMENT');
  assert.equal(result.extractedInputs.ticker, 'NVDA');
  assert.equal(result.extractedInputs.years, 5);
  assert.ok(
    Array.isArray(result.extractedInputs.revenueGrowth) && result.extractedInputs.revenueGrowth.length === 5,
    'expected a five-year revenue growth path',
  );
});

test('analyst forecast generation resolves named demo companies before falling back to Demo Company', async () => {
  const result = await generateAnalystStructuredModel('Generate a Micron Technologies forecast model.');

  if (!result || result.validationFailed) assert.fail('expected a valid generated model');
  const payload = result.payload;
  assert.equal(payload.modelType, 'THREE_STATEMENT');
  if (payload.extractedInputs.modelType !== 'THREE_STATEMENT') assert.fail('expected three-statement inputs');
  assert.equal(payload.extractedInputs.ticker, 'MU');
  assert.equal(payload.extractedInputs.companyName, 'Micron Technology, Inc.');
  assert.notEqual(payload.extractedInputs.companyName, 'Demo Company');
});

test('analyst chat renders the three-statement forecast card controls', () => {
  const payload: AnalystGeneratedModelPayload = {
    prompt: FORECAST_PROMPT,
    modelType: 'THREE_STATEMENT',
    title: 'NVIDIA Corporation Three-Statement Model',
    tabs: ['Control Panel', 'Income Statement', 'Balance Sheet', 'Cash Flow'],
    keyOutputs: ['Revenue CAGR', 'EBITDA Margin', 'Ending Cash', 'Debt Balance'],
    scenarioContext: null,
    extractedInputs: {
      modelType: 'THREE_STATEMENT',
      companyName: 'NVIDIA Corporation',
      ticker: 'NVDA',
      companyType: 'Technology',
      source: 'demo_company_snapshots',
      years: 5,
      baseRevenue: 215938,
      revenueGrowth: [0.18, 0.16, 0.14, 0.12, 0.1],
      grossMargin: 0.74,
      opexPctRevenue: 0.21,
      taxRate: 0.21,
      capexPctRevenue: 0.045,
      daPctRevenue: 0.025,
      debt: 8468,
      cash: 10605,
    },
    defaultsUsed: {},
    provenanceSummary: {
      sourceType: 'demo_fallback',
      sources: ['demo_company_snapshots'],
      asOfDate: '2026-03-26',
      lastSynced: '2026-03-26T10:00:00Z',
      fallbackUsed: [],
    },
    comparisonSummary: null,
    recentRun: null,
    narrativeBlocks: [
      {
        title: 'FORECAST FRAME',
        body: 'This three-statement forecast model links the income statement, balance sheet, and cash flow statement into a reusable operating case.',
      },
    ],
  };

  const markup = renderToStaticMarkup(React.createElement(AnalystModelCard, { payload }));

  assert.match(markup, /Model Summary/);
  assert.match(markup, /NVIDIA Corporation • NVDA • Technology/);
  assert.match(markup, /Adjust model/);
  assert.match(markup, /Model details/);
  assert.match(markup, /Forecast Model Workspace/);
  assert.match(markup, /NVIDIA Corporation Forecast Model/);
  assert.match(markup, /FORECAST MODEL/);
  assert.match(markup, /Download Forecast PDF/);
  assert.match(markup, /Download Forecast Excel/);
});
