import type { Metadata } from 'next';
import { AgentOffice } from '@/components/agents/AgentOffice';

export const metadata: Metadata = {
  title: 'Agent Office — CapitalBase',
  description: 'Inspect CapitalBase agent activity, latest outputs, and conviction changes.',
};

export default function AgentOfficePage() {
  return <AgentOffice />;
}
