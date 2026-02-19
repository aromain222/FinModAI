// @ts-nocheck
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import OpenAI from 'openai';
import { buildForecastExplanationPrompt } from '@/lib/promptBuilders';
import { BaseAssumptions, ScenarioAssumptions, runForecast } from '@/lib/scenarioEngine';
import { getOpenAIKey, getOpenAIModelCandidates } from '@/lib/openaiKey';

export async function POST(request: Request) {
  const apiKey = getOpenAIKey('user') || getOpenAIKey('service');
  if (!apiKey) {
    return NextResponse.json({ error: 'LLM provider not configured' }, { status: 500 });
  }

  const body = await request.json();
  const scenarioId: string | undefined = body?.scenarioId;
  const assumptions: BaseAssumptions | undefined = body?.assumptions;

  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let forecastScenario: ScenarioAssumptions | undefined;
  let forecastResult;

  if (scenarioId) {
    const { data: scenario } = await supabase
      .from('scenarios')
      .select('id, user_id, assumptions')
      .eq('id', scenarioId)
      .single<{ user_id: string; assumptions: ScenarioAssumptions }>();
    if (!scenario) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }
    if (scenario.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    forecastScenario = scenario.assumptions;
    forecastResult = runForecast(forecastScenario, { periods: 8, frequency: 'quarterly' });
  } else if (assumptions) {
    forecastScenario = {
      ...assumptions,
      name: 'Ad-hoc Forecast',
      type: 'custom'
    };
    forecastResult = runForecast(forecastScenario, { periods: 8, frequency: 'quarterly' });
  } else {
    return NextResponse.json({ error: 'Provide scenarioId or assumptions' }, { status: 400 });
  }

  const prompt = buildForecastExplanationPrompt(forecastResult, forecastScenario);

  const openai = new OpenAI({ apiKey });
  const modelCandidates = getOpenAIModelCandidates(process.env.OPENAI_MODEL, 'gpt-4o-mini', 'gpt-4.1-mini');
  let stream: Awaited<ReturnType<typeof openai.chat.completions.create>> | null = null;
  let lastError: unknown = null;
  for (const model of modelCandidates) {
    try {
      stream = await openai.chat.completions.create({
        model,
        temperature: 0.25,
        stream: true,
        messages: [
          { role: 'system', content: 'You explain forecasts with analytical discipline only.' },
          { role: 'user', content: prompt }
        ]
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!stream) {
    throw (lastError instanceof Error ? lastError : new Error('Failed to stream forecast explanation from OpenAI'));
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
        console.error('forecast explain stream error', error);
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
