/**
 * Market Brief Generator
 * Uses OpenAI to analyze macro data and generate insights based on the CANONICAL MacroSnapshot
 */

import type { MacroSnapshot, MacroSeries, MacroDataPoint } from './macroData';
import type { MacroNewsItem } from './fetchMacroNews';
import OpenAI from 'openai';
import { getOpenAIKey } from './openaiKey';

export interface MarketBrief {
  summary: string;
  keyTakeaways: string[];
  outlook: 'bullish' | 'bearish' | 'neutral';
  risks: string[];
  sectorImplications?: string[];
  marketImpact?: string; // AI-generated market impact analysis
  timestamp: string;
}

/**
 * Safely grab the latest point from a macro series
 */
function latest(series?: MacroSeries): MacroDataPoint | null {
  if (!series || !series.points || series.points.length === 0) return null;
  return series.points[series.points.length - 1];
}

/**
 * Percent change helper using first/last values in the series
 */
function seriesChangePct(series?: MacroSeries): number | null {
  if (!series || series.points.length < 2) return null;
  const first = series.points[0].value;
  const last = series.points[series.points.length - 1].value;
  if (first === null || last === null) return null;
  if (first === 0) return null;
  return ((last - first) / first) * 100;
}

/**
 * Derive risk regime if missing (based on realized volatility)
 */
function deriveRiskRegime(metrics: MacroSnapshot['metrics']): 'bullish' | 'bearish' | 'neutral' {
  const regime = metrics.risk_regime;
  if (regime === 'low') return 'bullish';
  if (regime === 'high') return 'bearish';
  if (regime === 'mixed') return 'neutral';

  if (typeof metrics.realized_vol_annual === 'number') {
    if (metrics.realized_vol_annual < 15) return 'bullish';
    if (metrics.realized_vol_annual > 25) return 'bearish';
  }
  return 'neutral';
}

