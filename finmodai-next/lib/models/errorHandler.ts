/**
 * Standardized Error Handler for Model Routes
 * 
 * Ensures all model errors are structured with:
 * - stage: validate, normalize, compute, validate-output, preview, excel
 * - step: specific operation that failed
 * - message: user-friendly error message
 * - traceId: unique identifier for debugging
 * 
 * NEVER throws - always returns a NextResponse.
 * 
 * This is the SERVER-SIDE version. For client-side error handling,
 * use @/lib/models/handleModelError (different module).
 */

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ModelRunError } from '@/lib/modeling/runModel';
import { createModelError, errorToResponse, type ModelErrorStage } from '@/lib/models/errors';
import type { ModelType } from '@/lib/models/runModelPipeline';

export interface StructuredErrorResponse {
  error: string;
  message?: string;
  details?: string;
  traceId: string;
  stage?: ModelErrorStage;
  step?: string;
  warnings?: string[];
  fieldErrors?: Record<string, string>;
}

/**
 * Handle model errors and return structured response
 * 
 * Requirements:
 * - Always produce a ModelRunError output
 * - Never throw inside the error handler
 * - If error is not a ModelRunError, wrap it via createModelError(err, ctx)
 * - Always include traceId (use existing one or generate a UUID)
 * - Always return status 500 with JSON { error, details, traceId }
 */
/**
 * Handle model errors and return structured NextResponse
 * 
 * SERVER-SIDE ONLY: Returns NextResponse for use in API routes.
 * For client-side, use the async handleModelError from @/lib/models/handleModelError
 * 
 * @param error - Error to handle (can be any type)
 * @param options - Optional context (traceId, modelType, stage, step, httpStatus)
 * @returns NextResponse with structured error JSON
 */
