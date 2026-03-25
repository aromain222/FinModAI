import type { ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';

export type ClarificationDecision = {
  needsClarification: boolean;
  clarificationQuestion?: string;
};

export function getClarificationDecision(
  modelType: ModelGeneratorType,
  missingCriticalInputs: string[]
): ClarificationDecision {
  if (missingCriticalInputs.length === 0) {
    return { needsClarification: false };
  }

  switch (modelType) {
    case 'DCF':
      return {
        needsClarification: true,
        clarificationQuestion: 'What company or business type should I base the DCF on?',
      };
    case 'THREE_STATEMENT':
      return {
        needsClarification: true,
        clarificationQuestion: 'What company or business type should I base the model on?',
      };
    case 'CAP_TABLE':
      return {
        needsClarification: true,
        clarificationQuestion: 'What round details should I use: raise amount and pre-money valuation?',
      };
    case 'SAAS_OPERATING_MODEL':
      return {
        needsClarification: true,
        clarificationQuestion: 'What starting ARR or company scale should I assume?',
      };
    case 'COMPS':
      return {
        needsClarification: true,
        clarificationQuestion: 'What company or business type should I use for the comps set?',
      };
    case 'FOOTBALL_FIELD':
      return {
        needsClarification: true,
        clarificationQuestion: 'What company or business type should I anchor the football field on?',
      };
    case 'PRECEDENTS':
      return {
        needsClarification: true,
        clarificationQuestion: 'What company or sector should I anchor the precedent transactions on?',
      };
    case 'LBO':
      return {
        needsClarification: true,
        clarificationQuestion: 'What company or base financial profile should I use for the LBO?',
      };
  }

  return { needsClarification: false };
}
