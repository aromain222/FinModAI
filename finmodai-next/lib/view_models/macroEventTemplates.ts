/**
 * Strict Macro Event Templates
 * Replaces freeform LLM output with structured JSON templates
 */

import { z } from 'zod';
import OpenAI from 'openai';
import { ENV } from '@/lib/env/server';

export type MacroEventCategory = 'CPI' | 'FED' | 'JOBS' | 'OIL' | 'GEOPOLITICS';

export const MacroEventTemplateSchema = z.object({
  category: z.enum(['CPI', 'FED', 'JOBS', 'OIL', 'GEOPOLITICS']),
  eventTitle: z.string().max(120),
  whatHappened: z.object({
    oneLine: z.string().max(110),
    details: z.array(z.string()).max(4),
  }),
  marketImpact: z.array(
    z.object({
      bucket: z.enum(['Equities', 'Rates', 'USD/FX', 'Commodities']),
      shortTerm: z.string().max(150),
      watch: z.string().max(100),
    })
  ).length(4),
  winnersLosers: z.object({
    sectorsUp: z.array(z.string()).min(1).max(6),
    sectorsDown: z.array(z.string()).min(1).max(6),
    stocksToWatch: z.array(
      z.object({
        ticker: z.string(),
        why: z.string().max(80),
      })
    ).min(3).max(6),
  }),
  scenarios: z.array(
    z.object({
      name: z.enum(['Base', 'Upside', 'Tail']),
      prob: z.number().min(0).max(100),
      assumptions: z.array(z.string()).max(3),
      assetMoves: z.object({
        SPY: z.string().max(30),
        VIX: z.string().max(30),
        '10Y': z.string().max(30),
        WTI: z.string().max(30),
        Gold: z.string().max(30),
      }),
    })
  ).length(3).refine(
    (scenarios) => scenarios.reduce((sum, s) => sum + s.prob, 0) === 100,
    { message: 'Probabilities must sum to 100' }
  ),
  confidence: z.enum(['Low', 'Medium', 'High']),
  sources: z.array(
    z.object({
      name: z.string(),
      url: z.string(),
    })
  ).min(1),
});

export type MacroEventTemplate = z.infer<typeof MacroEventTemplateSchema>;

export type TemplateInputs = {
  headlineText: string;
  macroData?: {
    cpi?: number | null;
    unemployment?: number | null;
    fedFunds?: number | null;
  };
  marketData?: {
    spyReturn?: number | null;
    oilMove?: number | null;
    ratesMove?: number | null;
  };
  sources?: Array<{ name: string; url?: string }>;
  publishedAt?: string;
};

/**
 * Build prompt for template generation
 */
