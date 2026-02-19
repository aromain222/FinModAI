/**
 * Enhanced Inference Protocol
 * Uses math libraries, OpenAI, and APIs to fill missing financial data
 */

import { evaluate } from 'mathjs';
import { mean, median, standardDeviation, linearRegression } from 'simple-statistics';
import OpenAI from 'openai';
import { getOpenAIKey } from '@/lib/openaiKey';

export interface InferenceResult {
  field: string;
  value: any;
  confidence: 'high' | 'medium' | 'low';
  method: string;
  source?: string;
}

/**
 * Enhanced inference that uses multiple methods to fill missing data
 */
export async function inferMissingDataEnhanced(
  data: Record<string, any>,
  missingFields: string[],
  sector?: string,
  historicalData?: Record<string, number[]>,
  peerMedians?: Record<string, number>
): Promise<InferenceResult[]> {
  const results: InferenceResult[] = [];
  
  for (const field of missingFields) {
    // Try methods in order of confidence
    let result: InferenceResult | null = null;
    
    // Method 1: Mathematical derivation (highest confidence)
    result = tryMathematicalDerivation(field, data);
    if (result) {
      results.push(result);
      continue;
    }
    
    // Method 2: Historical trend analysis
    if (historicalData && historicalData[field]) {
      result = tryHistoricalTrend(field, historicalData[field], data);
      if (result) {
        results.push(result);
        continue;
      }
    }
    
    // Method 3: Peer medians (higher confidence than sector defaults)
    if (peerMedians && peerMedians[field] != null) {
      result = {
        field,
        value: peerMedians[field],
        confidence: 'high',
        method: 'peer-median',
        source: 'peer-comps'
      };
      if (result) {
        results.push(result);
        continue;
      }
    }
    
    // Method 4: Sector/peer medians
    if (sector) {
      result = trySectorMedian(field, sector, data);
      if (result) {
        results.push(result);
        continue;
      }
    }
    
    // Method 5: AI Data Extraction (web scraping + OpenAI)
    // Only try if we haven't already attempted web scraping for this ticker
    // Skip if we're missing too many fields (web scraping is expensive)
    const missingFieldCount = missingFields.length;
    if (missingFieldCount <= 3 && getOpenAIKey('service') && (process.env.SCRAPE_DO_API_KEY || process.env.SCRAPER_API_KEY)) {
      result = await tryAIDataExtraction(field, data, sector);
      if (result) {
        results.push(result);
        continue;
      }
    }
    
    // Method 6: OpenAI inference
    result = await tryOpenAIInference(field, data, sector);
    if (result) {
      results.push(result);
      continue;
    }
    
    // Method 7: Default fallback
    result = tryDefaultFallback(field, data);
    if (result) {
      results.push(result);
    }
  }
  
  return results;
}

/**
 * Try to derive value using mathematical relationships
 */
