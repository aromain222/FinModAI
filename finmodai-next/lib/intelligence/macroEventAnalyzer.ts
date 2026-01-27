/**
 * Macro Event Analyzer
 * 
 * Analyzes real-world events and explains transmission mechanisms to markets
 * Produces probabilistic predictions with clear assumptions
 */

export interface MacroEvent {
  title: string;
  summary: string;
  location?: string;
  tags?: string[];
}

export interface EventAnalysis {
  whatHappened: string;
  where: string;
  whoIsAffected: string[];
  transmissionMechanisms: TransmissionChannel[];
  affectedAssets: AssetImpact[];
  confidence: 'high' | 'medium' | 'low';
  assumptions: string[];
  timeHorizon: 'immediate' | 'near-term' | 'medium-term' | 'long-term';
}

export interface TransmissionChannel {
  channel: 'inflation' | 'growth' | 'risk-premium' | 'commodities' | 'fx' | 'credit' | 'policy';
  direction: 'positive' | 'negative' | 'neutral';
  explanation: string;
}

export interface AssetImpact {
  asset: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  magnitude: 'high' | 'medium' | 'low';
  reasoning: string;
}

/**
 * Analyze a macro event and generate structured intelligence
 */
export function analyzeMacroEvent(event: MacroEvent): EventAnalysis {
  const text = `${event.title} ${event.summary}`.toLowerCase();
  const tags = event.tags || [];
  
  // Detect event type
  const eventType = detectEventType(text, tags);
  
  // Generate analysis based on event type
  switch (eventType) {
    case 'war-conflict':
      return analyzeConflict(event, text);
    case 'trade-tariff':
      return analyzeTrade(event, text);
    case 'central-bank':
      return analyzeCentralBank(event, text);
    case 'election':
      return analyzeElection(event, text);
    case 'energy-shock':
      return analyzeEnergy(event, text);
    case 'supply-chain':
      return analyzeSupplyChain(event, text);
    default:
      return analyzeGeneric(event, text);
  }
}

function detectEventType(text: string, tags: string[]): string {
  if (text.includes('war') || text.includes('conflict') || text.includes('military')) {
    return 'war-conflict';
  }
  if (text.includes('tariff') || text.includes('trade war') || text.includes('sanctions')) {
    return 'trade-tariff';
  }
  if (text.includes('fed') || text.includes('central bank') || text.includes('rate')) {
    return 'central-bank';
  }
  if (text.includes('election') || text.includes('vote') || text.includes('policy')) {
    return 'election';
  }
  if (text.includes('oil') || text.includes('energy') || text.includes('opec')) {
    return 'energy-shock';
  }
  if (text.includes('supply chain') || text.includes('shortage') || text.includes('logistics')) {
    return 'supply-chain';
  }
  return 'generic';
}

function analyzeConflict(event: MacroEvent, text: string): EventAnalysis {
  const location = event.location || extractLocation(text);
  
  return {
    whatHappened: `Military conflict or geopolitical escalation in ${location}`,
    where: location,
    whoIsAffected: [
      'Regional economies',
      'Global supply chains',
      'Energy markets',
      'Defense contractors',
      'Commodity exporters',
    ],
    transmissionMechanisms: [
      {
        channel: 'risk-premium',
        direction: 'negative',
        explanation: 'Geopolitical uncertainty increases risk premium across assets. Flight to safety into USD, treasuries, gold.',
      },
      {
        channel: 'commodities',
        direction: 'negative',
        explanation: 'Disruption to commodity flows (oil, gas, grains) drives price spikes. Inflationary pressure.',
      },
      {
        channel: 'growth',
        direction: 'negative',
        explanation: 'Trade disruption and uncertainty weigh on global growth expectations.',
      },
    ],
    affectedAssets: [
      {
        asset: 'Energy (Oil, Gas)',
        direction: 'bullish',
        magnitude: 'high',
        reasoning: 'Supply disruption risk premium',
      },
      {
        asset: 'Defense (LMT, RTX, NOC)',
        direction: 'bullish',
        magnitude: 'medium',
        reasoning: 'Increased defense spending expectations',
      },
      {
        asset: 'Treasuries',
        direction: 'bullish',
        magnitude: 'medium',
        reasoning: 'Flight to safety',
      },
      {
        asset: 'Emerging Markets',
        direction: 'bearish',
        magnitude: 'high',
        reasoning: 'Risk-off, capital flight',
      },
      {
        asset: 'European Equities',
        direction: 'bearish',
        magnitude: 'medium',
        reasoning: 'Regional exposure, energy cost shock',
      },
    ],
    confidence: 'high',
    assumptions: [
      'Conflict does not escalate to direct NATO involvement',
      'Energy supply disruption remains regional',
      'Central banks do not aggressively tighten in response to inflation',
    ],
    timeHorizon: 'immediate',
  };
}

