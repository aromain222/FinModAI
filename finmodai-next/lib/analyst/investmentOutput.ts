import type { AnalystDcfDemoPayload, AnalystDcfEventContext } from '@/lib/analyst/dcfDemo';
import type { AnalystGeneratedModelPayload } from '@/lib/analyst/types';
import type { DcfModelInputs } from '@/lib/model-generator/extractInputs';
import { detectSensitivity, type SensitivityResult } from '@/lib/valuation/sensitivity';
import { formatValuationConclusion } from '@/lib/analyst/language';

export type InvestmentSignal = 'LONG' | 'SHORT' | 'NEUTRAL';
export type ConfidenceBand = 'Low' | 'Medium' | 'High';
export type EdgeStrength = 'Weak' | 'Moderate' | 'Strong';

export type BreakevenData = {
  terminalGrowthPct: number | null;
  currentTerminalGrowthPct: number;
  currentPriceDollars: number | null;
};

export type SensitivityDeltas = {
  terminalGrowthPlus1Pct: number;
  waccMinus1Pct: number;
};

export type AnalystOutput = {
  signal?: InvestmentSignal;
  percentChange?: number;
  primaryDriver?: string;
  attributionExplanation?: string;
  confidence?: number;
  confidenceBreakdown?: {
    model?: number | null;
    accuracy?: number | null;
    sampleSize?: number | null;
  };
  drivers?: string[];
  analystNote?: string;
  sizePct?: number | null;
  forecast?: number[];
  historical?: number[];
  sensitivity?: SensitivityResult | null;
  breakeven?: BreakevenData | null;
  sensitivityDeltas?: SensitivityDeltas | null;
  valuationConclusion?: string;
  investmentCapabilityMemo?: string;
  eventContext?: AnalystDcfEventContext[];
  // Trade recommendation fields
  ticker?: string;
  targetPrice?: number | null;
  stopLoss?: number | null;
  tradeHorizon?: string;
  currentPrice?: number | null;
};

