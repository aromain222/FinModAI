import type { AttachmentStatementSnapshot } from '@/lib/analyst/pdfFinancialStatements';
import {
  resolveAttachmentModelExtraction,
  type AttachmentModelExtractionContext,
} from '@/lib/analyst/claudeModelExtraction';
import type { ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';
import type { ExtractInputsOptions } from '@/lib/model-generator/extractInputs';
import { normalizeAttachmentStatementSnapshotForModel } from '@/lib/model-generator/pipeline/modelInputNormalization';

export type PreparedExtractInputsContext = {
  fullPrompt: string;
  resolvedAttachmentExtraction: AttachmentModelExtractionContext | null;
  normalizedOptions: ExtractInputsOptions & {
    attachmentExtractionContext?: AttachmentModelExtractionContext | null;
    attachmentStatementSnapshot?: AttachmentStatementSnapshot | null;
  };
};

export async function prepareExtractInputsContext(
  prompt: string,
  modelType: ModelGeneratorType,
  options: ExtractInputsOptions = {},
): Promise<PreparedExtractInputsContext> {
  const fullPrompt = [prompt, options.clarificationAnswer].filter(Boolean).join(' ').trim();
  const attachmentModelType =
    modelType === 'DCF' || modelType === 'THREE_STATEMENT' || modelType === 'COMPS' || modelType === 'LBO'
      ? modelType
      : null;
  const resolvedAttachmentExtraction =
    attachmentModelType && options.attachmentDriven === true
      ? options.attachmentExtractionContext ??
        (await resolveAttachmentModelExtraction({
          modelType: attachmentModelType,
          prompt: fullPrompt,
          snapshot: options.attachmentStatementSnapshot ?? null,
          inputOverrides: options.inputOverrides,
          attachmentText: options.attachmentText,
          attachmentSummary: options.attachmentSummary,
        }))
      : options.attachmentExtractionContext ?? null;
  const baseAttachmentSnapshot =
    resolvedAttachmentExtraction?.snapshot ?? options.attachmentStatementSnapshot ?? null;

  return {
    fullPrompt,
    resolvedAttachmentExtraction,
    normalizedOptions: {
      ...options,
      attachmentExtractionContext: resolvedAttachmentExtraction,
      attachmentStatementSnapshot: normalizeAttachmentStatementSnapshotForModel(
        modelType,
        baseAttachmentSnapshot,
      ),
    },
  };
}
