/**
 * Enrich Unified Assumptions
 * Uses AI to enhance and validate financial assumptions
 */

import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
}) : null;

export interface UnifiedAssumptions {
  ticker: string;
  companyName?: string;
  revenue?: number;
  revenueGrowth?: number;
  ebitdaMargin?: number;
  ebitMargin?: number;
  taxRate?: number;
  wacc?: number;
  terminalGrowth?: number;
  capexPctRevenue?: number;
  nwcPctRevenue?: number;
  netDebt?: number;
  sharesOutstanding?: number;
  sector?: string;
  [key: string]: any;
}

export interface EnrichedAssumptions extends UnifiedAssumptions {
  enriched: boolean;
  aiSuggestions?: string[];
  confidence?: 'high' | 'medium' | 'low';
}

/**
 * Enrich assumptions using AI
 */
export async function enrichUnifiedAssumptions(
  assumptions: UnifiedAssumptions
): Promise<EnrichedAssumptions> {
  // If no OpenAI key, return assumptions as-is with defaults
  if (!openai) {
    console.warn('[enrichUnifiedAssumptions] OpenAI API key not configured, using defaults');
    return {
      ...applyDefaults(assumptions),
      enriched: false,
      confidence: 'low'
    };
  }
  
  try {
    const prompt = buildEnrichmentPrompt(assumptions);
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a financial analyst helping to validate and improve financial model assumptions. Provide concise, actionable suggestions.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    });
    
    const aiResponse = completion.choices[0]?.message?.content || '';
    const suggestions = parseAISuggestions(aiResponse);
    
    return {
      ...applyDefaults(assumptions),
      enriched: true,
      aiSuggestions: suggestions,
      confidence: 'high'
    };
  } catch (error) {
    console.error('[enrichUnifiedAssumptions] AI enrichment failed:', error);
    return {
      ...applyDefaults(assumptions),
      enriched: false,
      confidence: 'medium'
    };
  }
}

/**
 * Build prompt for AI enrichment
 */
function buildEnrichmentPrompt(assumptions: UnifiedAssumptions): string {
  const { ticker, companyName, sector, revenue, revenueGrowth, ebitdaMargin, wacc } = assumptions;
  
  return `Review these financial assumptions for ${companyName || ticker}:

Sector: ${sector || 'Unknown'}
Revenue: ${revenue ? `$${(revenue / 1e6).toFixed(1)}M` : 'Not provided'}
Revenue Growth: ${revenueGrowth ? `${(revenueGrowth * 100).toFixed(1)}%` : 'Not provided'}
EBITDA Margin: ${ebitdaMargin ? `${(ebitdaMargin * 100).toFixed(1)}%` : 'Not provided'}
WACC: ${wacc ? `${(wacc * 100).toFixed(1)}%` : 'Not provided'}

Provide 2-3 brief suggestions to improve these assumptions. Focus on:
1. Reasonableness given the sector
2. Missing critical assumptions
3. Potential red flags

Keep each suggestion to one sentence.`;
}

/**
 * Parse AI suggestions from response
 */
function parseAISuggestions(response: string): string[] {
  const lines = response.split('\n').filter(line => line.trim().length > 0);
  const suggestions: string[] = [];
  
  for (const line of lines) {
    // Look for numbered or bulleted items
    const cleaned = line.replace(/^[\d\.\-\*\s]+/, '').trim();
    if (cleaned.length > 10 && cleaned.length < 200) {
      suggestions.push(cleaned);
    }
  }
  
  return suggestions.slice(0, 5); // Max 5 suggestions
}

/**
 * Apply default assumptions where missing
 */
function applyDefaults(assumptions: UnifiedAssumptions): UnifiedAssumptions {
  return {
    ...assumptions,
    revenueGrowth: assumptions.revenueGrowth ?? 0.08,
    ebitdaMargin: assumptions.ebitdaMargin ?? 0.25,
    taxRate: assumptions.taxRate ?? 0.25,
    wacc: assumptions.wacc ?? 0.10,
    terminalGrowth: assumptions.terminalGrowth ?? 0.025,
    capexPctRevenue: assumptions.capexPctRevenue ?? 0.04,
    nwcPctRevenue: assumptions.nwcPctRevenue ?? 0.10
  };
}
