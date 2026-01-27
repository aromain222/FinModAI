type CacheEntry<T> = {
  value: T;
  updatedAt: number;
  ttlMs: number;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<any>>();

export function get<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) return null;
  return entry.value as T;
}

export function set<T>(key: string, value: T, ttlMs: number) {
  const now = Date.now();
  store.set(key, { value, ttlMs, updatedAt: now, expiresAt: now + ttlMs });
}

export function getCache<T>(key: string): { value: T; stale: boolean } | null {
  const entry = store.get(key);
  if (!entry) return null;
  const stale = Date.now() > entry.expiresAt;
  return { value: entry.value as T, stale };
}

export function setCache<T>(key: string, value: T, ttlMs: number) {
  set(key, value, ttlMs);
}

export async function cachedFetch<T>(params: {
  key: string;
  ttlMs: number;
  fetcher: () => Promise<T>;
}): Promise<{ value: T | null; stale: boolean; error?: { code?: string; message: string } }> {
  const cached = getCache<T>(params.key);
  if (cached && !cached.stale) {
    return { value: cached.value, stale: false };
  }
  if (cached && cached.stale) {
    params
      .fetcher()
      .then((value) => setCache(params.key, value, params.ttlMs))
      .catch(() => {});
    return { value: cached.value, stale: true };
  }

  try {
    const value = await params.fetcher();
    setCache(params.key, value, params.ttlMs);
    return { value, stale: false };
  } catch (error: any) {
    const message = error?.message || 'Fetch failed';
    const code = typeof error?.code === 'string' ? error.code : undefined;
    return { value: null, stale: true, error: { code, message } };
  }
}
