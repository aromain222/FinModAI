import type { ModelRunReportData } from '@/lib/reports/modelRunReport';
import { buildModelRunNarrative } from '@/lib/reports/modelRunNarrative';

export type PdfSummaryResult = {
  paragraphs: string[];
  source: 'ai' | 'fallback';
};

export async function buildPdfExecutiveSummary(data: ModelRunReportData): Promise<PdfSummaryResult> {
  const narrative = buildModelRunNarrative(data);
  return {
    paragraphs: narrative.summaryParagraphs,
    source: 'fallback',
  };
}
