import type { InvestmentDecision } from '@/lib/pm/types';
import { investmentDecisionSchema } from '@/lib/pm/schemas';
import { listPMRecords, patchPMRecord, upsertPMRecord } from '@/lib/pm/persistence/store';

export async function listDecisions(params: { ticker?: string; limit?: number } = {}): Promise<InvestmentDecision[]> {
  return listPMRecords<InvestmentDecision>('pm_investment_decisions', params);
}

export async function saveDecision(input: unknown): Promise<InvestmentDecision> {
  const now = new Date().toISOString();
  const parsed = investmentDecisionSchema.parse({
    approvalStatus: 'pending',
    updatedAt: now,
    ...input as Record<string, unknown>,
  });
  return upsertPMRecord('pm_investment_decisions', parsed);
}

export async function updateDecision(id: string, patch: Partial<InvestmentDecision>): Promise<InvestmentDecision | null> {
  const approvedAt = patch.approvalStatus === 'approved' ? new Date().toISOString() : patch.approvedAt;
  return patchPMRecord<InvestmentDecision>('pm_investment_decisions', id, { ...patch, approvedAt });
}
