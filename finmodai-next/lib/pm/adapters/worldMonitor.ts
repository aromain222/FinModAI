import type { WorldBriefEventCard } from '@/types/worldBrief';
import type { AgentView, ImpactDirection, InterpretableEvent, WeeklyMemoSection } from '@/lib/pm/types';

export type WorldMonitorNewsItem = {
  title?: string;
  source?: string;
  url?: string;
  publishedAt?: string;
  summary?: string;
  what_happened?: string;
  why_it_matters?: string;
  market_lens?: string | null;
  topics?: string[];
  region?: string;
  confidence?: 'low' | 'medium' | 'med' | 'high' | number;
  routing?: {
    market_relevance_score?: number;
    world_relevance_score?: number;
    market_reason?: string;
    world_reason?: string;
  };
};

export type WorldMonitorInput = WorldBriefEventCard | WorldMonitorNewsItem;

const HIGH_IMPACT_TAGS = new Set([
  'rates',
  'inflation',
  'policy',
  'credit',
  'energy',
  'commodities',
  'geopolitics',
  'trade',
  'fx',
]);

const TAG_THEME_MAP: Record<string, string> = {
  rates: 'Macro Sensitive',
  inflation: 'Macro Sensitive',
  policy: 'Macro Sensitive',
  fx: 'Global Liquidity',
  credit: 'Credit Conditions',
  liquidity: 'Credit Conditions',
  energy: 'Energy',
  commodities: 'Commodities',
  geopolitics: 'Geopolitical Risk',
  trade: 'Global Trade',
  growth: 'Cyclical Growth',
  labor: 'Consumer Demand',
  consumer: 'Consumer Demand',
  equities: 'Equity Risk Appetite',
  financials: 'Financials',
  housing: 'Rate Sensitive',
};

function isWorldBriefEvent(input: WorldMonitorInput): input is WorldBriefEventCard {
  return 'headline' in input || 'event_id' in input;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.flatMap(value => {
    const trimmed = value?.trim();
    return trimmed ? [trimmed] : [];
  }))];
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function tagsFrom(input: WorldMonitorInput): string[] {
  const raw = isWorldBriefEvent(input) ? input.tags : input.topics;
  return unique((raw ?? []).map(tag => normalizeTag(tag)));
}

function titleOf(input: WorldMonitorInput): string {
  return isWorldBriefEvent(input) ? input.headline : input.title ?? 'World monitor event';
}

function idOf(input: WorldMonitorInput): string {
  if (isWorldBriefEvent(input) && input.event_id) return input.event_id;
  const title = titleOf(input);
  const date = isWorldBriefEvent(input) ? input.sources?.[0]?.published_at : input.publishedAt;
  return `world_${Buffer.from(`${title}:${date ?? ''}`).toString('base64url').slice(0, 40)}`;
}

function summaryOf(input: WorldMonitorInput): string {
  if (isWorldBriefEvent(input)) {
    const watch = input.key_points?.find(point => point.toLowerCase().startsWith('watch:'));
    return [
      input.what_happened,
      `Transmission: ${input.why_it_matters}`,
      watch ? watch : null,
    ].filter(Boolean).join(' ');
  }
  return [
    input.what_happened ?? input.summary ?? titleOf(input),
    input.market_lens ? `Market lens: ${input.market_lens}` : input.why_it_matters ? `Transmission: ${input.why_it_matters}` : null,
  ].filter(Boolean).join(' ');
}

function confidencePct(confidence: WorldMonitorInput['confidence']): number {
  if (typeof confidence === 'number') return Math.max(0, Math.min(100, confidence));
  if (confidence === 'high') return 78;
  if (confidence === 'med' || confidence === 'medium') return 62;
  if (confidence === 'low') return 45;
  return 55;
}

function inferDirection(text: string, tags: string[]): ImpactDirection {
  const lower = `${text} ${tags.join(' ')}`.toLowerCase();
  if (/(cooler|dovish|rate cut|cuts|easing|stimulus|ceasefire|de-escalat|soft landing|strong demand|liquidity improves)/.test(lower)) {
    return 'bullish';
  }
  if (/(hot inflation|sticky inflation|hawkish|higher-for-longer|yields? (rise|higher)|weak auction|default|war|attack|sanction|export control|oil spike|credit stress|recession|growth slows)/.test(lower)) {
    return 'bearish';
  }
  if (tags.some(tag => ['energy', 'commodities', 'fx', 'geopolitics', 'credit'].includes(tag))) return 'mixed';
  return 'neutral';
}

function themesFrom(tags: string[], input: WorldMonitorInput): string[] {
  const mapped = tags.map(tag => TAG_THEME_MAP[tag]);
  const regions = isWorldBriefEvent(input) ? input.primary_regions ?? [] : input.region ? [input.region] : [];
  return unique([...mapped, ...regions.map(region => `${region} Macro`)]);
}

function publishedAtOf(input: WorldMonitorInput): string | null {
  if (isWorldBriefEvent(input)) return input.sources?.[0]?.published_at ?? null;
  return input.publishedAt ?? null;
}

