import { getLatestComparableRun } from '@/lib/model-generator/runHistory';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';

export const analystModelChatDeps = {
  generateTextWithProviderFallback,
  getLatestComparableRun,
};
