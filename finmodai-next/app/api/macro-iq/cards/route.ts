/**
 * Macro IQ Cards API Endpoint
 * 
 * POST /api/macro-iq/cards
 * 
 * Returns 3-4 distinct Macro IQ cards with strict validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseRouteClient } from '@/lib/supabase/server';
import { buildMacroIQCards } from '@/lib/macro-iq/builder';
import { MacroIQCardsResponseSchema, type MacroIQCardsResponse } from '@/lib/macro-iq/types';
import { getMacroSnapshot } from '@/lib/data/macroService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RequestSchema = z.object({
  region: z.enum(['global', 'us', 'europe', 'asia']).optional().default('global'),
  range: z.enum(['1D', '1W', '1M']).optional().default('1W'),
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
  const logMessage = `[macro-iq-cards:${level.toUpperCase()}] ${message}`;
  
  if (level === 'error') {
    console.error(logMessage, logData);
  } else if (level === 'warn') {
    console.warn(logMessage, logData);
  } else {
    console.log(logMessage, logData);
  }
}

function successResponse(
  traceId: string,
  cards: MacroIQCardsResponse['result']
): NextResponse<MacroIQCardsResponse> {
  const response: MacroIQCardsResponse = { traceId, status: 'ok', result: cards };
  const responseSize = JSON.stringify(response).length;
  log('info', traceId, 'Response sent', {
    status: 'ok',
    responseSizeBytes: responseSize,
    cardsCount: cards?.cards.length || 0,
    eventTypes: cards?.cards.map(c => c.eventType) || [],
  });
  return NextResponse.json(response);
}

function errorResponse(
  traceId: string,
  code: string,
  message: string,
  details?: any,
  httpStatus: number = 500
): NextResponse<MacroIQCardsResponse> {
  const response: MacroIQCardsResponse = {
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
      });
      return errorResponse(
        traceId,
        'invalid_request',
        'Request body failed validation',
        { issues: parsed.error.issues.map((i) => ({ path: i.path.join('.') || '<root>', message: i.message })) },
        400
      );
    }

    const { region, range } = parsed.data;

    // Log request receipt
    log('info', traceId, 'Request received', {
      region,
      range,
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

    // Fetch raw inputs
    log('info', traceId, 'Fetching raw inputs');
    
    // Fetch macro summary
    let macroSummary: {
      inflation?: { value: number | null; date: string | null };
      unemployment?: { value: number | null; date: string | null };
      fedFunds?: { value: number | null; date: string | null };
    } | undefined;
    
    try {
      const macroSnapshot = await getMacroSnapshot({ traceId });
      if (macroSnapshot.data) {
        // getMacroSnapshot returns inflation as number (YoY %), unemployment and fedFunds as numbers
        // We need to convert to the expected format
        const inflationValue = typeof macroSnapshot.data.inflation === 'number' ? macroSnapshot.data.inflation : null;
        const unemploymentValue = typeof macroSnapshot.data.unemployment === 'number' ? macroSnapshot.data.unemployment : null;
        const fedFundsValue = typeof macroSnapshot.data.fedFunds === 'number' ? macroSnapshot.data.fedFunds : null;
        
        macroSummary = {
          inflation: {
            value: inflationValue,
            date: macroSnapshot.data.asOf || null,
          },
          unemployment: {
            value: unemploymentValue,
            date: macroSnapshot.data.asOf || null,
          },
          fedFunds: {
            value: fedFundsValue,
            date: macroSnapshot.data.asOf || null,
          },
        };
      }
    } catch (e) {
      log('warn', traceId, 'Failed to fetch macro summary', { error: String(e) });
    }

    // Fetch headlines (simplified - would use actual headlines API)
    const headlines: Array<{ title: string; publishedAt: string; source?: string }> = [];
    // TODO: Fetch from /api/macro/events or similar

    // Build cards
    log('info', traceId, 'Building Macro IQ cards');
    let buildResult;
    try {
      buildResult = await buildMacroIQCards({
        region,
        range,
        traceId,
        headlines,
        macroSummary,
      });
      
      log('info', traceId, 'Cards built', {
        cardsCount: buildResult.cards.length,
        eventTypes: buildResult.cards.map(c => c.eventType),
        rawInputs: buildResult.rawInputs,
      });
    } catch (e) {
      log('error', traceId, 'Failed to build cards', {
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      });
      return errorResponse(
        traceId,
        'build_error',
        'Failed to build Macro IQ cards',
        { error: e instanceof Error ? e.message : String(e) },
        500
      );
    }

    // Validate cards with Zod
    const validationResult = MacroIQCardsResponseSchema.safeParse({
      traceId,
      status: 'ok' as const,
      result: {
        cards: buildResult.cards,
        rawInputs: buildResult.rawInputs,
      },
    });

    if (!validationResult.success) {
      log('error', traceId, 'Cards validation failed', {
        errors: validationResult.error.errors,
        cardsCount: buildResult.cards.length,
      });
      return errorResponse(
        traceId,
        'validation_error',
        'Macro IQ cards failed validation',
        {
          issues: validationResult.error.errors.map((i) => ({
            path: i.path.join('.') || '<root>',
            message: i.message,
          })),
        },
        500
      );
    }

    // Check for duplicates
    const eventTypes = buildResult.cards.map(c => c.eventType);
    const uniqueTypes = new Set(eventTypes);
    if (eventTypes.length !== uniqueTypes.size) {
      log('error', traceId, 'Duplicate event types detected', {
        eventTypes,
        uniqueTypes: Array.from(uniqueTypes),
      });
      return errorResponse(
        traceId,
        'duplicate_events',
        'Macro IQ cards contain duplicate event types',
        { eventTypes },
        500
      );
    }

    // Ensure we have 3-4 cards
    if (buildResult.cards.length < 3 || buildResult.cards.length > 4) {
      log('error', traceId, 'Invalid card count', {
        count: buildResult.cards.length,
      });
      return errorResponse(
        traceId,
        'invalid_card_count',
        `Expected 3-4 cards, got ${buildResult.cards.length}`,
        { count: buildResult.cards.length },
        500
      );
    }

    log('info', traceId, 'Cards validated successfully');
    return successResponse(traceId, validationResult.data.result);
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

