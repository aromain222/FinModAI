import assert from 'node:assert/strict';
import test from 'node:test';
import { repairTruncatedJson } from '@/lib/pm/dailyBrief/repairJson';

test('returns complete JSON unchanged apart from leading noise', () => {
  const repaired = repairTruncatedJson('```json\n{"a":1,"b":[2,3]}');
  assert.deepEqual(JSON.parse(repaired!), { a: 1, b: [2, 3] });
});

test('repairs JSON cut mid-array-element (the observed production failure)', () => {
  const raw = '{"executiveSummary":["one","two"],"positionViews":[{"ticker":"AMD","action":"hold"},{"ticker":"MSFT","act';
  const parsed = JSON.parse(repairTruncatedJson(raw)!);
  assert.deepEqual(parsed.executiveSummary, ['one', 'two']);
  assert.equal(parsed.positionViews.length, 1);
  assert.equal(parsed.positionViews[0].ticker, 'AMD');
});

test('repairs JSON cut inside a string value', () => {
  const raw = '{"a":"complete","b":{"c":"truncated mid sent';
  const parsed = JSON.parse(repairTruncatedJson(raw)!);
  assert.equal(parsed.a, 'complete');
});

test('repairs JSON cut after a dangling key', () => {
  const raw = '{"views":[{"t":"A","n":1}],"summary":';
  const parsed = JSON.parse(repairTruncatedJson(raw)!);
  assert.equal(parsed.views[0].t, 'A');
});

test('returns null for unrecoverable input', () => {
  assert.equal(repairTruncatedJson('no json here'), null);
  assert.equal(repairTruncatedJson(''), null);
});
