/**
 * Standardized API Logging
 * 
 * Provides consistent logging format with trace IDs.
 */

export type LogContext = {
  traceId: string;
  route: string;
  [key: string]: any;
};

/**
 * Log request start
 * Enabled by default, controlled by LOG_LEVEL env var
 */
export function logRequestStart(context: LogContext) {
  const LOG_LEVEL = process.env.LOG_LEVEL || 'all';
  if (LOG_LEVEL === 'none' || LOG_LEVEL === 'errors') return;
  console.log(`[API] ${context.route} START`, context);
}

/**
 * Log request success
 * Enabled by default, controlled by LOG_LEVEL env var
 */
export function logRequestSuccess(context: LogContext, durationMs?: number) {
  const LOG_LEVEL = process.env.LOG_LEVEL || 'all';
  if (LOG_LEVEL === 'none' || LOG_LEVEL === 'errors') return;
  console.log(`[API] ${context.route} SUCCESS`, {
    ...context,
    durationMs,
  });
}

/**
 * Log request error
 */
export function logRequestError(context: LogContext, error: Error | unknown) {
  const errorDetails = error instanceof Error
    ? {
        message: error.message,
        stack: error.stack,
        ...(error as any).code && { code: (error as any).code },
      }
    : { error: String(error) };

  console.error(`[API] ${context.route} ERROR`, {
    ...context,
    ...errorDetails,
  });
}

/**
 * Log Supabase error with full details
 */
export function logSupabaseError(
  context: LogContext,
  supabaseError: { message?: string; code?: string; details?: string; hint?: string }
) {
  console.error(`[API] ${context.route} SUPABASE ERROR`, {
    ...context,
    supabaseError: {
      message: supabaseError.message,
      code: supabaseError.code,
      details: supabaseError.details,
      hint: supabaseError.hint,
    },
  });
}

/**
 * Enhanced logger for structured logging with info/warn/error levels
 * Configurable via LOG_LEVEL env var:
 * - 'all' or unset: log everything (default for move explainer)
 * - 'errors': only log errors and warnings
 * - 'none': no logging
 */
const LOG_LEVEL = process.env.LOG_LEVEL || 'all';

export const logger = {
  info: (data: Record<string, any>, message: string) => {
    if (LOG_LEVEL === 'none') return;
    console.log(`[${message}]`, JSON.stringify(data, null, 2));
  },
  warn: (data: Record<string, any>, message: string) => {
    if (LOG_LEVEL === 'none') return;
    console.warn(`[${message}]`, JSON.stringify(data, null, 2));
  },
  error: (data: Record<string, any>, message: string) => {
    if (LOG_LEVEL === 'none') return;
    // Errors always logged unless explicitly disabled
    console.error(`[${message}]`, JSON.stringify(data, null, 2));
  },
  debug: (data: Record<string, any>, message: string) => {
    if (LOG_LEVEL === 'none' || LOG_LEVEL === 'errors') return;
    console.debug(`[${message}]`, JSON.stringify(data, null, 2));
  },
};







