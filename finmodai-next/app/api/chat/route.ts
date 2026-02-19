import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getOpenAIKey, getOpenAIModelCandidates } from '@/lib/openaiKey';
import { routeChatQuery } from '@/lib/chat/router';
import { fetchCompanySnapshots, fetchMarketSnapshot, fetchRecentNewsContext } from '@/lib/chat/context';
import {
  chatModelJsonSchema,
  chatModelOutputSchema,
  chatRequestSchema,
  type ChatModelOutput,
  type ChatWindow,
} from '@/lib/chat/schemas';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = [
  'You are CapitalBase, an institutional finance assistant.',
  'Style: concise, neutral, finance-native, no hype.',
  'Rules:',
  '- Use bullet-point takeaways.',
  '- Show units when using financial numbers (USD millions).',
  '- Never invent news or URLs.',
  '- If recent-event sources are missing, say so plainly and propose the closest cached window.',
  '- Keep answer to 1-3 short paragraphs.',
  'Return JSON only using the required response schema.',
].join('\n');

const WINDOW_LABEL: Record<ChatWindow, string> = {
  '1d': '1D',
  '3d': '3D',
  '1w': '1W',
  '1m': '1M',
};

function latestUserMessage(payload: { message?: string; messages?: Array<{ role: string; content: string }> }): string {
  if (payload.message) return payload.message;
  const lastUser = [...(payload.messages ?? [])].reverse().find((message) => message.role === 'user');
  if (!lastUser) throw new Error('No user message provided.');
  return lastUser.content;
}

function parseResponseText(response: any): string {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) return response.output_text;
  const chunks = response?.output ?? [];
  for (const chunk of chunks) {
    const content = chunk?.content ?? [];
    for (const item of content) {
      if (item?.type === 'output_text' && typeof item?.text === 'string') {
        return item.text;
      }
      if (item?.type === 'text' && typeof item?.text === 'string') {
        return item.text;
      }
    }
  }
  throw new Error('OpenAI Responses API returned no text payload.');
}

function jsonOrThrow(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Model returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function fallbackMissingSources(requestedWindow: ChatWindow, usedWindow: ChatWindow | null): ChatModelOutput {
  const closest = usedWindow ? WINDOW_LABEL[usedWindow] : null;
  const requested = WINDOW_LABEL[requestedWindow];
  const note = closest
    ? `No cached sources are available for ${requested}. Closest available cached window is ${closest}.`
    : `No cached sources are available for ${requested}.`;

  return {
    answer: `${note} I can still answer using market snapshot context only, but I will not make current-event claims without source URLs.`,
    bullets: [
      note,
      'No current-event claim is made without verifiable cached URLs.',
      closest ? `Try rerunning with window=${usedWindow}.` : 'Try a wider window such as 1W.',
    ],
    sources: [],
  };
}

export async function POST(req: NextRequest) {
  try {
    const parsedBody = chatRequestSchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid request payload.', details: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const userMessage = latestUserMessage(parsedBody.data);
    const routed = routeChatQuery(userMessage, parsedBody.data.window);

    const marketSnapshot = await fetchMarketSnapshot(req.nextUrl.origin);

    let companySnapshots: Awaited<ReturnType<typeof fetchCompanySnapshots>> = [];
    let recentNews: Awaited<ReturnType<typeof fetchRecentNewsContext>> | null = null;

    if (routed.intent === 'company_model') {
      companySnapshots = await fetchCompanySnapshots(routed.tickers);
    } else if (routed.intent === 'news_recent') {
      recentNews = await fetchRecentNewsContext({ window: routed.window, query: userMessage });
    } else if (routed.intent === 'market_live' && routed.asksWhy) {
      recentNews = await fetchRecentNewsContext({ window: routed.window, query: userMessage });
    }

    const needsSources = routed.intent === 'news_recent' || (routed.intent === 'market_live' && routed.asksWhy);
    if (needsSources && (!recentNews || !recentNews.hasSources)) {
      const fallback = fallbackMissingSources(routed.window, recentNews?.usedWindow ?? null);
      return NextResponse.json({
        ok: true,
        intent: routed.intent,
        windowRequested: routed.window,
        windowUsed: recentNews?.usedWindow ?? null,
        response: fallback,
      });
    }

    const sourceMap = new Map<string, { title: string; url: string; source: string }>();
    for (const headline of recentNews?.headlines ?? []) {
      sourceMap.set(headline.url, {
        title: headline.title,
        url: headline.url,
        source: headline.source,
      });
    }
    for (const event of recentNews?.events ?? []) {
      for (const url of event.sourceUrls) {
        if (!sourceMap.has(url)) {
          sourceMap.set(url, {
            title: event.title,
            url,
            source: 'Cached Macro Event',
          });
        }
      }
    }

    const openAiKey = getOpenAIKey('user') || getOpenAIKey('service');
    if (!openAiKey) {
      return NextResponse.json({ ok: false, error: 'OpenAI API key is not configured.' }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey: openAiKey });

    const contextBlocks = [
      `Market Context (ALWAYS USE):\n${JSON.stringify(marketSnapshot, null, 2)}`,
      `Routing Context:\n${JSON.stringify(
        { intent: routed.intent, requestedWindow: routed.window, tickers: routed.tickers, asksWhy: routed.asksWhy },
        null,
        2
      )}`,
    ];

    if (recentNews) {
      contextBlocks.push(`Recent Macro Drivers:\n${JSON.stringify(recentNews.events, null, 2)}`);
      contextBlocks.push(`Relevant Headlines:\n${JSON.stringify(recentNews.headlines, null, 2)}`);
    }
    if (companySnapshots.length > 0) {
      contextBlocks.push(`Company Snapshots (USD millions):\n${JSON.stringify(companySnapshots, null, 2)}`);
    }

    const models = getOpenAIModelCandidates(process.env.OPENAI_MODEL);
    let response: Awaited<ReturnType<typeof openai.responses.create>> | null = null;
    let lastError: unknown = null;
    for (const model of models) {
      try {
        response = await openai.responses.create({
          model,
          temperature: 0.2,
          input: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...contextBlocks.map((block) => ({ role: 'system' as const, content: block })),
            { role: 'user', content: userMessage },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: chatModelJsonSchema.name,
              schema: chatModelJsonSchema.schema,
              strict: true,
            },
          },
        } as any);
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[api/chat] model selected', { model });
        }
        break;
      } catch (error) {
        lastError = error;
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[api/chat] model failed', {
            model,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    if (!response) {
      throw (lastError instanceof Error ? lastError : new Error('OpenAI request failed across all model candidates'));
    }

    const modelText = parseResponseText(response);
    const parsedJson = jsonOrThrow(modelText);
    const parsedOutput = chatModelOutputSchema.parse(parsedJson);

    const filteredSources = (parsedOutput.sources ?? [])
      .filter((source) => sourceMap.has(source.url))
      .map((source) => sourceMap.get(source.url)!);

    let finalResponse: ChatModelOutput = {
      ...parsedOutput,
      sources: filteredSources,
    };

    if (needsSources && filteredSources.length === 0) {
      const fallbackSources = Array.from(sourceMap.values()).slice(0, 6);
      finalResponse = {
        ...parsedOutput,
        bullets: parsedOutput.bullets.slice(0, 6),
        sources: fallbackSources,
      };
    }

    return NextResponse.json({
      ok: true,
      intent: routed.intent,
      windowRequested: routed.window,
      windowUsed: recentNews?.usedWindow ?? routed.window,
      response: finalResponse,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Chat request failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
