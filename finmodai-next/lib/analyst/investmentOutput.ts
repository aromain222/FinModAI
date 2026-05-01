import type { AnalystDcfDemoPayload } from '@/lib/analyst/dcfDemo';

export type InvestmentSignal = 'LONG' | 'SHORT' | 'NEUTRAL';
export type ConfidenceBand = 'Low' | 'Medium' | 'High';
export type EdgeStrength = 'Weak' | 'Moderate' | 'Strong';

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

function normalizeSignal(signal: InvestmentSignal | undefined, percentChange: number): InvestmentSignal {
  if (Math.abs(percentChange) < 5) return 'NEUTRAL';
  if (signal) return signal;
  if (percentChange > 0) return 'LONG';
  if (percentChange < 0) return 'SHORT';
  return 'NEUTRAL';
}

function fallbackAnalystNote(output: AnalystOutput, percentChange: number, primaryDriver: string, confidence: number): string {
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

// ─── Derivation from DCF payload ──────────────────────────────────────────────

function firstSentences(text: string, count = 3): string {
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [];
  const joined = sentences.slice(0, count).join('').trim();
  return joined.length > 20 ? joined : text.slice(0, 400).trim();
}

export function deriveOutputFromDcf(dcf: AnalystDcfDemoPayload): AnalystOutput {
  const base = dcf.scenarios.base;
  const upside = base.upsidePct ?? 0;
  const signal: InvestmentSignal =
    upside > 5 ? 'LONG' : upside < -5 ? 'SHORT' : 'NEUTRAL';

  const wacc = dcf.assumptions.wacc;
  const revGrowth0 = (dcf.assumptions.revenueGrowth[0] ?? 0) * 100;
  const ebitMargin0 = (dcf.assumptions.ebitMargin[0] ?? 0) * 100;
  const termGrowth = dcf.assumptions.terminalGrowth;

  const targetPrice = base.pricePerShare;
  const currentPrice = base.marketPrice;

  const primaryDriver =
    targetPrice != null && currentPrice != null
      ? `DCF target $${targetPrice.toFixed(0)} vs market $${currentPrice.toFixed(0)}`
      : `${dcf.companyName} ${Math.abs(upside).toFixed(1)}% ${upside >= 0 ? 'discount' : 'premium'} to intrinsic value`;

  const forecastRevenues = dcf.forecast.map((row) => row.revenue);
  const sizePct =
    signal !== 'NEUTRAL'
      ? +Math.min(Math.max(Math.abs(upside) / 4, 1), 10).toFixed(1)
      : null;

  const noteText = firstSentences(dcf.memo);
  const analystNote =
    noteText.length > 30
      ? noteText
      : `${dcf.companyName} DCF analysis uses a ${wacc.toFixed(1)}% WACC over ${dcf.years} years, implying a fair value of ${targetPrice != null ? '$' + targetPrice.toFixed(0) : 'N/A'}. The ${upside >= 0 ? 'discount' : 'premium'} to market supports a ${signal.toLowerCase()} bias.`;

  return {
    signal,
    percentChange: upside,
    confidence: 0.65,
    primaryDriver,
    attributionExplanation: `${wacc.toFixed(1)}% WACC · ${revGrowth0.toFixed(1)}% initial revenue growth · ${termGrowth.toFixed(1)}% terminal`,
    drivers: [
      `WACC: ${wacc.toFixed(1)}%`,
      `Revenue growth (Yr 1): ${revGrowth0.toFixed(1)}%`,
      `EBIT margin (Yr 1): ${ebitMargin0.toFixed(1)}%`,
      `Terminal growth: ${termGrowth.toFixed(1)}%`,
    ],
    analystNote,
    forecast: forecastRevenues.length > 1 ? forecastRevenues : [],
    sizePct,
    confidenceBreakdown: {
      model: 0.65,
      accuracy: 0.60,
      sampleSize: dcf.years,
    },
  };
}

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
  const sampleSize = output.confidenceBreakdown?.sampleSize;
  const analystNote =
    output.analystNote?.trim() ||
    fallbackAnalystNote(output, percentChange, primaryDriver, confidence);

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
  };
}
