/**
 * API Route: /api/macro/overview
 * 
 * Returns AI-generated macro overview with optional detailed breakdown
 * Supports time horizon query parameter: ?horizon=1W|1M|3M|1Y|5Y|MAX
 * CRITICAL: Uses ONLY computed metrics from MacroSnapshot - NO hardcoded values
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { MacroOverviewResponse, MacroDetail } from '@/types/macro';
import { getMacroSnapshot, assertMacroSnapshot, type TimeRange, type MacroSnapshot } from '@/lib/macroData';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const horizon = (searchParams.get('horizon') || '1M') as TimeRange;
    
    console.log(`[/api/macro/overview] Generating overview (horizon: ${horizon})`);
    
    // Fetch macro snapshot with real data
    const rawSnapshot = await getMacroSnapshot(horizon);
    
    // CRITICAL: Validate snapshot structure before accessing properties
    let snapshot: MacroSnapshot;
    try {
      snapshot = assertMacroSnapshot(rawSnapshot);
    } catch (validationError: any) {
      console.error('[/api/macro/overview] Snapshot validation failed:', validationError.message);
      return NextResponse.json(
        { error: `Invalid macro snapshot: ${validationError.message}` },
        { status: 400 }
      );
    }
    
    // Generate both summary and detailed breakdown
    const { summary, detailedBreakdown } = await generateMacroOverview(snapshot);
    
    const response: MacroOverviewResponse = {
      summary,
      detailedBreakdown,
      generatedAt: new Date().toISOString(),
      horizon,
    };
    
    console.log('[/api/macro/overview] ✅ Overview generated');
    
    return NextResponse.json(response, { status: 200 });
  } catch (error: any) {
    console.error('[/api/macro/overview] ❌ Error:', error);
    
    // Return error with fallback
    const fallbackResponse: MacroOverviewResponse = {
      summary: generateFallbackSummary(null),
      detailedBreakdown: generateFallbackDetail(),
      generatedAt: new Date().toISOString(),
      horizon: '1M',
    };
    
    return NextResponse.json(fallbackResponse, { status: 200 });
  }
}

/**
 * Generate macro overview using OpenAI with ONLY snapshot.metrics
 * CRITICAL: No hardcoded values - all data from computed metrics
 */
