import 'server-only';

import OpenAI from 'openai';
import { z } from 'zod';

import { ENV, keysPresent, requireEnv } from '@/lib/env/server';
import { toErrorText } from '@/lib/providers/utils';

import {
  AgentInputSchema,
  AgentOutputSchema,
  OutputTypeSchema,
  getAgentLlmOutputSchema,
  type AgentInput,
  type AgentOutput,
  type OutputType,
} from './schemas';
import { ensureRenderBlocks } from './renderBlocks';
import { inferOutputType, inferOutputTypeRules, type LlmInferType } from './inference';
import { buildCompletePrompt } from './prompts';
import { callLLM, parseJSONResponse } from './llm';
import { routePrompt } from './router';

type LlmMode = 'generate' | 'fix';
type LlmRequest = {
  input: AgentInput;
  type: OutputType;
  draftArtifact: unknown;
  draftQuestions: string[];
  mode: LlmMode;
  previousJson?: unknown;
  issues?: string[];
};

type Llm = (request: LlmRequest) => Promise<unknown>;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const safeJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const zodIssuesToText = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.length ? issue.path.join('.') : '<root>'}: ${issue.message}`);

const normalizeFollowupAnswers = (input: AgentInput): Record<string, string> => {
  const raw = input.followup_answers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== 'string' || typeof value !== 'string') continue;
    const k = key.trim();
    const v = value.trim();
    if (!k || !v) continue;
    normalized[k] = v;
  }
  return normalized;
};

const filterUnansweredQuestions = (questions: string[], followupAnswers: Record<string, string>) =>
  questions.filter((q) => !followupAnswers[q]?.trim());

const applyFollowupAnswersToDraftArtifact = (type: OutputType, draftArtifact: unknown, followupAnswers: Record<string, string>): unknown => {
  if (!followupAnswers || !Object.keys(followupAnswers).length) return draftArtifact;
  if (!draftArtifact || typeof draftArtifact !== 'object' || Array.isArray(draftArtifact)) return draftArtifact;

  if (type === 'FORECAST_BLUEPRINT') {
    const metricQ = 'What is the exact target metric (units, revenue, active users, ARR, etc.)?';
    const scopeQ = 'What segment/geography/channel should be in-scope vs out-of-scope?';
    const baselineQ = 'What historical baseline should anchor the forecast (last year same period, trailing average, run-rate)?';
    const constraintsQ = 'Any known constraints (inventory, capacity, pricing rules, budget) that should be modeled?';

    const updated: any = { ...(draftArtifact as any) };
    if (followupAnswers[metricQ]) updated.target_metric = followupAnswers[metricQ];
    if (followupAnswers[scopeQ]) {
      const existingObjective = typeof updated.objective === 'string' ? updated.objective : updated.objective == null ? '' : String(updated.objective);
      updated.objective = `${existingObjective}\nScope: ${followupAnswers[scopeQ]}`.trim();
    }

    if (Array.isArray(updated.assumptions)) {
      updated.assumptions = updated.assumptions.map((a: any) => {
        if (a?.name === 'Baseline run-rate' && followupAnswers[baselineQ]) return { ...a, default: followupAnswers[baselineQ] };
        return a;
      });
    }

    if (followupAnswers[constraintsQ]) {
      const assumption = { name: 'Constraints', default: followupAnswers[constraintsQ], sensitivity: 'med' };
      updated.assumptions = Array.isArray(updated.assumptions) ? [...updated.assumptions, assumption] : [assumption];
    }

    return updated;
  }

  return draftArtifact;
};

const normalizeOutputType = (raw?: string | null): OutputType | null => {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '_').replace(/-+/g, '_');
  const parsed = OutputTypeSchema.safeParse(cleaned);
  return parsed.success ? parsed.data : null;
};

const extractTicker = (input: AgentInput): string | null => {
  const fromContext = input.context?.ticker?.trim();
  if (fromContext) return fromContext.toUpperCase();

  const match = input.prompt.match(/\b[A-Z]{1,5}\b/g) || [];
  const blacklist = new Set(['THE', 'AND', 'FOR', 'WITH', 'BASE', 'UP', 'DOWN', 'Q1', 'Q2', 'Q3', 'Q4', 'SQL', 'DCF']);
  const candidate = match.find((t) => !blacklist.has(t));
  return candidate ? candidate.toUpperCase() : null;
};

const buildDraftQuestions = (type: OutputType, input: AgentInput, ambiguous: boolean): string[] => {
  const questions: string[] = [];
  const ticker = extractTicker(input);
  const hasTimeframe = Boolean(input.context?.timeframe) || /\bq[1-4]\b/i.test(input.prompt) || /\bnext\b/i.test(input.prompt);

  if (type === 'FORECAST_BLUEPRINT') {
    questions.push('What is the exact target metric (units, revenue, active users, ARR, etc.)?');
    if (!hasTimeframe) questions.push('What is the forecast horizon (start/end) and reporting frequency (weekly/monthly/quarterly)?');
    questions.push('What segment/geography/channel should be in-scope vs out-of-scope?');
    questions.push('What historical baseline should anchor the forecast (last year same period, trailing average, run-rate)?');
    questions.push('Any known constraints (inventory, capacity, pricing rules, budget) that should be modeled?');
  } else if (type === 'SCENARIO_ENGINE') {
    questions.push('Which KPI(s) should scenarios shock (gross margin, volume, pricing, opex, WACC, etc.)?');
    if (ticker) questions.push(`What is the baseline for the key KPI(s) for ${ticker} before shocks?`);
    questions.push('What time period should shocks apply over (e.g., next 6 quarters)?');
    questions.push('Any second-order links we should enforce (e.g., price↓ → volume↑, inflation↑ → COGS↑)?');
    questions.push('What scenario narratives matter most (macro, competition, execution, regulation)?');
  } else if (type === 'DCF_DRIVERS') {
    questions.push('What forecast horizon should the DCF cover (years) and what terminal method (growth vs multiple)?');
    questions.push('Should drivers be expressed as % of revenue, per-unit, or absolute dollars?');
    questions.push('Any known constraints (margin floors/ceilings, capex intensity targets, working-capital policy)?');
    questions.push('Do we have a reference period (LTM) to anchor starting values?');
    questions.push('Do you want separate cases (base/upside/downside) or a single baseline driver set?');
  } else if (type === 'MARKET_IMPACT_BRIEF') {
    questions.push('What is the event timing and region (and is it already in the market or a new surprise)?');
    questions.push('Which assets are in-scope (equities sectors, rates, FX, commodities, credit)?');
    questions.push('What is the expected duration (hours/days/weeks) of the primary impact?');
    questions.push('Any key constraints (policy response, supply chain exposure, insurance coverage, energy infrastructure)?');
    questions.push('What are the main “watch” indicators you care about (prices, spreads, volumes, data releases)?');
  } else if (type === 'SQL_QUERY') {
    questions.push('What SQL dialect should be used (Postgres, BigQuery, Snowflake)?');
    questions.push('What are the relevant tables and primary keys (and expected grain)?');
    questions.push('What time window and filters should be applied?');
    questions.push('What are the required output columns and ordering?');
    questions.push('Any performance constraints (partition columns, indexes, max rows)?');
  } else if (type === 'PYTHON_NOTEBOOK') {
    questions.push('What is the data source (CSV, database, API) and where is it located?');
    questions.push('What is the desired output (plots, tables, forecast, model fit)?');
    questions.push('Any constraints on packages or environment (Python version, no internet, etc.)?');
    questions.push('What time window and filters should be applied?');
    questions.push('How should results be validated (sanity checks/benchmarks)?');
  } else if (type === 'SLIDE_OUTLINE') {
    questions.push('Who is the audience (internal leadership, investors, customers)?');
    questions.push('How long should the deck be (5 vs 10+ slides)?');
    questions.push('What decision should the deck support (approve budget, choose strategy, assess risk)?');
    questions.push('What data sources are allowed (internal metrics vs public only)?');
    questions.push('Any required sections (market, product, financials, risks)?');
  } else if (type === 'CHECKLIST') {
    questions.push('What is the objective and deadline for this checklist?');
    questions.push('Who are the owners (you vs agent vs team roles)?');
    questions.push('What constitutes “done” (definition of done / acceptance criteria)?');
    questions.push('Any dependencies or ordering constraints?');
    questions.push('What tools/processes must be used (Jira, GitHub, docs, approvals)?');
  }

  const capped = questions.filter((q) => typeof q === 'string' && q.trim()).slice(0, 5);
  if (!ambiguous) return [];
  return capped;
};

const buildDraftArtifact = (type: OutputType, input: AgentInput) => {
  const prompt = input.prompt.trim();
  const ticker = extractTicker(input);

  switch (type) {
    case 'FORECAST_BLUEPRINT':
      return {
        objective: prompt,
        target_metric: /revenue|arr|mrr/i.test(prompt) ? 'revenue' : /sales|units/i.test(prompt) ? 'units_sold' : 'target_metric',
        horizon: {
          start: input.context?.timeframe || 'TBD',
          end: input.context?.timeframe || 'TBD',
          frequency: /week/i.test(prompt) ? 'weekly' : /month/i.test(prompt) ? 'monthly' : 'quarterly',
        },
        key_drivers: [
          { name: 'Demand / unit volume', rationale: 'Primary determinant of the target metric over the horizon.', directionality: 'positive' },
          { name: 'Pricing / mix', rationale: 'Mix shifts and pricing drive revenue per unit and margin quality.', directionality: 'mixed' },
          { name: 'Channel availability', rationale: 'Distribution, inventory, and partner availability constrain realized volume.', directionality: 'mixed' },
          { name: 'Seasonality / calendar effects', rationale: 'Quarter/holiday seasonality often dominates short-horizon forecasts.', directionality: 'mixed' },
        ],
        assumptions: [
          { name: 'Baseline run-rate', default: 'TBD (use last 8–12 weeks or last-year comparable period)', sensitivity: 'high' },
          { name: 'Promo intensity', default: 'TBD (no change vs baseline unless specified)', sensitivity: 'med' },
          { name: 'Supply constraints', default: 'Assume no binding supply constraint unless specified', sensitivity: 'med' },
        ],
        data_needed: [
          { source: 'internal', field: 'Historical units/revenue by week/month', notes: 'At least 8–12 periods for baseline and seasonality.' },
          { source: 'internal', field: 'Pricing and promo calendar', notes: 'Promo/discount schedule and channel mix.' },
          { source: 'public', field: 'Industry seasonality benchmarks', notes: 'Use comparable category seasonal patterns if internal history is sparse.' },
        ],
        model_structure: [
          { step: 1, description: 'Establish baseline run-rate and seasonal indices.' },
          { step: 2, description: 'Model drivers (price/mix, channel, constraints) as multipliers or adders.' },
          { step: 3, description: 'Construct base/upside/downside by shifting 1–2 load-bearing drivers.' },
          { step: 4, description: 'Validate against historical ranges and external benchmarks; document assumptions.' },
        ],
        output_tables: [
          { name: 'Forecast summary', columns: ['Period', 'Units', 'Revenue', 'Assumptions', 'Notes'] },
          { name: 'Driver assumptions', columns: ['Driver', 'Base', 'Upside', 'Downside', 'Rationale'] },
        ],
        charts: [
          { name: 'Forecast over time', x: 'Period', y: 'Units/Revenue', note: 'Show base vs upside vs downside bands.' },
        ],
      };
    case 'SCENARIO_ENGINE':
      return {
        base_case: {
          narrative: ticker ? `Base case for ${ticker}: continuation of current operating conditions.` : 'Base case: continuation of current operating conditions.',
          shocks: [{ variable: 'Demand growth', unit: '%', magnitude: 'TBD', duration: 'TBD', rationale: 'Baseline demand trajectory.' }],
        },
        upside_case: {
          narrative: 'Upside case: stronger demand and/or improved unit economics vs baseline.',
          shocks: [{ variable: 'Gross margin', unit: 'pp', magnitude: '+TBD', duration: 'TBD', rationale: 'Operational leverage, pricing power, or cost relief.' }],
        },
        downside_case: {
          narrative: 'Downside case: demand deceleration and/or cost pressure vs baseline.',
          shocks: [{ variable: 'Gross margin', unit: 'pp', magnitude: '-TBD', duration: 'TBD', rationale: 'Pricing pressure, input cost inflation, or unfavorable mix.' }],
        },
        shock_library: [
          { variable: 'Revenue growth', unit: '%', magnitude: '±TBD', duration: 'TBD', rationale: 'Top-line demand/price effects.' },
          { variable: 'Gross margin', unit: 'pp', magnitude: '±TBD', duration: 'TBD', rationale: 'Pricing, mix, and costs.' },
          { variable: 'Opex growth', unit: '%', magnitude: '±TBD', duration: 'TBD', rationale: 'Operating discipline vs investment.' },
        ],
        timeline: [
          { period: input.context?.timeframe || 'TBD', note: 'Apply scenario shocks across the selected horizon.' },
        ],
      };
    case 'DCF_DRIVERS':
      return {
        revenue: {
          drivers: [
            { name: 'Revenue growth', default: 'TBD', range: { low: 'TBD', high: 'TBD' }, note: 'Top-line growth assumption by period.' },
            { name: 'Price / mix', default: 'TBD', range: { low: 'TBD', high: 'TBD' }, note: 'Mix shift and pricing assumptions.' },
          ],
        },
        cogs: {
          drivers: [
            { name: 'COGS % of revenue', default: 'TBD', range: { low: 'TBD', high: 'TBD' }, note: 'Gross margin bridge; include mix and cost inflation.' },
          ],
        },
        opex: {
          drivers: [
            { name: 'SG&A % of revenue', default: 'TBD', range: { low: 'TBD', high: 'TBD' }, note: 'Operating leverage vs reinvestment.' },
            { name: 'R&D % of revenue', default: 'TBD', range: { low: 'TBD', high: 'TBD' }, note: 'Innovation vs cost discipline.' },
          ],
        },
        capex: {
          drivers: [
            { name: 'Capex % of revenue', default: 'TBD', range: { low: 'TBD', high: 'TBD' }, note: 'Maintenance vs growth capex.' },
          ],
        },
        nwc: {
          drivers: [
            { name: 'NWC % of revenue', default: 'TBD', range: { low: 'TBD', high: 'TBD' }, note: 'Working capital policy; receivables/payables/inventory.' },
          ],
        },
        checks: [
          'Cross-check implied margins vs history and peers.',
          'Ensure capex + NWC assumptions are consistent with growth.',
          'Document terminal assumption and sensitivity.',
        ],
      };
    case 'MARKET_IMPACT_BRIEF':
      return {
        event_summary: prompt,
        transmission_channels: [
          { channel: 'Supply / capacity', mechanism: 'Event changes supply availability, logistics, or production capacity.' },
          { channel: 'Demand / behavior', mechanism: 'Event shifts consumer or business demand and substitution patterns.' },
          { channel: 'Policy / rates / risk premium', mechanism: 'Event changes policy expectations and risk premia.' },
        ],
        likely_impacts: [
          { asset_or_sector: 'Energy', direction: 'mixed', why: 'Dependent on supply disruptions and refinery/logistics impacts.' },
          { asset_or_sector: 'Insurance', direction: 'down', why: 'Loss expectations rise; pricing may adjust with lag.' },
          { asset_or_sector: 'Rates', direction: 'mixed', why: 'Risk-off vs fiscal/repair demand can offset.' },
        ],
        watchlist: [
          { metric: 'Spot commodity prices / spreads', why: 'Fastest signal of supply dislocations.' },
          { metric: 'Credit spreads / volatility', why: 'Captures risk premium changes and uncertainty.' },
          { metric: 'Policy statements', why: 'Guides second-order impacts via expectations.' },
        ],
        next_actions: ['Define asset universe and benchmark(s).', 'Track first-24h vs first-week market reaction.', 'Update impacts as facts emerge.'],
      };
    case 'SQL_QUERY':
      return {
        assumptions: ['Database dialect: Postgres (adjust as needed).', 'Timestamps are stored in UTC.', 'Primary key exists for deduplication.'],
        sql: `-- TODO: Replace table/column names\nSELECT\n  /* fields */\nFROM your_table\nWHERE 1=1\n  /* filters */\nORDER BY 1 DESC\nLIMIT 100;`,
        explanation: 'Template query with placeholders. Replace table/columns and add filters to match your schema and question.',
      };
    case 'PYTHON_NOTEBOOK':
      return {
        environment: { python: '3.11', packages: ['pandas', 'numpy', 'matplotlib', 'statsmodels'] },
        steps: [
          { step: 1, description: 'Load data (CSV/DB/API) and standardize column names.' },
          { step: 2, description: 'Clean data: handle missing values, outliers, and time alignment.' },
          { step: 3, description: 'Compute features/drivers and build a baseline model.' },
          { step: 4, description: 'Run scenario variants and validate against holdout/benchmarks.' },
        ],
        pseudocode: `import pandas as pd\n\n# load\n# clean\n# feature engineering\n# model\n# scenarios\n# outputs`,
      };
    case 'SLIDE_OUTLINE':
      return {
        deck_title: ticker ? `${ticker} — Strategic Analysis` : 'Strategic Analysis',
        slides: [
          { slide: 1, title: 'Executive Summary', bullets: ['What question we are answering', 'What matters most', 'Key risks/uncertainties'] },
          { slide: 2, title: 'Drivers & Assumptions', bullets: ['Driver tree', 'Load-bearing assumptions', 'Sensitivities'] },
          { slide: 3, title: 'Scenarios', bullets: ['Base case', 'Upside case', 'Downside case'] },
          { slide: 4, title: 'Implications / Next Steps', bullets: ['Decision implications', 'What to monitor', 'Data needed to improve confidence'] },
        ],
      };
    case 'CHECKLIST':
      return {
        tasks: [
          { task: 'Confirm objective, audience, and scope', priority: 'P0', owner: 'user', notes: 'What decision is this supporting?' },
          { task: 'Collect baseline data and define metrics', priority: 'P0', owner: 'user' },
          { task: 'Draft driver tree and assumptions', priority: 'P1', owner: 'agent' },
          { task: 'Create base/upside/downside scenarios', priority: 'P1', owner: 'agent' },
          { task: 'Review sensitivities and finalize outputs', priority: 'P2', owner: 'user' },
        ],
      };
    default: {
      const exhaustive: never = type;
      throw new Error(`Unhandled OutputType: ${exhaustive}`);
    }
  }
};

