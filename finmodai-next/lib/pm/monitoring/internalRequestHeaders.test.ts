import assert from 'node:assert/strict';
import test from 'node:test';
import { internalRequestHeaders } from '@/lib/pm/monitoring/internalRequestHeaders';

test('internal requests use the server-side Vercel bypass when no caller header exists', () => {
  const previous = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'server-only-test-token';
  try {
    const headers = internalRequestHeaders();
    assert.equal(headers.get('x-vercel-protection-bypass'), 'server-only-test-token');
  } finally {
    if (previous === undefined) delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    else process.env.VERCEL_AUTOMATION_BYPASS_SECRET = previous;
  }
});

test('caller protection bypass takes precedence over the server-side fallback', () => {
  const previous = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'server-only-test-token';
  try {
    const headers = internalRequestHeaders(new Headers({ 'x-vercel-protection-bypass': 'caller-token' }));
    assert.equal(headers.get('x-vercel-protection-bypass'), 'caller-token');
  } finally {
    if (previous === undefined) delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    else process.env.VERCEL_AUTOMATION_BYPASS_SECRET = previous;
  }
});
