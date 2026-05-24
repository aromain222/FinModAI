import type { WeeklyMemo } from '@/lib/pm/types';
import { listAlerts } from '@/lib/pm/alerts/alertStore';
import { listAgentViews } from '@/lib/pm/memory/agentViewStore';
import { listDecisions } from '@/lib/pm/decisions/decisionStore';
import { listPositions } from '@/lib/pm/portfolio/positionStore';
import { listThesisUpdates } from '@/lib/pm/thesis/thesisStore';
import { saveWeeklyMemo } from '@/lib/pm/reports/weeklyMemoStore';

function withinRange(date: string, start: string, end: string): boolean {
  return date.slice(0, 10) >= start && date.slice(0, 10) <= end;
}

export async function generateWeeklyMemo(params: { weekStart: string; weekEnd: string }): Promise<WeeklyMemo> {
  const [positions, alerts, decisions, thesisUpdates, agentViews] = await Promise.all([
    listPositions({ limit: 500 }),
    listAlerts({ limit: 500 }),
    listDecisions({ limit: 500 }),
    listThesisUpdates({ limit: 500 }),
    listAgentViews({ limit: 500 }),
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

  return saveWeeklyMemo({
    weekStart: params.weekStart,
    weekEnd: params.weekEnd,
    portfolioPerformance: `${positions.length} PM position${positions.length === 1 ? '' : 's'} tracked in the book.`,
    benchmarkComparison: null,
    winners: weekUpdates.filter(update => update.thesisStatusAfter === 'strengthening').map(update => update.ticker),
    losers: weekUpdates.filter(update => update.thesisStatusAfter === 'weakening' || update.thesisStatusAfter === 'broken').map(update => update.ticker),
    themePerformance: {},
    alertsSummary: weekAlerts.length > 0
      ? `${weekAlerts.length} material alert${weekAlerts.length === 1 ? '' : 's'}: ${weekAlerts.slice(0, 3).map(alert => alert.title).join('; ')}.`
      : 'No material PM alerts recorded.',
    thesisChanges: weekUpdates.map(update => `${update.ticker}: ${update.explanation}`),
    decisionsMade: weekDecisions.map(decision => `${decision.ticker}: ${decision.action} (${decision.approvalStatus})`),
    agentDisagreementSummary: disagreementTickers.length > 0
      ? `Agent disagreement appeared in ${disagreementTickers.join(', ')}.`
      : 'No material agent disagreement recorded.',
    narrativeSections: {
      'PM Read': 'Generated from persisted PM OS records only; no new agent analysis was run.',
    },
    generatedAt: new Date().toISOString(),
  });
}
