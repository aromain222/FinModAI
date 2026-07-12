import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { expectedAccessSessionToken } from '@/lib/auth/accessSession';
import { authorizePMMutationRequest, isPMMutationRequest } from './mutationAuth';

const ORIGINAL_ENV = {
  accessPassword: process.env.ACCESS_PASSWORD,
  cookieSecret: process.env.COOKIE_SECRET,
  cronSecret: process.env.CRON_SECRET,
  executionSecret: process.env.EXECUTION_CRON_SECRET,
};

test.afterEach(() => {
  process.env.ACCESS_PASSWORD = ORIGINAL_ENV.accessPassword;
  process.env.COOKIE_SECRET = ORIGINAL_ENV.cookieSecret;
  process.env.CRON_SECRET = ORIGINAL_ENV.cronSecret;
  process.env.EXECUTION_CRON_SECRET = ORIGINAL_ENV.executionSecret;
});

test('PM mutation guard accepts CRON_SECRET bearer and rejects an invalid bearer', async () => {
  process.env.CRON_SECRET = 'cron-test-secret';
  delete process.env.ACCESS_PASSWORD;
  const valid = new NextRequest('https://capital-base.com/api/pm/positions', {
    method: 'POST', headers: { authorization: 'Bearer cron-test-secret' },
  });
  const invalid = new NextRequest('https://capital-base.com/api/pm/positions', {
    method: 'POST', headers: { authorization: 'Bearer wrong' },
  });

  assert.equal((await authorizePMMutationRequest(valid)).method, 'cron_secret');
  assert.equal((await authorizePMMutationRequest(invalid)).authorized, false);
});

test('PM mutation guard accepts the signed CapitalBase access session', async () => {
  process.env.ACCESS_PASSWORD = 'portfolio-password';
  process.env.COOKIE_SECRET = 'cookie-secret';
  delete process.env.CRON_SECRET;
  const token = await expectedAccessSessionToken();
  const request = new NextRequest('https://capital-base.com/api/pm/theses', {
    method: 'PATCH', headers: { cookie: `cb_access=${token}` },
  });

  assert.equal((await authorizePMMutationRequest(request)).method, 'access_session');
});

test('PM mutation detection excludes reads and covers all write verbs', () => {
  assert.equal(isPMMutationRequest(new NextRequest('https://capital-base.com/api/pm/positions')), false);
  assert.equal(isPMMutationRequest(new NextRequest('https://capital-base.com/api/pm/reset', { method: 'DELETE' })), true);
  assert.equal(isPMMutationRequest(new NextRequest('https://capital-base.com/api/events', { method: 'POST' })), false);
});
