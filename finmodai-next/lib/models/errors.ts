/**
 * Standardized Error Handling
 * 
 * Ensures all model errors include:
 * - traceId
 * - modelType
 * - stage (validate, compute, preview, excel)
 * 
 * Usage:
 *   throw createModelError(err, {
 *     traceId,
 *     modelType: 'lbo',
 *     ticker: 'AAPL',
 *   });
 */

import { ModelRunError } from '@/lib/modeling/runModel';
import type { ModelType } from './runModelPipeline';

export type ModelErrorStage = 
  | 'validate'
  | 'normalize'
  | 'compute'
  | 'validate-output'
  | 'preview'
  | 'excel';

export interface ModelErrorParams {
  traceId: string;
  modelType: ModelType;
  stage: ModelErrorStage;
  step: string;
  message: string;
  code?: string;
  httpStatus?: number;
  cause?: unknown;
}

/**
 * Context object for error creation (all fields optional)
 */
export interface ModelErrorContext {
  assumptions?: any;
  sanitizedAssumptions?: any;
  enrichedAssumptions?: any;
  ticker?: string;
  modelType?: ModelType | string;
  traceId?: string;
  stage?: ModelErrorStage | string;
  step?: string;
}

/**
 * Create standardized model error with defensive context handling
 * 
 * Supports two signatures for backward compatibility:
 * 1. New signature: createModelError(err, ctx?) - takes error and optional context
 * 2. Old signature: createModelError(params) - takes ModelErrorParams object
 * 
 * Never accesses context fields eagerly - only uses optional chaining.
 * Safely includes context in meta if provided.
 */
export function createModelError(
  errOrParams: unknown | ModelErrorParams,
  ctx?: ModelErrorContext
): ModelRunError {
  // Check if first argument is the old ModelErrorParams format (has traceId, modelType, stage, step, message)
  const isOldSignature = 
    errOrParams && 
    typeof errOrParams === 'object' && 
    'traceId' in errOrParams && 
    'modelType' in errOrParams &&
    'stage' in errOrParams &&
    'step' in errOrParams &&
    'message' in errOrParams;

  let code: string;
  let message: string;
  let traceId: string;
  let stage: string;
  let step: string;
  let httpStatus: number | undefined;
  let cause: unknown;
  let metaContext: ModelErrorContext | undefined;

  if (isOldSignature) {
    // Old signature: ModelErrorParams object
    const params = errOrParams as ModelErrorParams;
    code = params.code || 'MODEL_ERROR';
    message = params.message;
    traceId = params.traceId;
    stage = params.stage;
    step = params.step;
    httpStatus = params.httpStatus;
    cause = params.cause;
    // Extract meta context from params if available
    metaContext = {
      ...(params.modelType ? { modelType: params.modelType } : {}),
    };
  } else {
    // New signature: err + optional ctx
    const err = errOrParams;
    
    // Extract message from error safely
    message = err instanceof Error 
      ? err.message 
      : typeof err === 'string' 
        ? err 
        : 'Model error occurred';

    // Extract traceId from context or error, or generate a fallback
    traceId = ctx?.traceId 
      || (err && typeof err === 'object' && 'traceId' in err && typeof (err as any).traceId === 'string' 
        ? (err as any).traceId 
        : 'unknown');

    // Extract stage and step from context or error
    stage = (ctx?.stage as string) 
      || (err && typeof err === 'object' && 'stage' in err && typeof (err as any).stage === 'string'
        ? (err as any).stage
        : 'compute');

    step = ctx?.step 
      || (err && typeof err === 'object' && 'step' in err && typeof (err as any).step === 'string'
        ? (err as any).step
        : 'unknown');

    // Extract code from error if available
    code = (err && typeof err === 'object' && 'code' in err && typeof (err as any).code === 'string'
      ? (err as any).code
      : 'MODEL_ERROR');

    // Extract httpStatus from error if available
    httpStatus = (err && typeof err === 'object' && 'httpStatus' in err && typeof (err as any).httpStatus === 'number'
      ? (err as any).httpStatus
      : undefined);

    cause = err;
    metaContext = ctx;
  }

  // Create error instance
  const error = new ModelRunError({
    code,
    message,
    traceId,
    stage,
    step,
    httpStatus: httpStatus ?? 500,
    cause,
  });

  // Safely attach meta with context (only if ctx is provided and has fields)
  // Never access outer scope variables - only use what's explicitly passed in metaContext
  if (metaContext) {
    (error as any).meta = {};
    
    // Safely stringify and include fields only if they're explicitly provided
    // Use try-catch to handle any circular references or stringification errors
    const safeStringify = (value: any): any => {
      try {
        if (value === null || value === undefined) {
          return value;
        }
        // For simple types, return as-is
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          return value;
        }
        // For objects/arrays, try to stringify safely (will throw on circular refs)
        return JSON.parse(JSON.stringify(value));
      } catch {
        // If stringification fails (circular ref, etc.), return a safe placeholder
        return '[Unable to serialize]';
      }
    };
    
    // Only include fields that are actually defined (using optional chaining)
    // Never reference variables from outer scope - only access via metaContext
    if (metaContext.ticker !== undefined) {
      (error as any).meta.ticker = safeStringify(metaContext.ticker);
    }
    if (metaContext.modelType !== undefined) {
      (error as any).meta.modelType = safeStringify(metaContext.modelType);
    }
    if (metaContext.assumptions !== undefined) {
      (error as any).meta.assumptions = safeStringify(metaContext.assumptions);
    }
    if (metaContext.sanitizedAssumptions !== undefined) {
      (error as any).meta.sanitizedAssumptions = safeStringify(metaContext.sanitizedAssumptions);
    }
    if (metaContext.enrichedAssumptions !== undefined) {
      (error as any).meta.enrichedAssumptions = safeStringify(metaContext.enrichedAssumptions);
    }
  }

  return error;
}

/**
 * Validate that error has required fields
 */
export function ensureErrorHasRequiredFields(error: unknown, defaults: {
  traceId: string;
  modelType: ModelType;
  stage?: ModelErrorStage;
  step?: string;
}): ModelRunError {
  if (error instanceof ModelRunError) {
    // Already standardized
    return error;
  }
  
  // Wrap unknown errors
  return createModelError({
    traceId: defaults.traceId,
    modelType: defaults.modelType,
    stage: defaults.stage || 'compute',
    step: defaults.step || 'unknown',
    message: error instanceof Error ? error.message : 'Model error occurred',
    cause: error,
  });
}

/**
 * Error response format for API routes
 */
export interface ModelErrorResponse {
  error: string;
  details?: string;
  code: string;
  stage: ModelErrorStage;
  step: string;
  modelType: ModelType;
  traceId: string;
}

/**
 * Convert error to API response format
 */
export function errorToResponse(error: ModelRunError, modelType: ModelType): ModelErrorResponse {
  return {
    error: error.message,
    details: error.message,
    code: error.code,
    stage: error.stage as ModelErrorStage,
    step: error.step,
    modelType,
    traceId: error.traceId,
  };
}
