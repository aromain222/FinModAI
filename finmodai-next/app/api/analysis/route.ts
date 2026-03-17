import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { APP_NAME } from '@/lib/branding';
import { getOpenAIKey, getOpenAIModelCandidates } from '@/lib/openaiKey';

const SYSTEM_PROMPT = `
You are the MACRO-AWARE FINANCIAL ANALYSIS ENGINE for ${APP_NAME}.
You never give investment advice. You never recommend buys or sells.
You interpret fundamental data, valuation logic, macro trends, and risk frameworks.

CAPABILITIES:
- Fundamental analysis
- Financial health interpretation
- Valuation frameworks (DCF logic, multiples, margin-of-safety logic)
- Mandatory macro analysis (interest rates, inflation, labor markets, GDP, sector macro, commodities, geopolitics, fiscal/monetary policy)
- Catalyst & risk mapping
- Structured bull/base/bear scenario logic
- Decision frameworks based on assumptions, not recommendations

DATA SOURCES:
- Web search (if enabled)
- News APIs (if provided)
- Supabase tables (if available)
- Internal macroeconomic reasoning

Do NOT give direct investment instructions.
Only provide reasoning frameworks and interpretation.
Begin by asking the user: "Ticker/company, timeframe, and assumptions for revenue growth, margins, or macro conditions."
`.trim();

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export async function POST(request: Request) {
  const apiKey = getOpenAIKey('user') || getOpenAIKey('service');
  
  if (!apiKey) {
    console.error('OpenAI API key is not set in environment variables');
    return NextResponse.json(
      { 
        error: 'OpenAI API key is not configured. Please add OPENAI_API_KEY or OPENAI_SERVICE_API_KEY to your .env.local file.' 
      }, 
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const rawMessages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];
    const topic: string | undefined = typeof body?.topic === 'string' ? body.topic : undefined;
    const pdfFileName: string | undefined =
      typeof body?.pdfFileName === 'string' && body.pdfFileName.trim().length > 0
        ? body.pdfFileName.trim()
        : undefined;

    if (rawMessages.length === 0) {
      return NextResponse.json({ error: 'No messages received.' }, { status: 400 });
    }

    // Sanitize and prepare messages
    const sanitizedMessages = rawMessages
      .filter((msg) => msg?.content && typeof msg.content === 'string')
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: sanitizeContent(msg.content)
      }))
      .slice(-12);

    // Optional: Try to fetch macro data, but don't fail if unavailable
    let macroContext = '';
    try {
      const macroNewsModule = await import('@/lib/fetchMacroNews');
      const macroIndicatorsModule = await import('@/lib/fetchMacroEconomicIndicators');
      
      const macroNews = await macroNewsModule.fetchMacroNews(10);
      const macroIndicators = await macroIndicatorsModule.fetchMacroEconomicIndicators();
      macroContext = [macroNews, macroIndicators].filter(Boolean).join('\n');
    } catch (macroError) {
      console.warn('Macro data fetch failed (non-critical):', macroError);
      // Continue without macro data
    }

    const openai = new OpenAI({ apiKey });

    const pdfContext = pdfFileName
      ? `The user says they attached a PDF model file named "${pdfFileName}". You cannot access the file contents. Treat it as a reference and mention that you are responding without direct access to the PDF.`
      : undefined;

    const modelCandidates = getOpenAIModelCandidates(process.env.OPENAI_MODEL, 'gpt-5.4-pro', 'gpt-5.4');
    let stream: Awaited<ReturnType<typeof openai.chat.completions.create>> | null = null;
    let lastError: unknown = null;
    for (const model of modelCandidates) {
      try {
        stream = await openai.chat.completions.create({
          model,
          temperature: 0.2,
          stream: true,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT } as const,
            ...(pdfContext ? [{ role: 'system' as const, content: pdfContext }] : []),
            ...(macroContext ? [{ role: 'system' as const, content: `Macro context:\n${macroContext}` }] : []),
            ...sanitizedMessages.map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content }))
          ]
        });
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!stream) {
      throw (lastError instanceof Error ? lastError : new Error('Failed to stream analysis from OpenAI'));
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              controller.enqueue(encoder.encode(delta));
            }
          }
        } catch (error) {
          console.error('Streaming error:', error);
          controller.enqueue(encoder.encode('\n\n[Stream interrupted due to an error]\n'));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked'
      }
    });
  } catch (error: any) {
    console.error('Analysis route error:', error);
    
    // Return a more helpful error message
    const errorMessage = error?.message || 'Failed to process analysis request.';
    const statusCode = error?.status || 500;
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
      }, 
      { status: statusCode }
    );
  }
}

function sanitizeContent(value: string) {
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 4000);
}
