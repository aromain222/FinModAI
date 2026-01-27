/**
 * Market Regime Analyzer
 * 
 * Analyzes market conditions and generates regime-aware commentary
 * that adapts to timeframe (1D/1W/1M/1Y/5Y)
 */

export interface MarketRegime {
  regime: 'risk-on' | 'risk-off' | 'rotation' | 'consolidation' | 'breakout' | 'breakdown';
  dominantDrivers: string[];
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
  timeframe: string;
}

export interface MarketSnapshot {
  sp500Change: number;
  nasdaqChange: number;
  dowChange: number;
  vixLevel?: number;
  tenYearYield?: number;
  timeframe: '1D' | '1W' | '1M' | '1Y' | '5Y';
}

/**
 * Analyze market regime based on price action and timeframe
 */
export function analyzeMarketRegime(snapshot: MarketSnapshot): MarketRegime {
  const { sp500Change, nasdaqChange, dowChange, vixLevel, timeframe } = snapshot;
  
  // Determine regime
  let regime: MarketRegime['regime'];
  const drivers: string[] = [];
  let explanation = '';
  
  const avgChange = (sp500Change + nasdaqChange + dowChange) / 3;
  const techOutperformance = nasdaqChange - dowChange;
  const volatility = vixLevel || 0;
  
  // Risk-on: broad gains, low vol
  if (avgChange > 2 && volatility < 20) {
    regime = 'risk-on';
    drivers.push('Broad market strength');
    if (techOutperformance > 1) {
      drivers.push('Tech leadership');
    }
    explanation = generateRiskOnExplanation(timeframe, techOutperformance);
  }
  // Risk-off: broad losses, high vol
  else if (avgChange < -2 && volatility > 25) {
    regime = 'risk-off';
    drivers.push('Flight to safety');
    if (volatility > 30) {
      drivers.push('Elevated volatility');
    }
    explanation = generateRiskOffExplanation(timeframe, volatility);
  }
  // Rotation: divergence between indices
  else if (Math.abs(techOutperformance) > 3) {
    regime = 'rotation';
    if (techOutperformance > 0) {
      drivers.push('Growth outperforming value');
    } else {
      drivers.push('Value outperforming growth');
    }
    explanation = generateRotationExplanation(timeframe, techOutperformance);
  }
  // Breakout: strong directional move
  else if (avgChange > 5) {
    regime = 'breakout';
    drivers.push('Strong directional momentum');
    explanation = generateBreakoutExplanation(timeframe, avgChange);
  }
  // Breakdown: sharp decline
  else if (avgChange < -5) {
    regime = 'breakdown';
    drivers.push('Sharp decline');
    explanation = generateBreakdownExplanation(timeframe, avgChange);
  }
  // Consolidation: range-bound
  else {
    regime = 'consolidation';
    drivers.push('Range-bound trading');
    explanation = generateConsolidationExplanation(timeframe);
  }
  
  // Determine confidence based on signal clarity
  const confidence = determineConfidence(avgChange, volatility, techOutperformance);
  
  return {
    regime,
    dominantDrivers: drivers,
    explanation,
    confidence,
    timeframe,
  };
}

function generateRiskOnExplanation(timeframe: string, techOutperformance: number): string {
  const timeframeContext = getTimeframeContext(timeframe);
  
  if (techOutperformance > 1) {
    return `${timeframeContext}, markets are in risk-on mode with tech leading. This suggests investors are pricing in growth acceleration or rate relief. Watch for: earnings revisions, Fed pivot signals, or growth data surprises.`;
  }
  
  return `${timeframeContext}, markets are in broad risk-on mode. Likely drivers: improving macro data, easing financial conditions, or reduced geopolitical risk. Beneficiaries: cyclicals, small caps, high beta.`;
}

function generateRiskOffExplanation(timeframe: string, volatility: number): string {
  const timeframeContext = getTimeframeContext(timeframe);
  
  if (volatility > 30) {
    return `${timeframeContext}, markets are in risk-off mode with elevated volatility (VIX ${volatility.toFixed(0)}). This signals acute uncertainty—likely from macro shocks, policy surprises, or systemic stress. Beneficiaries: treasuries, defensives, USD.`;
  }
  
  return `${timeframeContext}, markets are in risk-off mode. Likely drivers: growth concerns, hawkish policy, or geopolitical escalation. Watch for: credit spreads widening, defensive rotation, or liquidity stress.`;
}

