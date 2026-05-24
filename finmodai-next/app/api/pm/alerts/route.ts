import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { idPatchSchema, tickerQuerySchema } from '@/lib/pm/schemas';
import { readJson, jsonError } from '@/lib/pm/api/http';
import { listAlerts, saveAlert, updateAlert } from '@/lib/pm/alerts/alertStore';
import { interpretEvent } from '@/lib/pm/alerts/interpretEvent';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const eventRequest = z.object({
  event: z.object({
    id: z.string().optional(),
    title: z.string().min(1),
    summary: z.string().min(1),
    source: z.string().optional(),
    url: z.string().url().nullable().optional(),
    publishedAt: z.string().nullable().optional(),
    eventType: z.enum(['market', 'news', 'macro', 'earnings', 'agent', 'portfolio']).optional(),
    tickers: z.array(z.string()).optional(),
    themes: z.array(z.string()).optional(),
    impactDirection: z.enum(['bullish', 'bearish', 'neutral', 'mixed']).optional(),
    severityHint: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional(),
    confidence: z.number().min(0).max(100).optional(),
    materiality: z.number().min(0).max(100).optional(),
    urgency: z.number().min(0).max(100).optional(),
  }),
  persist: z.boolean().optional().default(true),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const parsed = tickerQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const alerts = await listAlerts(parsed);
    return NextResponse.json({ alerts });
  } catch (err) {
    return jsonError(err, 'Could not load alerts');
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await readJson(req);
    const eventParsed = eventRequest.safeParse(body);
    if (eventParsed.success) {
      const interpretation = await interpretEvent(eventParsed.data.event);
      const alerts = eventParsed.data.persist
        ? await Promise.all(interpretation.alerts.map(alert => saveAlert(alert)))
        : interpretation.alerts;
      return NextResponse.json({ ...interpretation, alerts }, { status: interpretation.material ? 201 : 200 });
    }
    const alert = await saveAlert(body);
    return NextResponse.json({ alert }, { status: 201 });
  } catch (err) {
    return jsonError(err, 'Could not save alert');
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const { id, patch } = idPatchSchema.parse(await readJson(req));
    const alert = await updateAlert(id, patch);
    return alert
      ? NextResponse.json({ alert })
      : NextResponse.json({ error: 'Alert not found' }, { status: 404 });
  } catch (err) {
    return jsonError(err, 'Could not update alert');
  }
}
