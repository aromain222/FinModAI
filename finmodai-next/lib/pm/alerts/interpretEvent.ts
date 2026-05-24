import type { EventInterpretation, InterpretableEvent, PMAlert } from '@/lib/pm/types';
import { listPositions } from '@/lib/pm/portfolio/positionStore';

function inferDirection(event: InterpretableEvent): 'bullish' | 'bearish' | 'neutral' | 'mixed' {
  if (event.impactDirection) return event.impactDirection;
  const text = `${event.title} ${event.summary}`.toLowerCase();
  if (/(beats|raises|approval|cooler inflation|dovish|accelerat|wins|strong)/.test(text)) return 'bullish';
  if (/(miss|cuts|probe|lawsuit|hot inflation|hawkish|restriction|breach|weak)/.test(text)) return 'bearish';
  return 'neutral';
}

function inferAlertType(event: InterpretableEvent): PMAlert['alertType'] {
  if (event.eventType === 'macro') return 'macro_shock';
  if (event.eventType === 'earnings') return 'earnings_shock';
  if (event.eventType === 'news') return 'news_shock';
  return 'event_risk';
}

function severityRank(severity: PMAlert['severity']): number {
  return { critical: 5, high: 4, medium: 3, low: 2, info: 1 }[severity];
}

function inferSeverity(event: InterpretableEvent): PMAlert['severity'] {
  if (event.severityHint) return event.severityHint;
  const materiality = event.materiality ?? 50;
  const urgency = event.urgency ?? 50;
  const score = materiality * 0.65 + urgency * 0.35;
  if (score >= 85) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 50) return 'medium';
  if (score >= 30) return 'low';
  return 'info';
}

export async function interpretEvent(event: InterpretableEvent): Promise<EventInterpretation> {
  const tickers = [...new Set((event.tickers ?? []).map(ticker => ticker.toUpperCase()))];
  const positions = tickers.length > 0
    ? (await Promise.all(tickers.map(ticker => listPositions({ ticker, limit: 10 })))).flat()
    : [];
  const direction = inferDirection(event);
  const severity = inferSeverity(event);
  const confidence = Math.max(0, Math.min(100, event.confidence ?? 50));
  const materiality = event.materiality ?? (severityRank(severity) * 18);
  const hasPortfolioExposure = positions.length > 0;
  const material =
    severityRank(severity) >= 3 ||
    materiality >= 55 ||
    hasPortfolioExposure ||
    direction !== 'neutral';

  if (!material) {
    return {
      material: false,
      reason: 'Event is not material enough for a PM alert; no thesis, conviction, or portfolio risk threshold was crossed.',
      alerts: [],
    };
  }

  const shouldNotifyPM =
    severityRank(severity) >= 4 ||
    hasPortfolioExposure ||
    materiality >= 70 ||
    confidence >= 75;

  const affectedTickers = tickers.length > 0 ? tickers : [null];
  const alerts: PMAlert[] = affectedTickers.map(ticker => ({
    id: crypto.randomUUID(),
    ticker,
    alertType: inferAlertType(event),
    severity,
    title: event.title,
    summary: `${event.summary} PM read: ${direction} impact, materiality ${Math.round(materiality)}/100, confidence ${Math.round(confidence)}/100.`,
    impactDirection: direction,
    suggestedAction: direction === 'bearish' ? 'review' : 'watch',
    confidence,
    affectedTheme: event.themes?.[0] ?? null,
    affectedThesis: null,
    shouldNotifyPM,
    evidence: [{
      id: event.id,
      source: event.source ?? event.eventType ?? 'event',
      title: event.title,
      summary: event.summary,
      url: event.url ?? null,
      publishedAt: event.publishedAt ?? null,
      impactDirection: direction,
      confidence,
    }],
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  }));

  return {
    material: true,
    reason: shouldNotifyPM
      ? 'Event crossed PM notification threshold through portfolio exposure, severity, or materiality.'
      : 'Event is worth recording but does not require immediate PM interruption.',
    alerts,
  };
}
