export type ProviderError = {
  provider: string;
  message: string;
  status?: number;
  code?: string;
};

export type ProviderResult<T> =
  | { ok: true; data: T; raw?: any; latencyMs?: number; cached?: boolean }
  | { ok: false; error: ProviderError; raw?: any; latencyMs?: number; cached?: boolean };

export type CachedEntry<T> = {
  expiresAt: number;
  value: ProviderResult<T>;
};
