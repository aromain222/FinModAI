import assert from 'node:assert/strict';
import test from 'node:test';

import * as routeModule from '@/app/api/analyst-chat/route';
import * as scenarioDcfModule from '@/lib/scenarios/aiSmartDcf';
import * as scenarioCardModule from '@/lib/analyst/scenarioCard';

const { POST } = routeModule;

test('tesla scenario follow-up produces a scenario-adjusted generated dcf workflow', async () => {
  const scenarioCard = scenarioCardModule.buildAnalystScenarioCardPayload(
    scenarioDcfModule.buildAiSmartDcfReport(),
  );

  const baselineResponse = await POST(
    new Request('http://localhost:3000/api/analyst-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ticker: 'TSLA',
        messages: [
          {
            id: 'u1',
            role: 'user',
            content: 'how does this affect a dcf model of tesla?',
          },
        ],
      }),
    }),
  );

  assert.equal(baselineResponse.status, 200);
  const baselinePayload = await baselineResponse.json();
  assert.ok(baselinePayload.generatedModel, 'expected baseline generated DCF model');

  const response = await POST(
    new Request('http://localhost:3000/api/analyst-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ticker: 'TSLA',
        messages: [
          {
            id: 'u1',
            role: 'user',
            content: 'What happens to Tesla if rates drop 100bps?',
          },
          {
            id: 'a1',
            role: 'assistant',
            content: '',
            meta: {
              mode: 'scenario',
              scenarioCard,
            },
          },
          {
            id: 'u2',
            role: 'user',
            content: 'how does this affect a dcf model of tesla?',
          },
        ],
      }),
    }),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();

  assert.equal(payload.route, 'financial_model');
  assert.equal(Boolean(payload.dcfDemo), false);
  assert.ok(payload.generatedModel, 'expected the generated DCF workflow payload');
  assert.equal(payload.generatedModel.modelType, 'DCF');
  assert.equal(
    payload.generatedModel.extractedInputs.wacc,
    Number((baselinePayload.generatedModel.extractedInputs.wacc - 0.01).toFixed(4)),
  );
  assert.deepEqual(
    payload.generatedModel.extractedInputs.revenueGrowth,
    baselinePayload.generatedModel.extractedInputs.revenueGrowth.map((value: number) =>
      Number((value + 0.05).toFixed(4)),
    ),
  );
  assert.deepEqual(
    payload.generatedModel.extractedInputs.ebitMargin,
    baselinePayload.generatedModel.extractedInputs.ebitMargin.map((value: number) =>
      Number((value - 0.005).toFixed(4)),
    ),
  );
});
