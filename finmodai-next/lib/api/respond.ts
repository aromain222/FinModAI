/**
 * Standardized API Response Helpers
 * 
 * All responses include a traceId for debugging.
 * All errors follow a consistent shape.
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

export type ApiError = {
  error: string;
  details?: string;
  code?: string;
  traceId: string;
};

export type ApiSuccess<T = any> = {
  data: T;
  traceId?: string;
};

/**
 * Generate a trace ID for request tracking
 */
export function generateTraceId(): string {
  return randomUUID();
}

/**
 * Success response (200)
 */
export function ok<T>(data: T, traceId?: string): NextResponse<ApiSuccess<T>> {
  return NextResponse.json(
    { data, traceId: traceId || generateTraceId() },
    { status: 200 }
  );
}

/**
 * Bad request (400)
 */
export function badRequest(
  message: string,
  details?: string,
  code?: string,
  traceId?: string
): NextResponse<ApiError> {
  return NextResponse.json(
    {
      error: message,
      details,
      code,
      traceId: traceId || generateTraceId(),
    },
    { status: 400 }
  );
}

/**
 * Unauthorized (401)
 */
export function unauthorized(
  details?: string,
  traceId?: string
): NextResponse<ApiError> {
  return NextResponse.json(
    {
      error: 'Unauthorized',
      details: details || 'Authentication required',
      code: 'UNAUTHORIZED',
      traceId: traceId || generateTraceId(),
    },
    { status: 401 }
  );
}

/**
 * Not found (404)
 */
export function notFound(
  message: string,
  details?: string,
  code?: string,
  traceId?: string
): NextResponse<ApiError> {
  return NextResponse.json(
    {
      error: message,
      details,
      code,
      traceId: traceId || generateTraceId(),
    },
    { status: 404 }
  );
}

/**
 * Forbidden (403)
 */
export function forbidden(
  details?: string,
  traceId?: string
): NextResponse<ApiError> {
  return NextResponse.json(
    {
      error: 'Forbidden',
      details: details || 'You do not have permission to access this resource',
      code: 'FORBIDDEN',
      traceId: traceId || generateTraceId(),
    },
    { status: 403 }
  );
}

/**
 * Server error (500)
 */
export function serverError(
  message: string,
  err?: Error | unknown,
  traceId?: string
): NextResponse<ApiError> {
  const errorDetails = err instanceof Error ? err.message : String(err);
  const errorCode = err instanceof Error && (err as any).code ? (err as any).code : undefined;

  return NextResponse.json(
    {
      error: message,
      details: errorDetails,
      code: errorCode,
      traceId: traceId || generateTraceId(),
    },
    { status: 500 }
  );
}







