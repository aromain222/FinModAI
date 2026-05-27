import type { AlpacaPaperAccount, AlpacaPaperOrder, AlpacaPaperOrderRequest } from '@/lib/execution/types';

const DEFAULT_PAPER_BASE_URL = 'https://paper-api.alpaca.markets';

export function alpacaPaperBaseUrl(): string {
  return (process.env.ALPACA_PAPER_BASE_URL || DEFAULT_PAPER_BASE_URL).replace(/\/+$/, '');
}

export function alpacaPaperCredentials(): { configured: boolean; keyId: string; secretKey: string; baseUrl: string } {
  const keyId = process.env.ALPACA_API_KEY_ID || process.env.APCA_API_KEY_ID || '';
  const secretKey = process.env.ALPACA_SECRET_KEY || process.env.APCA_API_SECRET_KEY || '';
  return {
    configured: Boolean(keyId && secretKey),
    keyId,
    secretKey,
    baseUrl: alpacaPaperBaseUrl(),
  };
}

async function alpacaFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const credentials = alpacaPaperCredentials();
  if (!credentials.configured) {
    throw new Error('Alpaca paper credentials are not configured.');
  }

  const res = await fetch(`${credentials.baseUrl}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'APCA-API-KEY-ID': credentials.keyId,
      'APCA-API-SECRET-KEY': credentials.secretKey,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });

  const text = await res.text();
  const payload = text ? JSON.parse(text) as unknown : null;

  if (!res.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
        ? payload.message
        : `Alpaca paper request failed with status ${res.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export async function getAlpacaPaperAccount(): Promise<AlpacaPaperAccount> {
  return alpacaFetch<AlpacaPaperAccount>('/v2/account');
}

export async function listAlpacaPaperOrders(limit = 50): Promise<AlpacaPaperOrder[]> {
  const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  return alpacaFetch<AlpacaPaperOrder[]>(`/v2/orders?status=all&limit=${boundedLimit}&direction=desc`);
}

export async function submitAlpacaPaperOrder(order: AlpacaPaperOrderRequest): Promise<AlpacaPaperOrder> {
  return alpacaFetch<AlpacaPaperOrder>('/v2/orders', {
    method: 'POST',
    body: JSON.stringify(order),
  });
}