const buildRenderHints = (type: OutputType): AgentOutput['render_hints'] => {
  switch (type) {
    case 'FORECAST_BLUEPRINT':
      return {
        layout: 'mixed',
        primary_blocks: [
          { block_type: 'text', label: 'Objective', key: 'objective' },
          { block_type: 'table', label: 'Key drivers', key: 'key_drivers' },
          { block_type: 'table', label: 'Assumptions', key: 'assumptions' },
          { block_type: 'table', label: 'Data needed', key: 'data_needed' },
          { block_type: 'table', label: 'Model structure', key: 'model_structure' },
        ],
      };
    case 'SCENARIO_ENGINE':
      return {
        layout: 'mixed',
        primary_blocks: [
          { block_type: 'text', label: 'Base case', key: 'base_case.narrative' },
          { block_type: 'table', label: 'Base shocks', key: 'base_case.shocks' },
          { block_type: 'text', label: 'Upside case', key: 'upside_case.narrative' },
          { block_type: 'table', label: 'Upside shocks', key: 'upside_case.shocks' },
          { block_type: 'text', label: 'Downside case', key: 'downside_case.narrative' },
          { block_type: 'table', label: 'Downside shocks', key: 'downside_case.shocks' },
          { block_type: 'table', label: 'Timeline', key: 'timeline' },
        ],
      };
    case 'DCF_DRIVERS':
      return {
        layout: 'mixed',
        primary_blocks: [
          { block_type: 'table', label: 'Revenue drivers', key: 'revenue.drivers' },
          { block_type: 'table', label: 'COGS drivers', key: 'cogs.drivers' },
          { block_type: 'table', label: 'Opex drivers', key: 'opex.drivers' },
          { block_type: 'table', label: 'Capex drivers', key: 'capex.drivers' },
          { block_type: 'table', label: 'NWC drivers', key: 'nwc.drivers' },
          { block_type: 'text', label: 'Checks', key: 'checks' },
        ],
      };
    case 'MARKET_IMPACT_BRIEF':
      return {
        layout: 'mixed',
        primary_blocks: [
          { block_type: 'text', label: 'Event summary', key: 'event_summary' },
          { block_type: 'table', label: 'Transmission channels', key: 'transmission_channels' },
          { block_type: 'table', label: 'Likely impacts', key: 'likely_impacts' },
          { block_type: 'table', label: 'Watchlist', key: 'watchlist' },
          { block_type: 'text', label: 'Next actions', key: 'next_actions' },
        ],
      };
    case 'SQL_QUERY':
      return {
        layout: 'mixed',
        primary_blocks: [
          { block_type: 'text', label: 'Assumptions', key: 'assumptions' },
          { block_type: 'code', label: 'SQL', key: 'sql' },
          { block_type: 'text', label: 'Explanation', key: 'explanation' },
        ],
      };
    case 'PYTHON_NOTEBOOK':
      return {
        layout: 'mixed',
        primary_blocks: [
          { block_type: 'text', label: 'Environment', key: 'environment' },
          { block_type: 'table', label: 'Steps', key: 'steps' },
          { block_type: 'code', label: 'Pseudocode', key: 'pseudocode' },
        ],
      };
    case 'SLIDE_OUTLINE':
      return {
        layout: 'doc',
        primary_blocks: [
          { block_type: 'text', label: 'Deck title', key: 'deck_title' },
          { block_type: 'table', label: 'Slides', key: 'slides' },
        ],
      };
    case 'CHECKLIST':
      return {
        layout: 'table',
        primary_blocks: [{ block_type: 'table', label: 'Tasks', key: 'tasks' }],
      };
    default: {
      const exhaustive: never = type;
      throw new Error(`Unhandled OutputType: ${exhaustive}`);
    }
  }
};

