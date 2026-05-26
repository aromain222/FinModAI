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
import type { PMAlert } from '@/lib/pm/types';
import { readJson, jsonError } from '@/lib/pm/api/http';
import { interpretEvent } from '@/lib/pm/alerts/interpretEvent';
import { listAlerts, saveAlert } from '@/lib/pm/alerts/alertStore';
import { saveAgentView } from '@/lib/pm/memory/agentViewStore';
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
  const [apiInputs, internalInputs] = await Promise.all([
    fetchWorldMonitorApiInputs(days),
    fetchInternalWorldBriefInputs(origin),
  ]);
  const inputs = dedupeInputs([...apiInputs, ...internalInputs]).slice(0, MAX_EVENTS);
  return {
    inputs,
    source: {
      apiBase: WORLD_MONITOR_API_BASE,
      apiKeyConfigured: Boolean(worldMonitorApiKey()),
      apiEvents: apiInputs.length,
      internalFallbackEvents: internalInputs.length,
      mode: apiInputs.length > 0 ? 'worldmonitor_api_plus_fallback' : 'internal_fallback_only',
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

async function runWorldMonitor(inputs: WorldMonitorInput[], options: { persist: boolean; persistAgentViews: boolean }) {
  const existingKeys = await existingAlertKeys();
  const checked = inputs.length;
  let material = 0;
  let persisted = 0;
  let agentViews = 0;
  const alerts: PMAlert[] = [];
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
    }

    if (options.persistAgentViews) {
      const agentView = worldMonitorToAgentView(input);
      if (agentView) {
        await saveAgentView(agentView);
        agentViews++;
      }
    }
  }

  return { checked, material, persisted, agentViews, alerts, filtered };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const persist = req.nextUrl.searchParams.get('persist') !== 'false';
    const persistAgentViews = req.nextUrl.searchParams.get('agentViews') !== 'false';
    const days = Math.max(1, Math.min(30, Number(req.nextUrl.searchParams.get('days') ?? '7') || 7));
    const { inputs, source } = await fetchWorldMonitorInputs(req.nextUrl.origin, days);
    const result = await runWorldMonitor(inputs, { persist, persistAgentViews });
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
    });
    return NextResponse.json({ ok: true, ...result }, { status: result.material > 0 ? 201 : 200 });
  } catch (err) {
    return jsonError(err, 'Could not ingest world monitor events');
  }
}
