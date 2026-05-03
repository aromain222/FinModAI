import type { ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';
import type {
  AnalystFieldDisplayMap,
  AttachmentScaleValidation,
} from '@/lib/analyst/attachmentScaleValidation';
import type { ComparisonSummary, ProvenanceSummary } from '@/lib/model-generator/runHistory';
import type { PromptRunSmartAssumptionSummary } from '@/lib/model-generator/runHistory';
import type { ExtractedModelInputs } from '@/lib/model-generator/extractInputs';
import type {
  EventLinkedModelAdjustmentResult,
  EventLinkedModelEventSource,
  EventLinkedModelTranscription,
} from '@/lib/model-events/types';
import type { SmartAssumptionResult } from '@/lib/smart-assumptions/types';
import type { PromptRunCustomAssumptionSummary } from '@/lib/model-generator/runHistory';
import type { CustomAssumptionResult } from '@/lib/analyst/customAssumptions';

export type ModelNarrativeBlock = {
  title: string;
  body: string;
};

export type AnalystGeneratedModelPayload = {
  prompt: string;
  modelType: ModelGeneratorType;
  title: string;
  tabs: string[];
  keyOutputs: string[];
  scenarioContext: string | null;
  extractedInputs: ExtractedModelInputs;
  defaultsUsed: Record<string, unknown>;
  provenanceSummary: ProvenanceSummary;
  comparisonSummary: ComparisonSummary | null;
  recentRun: {
    runId: string;
    versionNumber: number | null;
    createdAt: string;
    status: string;
  } | null;
  narrativeBlocks: ModelNarrativeBlock[];
  fieldDisplayMap?: AnalystFieldDisplayMap;
  unitValidationStatus?: 'validated';
  unitValidationMessage?: string | null;
  attachmentExtraction?: {
    providerTrace: 'deterministic' | 'claude' | 'mixed';
    fieldConflicts: Array<{
      field: string;
      resolution: 'deterministic' | 'claude' | 'user_override';
      warning: string;
    }>;
  } | null;
  eventContext?: EventLinkedModelEventSource | null;
  eventAdjustmentSummary?: {
    normalizedEventSummary: string;
    eventCategory: string;
    confidence: 'low' | 'medium' | 'high';
    scenarioBias: 'bullish' | 'base' | 'bearish' | 'mixed' | 'neutral';
    warnings: string[];
    blockingErrors: string[];
    hasMaterialChanges: boolean;
    transcription?: EventLinkedModelTranscription | null;
  } | null;
  appliedEventDeltas?: EventLinkedModelAdjustmentResult['changedDrivers'] | null;
  smartAssumptionSummary?: PromptRunSmartAssumptionSummary | null;
  customAssumptionSummary?: PromptRunCustomAssumptionSummary | null;
  strategicContext?: string | null;
};

export type AnalystGeneratedModelRecentRun = NonNullable<AnalystGeneratedModelPayload['recentRun']>;
export type AnalystGeneratedModelExportSeed = Omit<AnalystGeneratedModelPayload, 'recentRun'>;

export type AnalystStructuredModelAdjustment = {
  changes: Record<string, unknown>;
  prompt?: string;
  eventContext?: EventLinkedModelEventSource | null;
  smartAssumptionSummary?: SmartAssumptionResult | PromptRunSmartAssumptionSummary | null;
  customAssumptionSummary?: CustomAssumptionResult | PromptRunCustomAssumptionSummary | null;
};

export type AnalystStructuredModelResult =
  | {
      reply: string;
      payload: AnalystGeneratedModelPayload;
      validationFailed?: false;
      unitValidation?: AttachmentScaleValidation;
    }
  | {
      reply: string;
      validationFailed: true;
      unitValidation: AttachmentScaleValidation;
      payload?: undefined;
    };