const defaultTitle = (type: OutputType, input: AgentInput) => {
  const ticker = extractTicker(input);
  const prefix = ticker ? `${ticker} — ` : '';
  switch (type) {
    case 'FORECAST_BLUEPRINT':
      return `${prefix}Forecast blueprint`;
    case 'SCENARIO_ENGINE':
      return `${prefix}Scenario engine`;
    case 'DCF_DRIVERS':
      return `${prefix}DCF drivers`;
    case 'MARKET_IMPACT_BRIEF':
      return `${prefix}Market impact brief`;
    case 'SQL_QUERY':
      return `${prefix}SQL query`;
    case 'PYTHON_NOTEBOOK':
      return `${prefix}Python notebook plan`;
    case 'SLIDE_OUTLINE':
      return `${prefix}Slide outline`;
    case 'CHECKLIST':
      return `${prefix}Checklist`;
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
};

const defaultSummary = (type: OutputType) => {
  switch (type) {
    case 'FORECAST_BLUEPRINT':
      return 'A driver-based plan to build a forecast model, including assumptions and data needs.';
    case 'SCENARIO_ENGINE':
      return 'Base/upside/downside scenario definitions with shock variables and a timeline.';
    case 'DCF_DRIVERS':
      return 'Structured DCF driver assumptions across revenue, costs, opex, capex, and working capital.';
    case 'MARKET_IMPACT_BRIEF':
      return 'An event-to-market transmission map with likely impacts and what to watch next.';
    case 'SQL_QUERY':
      return 'A SQL query template plus assumptions and explanation.';
    case 'PYTHON_NOTEBOOK':
      return 'A notebook-style plan with steps, packages, and pseudocode.';
    case 'SLIDE_OUTLINE':
      return 'A slide-by-slide outline suitable for rendering a deck.';
    case 'CHECKLIST':
      return 'An actionable checklist with priority and owner assignments.';
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
};

const buildOpenAiLlm = (): Llm | null => {
  if (process.env.NODE_ENV === 'test') return null;
  if (!keysPresent.openai) return null;

  return async (request: LlmRequest) => {
    const traceId = crypto.randomUUID();

    if (request.mode === 'fix') {
      // Retry on invalid JSON - use LLM wrapper with fix prompt
      const systemPrompt = [
        'You are fixing a JSON validation error.',
        'Return ONLY valid JSON matching the schema.',
        'Do not include markdown, code blocks, or any commentary.',
        'Output must be pure JSON only.',
      ].join('\n');

      const userPrompt = [
        `OutputType: ${request.type}`,
        `Previous (invalid) JSON:`,
        JSON.stringify(request.previousJson, null, 2),
        '',
        `Validation errors:`,
        request.issues?.join('\n') || 'Unknown validation errors',
        '',
        'Fix the JSON to match the schema and return ONLY the corrected JSON (no markdown, no code blocks).',
      ].join('\n');

      try {
        const response = await callLLM({
          systemPrompt,
          userPrompt,
          model: ENV.OPENAI_MODEL,
          temperature: 0,
          responseFormat: { type: 'json_object' },
          traceId,
        });

        return parseJSONResponse<unknown>(response.content, traceId);
      } catch (error) {
        console.warn('[agent] LLM fix failed', error);
        return null;
      }
    }

    // mode === 'generate'
    // Use prompts.ts for base prompts, then extend with draft context
    const { systemPrompt: baseSystemPrompt, userPrompt: baseUserPrompt } = buildCompletePrompt(request.input, request.type);
    
    // Extend system prompt with draft context and generation rules
    const systemPrompt = [
      baseSystemPrompt,
      '',
      'Additional rules:',
      '  - Prefer clarity over verbosity.',
      '  - If a question implies a decision, tradeoff, forecast, sensitivity, or financial outcome, you SHOULD build a model.',
      '  - Use simple, decision-useful models. Avoid unnecessary complexity.',
      '  - Never hallucinate facts, numbers, or events.',
      '  - If assumptions are required, clearly label them with source: "user", "inferred", or "placeholder".',
      '  - If information is missing, keep placeholders as strings like "TBD" and include clarifying_questions (max 5).',
      '  - Do not invent precise numbers; prefer ranges or "TBD".',
      '',
      `Draft artifact to refine (use as starting point):`,
      JSON.stringify(request.draftArtifact, null, 2),
      '',
      `Draft clarifying questions (if any):`,
      request.draftQuestions.join('\n'),
    ].join('\n');

    // Extend user prompt with generation instructions
    const userPrompt = [
      baseUserPrompt,
      '',
      'Generate the complete artifact JSON. Return a JSON object with keys:',
      'title, summary, confidence (0..1), clarifying_questions (max 5), artifact (type-specific), warnings (string[]).',
      '',
      'For the artifact:',
      '  - Build quantitative models when the prompt implies a decision, tradeoff, forecast, sensitivity, or financial outcome.',
      '  - Use simple, decision-useful models. Avoid unnecessary complexity.',
      '  - Clearly label all assumptions with source: "user", "inferred", or "placeholder".',
      '  - Never invent precise numbers, facts, or events. Use "TBD", ranges, or clearly marked estimates.',
      '  - Focus on decision-oriented insights that help the user make a choice or understand tradeoffs.',
      '',
      'Do not include any extra keys. Output must be valid JSON only.',
    ].join('\n');

    try {
      const response = await callLLM({
        systemPrompt,
        userPrompt,
        model: ENV.OPENAI_MODEL,
        temperature: 0.3,
        maxTokens: 4000,
        responseFormat: { type: 'json_object' },
        traceId,
      });

      return parseJSONResponse<unknown>(response.content, traceId);
    } catch (error) {
      console.warn('[agent] LLM generation failed', error);
      return null;
    }
  };
};

const buildOpenAiTypeInferer = (): LlmInferType | null => {
  if (process.env.NODE_ENV === 'test') return null;
  if (!keysPresent.openai) return null;

  const client = new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY') });

  return async ({ prompt }) => {
    const system = [
      'You are a routing classifier for a UI artifact generator.',
      'Return ONLY valid JSON with a single key: "type".',
      `Allowed types: ${OutputTypeSchema.options.join(', ')}.`,
    ].join(' ');

    const user = [
      `User prompt: ${prompt}`,
      '',
      'Choose the best single output type and return JSON exactly like:',
      '{"type":"FORECAST_BLUEPRINT"}',
      '',
      'Type meanings (brief):',
      '- FORECAST_BLUEPRINT: forecast plan + drivers + assumptions + data needed',
      '- SCENARIO_ENGINE: base/upside/downside scenarios + shock variables + timeline',
      '- DCF_DRIVERS: revenue/COGS/opex/capex/NWC driver library for a DCF',
      '- MARKET_IMPACT_BRIEF: event → transmission channels → likely sector/asset impacts',
      '- SQL_QUERY: SQL + assumptions + explanation',
      '- PYTHON_NOTEBOOK: python steps + packages + pseudocode',
      '- SLIDE_OUTLINE: deck title + slide-by-slide bullets',
      '- CHECKLIST: actionable task list with priorities',
      '',
      'Return only JSON. Do not include extra keys.',
    ].join('\n');

    const resp = await client.chat.completions.create({
      model: ENV.OPENAI_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    const content = resp.choices?.[0]?.message?.content ?? '';
    return safeJsonParse(content);
  };
};

async function runOutputAgentInternal(input: AgentInput, deps: { llm: Llm | null }): Promise<AgentOutput> {
  const parsed = AgentInputSchema.parse(input);

  // Check router first - agent must respect router result
  const routerResult = await routePrompt(parsed.prompt);
  
  // If router says no model, and user hasn't explicitly requested MODEL_AND_VIZ, respect it
  const normalized = normalizeOutputType(parsed.outputType);
  if (!normalized && !routerResult.buildModel && routerResult.confidence >= 0.65) {
    // Router says no model with high confidence - use alternative output type
    const outputTypeInference = await inferOutputType(parsed.prompt, { llmInferType: buildOpenAiTypeInferer() });
    // If inference also suggests MODEL_AND_VIZ, override to a descriptive type
    if (outputTypeInference.type === 'MODEL_AND_VIZ') {
      // Use FORECAST_BLUEPRINT or MARKET_IMPACT_BRIEF as fallback for descriptive prompts
      const fallbackType: OutputType = outputTypeInference.candidates.length > 1
        ? outputTypeInference.candidates.find(c => c.type !== 'MODEL_AND_VIZ')?.type || 'FORECAST_BLUEPRINT'
        : 'FORECAST_BLUEPRINT';
      
      const type = fallbackType;
      const inference = {
        inferred: true,
        method: 'rules' as const,
        reason: `Router indicated no model needed (${routerResult.reason}), using fallback type`,
      };

      // Build draft artifact for fallback type
      const rawDraftArtifact = buildDraftArtifact(type, parsed);
      const draftQuestions = buildDraftQuestions(type, parsed, false);
      const draftArtifact = rawDraftArtifact;
      const render_hints = buildRenderHints(type);

      const baseWarnings = ['router_indicated_no_model', 'used_fallback_type'];
      
      const baseOutput = {
        type,
        title: defaultTitle(type, parsed),
        summary: defaultSummary(type),
        confidence: routerResult.confidence * 0.8, // Reduce confidence since we're using fallback
        inference,
        clarifying_questions: draftQuestions,
        artifact: draftArtifact,
        warnings: baseWarnings,
        render_hints,
      };

      const id = crypto.randomUUID();
      const finalValidated = AgentOutputSchema.safeParse({
        id,
        ...baseOutput,
      });

      if (!finalValidated.success) {
        // If fallback fails validation, return a minimal response
        const minimalOutput: AgentOutput = {
          id,
          type: 'FORECAST_BLUEPRINT',
          title: 'Information Request',
          summary: parsed.prompt,
          confidence: 0.5,
          inference,
          clarifying_questions: [],
          warnings: ['router_indicated_no_model', 'fallback_validation_failed'],
          render_hints: {
            layout: 'doc',
            primary_blocks: [],
          },
          artifact: buildDraftArtifact('FORECAST_BLUEPRINT', parsed),
        };
        return AgentOutputSchema.parse(ensureRenderBlocks(minimalOutput));
      }

      return AgentOutputSchema.parse(ensureRenderBlocks(finalValidated.data));
    }
  }

  const normalizedType = normalizeOutputType(parsed.outputType);
  const outputTypeInference = normalizedType
    ? {
        type: normalizedType,
        confidence: 1,
        method: 'rules' as const,
        reason: 'user_specified_output_type',
        ambiguous: false,
        candidates: [{ type: normalizedType, score: 999 }],
      }
    : await inferOutputType(parsed.prompt, { llmInferType: buildOpenAiTypeInferer() });
  const type = outputTypeInference.type;
  
  // If router says no model but we're building MODEL_AND_VIZ, add warning
  if (!normalizedType && type === 'MODEL_AND_VIZ' && !routerResult.buildModel && routerResult.confidence >= 0.65) {
    // Still build model, but warn user
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[agent] Router indicated no model needed, but building MODEL_AND_VIZ anyway', {
        prompt: parsed.prompt,
        routerReason: routerResult.reason,
      });
    }
  }

  // Generate ID early for use in delegation and traceId
  const id = crypto.randomUUID();

  // DELEGATE MODEL_AND_VIZ to Model Agent if router says buildModel
  if (type === 'MODEL_AND_VIZ' && routerResult.buildModel) {
    try {
      const { runModelAgent } = await import('./agents/modelAgent');
      
      const modelAgentResult = await runModelAgent({
        prompt: parsed.prompt,
        routing: {
          buildModel: routerResult.buildModel,
          reason: routerResult.reason,
          assumptions_level: routerResult.confidence >= 0.8 ? 'high' : routerResult.confidence >= 0.6 ? 'med' : 'low',
        },
        context: parsed.context,
        traceId: id,
      });

      // Model Agent returns complete AgentOutput - return it directly
      return AgentOutputSchema.parse(ensureRenderBlocks(modelAgentResult));
    } catch (error: any) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[agent] modelAgent delegation failed, falling back to normal flow', error);
      }
      // Fall through to normal flow if modelAgent fails
    }
  }

  const inference = normalized
    ? { inferred: false, method: 'rules' as const, reason: 'user_specified_output_type' }
    : { inferred: true, method: outputTypeInference.method, reason: outputTypeInference.reason };

  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    console.log('[agent:inference]', {
      inferred_type: type,
      inference_reason: outputTypeInference.reason,
      confidence: outputTypeInference.confidence,
      method: outputTypeInference.method,
    });
  }

  const followupAnswers = normalizeFollowupAnswers(parsed);
  const hasFollowupAnswers = Object.keys(followupAnswers).length > 0;

  const rawDraftArtifact = buildDraftArtifact(type, parsed);
  const draftQuestions = buildDraftQuestions(type, parsed, outputTypeInference.ambiguous);
  const remainingQuestions = hasFollowupAnswers ? filterUnansweredQuestions(draftQuestions, followupAnswers) : draftQuestions;
  const draftArtifact = applyFollowupAnswersToDraftArtifact(type, rawDraftArtifact, followupAnswers);
  const render_hints = buildRenderHints(type);

  const baseWarnings: string[] = [];
  if (!normalized && parsed.outputType) baseWarnings.push('output_type_unrecognized');
  if (outputTypeInference.ambiguous && !hasFollowupAnswers) baseWarnings.push('needs_clarification');
  baseWarnings.push('needs_real_data');

  const baseOutput = {
    type,
    title: defaultTitle(type, parsed),
    summary: defaultSummary(type),
    confidence: outputTypeInference.ambiguous ? 0.35 : 0.55,
    inference,
    clarifying_questions: remainingQuestions,
    artifact: draftArtifact,
    warnings: baseWarnings,
  };

  if (hasFollowupAnswers) {
    baseOutput.confidence = clamp01(baseOutput.confidence + 0.15);
    if (!remainingQuestions.length) baseOutput.confidence = clamp01(baseOutput.confidence + 0.1);
  }

  let llmPayload: unknown = null;
  const llm = deps.llm;
  if (llm) {
    try {
      llmPayload = await llm({ input: parsed, type, draftArtifact, draftQuestions, mode: 'generate' });
      const schema = getAgentLlmOutputSchema(type);
      const validated = schema.safeParse(llmPayload);
      if (!validated.success) {
        const issues = zodIssuesToText(validated.error);
        const fixed = await llm({
          input: parsed,
          type,
          draftArtifact,
          draftQuestions,
          mode: 'fix',
          previousJson: llmPayload,
          issues,
        });
        const fixedValidated = schema.safeParse(fixed);
        if (fixedValidated.success) {
          llmPayload = fixedValidated.data;
        } else {
          llmPayload = null;
          baseWarnings.push('llm_validation_failed');
        }
      } else {
        llmPayload = validated.data;
      }
    } catch (error) {
      llmPayload = null;
      baseWarnings.push('llm_failed');
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[agent] llm_failed', toErrorText(error));
      }
    }
  } else {
    baseWarnings.push('llm_unavailable');
  }

  // ID already generated above (line 736) for all types
  const finalId = id;

  const merged = (() => {
    if (!llmPayload || typeof llmPayload !== 'object') {
      return {
        id: finalId,
        ...baseOutput,
        confidence: clamp01(baseOutput.confidence),
        render_hints,
        warnings: Array.from(new Set(baseOutput.warnings)),
      };
    }

    const payload = llmPayload as any;
    const mergedWarnings = Array.from(new Set([...(baseOutput.warnings ?? []), ...(Array.isArray(payload.warnings) ? payload.warnings : [])]));
    const clarifying =
      hasFollowupAnswers
        ? remainingQuestions
        : Array.isArray(payload.clarifying_questions)
        ? payload.clarifying_questions
        : baseOutput.clarifying_questions;
    const baseConfidence = typeof baseOutput.confidence === 'number' ? baseOutput.confidence : 0.5;
    const mergedConfidence = clamp01(typeof payload.confidence === 'number' ? payload.confidence : baseConfidence);
    return {
      id: finalId,
      type,
      title: typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : baseOutput.title,
      summary: typeof payload.summary === 'string' && payload.summary.trim() ? payload.summary.trim() : baseOutput.summary,
      confidence: hasFollowupAnswers ? clamp01(Math.max(baseConfidence, mergedConfidence)) : mergedConfidence,
      inference,
      clarifying_questions: clarifying.filter((q: any) => typeof q === 'string' && q.trim()).slice(0, 5),
      artifact: payload.artifact ?? baseOutput.artifact,
      render_hints,
      warnings: mergedWarnings.filter((w) => typeof w === 'string' && w.trim()),
    };
  })();

  // Add validation and explainability for MODEL_AND_VIZ outputs
  let enriched = merged;
  if (type === 'MODEL_AND_VIZ' && merged.artifact) {
    try {
      const { validateModel } = await import('@/lib/modeling/validation');
      const { computeAttribution } = await import('@/lib/modeling/attribution');
      const { computeAssumptionsSummary } = await import('@/lib/modeling/assumptions');

      const artifact = merged.artifact as any;
      const validation = validateModel(artifact);
      const explainability = computeAttribution(artifact);
      const assumptions_summary = computeAssumptionsSummary(artifact);

      enriched = {
        ...merged,
        validation,
        explainability,
        assumptions_summary,
      };

      // If validation failed, attempt one auto-refinement pass
      if (!validation.passed && !merged.warnings.includes('validation_refined')) {
        try {
          const refined = await attemptAutoRefinement(artifact, validation, { llm });
          if (refined) {
            const refinedValidation = validateModel(refined);
            const refinedExplainability = computeAttribution(refined);
            const refinedAssumptions = computeAssumptionsSummary(refined);

            enriched = {
              ...merged,
              artifact: refined,
              validation: refinedValidation,
              explainability: refinedExplainability,
              assumptions_summary: refinedAssumptions,
              warnings: [...merged.warnings, 'validation_refined'],
            };
          }
        } catch (refineError) {
          // If refinement fails, proceed with original model and warnings
          console.warn('[agent] auto-refinement failed', refineError);
        }
      }
    } catch (error) {
      console.warn('[agent] validation/explainability failed', error);
      // Continue without validation if it fails
    }
  }

  const finalValidated = AgentOutputSchema.safeParse(enriched);
  if (!finalValidated.success) {
    const fallback = {
      id,
      type,
      title: baseOutput.title,
      summary: baseOutput.summary,
      confidence: clamp01(baseOutput.confidence),
      inference,
      clarifying_questions: baseOutput.clarifying_questions,
      artifact: draftArtifact,
      render_hints,
      warnings: Array.from(new Set([...baseOutput.warnings, ...zodIssuesToText(finalValidated.error).map((s) => `schema_error:${s}`)])),
    };
    const parsedFallback = AgentOutputSchema.parse(fallback);
    return AgentOutputSchema.parse(ensureRenderBlocks(parsedFallback));
  }
  return AgentOutputSchema.parse(ensureRenderBlocks(finalValidated.data));
}

