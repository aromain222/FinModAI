import { getCache, setCache } from '@/lib/cache/memory';

export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<{ value: T; stale: boolean }> {
  const cachedValue = getCache<T>(key);
  if (cachedValue && !cachedValue.stale) {
    return { value: cachedValue.value, stale: false };
  }

  try {
    const value = await fetcher();
    setCache(key, value, ttlMs);
    return { value, stale: false };
  } catch (error) {
    if (cachedValue && cachedValue.stale) {
      return { value: cachedValue.value, stale: true };
    }
    throw error;
  }
}
