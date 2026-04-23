import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import {
  analystModelChatDeps,
  reviseAnalystStructuredModel,
  type AnalystGeneratedModelPayload,
} from '@/lib/analyst/modelChat';

function buildBaseDcfPayload(): AnalystGeneratedModelPayload {
  return {
    prompt: 'Build a DCF for Apple.',
    modelType: 'DCF',
    title: 'Apple Inc. DCF',
    tabs: ['Cover', 'Assumptions', 'Operating Forecast', 'DCF Valuation', 'Sensitivity', 'Checks', 'Equations'],
    keyOutputs: ['Enterprise Value', 'Equity Value', 'Implied Share Price', 'Sensitivity Table'],
    scenarioContext: null,
    extractedInputs: {
      modelType: 'DCF',
      companyName: 'Apple Inc.',
      ticker: 'AAPL',
      source: 'attachment_pdf_statement',
      years: 5,
      baseRevenue: 575_024,
      cash: 45_317,
      debt: 95_281,
      sharesOutstanding: 14_810.356,
      sharePrice: null,
      marketCap: null,
      revenueGrowth: [0.15, 0.15, 0.15, 0.15, 0.15],
      ebitMargin: [0.25, 0.25, 0.25, 0.25, 0.25],
      taxRate: 0.18,
      daPctRevenue: 0.06,
      capexPctRevenue: 0.08,
      nwcPctRevenue: 0.02,
      wacc: 0.09,
      terminalGrowth: 0.025,
    },
    defaultsUsed: {},
    provenanceSummary: {
      sourceType: 'attachment_statement',
      sources: ['attachment_pdf_statement'],
      asOfDate: '2026-04-08',
      lastSynced: null,
      fallbackUsed: [],
    },
    comparisonSummary: null,
    recentRun: null,
    narrativeBlocks: [
      {
        title: 'VALUATION FRAME',
        body: 'Apple is being framed through a canonical DCF.',
      },
    ],
    fieldDisplayMap: {
      baseRevenue: 'model_millions_currency',
      cash: 'model_millions_currency',
      debt: 'model_millions_currency',
      sharesOutstanding: 'model_millions_shares',
      wacc: 'percent',
      terminalGrowth: 'percent',
    },
    unitValidationStatus: 'validated',
    unitValidationMessage: 'Attachment-backed model inputs reconciled successfully.',
    attachmentExtraction: null,
  };
}

test('reviseAnalystStructuredModel applies structured persistent-model driver changes', async () => {
  const getLatestComparableRunMock = mock.method(analystModelChatDeps, 'getLatestComparableRun', async () => null);
  const generateTextMock = mock.method(analystModelChatDeps, 'generateTextWithProviderFallback', async (params: any) => {
    const systemPrompt = String(params?.messages?.[0]?.content ?? '');
    if (systemPrompt.includes('financial reasoning engine inside CapitalBase')) {
      return {
        text: JSON.stringify({
          intent: 'event_update',
          changes: {
            revenue_growth: { old: 0.15, new: 0.12 },
            operating_margin: { old: 0.25, new: 0.23 },
            cogs_percentage: { old: null, new: null },
            opex_percentage: { old: null, new: null },
            wacc: { old: 0.09, new: 0.1 },
            terminal_growth_rate: { old: 0.025, new: 0.02 },
            multiple: { old: null, new: null },
          },
          updated_outputs: {
            valuation_change: -0.14,
            key_driver_impact: 'Lower growth and higher discounting pressure value.',
          },
          summary: 'Demand is softening and the model should move to a more cautious case.',
          detailed_reasoning: 'Revenue growth and operating margin come down modestly, while WACC increases and terminal growth is trimmed to keep the case internally consistent.',
        }),
      };
    }
    return null;
  });

  try {
    const result = await reviseAnalystStructuredModel(
      'Demand is slowing. Reduce growth, trim margins, and raise the discount rate.',
      buildBaseDcfPayload(),
      null,
    );

    assert.ok(result);
    assert.equal(result?.modelChanged, true);
    assert.deepEqual((result?.payload.extractedInputs as any).revenueGrowth, [0.12, 0.12, 0.12, 0.12, 0.12]);
    assert.deepEqual((result?.payload.extractedInputs as any).ebitMargin, [0.23, 0.23, 0.23, 0.23, 0.23]);
    assert.equal((result?.payload.extractedInputs as any).wacc, 0.1);
    assert.equal((result?.payload.extractedInputs as any).terminalGrowth, 0.02);
    assert.match(result?.reply ?? '', /more cautious case/i);
    assert.match(result?.reply ?? '', /model card has been updated/i);
  } finally {
    getLatestComparableRunMock.mock.restore();
    generateTextMock.mock.restore();
  }
});

test('reviseAnalystStructuredModel returns explanation-only replies without changing the model', async () => {
  const getLatestComparableRunMock = mock.method(analystModelChatDeps, 'getLatestComparableRun', async () => null);
  const generateTextMock = mock.method(analystModelChatDeps, 'generateTextWithProviderFallback', async (params: any) => {
    const systemPrompt = String(params?.messages?.[0]?.content ?? '');
    if (systemPrompt.includes('financial reasoning engine inside CapitalBase')) {
      return {
        text: JSON.stringify({
          intent: 'explanation',
          changes: {
            revenue_growth: { old: null, new: null },
            operating_margin: { old: null, new: null },
            cogs_percentage: { old: null, new: null },
            opex_percentage: { old: null, new: null },
            wacc: { old: null, new: null },
            terminal_growth_rate: { old: null, new: null },
            multiple: { old: null, new: null },
          },
          updated_outputs: {
            valuation_change: null,
            key_driver_impact: 'The current value is being driven by growth, margins, and discounting assumptions.',
          },
          summary: 'The valuation is primarily sensitive to revenue growth, EBIT margins, and WACC.',
          detailed_reasoning: 'A high starting revenue base matters, but the discount rate and steady-state assumptions still control a large share of the present value.',
        }),
      };
    }
    return null;
  });

  try {
    const payload = buildBaseDcfPayload();
    const result = await reviseAnalystStructuredModel('Why is the valuation high?', payload, null);

    assert.ok(result);
    assert.equal(result?.modelChanged, false);
    assert.equal(result?.payload, payload);
    assert.match(result?.reply ?? '', /valuation is primarily sensitive/i);
    assert.match(result?.reply ?? '', /No model assumptions were changed/i);
  } finally {
    getLatestComparableRunMock.mock.restore();
    generateTextMock.mock.restore();
  }
});