function buildTemplatePrompt(
  category: MacroEventCategory,
  inputs: TemplateInputs
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are a macro strategist generating structured event analysis. You MUST return valid JSON conforming to the exact schema.

CRITICAL RULES:
1. eventTitle: max 120 chars, concise and specific
2. whatHappened.oneLine: max 110 chars, single sentence summary - USE DECISIVE LANGUAGE (avoid "may/could/might")
3. whatHappened.details: max 4 bullets, each concise - STATE FACTS, not possibilities
4. marketImpact: exactly 4 buckets (Equities, Rates, USD/FX, Commodities), each with shortTerm (max 150 chars) and watch (max 100 chars)
   - shortTerm: Use "typically" for general mechanisms, name specific sectors/tickers
   - watch: Start with "Watch for confirmation via:" if uncertain
5. winnersLosers:
   - sectorsUp: REQUIRED 2-4 sectors (e.g., ["XLE", "XOM", "CVX"])
   - sectorsDown: REQUIRED 2-4 sectors (e.g., ["XLU", "XLRE"])
   - stocksToWatch: REQUIRED 3-6 tickers with why (max 80 chars each)
6. scenarios: exactly 3 (Base, Upside, Tail), probabilities sum to 100
   - Each scenario MUST have 1-2 assumptions that name KEY VARIABLES that would flip the scenario
   - assumptions: Be specific (e.g., "Core CPI exceeds 3.5%", "Fed signals 3 cuts")
7. assetMoves: concise directional claims (e.g., "SPY +2%", "VIX +5", "10Y +15bp", "WTI +$3", "Gold -$10")
8. confidence: Low if limited data, Medium if moderate data, High if comprehensive data
9. sources: at least 1 source with name and url

PHRASING RULES:
- Replace "may/could/might" with "typically" when describing general transmission
- Use "Most sensitive sectors:" format for sector calls
- If data is missing, state "No confirming data; using typical market transmission"
- NEVER invent numbers or facts not in provided data
- Be decisive: state what typically happens, not what might happen

Return ONLY valid JSON, no markdown, no code blocks.`;

  const marketContext = inputs.marketData
    ? [
        inputs.marketData.spyReturn !== null ? `SPY return: ${inputs.marketData.spyReturn.toFixed(2)}%` : null,
        inputs.marketData.oilMove !== null ? `Oil move: ${inputs.marketData.oilMove.toFixed(2)}%` : null,
        inputs.marketData.ratesMove !== null ? `Rates move: ${inputs.marketData.ratesMove.toFixed(2)}bp` : null,
      ].filter(Boolean).join(', ')
    : 'Market data unavailable';

  const macroContext = inputs.macroData
    ? [
        inputs.macroData.cpi !== null ? `CPI: ${inputs.macroData.cpi.toFixed(2)}%` : null,
        inputs.macroData.unemployment !== null ? `Unemployment: ${inputs.macroData.unemployment.toFixed(2)}%` : null,
        inputs.macroData.fedFunds !== null ? `Fed Funds: ${inputs.macroData.fedFunds.toFixed(2)}%` : null,
      ].filter(Boolean).join(', ')
    : 'Macro data unavailable';

  const dataWarning = (!inputs.macroData || (!inputs.macroData.cpi && !inputs.macroData.unemployment && !inputs.macroData.fedFunds)) && 
                      (!inputs.marketData || (!inputs.marketData.spyReturn && !inputs.marketData.oilMove && !inputs.marketData.ratesMove))
    ? '\n\nWARNING: Limited data available. You MUST state "No confirming data; using typical market transmission" in whatHappened.details if data is missing. Do NOT invent numbers or facts not provided.'
    : '';

  const userPrompt = `Generate a structured macro event analysis for category: ${category}

Headline: ${inputs.headlineText}
Market Context: ${marketContext}
Macro Data: ${macroContext}
Sources: ${inputs.sources?.map(s => s.name).join(', ') || 'Unknown'}${dataWarning}

CRITICAL: Use ONLY the data provided above. If a value is "unavailable" or null, you MUST acknowledge this. Do NOT invent numbers, dates, or facts not in the provided data.

Return JSON conforming to the schema.`;

  return { systemPrompt, userPrompt };
}

/**
 * Generate template-specific content based on category
 */
function getCategorySpecificGuidance(category: MacroEventCategory): string {
  const guidance: Record<MacroEventCategory, string> = {
    CPI: `Focus on inflation implications for Fed policy and real rates. Equities: duration-sensitive assets (QQQ, XLK) vs value. Rates: front-end yields and real rates. Commodities: gold (GLD) on real rates. Stocks to watch: XLU, XLRE, QQQ, GLD, TLT.`,
    FED: `Focus on monetary policy signals and rate expectations. Equities: rate-sensitive sectors (XLU, XLRE) vs growth. Rates: yield curve shape and policy path. Commodities: gold on real rates. Stocks to watch: JPM, BAC, XLU, XLRE, QQQ.`,
    JOBS: `Focus on labor market strength and wage pressure. Equities: cyclicals (XLY, XLI) vs defensives. Rates: Fed reaction function. Commodities: oil on demand, gold on policy. Stocks to watch: XLY, XLI, XLP, XLV, XLE.`,
    OIL: `Focus on supply/demand dynamics and inflation spillovers. Equities: energy (XLE) vs airlines (DAL, UAL). Rates: inflation implications. Commodities: crude and refined products. Stocks to watch: XLE, XOM, CVX, DAL, UAL, IYT.`,
    GEOPOLITICS: `Focus on risk premium and safe-haven flows. Equities: defense (LMT, RTX) vs high-beta. Rates: risk-off flows. Commodities: oil and gold. Stocks to watch: LMT, RTX, NOC, XLE, GLD, IWM.`,
  };
  return guidance[category];
}

/**
 * Generate event template using LLM with strict validation
 */
export async function generateEventTemplate(
  category: MacroEventCategory,
  inputs: TemplateInputs,
  attempt: number = 1,
  deterministic: boolean = false
): Promise<MacroEventTemplate | null> {
  if (!ENV.OPENAI_API_KEY) {
    console.warn('OpenAI API key not configured, skipping template generation');
    return null;
  }

  const openai = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });
  const { systemPrompt, userPrompt } = buildTemplatePrompt(category, inputs);
  const categoryGuidance = getCategorySpecificGuidance(category);

  const fullUserPrompt = `${userPrompt}\n\nCategory-specific guidance:\n${categoryGuidance}\n\nReturn ONLY valid JSON.`;

  try {
    const response = await openai.chat.completions.create({
      model: ENV.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: fullUserPrompt },
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
    const validated = MacroEventTemplateSchema.safeParse(parsed);

    if (!validated.success) {
      console.warn('Template validation failed:', validated.error);
      
      // Retry once with repair prompt
      if (attempt === 1) {
        const repairPrompt = `${fullUserPrompt}\n\nPrevious attempt failed validation. Errors: ${JSON.stringify(validated.error.errors)}. Please fix and return valid JSON.`;
        return generateEventTemplate(category, inputs, 2, deterministic);
      }
      
      return null;
    }

    // Apply post-processing if deterministic mode
    let processed = validated.data;
    if (deterministic) {
      const { applyPhrasingRules, addDataDisclaimers, validateTemplateCompleteness } = await import('./macroEventPhrasing');
      const hasMacroData = !!(inputs.macroData?.cpi !== null || inputs.macroData?.unemployment !== null || inputs.macroData?.fedFunds !== null);
      const hasMarketData = !!(inputs.marketData?.spyReturn !== null || inputs.marketData?.oilMove !== null || inputs.marketData?.ratesMove !== null);
      
      processed = applyPhrasingRules(processed, deterministic);
      processed = addDataDisclaimers(processed, hasMacroData, hasMarketData);
      
      // Validate completeness
      const validation = validateTemplateCompleteness(processed);
      if (!validation.valid) {
        console.warn('Template incomplete:', validation.missing);
        // Still return, but log warning
      }
    }

    return processed;
  } catch (error: any) {
    console.error('Template generation failed:', error);
    
    // Retry once on error
    if (attempt === 1) {
      return generateEventTemplate(category, inputs, 2, deterministic);
    }
    
    return null;
  }
}

/**
 * Fallback template generator (deterministic, no LLM)
 */
export function generateFallbackTemplate(
  category: MacroEventCategory,
  inputs: TemplateInputs
): MacroEventTemplate {
  const baseTitle = inputs.headlineText.length > 120 
    ? inputs.headlineText.substring(0, 117) + '...'
    : inputs.headlineText;

  const baseTemplate: MacroEventTemplate = {
    category,
    eventTitle: baseTitle,
    whatHappened: {
      oneLine: `Market event in ${category} category affecting macro conditions.`,
      details: [
        'Event details based on headline information',
        'Market implications to be determined',
      ],
    },
    marketImpact: [
      {
        bucket: 'Equities',
        shortTerm: 'Equity markets responding to event',
        watch: 'Sector rotation and style performance',
      },
      {
        bucket: 'Rates',
        shortTerm: 'Rate markets adjusting',
        watch: 'Yield curve movements',
      },
      {
        bucket: 'USD/FX',
        shortTerm: 'Currency markets reacting',
        watch: 'Dollar strength and EM currencies',
      },
      {
        bucket: 'Commodities',
        shortTerm: 'Commodity markets responding',
        watch: 'Oil and gold price movements',
      },
    ],
    winnersLosers: {
      sectorsUp: ['XLE'],
      sectorsDown: ['XLU'],
      stocksToWatch: [
        { ticker: 'SPY', why: 'Broad market indicator' },
        { ticker: 'QQQ', why: 'Growth exposure' },
        { ticker: 'XLE', why: 'Energy sector' },
      ],
    },
    scenarios: [
      {
        name: 'Base',
        prob: 60,
        assumptions: ['Event unfolds as expected', 'Markets adjust gradually'],
        assetMoves: {
          SPY: 'SPY +1%',
          VIX: 'VIX +2',
          '10Y': '10Y +5bp',
          WTI: 'WTI +$1',
          Gold: 'Gold +$5',
        },
      },
      {
        name: 'Upside',
        prob: 25,
        assumptions: ['Positive resolution', 'Risk-on flows'],
        assetMoves: {
          SPY: 'SPY +3%',
          VIX: 'VIX -3',
          '10Y': '10Y +10bp',
          WTI: 'WTI +$2',
          Gold: 'Gold -$5',
        },
      },
      {
        name: 'Tail',
        prob: 15,
        assumptions: ['Adverse outcome', 'Risk-off flows'],
        assetMoves: {
          SPY: 'SPY -2%',
          VIX: 'VIX +8',
          '10Y': '10Y -10bp',
          WTI: 'WTI -$2',
          Gold: 'Gold +$15',
        },
      },
    ],
    confidence: inputs.macroData || inputs.marketData ? 'Medium' : 'Low',
    sources: inputs.sources && inputs.sources.length > 0
      ? inputs.sources
      : [{ name: 'Unknown', url: '' }],
  };

  // Category-specific customizations
  if (category === 'CPI') {
    baseTemplate.winnersLosers.stocksToWatch = [
      { ticker: 'XLU', why: 'Rate-sensitive utilities' },
      { ticker: 'XLRE', why: 'Real estate sensitivity' },
      { ticker: 'QQQ', why: 'Duration exposure' },
      { ticker: 'GLD', why: 'Real rates impact' },
    ];
  } else if (category === 'FED') {
    baseTemplate.winnersLosers.stocksToWatch = [
      { ticker: 'JPM', why: 'Bank margins' },
      { ticker: 'XLU', why: 'Rate sensitivity' },
      { ticker: 'XLRE', why: 'REIT exposure' },
      { ticker: 'QQQ', why: 'Growth impact' },
    ];
  } else if (category === 'JOBS') {
    baseTemplate.winnersLosers.stocksToWatch = [
      { ticker: 'XLY', why: 'Consumer discretionary' },
      { ticker: 'XLI', why: 'Industrial exposure' },
      { ticker: 'XLP', why: 'Defensive positioning' },
    ];
  } else if (category === 'OIL') {
    baseTemplate.winnersLosers.stocksToWatch = [
      { ticker: 'XLE', why: 'Energy sector' },
      { ticker: 'XOM', why: 'Oil major' },
      { ticker: 'DAL', why: 'Airlines cost impact' },
      { ticker: 'IYT', why: 'Transport costs' },
    ];
  } else if (category === 'GEOPOLITICS') {
    baseTemplate.winnersLosers.stocksToWatch = [
      { ticker: 'LMT', why: 'Defense contractor' },
      { ticker: 'RTX', why: 'Aerospace defense' },
      { ticker: 'XLE', why: 'Energy risk premium' },
      { ticker: 'GLD', why: 'Safe haven' },
    ];
  }

  return baseTemplate;
}

