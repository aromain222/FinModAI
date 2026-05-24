import type { PMMemory } from '@/lib/pm/types';
import { listMemory } from '@/lib/pm/memory/memoryStore';

function scoreMemory(memory: PMMemory, params: { ticker?: string; themes?: string[] }): number {
  const ticker = params.ticker?.toUpperCase();
  const tickerHit = ticker && memory.relatedTickers.includes(ticker) ? 25 : 0;
  const themeHits = (params.themes ?? []).filter(theme => memory.relatedThemes.includes(theme)).length * 10;
  const ageDays = Math.max(0, (Date.now() - new Date(memory.createdAt).getTime()) / 86_400_000);
  const recency = Math.max(0, 20 - ageDays / 7);
  return memory.importance + tickerHit + themeHits + recency;
}

export async function getRelevantMemory(params: {
  ticker?: string;
  themes?: string[];
  limit?: number;
}): Promise<PMMemory[]> {
  const rows = await listMemory({ ticker: params.ticker, limit: 250 });
  return rows
    .sort((a, b) => scoreMemory(b, params) - scoreMemory(a, params))
    .slice(0, params.limit ?? 10);
}
