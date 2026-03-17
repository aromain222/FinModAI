import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { APP_NAME } from '@/lib/branding';
import { getOpenAIKey } from '@/lib/openaiKey';

const MACRO_PROMPT = `You are ${APP_NAME}'s macro desk. Given market indices, yields, and headlines, outline 3-5 concise bullets on how this backdrop could influence valuations, discount rates, and risk appetite.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const apiKey = getOpenAIKey('service');
    if (!apiKey) throw new Error('Missing OPENAI_SERVICE_API_KEY or OPENAI_API_KEY');

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-5.4',
      temperature: 0.3,
      messages: [
        { role: 'system', content: MACRO_PROMPT },
        { role: 'user', content: JSON.stringify(body).slice(0, 6000) }
      ]
    });

    const analysis = completion.choices[0]?.message?.content ?? 'No commentary available.';
    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('Macro AI error', error);
    return NextResponse.json({ error: 'Unable to generate commentary' }, { status: 500 });
  }
}
