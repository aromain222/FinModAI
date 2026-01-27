/**
 * Shared Model Pipeline
 * 
 * Standardizes the model generation pipeline across LBO, Comps, and Merger.
 * Ensures consistent: validation → compute → preview → excel generation.
 * 
 * Usage:
 *   const result = await runModelPipeline({
 *     modelType: 'lbo',
 *     traceId: '...',
 *     modelId: '...',
 *     validatedInput: {...},
 *     compute: async (input) => {...},
 *     generateExcel: async (output) => {...},
 *   });
 */

import { randomUUID } from 'node:crypto';
import { ModelRunError } from '@/lib/modeling/runModel';
import { validateModelInput, type ModelInput } from '@/lib/schemas/model-input';
import { validateModelOutput, type ModelOutput } from '@/lib/schemas/model-output';
import { normalizeAssumptions } from '@/lib/schemas/assumptions';

export type ModelType = 'lbo' | 'comps' | 'merger';

export type PipelineStage = 
  | 'validate'
  | 'normalize'
  | 'compute'
  | 'validate-output'
  | 'preview'
  | 'excel';

export type PipelineError = {
  code: string;
  message: string;
  stage: PipelineStage;
  step: string;
  traceId: string;
  cause?: unknown;
};

export type ComputeResult<T = Record<string, any>> = {
  output: T;
  warnings?: string[];
  appliedDefaults?: Array<{ field: string; value: any; reason: string }>;
};

export type PreviewResult = {
  assumptions: Array<{
    key: string;
    label: string;
    value: string | number | boolean;
    unit?: string;
    category?: 'Operating' | 'Capital Structure' | 'Valuation';
    isDerived?: boolean;
  }>;
  charts?: Array<{
    type: 'line' | 'bar' | 'area' | 'scatter';
    title: string;
    data: Record<string, any>[];
    xKey: string;
    yKey?: string;
    yKeys?: string[];
  }>;
  summary?: string;
  keyMetrics?: Record<string, string | number>;
};

export type ExcelResult = {
  workbook: any; // ExcelJS.Workbook
  filePath?: string;
  downloadUrl?: string;
};

/**
 * Canonical pipeline input contract
 */
export type CanonicalPipelineInput = {
  modelType: ModelType;
  tickers: string[];
  merger?: {
    acquirer: string;
    target: string;
  };
  assumptions: Record<string, any>;
  options?: {
    seed?: string; // For deterministic results
    includeExcel?: boolean;
    includePreview?: boolean;
  };
};

/**
 * Pipeline parameters (either canonical input OR raw input with functions)
 */
export type PipelineParams<TInput = any, TOutput = any> = {
  modelType: ModelType;
  traceId: string;
  modelId?: string; // Optional, will be generated if not provided
  
  // Either canonical input OR raw input
  input?: CanonicalPipelineInput; // Canonical format
  rawInput?: unknown; // Legacy raw input (will be normalized)
  
  // Pipeline functions (optional if using canonical input with defaults)
  validate?: (input: unknown) => TInput;
  normalize?: (input: TInput) => TInput;
  compute?: (input: TInput) => Promise<ComputeResult<TOutput>>;
  generatePreview?: (input: TInput, output: TOutput) => PreviewResult | Promise<PreviewResult>;
  generateExcel?: (input: TInput, output: TOutput) => ExcelResult | Promise<ExcelResult>;
  
  // Options
  skipValidation?: boolean;
  skipPreview?: boolean;
  skipExcel?: boolean;
};

/**
 * Canonical pipeline output contract
 */
export type CanonicalPipelineOutput = {
  modelId: string;
  traceId: string;
  status: 'success' | 'partial' | 'failed';
  artifact?: {
    provider: 'r2' | 'local';
    key: string;
    downloadUrl: string;
    fileName: string;
  };
  preview?: PreviewResult;
  metrics?: Record<string, string | number>;
  checks?: Array<{
    name: string;
    passed: boolean;
    message?: string;
    severity?: 'error' | 'warning' | 'info';
  }>;
  warnings: string[];
};

/**
 * Pipeline result (internal format, can be converted to canonical)
 */
export type PipelineResult<TInput = any, TOutput = any> = {
  traceId: string;
  modelId: string;
  modelType: ModelType;
  validatedInput: TInput;
  output: TOutput;
  preview?: PreviewResult;
  excel?: ExcelResult;
  warnings: string[];
  appliedDefaults: Array<{ field: string; value: any; reason: string }>;
  elapsedMs: number;
  stages: Record<PipelineStage, number>;
};

