/**
 * AI Agent Pipeline
 * 
 * Takes a user prompt and produces structured outputs:
 * - Recommended model types
 * - Key assumptions
 * - Step-by-step build plan
 * - Preview charts (data-light)
 * - Generated model artifacts request (later)
 */

import 'server-only';

import OpenAI from 'openai';
import { z } from 'zod';
import { ENV } from '@/lib/env/server';
import {
  AgentPipelineOutputSchema,
  type AgentPipelineOutput,
  type Intent,
  type ModelToCreate,
} from './pipelineSchema';
import { routePrompt, extractTickers, classifyIntent, proposeModels } from '@/lib/agent/router';

const logger = {
  warn: (data: any, message: string) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[PipelineAgent] ${message}:`, data);
    }
  },
  error: (data: any, message: string) => {
    console.error(`[PipelineAgent] ${message}:`, data);
  },
};

/**
 * Use deterministic router to classify intent (delegates to router.ts)
 */
function determineIntent(prompt: string): Intent {
  return classifyIntent(prompt);
}

/**
 * Generate structured output using LLM
 */
async function generatePipelineOutput(
  prompt: string
): Promise<AgentPipelineOutput | null> {
  if (!ENV.OPENAI_API_KEY) {
    logger.warn({ prompt }, 'OpenAI API key not configured');
    return null;
  }

  // Use deterministic router for intent and model proposals
  const routerResult = routePrompt(prompt);
  const intent = routerResult.intent;
  const tickers = routerResult.tickers;
  const proposedModels = routerResult.models;

  // Build prompt variables
  const modelsList = proposedModels.map((m) => m.modelType).join(', ') || 'none';
  const tickersList = tickers.length > 0 ? tickers.join(', ') : 'None detected';
  const modelsWithWhy = proposedModels.map((m) => `${m.modelType}: ${m.why}`).join(' | ') || 'None';
  const firstTicker = tickers[0] || 'Company';

  const openai = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });

  const systemPrompt = `You are a financial modeling assistant that enriches routing decisions with assumptions and outputs.

CRITICAL RULES:
1. The intent has already been determined: ${intent}
2. Models to create have been proposed: ${modelsList}
3. Your job is to:
   - Generate titles for each model (make them specific to the prompt)
   - Extract key assumptions with rationale (use assumption-based ranges, no hallucinated precision)
   - Generate data-light preview charts/tables/memos (use placeholder/sample data)
   - ALWAYS return at least 1 output (chart, table, or memo)
   - Assess data coverage (price, fundamentals, news, macro) - mark false if data is missing
   - Include warnings if data is missing or assumptions are uncertain

EXTRACTED TICKERS: ${tickersList}

${intent === 'FORECAST' ? `FORECAST INTENT - PWM-STYLE FORECAST PACKET REQUIRED:
You MUST generate a Private Wealth Management (PWM) style forecast packet with:

1. THREE SCENARIOS (Base/Bull/Bear):
   - Base Case: 50-60% probability (most likely outcome)
   - Bull Case: 20-30% probability (optimistic)
   - Bear Case: 15-25% probability (pessimistic)
   - Probabilities MUST sum to exactly 100%
   - Each scenario needs: revenue growth range, margin range, price target range

2. 4-YEAR PROJECTION TABLE (required output):
   Columns: Year, RevenueGrowth (%), Margin (%), EPS/FCF per share ($), PriceRange ($), CAGR (%)
   Rows: Year 1, Year 2, Year 3, Year 4
   - Use RANGES for all values (e.g., "15-20%" not "17.5%")
   - If fundamentals missing, use sector defaults:
     * Tech: 15-25% growth, 20-30% margin
     * Retail: 3-7% growth, 5-10% margin
     * Industrials: 5-10% growth, 10-15% margin
     * Financials: 5-8% growth, 15-25% margin
     * Healthcare: 8-12% growth, 15-20% margin
   - Label assumptions clearly: "Assumed: Tech sector defaults"

3. FAN CHART (required output):
   - Type: "fan"
   - Title: "[Ticker] Price Range Forecast (4-Year)"
   - Series: Array of price ranges by year showing Base/Bull/Bear bands
   - Structure: { name: "Base", data: [low, high] for each year }, { name: "Bull", data: [...] }, { name: "Bear", data: [...] }

4. SENSITIVITY TABLE (required output):
   - Title: "Sensitivity Analysis"
   - Columns: Scenario, Growth +/-2%, Margin +/-200bps, Multiple +/-2x, Price Impact
   - Rows: Base Case, Bull Case, Bear Case, +2% Growth, -2% Growth, +200bps Margin, -200bps Margin, +2x Multiple, -2x Multiple
   - Show how price changes with each sensitivity

5. ASSUMPTIONS:
   - Revenue Growth: Use ranges (e.g., "15-20% YoY")
   - EBITDA Margin: Use ranges (e.g., "20-25%")
   - Multiple: Use ranges (e.g., "8-12x EV/Revenue")
   - If data missing, clearly label: "Assumed: [sector] sector defaults"

CRITICAL: All forecast values must be RANGES, never single-point predictions.` : ''}

CHART/TABLE/MEMO RULES:
- Charts: data-light (use sample/placeholder data), types: line, bar, fan, waterfall, tornado
- Tables: realistic structure but placeholder values (max 20 rows)
- Memos: structured sections with bullets (max 5 sections, 10 bullets each)
- ALWAYS include at least 1 output
- For MARKET_BRIEF intent: prefer memo outputs explaining the analysis

ASSUMPTION RULES:
- Use ranges when data is missing (e.g., "15-25% growth" not "20%")
- Label clearly when assumptions are used (e.g., "Assumed: 20% revenue growth")
- Never hallucinate precise numbers without data

Return ONLY valid JSON matching this schema:
{
  "intent": "FORECAST" | "VALUATION" | "MERGER" | "OPERATING" | "SCENARIO" | "MARKET_BRIEF" | "MIXED",
  "modelsToCreate": [
    {
      "modelType": "DCF" | "COMPS" | "LBO" | "THREE_STATEMENT" | "MERGER" | "OPERATING" | "SCENARIO_ENGINE",
      "title": "Model title",
      "why": "brief explanation",
      "inputsNeeded": ["input1", "input2"],
      "prefill": {}
    }
  ],
  "assumptions": [
    {
      "key": "assumption name",
      "value": "assumption value (use ranges if uncertain)",
      "rationale": "why this assumption"
    }
  ],
  "outputs": [
    {
      "kind": "chart",
      "spec": {
        "type": "line" | "bar" | "fan" | "waterfall" | "tornado",
        "title": "chart title",
        "series": {}
      }
    },
    {
      "kind": "table",
      "spec": {
        "title": "table title",
        "columns": ["col1", "col2"],
        "rows": [["val1", "val2"]]
      }
    },
    {
      "kind": "memo",
      "spec": {
        "sections": [
          {
            "title": "section title",
            "bullets": ["bullet 1", "bullet 2"]
          }
        ]
      }
    }
  ],
  "confidence": "Low" | "Medium" | "High",
  "dataCoverage": {
    "price": true/false,
    "fundamentals": true/false,
    "news": true/false,
    "macro": true/false
  },
  "warnings": ["warning1", "warning2"]
}`;

  const userPrompt = `Enrich the routing decision with assumptions and outputs for this prompt:

"${prompt}"

Intent: ${intent}
Proposed Models: ${modelsWithWhy}
Tickers: ${tickers.length > 0 ? tickers.join(', ') : 'None'}

${intent === 'FORECAST' ? `FORECAST-SPECIFIC TASKS:
1. Generate PWM-style forecast packet:
   - Create 3 scenarios (Base/Bull/Bear) with probabilities summing to 100%
   - Generate 4-year projection table with columns: Year, RevenueGrowth (%), Margin (%), EPS/FCF per share ($), PriceRange ($), CAGR (%)
   - Create fan chart showing price ranges by year (Base/Bull/Bear bands)
   - Create sensitivity table showing impact of growth +/-2%, margin +/-200bps, multiple +/-2x
2. Use sector defaults if fundamentals missing:
   - Tech: 15-25% growth, 20-30% margin, 8-12x multiple
   - Retail: 3-7% growth, 5-10% margin, 0.5-1.0x multiple
   - Industrials: 5-10% growth, 10-15% margin, 1.0-2.0x multiple
   - Financials: 5-8% growth, 15-25% margin, 1.5-2.5x multiple
   - Healthcare: 8-12% growth, 15-20% margin, 4-6x multiple
3. Label all assumptions clearly: "Assumed: [sector] sector defaults" when data is missing
4. ALL values must be RANGES, never single points` : `GENERAL TASKS:
1. Generate specific titles for each proposed model (e.g., "${firstTicker} ${intent} Analysis")
2. Extract 3-8 key assumptions with rationale (use ranges for uncertain values)
3. Generate 1-3 preview outputs (charts/tables/memos) that would be useful
4. Assess data coverage realistically (if no ticker detected, mark all as false)
5. Add warnings if data is missing or assumptions are uncertain`}

Focus on creating useful, actionable outputs that help the user understand what the model will show.`;

  try {
    const response = await openai.chat.completions.create({
      model: ENV.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    // Parse JSON (remove markdown code blocks if present)
    let jsonText = content.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonText);
    const validated = AgentPipelineOutputSchema.safeParse(parsed);

    if (!validated.success) {
      logger.warn({ prompt, errors: validated.error.errors }, 'Pipeline output validation failed');
      throw new Error('Validation failed');
    }

    return validated.data;
  } catch (error) {
    logger.error({ prompt, error: error instanceof Error ? error.message : String(error) }, 'Pipeline generation failed');
    return null;
  }
}

/**
 * Get sector defaults for forecast assumptions
 */
function getSectorDefaults(sector: string = 'tech'): {
  revenueGrowth: string;
  margin: string;
  multiple: string;
} {
  const defaults: Record<string, { revenueGrowth: string; margin: string; multiple: string }> = {
    tech: { revenueGrowth: '15-25%', margin: '20-30%', multiple: '8-12x EV/Revenue' },
    retail: { revenueGrowth: '3-7%', margin: '5-10%', multiple: '0.5-1.0x EV/Revenue' },
    industrials: { revenueGrowth: '5-10%', margin: '10-15%', multiple: '1.0-2.0x EV/Revenue' },
    financials: { revenueGrowth: '5-8%', margin: '15-25%', multiple: '1.5-2.5x P/B' },
    healthcare: { revenueGrowth: '8-12%', margin: '15-20%', multiple: '4-6x EV/Revenue' },
  };
  return defaults[sector.toLowerCase()] || defaults.tech;
}

/**
 * Generate fallback output when LLM fails
 * Uses deterministic router for intent and models
 */
function generateFallbackOutput(prompt: string): AgentPipelineOutput {
  const routerResult = routePrompt(prompt);
  const intent = routerResult.intent;
  const tickers = routerResult.tickers;
  const proposedModels = routerResult.models;

  // Generate titles for proposed models
  const ticker = tickers[0] || 'Company';
  const modelsToCreate: ModelToCreate[] = proposedModels.map((model) => ({
    ...model,
    title: `${ticker} ${model.modelType.replace('_', ' ')} Analysis`,
  }));

  // Special handling for FORECAST intent - generate PWM-style forecast packet
  if (intent === 'FORECAST') {
    const sectorDefaults = getSectorDefaults('tech'); // Default to tech, could be enhanced with ticker lookup
    
    // Generate 4-year projection table
    const projectionTable = {
      kind: 'table' as const,
      spec: {
        title: '4-Year Forecast Projection',
        columns: ['Year', 'Revenue Growth (%)', 'Margin (%)', 'EPS/FCF per Share ($)', 'Price Range ($)', 'CAGR (%)'],
        rows: [
          ['Year 1', `${sectorDefaults.revenueGrowth}`, `${sectorDefaults.margin}`, '$2.50-3.50', '$180-220', '15-20%'],
          ['Year 2', `${sectorDefaults.revenueGrowth}`, `${sectorDefaults.margin}`, '$3.00-4.50', '$200-260', '12-18%'],
          ['Year 3', `${sectorDefaults.revenueGrowth}`, `${sectorDefaults.margin}`, '$3.50-5.00', '$220-300', '10-15%'],
          ['Year 4', `${sectorDefaults.revenueGrowth}`, `${sectorDefaults.margin}`, '$4.00-5.50', '$240-340', '8-12%'],
        ],
      },
    };

    // Generate fan chart for price ranges
    const fanChart = {
      kind: 'chart' as const,
      spec: {
        type: 'fan' as const,
        title: `${ticker} Price Range Forecast (4-Year)`,
        series: [
          { name: 'Base Case', data: [200, 220, 240, 260] },
          { name: 'Bull Case', data: [220, 260, 300, 340] },
          { name: 'Bear Case', data: [180, 200, 220, 240] },
        ],
      },
    };

    // Generate sensitivity table
    const sensitivityTable = {
      kind: 'table' as const,
      spec: {
        title: 'Sensitivity Analysis',
        columns: ['Scenario', 'Growth Impact', 'Margin Impact', 'Multiple Impact', 'Price Impact'],
        rows: [
          ['Base Case', '0%', '0 bps', '0x', '$240'],
          ['+2% Growth', '+2%', '0 bps', '0x', '+$15-20'],
          ['-2% Growth', '-2%', '0 bps', '0x', '-$15-20'],
          ['+200bps Margin', '0%', '+200 bps', '0x', '+$20-25'],
          ['-200bps Margin', '0%', '-200 bps', '0x', '-$20-25'],
          ['+2x Multiple', '0%', '0 bps', '+2x', '+$30-40'],
          ['-2x Multiple', '0%', '0 bps', '-2x', '-$30-40'],
        ],
      },
    };

    // Generate scenarios memo
    const scenariosMemo = {
      kind: 'memo' as const,
      spec: {
        sections: [
          {
            title: 'Forecast Scenarios',
            bullets: [
              'Base Case (55% probability): Moderate growth with stable margins',
              'Bull Case (25% probability): Accelerated growth with margin expansion',
              'Bear Case (20% probability): Slower growth with margin compression',
            ],
          },
          {
            title: 'Key Assumptions',
            bullets: [
              `Revenue Growth: ${sectorDefaults.revenueGrowth} (Assumed: Tech sector defaults)`,
              `EBITDA Margin: ${sectorDefaults.margin} (Assumed: Tech sector defaults)`,
              `Valuation Multiple: ${sectorDefaults.multiple} (Assumed: Tech sector defaults)`,
            ],
          },
        ],
      },
    };

    return {
      intent,
      modelsToCreate,
      assumptions: [
        {
          key: 'Base Case Revenue Growth',
          value: sectorDefaults.revenueGrowth,
          rationale: 'Assumed: Tech sector defaults (data not available)',
        },
        {
          key: 'Base Case EBITDA Margin',
          value: sectorDefaults.margin,
          rationale: 'Assumed: Tech sector defaults (data not available)',
        },
        {
          key: 'Valuation Multiple',
          value: sectorDefaults.multiple,
          rationale: 'Assumed: Tech sector defaults (data not available)',
        },
      ],
      outputs: [projectionTable, fanChart, sensitivityTable, scenariosMemo],
      confidence: 'Low',
      dataCoverage: {
        price: tickers.length > 0,
        fundamentals: false,
        news: false,
        macro: false,
      },
      warnings: [
        'Limited data available - using assumption-based ranges',
        'All forecasts use sector defaults - provide ticker for company-specific analysis',
        'Review all assumptions before finalizing model',
        ...(tickers.length === 0 ? ['No ticker detected in prompt - provide ticker for more accurate analysis'] : []),
      ],
    };
  }

  // If no models proposed (e.g., MARKET_BRIEF), ensure we have at least a memo output
  const outputs = modelsToCreate.length > 0
    ? [
        {
          kind: 'memo' as const,
          spec: {
            sections: [
              {
                title: 'Recommended Approach',
                bullets: [
                  modelsToCreate.map((m) => `Build ${m.modelType} model`).join(', '),
                  'Use assumption-based ranges where data is missing',
                  'Review and refine assumptions before finalizing model',
                ],
              },
            ],
          },
        },
      ]
    : [
        {
          kind: 'memo' as const,
          spec: {
            sections: [
              {
                title: 'Analysis Approach',
                bullets: [
                  'Analyze market trends and news impact',
                  'Identify key drivers of the move',
                  'Assess forward-looking implications',
                ],
              },
            ],
          },
        },
      ];

  return {
    intent,
    modelsToCreate,
    assumptions: [
      {
        key: 'Base case scenario',
        value: 'Assumed: Use historical trends as baseline (15-25% range)',
        rationale: 'Standard approach when data is limited',
      },
    ],
    outputs,
    confidence: 'Low',
    dataCoverage: {
      price: tickers.length > 0,
      fundamentals: tickers.length > 0,
      news: false,
      macro: false,
    },
    warnings: [
      'Limited data available - using assumption-based ranges',
      'Review all assumptions before finalizing model',
      ...(tickers.length === 0 ? ['No ticker detected in prompt - provide ticker for more accurate analysis'] : []),
    ],
  };
}

/**
 * Main pipeline function
 * Takes a prompt and returns structured output
 */
export async function runPipelineAgent(prompt: string, traceId?: string): Promise<AgentPipelineOutput> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new Error('Prompt cannot be empty');
  }

  const logTraceId = traceId || 'no-trace-id';
  logger.warn({ prompt: trimmed.substring(0, 100), traceId: logTraceId }, 'Pipeline agent started');

  try {
    const llmOutput = await generatePipelineOutput(trimmed);
    if (llmOutput) {
      logger.warn({ traceId: logTraceId, intent: llmOutput.intent }, 'Pipeline agent completed (LLM)');
      return llmOutput;
    }

    // Fallback to rule-based output
    logger.warn({ prompt: trimmed.substring(0, 100), traceId: logTraceId }, 'Using fallback pipeline output');
    const fallback = generateFallbackOutput(trimmed);
    logger.warn({ traceId: logTraceId, intent: fallback.intent }, 'Pipeline agent completed (fallback)');
    return fallback;
  } catch (error) {
    logger.error({ prompt: trimmed.substring(0, 100), traceId: logTraceId, error: error instanceof Error ? error.message : String(error) }, 'Pipeline agent failed');
    throw error;
  }
}

