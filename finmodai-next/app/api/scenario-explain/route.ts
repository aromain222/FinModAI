import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import OpenAI from 'openai';
import { buildScenarioExplanationPrompt } from '@/lib/promptBuilders';
import { DcfResult, ForecastResult, ScenarioAssumptions } from '@/lib/scenarioEngine';

type ScenarioRow = {
  id: string;
  user_id: string;
  name: string;
  assumptions: ScenarioAssumptions;
  type: string;
};

type ScenarioResultRow = {
  dcf_output: DcfResult;
  forecast_output?: {
    quarterly?: ForecastResult;
    yearly?: ForecastResult;
  };
};

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'LLM provider not configured' }, { status: 500 });
  }

  const body = await request.json();
  const scenarioId: string | undefined = body?.scenarioId;

  if (!scenarioId) {
    return NextResponse.json({ error: 'scenarioId required' }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: scenario, error: scenarioError } = await supabase
    .from('scenarios')
    .select('*')
    .eq('id', scenarioId)
    .single<ScenarioRow>();

  if (scenarioError || !scenario) {
    return NextResponse.json({ error: 'Scenario not found.' }, { status: 404 });
  }

  if (scenario.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: resultRow } = await supabase
    .from('scenario_results')
    .select('*')
    .eq('scenario_id', scenarioId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single<ScenarioResultRow>();

  if (!resultRow) {
    return NextResponse.json({ error: 'Scenario results missing.' }, { status: 404 });
  }

  const prompt = buildScenarioExplanationPrompt(
    scenario.name,
    scenario.assumptions,
    resultRow.dcf_output,
    resultRow.forecast_output?.yearly ?? resultRow.forecast_output?.quarterly
  );

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const stream = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    temperature: 0.25,
    stream: true,
    messages: [
      { role: 'system', content: 'You explain financial scenarios without giving advice.' },
      { role: 'user', content: prompt }
    ]
  });

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
        console.error('scenario explain stream error', error);
        controller.enqueue(encoder.encode('\n[Explanation interrupted]\n'));
      } finally {
        controller.close();
      }
    }
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
}

