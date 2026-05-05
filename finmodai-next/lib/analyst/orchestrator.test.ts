import test from 'node:test';
import assert from 'node:assert/strict';
import { detectMode, buildOrchestratorMessages } from './orchestrator';
import type { OrchestratorContext } from './orchestrator';

// ── Minimal context fixture ────────────────────────────────────────────────

const BASE_CTX: OrchestratorContext = {
  primaryTicker:     'NVDA',
  score:             8.4,
  signal:            'green',
  horizonWeeks:      6,
  breakdown: {
    forecastSignal:   8.8,
    catalystStrength: 9.0,
    momentum:         8.5,
    earningsSetup:    9.2,
    valuationSignal:  4.8,
    riskAdjustment:   5.5,
  },
  primaryReason:     'Blackwell ramp — data centre demand above expectations',
  mainRisk:          'Supply shock reprices sharply',
  forecastReturnPct: 14.3,
  catalystCount:     5,
  events:            [{ title: 'Q2 earnings beat', direction: 'positive', magnitude: 'high' }],
  recentPrices:      [800, 820, 815, 830, 855],
  peers:             [],
  history:           [],
};

// ── detectMode ────────────────────────────────────────────────────────────

test('detectMode: explain keyword', () => {
  assert.equal(detectMode('why is NVDA ranked so high?').mode, 'explain');
});

test('detectMode: score keyword → explain', () => {
  assert.equal(detectMode('explain the score breakdown').mode, 'explain');
});

test('detectMode: evaluate keyword', () => {
  assert.equal(detectMode('should I buy NVDA right now?').mode, 'evaluate');
});

test('detectMode: verdict keyword → evaluate', () => {
  assert.equal(detectMode('give me your verdict on entry timing').mode, 'evaluate');
});

test('detectMode: challenge keyword', () => {
  assert.equal(detectMode('I think you are too optimistic — challenge the bear case').mode, 'challenge');
});

test('detectMode: pushback keyword → challenge', () => {
  assert.equal(detectMode('push back on the bull thesis').mode, 'challenge');
});

test('detectMode: compare with named peer', () => {
  const result = detectMode('NVDA vs AMD — which is better?', BASE_CTX);
  assert.equal(result.mode, 'compare');
});

test('detectMode: compare without peer falls back', () => {
  // "vs" appears but no second ticker known — should downgrade
  const result = detectMode('versus nothing', BASE_CTX);
  // compare downgraded; next match or explain fallback
  assert.ok(result.mode !== 'compare');
});

test('detectMode: pitch keyword', () => {
  assert.equal(detectMode('write me a pitch for NVDA').mode, 'pitch');
});

test('detectMode: investment case → pitch', () => {
  assert.equal(detectMode('draft an investment case memo').mode, 'pitch');
});

test('detectMode: no keyword → explain fallback', () => {
  const result = detectMode('what do you think?');
  assert.equal(result.mode, 'explain');
  assert.equal(result.confidence, 'low');
});

test('detectMode: explicit mode wins over auto detection (used in route)', () => {
  // This just verifies the auto-detect; route layer applies explicit override
  const result = detectMode('buy NVDA?');
  assert.equal(result.mode, 'evaluate'); // dominant pattern
});

// ── buildOrchestratorMessages ─────────────────────────────────────────────

test('buildOrchestratorMessages: always starts with system role', () => {
  const msgs = buildOrchestratorMessages('explain', 'Why is NVDA ranked this way?', BASE_CTX);
  assert.equal(msgs[0].role, 'system');
});

test('buildOrchestratorMessages: last message is user role', () => {
  const msgs = buildOrchestratorMessages('evaluate', 'Should I buy?', BASE_CTX);
  assert.equal(msgs.at(-1)?.role, 'user');
});

test('buildOrchestratorMessages: system prompt contains mode-specific instruction', () => {
  const msgs = buildOrchestratorMessages('challenge', 'Push back.', BASE_CTX);
  const system = msgs[0].content;
  assert.ok(system.includes('skeptic') || system.includes('bear case') || system.includes('pushback'));
});

test('buildOrchestratorMessages: history is interleaved before final user turn', () => {
  const ctx: OrchestratorContext = {
    ...BASE_CTX,
    history: [
      { role: 'user',      content: 'First question' },
      { role: 'assistant', content: 'First answer' },
    ],
  };
  const msgs = buildOrchestratorMessages('explain', 'Second question', ctx);
  // system + 2 history + 1 user = 4
  assert.equal(msgs.length, 4);
  assert.equal(msgs[1].role, 'user');
  assert.equal(msgs[2].role, 'assistant');
  assert.equal(msgs[3].role, 'user');
});

test('buildOrchestratorMessages: user message embeds ticker and score', () => {
  const msgs = buildOrchestratorMessages('pitch', 'Write a pitch.', BASE_CTX);
  const userContent = msgs.at(-1)?.content ?? '';
  assert.ok(userContent.includes('NVDA'));
  assert.ok(userContent.includes('8.4'));
});

test('buildOrchestratorMessages: compare mode injects peer block', () => {
  const ctx: OrchestratorContext = {
    ...BASE_CTX,
    peers: [{
      ticker:        'AMD',
      score:         6.2,
      signal:        'yellow',
      primaryReason: 'Momentum slowing',
      mainRisk:      'Datacenter share loss',
      breakdown: {
        forecastSignal:   6.0,
        catalystStrength: 5.5,
        momentum:         6.5,
        earningsSetup:    6.0,
        valuationSignal:  5.0,
        riskAdjustment:   7.0,
      },
    }],
  };
  const msgs = buildOrchestratorMessages('compare', 'Compare NVDA vs AMD', ctx);
  const userContent = msgs.at(-1)?.content ?? '';
  assert.ok(userContent.includes('AMD'));
});
