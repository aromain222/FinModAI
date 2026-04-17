import {
  buildAnalystFieldDisplayMap,
  validateAttachmentDrivenModelScale,
} from '@/lib/analyst/attachmentScaleValidation';
import type { AttachmentModelExtractionContext } from '@/lib/analyst/claudeModelExtraction';
import type { ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';
import type { ExtractInputsOptions, ExtractInputsResult } from '@/lib/model-generator/extractInputs';
import {
  applyInputOverrides,
  normalizeInputOverridesForModel,
} from '@/lib/model-generator/pipeline/modelInputNormalization';

export function finalizeExtractionResult(params: {
  modelType: ModelGeneratorType;
  options: ExtractInputsOptions;
  result: ExtractInputsResult;
  resolvedAttachmentExtraction: AttachmentModelExtractionContext | null;
}): ExtractInputsResult {
  const { modelType, options, resolvedAttachmentExtraction } = params;
  let result = params.result;

  const normalizedOverrides = normalizeInputOverridesForModel(
    modelType,
    options.inputOverrides,
    options.attachmentDriven === true,
  );
  if (normalizedOverrides && Object.keys(normalizedOverrides).length > 0) {
    result = {
      ...result,
      extractedInputs: applyInputOverrides(result.extractedInputs, normalizedOverrides),
    };
  }

  const provenanceSummary =
    resolvedAttachmentExtraction?.providerTrace === 'mixed' || resolvedAttachmentExtraction?.providerTrace === 'claude'
      ? {
          ...result.provenanceSummary,
          sources: Array.from(new Set([...result.provenanceSummary.sources, 'claude_pdf_extraction'])),
          fallbackUsed: Array.from(new Set([...result.provenanceSummary.fallbackUsed, 'claude_pdf_extraction'])),
        }
      : result.provenanceSummary;

  const scaleValidation =
    options.attachmentDriven === true &&
    options.attachmentStatementSnapshot &&
    (modelType === 'DCF' || modelType === 'THREE_STATEMENT' || modelType === 'LBO')
      ? validateAttachmentDrivenModelScale({
          modelType,
          extractedInputs: result.extractedInputs,
          attachmentSnapshot: options.attachmentStatementSnapshot,
          inputOverrides: normalizedOverrides,
        })
      : undefined;

  return {
    ...result,
    provenanceSummary,
    ...(scaleValidation ? { scaleValidation } : {}),
    fieldDisplayMap: buildAnalystFieldDisplayMap(modelType),
    ...(resolvedAttachmentExtraction
      ? {
          categories: resolvedAttachmentExtraction.categories,
          fieldConflicts: resolvedAttachmentExtraction.fieldConflicts,
          providerTrace: resolvedAttachmentExtraction.providerTrace,
        }
      : {}),
  };
}
