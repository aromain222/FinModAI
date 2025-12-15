import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getModelById } from '@/lib/modelsRepo';
import { APP_NAME } from '@/lib/branding';

const SYSTEM_PROMPT = `You are ${APP_NAME}, a sell-side/PE analyst. Provide concise, structured insights using the provided ticker or model context. Always cite assumptions, avoid investment advice, and reference any uploaded memo text when relevant.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const contextType = body?.contextType === 'model' ? 'model' : 'ticker';
    const ticker = body?.ticker?.toUpperCase();
    const modelId = body?.modelId;
    const pdfText = typeof body?.pdfText === 'string' ? body.pdfText : null;
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
      return NextResponse.json({ error: 'Missing OpenAI API key' }, { status: 500 });
    }

    let contextualSummary = '';
    if (contextType === 'model' && modelId) {
      try {
        const model = await getModelById(modelId);
        contextualSummary = `Model: ${model.ticker} (${model.type}), status ${model.status}, created ${model.created_at}`;
      } catch (error) {
        console.error('Unable to load model context', error);
      }
    } else if (ticker) {
      contextualSummary = `Ticker focus: ${ticker}`;
    }

    const client = new OpenAI({ apiKey: openAiKey });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'system', content: contextualSummary },
        pdfText ? { role: 'system', content: `Uploaded memo excerpt: ${pdfText.slice(0, 2000)}` } : null,
        ...messages
      ].filter(Boolean as unknown as <T>(value: T) => value is T)
    });

    const reply = completion.choices[0]?.message?.content ?? 'No response generated.';
    return NextResponse.json({ reply });
  } catch (error) {
    console.error('Analyst chat error', error);
    return NextResponse.json({ error: 'Unable to generate response' }, { status: 500 });
  }
}