function sourceOf(input: WorldMonitorInput): string {
  if (isWorldBriefEvent(input)) return input.sources?.[0]?.source_name ?? 'world_monitor';
  return input.source ?? 'world_monitor';
}

function urlOf(input: WorldMonitorInput): string | null {
  if (isWorldBriefEvent(input)) return input.sources?.[0]?.url ?? null;
  return input.url ?? null;
}

function materialityScore(input: WorldMonitorInput, tags: string[], confidence: number, direction: ImpactDirection): number {
  const highImpactCount = tags.filter(tag => HIGH_IMPACT_TAGS.has(tag)).length;
  const sourceCount = isWorldBriefEvent(input) ? input.sources?.length ?? 0 : 1;
  const routingScore = !isWorldBriefEvent(input) ? input.routing?.market_relevance_score ?? input.routing?.world_relevance_score ?? 0 : 0;
  const directionalBoost = direction === 'neutral' ? 0 : direction === 'mixed' ? 6 : 10;
  return Math.max(15, Math.min(95, Math.round(
    32 +
    highImpactCount * 9 +
    sourceCount * 3 +
    routingScore * 0.18 +
    confidence * 0.22 +
    directionalBoost,
  )));
}

function urgencyScore(input: WorldMonitorInput, tags: string[]): number {
  const text = summaryOf(input).toLowerCase();
  let urgency = tags.some(tag => ['rates', 'inflation', 'credit', 'geopolitics', 'energy'].includes(tag)) ? 68 : 52;
  if (/(today|tomorrow|this week|emergency|attack|shock|surprise|spike|selloff)/.test(text)) urgency += 14;
  if (/(watch:|next release|auction|fomc|cpi|payrolls|pce)/.test(text)) urgency += 6;
  return Math.max(20, Math.min(95, urgency));
}

function severityFrom(materiality: number, urgency: number): InterpretableEvent['severityHint'] {
  const score = materiality * 0.65 + urgency * 0.35;
  if (score >= 85) return 'critical';
  if (score >= 72) return 'high';
  if (score >= 52) return 'medium';
  if (score >= 35) return 'low';
  return 'info';
}

export function worldMonitorToEvent(input: WorldMonitorInput): InterpretableEvent | null {
  const title = titleOf(input).trim();
  const summary = summaryOf(input).trim();
  if (!title || !summary) return null;

  const tags = tagsFrom(input);
  const confidence = confidencePct(input.confidence);
  const direction = inferDirection(`${title} ${summary}`, tags);
  const materiality = materialityScore(input, tags, confidence, direction);
  const urgency = urgencyScore(input, tags);

  return {
    id: idOf(input),
    title: `World Monitor: ${title}`,
    summary,
    source: 'world_monitor',
    url: urlOf(input),
    publishedAt: publishedAtOf(input),
    eventType: 'world',
    themes: themesFrom(tags, input),
    impactDirection: direction,
    severityHint: severityFrom(materiality, urgency),
    confidence,
    materiality,
    urgency,
  };
}

export function worldMonitorToAgentView(input: WorldMonitorInput): AgentView | null {
  const event = worldMonitorToEvent(input);
  if (!event) return null;
  const stance = event.impactDirection === 'bullish'
    ? 'bullish'
    : event.impactDirection === 'bearish'
      ? 'bearish'
      : event.impactDirection === 'mixed'
        ? 'mixed'
        : 'neutral';
  return {
    id: crypto.randomUUID(),
    ticker: 'MACRO',
    agentName: 'World Monitor',
    stance,
    conviction: event.confidence ?? 55,
    reasoning: `${event.title}. ${event.summary}`,
    changedSinceLast: false,
    evidence: [{
      id: event.id,
      source: event.source ?? 'world_monitor',
      title: event.title,
      summary: event.summary,
      url: event.url ?? null,
      publishedAt: event.publishedAt ?? null,
      impactDirection: event.impactDirection,
      confidence: event.confidence,
    }],
    createdAt: new Date().toISOString(),
    source: 'world_monitor',
    agentType: 'world_monitor',
    runAt: new Date().toISOString(),
    signal: stance === 'mixed' ? 'neutral' : stance,
    confidence: event.confidence,
    summary: event.summary,
    rawOutput: { event },
  };
}

export function worldMonitorToWeeklyMemoSection(events: InterpretableEvent[]): WeeklyMemoSection {
  const top = events
    .slice()
    .sort((a, b) => ((b.materiality ?? 0) + (b.urgency ?? 0)) - ((a.materiality ?? 0) + (a.urgency ?? 0)))
    .slice(0, 5);
  return {
    title: 'World Monitor',
    body: top.length > 0
      ? top.map(event => `${event.impactDirection ?? 'neutral'}: ${event.title.replace(/^World Monitor:\s*/, '')} (${event.materiality ?? 50}/100 materiality).`).join('\n')
      : 'No material world monitor events recorded.',
    themes: unique(top.flatMap(event => event.themes ?? [])),
  };
}