function analyzeTrade(event: MacroEvent, text: string): EventAnalysis {
  const isTariff = text.includes('tariff');
  const isSanction = text.includes('sanction');
  
  return {
    whatHappened: isTariff ? 'New tariffs imposed on imports' : isSanction ? 'Economic sanctions announced' : 'Trade policy shift',
    where: extractLocation(text) || 'Global',
    whoIsAffected: [
      'Exporters to affected regions',
      'Importers of affected goods',
      'Multinational corporations',
      'Commodity producers',
    ],
    transmissionMechanisms: [
      {
        channel: 'inflation',
        direction: 'negative',
        explanation: 'Tariffs increase import costs, pass-through to consumer prices. Inflationary pressure.',
      },
      {
        channel: 'growth',
        direction: 'negative',
        explanation: 'Trade friction reduces efficiency, weighs on global growth.',
      },
      {
        channel: 'fx',
        direction: 'negative',
        explanation: 'Currency of tariff-imposing country may appreciate (reduced imports), target country depreciates.',
      },
    ],
    affectedAssets: [
      {
        asset: 'Domestic Producers',
        direction: 'bullish',
        magnitude: 'medium',
        reasoning: 'Protected from foreign competition',
      },
      {
        asset: 'Exporters',
        direction: 'bearish',
        magnitude: 'high',
        reasoning: 'Retaliatory tariffs, reduced demand',
      },
      {
        asset: 'Commodities (Industrial)',
        direction: 'bearish',
        magnitude: 'medium',
        reasoning: 'Reduced global trade activity',
      },
    ],
    confidence: 'medium',
    assumptions: [
      'Tariffs are implemented as announced',
      'Retaliation is proportional, not escalatory',
      'Supply chains do not fully relocate (sticky)',
    ],
    timeHorizon: 'near-term',
  };
}

function analyzeCentralBank(event: MacroEvent, text: string): EventAnalysis {
  const isHike = text.includes('hike') || text.includes('raise');
  const isCut = text.includes('cut') || text.includes('lower');
  
  return {
    whatHappened: isHike ? 'Central bank raises interest rates' : isCut ? 'Central bank cuts interest rates' : 'Central bank policy shift',
    where: extractLocation(text) || 'US',
    whoIsAffected: [
      'All asset classes',
      'Borrowers (consumers, corporates)',
      'Banks and financials',
      'Growth stocks',
    ],
    transmissionMechanisms: [
      {
        channel: 'policy',
        direction: isHike ? 'negative' : 'positive',
        explanation: isHike 
          ? 'Higher rates increase discount rates, reduce present value of future cash flows. Tightens financial conditions.'
          : 'Lower rates decrease discount rates, increase present value of future cash flows. Eases financial conditions.',
      },
      {
        channel: 'growth',
        direction: isHike ? 'negative' : 'positive',
        explanation: isHike
          ? 'Higher borrowing costs slow credit creation, consumption, and investment.'
          : 'Lower borrowing costs stimulate credit creation, consumption, and investment.',
      },
    ],
    affectedAssets: [
      {
        asset: 'Growth Stocks (Tech)',
        direction: isHike ? 'bearish' : 'bullish',
        magnitude: 'high',
        reasoning: 'Long-duration assets most sensitive to discount rate changes',
      },
      {
        asset: 'Financials (Banks)',
        direction: isHike ? 'bullish' : 'bearish',
        magnitude: 'medium',
        reasoning: isHike ? 'Higher net interest margins' : 'Compressed net interest margins',
      },
      {
        asset: 'USD',
        direction: isHike ? 'bullish' : 'bearish',
        magnitude: 'medium',
        reasoning: 'Rate differentials drive currency flows',
      },
    ],
    confidence: 'high',
    assumptions: [
      'Market has not fully priced in the move',
      'Policy is sustained (not reversed quickly)',
      'No offsetting fiscal policy',
    ],
    timeHorizon: 'immediate',
  };
}

