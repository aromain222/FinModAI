import OpenAI from 'openai';
import { z } from 'zod';
import { getOpenAIKeyCandidates, getOpenAIModelCandidates } from '@/lib/openaiKey';
import type { EventCluster } from '@/lib/events/cluster';
import {
  marketImpactSchema,
  marketEventTypeSchema,
  marketEventStatusSchema,
  type MarketEventHorizon,
  type MarketEventStatus,
  type MarketEventType,
} from '@/lib/news/marketEventsTypes';

const CLASSIFIER_SYSTEM_PROMPT = `You are CapitalBase Events Intelligence — an institutional macro and market analyst.

You classify event threads, not single articles.
Your goal is NOT to summarize news but to explain the MARKET STORY.

Return JSON only. No markdown.

Rules:
- Be conservative. If unsure, return marketMoving=false.
- Exclude routine stories, soft corporate news, and generic market wrap.
- Only approve events that could plausibly move markets.
- Use only provided titles/snippets. Do not invent facts.
- Focus on the causal story linking the event to financial markets.

For accepted events you MUST identify:
- Economic drivers (root causes: policy change, supply shock, demand surge, regulatory action, geopolitical escalation)
- Transmission mechanisms (how the event moves through the economy: Event -> Economic effect -> Market reaction)
- Winners and losers (specific stocks, sectors, or assets)

If marketMoving=true, return:
{
  "marketMoving": true,
  "title": "clear event title (not a headline)",
  "eventType": "Geopolitics" | "Macro" | "CentralBank" | "Conflict" | "Sanctions" | "SystemicRisk" | "RegulatoryShock" | "EarningsMegaCap",
  "severity": 0-100,
  "horizon": "Immediate" | "NearTerm" | "Structural",
  "drivers": ["root cause 1 — short, specific, causal", "root cause 2"],
  "marketImpact": {
    "equities": "index and sector impact, name specific sectors",
    "rates": "impact on bond yields and rate expectations",
    "fx": "impact on currencies, name specific pairs",
    "oil": "impact on energy and commodities",
    "credit": "risk-on or risk-off implications",
    "sectors": "specific winner/loser sectors and names"
  },
  "transmissionPath": ["Event -> Economic effect -> Market reaction (full causal chain)"],
  "watchNext": ["upcoming catalyst that could amplify or reverse"],
  "status": "developing" | "confirmed" | "resolved",
  "keyEntities": ["affected tickers, countries, or instruments"]
}

If marketMoving=false, return:
{
  "marketMoving": false,
  "reason": "string"
}`;

const classifierSchema = z.object({
  marketMoving: z.boolean(),
  reason: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  eventType: marketEventTypeSchema.optional(),
  horizon: z.enum(['Immediate', 'NearTerm', 'Structural']).optional(),
  severity: z.number().min(0).max(100).optional(),
  drivers: z.array(z.string().min(1)).min(2).max(4).optional(),
  marketImpact: marketImpactSchema.optional(),
  transmissionPath: z.array(z.string().min(1)).min(1).optional(),
  status: marketEventStatusSchema.optional(),
  watchNext: z.array(z.string().min(1)).min(1).max(3).optional(),
  keyEntities: z.array(z.string().min(1)).max(12).optional(),
});

const jsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    marketMoving: { type: 'boolean' },
    reason: { type: 'string' },
    title: { type: 'string' },
    eventType: { type: 'string', enum: marketEventTypeSchema.options },
    horizon: { type: 'string', enum: ['Immediate', 'NearTerm', 'Structural'] },
    severity: { type: 'number' },
    drivers: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
    marketImpact: {
      type: 'object',
      additionalProperties: false,
      properties: {
        equities: { type: 'string' },
        rates: { type: 'string' },
        fx: { type: 'string' },
        oil: { type: 'string' },
        credit: { type: 'string' },
        sectors: { type: 'string' },
      },
    },
    transmissionPath: { type: 'array', items: { type: 'string' }, minItems: 1 },
    status: { type: 'string', enum: ['developing', 'confirmed', 'resolved'] },
    watchNext: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
    keyEntities: { type: 'array', items: { type: 'string' }, maxItems: 12 },
  },
  required: ['marketMoving'],
} as const;

