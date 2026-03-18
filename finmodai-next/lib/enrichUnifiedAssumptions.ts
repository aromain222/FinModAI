/**
 * Enrich Unified Assumptions
 * Uses AI to enhance and validate financial assumptions
 */

import { generateTextWithProviderFallback } from '@/lib/llm/generateText';
import { CAPITAL_BASE_THREE_STATEMENT_VALIDATION_SYSTEM } from '@/lib/prompts/capitalBaseThreeStatement';

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
  // Enhanced data sources
  historicalData?: Record<string, number[]>;
  consensusEstimates?: any;
  peerComps?: any;
  workingCapitalDetails?: any;
  [key: string]: any;
}

export interface EnrichedAssumptions extends UnifiedAssumptions {
  enriched: boolean;
  aiSuggestions?: string[];
  confidence?: 'high' | 'medium' | 'low';
}

/**
 * Enrich assumptions using AI and enhanced inference
 */
export async function enrichUnifiedAssumptions(
  assumptions: UnifiedAssumptions | any, // Accept both types for compatibility
  historicalData?: Record<string, number[]>
): Promise<EnrichedAssumptions> {
  // Extract enhanced data sources from assumptions
  const consensusEstimates = assumptions.consensusEstimates;
  const peerComps = assumptions.peerComps;
  const workingCapitalDetails = assumptions.workingCapitalDetails;
  const historicalDataFromAssumptions = assumptions.historicalData || historicalData;
  
  // CRITICAL: Preserve revenue from assumptions if it exists (this is LTM data from the ticker)
  // Don't overwrite it during enrichment
  const preservedRevenue = assumptions.revenue && Array.isArray(assumptions.revenue) && assumptions.revenue.length > 0
    ? assumptions.revenue
    : undefined;
  
  // Step 1: Use enhanced inference to fill missing data
  const { inferMissingDataEnhanced, applyInferences } = await import('@/lib/data/enhancedInference');
  
  // Identify missing fields
  // NOTE: revenue is NOT in requiredFields - we preserve it from LTM data, not infer it
  const missingFields: string[] = [];
  const requiredFields = [
    'revenueGrowth', 'ebitdaMargin', 'ebitMargin', 'netMargin',
    'wacc', 'terminalGrowth', 'taxRate', 'capexPctRevenue', 'nwcPctRevenue',
    'depreciationPctRevenue', 'ebitda', 'ebit', 'netIncome', 'grossProfit',
    'netDebt', 'totalEquity', 'workingCapital', 'freeCashFlow', 'operatingCashFlow'
  ];
  
  for (const field of requiredFields) {
    if (assumptions[field] == null || assumptions[field] === 0) {
      missingFields.push(field);
    }
  }
  
  // Enhance data with consensus estimates if available
  let dataWithEstimates = { ...assumptions };
  if (consensusEstimates) {
    // Use consensus revenue estimates for growth projections
    if (consensusEstimates.revenueEstimateFY1 && assumptions.revenue) {
      const growth = (consensusEstimates.revenueEstimateFY1 - assumptions.revenue) / assumptions.revenue;
      if (!dataWithEstimates.revenueGrowth || dataWithEstimates.revenueGrowth === 0) {
        dataWithEstimates.revenueGrowth = Math.max(0, Math.min(0.5, growth)); // Clamp to 0-50%
      }
    }
  }
  
  // Enhance data with peer medians if available
  if (peerComps && peerComps.medians) {
    const medians = peerComps.medians;
    // Use peer medians as defaults for missing fields
    if (!dataWithEstimates.revenueGrowth || dataWithEstimates.revenueGrowth === 0) {
      dataWithEstimates.revenueGrowth = medians.revenueGrowth;
    }
    if (!dataWithEstimates.ebitdaMargin || dataWithEstimates.ebitdaMargin === 0) {
      dataWithEstimates.ebitdaMargin = medians.ebitdaMargin;
    }
    if (!dataWithEstimates.capexPctRevenue || dataWithEstimates.capexPctRevenue === 0) {
      dataWithEstimates.capexPctRevenue = medians.capexPctRevenue;
    }
    if (!dataWithEstimates.nwcPctRevenue || dataWithEstimates.nwcPctRevenue === 0) {
      dataWithEstimates.nwcPctRevenue = medians.nwcPctRevenue;
    }
  }
  
  // Enhance data with working capital details if available
  if (workingCapitalDetails) {
    // Use actual working capital days if available
    if (workingCapitalDetails.arDays > 0 && !assumptions.arDays) {
      dataWithEstimates.arDays = workingCapitalDetails.arDays;
    }
    if (workingCapitalDetails.inventoryDays > 0 && !assumptions.inventoryDays) {
      dataWithEstimates.inventoryDays = workingCapitalDetails.inventoryDays;
    }
    if (workingCapitalDetails.apDays > 0 && !assumptions.apDays) {
      dataWithEstimates.apDays = workingCapitalDetails.apDays;
    }
    if (workingCapitalDetails.nwcPctRevenue > 0 && !dataWithEstimates.nwcPctRevenue) {
      dataWithEstimates.nwcPctRevenue = workingCapitalDetails.nwcPctRevenue;
    }
  }
  
  // Run enhanced inference
  let enrichedData = dataWithEstimates;
  let inferences: any[] = [];
  
  if (missingFields.length > 0) {
    console.log(`[enrichUnifiedAssumptions] Filling ${missingFields.length} missing fields using enhanced inference`);
    
    // Pass peer medians to inference for sector median fallback
    const peerMedians = peerComps?.medians ? {
      revenueGrowth: peerComps.medians.revenueGrowth,
      ebitdaMargin: peerComps.medians.ebitdaMargin,
      ebitMargin: peerComps.medians.ebitMargin,
      netMargin: peerComps.medians.netMargin,
      capexPctRevenue: peerComps.medians.capexPctRevenue,
      nwcPctRevenue: peerComps.medians.nwcPctRevenue,
    } : undefined;
    
    inferences = await inferMissingDataEnhanced(
      enrichedData,
      missingFields,
      assumptions.sector || peerComps?.sector,
      historicalDataFromAssumptions,
      peerMedians
    );
    
    enrichedData = applyInferences(enrichedData, inferences);
  }
  
  // Step 2: Use OpenAI for validation and additional suggestions (optional) — service key for backend
  let aiSuggestions: string[] = [];
  let confidence: 'high' | 'medium' | 'low' = inferences.length > 0 ? 'high' : 'medium';
  
  if (missingFields.length > 0) {
    try {
      const prompt = buildEnrichmentPrompt(enrichedData);
      
      console.log('🔥 LLM CALL FIRED (assumption validation)', {
        ticker: assumptions.ticker,
        missingFields: missingFields.length,
        timestamp: new Date().toISOString(),
      });

      const isThreeStatement = assumptions.modelType === 'three-statement';
      const systemContent = isThreeStatement
        ? CAPITAL_BASE_THREE_STATEMENT_VALIDATION_SYSTEM
        : 'You are a financial analyst helping to validate and improve financial model assumptions. Provide concise, actionable suggestions.';

      const response = await generateTextWithProviderFallback({
        clientType: 'service',
        preferredProvider: 'anthropic',
        temperature: 0.3,
        maxTokens: 500,
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: prompt }
        ],
      });

      console.log('✅ LLM CALL SUCCESS (assumption validation)', {
        provider: response?.provider,
        model: response?.model,
      });

      const aiResponse = response?.text || '';
      aiSuggestions = parseAISuggestions(aiResponse);
      confidence = 'high';
    } catch (error) {
      console.error('[enrichUnifiedAssumptions] AI validation failed (non-blocking):', error);
      // Continue with inference results even if provider calls fail
    }
  }
  
  // Apply final defaults for any remaining missing values
  const finalData = applyDefaults(enrichedData);
  
  // CRITICAL: Restore preserved revenue if it was set (this is LTM data from the ticker)
  // This ensures SOFI-specific revenue is not overwritten by enrichment
  if (preservedRevenue) {
    finalData.revenue = preservedRevenue;
    console.log(
      `[enrichUnifiedAssumptions] ✅ Preserved revenue from LTM data: ${preservedRevenue
        .map((r: unknown) => (typeof r === 'number' ? r.toFixed(0) : String(r)))
        .join(', ')}`
    );
  }
  
  return {
    ...finalData,
    enriched: inferences.length > 0 || aiSuggestions.length > 0,
    aiSuggestions: aiSuggestions.length > 0 ? aiSuggestions : undefined,
    confidence
  };
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