function analyzeElection(event: MacroEvent, text: string): EventAnalysis {
  return {
    whatHappened: 'Election or major policy vote',
    where: extractLocation(text) || 'Unknown',
    whoIsAffected: [
      'Domestic equities',
      'Regulated industries',
      'Government contractors',
      'Currency markets',
    ],
    transmissionMechanisms: [
      {
        channel: 'policy',
        direction: 'neutral',
        explanation: 'Policy uncertainty resolves (or increases). Market impact depends on outcome and expectations.',
      },
      {
        channel: 'risk-premium',
        direction: 'neutral',
        explanation: 'Political risk premium adjusts based on outcome.',
      },
    ],
    affectedAssets: [
      {
        asset: 'Domestic Equities',
        direction: 'neutral',
        magnitude: 'medium',
        reasoning: 'Depends on policy platform and market expectations',
      },
    ],
    confidence: 'low',
    assumptions: [
      'Outcome is not contested',
      'Policy implementation follows campaign promises',
      'No major surprises',
    ],
    timeHorizon: 'near-term',
  };
}

function analyzeEnergy(event: MacroEvent, text: string): EventAnalysis {
  return {
    whatHappened: 'Energy supply shock or OPEC policy shift',
    where: extractLocation(text) || 'Global',
    whoIsAffected: [
      'Energy consumers (airlines, transport)',
      'Energy producers',
      'Inflation-sensitive assets',
      'Emerging markets (importers)',
    ],
    transmissionMechanisms: [
      {
        channel: 'inflation',
        direction: 'negative',
        explanation: 'Higher energy costs pass through to broader inflation. Central banks may tighten.',
      },
      {
        channel: 'growth',
        direction: 'negative',
        explanation: 'Energy shock acts as tax on consumers, reduces disposable income and spending.',
      },
      {
        channel: 'commodities',
        direction: 'negative',
        explanation: 'Oil price spike ripples through commodity complex.',
      },
    ],
    affectedAssets: [
      {
        asset: 'Energy (XLE, XOP)',
        direction: 'bullish',
        magnitude: 'high',
        reasoning: 'Direct beneficiary of higher prices',
      },
      {
        asset: 'Airlines (DAL, UAL)',
        direction: 'bearish',
        magnitude: 'high',
        reasoning: 'Fuel cost shock, margin compression',
      },
      {
        asset: 'Consumer Discretionary',
        direction: 'bearish',
        magnitude: 'medium',
        reasoning: 'Reduced disposable income',
      },
    ],
    confidence: 'high',
    assumptions: [
      'Supply shock is sustained (not transitory)',
      'No strategic reserve releases',
      'Demand remains inelastic',
    ],
    timeHorizon: 'immediate',
  };
}

function analyzeSupplyChain(event: MacroEvent, text: string): EventAnalysis {
  return {
    whatHappened: 'Supply chain disruption or logistics bottleneck',
    where: extractLocation(text) || 'Global',
    whoIsAffected: [
      'Manufacturers',
      'Retailers',
      'Logistics companies',
      'Consumers',
    ],
    transmissionMechanisms: [
      {
        channel: 'inflation',
        direction: 'negative',
        explanation: 'Supply constraints drive input cost inflation, pass-through to prices.',
      },
      {
        channel: 'growth',
        direction: 'negative',
        explanation: 'Production delays reduce output, weigh on growth.',
      },
    ],
    affectedAssets: [
      {
        asset: 'Logistics (FDX, UPS)',
        direction: 'bullish',
        magnitude: 'medium',
        reasoning: 'Pricing power in tight capacity environment',
      },
      {
        asset: 'Retailers (WMT, TGT)',
        direction: 'bearish',
        magnitude: 'medium',
        reasoning: 'Inventory shortages, margin pressure',
      },
    ],
    confidence: 'medium',
    assumptions: [
      'Disruption is temporary (not structural)',
      'Demand does not collapse',
      'No policy intervention',
    ],
    timeHorizon: 'near-term',
  };
}

function analyzeGeneric(event: MacroEvent, text: string): EventAnalysis {
  return {
    whatHappened: event.title,
    where: extractLocation(text) || 'Unknown',
    whoIsAffected: ['To be determined'],
    transmissionMechanisms: [],
    affectedAssets: [],
    confidence: 'low',
    assumptions: ['Insufficient information for detailed analysis'],
    timeHorizon: 'medium-term',
  };
}

function extractLocation(text: string): string {
  const locations = ['US', 'China', 'Europe', 'Russia', 'Middle East', 'Asia', 'Latin America'];
  for (const loc of locations) {
    if (text.toLowerCase().includes(loc.toLowerCase())) {
      return loc;
    }
  }
  return 'Global';
}

