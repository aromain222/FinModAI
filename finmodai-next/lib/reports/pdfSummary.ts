import OpenAI from 'openai';
import { getOpenAIKey } from '@/lib/openaiKey';
import type { AssumptionItem, ModelRunReportData, SnapshotItem } from '@/lib/reports/modelRunReport';

export type PdfSummaryResult = {
  paragraphs: string[];
  source: 'ai' | 'fallback';
};

function splitParagraphs(value: string): string[] {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

function formatMetric(item: SnapshotItem): string {
  if (item.value === null) return `${item.label}: —`;
  if (typeof item.value === 'string') return `${item.label}: ${item.value}`;
  if (item.format === 'percent') return `${item.label}: ${(item.value * 100).toFixed(1)}%`;
  if (item.format === 'multiple') return `${item.label}: ${item.value.toFixed(2)}x`;
  if (item.format === 'money') return `${item.label}: ${item.value.toLocaleString('en-US')} USD mm`;
  return `${item.label}: ${item.value.toLocaleString('en-US')}`;
}

function formatAssumption(item: AssumptionItem): string {
  if (item.value === null) return `${item.label}: —`;
  if (typeof item.value === 'string') return `${item.label}: ${item.value}`;
  if (item.format === 'percent') return `${item.label}: ${(item.value * 100).toFixed(1)}%`;
  if (item.format === 'multiple') return `${item.label}: ${item.value.toFixed(2)}x`;
  if (item.format === 'money') return `${item.label}: ${item.value.toLocaleString('en-US')} USD mm`;
  return `${item.label}: ${item.value.toLocaleString('en-US')}`;
}

function fallbackSummary(data: ModelRunReportData): string[] {
  const metrics = data.snapshotItems.slice(0, 4).map(formatMetric);
  const assumptions = data.assumptions.slice(0, 5).map(formatAssumption);

  const paragraph1 = `${data.companyName} (${data.ticker}) ${data.modelType} analysis, as of ${data.asOfDate}, points to a valuation and operating profile anchored by the current model outputs. Key headline metrics are ${metrics.length > 0 ? metrics.join('; ') : 'not available in this run output'}. This report is tied to run ${data.runId} and should be read alongside the detailed tables below.`;

  const paragraph2 = `Primary drivers in this run are ${assumptions.length > 0 ? assumptions.join('; ') : 'not explicitly populated in assumptions tables'}. Sensitivity is highest where assumptions flow directly into valuation math, especially discount-rate, growth, and margin inputs when present. Interpretation should prioritize internal consistency between snapshot metrics and table-level line items.`;

  const paragraph3 = `Risk to the base interpretation comes from assumption drift and model-structure concentration. A material change in top-line trajectory, profitability, or net debt treatment can shift implied outcomes quickly, particularly in relative valuation frameworks. The next validation step is to challenge the most elastic assumptions and confirm direction across scenario stress tests before decision use.`;

  return [paragraph1, paragraph2, paragraph3];
}

export async function buildPdfExecutiveSummary(data: ModelRunReportData): Promise<PdfSummaryResult> {
  const fallback = fallbackSummary(data);
  const apiKey = getOpenAIKey('service');
  if (!apiKey) {
    return { paragraphs: fallback, source: 'fallback' };
  }

  const openai = new OpenAI({ apiKey });
  try {
    const metricLines = data.snapshotItems.slice(0, 8).map(formatMetric).join('\n');
    const assumptionLines = data.assumptions.slice(0, 8).map(formatAssumption).join('\n');

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      input: [
        {
          role: 'system',
          content:
            'You are an institutional equity research analyst writing a model-run memo. Be neutral, concise, and specific. No hype.',
        },
        {
          role: 'user',
          content: `Write an executive summary as JSON for a CapitalBase model report.
Requirements:
- Return only JSON: {"paragraphs": string[]}
- Exactly 2 or 3 paragraphs.
- Each paragraph should be 3-5 sentences.
- Tone: institutional, company-specific, tied to this exact model run.
- Mention concrete model outputs and assumptions.
- Use units as USD millions where applicable.

Company: ${data.companyName} (${data.ticker})
Model type: ${data.modelType}
As-of date: ${data.asOfDate}
Run ID: ${data.runId}

Snapshot metrics:
${metricLines || 'No snapshot metrics available'}

Key assumptions:
${assumptionLines || 'No assumptions available'}
`,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'pdf_exec_summary',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              paragraphs: {
                type: 'array',
                minItems: 2,
                maxItems: 3,
                items: {
                  type: 'string',
                },
              },
            },
            required: ['paragraphs'],
          },
        },
      },
    } as never);

    const parsed = JSON.parse(response.output_text || '{}') as { paragraphs?: unknown };
    const candidate = Array.isArray(parsed.paragraphs)
      ? parsed.paragraphs.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    const normalized = candidate.flatMap(splitParagraphs).slice(0, 3);

    if (normalized.length >= 2) {
      return { paragraphs: normalized, source: 'ai' };
    }
    return { paragraphs: fallback, source: 'fallback' };
  } catch {
    return { paragraphs: fallback, source: 'fallback' };
  }
}