export function handleModelError(
  error: unknown,
  options?: {
    traceId?: string;
    modelType?: ModelType;
    defaultStage?: ModelErrorStage;
    defaultStep?: string;
    httpStatus?: number;
  }
): NextResponse<StructuredErrorResponse> {
  // Wrap everything in try-catch to ensure we never throw
  try {
    const safeOptions = options ?? {};

    // Extract or generate traceId
    let traceId: string;
    if (safeOptions.traceId && typeof safeOptions.traceId === 'string' && safeOptions.traceId.trim().length > 0) {
      traceId = safeOptions.traceId.trim();
    } else if (error && typeof error === 'object' && 'traceId' in error && typeof (error as any).traceId === 'string') {
      traceId = (error as any).traceId;
    } else {
      traceId = randomUUID();
    }

    // Extract modelType from options or error
    const modelType: ModelType = safeOptions.modelType 
      || (error && typeof error === 'object' && 'modelType' in error && typeof (error as any).modelType === 'string'
        ? (error as any).modelType as ModelType
        : 'three-statement');

    // Extract stage and step from options or error
    const defaultStage: ModelErrorStage = safeOptions.defaultStage || 'compute';
    const defaultStep: string = safeOptions.defaultStep || 'unknown';

    let modelRunError: ModelRunError;
    let httpStatus: number = 500;

    // Normalize error to ModelRunError
    if (error instanceof ModelRunError) {
      // Already a ModelRunError - use it directly
      modelRunError = error;
      httpStatus = modelRunError.httpStatus || safeOptions.httpStatus || 500;
    } else {
      // Wrap unknown/partial errors via createModelError
      try {
        modelRunError = createModelError(error, {
          traceId,
          modelType,
          stage: defaultStage,
          step: defaultStep,
        });
        httpStatus = safeOptions.httpStatus || 500;
      } catch (createError) {
        // If createModelError itself fails, create a minimal safe error
        console.error('[handleModelError] createModelError failed:', createError);
        modelRunError = new ModelRunError({
          code: 'ERROR_HANDLER_FAILED',
          message: error instanceof Error ? error.message : 'Model execution failed',
          traceId,
          stage: defaultStage,
          step: 'error_handler',
          httpStatus: 500,
          cause: error,
        });
        httpStatus = 500;
      }
    }

    // Extract error message and details safely
    let errorMessage: string;
    let errorDetails: string | undefined;

    try {
      errorMessage = modelRunError.message || 'Model execution failed';
      
      // In production: never include stack traces in API response
      // In dev: log stack traces server-side (console.error) but NOT in response
      // Only include user-friendly error message in response
      if (error instanceof Error) {
        // Log stack trace server-side (dev only for readability)
        if (process.env.NODE_ENV === 'development') {
          console.error('[handleModelError] Error stack (server-side only):', error.stack);
        }
        // For response: only include message, never stack trace
        errorDetails = error.message || undefined;
      } else if (typeof error === 'string') {
        errorDetails = error;
      } else {
        errorDetails = undefined;
      }
      
      // Fallback if message is empty
      if (!errorMessage || errorMessage.trim().length === 0) {
        errorMessage = 'Model execution failed';
      }
      
      // Never include stack traces in response - sanitize if present
      if (errorDetails && typeof errorDetails === 'string') {
        // Remove any stack trace patterns (lines with "at " or "Error:")
        const lines = errorDetails.split('\n');
        const firstLine = lines[0]?.trim() || '';
        errorDetails = firstLine;
        
        // Truncate long messages
        if (errorDetails.length > 500) {
          errorDetails = errorDetails.substring(0, 500) + '...';
        }
        
        // Don't include if it looks like a stack trace
        if (errorDetails.includes('at ') || errorDetails.includes('Error:')) {
          errorDetails = undefined;
        }
      }
    } catch {
      errorMessage = 'Model execution failed';
      errorDetails = undefined;
    }

    // Build safe response object - NO stack traces (prod or dev)
    const responseBody: StructuredErrorResponse = {
      error: modelRunError.code || 'MODEL_ERROR',
      message: errorMessage,
      traceId,
      ...(errorDetails ? { details: errorDetails } : {}),
    };

    // Try to extract additional fields safely (only if they exist)
    try {
      if (modelRunError.stage) {
        responseBody.stage = modelRunError.stage as ModelErrorStage;
      }
      if (modelRunError.step) {
        responseBody.step = modelRunError.step;
      }
      if ((modelRunError as any).warnings && Array.isArray((modelRunError as any).warnings)) {
        responseBody.warnings = (modelRunError as any).warnings;
      }
      if ((modelRunError as any).fieldErrors && typeof (modelRunError as any).fieldErrors === 'object') {
        responseBody.fieldErrors = (modelRunError as any).fieldErrors;
      }
    } catch {
      // Ignore errors extracting optional fields - we already have the essentials
    }

    // Always return status 500 as per requirements
    return NextResponse.json(responseBody, { status: 500 });

  } catch (handlerError) {
    // Last resort: if the handler itself fails, return a minimal safe response
    console.error('[handleModelError] Fatal error in handler:', handlerError);
    
    const fallbackTraceId = options?.traceId 
      || (handlerError && typeof handlerError === 'object' && 'traceId' in handlerError && typeof (handlerError as any).traceId === 'string'
        ? (handlerError as any).traceId
        : randomUUID());

    return NextResponse.json(
      {
        error: 'ERROR_HANDLER_FAILED',
        details: 'Error handler encountered an internal failure',
        traceId: fallbackTraceId,
      } as StructuredErrorResponse,
      { status: 500 }
    );
  }
}

/**
 * Wrap async function with error handling
 */
export async function withModelErrorHandling<T>(
  fn: () => Promise<T>,
  options: {
    traceId: string;
    modelType: ModelType;
    stage?: ModelErrorStage;
    step?: string;
  }
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw createModelError({
      traceId: options.traceId,
      modelType: options.modelType,
      stage: options.stage || 'compute',
      step: options.step || 'unknown',
      message: error instanceof Error ? error.message : 'Model execution failed',
      cause: error,
    });
  }
}
