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

const MAX_EVENTS = 18;

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

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T | null> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

async function fetchWorldMonitorInputs(origin: string): Promise<WorldMonitorInput[]> {
  const briefPromise = fetchJson<WorldBriefResponseV2>(`${origin}/api/world-brief?timeframe=72h`, 8_000);
  const newsPromise = fetchJson<WorldMonitorNewsItem[]>(`${origin}/api/world-brief/news?marketLens=true`, 14_000);
  const [brief, news] = await Promise.all([briefPromise, newsPromise]);

  const briefEvents = Array.isArray(brief?.events) ? brief.events : [];
  const newsEvents = Array.isArray(news) ? news : [];
  return [...briefEvents, ...newsEvents].slice(0, MAX_EVENTS);
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
    const inputs = await fetchWorldMonitorInputs(req.nextUrl.origin);
    const result = await runWorldMonitor(inputs, { persist, persistAgentViews });
    return NextResponse.json({ ok: true, ...result });
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
