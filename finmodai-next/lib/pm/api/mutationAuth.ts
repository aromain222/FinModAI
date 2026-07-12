import type { NextRequest } from 'next/server';
import { hasValidAccessSession } from '@/lib/auth/accessSession';

export type PMMutationAuthMethod = 'cron_secret' | 'execution_secret' | 'access_session' | 'user_session';

export type PMMutationAuthResult = {
  authorized: boolean;
  method: PMMutationAuthMethod | null;
};

export function isPMMutationRequest(req: NextRequest): boolean {
  return req.nextUrl.pathname.startsWith('/api/pm/')
    && req.method !== 'GET'
    && req.method !== 'HEAD'
    && req.method !== 'OPTIONS';
}

export async function authorizePMMutationRequest(
  req: NextRequest,
  options: { userSessionAuthenticated?: boolean } = {},
): Promise<PMMutationAuthResult> {
  const authorization = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authorization === `Bearer ${cronSecret}`) {
    return { authorized: true, method: 'cron_secret' };
  }

  const executionSecret = process.env.EXECUTION_CRON_SECRET;
  if (executionSecret && authorization === `Bearer ${executionSecret}`) {
    return { authorized: true, method: 'execution_secret' };
  }

  if (await hasValidAccessSession(req)) {
    return { authorized: true, method: 'access_session' };
  }

  if (options.userSessionAuthenticated) {
    return { authorized: true, method: 'user_session' };
  }

  return { authorized: false, method: null };
}
