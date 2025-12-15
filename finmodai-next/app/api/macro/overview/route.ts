/**
 * API Route: /api/macro/overview
 * 
 * Returns AI-generated macro overview with optional detailed breakdown
 * Supports time horizon query parameter: ?horizon=1D|1W|1M|6M|1Y|5Y
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { MacroOverviewResponse, MacroDetail, TimeRange } from '@/types/macro';

export const dynamic = 'force-dynamic';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const horizon = (searchParams.get('horizon') || '1M') as TimeRange;
    
    console.log(`[/api/macro/overview] Generating overview (horizon: ${horizon})`);
    
    // Generate both summary and detailed breakdown
    const { summary, detailedBreakdown } = await generateMacroOverview(horizon);
    
    const response: MacroOverviewResponse = {
      summary,
      detailedBreakdown,
      generatedAt: new Date().toISOString(),
      horizon,
    };
    
    console.log('[/api/macro/overview] ✅ Overview generated');
    
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[/api/macro/overview] ❌ Error:', error);
    
    // Return fallback data
    const fallbackResponse: MacroOverviewResponse = {
      summary: generateFallbackSummary(),
      detailedBreakdown: generateFallbackDetail(),
      generatedAt: new Date().toISOString(),
      horizon: '1M',
    };
    
    return NextResponse.json(fallbackResponse, { status: 200 });
  }
}

/**
 * Generate macro overview using OpenAI
 */
async function generateMacroOverview(horizon: TimeRange): Promise<{
  summary: string;
  detailedBreakdown: MacroDetail;
}> {
  const horizonLabel = getHorizonLabel(horizon);
  
  const prompt = `You are a senior investment strategist providing a macro market overview for institutional investors.

Time Horizon: ${horizonLabel}

Current Macro Context:
- Fed Funds Rate: 5.33%
- 10Y Treasury: 4.45%
- CPI (YoY): 3.2%
- Unemployment: 3.9%
- S&P 500: ~4,800
- VIX: ~13

Your task is to provide TWO outputs:

1. SUMMARY (2-3 sentences): A concise macro overview tailored to ${horizonLabel}. Focus on risk sentiment, key drivers, and market positioning.

2. DETAILED BREAKDOWN (4 sections):
   - What's Working: 3-4 bullet points on assets/sectors performing well over ${horizonLabel}
   - What's Struggling: 3-4 bullet points on weak spots or underperformers
   - Cross-Asset Read: 2-3 bullet points connecting rates, equities, volatility, and macro themes
   - Risk Flags / Watchlist: 3-4 bullet points on key risks to monitor

Format your response as JSON:
{
  "summary": "Your 2-3 sentence summary here",
  "whatsWorking": ["Point 1", "Point 2", "Point 3"],
  "whatsStruggling": ["Point 1", "Point 2", "Point 3"],
  "crossAssetRead": ["Point 1", "Point 2"],
  "riskFlags": ["Point 1", "Point 2", "Point 3"]
}

Keep each bullet point concise (1-2 sentences max). Be specific and actionable.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are a senior investment strategist. Provide clear, actionable macro insights in JSON format.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content from OpenAI');
    }

    const parsed = JSON.parse(content);

    return {
      summary: parsed.summary || generateFallbackSummary(),
      detailedBreakdown: {
        whatsWorking: parsed.whatsWorking || [],
        whatsStruggling: parsed.whatsStruggling || [],
        crossAssetRead: parsed.crossAssetRead || [],
        riskFlags: parsed.riskFlags || [],
      },
    };
  } catch (error) {
    console.error('[generateMacroOverview] OpenAI failed:', error);
    return {
      summary: generateFallbackSummary(),
      detailedBreakdown: generateFallbackDetail(),
    };
  }
}

/**
 * Get human-readable horizon label
 */
function getHorizonLabel(horizon: TimeRange): string {
  switch (horizon) {
    case '1D': return 'today';
    case '1W': return 'this week';
    case '1M': return 'this month';
    case '6M': return 'the last 6 months';
    case '1Y': return 'the last year';
    case '5Y': return 'the last 5 years';
    default: return 'this period';
  }
}

/**
 * Generate fallback summary
 */
function generateFallbackSummary(): string {
  return 'Current macro conditions reflect a balanced environment with stable rates and moderate volatility. The Fed\'s policy stance remains data-dependent, with inflation trending toward target levels. Risk sentiment is constructive, though investors remain selective given elevated valuations.';
}

/**
 * Generate fallback detailed breakdown
 */
function generateFallbackDetail(): MacroDetail {
  return {
    whatsWorking: [
      'Large-cap tech continues to outperform on AI-driven earnings growth',
      'Credit spreads remain tight, reflecting healthy corporate fundamentals',
      'Energy sector benefiting from supply discipline and stable demand',
    ],
    whatsStruggling: [
      'Small-cap stocks facing margin pressure from higher rates',
      'Regional banks dealing with deposit flight and commercial real estate exposure',
      'Consumer discretionary showing signs of weakness as savings rates normalize',
    ],
    crossAssetRead: [
      'Treasury curve steepening suggests markets pricing in eventual Fed cuts',
      'Low VIX despite geopolitical risks indicates complacency or strong put-buying',
      'Dollar weakness supporting EM assets and commodity-linked currencies',
    ],
    riskFlags: [
      'Inflation persistence could force Fed to maintain restrictive policy longer',
      'Geopolitical tensions (Middle East, China-Taiwan) remain elevated',
      'Commercial real estate stress may spill over to broader financial system',
      'Fiscal sustainability concerns as deficits remain elevated',
    ],
  };
}

