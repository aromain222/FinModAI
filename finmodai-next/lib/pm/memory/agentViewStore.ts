import type { AgentView } from '@/lib/pm/types';
import { agentViewSchema } from '@/lib/pm/schemas';
import { getLatestPMRecord, listPMRecords, upsertPMRecord } from '@/lib/pm/persistence/store';

export async function listAgentViews(params: { ticker?: string; limit?: number } = {}): Promise<AgentView[]> {
  return listPMRecords<AgentView>('pm_agent_views', params);
}

export async function getLatestAgentView(ticker: string): Promise<AgentView | null> {
  return getLatestPMRecord<AgentView>('pm_agent_views', ticker);
}

export async function saveAgentView(input: unknown): Promise<AgentView> {
  const parsed = agentViewSchema.parse(input);
  return upsertPMRecord('pm_agent_views', parsed);
}
