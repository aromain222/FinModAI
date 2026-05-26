/**
 * GET /api/pm/world-monitor
 *
 * Pipes the existing World Brief feed into the PM Brain.
 * It normalizes macro/geopolitical events into InterpretableEvent objects,
 * runs materiality filtering, and persists only alerts that matter.
 *
 * Optional Authorization: Bearer ${CRON_SECRET}.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { WorldBriefResponseV2 } from '@/types/worldBrief';
import type { InvestmentDecision, PMAlert } from '@/lib/pm/types';
import { readJson, jsonError } from '@/lib/pm/api/http';
import { interpretEvent } from '@/lib/pm/alerts/interpretEvent';
import { listAlerts, saveAlert } from '@/lib/pm/alerts/alertStore';
import { saveDecision } from '@/lib/pm/decisions/decisionStore';
import { saveAgentView } from '@/lib/pm/memory/agentViewStore';
import { saveMemory } from '@/lib/pm/memory/memoryStore';
import { notifyAlert, notifyApprovalNeeded } from '@/lib/pm/notifications/notifier';
import {
  type WorldMonitorInput,
  type WorldMonitorNewsItem,
  worldMonitorToAgentView,
  worldMonitorToEvent,
} from '@/lib/pm/adapters/worldMonitor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_EVENTS = 24;
const WORLD_MONITOR_API_BASE = process.env.WORLD_MONITOR_API_BASE || 'https://api.worldmonitor.app';

const manualWorldEventSchema = z.object({
  id: z.string().optional(),
  event_id: z.string().optional(),
  headline: z.string().optional(),
  title: z.string().optional(),
  what_happened: z.string().optional(),
  why_it_matters: z.string().optional(),
  summary: z.string().optional(),
  market_lens: z.string().nullable().optional(),
  key_points: z.array(z.string()).optional(),
  topics: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  primary_regions: z.array(z.string()).optional(),
  region: z.string().optional(),
  confidence: z.union([z.enum(['low', 'medium', 'med', 'high']), z.number().min(0).max(100)]).optional(),
  source: z.string().optional(),
  url: z.string().url().optional(),
  publishedAt: z.string().optional(),
  sources: z.array(z.object({
    source_name: z.string().optional(),
    published_at: z.string().optional(),
    title: z.string().optional(),
    url: z.string().url().optional(),
  })).optional(),
});

const postRequestSchema = z.object({
  events: z.array(manualWorldEventSchema).min(1).max(50),
  persist: z.boolean().optional().default(true),
  persistAgentViews: z.boolean().optional().default(true),
  notifyDiscord: z.boolean().optional().default(true),
  persistMemory: z.boolean().optional().default(true),
  createDecisions: z.boolean().optional().default(true),
});

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

async function fetchJson<T>(url: string, timeoutMs: number, headers?: HeadersInit): Promise<T | null> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

function worldMonitorApiKey(): string {
  return process.env.WORLD_MONITOR_API_KEY || process.env.WORLDMONITOR_API_KEY || process.env.WM_API_KEY || '';
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
}

function arrayProp(data: unknown, keys: string[]): UnknownRecord[] {
  const record = asRecord(data);
  if (!record) return [];
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value.flatMap(item => asRecord(item) ? [item as UnknownRecord] : []);
  }
  return [];
}

function stringProp(record: UnknownRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function numberProp(record: UnknownRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function stringArrayProp(record: UnknownRecord, keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.flatMap(item => typeof item === 'string' && item.trim() ? [item.trim()] : []);
    }
  }
  return [];
}

function msToIso(value: unknown): string | undefined {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(numeric) && numeric > 0 ? new Date(numeric).toISOString() : undefined;
}

function dateToIso(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function confidenceFromSeverity(severity: string, fallback: WorldMonitorNewsItem['confidence'] = 'medium'): WorldMonitorNewsItem['confidence'] {
  const normalized = severity.toLowerCase();
  if (normalized.includes('high') || normalized.includes('critical') || normalized.includes('confirmed')) return 'high';
  if (normalized.includes('low') || normalized.includes('watch')) return 'low';
  return fallback;
}

function compactRecord(record: UnknownRecord, keys: string[]): string {
  return keys
    .flatMap(key => {
      const value = record[key];
      if (value === null || value === undefined || value === '') return [];
      if (Array.isArray(value) && value.length === 0) return [];
      return [`${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`];
    })
    .slice(0, 5)
    .join('; ');
}

async function fetchWorldMonitorApi<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const key = worldMonitorApiKey();
  if (!key) return null;
  const url = new URL(path, WORLD_MONITOR_API_BASE);
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value));
  return fetchJson<T>(url.toString(), 9_000, {
    Accept: 'application/json',
    'X-WorldMonitor-Key': key,
  });
}

function mapAcledEvents(data: unknown): WorldMonitorNewsItem[] {
  return arrayProp(data, ['events']).map(event => {
    const eventType = stringProp(event, ['eventType', 'event_type']) || 'conflict event';
    const country = stringProp(event, ['country']) || 'unknown country';
    const admin = stringProp(event, ['admin1', 'region']);
    const fatalities = numberProp(event, ['fatalities']);
    const actors = stringArrayProp(event, ['actors']).join(' vs ');
    return {
      title: `Conflict: ${eventType} in ${admin || country}`,
      source: 'WorldMonitor ACLED',
      publishedAt: msToIso(event.occurredAt),
      summary: compactRecord(event, ['eventType', 'country', 'admin1', 'fatalities', 'source']),
      what_happened: `${eventType} reported in ${admin || country}${actors ? ` involving ${actors}` : ''}${fatalities ? ` with ${fatalities} reported fatalities` : ''}.`,
      why_it_matters: 'Conflict activity can raise geopolitical risk premia, energy and shipping uncertainty, and regional exposure risk.',
      topics: ['conflict', 'geopolitics', fatalities && fatalities > 0 ? 'risk' : 'security'],
      region: country,
      confidence: fatalities && fatalities > 0 ? 'high' : 'medium',
    };
  });
}

function mapIranEvents(data: unknown): WorldMonitorNewsItem[] {
  return arrayProp(data, ['events']).map(event => {
    const title = stringProp(event, ['title']) || 'Iran security event';
    const location = stringProp(event, ['locationName', 'location']);
    const severity = stringProp(event, ['severity']);
    const topics = ['iran', 'geopolitics', 'conflict'];
    if (/(hormuz|strait|tanker|ship|oil|missile|drone)/i.test(`${title} ${location}`)) topics.push('energy', 'waterways');
    return {
      title: `Iran monitor: ${title}`,
      source: 'WorldMonitor Iran',
      url: stringProp(event, ['sourceUrl']) || undefined,
      publishedAt: msToIso(event.timestamp),
      summary: compactRecord(event, ['category', 'locationName', 'severity']),
      what_happened: `${title}${location ? ` near ${location}` : ''}.`,
      why_it_matters: 'Iran-linked escalation matters for oil risk premia, shipping lanes, defense positioning, and broad risk appetite.',
      topics,
      region: 'Middle East',
      confidence: confidenceFromSeverity(severity),
    };
  });
}

function mapSanctionsPressure(data: unknown): WorldMonitorNewsItem[] {
  return arrayProp(data, ['entries']).slice(0, 12).map(entry => {
    const name = stringProp(entry, ['name']) || 'sanctioned entity';
    const countries = stringArrayProp(entry, ['countryNames', 'country_codes']).join(', ');
    const programs = stringArrayProp(entry, ['programs']).join(', ');
    const isNew = entry.isNew === true;
    return {
      title: `Sanctions pressure: ${name}`,
      source: 'WorldMonitor Sanctions',
      publishedAt: msToIso(entry.effectiveAt),
      summary: compactRecord(entry, ['entityType', 'countryNames', 'programs', 'sourceLists', 'note']),
      what_happened: `${isNew ? 'New' : 'Active'} sanctions designation for ${name}${countries ? ` tied to ${countries}` : ''}.`,
      why_it_matters: `Sanctions can change trade flows, financing access, shipping risk, and country/sector risk premia${programs ? ` through ${programs}` : ''}.`,
      topics: ['sanctions', 'trade', 'geopolitics', 'policy'],
      region: countries || 'Global',
      confidence: isNew ? 'high' : 'medium',
    };
  });
}

function mapChokepointStatus(data: unknown): WorldMonitorNewsItem[] {
  return arrayProp(data, ['chokepoints', 'statuses', 'items']).map(point => {
    const name = stringProp(point, ['name', 'chokepointName', 'id', 'chokepointId']) || 'shipping chokepoint';
    const status = stringProp(point, ['status', 'riskLevel', 'risk', 'severity', 'state']);
    return {
      title: `Chokepoint monitor: ${name}`,
      source: 'WorldMonitor Supply Chain',
      summary: compactRecord(point, ['status', 'riskLevel', 'transitCount', 'weeklyChangePct', 'description']),
      what_happened: `${name} status update${status ? `: ${status}` : ''}.`,
      why_it_matters: 'Chokepoint stress can transmit through freight rates, delivery times, commodity supply, and inflation expectations.',
      topics: ['supply_chain', 'waterways', 'trade', 'energy'],
      region: 'Global',
      confidence: confidenceFromSeverity(status),
    };
  });
}

function mapShippingStress(data: unknown): WorldMonitorNewsItem[] {
  const record = asRecord(data);
  if (!record) return [];
  const stress = stringProp(record, ['verdict', 'stressLevel', 'signal', 'status']) || compactRecord(record, ['compositeStress', 'stressIndex', 'freightTrend']);
  return stress ? [{
    title: 'Global shipping stress update',
    source: 'WorldMonitor Supply Chain',
    summary: compactRecord(record, ['verdict', 'stressLevel', 'compositeStress', 'stressIndex', 'freightTrend']),
    what_happened: `WorldMonitor shipping stress signal updated: ${stress}.`,
    why_it_matters: 'Shipping stress matters for importers, retailers, industrial supply chains, inflation pressure, and commodity-sensitive equities.',
    topics: ['supply_chain', 'trade', 'waterways', 'inflation'],
    region: 'Global',
    confidence: 'medium',
  }] : [];
}

function mapGenericEvents(data: unknown, source: string, topics: string[]): WorldMonitorNewsItem[] {
  return arrayProp(data, ['events', 'items', 'alerts', 'outages', 'incidents', 'results']).slice(0, 10).map(item => {
    const title = stringProp(item, ['title', 'name', 'headline', 'eventType', 'type']) || `${source} event`;
    const country = stringProp(item, ['country', 'region', 'locationName', 'area']);
    const severity = stringProp(item, ['severity', 'riskLevel', 'status', 'confidence']);
    return {
      title: `${source}: ${title}`,
      source,
      url: stringProp(item, ['url', 'sourceUrl']) || undefined,
      publishedAt: msToIso(item.occurredAt ?? item.detectedAt ?? item.timestamp ?? item.publishedAt),
      summary: compactRecord(item, ['summary', 'description', 'country', 'severity', 'status']),
      what_happened: stringProp(item, ['summary', 'description']) || `${title}${country ? ` in ${country}` : ''}.`,
      why_it_matters: 'This signal can affect local disruption risk, supply chains, insurance costs, infrastructure reliability, or risk appetite.',
      topics,
      region: country || 'Global',
      confidence: confidenceFromSeverity(severity),
    };
  });
}

async function fetchWorldMonitorApiInputs(days: number): Promise<WorldMonitorInput[]> {
  const end = Date.now();
  const start = end - days * 24 * 60 * 60 * 1000;
  const [
    acled,
    iran,
    sanctions,
    chokepoints,
    shippingStress,
    outages,
    natural,
  ] = await Promise.all([
    fetchWorldMonitorApi<unknown>('/api/conflict/v1/list-acled-events', { start: String(start), end: String(end), page_size: '20' }),
    fetchWorldMonitorApi<unknown>('/api/conflict/v1/list-iran-events'),
    fetchWorldMonitorApi<unknown>('/api/sanctions/v1/list-sanctions-pressure', { max_items: '15' }),
    fetchWorldMonitorApi<unknown>('/api/supply-chain/v1/get-chokepoint-status'),
    fetchWorldMonitorApi<unknown>('/api/supply-chain/v1/get-shipping-stress'),
    fetchWorldMonitorApi<unknown>('/api/infrastructure/v1/list-internet-outages', { page_size: '10' }),
    fetchWorldMonitorApi<unknown>('/api/natural/v1/list-natural-events', { page_size: '10' }),
  ]);

  return [
    ...mapAcledEvents(acled),
    ...mapIranEvents(iran),
    ...mapSanctionsPressure(sanctions),
    ...mapChokepointStatus(chokepoints),
    ...mapShippingStress(shippingStress),
    ...mapGenericEvents(outages, 'WorldMonitor Internet Outage', ['infrastructure', 'outages', 'risk']),
    ...mapGenericEvents(natural, 'WorldMonitor Natural Hazard', ['natural', 'weather', 'infrastructure']),
  ].slice(0, MAX_EVENTS);
}

type GdeltArticle = {
  title?: string;
  url?: string;
  domain?: string;
  seendate?: string;
  sourceCountry?: string;
  language?: string;
};

type UsgsFeature = {
  properties?: {
    title?: string;
    place?: string;
    mag?: number;
    time?: number;
    url?: string;
    alert?: string;
    tsunami?: number;
    sig?: number;
  };
};

type EonetEvent = {
  id?: string;
  title?: string;
  description?: string;
  categories?: Array<{ title?: string }>;
  sources?: Array<{ id?: string; url?: string }>;
  geometry?: Array<{ date?: string }>;
};

type ReliefWebItem = {
  fields?: {
    name?: string;
    description?: string;
    url?: string;
    date?: { created?: string };
    country?: Array<{ name?: string }>;
    type?: Array<{ name?: string }>;
  };
};

function classifyWorldNewsTopics(title: string): string[] {
  const lower = title.toLowerCase();
  const topics = ['geopolitics'];
  if (/(oil|gas|lng|energy|opec|hormuz|strait|tanker|pipeline|crude)/.test(lower)) topics.push('energy', 'commodities');
  if (/(ship|shipping|waterway|canal|port|suez|panama|red sea|malacca)/.test(lower)) topics.push('supply_chain', 'waterways', 'trade');
  if (/(sanction|tariff|export control|trade war)/.test(lower)) topics.push('sanctions', 'trade', 'policy');
  if (/(missile|drone|attack|war|conflict|airstrike|military|coup|protest|riot)/.test(lower)) topics.push('conflict');
  if (/(cyber|hack|outage|blackout|infrastructure)/.test(lower)) topics.push('cyber', 'infrastructure');
  if (/(earthquake|flood|wildfire|storm|hurricane|cyclone|drought|volcano)/.test(lower)) topics.push('natural', 'weather');
  if (/(inflation|fed|rates|cpi|pce|treasury|yield)/.test(lower)) topics.push('rates', 'inflation');
  return [...new Set(topics)];
}

async function fetchGdeltLite(days: number): Promise<WorldMonitorNewsItem[]> {
  const query = [
    'conflict',
    'sanctions',
    'missile',
    'drone',
    '"Strait of Hormuz"',
    'shipping',
    'waterway',
    'blackout',
    'cyberattack',
    'earthquake',
    'flood',
    'wildfire',
    'oil',
    'tariff',
    'coup',
    'protest',
  ].join(' OR ');
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.searchParams.set('query', query);
  url.searchParams.set('mode', 'artlist');
  url.searchParams.set('format', 'json');
  url.searchParams.set('maxrecords', '20');
  url.searchParams.set('sort', 'hybridrel');
  url.searchParams.set('timespan', `${Math.max(1, Math.min(7, days))}d`);

  const data = await fetchJson<{ articles?: GdeltArticle[] }>(url.toString(), 10_000);
  const articles = Array.isArray(data?.articles) ? data.articles : [];
  return articles.flatMap(article => {
    const title = article.title?.trim();
    if (!title) return [];
    const topics = classifyWorldNewsTopics(title);
    return [{
      title,
      source: article.domain ? `GDELT / ${article.domain}` : 'GDELT',
      url: article.url,
      publishedAt: dateToIso(article.seendate),
      summary: title,
      what_happened: title,
      why_it_matters: 'GDELT flagged this as a live global risk story; PM impact depends on whether it changes rates, supply chains, energy, sanctions, or risk appetite.',
      topics,
      region: article.sourceCountry || 'Global',
      confidence: topics.length >= 3 ? 'medium' : 'low',
      routing: {
        market_relevance_score: topics.some(topic => ['energy', 'supply_chain', 'rates', 'sanctions'].includes(topic)) ? 72 : 52,
        world_relevance_score: 74,
        market_reason: 'No-key GDELT global risk feed.',
        world_reason: 'Matched geopolitical, macro, infrastructure, or disaster keywords.',
      },
    } satisfies WorldMonitorNewsItem];
  });
}

async function fetchUsgsLite(): Promise<WorldMonitorNewsItem[]> {
  const data = await fetchJson<{ features?: UsgsFeature[] }>(
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson',
    8_000,
  );
  const features = Array.isArray(data?.features) ? data.features : [];
  return features.flatMap(feature => {
    const props = feature.properties;
    const title = props?.title ?? (props?.place ? `Significant earthquake near ${props.place}` : '');
    if (!title) return [];
    const mag = typeof props?.mag === 'number' ? props.mag : null;
    return [{
      title,
      source: 'USGS Earthquakes',
      url: props?.url,
      publishedAt: msToIso(props?.time),
      summary: compactRecord({ magnitude: mag, place: props?.place, alert: props?.alert, tsunami: props?.tsunami, significance: props?.sig }, ['magnitude', 'place', 'alert', 'tsunami', 'significance']),
      what_happened: `USGS reported ${mag ? `a M${mag.toFixed(1)} ` : 'a significant '}earthquake${props?.place ? ` near ${props.place}` : ''}.`,
      why_it_matters: 'Significant earthquakes can affect local infrastructure, ports, energy assets, semiconductor supply chains, insurance risk, and regional risk appetite.',
      topics: ['earthquake', 'natural', 'infrastructure', props?.tsunami ? 'waterways' : 'risk'],
      region: props?.place ?? 'Global',
      confidence: props?.alert === 'red' || props?.alert === 'orange' || (mag ?? 0) >= 6.5 ? 'high' : 'medium',
    } satisfies WorldMonitorNewsItem];
  });
}

async function fetchEonetLite(days: number): Promise<WorldMonitorNewsItem[]> {
  const url = new URL('https://eonet.gsfc.nasa.gov/api/v3/events');
  url.searchParams.set('days', String(Math.max(1, Math.min(30, days))));
  url.searchParams.set('status', 'open');
  url.searchParams.set('limit', '20');
  const data = await fetchJson<{ events?: EonetEvent[] }>(url.toString(), 8_000);
  const events = Array.isArray(data?.events) ? data.events : [];
  return events.flatMap(event => {
    const title = event.title?.trim();
    if (!title) return [];
    const category = event.categories?.[0]?.title ?? 'Natural event';
    const sourceUrl = event.sources?.[0]?.url;
    return [{
      title: `Natural hazard: ${title}`,
      source: event.sources?.[0]?.id ? `NASA EONET / ${event.sources[0].id}` : 'NASA EONET',
      url: sourceUrl,
      publishedAt: dateToIso(event.geometry?.[0]?.date),
      summary: event.description || category,
      what_happened: `${category} remains active: ${title}.`,
      why_it_matters: 'Active natural hazards can disrupt logistics, energy production, agriculture, insurance, and local demand conditions.',
      topics: classifyWorldNewsTopics(`${title} ${category}`).concat(['natural', 'weather']),
      region: 'Global',
      confidence: 'medium',
    } satisfies WorldMonitorNewsItem];
  });
}

async function fetchReliefWebLite(): Promise<WorldMonitorNewsItem[]> {
  const url = new URL('https://api.reliefweb.int/v1/disasters');
  url.searchParams.set('appname', 'capitalbase-world-brief-lite');
  url.searchParams.set('limit', '12');
  url.searchParams.set('profile', 'list');
  url.searchParams.set('preset', 'latest');
  const data = await fetchJson<{ data?: ReliefWebItem[] }>(url.toString(), 8_000);
  const items = Array.isArray(data?.data) ? data.data : [];
  return items.flatMap(item => {
    const fields = item.fields;
    const title = fields?.name?.trim();
    if (!title) return [];
    const countries = fields?.country?.flatMap(country => country.name ? [country.name] : []) ?? [];
    const types = fields?.type?.flatMap(type => type.name ? [type.name] : []) ?? [];
    return [{
      title: `Humanitarian/disaster monitor: ${title}`,
      source: 'ReliefWeb',
      url: fields?.url,
      publishedAt: dateToIso(fields?.date?.created),
      summary: fields?.description || [...countries, ...types].join('; '),
      what_happened: `ReliefWeb latest disaster listing: ${title}${countries.length ? ` in ${countries.join(', ')}` : ''}.`,
      why_it_matters: 'Humanitarian and disaster signals can point to supply disruption, fiscal stress, commodity impacts, insurance losses, and regional instability.',
      topics: ['natural', 'weather', 'geopolitics', 'infrastructure'],
      region: countries.join(', ') || 'Global',
      confidence: 'medium',
    } satisfies WorldMonitorNewsItem];
  });
}

async function fetchWorldBriefLiteInputs(days: number): Promise<WorldMonitorInput[]> {
  const [gdelt, usgs, eonet, reliefWeb] = await Promise.all([
    fetchGdeltLite(days),
    fetchUsgsLite(),
    fetchEonetLite(days),
    fetchReliefWebLite(),
  ]);
  return [...gdelt, ...usgs, ...eonet, ...reliefWeb].slice(0, MAX_EVENTS);
}

function dedupeInputs(inputs: WorldMonitorInput[]): WorldMonitorInput[] {
  const seen = new Set<string>();
  return inputs.filter(input => {
    const key = ('headline' in input ? input.headline : input.title) ?? '';
    const normalized = key.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

async function fetchInternalWorldBriefInputs(origin: string): Promise<WorldMonitorInput[]> {
  const briefPromise = fetchJson<WorldBriefResponseV2>(`${origin}/api/world-brief?timeframe=72h`, 8_000);
  const newsPromise = fetchJson<WorldMonitorNewsItem[]>(`${origin}/api/world-brief/news?marketLens=true`, 14_000);
  const [brief, news] = await Promise.all([briefPromise, newsPromise]);

  const briefEvents = Array.isArray(brief?.events) ? brief.events : [];
  const newsEvents = Array.isArray(news) ? news : [];
  return [...briefEvents, ...newsEvents];
}

async function fetchWorldMonitorInputs(origin: string, days: number): Promise<{ inputs: WorldMonitorInput[]; source: Record<string, unknown> }> {
  const [apiInputs, liteInputs, internalInputs] = await Promise.all([
    fetchWorldMonitorApiInputs(days),
    fetchWorldBriefLiteInputs(days),
    fetchInternalWorldBriefInputs(origin),
  ]);
  const inputs = dedupeInputs([...apiInputs, ...liteInputs, ...internalInputs]).slice(0, MAX_EVENTS);
  return {
    inputs,
    source: {
      apiBase: WORLD_MONITOR_API_BASE,
      apiKeyConfigured: Boolean(worldMonitorApiKey()),
      apiEvents: apiInputs.length,
      liteEvents: liteInputs.length,
      internalFallbackEvents: internalInputs.length,
      liteSources: ['GDELT', 'USGS', 'NASA EONET', 'ReliefWeb'],
      mode: apiInputs.length > 0
        ? 'worldmonitor_api_plus_lite_plus_fallback'
        : liteInputs.length > 0
          ? 'world_brief_lite_plus_internal_fallback'
          : 'internal_fallback_only',
    },
  };
}

function alertKey(alert: PMAlert): string {
  return `${alert.alertType}:${alert.ticker ?? 'macro'}:${alert.title}`.toLowerCase();
}

async function existingAlertKeys(): Promise<Set<string>> {
  try {
    const alerts = await listAlerts({ limit: 500 });
    return new Set(alerts.map(alertKey));
  } catch {
    return new Set();
  }
}

function shouldRecordWorldMemory(alert: PMAlert): boolean {
  return alert.severity === 'critical' ||
    alert.severity === 'high' ||
    alert.shouldNotifyPM ||
    alert.confidence >= 70 ||
    /(hormuz|sanction|shipping|chokepoint|earthquake|war|conflict|cyber|outage|inflation|rates|oil|gas)/i.test(`${alert.title} ${alert.summary}`);
}

async function recordWorldMemory(alert: PMAlert): Promise<void> {
  await saveMemory({
    id: `world_${Buffer.from(`${alert.title}:${alert.createdAt.slice(0, 10)}`).toString('base64url').slice(0, 44)}`,
    memoryType: 'process_lesson',
    lesson: `World Monitor context: ${alert.title}. ${alert.summary}`,
    relatedTickers: alert.ticker ? [alert.ticker] : [],
    relatedThemes: [alert.affectedTheme, alert.alertType, alert.impactDirection].filter((value): value is string => Boolean(value)),
    importance: Math.max(50, Math.min(100, alert.confidence + (alert.severity === 'critical' ? 20 : alert.severity === 'high' ? 12 : alert.severity === 'medium' ? 4 : 0))),
    createdAt: alert.createdAt,
  });
}

function shouldCreateWorldDecision(alert: PMAlert): boolean {
  const bearishMaterial = alert.impactDirection === 'bearish' || alert.impactDirection === 'mixed';
  return bearishMaterial && (
    alert.severity === 'critical' ||
    alert.severity === 'high' ||
    alert.shouldNotifyPM ||
    alert.confidence >= 70 ||
    /thesis|portfolio exposure|materiality (7|8|9)\d\/100|oil|hormuz|shipping|sanction|cyber|outage|conflict|war|rates|inflation/i.test(alert.summary)
  );
}

function decisionActionForWorldAlert(alert: PMAlert): InvestmentDecision['action'] {
  if (alert.impactDirection === 'bearish' && (alert.severity === 'critical' || alert.confidence >= 82)) return 'trim';
  if (alert.impactDirection === 'bearish') return 'watch';
  if (alert.impactDirection === 'mixed' && (alert.severity === 'high' || alert.severity === 'critical')) return 'watch';
  return 'hold';
}

function worldDecisionFromAlert(alert: PMAlert): InvestmentDecision {
  const now = new Date().toISOString();
  const action = decisionActionForWorldAlert(alert);
  const affected = alert.ticker ?? alert.affectedTheme ?? 'Portfolio';
  return {
    id: `world_decision_${Buffer.from(`${alert.id}:${action}`).toString('base64url').slice(0, 40)}`,
    ticker: alert.ticker ?? 'MACRO',
    action,
    recommendation: `${affected} ${action.toUpperCase()} review from World Monitor; pending PM approval`,
    approvalStatus: 'pending',
    approvedBy: null,
    rationale: `World Monitor event may affect sell discipline. ${alert.summary}`,
    evidence: alert.evidence,
    linkedAlertId: alert.id,
    confidence: Math.max(50, Math.min(92, alert.confidence)),
    createdAt: now,
    updatedAt: now,
    recommendedAction: action,
    recommendedSizing: action === 'trim' ? 'Reduce risk until event transmission is clear' : 'Watch; do not add until event risk resolves',
    rationaleText: `World event changed PM risk context: ${alert.title}`,
  };
}

async function runWorldMonitor(inputs: WorldMonitorInput[], options: {
  persist: boolean;
  persistAgentViews: boolean;
  notifyDiscord: boolean;
  persistMemory: boolean;
  createDecisions: boolean;
}) {
  const existingKeys = await existingAlertKeys();
  const checked = inputs.length;
  let material = 0;
  let persisted = 0;
  let agentViews = 0;
  let notified = 0;
  let memories = 0;
  let decisions = 0;
  const alerts: PMAlert[] = [];
  const decisionRecords: InvestmentDecision[] = [];
  const filtered: Array<{ title: string; reason: string }> = [];

  for (const input of inputs) {
    const event = worldMonitorToEvent(input);
    if (!event) continue;

    const interpretation = await interpretEvent(event);
    if (!interpretation.material) {
      filtered.push({ title: event.title, reason: interpretation.reason });
      continue;
    }

    material++;
    for (const alert of interpretation.alerts) {
      const key = alertKey(alert);
      if (existingKeys.has(key)) continue;

      const saved = options.persist ? await saveAlert(alert) : alert;
      existingKeys.add(key);
      alerts.push(saved);
      if (options.persist) persisted++;

      if (options.persistMemory && shouldRecordWorldMemory(saved)) {
        await recordWorldMemory(saved);
        memories++;
      }

      if (options.notifyDiscord && saved.shouldNotifyPM) {
        await notifyAlert(saved, 'World Brief Lite crossed PM materiality threshold.');
        notified++;
      }

      if (options.createDecisions && shouldCreateWorldDecision(saved)) {
        const decision = await saveDecision(worldDecisionFromAlert(saved));
        decisionRecords.push(decision);
        decisions++;
        if (options.notifyDiscord) {
          await notifyApprovalNeeded(decision);
        }
      }
    }

    if (options.persistAgentViews) {
      const agentView = worldMonitorToAgentView(input);
      if (agentView) {
        await saveAgentView(agentView);
        agentViews++;
      }
    }
  }

  return { checked, material, persisted, agentViews, notified, memories, decisions, alerts, decisionRecords, filtered };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const persist = req.nextUrl.searchParams.get('persist') !== 'false';
    const persistAgentViews = req.nextUrl.searchParams.get('agentViews') !== 'false';
    const notifyDiscord = req.nextUrl.searchParams.get('discord') !== 'false';
    const persistMemory = req.nextUrl.searchParams.get('memory') !== 'false';
    const createDecisions = req.nextUrl.searchParams.get('decisions') !== 'false';
    const days = Math.max(1, Math.min(30, Number(req.nextUrl.searchParams.get('days') ?? '7') || 7));
    const { inputs, source } = await fetchWorldMonitorInputs(req.nextUrl.origin, days);
    const result = await runWorldMonitor(inputs, { persist, persistAgentViews, notifyDiscord, persistMemory, createDecisions });
    return NextResponse.json({ ok: true, source, ...result });
  } catch (err) {
    return jsonError(err, 'Could not run world monitor');
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = postRequestSchema.parse(await readJson(req));
    const result = await runWorldMonitor(body.events as WorldMonitorInput[], {
      persist: body.persist,
      persistAgentViews: body.persistAgentViews,
      notifyDiscord: body.notifyDiscord,
      persistMemory: body.persistMemory,
      createDecisions: body.createDecisions,
    });
    return NextResponse.json({ ok: true, ...result }, { status: result.material > 0 ? 201 : 200 });
  } catch (err) {
    return jsonError(err, 'Could not ingest world monitor events');
  }
}
