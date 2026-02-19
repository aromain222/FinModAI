import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getModelById } from '@/lib/modelsRepo';
import { APP_NAME } from '@/lib/branding';
import { getOpenAIKey, getOpenAIModelCandidates } from '@/lib/openaiKey';

const SYSTEM_PROMPT = `You are ${APP_NAME}, a sell-side/PE analyst. Provide concise, structured insights using the provided ticker or model context. Always cite assumptions, avoid investment advice, and reference any uploaded memo text when relevant.`;

function fmtMillions(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `$${value.toLocaleString('en-US')}`;
}

async function buildDeterministicFallbackReply(params: {
  ticker?: string;
  contextualSummary: string;
  userMessage: string;
  reason: 'missing_key' | 'model_unavailable';
}): Promise<string> {
  const header =
    params.reason === 'missing_key'
      ? 'OpenAI key is not configured. Returning deterministic demo context instead.'
      : 'OpenAI is temporarily unavailable. Returning deterministic demo context instead.';

  if (!params.ticker) {
    return `${header}\n\n${params.contextualSummary || 'No ticker/model context selected.'}`;
  }

  try {
    const { getDemoFundamentals } = await import('@/lib/data/providers/demoProvider');
    const fundamentals = await getDemoFundamentals(params.ticker);
    if (!fundamentals) {
      return `${header}\n\nTicker focus: ${params.ticker}\nNo demo fundamentals found for this ticker.`;
    }

    const netDebt =
      typeof fundamentals.totalDebt === 'number' && typeof fundamentals.cash === 'number'
        ? fundamentals.totalDebt - fundamentals.cash
        : null;
    const question = params.userMessage.trim() || 'the current fundamentals';

    return `${header}

Ticker focus: ${fundamentals.ticker} (${fundamentals.companyName})
Question: ${question}

LTM Revenue: ${fmtMillions(fundamentals.revenueLTM)} (USD millions)
LTM EBITDA: ${fmtMillions(fundamentals.ebitdaLTM)} (USD millions)
LTM Net Income: ${fmtMillions(fundamentals.netIncomeLTM)} (USD millions)
Cash: ${fmtMillions(fundamentals.cash)} (USD millions)
Total Debt: ${fmtMillions(fundamentals.totalDebt)} (USD millions)
Net Debt: ${fmtMillions(netDebt)} (USD millions)
Shares Outstanding: ${typeof fundamentals.sharesOutstanding === 'number' ? fundamentals.sharesOutstanding.toLocaleString('en-US') : '—'} (millions)

Interpretation: this is a deterministic data snapshot only; advanced narrative analysis resumes once OpenAI is available.`;
  } catch {
    return `${header}\n\n${params.contextualSummary || `Ticker focus: ${params.ticker}`}`;
  }
}

export async function POST(req: NextRequest) {
  let fallbackTicker: string | undefined;
  let fallbackUserMessage = '';
  let fallbackContextSummary = 'No ticker/model context selected.';
  try {
    const body = await req.json();
    const contextType = body?.contextType === 'model' ? 'model' : 'ticker';
    const ticker = body?.ticker?.toUpperCase();
    fallbackTicker = ticker;
    const modelId = body?.modelId;
    const pdfText = typeof body?.pdfText === 'string' ? body.pdfText : null;
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    let contextualSummary = '';
    if (contextType === 'model' && modelId) {
      try {
        const model = await getModelById(modelId);
        if (model) {
          contextualSummary = `Model: ${model.ticker} (${model.model_type}), status ${model.status}, created ${model.created_at}`;
        } else {
          contextualSummary = 'Model context requested, but model was not found.';
        }
      } catch (error) {
        console.error('Unable to load model context', error);
        contextualSummary = 'Model context requested, but loading model details failed.';
      }
    } else if (ticker) {
      contextualSummary = `Ticker focus: ${ticker}`;
    }
    fallbackContextSummary = contextualSummary || fallbackContextSummary;

    const safeMessages = messages
      .filter((m: unknown): m is { role: 'user' | 'assistant' | 'system'; content: string } => {
        if (!m || typeof m !== 'object') return false;
        const row = m as Record<string, unknown>;
        return (
          (row.role === 'user' || row.role === 'assistant' || row.role === 'system') &&
          typeof row.content === 'string' &&
          row.content.trim().length > 0
        );
      })
      .slice(-12);
    const lastUserMessage = safeMessages.filter((message) => message.role === 'user').slice(-1)[0]?.content || '';
    fallbackUserMessage = lastUserMessage;

    const openAiKey = getOpenAIKey('user') || getOpenAIKey('service');
    if (!openAiKey) {
      const fallback = await buildDeterministicFallbackReply({
        ticker,
        contextualSummary,
        userMessage: lastUserMessage,
        reason: 'missing_key',
      });
      return NextResponse.json({ reply: fallback, fallback: true }, { status: 200 });
    }

    const client = new OpenAI({ apiKey: openAiKey });

    const inputMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: contextualSummary || 'No explicit context provided.' },
      ...(pdfText ? [{ role: 'system' as const, content: `Uploaded memo excerpt: ${pdfText.slice(0, 2000)}` }] : []),
      ...safeMessages,
    ];
    if (!inputMessages.some((m) => m.role === 'user')) {
      inputMessages.push({ role: 'user', content: 'Provide a concise market and fundamentals summary.' });
    }

    const models = getOpenAIModelCandidates(process.env.OPENAI_MODEL);
    let response: Awaited<ReturnType<typeof client.responses.create>> | null = null;
    let lastError: unknown = null;
    for (const model of models) {
      try {
        response = await client.responses.create({
          model,
          input: inputMessages,
        });
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[api/analyst-chat] model selected', { model });
        }
        break;
      } catch (error) {
        lastError = error;
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[api/analyst-chat] model failed', {
            model,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    if (!response) {
      throw (lastError instanceof Error ? lastError : new Error('OpenAI request failed across all model candidates'));
    }

    const reply = typeof response.output_text === 'string' && response.output_text.trim().length > 0
      ? response.output_text
      : 'I could not produce a response from the model output.';
    return NextResponse.json({ reply, fallback: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate response';
    console.error('Analyst chat error', { message, error });
    let fallbackReply = 'Unable to generate a response right now. Please retry in a moment.';
    try {
      fallbackReply = await buildDeterministicFallbackReply({
        ticker: fallbackTicker,
        contextualSummary: fallbackContextSummary,
        userMessage: fallbackUserMessage,
        reason: 'model_unavailable',
      });
    } catch {
      // keep generic fallback
    }
    return NextResponse.json(
      {
        reply: fallbackReply,
        fallback: true,
        error: message,
      },
      { status: 200 }
    );
  }
}