function generateRotationExplanation(timeframe: string, techOutperformance: number): string {
  const timeframeContext = getTimeframeContext(timeframe);
  
  if (techOutperformance > 0) {
    return `${timeframeContext}, growth is outperforming value by ${Math.abs(techOutperformance).toFixed(1)}%. This suggests: rate cut expectations, AI/tech optimism, or flight to quality in mega-cap tech. Risk: crowding, multiple expansion without earnings support.`;
  }
  
  return `${timeframeContext}, value is outperforming growth by ${Math.abs(techOutperformance).toFixed(1)}%. This suggests: rate stability, inflation concerns, or mean reversion. Beneficiaries: financials, energy, industrials.`;
}

function generateBreakoutExplanation(timeframe: string, avgChange: number): string {
  const timeframeContext = getTimeframeContext(timeframe);
  return `${timeframeContext}, markets are breaking out (+${avgChange.toFixed(1)}%). This is a strong directional move—likely from a major catalyst (Fed pivot, earnings surprise, policy shift). Watch for: momentum exhaustion, overbought conditions, or profit-taking.`;
}

function generateBreakdownExplanation(timeframe: string, avgChange: number): string {
  const timeframeContext = getTimeframeContext(timeframe);
  return `${timeframeContext}, markets are breaking down (${avgChange.toFixed(1)}%). This is a sharp decline—likely from a negative catalyst (macro miss, hawkish surprise, systemic risk). Watch for: capitulation signals, support levels, or policy response.`;
}

function generateConsolidationExplanation(timeframe: string): string {
  const timeframeContext = getTimeframeContext(timeframe);
  return `${timeframeContext}, markets are consolidating in a range. This suggests: uncertainty, awaiting catalysts, or digesting prior moves. Watch for: breakout triggers (data, earnings, policy) or breakdown risks (negative surprises).`;
}

function getTimeframeContext(timeframe: string): string {
  switch (timeframe) {
    case '1D':
      return 'Today';
    case '1W':
      return 'Over the past week';
    case '1M':
      return 'Over the past month';
    case '1Y':
      return 'Over the past year';
    case '5Y':
      return 'Over the past 5 years';
    default:
      return 'Recently';
  }
}

function determineConfidence(
  avgChange: number,
  volatility: number,
  techOutperformance: number
): 'high' | 'medium' | 'low' {
  // High confidence: clear signals
  if (Math.abs(avgChange) > 5 || volatility > 30 || Math.abs(techOutperformance) > 5) {
    return 'high';
  }
  
  // Medium confidence: moderate signals
  if (Math.abs(avgChange) > 2 || volatility > 20 || Math.abs(techOutperformance) > 2) {
    return 'medium';
  }
  
  // Low confidence: weak signals
  return 'low';
}

/**
 * Generate sector impact analysis
 */
export function analyzeSectorImpact(regime: MarketRegime): {
  beneficiaries: string[];
  losers: string[];
  neutral: string[];
} {
  switch (regime.regime) {
    case 'risk-on':
      return {
        beneficiaries: ['Cyclicals', 'Small Caps', 'Industrials', 'Materials', 'Discretionary'],
        losers: ['Utilities', 'Staples', 'Treasuries'],
        neutral: ['Healthcare', 'Real Estate'],
      };
    
    case 'risk-off':
      return {
        beneficiaries: ['Utilities', 'Staples', 'Healthcare', 'Treasuries', 'USD'],
        losers: ['Cyclicals', 'Small Caps', 'High Beta', 'Emerging Markets'],
        neutral: ['Large Cap Tech (quality flight)'],
      };
    
    case 'rotation':
      if (regime.dominantDrivers.includes('Growth outperforming value')) {
        return {
          beneficiaries: ['Tech', 'Communication Services', 'Discretionary'],
          losers: ['Financials', 'Energy', 'Industrials'],
          neutral: ['Healthcare', 'Real Estate'],
        };
      } else {
        return {
          beneficiaries: ['Financials', 'Energy', 'Industrials', 'Materials'],
          losers: ['Tech', 'Communication Services'],
          neutral: ['Healthcare', 'Utilities'],
        };
      }
    
    case 'breakout':
      return {
        beneficiaries: ['Momentum stocks', 'High beta', 'Cyclicals'],
        losers: ['Shorts', 'Defensive hedges'],
        neutral: ['Quality defensives'],
      };
    
    case 'breakdown':
      return {
        beneficiaries: ['Volatility products', 'Treasuries', 'Gold'],
        losers: ['Equities (broad)', 'High yield', 'Commodities'],
        neutral: ['Cash', 'Investment grade bonds'],
      };
    
    case 'consolidation':
    default:
      return {
        beneficiaries: ['Range traders', 'Theta strategies'],
        losers: ['Momentum strategies', 'Breakout traders'],
        neutral: ['Most sectors'],
      };
  }
}

