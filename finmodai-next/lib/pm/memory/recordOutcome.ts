import type { PMMemory } from '@/lib/pm/types';
import { saveMemory } from '@/lib/pm/memory/memoryStore';

export async function recordOutcome(input: Omit<PMMemory, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): Promise<PMMemory> {
  return saveMemory({
    id: input.id ?? crypto.randomUUID(),
    memoryType: input.memoryType,
    lesson: input.lesson,
    relatedTickers: input.relatedTickers.map(ticker => ticker.toUpperCase()),
    relatedThemes: input.relatedThemes,
    importance: input.importance,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}
