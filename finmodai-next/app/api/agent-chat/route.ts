import { NextRequest, NextResponse } from 'next/server';

import { runLangChainAgent } from '@/lib/agents/langchainAgent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type AgentChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    const contextBlocks = Array.isArray(body?.contextBlocks)
      ? body.contextBlocks.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    const messages = Array.isArray(body?.messages)
      ? body.messages.filter((item: unknown): item is AgentChatMessage => {
          if (!item || typeof item !== 'object') return false;
          const row = item as Record<string, unknown>;
          return (
            (row.role === 'system' || row.role === 'user' || row.role === 'assistant') &&
            typeof row.content === 'string' &&
            row.content.trim().length > 0
          );
        })
      : [];

    if (!message) {
      return NextResponse.json({ ok: false, error: 'Message is required.' }, { status: 400 });
    }

    const reply = await runLangChainAgent({
      message,
      messages,
      contextBlocks,
      forceLiveFacts: body?.forceLiveFacts === true,
      wantsModelPackage: body?.wantsModelPackage === true,
    });

    return NextResponse.json({ ok: true, reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent request failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