function tryMathematicalDerivation(field: string, data: Record<string, any>): InferenceResult | null {
  const derivations: Record<string, (d: Record<string, any>) => number | null> = {
    // Income Statement
    ebitda: (d) => {
      if (d.ebit != null && d.depreciation != null) {
        return d.ebit + d.depreciation;
      }
      if (d.revenue != null && d.ebitdaMargin != null) {
        return d.revenue * d.ebitdaMargin;
      }
      if (d.operatingIncome != null && d.depreciation != null) {
        return d.operatingIncome + d.depreciation;
      }
      return null;
    },
    ebit: (d) => {
      if (d.ebitda != null && d.depreciation != null) {
        return d.ebitda - d.depreciation;
      }
      if (d.revenue != null && d.ebitMargin != null) {
        return d.revenue * d.ebitMargin;
      }
      if (d.operatingIncome != null) {
        return d.operatingIncome;
      }
      return null;
    },
    netIncome: (d) => {
      if (d.ebit != null && d.taxRate != null && d.interestExpense != null) {
        return (d.ebit - d.interestExpense) * (1 - d.taxRate);
      }
      if (d.revenue != null && d.netMargin != null) {
        return d.revenue * d.netMargin;
      }
      return null;
    },
    grossProfit: (d) => {
      if (d.revenue != null && d.grossMargin != null) {
        return d.revenue * d.grossMargin;
      }
      if (d.revenue != null && d.cogs != null) {
        return d.revenue - d.cogs;
      }
      return null;
    },
    
    // Balance Sheet
    netDebt: (d) => {
      if (d.totalDebt != null && d.cash != null) {
        return d.totalDebt - d.cash;
      }
      return null;
    },
    totalEquity: (d) => {
      if (d.totalAssets != null && d.totalLiabilities != null) {
        return d.totalAssets - d.totalLiabilities;
      }
      if (d.marketCap != null && d.sharesOutstanding != null) {
        // Rough estimate: equity ≈ market cap for healthy companies
        return d.marketCap;
      }
      return null;
    },
    workingCapital: (d) => {
      if (d.currentAssets != null && d.currentLiabilities != null) {
        return d.currentAssets - d.currentLiabilities;
      }
      return null;
    },
    
    // Cash Flow
    freeCashFlow: (d) => {
      if (d.operatingCashFlow != null && d.capex != null) {
        return d.operatingCashFlow - d.capex;
      }
      if (d.ebit != null && d.taxRate != null && d.depreciation != null && d.capex != null && d.nwcChange != null) {
        // UFCF = EBIT * (1 - Tax) + D&A - CapEx - ΔNWC
        return d.ebit * (1 - (d.taxRate || 0.25)) + d.depreciation - d.capex - (d.nwcChange || 0);
      }
      return null;
    },
    operatingCashFlow: (d) => {
      if (d.netIncome != null && d.depreciation != null && d.nwcChange != null) {
        return d.netIncome + d.depreciation - d.nwcChange;
      }
      return null;
    },
    
    // Margins (derived from absolute values)
    grossMargin: (d) => {
      if (d.revenue != null && d.grossProfit != null && d.revenue > 0) {
        return d.grossProfit / d.revenue;
      }
      return null;
    },
    ebitdaMargin: (d) => {
      if (d.revenue != null && d.ebitda != null && d.revenue > 0) {
        return d.ebitda / d.revenue;
      }
      return null;
    },
    ebitMargin: (d) => {
      if (d.revenue != null && d.ebit != null && d.revenue > 0) {
        return d.ebit / d.revenue;
      }
      return null;
    },
    netMargin: (d) => {
      if (d.revenue != null && d.netIncome != null && d.revenue > 0) {
        return d.netIncome / d.revenue;
      }
      return null;
    },
    
    // Valuation
    enterpriseValue: (d) => {
      if (d.marketCap != null && d.netDebt != null) {
        return d.marketCap + d.netDebt;
      }
      if (d.ebitda != null && d.evEbitdaMultiple != null) {
        return d.ebitda * d.evEbitdaMultiple;
      }
      return null;
    },
    marketCap: (d) => {
      if (d.price != null && d.sharesOutstanding != null) {
        return d.price * d.sharesOutstanding;
      }
      return null;
    },
    sharesOutstanding: (d) => {
      // Derive from market cap and price
      if (d.marketCap != null && d.price != null && d.price > 0) {
        return d.marketCap / d.price;
      }
      // Derive from currentPrice if available
      if (d.marketCap != null && d.currentPrice != null && d.currentPrice > 0) {
        return d.marketCap / d.currentPrice;
      }
      return null;
    },
    
    // Growth rates
    revenueGrowth: (d) => {
      if (d.revenueHistory && Array.isArray(d.revenueHistory) && d.revenueHistory.length >= 2) {
        const recent = d.revenueHistory[d.revenueHistory.length - 1];
        const previous = d.revenueHistory[d.revenueHistory.length - 2];
        if (previous > 0) {
          return (recent - previous) / previous;
        }
      }
      return null;
    },
  };
  
  const derive = derivations[field];
  if (derive) {
    const value = derive(data);
    if (value != null && isFinite(value)) {
      return {
        field,
        value,
        confidence: 'high',
        method: 'mathematical-derivation',
        source: 'calculation'
      };
    }
  }
  
  return null;
}

/**
 * Try to infer from historical trends
 */
function tryHistoricalTrend(field: string, history: number[], data: Record<string, any>): InferenceResult | null {
  if (!history || history.length < 2) return null;
  
  try {
    // Calculate trend using linear regression
    const indices = history.map((_, i) => i);
    const regression = linearRegression(indices.map(i => [i, history[i]]));
    
    // Project next value
    const nextIndex = history.length;
    const projectedValue = regression.m * nextIndex + regression.b;
    
    // Calculate confidence based on R² (simplified)
    const meanVal = mean(history);
    const stdDev = standardDeviation(history);
    const confidence = stdDev / meanVal < 0.2 ? 'high' : stdDev / meanVal < 0.5 ? 'medium' : 'low';
    
    if (isFinite(projectedValue) && projectedValue > 0) {
      return {
        field,
        value: projectedValue,
        confidence,
        method: 'historical-trend',
        source: 'statistical-analysis'
      };
    }
  } catch (error) {
    // Fallback to median if regression fails
    const medianVal = median(history);
    if (isFinite(medianVal) && medianVal > 0) {
      return {
        field,
        value: medianVal,
        confidence: 'medium',
        method: 'historical-median',
        source: 'statistical-analysis'
      };
    }
  }
  
  return null;
}

/**
 * Try sector/peer medians
 */
