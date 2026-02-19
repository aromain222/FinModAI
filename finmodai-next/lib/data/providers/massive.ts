import { serverEnv } from '@/lib/env/server';
import type { ProviderResult } from './types';

export async function fetchMassiveStatus(ticker: string): Promise<ProviderResult<{ ok: boolean }>> {
  const apiKey = serverEnv.MASSIVE_API_KEY;
  if (!apiKey) {
    return { ok: false, error: { provider: 'massive', message: 'MASSIVE_API_KEY missing' } };
  }
  return {
    ok: false,
    error: {
      provider: 'massive',
      message: 'MASSIVE provider not configured: set MASSIVE_BASE_URL to enable health checks',
      code: 'missing_base_url',
    },
  };
}
