/**
 * Forecast Agent API Endpoint
 * 
 * POST /api/agent/forecast
 * 
 * Strict contract: Always returns ForecastAgentResponse JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseRouteClient } from '@/lib/supabase/server';
import { runForecastAgent } from '@/lib/agent/forecast/agent';
import { fetchForecastAgentData } from '@/lib/agent/forecast/fetchData';
import { extractTickers } from '@/lib/agent/router';
import type { ForecastAgentResponse } from '@/lib/agent/forecast/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RequestSchema = z.object({
  userRequest: z.string().min(1).max(5000).optional(),
  // Back-compat: older clients send `prompt`
  prompt: z.string().min(1).max(5000).optional(),
  ticker: z.string().optional(),
  horizonYears: z.number().int().min(1).max(10).optional().default(4),
  // Step 2 inputs
  mode: z.enum(['request', 'run']).optional(),
  required: z.unknown().optional(),
  data: z.unknown().optional(),
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
  const logMessage = `[forecast-agent:${level.toUpperCase()}] ${message}`;
  
  if (level === 'error') {
    console.error(logMessage, logData);
  } else if (level === 'warn') {
    console.warn(logMessage, logData);
  } else {
    console.log(logMessage, logData);
  }
}

function successResponse(traceId: string, result: ForecastAgentResponse['result']): NextResponse<ForecastAgentResponse> {
  const response: ForecastAgentResponse = { traceId, status: 'ok', result };
  const responseSize = JSON.stringify(response).length;
  log('info', traceId, 'Response sent', { 
    status: 'ok', 
    responseSizeBytes: responseSize,
    action: (result as any)?.action,
    ticker: (result as any)?.ticker ?? null,
    dataCoverage: (result as any)?.dataCoverage?.label ?? null,
  });
  return NextResponse.json(response);
}

function errorResponse(
  traceId: string,
  code: string,
  message: string,
  details?: any,
  httpStatus: number = 500
): NextResponse<ForecastAgentResponse> {
  const response: ForecastAgentResponse = { 
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

    const userRequest = parsed.data.userRequest ?? parsed.data.prompt;
    if (!userRequest) {
      return errorResponse(traceId, 'invalid_request', 'Missing `userRequest`', undefined, 400);
    }

    const tickersFromText = extractTickers(userRequest);
    const inferredTicker = parsed.data.ticker || tickersFromText[0];
    const horizonYears = parsed.data.horizonYears;

    // Log request receipt
    log('info', traceId, 'Request received', {
      userRequestLength: userRequest.length,
      ticker: inferredTicker || null,
      horizonYears,
      mode: parsed.data.mode || null,
      promptPreview: userRequest.substring(0, 100),
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

    // Step 1/2: REQUEST_DATA or FORECAST_RESULT
    log('info', traceId, 'Starting forecast agent');
    let agentOutput: ForecastAgentResponse['result'] | undefined;
    try {
      // If caller provided `data`, the agent can finalize immediately
      if (parsed.data.data) {
        agentOutput = await runForecastAgent({
          userRequest,
          ticker: inferredTicker,
          horizonYears,
          data: parsed.data.data as any,
        });
      } else if (parsed.data.mode === 'run' || parsed.data.required) {
        // Step 2 convenience: server fetches required data and runs the agent again
        if (!inferredTicker) {
          agentOutput = await runForecastAgent({ userRequest, ticker: undefined, horizonYears });
        } else {
          const required =
            (parsed.data.required as any)?.priceHistory ||
            (parsed.data.required as any)?.fundamentals ||
            (parsed.data.required as any)?.sectorBenchmarks
              ? (parsed.data.required as any)
              : (await runForecastAgent({ userRequest, ticker: inferredTicker, horizonYears }) as any)?.required;

          const { data } = await fetchForecastAgentData({
            ticker: inferredTicker,
            required: required as any,
            traceId,
          });
          agentOutput = await runForecastAgent({
            userRequest,
            ticker: inferredTicker,
            horizonYears,
            data,
          });
        }
      } else {
        // Default: Step 1 (REQUEST_DATA)
        agentOutput = await runForecastAgent({ userRequest, ticker: inferredTicker, horizonYears });
      }

      log('info', traceId, 'Forecast agent completed', {
        action: (agentOutput as any)?.action,
        ticker: (agentOutput as any)?.ticker ?? inferredTicker ?? null,
      });
    } catch (e) {
      log('error', traceId, 'Forecast agent failed', { 
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      });
      return errorResponse(traceId, 'forecast_failed', 'Forecast agent failed', { error: String(e) }, 500);
    }

    return successResponse(traceId, agentOutput);
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
