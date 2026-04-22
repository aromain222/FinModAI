import { getModelRequiredInputKeys } from '@/lib/models/shared/missingInputSpecs';
import { runStrictExtractor } from '@/lib/data/financial-extraction/strict/extractor';
import { buildStrictModelInputs } from '@/lib/data/financial-extraction/strict/modelBuilder';
import { runStrictSourceFetcher } from '@/lib/data/financial-extraction/strict/sourceFetcher';
import type {
  StrictPipelineFailure,
  StrictPipelineRequest,
  StrictPipelineResult,
} from '@/lib/data/financial-extraction/strict/types';
import { validateStrictMetrics } from '@/lib/data/financial-extraction/strict/validator';

function failure(
  step: StrictPipelineFailure['step'],
  reason: string,
  missingFields: string[] = [],
  conflicts: StrictPipelineFailure['conflicts'] = [],
): StrictPipelineFailure {
  return {
    status: 'FAILURE',
    step,
    reason,
    missing_fields: missingFields,
    conflicts,
  };
}

export async function runStrictFinancialPipeline(
  request: StrictPipelineRequest,
): Promise<StrictPipelineResult> {
  const sourceResult = await runStrictSourceFetcher(request);
  if (!sourceResult.ok) return sourceResult.failure;

  const extractedMetrics = runStrictExtractor({
    artifacts: sourceResult.artifacts,
    periodType: request.period_type,
  });

  const requiredKeys = getModelRequiredInputKeys(request.target_model_type);
  const validation = validateStrictMetrics({
    metrics: extractedMetrics,
    requiredModelKeys: requiredKeys,
    periodType: request.period_type,
  });

  if (!validation.ok) {
    return failure('VALIDATOR', validation.reason, validation.missingFields, validation.conflicts);
  }

  const modelBuilder = buildStrictModelInputs({
    companyName: sourceResult.companyName,
    validatedMetrics: validation.validatedMetrics,
    targetModelType: request.target_model_type,
    explicitAssumptions: request.explicit_assumptions,
  });

  if (!modelBuilder.ok) {
    return failure('MODEL_BUILDER', modelBuilder.reason, modelBuilder.missingFields, []);
  }

  return {
    status: 'SUCCESS',
    request: {
      ticker: sourceResult.ticker,
      period_type: request.period_type,
      target_model_type: request.target_model_type,
    },
    steps: {
      SOURCE_FETCHER: {
        status: 'SUCCESS',
        artifacts: sourceResult.artifacts.map((artifact) => artifact.artifact),
      },
      EXTRACTOR: {
        status: 'SUCCESS',
        metrics: extractedMetrics,
      },
      VALIDATOR: {
        status: 'SUCCESS',
        validated_metrics: validation.validatedMetrics,
        missing_fields: [],
        conflicts: [],
      },
      MODEL_BUILDER: {
        status: 'SUCCESS',
        model_inputs: modelBuilder.modelInputs,
        source_attribution: modelBuilder.sourceAttribution,
      },
    },
  };
}
