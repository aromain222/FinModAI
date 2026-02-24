import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { APP_NAME } from '@/lib/branding';
import { getOpenAIKeyCandidates, getOpenAIModelCandidates } from '@/lib/openaiKey';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const SYSTEM_PROMPT = `You are ${APP_NAME}, a sell-side/PE analyst and ChatGPT-style research assistant. Provide concise, structured insights. Use ticker context when provided; otherwise respond generally. Always cite assumptions, avoid investment advice, and reference any uploaded memo text when relevant.`;

function redactSecrets(value: string): string {
  return value.replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***');
}

function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const row = error as { status?: number; message?: string; error?: { code?: string; type?: string; message?: string } };
  const message = String(row.message || row.error?.message || '').toLowerCase();
  return row.status === 401 || message.includes('incorrect api key') || message.includes('invalid api key');
}

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const row = error as { status?: number; message?: string; error?: { code?: string; type?: string; message?: string } };
  const message = String(row.message || row.error?.message || '').toLowerCase();
  return row.status === 429 || message.includes('rate limit') || row.error?.code === 'rate_limit_exceeded';
}

function classifyFailureReason(error: unknown): 'missing_key' | 'auth_failed' | 'rate_limited' | 'model_unavailable' {
  if (isAuthError(error)) return 'auth_failed';
  if (isRateLimitError(error)) return 'rate_limited';
  return 'model_unavailable';
}

function keyFingerprint(apiKey: string): string {
  return `${apiKey.slice(0, 10)}...${apiKey.slice(-4)}`;
}

function fmtMillions(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `$${value.toLocaleString('en-US')}`;
}

async function buildDeterministicFallbackReply(params: {
  ticker?: string;
  contextualSummary: string;
  userMessage: string;
  reason: 'missing_key' | 'auth_failed' | 'rate_limited' | 'model_unavailable';
}): Promise<string> {
  const headerByReason: Record<typeof params.reason, string> = {
    missing_key: 'OpenAI key is not configured in this runtime. Returning deterministic demo context instead.',
    auth_failed: 'OpenAI authentication failed (invalid/revoked key in runtime). Returning deterministic demo context instead.',
    rate_limited: 'OpenAI rate limit is currently exceeded. Returning deterministic demo context instead.',
    model_unavailable: 'OpenAI is temporarily unavailable. Returning deterministic demo context instead.',
  };
  const header = headerByReason[params.reason];

  if (!params.ticker) {
    return `${header}\n\n${params.contextualSummary || 'General chat context (no ticker provided).'}`;
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
  let fallbackContextSummary = 'General chat context (no ticker provided).';
  try {
    const body = await req.json();
    const ticker =
      typeof body?.ticker === 'string' && body.ticker.trim().length > 0
        ? body.ticker.trim().toUpperCase()
        : undefined;
    fallbackTicker = ticker;
    const pdfText = typeof body?.pdfText === 'string' ? body.pdfText : null;
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    const contextualSummary = ticker ? `Ticker focus: ${ticker}` : 'General chat context (no ticker provided).';
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
    type SafeMessage = { role: 'user' | 'assistant' | 'system'; content: string };
    const lastUserMessage = safeMessages.filter((message: SafeMessage) => message.role === 'user').slice(-1)[0]?.content || '';
    fallbackUserMessage = lastUserMessage;

    const openAiKeys = getOpenAIKeyCandidates('user');
    if (openAiKeys.length === 0) {
      const fallback = await buildDeterministicFallbackReply({
        ticker,
        contextualSummary,
        userMessage: lastUserMessage,
        reason: 'missing_key',
      });
      return NextResponse.json({ reply: fallback, fallback: true, mode: 'fallback', reason: 'missing_key' }, { status: 200 });
    }

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
    let response: { output_text?: string } | null = null;
    let lastError: unknown = null;
    let sawAuthError = false;
    for (const apiKey of openAiKeys) {
      const client = new OpenAI({ apiKey });
      for (const model of models) {
        try {
          response = await client.responses.create({
            model,
            input: inputMessages,
          });
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[api/analyst-chat] model selected', { model, key: keyFingerprint(apiKey) });
          }
          break;
        } catch (error) {
          lastError = error;
          const authError = isAuthError(error);
          if (authError) sawAuthError = true;
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[api/analyst-chat] model failed', {
              model,
              key: keyFingerprint(apiKey),
              authError,
              message: error instanceof Error ? redactSecrets(error.message) : redactSecrets(String(error)),
            });
          }
          // If a key is invalid, switch to the next configured key.
          if (authError) break;
        }
      }
      if (response) break;
    }
    if (!response) {
      if (sawAuthError) {
        throw new Error('OpenAI authentication failed for configured keys. Verify OPENAI_API_KEY / OPENAI_SERVICE_API_KEY and restart the dev server.');
      }
      throw (lastError instanceof Error ? lastError : new Error('OpenAI request failed across all model candidates'));
    }

    const reply = typeof response.output_text === 'string' && response.output_text.trim().length > 0
      ? response.output_text
      : 'I could not produce a response from the model output.';
    return NextResponse.json({ reply, fallback: false, mode: 'live' });
  } catch (error) {
    const message = error instanceof Error ? redactSecrets(error.message) : 'Unable to generate response';
    console.error('Analyst chat error', { message });
    const failureReason = classifyFailureReason(error);
    let fallbackReply = 'Unable to generate a response right now. Please retry in a moment.';
    try {
      fallbackReply = await buildDeterministicFallbackReply({
        ticker: fallbackTicker,
        contextualSummary: fallbackContextSummary,
        userMessage: fallbackUserMessage,
        reason: failureReason,
      });
    } catch {
      // keep generic fallback
    }
    return NextResponse.json(
      {
        reply: fallbackReply,
        fallback: true,
        mode: 'fallback',
        reason: failureReason,
        error: message,
      },
      { status: 200 }
    );
  }
}