/**
 * Convert internal pipeline result to canonical output format
 */
export function toCanonicalOutput(result: PipelineResult): CanonicalPipelineOutput {
  const artifact = result.excel?.downloadUrl
    ? {
        provider: result.excel.downloadUrl.startsWith('http') ? ('r2' as const) : ('local' as const),
        key: result.modelId,
        downloadUrl: result.excel.downloadUrl,
        fileName: result.excel.filePath
          ? result.excel.filePath.split('/').pop() || `model-${result.modelId}.xlsx`
          : `model-${result.modelId}.xlsx`,
      }
    : undefined;
  
  const checks = result.preview && 'checks' in result.preview
    ? result.preview.checks as Array<{ name: string; passed: boolean; message?: string; severity?: 'error' | 'warning' | 'info' }>
    : undefined;
  
  const status = result.excel
    ? ('success' as const)
    : result.preview
    ? ('partial' as const)
    : ('failed' as const);
  
  return {
    modelId: result.modelId,
    traceId: result.traceId,
    status,
    artifact,
    preview: result.preview,
    metrics: result.preview?.keyMetrics,
    checks,
    warnings: result.warnings,
  };
}

/**
 * Normalize canonical input to raw format for compatibility
 */
function normalizeCanonicalInput(input: CanonicalPipelineInput): unknown {
  return {
    modelType: input.modelType,
    ticker: input.modelType === 'merger' ? undefined : input.tickers[0],
    tickers: input.tickers,
    ...(input.merger ? { merger: input.merger, buyerTicker: input.merger.acquirer, targetTicker: input.merger.target } : {}),
    ...input.assumptions,
  };
}

/**
 * Run standardized model pipeline
 */
