import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateTextWithProviderFallback, type LlmMessage } from '@/lib/llm/generateText';
import { listPositions } from '@/lib/pm/portfolio/positionStore';
import { listTheses } from '@/lib/pm/thesis/thesisStore';
import { listAlerts } from '@/lib/pm/alerts/alertStore';
import { buildPortfolioChatContext, portfolioChatSystemPrompt } from '@/lib/pm/chat/portfolioContext';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 90;

const bodySchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(5_000),
  })).max(12).default([]),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const [positions, theses, alerts] = await Promise.all([
      listPositions({ limit: 200 }),
      listTheses({ limit: 500 }),
      listAlerts({ limit: 100 }),
    ]);
    const context = buildPortfolioChatContext({ positions, theses, alerts });
    if (context.positions.length === 0) {
      return NextResponse.json({ error: 'portfolio_empty', detail: 'No active holdings are stored in CapitalBase.' }, { status: 409 });
    }

    const messages: LlmMessage[] = [
      { role: 'system', content: portfolioChatSystemPrompt(context) },
      ...parsed.data.history,
      { role: 'user', content: parsed.data.message },
    ];
    const generated = await generateTextWithProviderFallback({
      messages,
      preferredProvider: 'anthropic',
      temperature: 0.2,
      maxTokens: 1_600,
      timeoutMs: 60_000,
    });
    if (!generated) throw new Error('No configured AI provider returned a response.');

    return NextResponse.json({
      ok: true,
      reply: generated.text,
      context: {
        builtAt: context.builtAt,
        positionCount: context.positions.length,
        totalMarketValue: context.totalMarketValue,
        tickers: context.positions.map(position => position.ticker),
        warnings: context.limitations,
      },
      provider: generated.provider,
      model: generated.model,
    });
  } catch (error) {
    console.error('[portfolio-chat] failed:', error);
    return NextResponse.json({
      error: 'portfolio_chat_failed',
      detail: error instanceof Error ? error.message : 'Unknown portfolio chat error.',
    }, { status: 502 });
  }
}
