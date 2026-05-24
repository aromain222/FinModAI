import type { PMAlert } from '@/lib/pm/types';
import { pmAlertSchema } from '@/lib/pm/schemas';
import { listPMRecords, patchPMRecord, upsertPMRecord } from '@/lib/pm/persistence/store';

export async function listAlerts(params: { ticker?: string; limit?: number } = {}): Promise<PMAlert[]> {
  return listPMRecords<PMAlert>('pm_alerts', params);
}

export async function saveAlert(input: unknown): Promise<PMAlert> {
  const parsed = pmAlertSchema.parse(input);
  return upsertPMRecord('pm_alerts', parsed);
}

export async function updateAlert(id: string, patch: Partial<PMAlert>): Promise<PMAlert | null> {
  return patchPMRecord<PMAlert>('pm_alerts', id, patch);
}
