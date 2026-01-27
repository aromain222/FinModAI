import 'server-only';

import { promises as fs } from 'fs';
import path from 'path';

type CacheEntry<T> = {
  payload: T;
  updatedAt: string;
};

const CACHE_PATH = path.join(process.cwd(), '.market-brief-headlines-cache.json');

const readCacheFile = async () => {
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf-8');
    return JSON.parse(raw) as Record<string, CacheEntry<any>>;
  } catch {
    return {};
  }
};

const writeCacheFile = async (data: Record<string, CacheEntry<any>>) => {
  try {
    await fs.writeFile(CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // Best-effort cache: ignore write failures.
  }
};

export async function getMarketBriefHeadlinesCache<T>(key: string): Promise<CacheEntry<T> | null> {
  const cache = await readCacheFile();
  return cache[key] ?? null;
}

export async function setMarketBriefHeadlinesCache<T>(key: string, payload: T, updatedAt: string) {
  const cache = await readCacheFile();
  cache[key] = { payload, updatedAt };
  await writeCacheFile(cache);
}