export type NormalizedAnalystOutput = {
  signal: InvestmentSignal;
  percentChange: number;
  primaryDriver: string;
  attributionExplanation: string;
  confidence: number;
  confidenceBand: ConfidenceBand;
  edgeStrength: EdgeStrength;
  confidenceBreakdown: {
    model: number | null;
    accuracy: number | null;
    sampleSize: number;
  };
  drivers: string[];
  analystNote: string;
  confidenceExplanation: string;
  sizePct: number | null;
  forecast: number[];
  historical: number[];
  isComplete: boolean;
  sensitivity: SensitivityResult | null;
  breakeven: BreakevenData | null;
  sensitivityDeltas: SensitivityDeltas | null;
  valuationConclusion: string;
  investmentCapabilityMemo: string;
  eventContext: AnalystDcfEventContext[];
  ticker: string;
  targetPrice: number | null;
  stopLoss: number | null;
  tradeHorizon: string;
  currentPrice: number | null;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizePercentChange(percentChange?: number): number {
  if (typeof percentChange !== 'number' || !Number.isFinite(percentChange)) return 0;
  return Math.abs(percentChange) <= 1 ? percentChange * 100 : percentChange;
}

export function getConfidenceBand(confidence: number): ConfidenceBand {
  const value = clamp(confidence, 0, 1);
  if (value < 0.4) return 'Low';
  if (value <= 0.7) return 'Medium';
  return 'High';
}

export function getEdgeStrength(percentChange: number): EdgeStrength {
  const absChange = Math.abs(normalizePercentChange(percentChange));
  if (absChange < 10) return 'Weak';
  if (absChange <= 25) return 'Moderate';
  return 'Strong';
}

export function formatDriver(driver: string): string {
  const normalized = driver.trim().toLowerCase().replace(/\s+/g, '_');
  const knownDrivers: Record<string, string> = {
    discount_rate: 'discount rate compression',
    discount_rate_delta: 'discount rate compression',
    wacc: 'discount rate compression',
    revenue_growth: 'revenue growth acceleration',
    growth: 'revenue growth acceleration',
    growth_delta: 'revenue growth acceleration',
    margin: 'margin expansion',
    margin_delta: 'margin expansion',
    ebit_margin: 'margin expansion',
    macro: 'macro conditions',
    company: 'company-specific factors',
    mixed: 'mixed valuation drivers',
  };
  return knownDrivers[normalized] ?? normalized.replace(/_/g, ' ');
}

function normalizeConfidence(confidence?: number): number {
  return clamp(typeof confidence === 'number' ? confidence : 0.5, 0, 1);
}

function normalizeSeries(values?: number[]): number[] {
  return (values ?? []).filter((value) => Number.isFinite(value));
}

function normalizeEventContext(events?: AnalystDcfEventContext[]): AnalystDcfEventContext[] {
  return (events ?? [])
    .filter((event) => event.title.trim().length > 0 && event.impact.trim().length > 0)
    .slice(0, 3);
}

function normalizeSignal(signal: InvestmentSignal | undefined, percentChange: number): InvestmentSignal {
  if (Math.abs(percentChange) < 5) return 'NEUTRAL';
  if (signal) return signal;
  if (percentChange > 0) return 'LONG';
  if (percentChange < 0) return 'SHORT';
  return 'NEUTRAL';
}

function fallbackAnalystNote(
  output: AnalystOutput,
  percentChange: number,
  primaryDriver: string,
  confidence: number,
): string {
  const formattedChange = `${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(1)}`;
  const driver = formatDriver(primaryDriver);
  return `Valuation changed ${formattedChange}%, driven by ${driver}. Confidence is ${confidence.toFixed(2)}.`;
}

function confidenceExplanation(output: AnalystOutput): string {
  const breakdown = output.confidenceBreakdown;
  const accuracy = breakdown?.accuracy;
  const modelConfidence = breakdown?.model;
  if (typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy < 0.6) {
    return 'Confidence moderated by limited historical accuracy';
  }
  if (typeof modelConfidence === 'number' && Number.isFinite(modelConfidence) && modelConfidence < 0.6) {
    return 'Confidence moderated by forecast volatility';
  }
  return 'Confidence supported by stable forecasts and historical accuracy';
}

export function getConvictionLabel(sizePct: number, confidence: number): string {
  const conviction = sizePct * confidence;
  if (conviction > 7) return 'High';
  if (conviction >= 3) return 'Moderate';
  return 'Low';
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function firstSentences(text: string, count = 3): string {
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [];
  const joined = sentences.slice(0, count).join('').trim();
  return joined.length > 20 ? joined : text.slice(0, 400).trim();
}

function deriveStopLoss(
  entryPrice: number | null,
  direction: InvestmentSignal,
  upsidePct: number,
): number | null {
  if (entryPrice === null || direction === 'NEUTRAL') return null;
  const riskBuffer = Math.min(Math.max((Math.abs(upsidePct) * 0.25) / 100, 0.08), 0.2);
  return direction === 'LONG'
    ? entryPrice * (1 - riskBuffer)
    : entryPrice * (1 + riskBuffer);
}

function deriveTradeHorizon(confidence: number, absGapPct: number): string {
  if (confidence > 0.6 && absGapPct > 30) return '3–6 months';
  if (confidence > 0.5 && absGapPct > 15) return '6–12 months';
  return '12+ months';
}

function hasLiveValuationSource(source: string): boolean {
  const normalized = source.toLowerCase();
  return (
    normalized.includes('live') ||
    normalized.includes('finnhub') ||
    normalized.includes('fmp') ||
    normalized.includes('sec') ||
    normalized.includes('polygon')
  );
}

function isFallbackDcfSource(source: string): boolean {
  const normalized = source.toLowerCase();
  return normalized.includes('demo') || normalized.includes('fallback');
}

function normalizedValuationConclusion(
  existing: string | undefined,
  percentGap: number,
  isHighlySensitive: boolean,
): string {
  const trimmed = existing?.trim() ?? '';
  if (trimmed.length > 0 && !(Math.abs(percentGap) >= 5 && /near intrinsic value/i.test(trimmed))) {
    return trimmed;
  }
  return formatValuationConclusion({ percentGap, isHighlySensitive });
}

function computeDcfConfidence(params: {
  source: string;
  isFallbackSource: boolean;
  hasCurrentPrice: boolean;
  forecastCount: number;
  years: number;
  warningCount: number;
  rangeSpreadPct: number | null;
  isHighlySensitive: boolean;
}): number {
  if (params.isFallbackSource) return 0.25;
  let confidence = 0.52;
  if (hasLiveValuationSource(params.source)) confidence += 0.12;
  if (params.hasCurrentPrice) confidence += 0.08;
  if (params.forecastCount >= Math.max(2, params.years)) confidence += 0.06;
  if (params.isHighlySensitive) confidence -= 0.18;
  if (params.rangeSpreadPct != null && params.rangeSpreadPct > 45) confidence -= 0.08;
  if (params.warningCount > 0) confidence -= Math.min(0.12, params.warningCount * 0.03);
  return Number(clamp(confidence, 0.2, 0.85).toFixed(2));
}

function buildInvestmentCapabilityMemo(params: {
  companyName: string;
  signal: InvestmentSignal;
  confidence: number;
  isFallbackSource: boolean;
  hasCurrentPrice: boolean;
  isHighlySensitive: boolean;
  sizePct: number | null;
  primarySensitivity?: string;
  eventCount?: number;
}): string {
  const eventText =
    params.eventCount && params.eventCount > 0
      ? ` Active event context is included as a thesis check, not a direct price target.`
      : '';
  if (params.isFallbackSource) {
    return `Investment capability: non-actionable scaffold only. Live company financials are required before CapitalBase can support a target, stop, or tracked trade.${eventText}`;
  }
  if (!params.hasCurrentPrice) {
    return `Investment capability: valuation framework only. A current market price is required before the system can size the edge or produce a trade setup.${eventText}`;
  }
  if (params.signal === 'NEUTRAL') {
    return params.isHighlySensitive
      ? `Investment capability: watchlist and assumption testing. The ${params.companyName} signal is neutral because valuation depends too heavily on ${formatDriver(params.primarySensitivity ?? 'valuation drivers')}.${eventText}`
      : `Investment capability: watchlist only. The modeled valuation gap is not large enough to justify a directional position.${eventText}`;
  }
  const sizingText = params.sizePct != null ? `${params.sizePct.toFixed(1)}%` : 'small';
  if (params.confidence < 0.55 || params.isHighlySensitive) {
    return `Investment capability: small tracked ${params.signal.toLowerCase()} setup only. Suggested sizing is capped near ${sizingText} because the edge is sensitive to key valuation assumptions.${eventText}`;
  }
  return `Investment capability: actionable tracked ${params.signal.toLowerCase()} setup. The model supports a ${sizingText} paper position with target, stop, and follow-up thesis monitoring.${eventText}`;
}

function computeDcfEquityPrice(
  dcf: DcfModelInputs,
  overrides: { wacc?: number; terminalGrowth?: number } = {},
): number | null {
  const w = overrides.wacc ?? dcf.wacc;
  const tg = overrides.terminalGrowth ?? dcf.terminalGrowth;
  if (w <= tg || !dcf.sharesOutstanding) return null;

  let prevRevenue = dcf.baseRevenue;
  let pvFcffs = 0;
  let lastFcff = 0;

  for (let i = 0; i < dcf.years; i++) {
    const g = dcf.revenueGrowth[i] ?? dcf.revenueGrowth.at(-1) ?? 0.05;
    const rev = prevRevenue * (1 + g);
    const margin = dcf.ebitMargin[i] ?? dcf.ebitMargin.at(-1) ?? 0.15;
    const nopat = rev * margin * (1 - (dcf.taxRate ?? 0.25));
    const da = rev * (dcf.daPctRevenue ?? 0.03);
    const capex = rev * (dcf.capexPctRevenue ?? 0.04);
    const deltaNwc = (rev - prevRevenue) * (dcf.nwcPctRevenue ?? 0.01);
    lastFcff = nopat + da - capex - deltaNwc;
    pvFcffs += lastFcff / (1 + w) ** (i + 1);
    prevRevenue = rev;
  }

  const tv = (lastFcff * (1 + tg)) / (w - tg);
  const pvTv = tv / (1 + w) ** dcf.years;
  const ev = pvFcffs + pvTv;
  const equity = ev + (dcf.cash ?? 0) - (dcf.debt ?? 0);
  const price = equity / dcf.sharesOutstanding;
  return Number.isFinite(price) && price > 0 ? price : null;
}

// ─── Derivation from dcfDemo payload ─────────────────────────────────────────

export function deriveOutputFromDcf(dcf: AnalystDcfDemoPayload): AnalystOutput {
  const base = dcf.scenarios.base;
  const upside = base.upsidePct ?? 0;
  const isFallbackSource = isFallbackDcfSource(dcf.source);

  const bull = dcf.scenarios.bull;
  const bear = dcf.scenarios.bear;
  const rangeSpreadPct =
    bull?.upsidePct != null && bear?.upsidePct != null
      ? Math.abs(bull.upsidePct - bear.upsidePct)
      : null;

  const sensitivity = detectSensitivity({
    terminalGrowth: dcf.assumptions.terminalGrowth,
    wacc: dcf.assumptions.wacc,
    growthPath: dcf.assumptions.revenueGrowth,
    valuationRangeSpreadPct: rangeSpreadPct,
  });

  const rawSignal: InvestmentSignal = upside > 5 ? 'LONG' : upside < -5 ? 'SHORT' : 'NEUTRAL';
  const signal: InvestmentSignal =
    isFallbackSource || (sensitivity.isHighlySensitive && rawSignal !== 'NEUTRAL') ? 'NEUTRAL' : rawSignal;

  const waccPct = dcf.assumptions.wacc * 100;
  const revGrowth0 = (dcf.assumptions.revenueGrowth[0] ?? 0) * 100;
  const ebitMargin0 = (dcf.assumptions.ebitMargin[0] ?? 0) * 100;
  const termGrowthPct = dcf.assumptions.terminalGrowth * 100;

  const targetPrice = base.pricePerShare;
  const currentPrice = base.marketPrice;

  const primaryDriver =
    targetPrice != null && currentPrice != null
      ? `DCF target $${targetPrice.toFixed(0)} vs market $${currentPrice.toFixed(0)}`
      : `${dcf.companyName} ${Math.abs(upside).toFixed(1)}% ${upside >= 0 ? 'discount' : 'premium'} to intrinsic value`;

  const forecastRevenues = dcf.forecast.map((row) => row.revenue);
  const eventContext = normalizeEventContext(dcf.eventContext);
  const confidence = computeDcfConfidence({
    source: dcf.source,
    isFallbackSource,
    hasCurrentPrice: currentPrice != null,
    forecastCount: forecastRevenues.length,
    years: dcf.years,
    warningCount: dcf.warnings.length,
    rangeSpreadPct,
    isHighlySensitive: sensitivity.isHighlySensitive,
  });
  const sizePct =
    signal !== 'NEUTRAL' && !isFallbackSource
      ? +Math.min(Math.max(Math.abs(upside) / 4, 1), 10).toFixed(1)
      : null;
  const investmentCapabilityMemo = buildInvestmentCapabilityMemo({
    companyName: dcf.companyName,
    signal,
    confidence,
    isFallbackSource,
    hasCurrentPrice: currentPrice != null,
    isHighlySensitive: sensitivity.isHighlySensitive,
    sizePct,
    primarySensitivity: sensitivity.primarySensitivity,
    eventCount: eventContext.length,
  });

  const noteText = firstSentences(dcf.memo);
  const analystNote =
    isFallbackSource
      ? `${dcf.companyName} does not have enough live or stored financial data for a tradeable valuation call in this workspace. The DCF below is a fallback modeling scaffold, so CapitalBase is withholding target, stop, and position sizing until real company financials are available.`
      : noteText.length > 30
      ? noteText
      : `${dcf.companyName} DCF analysis uses a ${waccPct.toFixed(1)}% WACC over ${dcf.years} years, implying a fair value of ${targetPrice != null ? '$' + targetPrice.toFixed(0) : 'N/A'}. The ${upside >= 0 ? 'discount' : 'premium'} to market supports a ${rawSignal.toLowerCase()} bias.`;
  const outputPercentChange = isFallbackSource ? 0 : upside;

  return {
    signal,
    percentChange: outputPercentChange,
    confidence,
    primaryDriver: isFallbackSource ? 'live financial data unavailable' : primaryDriver,
    attributionExplanation: isFallbackSource
      ? 'Trade signal withheld because the model is using fallback seeded financials.'
      : `${waccPct.toFixed(1)}% WACC · ${revGrowth0.toFixed(1)}% initial revenue growth · ${termGrowthPct.toFixed(1)}% terminal`,
    drivers: [
      `WACC: ${waccPct.toFixed(1)}%`,
      `Revenue growth (Yr 1): ${revGrowth0.toFixed(1)}%`,
      `EBIT margin (Yr 1): ${ebitMargin0.toFixed(1)}%`,
      `Terminal growth: ${termGrowthPct.toFixed(1)}%`,
    ],
    analystNote,
    forecast: forecastRevenues.length > 1 ? forecastRevenues : [],
    sizePct,
    confidenceBreakdown: {
      model: confidence,
      accuracy: 0.6,
      sampleSize: dcf.years,
    },
    sensitivity,
    breakeven: null,
    sensitivityDeltas: null,
    valuationConclusion: isFallbackSource
      ? 'Non-actionable fallback model — refresh live financials before trading'
      : formatValuationConclusion({
          percentGap: upside,
          isHighlySensitive: sensitivity.isHighlySensitive,
        }),
    investmentCapabilityMemo,
    eventContext,
    ticker: dcf.ticker,
    targetPrice: isFallbackSource ? null : targetPrice ?? null,
    stopLoss: isFallbackSource ? null : deriveStopLoss(currentPrice ?? null, signal, upside),
    tradeHorizon: signal !== 'NEUTRAL' ? deriveTradeHorizon(confidence, Math.abs(upside)) : '',
    currentPrice: currentPrice ?? null,
  };
}

// ─── Derivation from generated model payload ──────────────────────────────────

export function deriveOutputFromGeneratedModel(
  model: AnalystGeneratedModelPayload,
): AnalystOutput | null {
  const inputs = model.extractedInputs;
  if (!inputs || inputs.modelType !== 'DCF') return null;
  const dcf = inputs as DcfModelInputs;

  if (!dcf.baseRevenue || !dcf.wacc || !dcf.sharesOutstanding || dcf.wacc <= dcf.terminalGrowth) {
    return null;
  }

  // Revenue + FCFF series
  const revenues: number[] = [];
  const fcffs: number[] = [];
  let prevRevenue = dcf.baseRevenue;

  for (let i = 0; i < dcf.years; i++) {
    const g = dcf.revenueGrowth[i] ?? dcf.revenueGrowth.at(-1) ?? 0.05;
    const rev = prevRevenue * (1 + g);
    revenues.push(rev);
    const margin = dcf.ebitMargin[i] ?? dcf.ebitMargin.at(-1) ?? 0.15;
    const nopat = rev * margin * (1 - (dcf.taxRate ?? 0.25));
    const da = rev * (dcf.daPctRevenue ?? 0.03);
    const capex = rev * (dcf.capexPctRevenue ?? 0.04);
    const deltaNwc = (rev - prevRevenue) * (dcf.nwcPctRevenue ?? 0.01);
    fcffs.push(nopat + da - capex - deltaNwc);
    prevRevenue = rev;
  }

  const pvFcffs = fcffs.reduce((sum, fcff, i) => sum + fcff / (1 + dcf.wacc) ** (i + 1), 0);
  const lastFcff = fcffs.at(-1) ?? 0;
  const tv = (lastFcff * (1 + dcf.terminalGrowth)) / (dcf.wacc - dcf.terminalGrowth);
  const pvTv = tv / (1 + dcf.wacc) ** dcf.years;
  const ev = pvFcffs + pvTv;
  const equityValue = ev + (dcf.cash ?? 0) - (dcf.debt ?? 0);
  const impliedPrice = equityValue / dcf.sharesOutstanding;

  if (!Number.isFinite(impliedPrice) || impliedPrice <= 0) return null;

  const rawCurrentPrice = dcf.sharePrice;
  const hasCurrentPrice =
    typeof rawCurrentPrice === 'number' &&
    rawCurrentPrice > 0 &&
    Number.isFinite(rawCurrentPrice);
  const currentPrice = hasCurrentPrice ? rawCurrentPrice : null;
  const upside =
    currentPrice != null ? ((impliedPrice - currentPrice) / currentPrice) * 100 : 0;

  // Sensitivity detection
  const sensitivity = detectSensitivity({
    terminalGrowth: dcf.terminalGrowth,
    wacc: dcf.wacc,
    growthPath: dcf.revenueGrowth,
  });

  const rawSignal: InvestmentSignal = upside > 10 ? 'LONG' : upside < -10 ? 'SHORT' : 'NEUTRAL';
  const signal: InvestmentSignal =
    sensitivity.isHighlySensitive && rawSignal !== 'NEUTRAL' ? 'NEUTRAL' : rawSignal;
  const provenanceSource = [
    model.provenanceSummary.sourceType,
    ...model.provenanceSummary.sources,
  ].filter(Boolean).join('_') || 'generated_model';
  const confidence = computeDcfConfidence({
    source: provenanceSource,
    isFallbackSource: false,
    hasCurrentPrice: currentPrice != null,
    forecastCount: revenues.length,
    years: dcf.years,
    warningCount: 0,
    rangeSpreadPct: null,
    isHighlySensitive: sensitivity.isHighlySensitive,
  });

  // Breakeven terminal growth — solve analytically for g that equates equity to market cap
  let breakevenTerminalGrowthPct: number | null = null;
  if (currentPrice !== null && lastFcff > 0) {
    const targetEquityValue = currentPrice * dcf.sharesOutstanding;
    const targetEV = targetEquityValue - (dcf.cash ?? 0) + (dcf.debt ?? 0);
    const targetPvTv = targetEV - pvFcffs;
    if (targetPvTv > 0) {
      const targetTv = targetPvTv * (1 + dcf.wacc) ** dcf.years;
      // targetTv * (wacc - g) = lastFcff * (1 + g)  →  g = (targetTv*wacc - lastFcff) / (targetTv + lastFcff)
      const numerator = targetTv * dcf.wacc - lastFcff;
      const denominator = targetTv + lastFcff;
      if (denominator > 0) {
        const g = numerator / denominator;
        if (Number.isFinite(g) && g >= 0 && g < dcf.wacc) {
          breakevenTerminalGrowthPct = g * 100;
        }
      }
    }
  }

  // Sensitivity deltas — re-run DCF with ±1% shifts
  const tgPlus1Price = computeDcfEquityPrice(dcf, { terminalGrowth: dcf.terminalGrowth + 0.01 });
  const waccForDelta = dcf.wacc - 0.01;
  const waccMinus1Price =
    waccForDelta > dcf.terminalGrowth
      ? computeDcfEquityPrice(dcf, { wacc: waccForDelta })
      : null;
  const sensitivityDeltas =
    tgPlus1Price != null && waccMinus1Price != null
      ? {
          terminalGrowthPlus1Pct: ((tgPlus1Price - impliedPrice) / impliedPrice) * 100,
          waccMinus1Pct: ((waccMinus1Price - impliedPrice) / impliedPrice) * 100,
        }
      : null;

  const waccPct = dcf.wacc * 100;
  const revGrowth0 = (dcf.revenueGrowth[0] ?? 0) * 100;
  const ebitMargin0 = (dcf.ebitMargin[0] ?? 0) * 100;
  const termGrowthPct = dcf.terminalGrowth * 100;

  const primaryDriver =
    currentPrice != null
      ? `DCF target $${impliedPrice.toFixed(0)} vs market $${currentPrice.toFixed(0)}`
      : `${dcf.companyName} intrinsic value $${impliedPrice.toFixed(0)} per share`;

  const sizePct =
    signal !== 'NEUTRAL' ? +Math.min(Math.max(Math.abs(upside) / 4, 1), 10).toFixed(1) : null;
  const investmentCapabilityMemo = buildInvestmentCapabilityMemo({
    companyName: dcf.companyName,
    signal,
    confidence,
    isFallbackSource: false,
    hasCurrentPrice: currentPrice != null,
    isHighlySensitive: sensitivity.isHighlySensitive,
    sizePct,
    primarySensitivity: sensitivity.primarySensitivity,
    eventCount: model.eventAdjustmentSummary ? 1 : 0,
  });

  const firstNarrative = model.narrativeBlocks?.[0]?.body?.trim() ?? '';
  const analystNote =
    firstNarrative.length > 30
      ? firstSentences(firstNarrative)
      : `${dcf.companyName} DCF uses a ${waccPct.toFixed(1)}% WACC over ${dcf.years} years, implying a fair value of $${impliedPrice.toFixed(0)} per share.${currentPrice != null ? ` The ${Math.abs(upside).toFixed(1)}% ${upside >= 0 ? 'discount' : 'premium'} to market price of $${currentPrice.toFixed(0)} supports a ${rawSignal.toLowerCase()} bias.` : ''}`;

  return {
    signal,
    percentChange: upside,
    confidence,
    primaryDriver,
    attributionExplanation: `${waccPct.toFixed(1)}% WACC · ${revGrowth0.toFixed(1)}% initial revenue growth · ${termGrowthPct.toFixed(1)}% terminal`,
    drivers: [
      `WACC: ${waccPct.toFixed(1)}%`,
      `Revenue growth (Yr 1): ${revGrowth0.toFixed(1)}%`,
      `EBIT margin (Yr 1): ${ebitMargin0.toFixed(1)}%`,
      `Terminal growth: ${termGrowthPct.toFixed(1)}%`,
    ],
    analystNote,
    forecast: revenues.length > 1 ? revenues : [],
    sizePct,
    confidenceBreakdown: {
      model: confidence,
      accuracy: null,
      sampleSize: dcf.years,
    },
    sensitivity,
    breakeven: {
      terminalGrowthPct: breakevenTerminalGrowthPct,
      currentTerminalGrowthPct: termGrowthPct,
      currentPriceDollars: currentPrice,
    },
    sensitivityDeltas,
    valuationConclusion: formatValuationConclusion({
      percentGap: upside,
      isHighlySensitive: sensitivity.isHighlySensitive,
    }),
    investmentCapabilityMemo,
    eventContext: [],
    ticker: dcf.ticker ?? dcf.companyName,
    targetPrice: impliedPrice,
    stopLoss: deriveStopLoss(currentPrice, signal, upside),
    tradeHorizon: signal !== 'NEUTRAL' ? deriveTradeHorizon(confidence, Math.abs(upside)) : '',
    currentPrice,
  };
}

// ─── Normalization ────────────────────────────────────────────────────────────

export function normalizeAnalystOutput(output: AnalystOutput): NormalizedAnalystOutput {
  const percentChange = normalizePercentChange(output.percentChange);
  const confidence = normalizeConfidence(output.confidence);
  const primaryDriver = output.primaryDriver?.trim() || 'valuation drivers';
  const formattedPrimaryDriver = formatDriver(primaryDriver);
  const attributionExplanation =
    output.attributionExplanation?.trim() || `Driven primarily by ${formattedPrimaryDriver}.`;
  const drivers = (output.drivers ?? [])
    .map((driver) => formatDriver(driver))
    .filter((driver, index, array) => driver.length > 0 && array.indexOf(driver) === index);
  const signal = normalizeSignal(output.signal, percentChange);
  const outputSensitivity = output.sensitivity ?? null;
  const sampleSize = output.confidenceBreakdown?.sampleSize;
  const analystNote =
    output.analystNote?.trim() ||
    fallbackAnalystNote(output, percentChange, primaryDriver, confidence);
  const investmentCapabilityMemo =
    output.investmentCapabilityMemo?.trim() ||
    buildInvestmentCapabilityMemo({
      companyName: output.ticker || 'this company',
      signal,
      confidence,
      isFallbackSource: false,
      hasCurrentPrice: output.currentPrice != null,
      isHighlySensitive: outputSensitivity?.isHighlySensitive === true,
      sizePct: output.sizePct ?? null,
      primarySensitivity: outputSensitivity?.primarySensitivity,
      eventCount: output.eventContext?.length ?? 0,
    });
  const eventContext = normalizeEventContext(output.eventContext);

  return {
    signal,
    percentChange,
    primaryDriver: formattedPrimaryDriver,
    attributionExplanation,
    confidence,
    confidenceBand: getConfidenceBand(confidence),
    edgeStrength: getEdgeStrength(percentChange),
    confidenceBreakdown: {
      model: output.confidenceBreakdown?.model ?? null,
      accuracy: output.confidenceBreakdown?.accuracy ?? null,
      sampleSize: typeof sampleSize === 'number' && Number.isFinite(sampleSize) ? sampleSize : 0,
    },
    drivers,
    analystNote,
    confidenceExplanation: confidenceExplanation(output),
    sizePct: output.sizePct ?? null,
    forecast: normalizeSeries(output.forecast),
    historical: normalizeSeries(output.historical),
    isComplete: output.percentChange !== undefined || Boolean(output.analystNote?.trim()),
    sensitivity: outputSensitivity,
    breakeven: output.breakeven ?? null,
    sensitivityDeltas: output.sensitivityDeltas ?? null,
    valuationConclusion: normalizedValuationConclusion(
      output.valuationConclusion,
      percentChange,
      outputSensitivity?.isHighlySensitive === true,
    ),
    investmentCapabilityMemo,
    eventContext,
    ticker: output.ticker ?? '',
    targetPrice: output.targetPrice ?? null,
    stopLoss: output.stopLoss ?? null,
    tradeHorizon: output.tradeHorizon ?? '',
    currentPrice: output.currentPrice ?? null,
  };
}
