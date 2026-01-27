/**
 * AI Agent Pipeline API Endpoint
 * 
 * POST /api/agent/run
 * 
 * Takes a user prompt and returns structured recommendations:
 * - Recommended model types
 * - Key assumptions
 * - Preview charts/tables
 * - Next actions
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runPipelineAgent } from '@/lib/ai/pipelineAgent';
import { supabaseRouteClient } from '@/lib/supabase/server';
import { extractTickers } from '@/lib/agent/router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RequestSchema = z.object({
  prompt: z.string().min(1).max(2000),
});

/**
 * Structured logging helper
 */
function log(level: 'info' | 'warn' | 'error', traceId: string, message: string, data?: any) {
  const logData = {
    traceId,
    timestamp: new Date().toISOString(),
    ...data,
  };
  const logMessage = `[agent/run:${level.toUpperCase()}] ${message}`;
  
  if (level === 'error') {
    console.error(logMessage, logData);
  } else if (level === 'warn') {
    console.warn(logMessage, logData);
  } else {
    console.log(logMessage, logData);
  }
}

/**
 * Standardized response shape
 */
type AgentResponse = 
  | { traceId: string; status: 'ok'; result: any }
  | { traceId: string; status: 'error'; error: { code: string; message: string; details?: any } };

function successResponse(traceId: string, result: any): NextResponse<AgentResponse> {
  const response: AgentResponse = { traceId, status: 'ok', result };
  const responseSize = JSON.stringify(response).length;
  log('info', traceId, 'Response sent', { 
    status: 'ok', 
    responseSizeBytes: responseSize,
    resultKeys: Object.keys(result),
  });
  return NextResponse.json(response);
}

function errorResponse(
  traceId: string,
  code: string,
  message: string,
  details?: any,
  httpStatus: number = 500
): NextResponse<AgentResponse> {
  const response: AgentResponse = { 
    traceId, 
    status: 'error', 
    error: { code, message, ...(details && { details }) },
  };
  const responseSize = JSON.stringify(response).length;
  log('error', traceId, 'Error response sent', { 
    code, 
    message, 
    httpStatus,
    responseSizeBytes: responseSize,
  });
  return NextResponse.json(response, { status: httpStatus });
}

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();

  try {
    // Parse request body
    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      log('error', traceId, 'Failed to parse request body', { error: String(e) });
      return errorResponse(traceId, 'invalid_json', 'Request body is not valid JSON', undefined, 400);
    }

    // Validate request schema
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      log('warn', traceId, 'Request validation failed', { 
        issues: parsed.error.issues,
        promptLength: body.prompt?.length || 0,
      });
      return errorResponse(
        traceId,
        'invalid_request',
        'Request body failed validation',
        { issues: parsed.error.issues.map((i) => ({ path: i.path.join('.') || '<root>', message: i.message })) },
        400
      );
    }

    const { prompt } = parsed.data;
    const tickers = extractTickers(prompt);

    // Log request receipt
    log('info', traceId, 'Request received', {
      promptLength: prompt.length,
      tickers: tickers.length > 0 ? tickers : null,
      promptPreview: prompt.substring(0, 100),
    });

    // Check authentication
    const supabase = supabaseRouteClient();
    let user;
    try {
      const authResult = await supabase.auth.getUser();
      user = authResult.data?.user;
      log('info', traceId, 'Auth check', { authenticated: !!user, userId: user?.id });
    } catch (e) {
      log('error', traceId, 'Auth check failed', { error: String(e) });
      return errorResponse(traceId, 'auth_error', 'Authentication check failed', undefined, 500);
    }

    if (!user) {
      log('warn', traceId, 'Unauthorized request');
      return errorResponse(traceId, 'unauthorized', 'Unauthorized', undefined, 401);
    }

    // Run pipeline agent
    log('info', traceId, 'Starting pipeline agent');
    let output;
    try {
      output = await runPipelineAgent(prompt, traceId);
      log('info', traceId, 'Pipeline agent completed', {
        intent: output?.intent,
        modelsCount: output?.modelsToCreate?.length || 0,
        outputsCount: output?.outputs?.length || 0,
        confidence: output?.confidence,
      });
    } catch (e) {
      log('error', traceId, 'Pipeline agent failed', { 
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      });
      return errorResponse(
        traceId,
        'pipeline_error',
        'Pipeline agent execution failed',
        { error: e instanceof Error ? e.message : String(e) },
        500
      );
    }

    if (!output) {
      log('error', traceId, 'Pipeline agent returned null');
      return errorResponse(traceId, 'pipeline_empty', 'Pipeline agent returned no output', undefined, 500);
    }

    // Validate output with Zod
    const { AgentPipelineOutputSchema } = await import('@/lib/ai/pipelineSchema');
    const validated = AgentPipelineOutputSchema.safeParse(output);

    if (!validated.success) {
      log('error', traceId, 'Output validation failed', {
        errors: validated.error.errors,
        outputKeys: Object.keys(output),
      });
      return errorResponse(
        traceId,
        'validation_error',
        'Agent output failed validation',
        { 
          issues: validated.error.errors.map((i) => ({
            path: i.path.join('.') || '<root>',
            message: i.message,
          })),
        },
        500
      );
    }

    log('info', traceId, 'Output validated successfully');
    return successResponse(traceId, validated.data);
  } catch (error) {
    log('error', traceId, 'Unhandled error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return errorResponse(
      traceId,
      'internal_error',
      error instanceof Error ? error.message : 'Unknown error',
      undefined,
      500
    );
  }
}