export async function runModelPipeline<TInput = any, TOutput = any>(
  params: PipelineParams<TInput, TOutput>
): Promise<PipelineResult<TInput, TOutput>> {
  // Handle canonical input format
  const rawInput = params.input ? normalizeCanonicalInput(params.input) : params.rawInput;
  const effectiveModelId = params.modelId || params.input?.options?.seed || randomUUID();
  const { modelType, traceId, skipValidation, skipPreview, skipExcel } = params;
  
  // Determine includeExcel/includePreview from options
  const includeExcel = params.input?.options?.includeExcel !== false;
  const includePreview = params.input?.options?.includePreview !== false;
  
  const startedAt = Date.now();
  const stages: Record<PipelineStage, number> = {
    validate: 0,
    normalize: 0,
    compute: 0,
    'validate-output': 0,
    preview: 0,
    excel: 0,
  };
  
  const stageStart = (stage: PipelineStage) => {
    stages[stage] = Date.now();
  };
  
  const stageEnd = (stage: PipelineStage) => {
    const start = stages[stage];
    if (start > 0) {
      stages[stage] = Math.max(0, Date.now() - start);
    }
  };
  
  let validatedInput: TInput;
  let output: TOutput;
  let preview: PreviewResult | undefined;
  let excel: ExcelResult | undefined;
  let warnings: string[] = [];
  let appliedDefaults: Array<{ field: string; value: any; reason: string }> = [];
  
  try {
    // Stage 1: Validate input
    if (!skipValidation) {
      stageStart('validate');
      try {
        if (params.validate) {
          validatedInput = params.validate(rawInput);
        } else {
          // Use schema validation
          validatedInput = validateModelInput(modelType, rawInput) as TInput;
        }
      } catch (error) {
        throw new ModelRunError({
          code: 'INPUT_VALIDATION_FAILED',
          message: error instanceof Error ? error.message : 'Input validation failed',
          traceId,
          stage: 'validate',
          step: 'validate_input',
          httpStatus: 400,
          cause: error,
        });
      }
      stageEnd('validate');
    } else {
      validatedInput = rawInput as TInput;
    }
    
    // Stage 2: Normalize assumptions
    stageStart('normalize');
    try {
      if (params.normalize) {
        validatedInput = params.normalize(validatedInput);
      } else {
        // Default normalization: normalize ticker and assumptions
        const normalized = normalizeAssumptions(validatedInput as any);
        validatedInput = { ...validatedInput, ...normalized } as TInput;
      }
    } catch (error) {
      throw new ModelRunError({
        code: 'NORMALIZE_FAILED',
        message: error instanceof Error ? error.message : 'Normalization failed',
        traceId,
        stage: 'normalize',
        step: 'normalize_assumptions',
        httpStatus: 400,
        cause: error,
      });
    }
    stageEnd('normalize');
    
    // Stage 3: Compute
    stageStart('compute');
    let computeResult: ComputeResult<TOutput>;
    try {
      if (!params.compute) {
        throw new ModelRunError({
          code: 'COMPUTE_FUNCTION_REQUIRED',
          message: 'Compute function is required',
          traceId,
          stage: 'compute',
          step: 'validate_compute',
          httpStatus: 400,
        });
      }
      computeResult = await params.compute(validatedInput);
      output = computeResult.output;
      warnings = computeResult.warnings || [];
      appliedDefaults = computeResult.appliedDefaults || [];
    } catch (error) {
      if (error instanceof ModelRunError) {
        throw error;
      }
      throw new ModelRunError({
        code: 'COMPUTE_FAILED',
        message: error instanceof Error ? error.message : 'Model computation failed',
        traceId,
        stage: 'compute',
        step: 'run_compute',
        httpStatus: 500,
        cause: error,
      });
    }
    stageEnd('compute');
    
    // Stage 4: Validate output
    stageStart('validate-output');
    try {
      // Use schema validation
      const validatedOutput = validateModelOutput(modelType, {
        modelType,
        modelId: effectiveModelId,
        ticker: (validatedInput as any).ticker || (validatedInput as any).buyerTicker,
        [`${modelType}Output`]: output,
        warnings,
        appliedDefaults,
        generatedAt: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
      });
      // Output is already validated, just ensure it matches
    } catch (error) {
      throw new ModelRunError({
        code: 'OUTPUT_VALIDATION_FAILED',
        message: error instanceof Error ? error.message : 'Output validation failed',
        traceId,
        stage: 'validate-output',
        step: 'validate_output',
        httpStatus: 500,
        cause: error,
      });
    }
    stageEnd('validate-output');
    
    // Stage 5: Generate preview
    if (!skipPreview && includePreview && params.generatePreview) {
      stageStart('preview');
      try {
        preview = await Promise.resolve(params.generatePreview(validatedInput, output));
      } catch (error) {
        // Preview generation is non-fatal
        console.warn(`[runModelPipeline] Preview generation failed for ${modelType}:`, error);
        warnings.push('Preview generation failed');
      }
      stageEnd('preview');
    }
    
    // Stage 6: Generate Excel (skip during static export)
    // Guard: workbook generation never runs during static export
    const isStaticExport = process.env.NEXT_PHASE === 'phase-production-build' || 
                          process.env.NEXT_EXPORT === 'true' ||
                          typeof window === 'undefined' && process.env.NODE_ENV === 'production' && !process.env.VERCEL;
    
    if (!skipExcel && includeExcel && params.generateExcel && !isStaticExport) {
      stageStart('excel');
      try {
        excel = await Promise.resolve(params.generateExcel(validatedInput, output));
      } catch (error) {
        // Excel generation is non-fatal (optional)
        console.warn(`[runModelPipeline] Excel generation failed for ${modelType}:`, error);
        warnings.push('Excel generation failed');
      }
      stageEnd('excel');
    } else if (isStaticExport && !skipExcel && includeExcel) {
      warnings.push('Excel generation skipped during static export');
    }
    
    const elapsedMs = Date.now() - startedAt;
    
    return {
      traceId,
      modelId: effectiveModelId,
      modelType,
      validatedInput,
      output,
      preview: includePreview ? preview : undefined,
      excel: includeExcel ? excel : undefined,
      warnings,
      appliedDefaults,
      elapsedMs,
      stages,
    };
  } catch (error) {
    // Re-throw ModelRunError as-is
    if (error instanceof ModelRunError) {
      throw error;
    }
    
    // Wrap unknown errors
    const currentStage = Object.entries(stages)
      .filter(([_, elapsed]) => elapsed === 0)
      .map(([stage, _]) => stage as PipelineStage)
      .find((stage) => stage !== 'excel') || 'compute';
    
    throw new ModelRunError({
      code: 'PIPELINE_FAILED',
      message: error instanceof Error ? error.message : 'Pipeline execution failed',
      traceId,
      stage: currentStage,
      step: 'run_pipeline',
      httpStatus: 500,
      cause: error,
    });
  }
}

/**
 * Helper to create standardized error with traceId and stage
 */
export function createPipelineError(params: {
  code: string;
  message: string;
  traceId: string;
  stage: PipelineStage;
  step: string;
  httpStatus?: number;
  cause?: unknown;
}): ModelRunError {
  return new ModelRunError({
    code: params.code,
    message: params.message,
    traceId: params.traceId,
    stage: params.stage,
    step: params.step,
    httpStatus: params.httpStatus ?? 500,
    cause: params.cause,
  });
}
