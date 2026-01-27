'use client';

import React, { useState } from 'react';

// Helper functions to normalize debug strings
function normalizeDebugString(input: unknown): string {
  if (input == null) return '';
  if (typeof input === 'string') return input;

  // If someone accidentally passed an array of lines, join it back.
  if (Array.isArray(input)) {
    return input.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n');
  }

  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function extractTraceId(input: any): string | null {
  if (!input) return null;
  if (typeof input === 'object') {
    return input.traceId || input.trace_id || input.meta?.traceId || input.meta?.trace_id || null;
  }
  return null;
}

function extractUserMessage(input: any): string {
  // Prefer a real error message if available
  if (!input) return 'Something went wrong.';
  if (typeof input === 'string') return input;

  const msg =
    input.message ||
    input.error?.message ||
    input.error ||
    input.reason ||
    input.meta?.reason;

  if (typeof msg === 'string' && msg.trim()) return msg.trim();
  return 'Model generation failed. Copy debug info and check server logs with the Trace ID.';
}

export interface ErrorAlertProps {
  // Support both legacy string props and new error object
  error?: string | any;
  traceId?: string;
  details?: string;
  onDismiss?: () => void;
  compact?: boolean;
}

/**
 * Compact error alert with traceId and copy debug info button
 * Shows user-friendly error message without stack traces
 * Now safely handles error objects and always renders strings
 */
export function ErrorAlert({ error, traceId, details, onDismiss, compact = false }: ErrorAlertProps) {
  const [copied, setCopied] = useState(false);

  // Handle both legacy string error and new error object pattern
  const errorObj = typeof error === 'string' 
    ? { message: error, traceId, details }
    : error || {};

  const extractedTraceId = traceId || extractTraceId(errorObj) || null;
  const message = typeof error === 'string' 
    ? error 
    : extractUserMessage(errorObj);

  // IMPORTANT: debugText must be a STRING (never an array)
  const debugText = normalizeDebugString(
    errorObj.debug ?? errorObj.details ?? errorObj.error ?? errorObj
  );

  const handleCopyDebugInfo = async () => {
    try {
      await navigator.clipboard.writeText(debugText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy debug info:', err);
    }
  };

  // Extract error details from the error object
  const errorDetails = errorObj?.error?.details || errorObj?.details;
  const errorStack = errorObj?.error?.stack || errorObj?.stack;

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4" style={{ marginBottom: compact ? 0 : 16 }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-red-200">Generation failed</div>
          <div className="mt-1 text-xs text-red-200/80 break-words">
            {message}
          </div>

          {extractedTraceId ? (
            <div className="mt-2 text-xs text-red-200/80">
              <span className="opacity-70">Trace ID:</span>{' '}
              <span className="font-mono">{extractedTraceId}</span>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-white/15 px-3 py-1 text-xs text-red-100 hover:bg-white/10"
            onClick={handleCopyDebugInfo}
          >
            {copied ? 'Copied' : 'Copy debug info'}
          </button>

          {onDismiss && (
            <button
              type="button"
              className="rounded-lg border border-white/15 px-3 py-1 text-xs text-red-100 hover:bg-white/10"
              onClick={onDismiss}
              aria-label="Dismiss"
              title="Dismiss"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>

      {/* Show error message if available */}
      {errorObj?.error?.message ? (
        <pre className="mt-3 whitespace-pre-wrap text-xs text-red-100/90 rounded-lg border border-white/10 bg-black/20 p-3">
          {errorObj.error.message}
        </pre>
      ) : null}

      {/* Show error details (Zod validation errors, etc.) */}
      {Array.isArray(errorDetails) && errorDetails.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-red-100/90">
          {errorDetails.map((d: any, idx: number) => (
            <li key={idx}>
              {(d.path ? `${d.path}: ` : '') + (d.message ?? 'Invalid input')}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Show stack trace in dev mode */}
      {process.env.NODE_ENV !== 'production' && errorStack ? (
        <details className="mt-3 text-xs text-red-100/80">
          <summary className="cursor-pointer">Stack</summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-3">
            {errorStack}
          </pre>
        </details>
      ) : null}

      {/* Fallback: show debug text if no structured error */}
      {!errorObj?.error?.message && !Array.isArray(errorDetails) && debugText && (
        <pre className="mt-3 max-h-40 overflow-auto rounded-lg border border-white/10 bg-black/20 p-3 text-[11px] leading-4 text-red-100/80 whitespace-pre-wrap">
          {debugText}
        </pre>
      )}
    </div>
  );
}

