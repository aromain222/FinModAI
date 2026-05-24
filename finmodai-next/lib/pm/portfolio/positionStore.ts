import type { PortfolioPosition } from '@/lib/pm/types';
import { portfolioPositionSchema } from '@/lib/pm/schemas';
import { listPMRecords, patchPMRecord, upsertPMRecord } from '@/lib/pm/persistence/store';

export async function listPositions(params: { ticker?: string; limit?: number } = {}): Promise<PortfolioPosition[]> {
  return listPMRecords<PortfolioPosition>('pm_positions', params);
}

export async function savePosition(input: unknown): Promise<PortfolioPosition> {
  const now = new Date().toISOString();
  const parsed = portfolioPositionSchema.parse({
    updatedAt: now,
    ...input as Record<string, unknown>,
  });
  return upsertPMRecord('pm_positions', parsed);
}

export async function updatePosition(id: string, patch: Partial<PortfolioPosition>): Promise<PortfolioPosition | null> {
  return patchPMRecord<PortfolioPosition>('pm_positions', id, patch);
}
