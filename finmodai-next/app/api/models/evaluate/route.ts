import { NextRequest, NextResponse } from 'next/server';
import type { ModelAndVizArtifact } from '@/lib/ai/schemas';
import { evaluateModel } from '@/lib/modeling/evaluator';
import { toErrorText } from '@/lib/providers/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();
  
  try {
    const body = await req.json().catch(() => ({}));
    const { artifact, inputOverrides, scenarioOverrides, generateScenarios } = body;

    if (!artifact) {
      return NextResponse.json(
        { error: 'invalid_request', message: 'Missing artifact', traceId },
        { status: 400 }
      );
    }

    // Validate artifact structure (basic check)
    if (!artifact.model || !artifact.model.inputs || !artifact.model.outputs) {
      return NextResponse.json(
        { error: 'invalid_request', message: 'Invalid artifact structure', traceId },
        { status: 400 }
      );
    }

    // Merge scenario overrides into inputOverrides if scenarios are not auto-generated
    let finalInputOverrides = inputOverrides || {};
    
    if (scenarioOverrides && Array.isArray(scenarioOverrides) && scenarioOverrides.length > 0) {
      // If scenario overrides exist, we'll need to handle them differently
      // For now, just merge them into inputOverrides (this will be used for Base scenario)
      // TODO: Support proper scenario-specific overrides when scenarios are generated
      scenarioOverrides.forEach((override: { scenarioId: string; inputKey: string; value: number }) => {
        if (override.scenarioId === 'Base') {
          finalInputOverrides[override.inputKey] = override.value;
        }
      });
    }

    // Evaluate model
    const evaluationOutput = evaluateModel(
      artifact as ModelAndVizArtifact,
      finalInputOverrides,
      {
        generateScenarios: generateScenarios === true,
      }
    );

    return NextResponse.json({
      success: true,
      output: evaluationOutput,
      traceId,
    });
  } catch (error) {
    console.error('[models/evaluate] error', { traceId, error });
    return NextResponse.json(
      {
        error: 'evaluation_error',
        message: toErrorText(error),
        traceId,
      },
      { status: 500 }
    );
  }
}

