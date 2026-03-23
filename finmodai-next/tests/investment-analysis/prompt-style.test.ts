import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ANALYST_SYSTEM_PROMPT,
  COMPANY_ANALYSIS_PROMPT,
  MARKET_QUESTION_PROMPT,
} from '@/lib/analyst/prompts';
import {
  INVESTMENT_EVENT_UPDATE_SUMMARY_SYSTEM_PROMPT,
  INVESTMENT_MEMO_SYSTEM_PROMPT,
} from '@/lib/investment-analysis/memoPrompts';

test('analyst prompts enforce concise finance-native house style', () => {
  assert.match(
    ANALYST_SYSTEM_PROMPT,
    /serious early-career buy-side analyst/i,
  );
  assert.match(ANALYST_SYSTEM_PROMPT, /short paragraphs/i);
  assert.match(ANALYST_SYSTEM_PROMPT, /generic AI phrasing/i);
});

test('company analysis prompt requires judgment-first short-paragraph answers', () => {
  assert.match(COMPANY_ANALYSIS_PROMPT, /lead with the single most important takeaway/i);
  assert.match(COMPANY_ANALYSIS_PROMPT, /Each paragraph should do one job/i);
  assert.match(COMPANY_ANALYSIS_PROMPT, /driver and mechanism/i);
});

test('market question prompt emphasizes transmission path depth', () => {
  assert.match(MARKET_QUESTION_PROMPT, /primary, secondary, and tertiary effects/i);
  assert.match(MARKET_QUESTION_PROMPT, /first paragraph for the conclusion/i);
});

test('investment memo prompts carry anti-filler writing guardrails', () => {
  assert.match(INVESTMENT_MEMO_SYSTEM_PROMPT, /Lead with the judgment, not the setup/i);
  assert.match(INVESTMENT_MEMO_SYSTEM_PROMPT, /well positioned/i);
  assert.match(INVESTMENT_MEMO_SYSTEM_PROMPT, /the main driver is/i);
});

test('event update prompt keeps the output delta-focused', () => {
  assert.match(INVESTMENT_EVENT_UPDATE_SUMMARY_SYSTEM_PROMPT, /Focus on the delta, not the entire business/i);
  assert.match(INVESTMENT_EVENT_UPDATE_SUMMARY_SYSTEM_PROMPT, /whatChanged/i);
  assert.match(INVESTMENT_EVENT_UPDATE_SUMMARY_SYSTEM_PROMPT, /what matters most now/i);
});
