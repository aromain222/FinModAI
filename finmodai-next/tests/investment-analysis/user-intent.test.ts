import assert from 'node:assert/strict';
import test from 'node:test';

import { parseUserIntent } from '@/lib/execution/userIntent';

// ── Theme extraction ──────────────────────────────────────────────────────────

test('parseUserIntent: extracts ai theme', () => {
  const i = parseUserIntent('Build me an AI-focused 10-stock portfolio');
  assert.ok(i.themes.includes('ai'), `themes should include "ai", got: ${JSON.stringify(i.themes)}`);
});

test('parseUserIntent: extracts multiple themes', () => {
  const i = parseUserIntent('I want AI and space stocks, aggressive');
  assert.ok(i.themes.includes('ai'),    `expected ai in themes: ${JSON.stringify(i.themes)}`);
  assert.ok(i.themes.includes('space'), `expected space in themes: ${JSON.stringify(i.themes)}`);
});

test('parseUserIntent: no themes when request is generic', () => {
  const i = parseUserIntent('Build me a diversified 10-stock portfolio');
  assert.equal(i.themes.length, 0);
});

test('parseUserIntent: extracts semis theme', () => {
  const i = parseUserIntent('5 aggressive semiconductor picks');
  assert.ok(i.themes.includes('semis'), `expected semis: ${JSON.stringify(i.themes)}`);
});

// ── Risk profile ──────────────────────────────────────────────────────────────

test('parseUserIntent: aggressive keyword → aggressive risk profile', () => {
  const i = parseUserIntent('give me 5 aggressive growth stocks');
  assert.equal(i.risk_profile, 'aggressive');
});

test('parseUserIntent: conservative keyword → conservative risk profile', () => {
  const i = parseUserIntent('conservative dividend portfolio please');
  assert.equal(i.risk_profile, 'conservative');
});

test('parseUserIntent: no risk keyword → balanced', () => {
  const i = parseUserIntent('Build me a tech portfolio');
  assert.equal(i.risk_profile, 'balanced');
});

test('parseUserIntent: stable → conservative', () => {
  const i = parseUserIntent('something safe and stable');
  assert.equal(i.risk_profile, 'conservative');
});

// ── Position count ────────────────────────────────────────────────────────────

test('parseUserIntent: "10 stocks" → position_count 10', () => {
  const i = parseUserIntent('Build me a 10-stock portfolio');
  assert.equal(i.position_count, 10);
});

test('parseUserIntent: "5 picks" → position_count 5', () => {
  const i = parseUserIntent('give me 5 picks');
  assert.equal(i.position_count, 5);
});

test('parseUserIntent: "15 positions" → position_count 15', () => {
  const i = parseUserIntent('I want 15 positions in AI');
  assert.equal(i.position_count, 15);
});

test('parseUserIntent: no count → null', () => {
  const i = parseUserIntent('Build me a diversified portfolio');
  assert.equal(i.position_count, null);
});

test('parseUserIntent: count > 30 clamped to null', () => {
  const i = parseUserIntent('Give me 99 stocks');
  assert.equal(i.position_count, null);
});

// ── Capital ───────────────────────────────────────────────────────────────────

test('parseUserIntent: "$10k" → capital_usd 10000', () => {
  const i = parseUserIntent('Build me a $10k portfolio');
  assert.equal(i.capital_usd, 10_000);
});

test('parseUserIntent: "$1.5m" → capital_usd 1500000', () => {
  const i = parseUserIntent('allocate $1.5m to tech stocks');
  assert.equal(i.capital_usd, 1_500_000);
});

test('parseUserIntent: "$50,000" → capital_usd 50000', () => {
  const i = parseUserIntent('deploy $50,000 into AI names');
  assert.equal(i.capital_usd, 50_000);
});

test('parseUserIntent: no dollar amount → null', () => {
  const i = parseUserIntent('Build me a portfolio');
  assert.equal(i.capital_usd, null);
});

// ── Asset class ───────────────────────────────────────────────────────────────

test('parseUserIntent: default → common_stock', () => {
  const i = parseUserIntent('Build me a 10-stock portfolio');
  assert.equal(i.asset_class, 'common_stock');
});

test('parseUserIntent: "etf" in prompt → any', () => {
  const i = parseUserIntent('include ETFs in the portfolio');
  assert.equal(i.asset_class, 'any');
});

// ── Raw prompt preserved ──────────────────────────────────────────────────────

test('parseUserIntent: raw_prompt is preserved exactly', () => {
  const prompt = 'Build me a 5-stock aggressive AI portfolio with $20k';
  const i = parseUserIntent(prompt);
  assert.equal(i.raw_prompt, prompt);
});

// ── Combined ──────────────────────────────────────────────────────────────────

test('parseUserIntent: "5 aggressive AI and space picks with $20k" parses all fields', () => {
  const i = parseUserIntent('Give me 5 aggressive AI and space picks with $20k');
  assert.equal(i.position_count, 5);
  assert.equal(i.risk_profile,   'aggressive');
  assert.ok(i.themes.includes('ai'));
  assert.ok(i.themes.includes('space'));
  assert.equal(i.capital_usd, 20_000);
  assert.equal(i.asset_class, 'common_stock');
});
