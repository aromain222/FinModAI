import OpenAI from 'openai';
import { ENV, keysPresent, requireEnv } from '@/lib/env/server';
import { toErrorText } from '@/lib/providers/utils';
import type { AiEnrichment, AiResult, HeadlinesResult, MacroResult, MarketChartResult } from '@/lib/providers/types';

const getClient = () => {
  if (!keysPresent.openai) return null;
  return new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY') });
};

const formatMetric = (label: string, value: number | null, unit: string, date: string | null, status: string) => {
  if (status !== 'ok' || value == null || !Number.isFinite(value)) {
    return `${label}: unavailable (${status})`;
  }
  return `${label}: ${value.toFixed(2)}${unit}${date ? ` (${date})` : ''}`;
};

export async function getMacroIQEnrichment(params: {
  macro: MacroResult;
  marketChart: MarketChartResult;
  headlines: HeadlinesResult;
  traceId: string;
}): Promise<AiResult> {
  const client = getClient();
  if (!client) {
    return { status: 'unavailable', source: 'openai', errors: ['OPENAI_API_KEY missing'] };
  }

  const macro = params.macro.data;
  const pointsCount = params.marketChart.data.points.length;
  const changePct = params.marketChart.data.changePct;

  const facts = [
    formatMetric('CPI', macro.cpi.value, macro.cpi.unit, macro.cpi.date, macro.cpi.status),
    formatMetric('Unemployment', macro.unemployment.value, macro.unemployment.unit, macro.unemployment.date, macro.unemployment.status),
    formatMetric('Fed funds', macro.fedFunds.value, macro.fedFunds.unit, macro.fedFunds.date, macro.fedFunds.status),
    `SPY change: ${typeof changePct === 'number' ? changePct.toFixed(2) + '%' : 'unavailable'}`,
    `Chart points: ${pointsCount}`,
    `Headlines: ${params.headlines.data.items
      .slice(0, 8)
      .map((item) => `${item.title} (${item.source}) ${item.publishedAt}`)
      .join(' | ') || 'none'}`,
  ].join('\n');

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      macroSummary: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tone: { type: 'string', enum: ['Bullish', 'Neutral', 'Bearish'] },
          oneLiner: { type: 'string' },
          keyDrivers: { type: 'array', items: { type: 'string' } },
          risks: { type: 'array', items: { type: 'string' } },
        },
        required: ['tone', 'oneLiner', 'keyDrivers', 'risks'],
      },
      marketNarrative: {
        type: 'object',
        additionalProperties: false,
        properties: {
          oneLiner: { type: 'string' },
          drivers: { type: 'array', items: { type: 'string' } },
          watch: { type: 'array', items: { type: 'string' } },
        },
        required: ['oneLiner', 'drivers', 'watch'],
      },
    },
    required: ['macroSummary', 'marketNarrative'],
  };

  try {
    const resp = await client.responses.create({
      model: ENV.OPENAI_MODEL,
      temperature: 0,
      text: {
        format: {
          type: 'json_schema',
          name: 'macro_iq_enrichment',
          schema,
          strict: true,
        },
      },
      input: [
        {
          role: 'system',
          content: 'You are a senior macro strategist. Use only the provided facts. Be concise and factual.',
        },
        { role: 'user', content: `Return JSON per schema.\n\nFacts:\n${facts}` },
      ],
    });
    const parsed = JSON.parse(resp.output_text ?? '{}') as AiEnrichment;
    if (!parsed?.macroSummary || !parsed?.marketNarrative) {
      return { status: 'error', source: 'openai', errors: ['OpenAI response missing fields'] };
    }
    return { status: 'ok', source: 'openai', data: parsed };
  } catch (error) {
    return { status: 'error', source: 'openai', errors: [toErrorText(error)] };
  }
}
