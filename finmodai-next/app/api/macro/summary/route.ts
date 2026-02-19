/**
 * API Route: /api/macro/summary
 * 
 * Generates AI-powered market wrap using OpenAI
 * CRITICAL: Uses ONLY computed metrics from snapshot - NO hardcoded values
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { assertMacroSnapshot, type MacroSnapshot } from '@/lib/macroData';
import { getOpenAIKey } from '@/lib/openaiKey';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    console.log('[/api/macro/summary] Generating AI market wrap');
    
    const rawSnapshot = await req.json();
    
    // CRITICAL: Validate snapshot structure before accessing properties
    let snapshot: MacroSnapshot;
    try {
      snapshot = assertMacroSnapshot(rawSnapshot);
    } catch (validationError: any) {
      console.error('[/api/macro/summary] Snapshot validation failed:', validationError.message);
      return NextResponse.json(
        { error: `Invalid macro snapshot: ${validationError.message}` },
        { status: 400 }
      );
    }
    
    // CRITICAL: Validate OpenAI API key exists (service key for backend)
    const apiKey = getOpenAIKey('service');
    if (!apiKey) {
      console.error('[/api/macro/summary] OpenAI key MISSING - Cannot generate AI summary (set OPENAI_SERVICE_API_KEY or OPENAI_API_KEY)');
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }
    
    // Initialize OpenAI client
    const openai = new OpenAI({ apiKey });
    
    // Build prompt for OpenAI using ONLY snapshot.metrics
    const prompt = buildMarketWrapPrompt(snapshot);
    
    // CRITICAL: Log BEFORE OpenAI call to verify it's being made
    console.log('🔥 OPENAI CALL FIRED', {
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
          content: `You are a senior investment strategist writing a daily market wrap for institutional investors. 
Your tone is clear, direct, and analytical—like a Goldman Sachs or JPMorgan strategist.
Keep it concise (< 200 words), actionable, and focused on valuation implications.

CRITICAL: You MUST use ONLY the metrics provided in the user message. 
Do NOT reference any data not explicitly listed. 
If a metric is missing or null, state "insufficient data" for that metric.
Do NOT invent or assume values.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });
    
    // CRITICAL: Log AFTER successful call
    console.log('✅ OPENAI CALL SUCCESS', {
      model: completion.model,
      tokens: completion.usage?.total_tokens,
      timestamp: new Date().toISOString()
    });
    
    const summary = completion.choices[0]?.message?.content || 'Market summary unavailable.';
    
    return NextResponse.json({ summary }, { status: 200 });
    
  } catch (error: any) {
    // CRITICAL: Log errors explicitly (don't silently fallback)
    console.error('❌ OPENAI CALL FAILED', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // Return error instead of silent fallback
    return NextResponse.json(
      { 
        error: 'AI summary generation failed', 
        details: error.message,
        fallback: generateFallbackSummary(null)
      },
      { status: 500 }
    );
  }
}

/**
 * Build prompt for OpenAI market wrap using ONLY snapshot.metrics
 * CRITICAL: No hardcoded values - all data from computed metrics
 */
function buildMarketWrapPrompt(snapshot: MacroSnapshot): string {
  const { metrics, horizon, quality } = snapshot;
  
  // Helper to format metric or show "insufficient data"
  const fmt = (value: number | undefined, decimals: number = 2, suffix: string = ''): string => {
    return value !== undefined && value !== null && !isNaN(value)
      ? `${value.toFixed(decimals)}${suffix}`
      : 'insufficient data';
  };
  
  // Build metrics section
  const metricsText = `
**Market Metrics (${horizon} horizon):**
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
  
  return `Generate a concise market wrap based on ONLY these computed metrics:
${metricsText}${qualityWarning}

**Your Task:**
1. Write a 2-3 sentence macro overview based ONLY on the metrics above
2. Provide 3 key takeaways (each must reference a specific metric above)
3. List 3 risks to monitor (logically connected to the metrics)
4. State market outlook: Bullish, Neutral, or Bearish (based on metrics)

CRITICAL RULES:
- Use ONLY the metrics provided above
- If a metric shows "insufficient data", explicitly state that in your analysis
- Do NOT reference any data not listed above
- Do NOT invent or assume values
- Be specific and cite the actual metric values

Keep it under 200 words. Be analytical and actionable.`;
}

/**
 * Generate fallback summary if OpenAI fails
 * CRITICAL: This should rarely be used - OpenAI failures should be logged and investigated
 */
function generateFallbackSummary(snapshot: MacroSnapshot | null): string {
  if (!snapshot || !snapshot.metrics) {
    return `**Market Overview**

Unable to generate AI summary due to missing data.

**Status:** Insufficient macro data available for analysis.

*Note: AI summary temporarily unavailable. Please check data sources and API configuration.*`;
  }
  
  const { metrics } = snapshot;
  
  return `**Market Overview**

Current macro snapshot shows:
- S&P 500: ${metrics.sp500_level?.toFixed(0) || 'N/A'} (${metrics.sp500_pct !== undefined ? `${metrics.sp500_pct > 0 ? '+' : ''}${metrics.sp500_pct.toFixed(1)}%` : 'N/A'})
- VIX: ${metrics.vix_level?.toFixed(1) || 'N/A'}
- Risk Regime: ${metrics.risk_regime || 'unknown'}

**Key Takeaways:**
• Market data available but AI analysis temporarily unavailable
• Review raw metrics above for current positioning
• Monitor data quality and API connectivity

**Key Risks:**
• AI summary generation failed - check OpenAI API status
• Data quality may be impacted

*Note: AI summary temporarily unavailable. Showing raw metrics only.*`;
}

