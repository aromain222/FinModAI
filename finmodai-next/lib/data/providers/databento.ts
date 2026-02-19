import { serverEnv } from '@/lib/env/server';
import type { ProviderResult } from './types';

export async function fetchDatabentoStatus(ticker: string): Promise<ProviderResult<{ ok: boolean }>> {
  const apiKey = serverEnv.DATABENTO_API_KEY;
  if (!apiKey) {
    return { ok: false, error: { provider: 'databento', message: 'DATABENTO_API_KEY missing' } };
  }
  return {
    ok: false,
    error: {
      provider: 'databento',
      message: 'Databento provider not configured: dataset/symbol mapping required',
      code: 'missing_dataset',
    },
  };
}
