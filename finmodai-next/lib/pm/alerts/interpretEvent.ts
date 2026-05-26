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
  if (event.eventType === 'world') return 'world_monitor';
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
  const tickerPositions = tickers.length > 0
    ? (await Promise.all(tickers.map(ticker => listPositions({ ticker, limit: 10 })))).flat()
    : [];
  const themePositions = event.themes && event.themes.length > 0
    ? (await listPositions({ limit: 500 })).filter(position => (
      position.portfolioTheme && event.themes?.some(theme => position.portfolioTheme?.toLowerCase() === theme.toLowerCase())
    ))
    : [];
  const positions = [...tickerPositions, ...themePositions].filter((position, index, arr) => (
    arr.findIndex(item => item.id === position.id) === index
  ));
  const direction = inferDirection(event);
  const severity = inferSeverity(event);
  const confidence = Math.max(0, Math.min(100, event.confidence ?? 50));
  const materiality = event.materiality ?? (severityRank(severity) * 18);
  const hasPortfolioExposure = positions.length > 0;
  const materialityScore = Math.round(
    materiality * 0.5 +
    (event.urgency ?? 50) * 0.25 +
    confidence * 0.15 +
    (hasPortfolioExposure ? 10 : 0),
  );
  const invalidationLanguage = /(invalidat|thesis break|guidance cut|default|fraud|ban|halts?|downgrade|missed badly|lawsuit|antitrust remedy)/i
    .test(`${event.title} ${event.summary}`);
  const material =
    (hasPortfolioExposure && (severityRank(severity) >= 2 || materialityScore >= 45 || direction !== 'neutral')) ||
    severityRank(severity) >= 4 ||
    materialityScore >= 72 ||
    invalidationLanguage;

  if (!material) {
    return {
      material: false,
      reason: 'Event was filtered out: no portfolio/theme exposure and no material severity, urgency, invalidation, or conviction threshold was crossed.',
      alerts: [],
    };
  }

  const shouldNotifyPM =
    severityRank(severity) >= 4 ||
    invalidationLanguage ||
    (hasPortfolioExposure && (materialityScore >= 50 || severityRank(severity) >= 3)) ||
    materialityScore >= 78;

  const affectedTickers = tickers.length > 0
    ? tickers
    : themePositions.length > 0
      ? [...new Set(themePositions.map(position => position.ticker))]
      : [null];
  const alerts: PMAlert[] = affectedTickers.map(ticker => ({
    id: crypto.randomUUID(),
    ticker,
    alertType: inferAlertType(event),
    severity,
    title: event.title,
    summary: `${event.summary} PM read: ${direction} impact, materiality ${materialityScore}/100, confidence ${Math.round(confidence)}/100. ${hasPortfolioExposure ? 'Portfolio exposure found.' : 'No direct portfolio exposure.'}`,
    impactDirection: direction,
    suggestedAction: invalidationLanguage ? 'review' : direction === 'bearish' ? 'review' : direction === 'bullish' ? 'add' : 'watch',
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
      ? 'Event crossed PM notification threshold through portfolio exposure, severity, materiality, or invalidation language.'
      : 'Event is material enough to record but below the PM interruption threshold.',
    alerts,
  };
}
