import type {
  AgentView,
  ConvictionDriftSummary,
  ImpactDirection,
  PMAlert,
  PositionThesis,
} from '@/lib/pm/types';

function avg(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function stanceCounts(views: AgentView[]): Record<AgentView['stance'], number> {
  return views.reduce<Record<AgentView['stance'], number>>((counts, view) => {
    counts[view.stance] += 1;
    return counts;
  }, { bullish: 0, bearish: 0, neutral: 0, mixed: 0 });
}

function dominantStance(views: AgentView[]): AgentView['stance'] {
  const counts = stanceCounts(views);
  const ordered = Object.entries(counts).sort((a, b) => b[1] - a[1]) as Array<[AgentView['stance'], number]>;
  return ordered[0]?.[1] ? ordered[0][0] : 'neutral';
}

function disagreementScore(views: AgentView[]): number {
  if (views.length <= 1) return 0;
  const counts = stanceCounts(views);
  const bullBearConflict = Math.min(counts.bullish, counts.bearish) * 28;
  const nonConsensus = views.length - Math.max(counts.bullish, counts.bearish, counts.neutral, counts.mixed);
  return clampPct(bullBearConflict + nonConsensus * 12 + counts.mixed * 10);
}

function thesisAgeDays(thesis: PositionThesis | null | undefined): number | null {
  const reviewed = thesis?.lastReviewedAt ?? thesis?.updatedAt ?? thesis?.createdAt;
  if (!reviewed) return null;
  const ms = Date.now() - new Date(reviewed).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function impactFor(type: ConvictionDriftSummary['driftType']): ImpactDirection {
  if (type === 'strengthening') return 'bullish';
  if (type === 'weakening' || type === 'increasing_uncertainty' || type === 'thesis_decay') return 'bearish';
  if (type === 'agent_disagreement' || type === 'fragmented_conviction') return 'mixed';
  return 'neutral';
}

export function evaluateConvictionDrift(params: {
  ticker: string;
  currentView: AgentView;
  previousView?: AgentView | null;
  recentViews?: AgentView[];
  thesis?: PositionThesis | null;
}): ConvictionDriftSummary {
  const ticker = params.ticker.toUpperCase();
  const recentViews = [params.currentView, ...(params.recentViews ?? [])]
    .filter((view, index, arr) => arr.findIndex(item => item.id === view.id) === index)
    .slice(0, 12);
  const relevantPrior = params.previousView
    ?? recentViews.find(view => view.id !== params.currentView.id && view.agentName === params.currentView.agentName)
    ?? null;
  const convictionBefore = relevantPrior?.conviction ?? params.thesis?.convictionScore ?? null;
  const convictionAfter = params.currentView.conviction;
  const convictionDelta = convictionBefore === null ? null : convictionAfter - convictionBefore;
  const disagreement = disagreementScore(recentViews);
  const dominant = dominantStance(recentViews);
  const avgConviction = clampPct(avg(recentViews.map(view => view.conviction)));
  const age = thesisAgeDays(params.thesis);
  const changedFactors: string[] = [];

  let driftType: ConvictionDriftSummary['driftType'] = 'stable';
  if (params.previousView && params.previousView.stance !== params.currentView.stance) {
    driftType = params.currentView.stance === 'bullish' ? 'strengthening'
      : params.currentView.stance === 'bearish' ? 'weakening'
      : 'increasing_uncertainty';
    changedFactors.push('stance_flip');
  }
  if (convictionDelta !== null && convictionDelta >= 12) {
    driftType = 'strengthening';
    changedFactors.push('conviction_up');
  }
  if (convictionDelta !== null && convictionDelta <= -12) {
    driftType = 'weakening';
    changedFactors.push('conviction_down');
  }
  if (disagreement >= 55 && stanceCounts(recentViews).bullish > 0 && stanceCounts(recentViews).bearish > 0) {
    driftType = 'agent_disagreement';
    changedFactors.push('agent_disagreement');
  } else if (disagreement >= 45) {
    driftType = 'fragmented_conviction';
    changedFactors.push('fragmented_conviction');
  }
  if (avgConviction < 48 && recentViews.length >= 2) {
    driftType = 'increasing_uncertainty';
    changedFactors.push('low_average_conviction');
  }
  if (age !== null && age >= 21 && params.thesis?.thesisStatus === 'under_review') {
    driftType = 'thesis_decay';
    changedFactors.push('stale_thesis');
  }

  const material = driftType !== 'stable'
    && (Math.abs(convictionDelta ?? 0) >= 10 || disagreement >= 55 || params.previousView?.stance !== params.currentView.stance || driftType === 'thesis_decay');
  const severity: ConvictionDriftSummary['severity'] = driftType === 'weakening' || driftType === 'agent_disagreement'
    ? 'high'
    : driftType === 'thesis_decay' || driftType === 'increasing_uncertainty'
      ? 'medium'
      : material
        ? 'medium'
        : 'info';
  const impactDirection = impactFor(driftType);
  const deltaText = convictionDelta === null ? 'no prior conviction' : `${convictionDelta >= 0 ? '+' : ''}${convictionDelta} pts`;
  const reason = driftType === 'stable'
    ? `${ticker} conviction is stable. Current ${params.currentView.agentName} read is ${params.currentView.stance} at ${convictionAfter}% (${deltaText}).`
    : `${ticker} conviction drift: ${driftType.replace(/_/g, ' ')}. ${params.currentView.agentName} is ${params.currentView.stance} at ${convictionAfter}% (${deltaText}); disagreement score ${disagreement}/100.`;

  return {
    ticker,
    driftType,
    material,
    severity,
    impactDirection,
    confidence: clampPct(Math.max(convictionAfter, avgConviction)),
    convictionBefore,
    convictionAfter,
    convictionDelta,
    disagreementScore: disagreement,
    dominantStance: dominant,
    reason,
    changedFactors: changedFactors.length ? changedFactors : ['no_material_change'],
    shouldNotifyPM: material && severity !== 'info',
  };
}

export function convictionDriftToAlert(drift: ConvictionDriftSummary, thesis?: PositionThesis | null): PMAlert | null {
  if (!drift.shouldNotifyPM) return null;
  const suggestedAction: PMAlert['suggestedAction'] =
    drift.impactDirection === 'bearish' ? 'review'
      : drift.impactDirection === 'bullish' ? 'add'
      : 'watch';
  return {
    id: crypto.randomUUID(),
    ticker: drift.ticker,
    alertType: drift.driftType === 'agent_disagreement' || drift.driftType === 'fragmented_conviction'
      ? 'agent_conflict'
      : drift.impactDirection === 'bearish'
        ? 'conviction_drop'
        : 'score_change',
    severity: drift.severity,
    title: `${drift.ticker} conviction ${drift.driftType.replace(/_/g, ' ')}`,
    summary: drift.reason,
    impactDirection: drift.impactDirection,
    suggestedAction,
    confidence: drift.confidence,
    affectedTheme: null,
    affectedThesis: thesis?.thesisSummary ?? null,
    shouldNotifyPM: true,
    evidence: [{
      source: 'pm_conviction_drift',
      summary: drift.reason,
      impactDirection: drift.impactDirection,
      confidence: drift.confidence,
    }],
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
}
