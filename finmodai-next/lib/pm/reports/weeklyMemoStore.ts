import type { WeeklyMemo } from '@/lib/pm/types';
import { weeklyMemoSchema } from '@/lib/pm/schemas';
import { listPMRecords, patchPMRecord, upsertPMRecord } from '@/lib/pm/persistence/store';

export async function listWeeklyMemos(params: { limit?: number } = {}): Promise<WeeklyMemo[]> {
  return listPMRecords<WeeklyMemo>('pm_weekly_memos', { limit: params.limit ?? 52 });
}

export async function saveWeeklyMemo(input: unknown): Promise<WeeklyMemo> {
  const parsed = weeklyMemoSchema.parse(input);
  return upsertPMRecord('pm_weekly_memos', parsed);
}

export async function updateWeeklyMemo(id: string, patch: Partial<WeeklyMemo>): Promise<WeeklyMemo | null> {
  return patchPMRecord<WeeklyMemo>('pm_weekly_memos', id, patch);
}
