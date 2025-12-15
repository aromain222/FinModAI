/**
 * API Route: /api/macro/summary
 * 
 * Generates AI-powered market wrap using OpenAI
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { MacroSnapshot } from '@/lib/macroData';

export const dynamic = 'force-dynamic';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    console.log('[/api/macro/summary] Generating AI market wrap');
    
    const snapshot: MacroSnapshot = await req.json();
    
    // Build prompt for OpenAI
    const prompt = buildMarketWrapPrompt(snapshot);
    
    console.log('[/api/macro/summary] Calling OpenAI...');
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: `You are a senior investment strategist writing a daily market wrap for institutional investors. 
Your tone is clear, direct, and analytical—like a Goldman Sachs or JPMorgan strategist.
Keep it concise (< 200 words), actionable, and focused on valuation implications.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });
    
    const summary = completion.choices[0]?.message?.content || 'Market summary unavailable.';
    
    console.log('[/api/macro/summary] ✅ AI summary generated');
    
    return NextResponse.json({ summary }, { status: 200 });
    
  } catch (error) {
    console.error('[/api/macro/summary] ❌ Error:', error);
    
    // Fallback summary if OpenAI fails
    const fallbackSummary = generateFallbackSummary();
    
    return NextResponse.json({ summary: fallbackSummary }, { status: 200 });
  }
}

/**
 * Build prompt for OpenAI market wrap
 */
function buildMarketWrapPrompt(snapshot: MacroSnapshot): string {
  const { indicators, riskScore, riskRegime } = snapshot;
  
  return `Generate a concise market wrap based on these macro indicators:

**Risk Environment:** ${riskRegime.toUpperCase()} (score: ${riskScore}/100)

**Key Indicators:**
- Fed Funds: ${indicators.fedFunds.value}% (1w: ${indicators.fedFunds.change1w > 0 ? '+' : ''}${indicators.fedFunds.change1w}%)
- 10Y Treasury: ${indicators.treasury10y.value}% (1w: ${indicators.treasury10y.change1w > 0 ? '+' : ''}${indicators.treasury10y.change1w}%)
- CPI (YoY): ${indicators.cpi.value}% (1w: ${indicators.cpi.change1w > 0 ? '+' : ''}${indicators.cpi.change1w}%)
- Unemployment: ${indicators.unemployment.value}% (1w: ${indicators.unemployment.change1w > 0 ? '+' : ''}${indicators.unemployment.change1w}%)
- S&P 500: ${indicators.sp500.value.toLocaleString()} (1w: ${indicators.sp500.change1w > 0 ? '+' : ''}${indicators.sp500.change1w}%)
- VIX: ${indicators.vix.value} (1w: ${indicators.vix.change1w > 0 ? '+' : ''}${indicators.vix.change1w})

**Your Task:**
Write a 2-3 sentence macro overview, then provide:
• 3 bullets on valuation implications (WACC, multiples, sector rotation)
• 2 key risks to monitor

Keep it under 200 words. Be specific and actionable.`;
}

/**
 * Generate fallback summary if OpenAI fails
 */
function generateFallbackSummary(): string {
  return `**Market Overview**

Current macro conditions reflect a balanced environment with stable rates and moderate volatility. The Fed's policy stance remains data-dependent, with inflation trending toward target levels.

**Valuation Implications:**
• Cost of capital remains elevated at current rate levels, supporting selective positioning
• Quality factors and cash flow generation remain key differentiators
• Sector rotation favors defensives in uncertain environments

**Key Risks:**
• Inflation persistence could prompt further policy tightening
• Geopolitical developments may increase volatility

*Note: AI summary temporarily unavailable. Using default market commentary.*`;
}

