import type { PositionThesis, ThesisUpdate } from '@/lib/pm/types';
import { positionThesisSchema, thesisUpdateSchema } from '@/lib/pm/schemas';
import { getLatestPMRecord, listPMRecords, patchPMRecord, upsertPMRecord } from '@/lib/pm/persistence/store';

export async function listTheses(params: { ticker?: string; limit?: number } = {}): Promise<PositionThesis[]> {
  return listPMRecords<PositionThesis>('pm_position_theses', params);
}

export async function getLatestThesis(ticker: string): Promise<PositionThesis | null> {
  return getLatestPMRecord<PositionThesis>('pm_position_theses', ticker);
}

export async function saveThesis(input: unknown): Promise<PositionThesis> {
  const now = new Date().toISOString();
  const parsed = positionThesisSchema.parse({
    updatedAt: now,
    ...input as Record<string, unknown>,
  });
  return upsertPMRecord('pm_position_theses', parsed);
}

export async function updateThesisRecord(id: string, patch: Partial<PositionThesis>): Promise<PositionThesis | null> {
  return patchPMRecord<PositionThesis>('pm_position_theses', id, patch);
}

export async function saveThesisUpdate(input: unknown): Promise<ThesisUpdate> {
  const parsed = thesisUpdateSchema.parse(input);
  return upsertPMRecord('pm_thesis_updates', parsed);
}

export async function listThesisUpdates(params: { ticker?: string; limit?: number } = {}): Promise<ThesisUpdate[]> {
  return listPMRecords<ThesisUpdate>('pm_thesis_updates', params);
}