export type ClassifyDiagnostics = {
  openaiCallCount: number;
  openaiErrors: string[];
  schemaParseFailures: number;
  rawSamples?: string[];
};

export type ClassifiedEventPayload = {
  marketMoving: true;
  title: string;
  eventType: MarketEventType;
  horizon: MarketEventHorizon;
  severity: number;
  drivers: string[];
  marketImpact: z.infer<typeof marketImpactSchema>;
  transmissionPath: string[];
  status?: MarketEventStatus;
  watchNext: string[];
  keyEntities: string[];
};

function clamp(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value as number)));
}

function dedupeStrings(values: string[] | undefined, fallback: string[]): string[] {
  const base = Array.isArray(values) ? values : fallback;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of base) {
    const trimmed = String(value || '').trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export async function classifyClusterWithOpenAI(
  cluster: EventCluster,
  defaults: {
    title: string;
    eventType: MarketEventType;
    horizon: MarketEventHorizon;
    severity: number;
    drivers: string[];
    marketImpact: z.infer<typeof marketImpactSchema>;
    transmissionPath: string[];
  },
  diagnostics: ClassifyDiagnostics,
  debug = false
): Promise<ClassifiedEventPayload | null> {
  const keys = getOpenAIKeyCandidates('service');
  const models = getOpenAIModelCandidates(process.env.OPENAI_MODEL, 'gpt-4o-mini', 'gpt-4.1-mini');
  if (!keys.length || !models.length) return null;

  const clusterInput = {
    fingerprint: cluster.fingerprint,
    gateCategory: cluster.gateCategory,
    eventTypeHint: defaults.eventType,
    title: cluster.canonicalTitle,
    keyEntities: cluster.keyEntities,
    headlines: cluster.items.slice(0, 8).map((item) => ({
      title: item.title,
      snippet: item.description,
      source: item.source,
      url: item.url,
      publishedAt: item.publishedAt,
    })),
  };

  for (const key of keys) {
    const client = new OpenAI({ apiKey: key });
    for (const model of models) {
      diagnostics.openaiCallCount += 1;
      try {
        const response = await client.responses.create({
          model,
          temperature: 0.1,
          max_output_tokens: 700,
          input: [
            { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
            {
              role: 'user',
          content:
                'Classify this event cluster and output JSON only. If uncertain, set marketMoving=false.\n' +
                JSON.stringify(clusterInput),
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'capitalbase_event_classifier',
              strict: true,
              schema: jsonSchema,
            },
          },
        } as never);

        const raw = response.output_text || '{}';
        if (debug) {
          diagnostics.rawSamples = diagnostics.rawSamples || [];
          if (diagnostics.rawSamples.length < 5) {
            diagnostics.rawSamples.push(`${cluster.fingerprint.slice(0, 8)}:${raw.slice(0, 300)}`);
          }
        }

        let parsed: z.infer<typeof classifierSchema>;
        try {
          parsed = classifierSchema.parse(JSON.parse(raw));
        } catch (error) {
          diagnostics.schemaParseFailures += 1;
          const msg = error instanceof Error ? error.message : String(error);
          if (diagnostics.openaiErrors.length < 8) diagnostics.openaiErrors.push(`schema_parse_failed:${msg.slice(0, 180)}`);
          continue;
        }

        if (!parsed.marketMoving) return null;

        return {
          marketMoving: true,
          title: parsed.title?.trim() || defaults.title,
          eventType: parsed.eventType || defaults.eventType,
          horizon: parsed.horizon || defaults.horizon,
          severity: clamp(parsed.severity, defaults.severity),
          drivers: dedupeStrings(parsed.drivers, defaults.drivers).slice(0, 4),
          marketImpact: parsed.marketImpact || defaults.marketImpact,
          transmissionPath: dedupeStrings(parsed.transmissionPath, defaults.transmissionPath),
          status: parsed.status,
          watchNext: dedupeStrings(parsed.watchNext, [
            'Watch official confirmations and policy statements.',
          ]).slice(0, 3),
          keyEntities: dedupeStrings(parsed.keyEntities, cluster.keyEntities).slice(0, 12),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (diagnostics.openaiErrors.length < 8) diagnostics.openaiErrors.push(`openai_call_failed:${message.slice(0, 180)}`);
      }
    }
  }

  return null;
}
