import { z } from 'zod';
import type { EventCluster } from '@/lib/events/cluster';
import { generateTextWithProviderFallback, getOpenAIChatModelCandidates } from '@/lib/llm/generateText';
import { buildMacroPlaybookPromptContext } from '@/lib/macro/macroPlaybook';
import {
  marketImpactSchema,
  marketEventTypeSchema,
  marketEventStatusSchema,
  type MarketEventHorizon,
  type MarketEventStatus,
  type MarketEventType,
} from '@/lib/news/marketEventsTypes';

const CLASSIFIER_SYSTEM_PROMPT = `You are CapitalBase Events Intelligence — an institutional macro and markets analyst.

You classify event clusters, not single headlines.
Your job is to decide whether the cluster represents a real market-moving development and, if it does, explain the market story with explicit causality.

Return JSON only. No markdown.

Core reasoning order:
1. What actually happened?
2. What economic driver does it change?
3. Through which transmission channel does that hit markets?
4. Which assets, sectors, and companies are most exposed?

Rules:
- Be conservative. If the cluster is routine, ambiguous, or only weakly connected to markets, return marketMoving=false.
- Exclude generic market wrap, soft product news, incremental management commentary, and stale follow-on coverage.
- Use only the provided titles/snippets. Do not invent facts, prices, outcomes, or timelines.
- Prefer the dominant market narrative, not article phrasing.
- Severity should reflect likely cross-asset relevance, not headline drama.

For accepted events you MUST identify:
- Economic drivers: the root cause, not a paraphrase of the headline
- Transmission mechanisms: Event -> economic effect -> market reaction
- Winners and losers: specific sectors, assets, or named instruments when supported
- Watch items: the next catalyst that would confirm, amplify, or reverse the move

If marketMoving=true, return:
{
  "marketMoving": true,
  "title": "clear event title (not a headline)",
  "eventType": "Geopolitics" | "Macro" | "CentralBank" | "Conflict" | "Sanctions" | "SystemicRisk" | "RegulatoryShock" | "EarningsMegaCap",
  "severity": 0-100,
  "horizon": "Immediate" | "NearTerm" | "Structural",
  "drivers": ["root cause 1 — short, specific, causal", "root cause 2"],
  "marketImpact": {
    "equities": "index and sector impact, name the most exposed sectors or styles",
    "rates": "impact on yields, curve, and policy expectations",
    "fx": "impact on currencies, name pairs or dollar direction if relevant",
    "oil": "impact on energy and major commodity channels if relevant",
    "credit": "impact on spreads, financing conditions, or risk appetite",
    "sectors": "specific winner/loser sectors and names when supported"
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
}

Quality bar:
- Prefer 2-3 concrete drivers over many vague ones.
- Name the most important market first; omit irrelevant channels.
- Avoid generic phrases like "may affect investor sentiment" unless you specify how and where.
- If the cluster is real but localized, mark lower severity instead of forcing a broad macro framing.`;

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

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error('No JSON object found in classifier response.');
  }
  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
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
  const frameworkContext = buildMacroPlaybookPromptContext(
    `${cluster.canonicalTitle}\n${cluster.items.map((item) => `${item.title}\n${item.description ?? ''}`).join('\n')}`,
  );

  diagnostics.openaiCallCount += 1;
  try {
    const response = await generateTextWithProviderFallback({
      clientType: 'service',
      preferredProvider: 'anthropic',
      openAiModels: getOpenAIChatModelCandidates('gpt-4o-mini', 'gpt-4o'),
      temperature: 0.1,
      maxTokens: 900,
      messages: [
        { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            'Classify this event cluster and output JSON only. If uncertain, set marketMoving=false.\n' +
            (frameworkContext ? `Use these macro framework hints when relevant:\n${frameworkContext}\n` : '') +
            JSON.stringify(clusterInput),
        },
      ],
    });

    const raw = response?.text?.trim();
    if (debug) {
      diagnostics.rawSamples = diagnostics.rawSamples || [];
      if (diagnostics.rawSamples.length < 5) {
        const provider = response ? `${response.provider}:${response.model}` : 'unknown';
        diagnostics.rawSamples.push(`${cluster.fingerprint.slice(0, 8)}:${provider}:${(raw || '').slice(0, 260)}`);
      }
    }
    if (!raw) {
      if (diagnostics.openaiErrors.length < 8) diagnostics.openaiErrors.push('classifier_no_response:no_provider_result');
      return null;
    }

    let parsed: z.infer<typeof classifierSchema>;
    try {
      parsed = classifierSchema.parse(extractJsonObject(raw));
    } catch (error) {
      diagnostics.schemaParseFailures += 1;
      const msg = error instanceof Error ? error.message : String(error);
      if (diagnostics.openaiErrors.length < 8) diagnostics.openaiErrors.push(`schema_parse_failed:${msg.slice(0, 180)}`);
      return null;
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
    if (diagnostics.openaiErrors.length < 8) diagnostics.openaiErrors.push(`provider_call_failed:${message.slice(0, 180)}`);
    return null;
  }
}