/**
 * Attempts automatic refinement of a model artifact based on validation warnings.
 * This is a ONE-SHOT refinement - if it still fails, we return the original.
 */
async function attemptAutoRefinement(
  artifact: any,
  validation: { passed: boolean; warnings: Array<{ code: string; message: string; affected_keys: string[] }> },
  deps: { llm: Llm | null }
): Promise<any | null> {
  if (!deps.llm) return null;

  // Only attempt refinement for specific warning codes
  const refinableCodes = ['extreme_margin', 'extreme_growth', 'discontinuous_jump', 'scenario_ordering'];
  const hasRefinableWarnings = validation.warnings.some((w) => refinableCodes.includes(w.code));

  if (!hasRefinableWarnings) return null;

  try {
    // Build refinement prompt
    const refinementPrompt = `The following model has validation warnings that need to be addressed:
${validation.warnings.map((w) => `- ${w.code}: ${w.message}`).join('\n')}

CRITICAL: Return ONLY valid JSON. No markdown, no commentary, only the refined artifact JSON.

Please refine the model by:
1. Narrowing extreme assumptions to more reasonable ranges (clearly label as "inferred" if adjusted)
2. Smoothing discontinuous jumps between periods
3. Ensuring scenario ordering is correct (upside >= base >= downside)
4. Keeping all other aspects of the model unchanged
5. Never invent new facts, numbers, or events - only adjust existing assumptions to be more reasonable

Rules:
- Prefer clarity over complexity
- Use simple, decision-useful models
- Clearly label all assumptions
- Never hallucinate facts or numbers

Return the refined artifact JSON with the same structure.`;

    // Use LLM to refine (simplified - in production, you'd want more structured refinement)
    const refined = await deps.llm({
      input: { prompt: refinementPrompt, outputType: 'MODEL_AND_VIZ' } as any,
      type: 'MODEL_AND_VIZ',
      draftArtifact: artifact,
      draftQuestions: [],
      mode: 'generate',
    });

    return refined?.artifact || null;
  } catch (error) {
    console.warn('[agent] refinement attempt failed', error);
    return null;
  }
}

export async function runOutputAgent(input: AgentInput): Promise<AgentOutput> {
  return runOutputAgentInternal(input, { llm: buildOpenAiLlm() });
}

export const __private__ = {
  normalizeOutputType,
  inferOutputTypeRules,
  buildDraftQuestions,
  buildDraftArtifact,
  buildRenderHints,
  runOutputAgentInternal,
  zodIssuesToText,
};
