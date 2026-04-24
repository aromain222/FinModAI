import assert from 'node:assert/strict';
import test from 'node:test';

import * as routeModule from '@/app/api/analyst-chat/route';
import {
  buildTeslaDemoInterpretationReply,
  getTeslaDemoGuidedHint,
  hasTeslaDemoHistory,
  looksLikeTeslaDemoEntryPrompt,
  looksLikeTeslaDemoInterpretationPrompt,
} from '@/lib/analyst/demoWorkflow';
import * as scenarioCardModule from '@/lib/analyst/scenarioCard';
import * as scenarioDcfModule from '@/lib/scenarios/aiSmartDcf';

const { POST } = routeModule;

test('tesla demo entry prompts are detected without matching other companies', () => {
  assert.equal(looksLikeTeslaDemoEntryPrompt('Tell me about Tesla earnings'), true);
  assert.equal(looksLikeTeslaDemoEntryPrompt('tesla earnings'), true);
  assert.equal(looksLikeTeslaDemoEntryPrompt('TSLA earnings'), true);
  assert.equal(looksLikeTeslaDemoEntryPrompt('Tell me about Nvidia earnings'), false);
});

test('tesla demo interpretation prompts and guided hints are deterministic', () => {
  assert.equal(looksLikeTeslaDemoInterpretationPrompt('Is this bullish?'), true);
  assert.equal(looksLikeTeslaDemoInterpretationPrompt('Give me the bull case'), true);
  assert.equal(looksLikeTeslaDemoInterpretationPrompt('What is the bear case here?'), true);
  assert.equal(looksLikeTeslaDemoInterpretationPrompt('Build a DCF for Tesla'), false);
  assert.equal(getTeslaDemoGuidedHint('earnings'), 'Try asking: What happens to Tesla if rates drop 100bps?');
  assert.equal(getTeslaDemoGuidedHint('scenario'), 'Ask: Is this actually bullish for Tesla?');
  assert.match(buildTeslaDemoInterpretationReply(), /Bull Case:/);
  assert.match(buildTeslaDemoInterpretationReply(), /Conclusion:/);
});

test('tesla demo history requires both earnings context and a tesla scenario card', () => {
  const scenarioCard = scenarioCardModule.buildAnalystScenarioCardPayload(
    scenarioDcfModule.buildAiSmartDcfReport(),
  );

  assert.equal(
    hasTeslaDemoHistory([
      { id: 'u1', role: 'user', content: 'Tell me about Tesla earnings' },
      { id: 'a1', role: 'assistant', content: '', meta: { earningsSummary: { ticker: 'TSLA' } } },
    ]),
    false,
  );

  assert.equal(
    hasTeslaDemoHistory([
      { id: 'u1', role: 'user', content: 'Tell me about Tesla earnings' },
      { id: 'a1', role: 'assistant', content: '', meta: { earningsSummary: { ticker: 'TSLA' } } },
      { id: 'u2', role: 'user', content: 'What happens to Tesla if rates drop 100bps?' },
      { id: 'a2', role: 'assistant', content: '', meta: { mode: 'scenario', scenarioCard } },
    ]),
    true,
  );
});

test('tesla guided demo interpretation branch returns deterministic bull bear framing', async () => {
  const scenarioCard = scenarioCardModule.buildAnalystScenarioCardPayload(
    scenarioDcfModule.buildAiSmartDcfReport(),
  );

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
            content: 'Tell me about Tesla earnings',
          },
          {
            id: 'a1',
            role: 'assistant',
            content: 'Tesla earnings summary',
            meta: {
              earningsSummary: {
                ticker: 'TSLA',
              },
            },
          },
          {
            id: 'u2',
            role: 'user',
            content: 'What happens to Tesla if rates drop 100bps?',
          },
          {
            id: 'a2',
            role: 'assistant',
            content: '',
            meta: {
              mode: 'scenario',
              scenarioCard,
            },
          },
          {
            id: 'u3',
            role: 'user',
            content: 'Is this bullish?',
          },
        ],
      }),
    }),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();

  assert.equal(payload.route, 'company_question');
  assert.equal(payload.mode, 'live');
  assert.match(payload.reply, /Bull Case:/);
  assert.match(payload.reply, /Bear Case:/);
  assert.match(payload.reply, /Conclusion:/);
});
