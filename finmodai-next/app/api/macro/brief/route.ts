import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { MARKET_BRIEF_SYSTEM_PROMPT } from '@/lib/prompts/marketBrief';

export const runtime = 'nodejs';

type BriefEvent = {
  title: string;
  impact?: number | null;
  direction?: string | null;
  channel?: string | null;
  region?: string | null;
  assetClass?: string | null;
  publishedAt?: string | null;
  whyItMatters?: string | null;
  transmission?: string | null;
};

type BriefResponse = { briefText: string; mode: 'ai' | 'fallback' };

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function formatEvents(events: BriefEvent[]): string {
  return events
    .slice(0, 10)
    .map((e, idx) => {
      const parts = [
        `#${idx + 1} ${e.title || 'Untitled'}`,
        `impact=${e.impact ?? 'n/a'}`,
        `direction=${e.direction ?? 'n/a'}`,
        `channel=${e.channel ?? 'n/a'}`,
        `assetClass=${e.assetClass ?? 'n/a'}`,
        `region=${e.region ?? 'n/a'}`,
        `timestamp=${e.publishedAt ?? 'n/a'}`,
        `why=${e.whyItMatters ?? 'n/a'}`,
        `transmission=${e.transmission ?? 'n/a'}`,
      ];
      return parts.join(' | ');
    })
    .join('\n');
}

function fallbackBrief(events: BriefEvent[], range: string, region: string): BriefResponse {
  if (!events.length) {
    const brief = `Event flow provided but no usable detail; treat the tape as monitor-only. Watch rates, spreads, and consumer prints for confirmation in ${region} over ${range}.`;
    return { briefText: brief, mode: 'fallback' };
  }
  const sorted = [...events].sort((a, b) => ((b.impact ?? 0) - (a.impact ?? 0)));
  const top = sorted.slice(0, 3);
  const maxImpact = sorted[0]?.impact ?? 0;
  const signal = maxImpact >= 75 ? 'High' : maxImpact >= 40 ? 'Medium' : 'Low';
  const dirs = top.map((e) => (e.direction || '').toLowerCase()).filter(Boolean);
  const bull = dirs.filter((d) => d.includes('up') || d.includes('bull')).length;
  const bear = dirs.filter((d) => d.includes('down') || d.includes('bear')).length;
  const bias = bull === bear ? 'Neutral' : bull > bear ? 'Bullish' : 'Bearish';
  const themes = top
    .map((e) => e.whyItMatters || e.transmission || e.title)
    .filter(Boolean)
    .slice(0, 2);
  const watchLine = top.find((e) => e.transmission)?.transmission || 'Watch rates, FX, and credit for confirmation.';
  const brief = [
    `${signal} signal with ${bias.toLowerCase()} tilt from recent events in ${region} (${range}).`,
    themes.length ? `Drivers: ${themes.join('; ')}` : 'Drivers: event flow concentrated in policy and demand signals.',
    `${watchLine} Environment is ${signal === 'Low' ? 'monitor-only' : 'actionable if prices confirm'}.`,
  ].join(' ');
  return { briefText: brief, mode: 'fallback' };
}

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();
  try {
    const body = await req.json().catch(() => ({}));
    const events: BriefEvent[] = Array.isArray(body?.events)
      ? body.events.map((e: any) => ({
          title: typeof e?.title === 'string' ? e.title : '',
          impact: typeof e?.impact === 'number' ? e.impact : typeof e?.impactScore === 'number' ? e.impactScore : null,
          direction: typeof e?.direction === 'string' ? e.direction : null,
          channel: typeof e?.channel === 'string' ? e.channel : null,
          region: typeof e?.region === 'string' ? e.region : null,
          assetClass: typeof e?.assetClass === 'string' ? e.assetClass : null,
          publishedAt: typeof e?.publishedAt === 'string' ? e.publishedAt : typeof e?.date === 'string' ? e.date : null,
          whyItMatters: typeof e?.whyItMatters === 'string' ? e.whyItMatters : typeof e?.description === 'string' ? e.description : null,
          transmission: typeof e?.transmission === 'string' ? e.transmission : Array.isArray(e?.impactBullets) ? e.impactBullets.join('; ') : null,
        }))
      : [];
    const range = typeof body?.range === 'string' ? body.range : '1W';
    const region = typeof body?.region === 'string' ? body.region : 'global';

    const filteredEvents = events.filter((e) => e.title && e.title.trim().length > 0);
    if (!openai || filteredEvents.length === 0) {
      const fb = fallbackBrief(filteredEvents, range, region);
      console.log('[macro:brief]', { traceId, eventCount: filteredEvents.length, openaiSuccess: false, mode: fb.mode });
      return NextResponse.json(fb);
    }

    const eventsText = formatEvents(filteredEvents);
    const messages = [
      { role: 'system' as const, content: MARKET_BRIEF_SYSTEM_PROMPT },
      {
        role: 'user' as const,
        content: [
          `Range: ${range}`,
          `Region: ${region}`,
          'Events (use these, do not ignore):',
          eventsText,
          '',
          'Return a 2–4 sentence Market Brief that follows the system rules exactly.',
        ].join('\n'),
      },
    ];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const validateBrief = (text: string): boolean => {
      if (!text) return false;
      if (/no events|no macro signal|insufficient data/i.test(text)) return false;
      const sentences = text
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      return sentences.length >= 2 && sentences.length <= 4;
    };

    const runOnce = async () => {
      const resp = await openai.chat.completions.create(
        {
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          temperature: 0.3,
          max_tokens: 800,
          messages,
        },
        { signal: controller.signal }
      );
      return resp.choices?.[0]?.message?.content?.trim() || '';
    };

    let briefText = '';
    let attempt = 0;
    while (attempt < 2 && !briefText) {
      const candidate = await runOnce();
      if (validateBrief(candidate)) {
        briefText = candidate;
        break;
      }
      attempt += 1;
    }
    clearTimeout(timer);

    if (!briefText) {
      const fb = fallbackBrief(filteredEvents, range, region);
      console.log('[macro:brief]', { traceId, eventCount: filteredEvents.length, openaiSuccess: false, mode: fb.mode });
      return NextResponse.json(fb);
    }

    console.log('[macro:brief]', { traceId, eventCount: filteredEvents.length, openaiSuccess: true, promptChars: eventsText.length });
    return NextResponse.json({ briefText, mode: 'ai' });
  } catch (error: any) {
    const range = '1W';
    const region = 'global';
    const fb = fallbackBrief([], range, region);
    console.warn('[macro:brief]', { traceId, eventCount: 0, openaiSuccess: false, error: error?.message });
    return NextResponse.json(fb, { status: 200 });
  }
}