export async function generateMarketBrief(
  snapshot: MacroSnapshot,
  news: MacroNewsItem[]
): Promise<MarketBrief> {
  const apiKey = getOpenAIKey('service');

  // CRITICAL: Validate API key with detailed error messages
  if (!apiKey) {
    const errorMsg = '[marketBrief] ❌ CRITICAL: OpenAI key missing – using fallback brief. Add OPENAI_SERVICE_API_KEY or OPENAI_API_KEY to .env.local';
    console.error(errorMsg);
    return getFallbackBrief(snapshot);
  }
  
  // Validate key is not a placeholder
  if (apiKey.includes('REDACTED') || apiKey.includes('your_') || apiKey.trim().length < 10) {
    const errorMsg = '[marketBrief] ❌ CRITICAL: OpenAI key appears to be a placeholder. Use a real API key.';
    console.error(errorMsg);
    return getFallbackBrief(snapshot);
  }

  const openai = new OpenAI({ apiKey });

  try {
    const fedFunds = latest(snapshot.series.fedFunds);
    const cpi = latest(snapshot.series.cpi);
    const tenY = latest(snapshot.series.treasury10y);
    const unemployment = latest(snapshot.series.unemployment);
    const sp500 = latest(snapshot.series.sp500);
    const vix = latest(snapshot.series.vix);

    const newsHeadlines = news.slice(0, 6).map(n => `- ${n.title}`).join('\n');

    const prompt = `You are a senior macro strategist. Analyze the current environment using ONLY the provided metrics and news.

Macro Snapshot (as of ${snapshot.asOf}, horizon ${snapshot.horizon}):
- Fed Funds: ${fedFunds?.value != null ? `${fedFunds.value.toFixed(2)}%` : 'n/a'}
- CPI YoY: ${snapshot.metrics.cpi_yoy !== undefined ? `${snapshot.metrics.cpi_yoy.toFixed(1)}%` : 'n/a'}
- 10Y Treasury: ${tenY?.value != null ? `${tenY.value.toFixed(2)}%` : 'n/a'} (${snapshot.metrics.tenY_change_bps !== undefined ? `${snapshot.metrics.tenY_change_bps.toFixed(0)} bps` : 'n/a'} change)
- Unemployment: ${unemployment?.value != null ? `${unemployment.value.toFixed(2)}%` : 'n/a'} (${snapshot.metrics.unemployment_change !== undefined ? `${snapshot.metrics.unemployment_change.toFixed(2)} pp` : 'n/a'} change)
- S&P 500: ${sp500?.value != null ? sp500.value.toFixed(2) : 'n/a'} (${snapshot.metrics.sp500_pct !== undefined ? `${snapshot.metrics.sp500_pct.toFixed(2)}%` : 'n/a'} change)
- VIX: ${vix?.value != null ? vix.value.toFixed(2) : 'n/a'} (${snapshot.metrics.vix_pct !== undefined ? `${snapshot.metrics.vix_pct.toFixed(2)}%` : 'n/a'} change)
- Realized Vol (annualized): ${snapshot.metrics.realized_vol_annual !== undefined ? `${snapshot.metrics.realized_vol_annual.toFixed(1)}%` : 'n/a'}
- Risk Regime: ${snapshot.metrics.risk_regime || 'unknown'}

Recent Macro News (headlines only):
${newsHeadlines || '- None available'}

Return JSON:
{
  "summary": "2-3 sentence market overview grounded in the metrics above",
  "keyTakeaways": ["bullet 1", "bullet 2", "bullet 3", "bullet 4", "bullet 5"],
  "outlook": "bullish|bearish|neutral",
  "risks": ["risk 1", "risk 2", "risk 3"],
  "sectorImplications": ["sector angle 1", "sector angle 2"],
  "marketImpact": "2-3 sentence analysis of how these macro conditions and news will likely impact markets in the near term. Be specific about asset classes, sectors, and market dynamics. Reference the metrics and news explicitly."
}

Rules: cite the metrics explicitly, avoid speculation, keep bullets concise. The marketImpact should be actionable and specific about what to expect in markets.`;

    console.log('🔥 OPENAI CALL FIRED (market brief)', {
      hasKey: !!apiKey,
      model: process.env.OPENAI_MODEL || 'gpt-5.4',
      timestamp: new Date().toISOString(),
    });

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-5.4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      response_format: { type: 'json_object' },
    });

    console.log('✅ OPENAI CALL SUCCESS (market brief)', {
      model: completion.model,
      tokens: completion.usage?.total_tokens,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('No response from OpenAI');

    const parsed = JSON.parse(content);

    return {
      summary: parsed.summary || '',
      keyTakeaways: parsed.keyTakeaways || [],
      outlook: parsed.outlook || 'neutral',
      risks: parsed.risks || [],
      sectorImplications: parsed.sectorImplications || [],
      marketImpact: parsed.marketImpact || '',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[marketBrief] Failed to generate brief:', error);
    return getFallbackBrief(snapshot);
  }
}

function getFallbackBrief(snapshot: MacroSnapshot): MarketBrief {
  const fedFunds = latest(snapshot.series.fedFunds)?.value;
  const sp500 = latest(snapshot.series.sp500)?.value;
  const vix = latest(snapshot.series.vix)?.value;
  const cpi = latest(snapshot.series.cpi)?.value ?? snapshot.metrics.cpi_yoy;

  const outlook = deriveRiskRegime(snapshot.metrics);

  return {
    summary: `Macro regime appears ${outlook}, with fed funds around ${fedFunds ?? 'n/a'}%, CPI near ${cpi ?? 'n/a'}%, the S&P 500 at ${sp500?.toFixed?.(2) ?? 'n/a'} and VIX at ${vix?.toFixed?.(2) ?? 'n/a'}.`,
    keyTakeaways: [
      `Fed Funds: ${fedFunds != null ? `${fedFunds.toFixed(2)}%` : 'n/a'}`,
      `CPI YoY: ${cpi != null ? `${Number(cpi).toFixed(1)}%` : 'n/a'}`,
      `S&P 500: ${sp500 != null ? sp500.toFixed(2) : 'n/a'}`,
      `VIX: ${vix != null ? vix.toFixed(2) : 'n/a'}`,
      `Risk Regime: ${snapshot.metrics.risk_regime || 'unknown'}`,
    ],
    outlook,
    risks: [
      'Fed policy shifts',
      'Inflation persistence',
      'Labor market softening',
      'Volatility spikes',
      'Growth slowdown',
    ],
    marketImpact: `Given the current macro environment with Fed Funds at ${fedFunds ?? 'n/a'}%, CPI at ${cpi ?? 'n/a'}%, and VIX at ${vix?.toFixed?.(2) ?? 'n/a'}, markets are likely to ${outlook === 'bullish' ? 'continue their upward trajectory' : outlook === 'bearish' ? 'face headwinds with increased volatility' : 'remain range-bound'}. The ${snapshot.metrics.risk_regime || 'mixed'} risk regime suggests ${outlook === 'bullish' ? 'favorable conditions for risk assets' : outlook === 'bearish' ? 'caution is warranted' : 'balanced positioning'}.`,
    timestamp: new Date().toISOString(),
  };
}
