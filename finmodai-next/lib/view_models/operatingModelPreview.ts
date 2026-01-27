/**
 * Operating Model Preview
 * Generates FP&A-style snapshot of company operating model
 * Works even without historical financials
 * 
 * Uses unified schema from lib/schemas/modelPreview.ts
 */

import OpenAI from 'openai';
import { ENV } from '@/lib/env/server';
import { getSectorHeuristics, safeFetchPreviewData, ensureNarrativeValue } from '@/lib/preview/previewSafety';
import {
  type OperatingPreview,
  OperatingPreviewSchema,
  buildDefaultOperatingPreview,
  parseModelPreview,
} from '@/lib/schemas/modelPreview';

// Simple logger for preview operations
const logger = {
  warn: (data: any, message: string) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[OperatingModelPreview] ${message}:`, data);
    }
  },
  error: (data: any, message: string) => {
    console.error(`[OperatingModelPreview] ${message}:`, data);
  },
};

// Re-export for backward compatibility
export type OperatingModelPreview = OperatingPreview;

export type OperatingModelInputs = {
  ticker: string;
  sector?: string;
  marketCap?: number | null;
  revenue?: number | null;
  cash?: number | null;
  burnRate?: number | null;
};

/**
 * Generate operating model preview using LLM
 * SAFETY RULE: Never returns null - always provides fallback preview
 */
export async function generateOperatingModelPreview(
  inputs: OperatingModelInputs
): Promise<OperatingModelPreview> {
  // SAFETY RULE: Never return null - always provide fallback
  const sector = inputs.sector || 'Technology';
  const heuristics = getSectorHeuristics(sector);
  
  // SAFETY RULE: If API fails, use heuristics - never show empty state
  return safeFetchPreviewData(
    async () => {
      if (!ENV.OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured');
      }

      const openai = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });
      const hasFinancials = !!(inputs.revenue || inputs.cash || inputs.burnRate);
      
      const systemPrompt = `You are a FP&A analyst generating an operating model preview for a company. 
You MUST return valid JSON conforming to the exact schema.

CRITICAL RULES:
1. headline: max 200 chars, concise summary of operating model status
2. runway.cashMonths: number (0-120), estimate based on cash/burn or typical for sector
3. runway.burnRate: string like "$20-30M/month" or "N/A if profitable"
4. operatingTrend: three strings describing revenue, margin, opex trends (use ranges/qualitative)
5. keyDrivers: 3-5 bullet points of main operating drivers
6. sensitivities: 2-5 variables with impact (e.g., "+5% revenue → +2 months runway")
7. managementQuestions: 2-4 strategic questions management should address
8. confidence: Low if no data, Medium if partial data, High if comprehensive data

PHRASING RULES:
- Use realistic SaaS/growth-company logic if sector unknown
- Cash runway should be bucketed (e.g., "12-18 months" → use 15 as cashMonths)
- Burn rate expressed as range ("$20-30M/month")
- Never include raw tables or numbers without context
- If no financials available, use sector-typical assumptions

Return ONLY valid JSON, no markdown, no code blocks.`;

      const dataContext = hasFinancials
        ? `
Available Financial Data:
${inputs.marketCap ? `Market Cap: $${(inputs.marketCap / 1e9).toFixed(1)}B` : ''}
${inputs.revenue ? `Revenue: $${(inputs.revenue / 1e6).toFixed(0)}M` : 'Revenue: Not available'}
${inputs.cash ? `Cash: $${(inputs.cash / 1e6).toFixed(0)}M` : 'Cash: Not available'}
${inputs.burnRate ? `Burn Rate: $${(inputs.burnRate / 1e6).toFixed(0)}M/month` : 'Burn Rate: Not available'}
`
        : `
No historical financials available. Use realistic assumptions for a ${sector} company:
- Typical growth-stage SaaS: 20-40% revenue growth, 60-80% gross margin, $10-50M burn
- Typical mature tech: 10-20% growth, 70-85% margin, profitable or low burn
- Adjust based on sector if provided
`;

      const userPrompt = `Generate an operating model preview for ${inputs.ticker}${inputs.sector ? ` (${inputs.sector} sector)` : ''}.

${dataContext}

Generate a realistic operating model analysis. If data is missing, use sector-typical assumptions but mark confidence as "Low".

Return JSON conforming to this schema:
{
  "headline": string,
  "runway": { "cashMonths": number, "burnRate": string },
  "operatingTrend": { "revenue": string, "margin": string, "opex": string },
  "keyDrivers": string[],
  "sensitivities": [{ "variable": string, "impact": string }],
  "managementQuestions": string[],
  "confidence": "Low" | "Medium" | "High"
}`;

      const response = await openai.chat.completions.create({
        model: ENV.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1500,
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
      
      // Build a partial preview object that matches the unified schema
      // The LLM returns the old format, so we need to transform it
      const partialPreview = {
        id: crypto.randomUUID(),
        modelType: 'OPERATING' as const,
        createdAt: new Date().toISOString(),
        ticker: inputs.ticker.toUpperCase(),
        headline: parsed.headline || `Operating model analysis for ${inputs.ticker}`,
        confidence: parsed.confidence || 'Low',
        sources: [
          {
            provider: 'CapitalBase',
            status: hasFinancials ? 'live' : 'fallback',
            note: hasFinancials ? 'Using available financial data' : 'Using sector-typical assumptions',
          },
        ],
        assumptions: [
          { key: 'Sector', value: inputs.sector || 'Technology (assumed)' },
          ...(inputs.revenue ? [{ key: 'Revenue', value: `$${(inputs.revenue / 1e6).toFixed(0)}M` }] : []),
          ...(inputs.cash ? [{ key: 'Cash', value: `$${(inputs.cash / 1e6).toFixed(0)}M` }] : []),
        ],
        keyTakeaways: parsed.keyDrivers || [
          'Revenue growth rate and customer acquisition',
          'Gross margin expansion trajectory',
          'Operating leverage from scale',
        ],
        risks: [],
        runway: {
          cashMonths: parsed.runway?.cashMonths ?? heuristics.cashRunwayMonths,
          burnRate: parsed.runway?.burnRate || heuristics.burnRate,
        },
        operatingTrend: {
          revenue: parsed.operatingTrend?.revenue || heuristics.revenueGrowth,
          margin: parsed.operatingTrend?.margin || heuristics.marginTrend,
          opex: parsed.operatingTrend?.opex || heuristics.opexTrend,
        },
        sensitivities: parsed.sensitivities || [
          { variable: '+5% revenue growth', impact: '+2-3 months runway' },
          { variable: '-10% burn rate', impact: '+1-2 months runway' },
        ],
        managementQuestions: parsed.managementQuestions || [
          'What is the path to profitability?',
          'How sustainable is current growth rate?',
        ],
        visuals: [],
      };

      // Validate against unified schema
      const validated = OperatingPreviewSchema.safeParse(partialPreview);

      if (!validated.success) {
        logger.warn(
          { ticker: inputs.ticker, errors: validated.error.errors },
          'operating_model_preview_validation_failed'
        );
        throw new Error('Validation failed');
      }

      // SAFETY RULE: Ensure all values are narrative, not precise
      const safeData = validated.data;
      
      return {
        ...safeData,
        headline: ensureNarrativeValue(safeData.headline, `Operating model analysis for ${inputs.ticker}`, 'headline'),
        operatingTrend: {
          revenue: ensureNarrativeValue(safeData.operatingTrend.revenue, heuristics.revenueGrowth, 'revenue'),
          margin: ensureNarrativeValue(safeData.operatingTrend.margin, heuristics.marginTrend, 'margin'),
          opex: ensureNarrativeValue(safeData.operatingTrend.opex, heuristics.opexTrend, 'opex'),
        },
        runway: {
          cashMonths: safeData.runway.cashMonths ?? heuristics.cashRunwayMonths,
          burnRate: ensureNarrativeValue(safeData.runway.burnRate, heuristics.burnRate, 'burnRate'),
        },
      };
    },
    generateFallbackPreview(inputs), // Fallback always provided
    { ticker: inputs.ticker, sector: inputs.sector, operation: 'generateOperatingModelPreview' }
  );
}

/**
 * Generate fallback preview when LLM fails
 * Uses unified schema default builder
 */
export function generateFallbackPreview(inputs: OperatingModelInputs): OperatingModelPreview {
  return buildDefaultOperatingPreview(inputs.ticker);
}

