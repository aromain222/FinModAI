import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import OpenAI from 'openai';
import {
  CAPITALBASE_SCENARIO_ENGINE_SYSTEM_PROMPT,
  buildCapitalBaseScenarioAnalysisPrompt,
} from '@/lib/promptBuilders';

export async function POST(
  request: NextRequest,
  { params }: { params: { modelId: string } }
) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'LLM provider not configured' }, { status: 500 });
  }

  const { modelId } = params;
  const body = await request.json().catch(() => ({}));
  const baseAssumptions = body.baseAssumptions || undefined;

  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: model, error: modelError } = await supabase
    .from('models')
    .select('id, user_id, assumptions, normalized_assumptions, results, scenario')
    .eq('id', modelId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (modelError) {
    return NextResponse.json({ error: 'Database error', details: modelError.message }, { status: 500 });
  }

  if (!model) {
    return NextResponse.json({ error: 'Model not found' }, { status: 404 });
  }

  // Parse assumptions and results
  let assumptions: Record<string, any> = {};
  if (model.assumptions) {
    try {
      assumptions = typeof model.assumptions === 'string' ? JSON.parse(model.assumptions) : model.assumptions;
    } catch {
      assumptions = {};
    }
  }

  // Merge normalized assumptions if available
  if (model.normalized_assumptions) {
    try {
      const normalized = typeof model.normalized_assumptions === 'string' 
        ? JSON.parse(model.normalized_assumptions) 
        : model.normalized_assumptions;
      assumptions = { ...assumptions, ...normalized };
    } catch {
      // Ignore parse errors
    }
  }

  let results: Record<string, any> = {};
  if (model.results) {
    try {
      results = typeof model.results === 'string' ? JSON.parse(model.results) : model.results;
    } catch {
      results = {};
    }
  }

  // Extract key outputs for analysis
  const outputs: Record<string, any> = {
    enterpriseValue: results?.valuation?.enterpriseValue ?? results?.outputs?.enterpriseValue ?? results?.enterpriseValue,
    equityValue: results?.valuation?.equityValue ?? results?.outputs?.equityValue ?? results?.equityValue,
    pricePerShare: results?.valuation?.pricePerShare ?? results?.valuation?.impliedValuePerShare ?? results?.outputs?.pricePerShare ?? results?.pricePerShare,
    terminalValue: results?.valuation?.terminalValue ?? results?.terminalValue,
    presentValue: results?.valuation?.presentValue ?? results?.presentValue,
  };

  // Remove null/undefined values
  Object.keys(outputs).forEach((key) => {
    if (outputs[key] === null || outputs[key] === undefined) {
      delete outputs[key];
    }
  });

  if (Object.keys(outputs).length === 0) {
    return NextResponse.json({ error: 'No model outputs available for analysis' }, { status: 400 });
  }

  const prompt = buildCapitalBaseScenarioAnalysisPrompt(assumptions, outputs, baseAssumptions);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        { role: 'system', content: CAPITALBASE_SCENARIO_ENGINE_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    });

    const responseText = completion.choices[0]?.message?.content ?? '';
    
    // Return the raw response (should be a markdown code block per the system prompt)
    return NextResponse.json({ analysis: responseText }, { status: 200 });
  } catch (error: any) {
    console.error('Scenario analysis error:', error);
    return NextResponse.json(
      { error: 'Analysis failed', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

