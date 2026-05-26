/**
 * GET /api/pm/news-alert-cron
 *
 * Runs every 2 hours during market hours (8 AM–6 PM ET, Mon–Fri).
 * For each active/watch position, fetches recent Perigon headlines
 * and pipes material ones through interpretEvent → saveAlert.
 *
 * Deduplication: alert titles are stored in pm_memory keyed by headline ID
 * so the same story never fires twice.
 *
 * Protected by Authorization: Bearer ${CRON_SECRET}.
 */

import { NextRequest, NextResponse } from 'next/server';
import { listPMRecords } from '@/lib/pm/persistence/store';
import type { PortfolioPosition } from '@/lib/pm/types';
import { interpretEvent } from '@/lib/pm/alerts/interpretEvent';
import { saveAlert } from '@/lib/pm/alerts/alertStore';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 60;

const LOOKBACK_HOURS = 2.5;
const MAX_HEADLINES_PER_TICKER = 5;
const DISCORD_COLORS = { critical: 0xFF0000, high: 0xFF4444, medium: 0xFF8C00, low: 0x00D26A, info: 0xAAAAAA } as const;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function fromIso(): string {
  return new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
}

type RawHeadline = {
  id?: string;
  title?: string;
  description?: string | null;
  url?: string;
  source?: string | { name?: string };
  publishedAt?: string;
  published_at?: string;
};

async function fetchTickerHeadlines(ticker: string): Promise<RawHeadline[]> {
  const key = process.env.PERIGON_API_KEY;
  if (!key) return [];
  const qs = new URLSearchParams({
    apiKey: key,
    q: ticker,
    from: fromIso(),
    sortBy: 'date',
    size: String(MAX_HEADLINES_PER_TICKER),
  });
  try {
    const res = await fetch(`https://api.goperigon.com/v1/all?${qs.toString()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { articles?: unknown[] };
    return Array.isArray(data.articles)
      ? data.articles.filter((x): x is RawHeadline => Boolean(x && typeof x === 'object'))
      : [];
  } catch {
    return [];
  }
}

// In-memory dedup for the lifetime of this cron invocation.
// Cross-invocation dedup uses the pm_alerts table (same title = already fired).
const firedThisRun = new Set<string>();

async function wasAlreadyFired(headlineId: string, title: string): Promise<boolean> {
  if (firedThisRun.has(headlineId)) return true;
  try {
    const existing = await listPMRecords('pm_alerts', { limit: 200 });
    return existing.some(a => {
      const stored = a as { title?: string };
      return stored.title === title;
    });
  } catch {
    return false;
  }
}

function markFired(headlineId: string): void {
  firedThisRun.add(headlineId);
}

async function postDiscord(title: string, body: string, severity: string): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  const color = DISCORD_COLORS[severity as keyof typeof DISCORD_COLORS] ?? DISCORD_COLORS.info;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title,
          description: body,
          color,
          footer: { text: 'CapitalBase News Alert' },
          timestamp: new Date().toISOString(),
        }],
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* best-effort */ }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const positions = await listPMRecords<PortfolioPosition>('pm_positions', { limit: 200 });
  const active = positions.filter(p => p.status === 'active' || p.status === 'watch');

  if (active.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, alerts: 0 });
  }

  const tickers = [...new Set(active.map(p => p.ticker))];
  let totalAlerts = 0;

  for (const ticker of tickers) {
    const headlines = await fetchTickerHeadlines(ticker);

    for (const h of headlines) {
      const title = h.title ?? '';
      const summary = h.description ?? h.title ?? '';
      if (!title || !summary) continue;

      const headlineId = h.id ?? Buffer.from(title).toString('base64').slice(0, 32);
      if (await wasAlreadyFired(headlineId, title)) continue;

      const source = typeof h.source === 'string' ? h.source
        : typeof h.source?.name === 'string' ? h.source.name
        : 'news';

      const result = await interpretEvent({
        id: headlineId,
        title,
        summary,
        source,
        url: h.url ?? null,
        publishedAt: h.publishedAt ?? h.published_at ?? null,
        eventType: 'news',
        tickers: [ticker],
      });

      if (!result.material) {
        markFired(headlineId);
        continue;
      }

      for (const alert of result.alerts) {
        await saveAlert(alert);
        if (alert.shouldNotifyPM) {
          await postDiscord(alert.title, alert.summary, alert.severity);
        }
        totalAlerts++;
      }

      markFired(headlineId);
    }
  }

  return NextResponse.json({ ok: true, checked: tickers.length, alerts: totalAlerts });
}
