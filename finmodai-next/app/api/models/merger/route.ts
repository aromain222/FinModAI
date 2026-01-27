/**
 * Merger Model Generation API
 *
 * Unified entrypoint that delegates generation + storage to `runModel()`.
 * Keeps response payload compatible with the existing UI while ensuring
 * consistent error surfaces and download handling.
 */

import { NextResponse } from 'next/server';
import { supabaseRouteClient } from '@/lib/supabase/server';
import { runMergerPipeline } from '@/lib/models/merger/pipeline';
import { serializeMaDealInputs } from '@/lib/models/merger/maDealInputs';
import { handleModelError } from '@/lib/models/errorHandler';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEV_BYPASS_USER_ID = '00000000-0000-0000-0000-000000000000';

export async function POST(req: Request) {
  const traceId = randomUUID();
  
  try {
    let body: any = await req.json();

    // Allow nested merger payloads (e.g. { mergerInputs: { ... } })
    if (body && typeof body === 'object' && body.mergerInputs && typeof body.mergerInputs === 'object') {
      body = { ...body.mergerInputs, ...body };
    }

    // Extract acquirer and target tickers
    const acquirer = body?.buyerTicker || body?.acquirer || body?.acquirerTicker;
    const target = body?.targetTicker || body?.target;
    
    if (!acquirer || !target) {
      return NextResponse.json(
        {
          error: 'INVALID_INPUT',
          message: 'Merger requires both acquirer and target tickers',
          traceId,
        },
        { status: 400 }
      );
    }

    // Convert to canonical input format
    const canonicalInput = {
      modelType: 'merger' as const,
      tickers: [acquirer, target],
      merger: {
        acquirer: String(acquirer).trim().toUpperCase(),
        target: String(target).trim().toUpperCase(),
      },
      assumptions: {
        ...body,
        buyerTicker: acquirer,
        targetTicker: target,
      },
      options: {
        includeExcel: true,
        includePreview: true,
      },
    };

    // Run pipeline
    const pipelineResult = await runMergerPipeline(canonicalInput, {
      traceId,
    });

    // Fetch persisted results for UI compatibility.
    const supabase = supabaseRouteClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    const devBypass =
      process.env.NODE_ENV !== 'production' &&
      (process.env.BYPASS_AUTH === '1' || process.env.DEMO_BYPASS_AUTH === '1' || process.env.DEMO_MODE === '1');

    const userId = devBypass ? DEV_BYPASS_USER_ID : session?.user?.id;

    // Try to fetch model record if available
    let results: any = null;
    let preview: any = pipelineResult.preview || null;
    
    if (pipelineResult.modelId && userId) {
      try {
        const { data: model } = await supabase
          .from('models')
          .select('id, status, ticker, model_type, results, preview')
          .eq('id', pipelineResult.modelId)
          .eq('user_id', userId)
          .maybeSingle();

        if (model) {
          results = typeof model.results === 'string' ? JSON.parse(model.results) : model.results;
          preview = model.preview || (typeof model.preview === 'string' ? JSON.parse(model.preview) : null) || preview;
        }
      } catch (dbError) {
        console.warn('[merger] Failed to fetch model record', dbError);
      }
    }

    const mergerOutput = results?.mergerOutput || pipelineResult.metrics;
    const outputPayload =
      mergerOutput && typeof mergerOutput === 'object'
        ? {
            maInputs: mergerOutput.maInputs ? serializeMaDealInputs(mergerOutput.maInputs) : undefined,
            maV1: mergerOutput.maV1,
            dealConsideration: mergerOutput.dealConsideration,
            sourcesUses: mergerOutput.sourcesUses,
            combinedIS: mergerOutput.combinedIS,
            epsAnalysis: mergerOutput.epsAnalysis,
            purchaseAccounting: mergerOutput.purchaseAccounting,
            checks: mergerOutput.checks || pipelineResult.checks,
          }
        : null;

    return NextResponse.json({
      success: true,
      modelId: pipelineResult.modelId,
      ticker: results?.tickerPair || `${acquirer}-${target}`,
      modelType: 'merger',
      status: pipelineResult.status === 'success' ? 'ready' : 'partial',
      output: outputPayload,
      report: results?.mergerReport ?? null,
      preview,
      appliedDefaults: results?.appliedDefaults ?? [],
      warnings: pipelineResult.warnings || [],
      blocks: [],
      diagnostics: [],
      downloadUrl: pipelineResult.artifact?.downloadUrl,
    });
  } catch (error: any) {
    return handleModelError(error, {
      traceId,
      modelType: 'merger',
      defaultStage: 'compute',
      defaultStep: 'run_pipeline',
    });
  }
}