function trySectorMedian(field: string, sector: string, data: Record<string, any>): InferenceResult | null {
  // Sector-specific defaults (can be expanded with real peer data)
  const sectorDefaults: Record<string, Record<string, number>> = {
    technology: {
      revenueGrowth: 0.15,
      ebitdaMargin: 0.30,
      ebitMargin: 0.20,
      netMargin: 0.15,
      wacc: 0.10,
      capexPctRevenue: 0.05,
      nwcPctRevenue: 0.10,
    },
    healthcare: {
      revenueGrowth: 0.10,
      ebitdaMargin: 0.25,
      ebitMargin: 0.18,
      netMargin: 0.12,
      wacc: 0.09,
      capexPctRevenue: 0.08,
      nwcPctRevenue: 0.15,
    },
    financial: {
      revenueGrowth: 0.08,
      ebitdaMargin: 0.35,
      ebitMargin: 0.28,
      netMargin: 0.20,
      wacc: 0.08,
      capexPctRevenue: 0.02,
      nwcPctRevenue: 0.05,
    },
    consumer: {
      revenueGrowth: 0.06,
      ebitdaMargin: 0.20,
      ebitMargin: 0.15,
      netMargin: 0.10,
      wacc: 0.09,
      capexPctRevenue: 0.04,
      nwcPctRevenue: 0.12,
    },
    industrial: {
      revenueGrowth: 0.07,
      ebitdaMargin: 0.18,
      ebitMargin: 0.12,
      netMargin: 0.08,
      wacc: 0.09,
      capexPctRevenue: 0.06,
      nwcPctRevenue: 0.15,
    },
  };
  
  const sectorKey = sector.toLowerCase();
  const defaults = sectorDefaults[sectorKey] || sectorDefaults.technology;
  
  if (defaults[field] != null) {
    return {
      field,
      value: defaults[field],
      confidence: 'medium',
      method: 'sector-median',
      source: `sector-${sectorKey}`
    };
  }
  
  return null;
}

/**
 * Try AI Data Extraction (web scraping + OpenAI)
 */
async function tryAIDataExtraction(
  field: string,
  data: Record<string, any>,
  sector?: string
): Promise<InferenceResult | null> {
  try {
    const { extractMissingDataWithAI } = await import('./aiDataExtraction');
    
    const extracted = await extractMissingDataWithAI({
      ticker: data.ticker || 'UNKNOWN',
      companyName: data.companyName,
      sector: sector || data.sector,
      missingFields: [field],
      context: data,
    });
    
    if (extracted && extracted[field] != null && typeof extracted[field] === 'number') {
      return {
        field,
        value: extracted[field] as number,
        confidence: extracted.confidence,
        method: extracted.method,
        source: extracted.source,
      };
    }
  } catch (error) {
    console.warn(`[enhancedInference] AI data extraction failed for ${field}:`, error);
  }
  
  return null;
}

/**
 * Try OpenAI inference for complex cases
 */
async function tryOpenAIInference(
  field: string,
  data: Record<string, any>,
  sector?: string
): Promise<InferenceResult | null> {
  const apiKey = getOpenAIKey('service');
  if (!apiKey) return null;
  
  try {
    const openai = new OpenAI({ apiKey });
    
    const prompt = `You are a financial analyst. Estimate the missing value for "${field}" given this data:

${JSON.stringify(data, null, 2)}

${sector ? `Sector: ${sector}` : ''}

Provide ONLY a numerical value (no text, no explanation). If you cannot estimate, return "null".`;
    
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a financial analyst. Return only numerical values.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 50
    });
    
    const response = completion.choices[0]?.message?.content?.trim();
    if (!response || response === 'null') return null;
    
    const value = parseFloat(response);
    if (isFinite(value) && value > 0) {
      return {
        field,
        value,
        confidence: 'medium',
        method: 'openai-inference',
        source: 'ai-estimation'
      };
    }
  } catch (error) {
    console.error(`[OpenAI Inference] Error for ${field}:`, error);
  }
  
  return null;
}

/**
 * Default fallback values
 */
function tryDefaultFallback(field: string, data: Record<string, any>): InferenceResult | null {
  const defaults: Record<string, number> = {
    revenueGrowth: 0.08,
    ebitdaMargin: 0.25,
    ebitMargin: 0.20,
    netMargin: 0.12,
    wacc: 0.10,
    terminalGrowth: 0.025,
    taxRate: 0.25,
    capexPctRevenue: 0.04,
    nwcPctRevenue: 0.10,
    depreciationPctRevenue: 0.03,
  };
  
  if (defaults[field] != null) {
    return {
      field,
      value: defaults[field],
      confidence: 'low',
      method: 'default-fallback',
      source: 'system-default'
    };
  }
  
  return null;
}

/**
 * Apply inference results to data object
 */
export function applyInferences(data: Record<string, any>, inferences: InferenceResult[]): Record<string, any> {
  const enriched = { ...data };
  
  for (const inference of inferences) {
    if (enriched[inference.field] == null || enriched[inference.field] === 0) {
      enriched[inference.field] = inference.value;
      console.log(`[Inference Applied] ${inference.field}: ${inference.value} (${inference.method}, ${inference.confidence} confidence)`);
    }
  }
  
  return enriched;
}
