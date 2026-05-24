import type { WeeklyMemo } from '@/lib/pm/types';
import { listAlerts } from '@/lib/pm/alerts/alertStore';
import { listAgentViews } from '@/lib/pm/memory/agentViewStore';
import { listMemory } from '@/lib/pm/memory/memoryStore';
import { listDecisions } from '@/lib/pm/decisions/decisionStore';
import { listPositions } from '@/lib/pm/portfolio/positionStore';
import { listTheses, listThesisUpdates } from '@/lib/pm/thesis/thesisStore';
import { saveWeeklyMemo } from '@/lib/pm/reports/weeklyMemoStore';

function withinRange(date: string, start: string, end: string): boolean {
  return date.slice(0, 10) >= start && date.slice(0, 10) <= end;
}

function countBy<T extends string>(values: T[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

export async function generateWeeklyMemo(params: { weekStart: string; weekEnd: string }): Promise<WeeklyMemo> {
  const [positions, alerts, decisions, thesisUpdates, theses, agentViews, memories] = await Promise.all([
    listPositions({ limit: 500 }),
    listAlerts({ limit: 500 }),
    listDecisions({ limit: 500 }),
    listThesisUpdates({ limit: 500 }),
    listTheses({ limit: 500 }),
    listAgentViews({ limit: 500 }),
    listMemory({ limit: 100 }),
  ]);
  const weekAlerts = alerts.filter(alert => withinRange(alert.createdAt, params.weekStart, params.weekEnd));
  const weekDecisions = decisions.filter(decision => withinRange(decision.createdAt, params.weekStart, params.weekEnd));
  const weekUpdates = thesisUpdates.filter(update => withinRange(update.createdAt, params.weekStart, params.weekEnd));
  const disagreements = agentViews
    .filter(view => withinRange(view.createdAt, params.weekStart, params.weekEnd))
    .reduce<Record<string, Set<string>>>((acc, view) => {
      acc[view.ticker] = acc[view.ticker] ?? new Set<string>();
      acc[view.ticker].add(view.stance);
      return acc;
    }, {});
  const disagreementTickers = Object.entries(disagreements)
    .filter(([, stances]) => stances.size > 1)
    .map(([ticker]) => ticker);
  const openAlerts = alerts.filter(alert => !alert.resolvedAt && !alert.acknowledged);
  const pendingDecisions = decisions.filter(decision => decision.approvalStatus === 'pending');
  const themeCounts = countBy(positions.map(position => position.portfolioTheme ?? 'Unassigned'));
  const themePerformance = Object.fromEntries(
    Object.entries(themeCounts).map(([theme, count]) => [theme, `${count} tracked idea${count === 1 ? '' : 's'}`]),
  );
  const thesisHealth = countBy(theses.map(thesis => thesis.thesisStatus));
  const importantMemory = memories
    .slice()
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 3)
    .map(memory => `${memory.memoryType.replace(/_/g, ' ')}: ${memory.lesson}`);
  const materialDrift = weekUpdates
    .filter(update => update.shouldNotifyPM || Math.abs((update.convictionAfter ?? 0) - (update.convictionBefore ?? update.convictionAfter)) >= 10)
    .map(update => `${update.ticker}: ${update.thesisStatusBefore ?? 'new'} -> ${update.thesisStatusAfter}`);

  return saveWeeklyMemo({
    weekStart: params.weekStart,
    weekEnd: params.weekEnd,
    portfolioPerformance: `${positions.length} PM position${positions.length === 1 ? '' : 's'} tracked in the book.`,
    benchmarkComparison: null,
    winners: weekUpdates.filter(update => update.thesisStatusAfter === 'strengthening').map(update => update.ticker),
    losers: weekUpdates.filter(update => update.thesisStatusAfter === 'weakening' || update.thesisStatusAfter === 'broken').map(update => update.ticker),
    themePerformance,
    alertsSummary: weekAlerts.length > 0
      ? `${weekAlerts.length} material alert${weekAlerts.length === 1 ? '' : 's'}: ${weekAlerts.slice(0, 3).map(alert => alert.title).join('; ')}.`
      : 'No material PM alerts recorded.',
    thesisChanges: weekUpdates.map(update => `${update.ticker}: ${update.explanation}`),
    decisionsMade: weekDecisions.map(decision => `${decision.ticker}: ${decision.action} (${decision.approvalStatus})`),
    agentDisagreementSummary: disagreementTickers.length > 0
      ? `Agent disagreement appeared in ${disagreementTickers.join(', ')}.`
      : 'No material agent disagreement recorded.',
    narrativeSections: {
      'PM Read': [
        `Generated from persisted PM OS records only; no new agent analysis was run.`,
        `${openAlerts.length} open PM alert${openAlerts.length === 1 ? '' : 's'} and ${pendingDecisions.length} pending approval${pendingDecisions.length === 1 ? '' : 's'}.`,
        `Thesis health: ${Object.entries(thesisHealth).map(([status, count]) => `${status} ${count}`).join(', ') || 'no active theses'}.`,
      ].join(' '),
      'Action Queue': pendingDecisions.length > 0
        ? pendingDecisions.slice(0, 6).map(decision => `${decision.ticker}: ${decision.action.toUpperCase()} pending PM approval (${decision.confidence}% confidence).`).join('\n')
        : 'No pending PM approvals.',
      'Conviction Drift': materialDrift.length > 0
        ? materialDrift.slice(0, 8).join('\n')
        : 'No material conviction drift recorded this week.',
      'Institutional Memory': importantMemory.length > 0
        ? importantMemory.join('\n')
        : 'No high-importance PM memory yet.',
    },
    generatedAt: new Date().toISOString(),
  });
}
