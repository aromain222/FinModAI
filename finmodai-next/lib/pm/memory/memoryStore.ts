import type { PMMemory } from '@/lib/pm/types';
import { pmMemorySchema } from '@/lib/pm/schemas';
import { listPMRecords, upsertPMRecord } from '@/lib/pm/persistence/store';

export async function listMemory(params: { ticker?: string; limit?: number } = {}): Promise<PMMemory[]> {
  const rows = await listPMRecords<PMMemory>('pm_memory', { limit: params.limit ?? 100 });
  if (!params.ticker) return rows;
  const ticker = params.ticker.toUpperCase();
  return rows.filter(row => row.relatedTickers.includes(ticker));
}

export async function saveMemory(input: unknown): Promise<PMMemory> {
  const parsed = pmMemorySchema.parse(input);
  return upsertPMRecord('pm_memory', parsed);
}