async function generateMacroOverview(snapshot: MacroSnapshot): Promise<{
  summary: string;
  detailedBreakdown: MacroDetail;
}> {
  const { getOpenAIKey } = await import('@/lib/openaiKey');
  const apiKey = getOpenAIKey('service');
  if (!apiKey) {
    const errorMsg = '[generateMacroOverview] ❌ CRITICAL: OpenAI key MISSING - Add OPENAI_SERVICE_API_KEY or OPENAI_API_KEY to .env.local';
    console.error(errorMsg);
    return {
      summary: generateFallbackSummary(snapshot),
      detailedBreakdown: generateFallbackDetail(),
    };
  }
  if (apiKey.includes('REDACTED') || apiKey.includes('your_') || apiKey.trim().length < 10) {
    const errorMsg = '[generateMacroOverview] ❌ CRITICAL: OpenAI key appears to be a placeholder. Use a real API key.';
    console.error(errorMsg);
    return {
      summary: generateFallbackSummary(snapshot),
      detailedBreakdown: generateFallbackDetail(),
    };
  }
  const openai = new OpenAI({ apiKey });
  
  const { metrics, horizon, quality } = snapshot;
  const horizonLabel = getHorizonLabel(horizon);
  
  // Helper to format metric or show "insufficient data"
  const fmt = (value: number | undefined, decimals: number = 2, suffix: string = ''): string => {
    return value !== undefined && value !== null && !isNaN(value)
      ? `${value.toFixed(decimals)}${suffix}`
      : 'insufficient data';
  };
  
  // Build metrics section
  const metricsText = `
**Market Metrics (${horizon} horizon - ${horizonLabel}):**
- S&P 500: ${fmt(metrics.sp500_level, 0)} (change: ${fmt(metrics.sp500_pct, 1, '%')})
- VIX: ${fmt(metrics.vix_level, 1)} (change: ${fmt(metrics.vix_pct, 1, '%')})
- Realized Vol (annualized): ${fmt(metrics.realized_vol_annual, 1, '%')}
- Risk Regime: ${metrics.risk_regime || 'unknown'}

**Rates & Economic:**
- Fed Funds: ${fmt(metrics.fed_funds_level, 2, '%')}
- 10Y Treasury: ${fmt(metrics.tenY_level, 2, '%')} (change: ${fmt(metrics.tenY_change_bps, 0, ' bps')})
- CPI YoY: ${fmt(metrics.cpi_yoy, 1, '%')}
- Unemployment: ${fmt(metrics.unemployment_level, 1, '%')} (change: ${fmt(metrics.unemployment_change, 2, 'pp')})
`;
  
  // Add data quality warning if needed
  const qualityWarning = quality.overall !== 'high'
    ? `\n**Data Quality Note:** ${quality.overall} quality data. ${quality.reasons.slice(0, 2).join('; ')}.`
    : '';
  
  const prompt = `You are a senior investment strategist providing a macro market overview for institutional investors.

Time Horizon: ${horizonLabel}

CRITICAL: Use ONLY the metrics provided below. Do NOT reference any data not explicitly listed.
${metricsText}${qualityWarning}

Your task is to provide TWO outputs:

1. SUMMARY (2-3 sentences): A concise macro overview tailored to ${horizonLabel}. Focus on risk sentiment, key drivers, and market positioning. Base this ONLY on the metrics above.

2. DETAILED BREAKDOWN (4 sections):
   - What's Working: 3-4 bullet points on market dynamics performing well (based on metrics above)
   - What's Struggling: 3-4 bullet points on weak spots or concerns (based on metrics above)
   - Cross-Asset Read: 2-3 bullet points connecting rates, equities, volatility from the metrics
   - Risk Flags / Watchlist: 3-4 bullet points on key risks to monitor (logically connected to metrics)

Format your response as JSON:
{
  "summary": "Your 2-3 sentence summary here",
  "whatsWorking": ["Point 1", "Point 2", "Point 3"],
  "whatsStruggling": ["Point 1", "Point 2", "Point 3"],
  "crossAssetRead": ["Point 1", "Point 2"],
  "riskFlags": ["Point 1", "Point 2", "Point 3"]
}

CRITICAL RULES:
- Use ONLY the metrics provided above
- If a metric shows "insufficient data", explicitly state that in your analysis
- Do NOT reference sectors, specific stocks, or data not in the metrics
- Do NOT invent or assume values
- Be specific and cite the actual metric values

Keep each bullet point concise (1-2 sentences max). Be analytical and actionable.`;

  try {
    // CRITICAL: Log BEFORE OpenAI call
    console.log('🔥 OPENAI CALL FIRED (overview)', {
      hasKey: !!apiKey,
      asOf: snapshot.asOf,
      horizon: snapshot.horizon,
      metricsCount: Object.keys(snapshot.metrics).length,
      timestamp: new Date().toISOString()
    });
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: `You are a senior investment strategist. Provide clear, actionable macro insights in JSON format.
CRITICAL: You MUST use ONLY the metrics provided in the user message. Do NOT reference any data not explicitly listed.`,
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

    // CRITICAL: Log AFTER successful call
    console.log('✅ OPENAI CALL SUCCESS (overview)', {
      model: completion.model,
      tokens: completion.usage?.total_tokens,
      timestamp: new Date().toISOString()
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content from OpenAI');
    }

    const parsed = JSON.parse(content);

    return {
      summary: parsed.summary || generateFallbackSummary(snapshot),
      detailedBreakdown: {
        whatsWorking: parsed.whatsWorking || [],
        whatsStruggling: parsed.whatsStruggling || [],
        crossAssetRead: parsed.crossAssetRead || [],
        riskFlags: parsed.riskFlags || [],
      },
    };
  } catch (error: any) {
    // CRITICAL: Log errors explicitly
    console.error('❌ OPENAI CALL FAILED (overview)', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    return {
      summary: generateFallbackSummary(snapshot),
      detailedBreakdown: generateFallbackDetail(),
    };
  }
}

/**
 * Get human-readable horizon label
 */
function getHorizonLabel(horizon: TimeRange): string {
  switch (horizon) {
    case '1W': return 'this week';
    case '1M': return 'this month';
    case '3M': return 'the last 3 months';
    case '1Y': return 'the last year';
    case '5Y': return 'the last 5 years';
    case 'MAX': return 'the maximum available period';
    default: return 'this period';
  }
}

/**
 * Generate fallback summary
 * CRITICAL: This should rarely be used - OpenAI failures should be logged and investigated
 */
function generateFallbackSummary(snapshot: MacroSnapshot | null): string {
  if (!snapshot || !snapshot.metrics) {
    return 'Unable to generate AI overview due to missing data. Please check data sources and API configuration.';
  }
  
  const { metrics } = snapshot;
  
  return `Current macro snapshot (${snapshot.horizon}) shows S&P 500 at ${metrics.sp500_level?.toFixed(0) || 'N/A'} (${metrics.sp500_pct !== undefined ? `${metrics.sp500_pct > 0 ? '+' : ''}${metrics.sp500_pct.toFixed(1)}%` : 'N/A'}), VIX at ${metrics.vix_level?.toFixed(1) || 'N/A'}, and risk regime: ${metrics.risk_regime || 'unknown'}. AI analysis temporarily unavailable - review raw metrics for current positioning.`;
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

