/**
 * Macro Event Phrasing Rules
 * Post-processes template outputs to be more decisive and remove uncertainty language
 */

import type { MacroEventTemplate } from './macroEventTemplates';

/**
 * Apply phrasing rules to make output more decisive
 */
export function applyPhrasingRules(template: MacroEventTemplate, deterministic: boolean = false): MacroEventTemplate {
  if (!deterministic) {
    return template; // Skip if not in deterministic mode
  }

  const processed = { ...template };

  // Process whatHappened.oneLine
  processed.whatHappened.oneLine = replaceUncertaintyLanguage(processed.whatHappened.oneLine);
  processed.whatHappened.details = processed.whatHappened.details.map(replaceUncertaintyLanguage);

  // Process marketImpact
  processed.marketImpact = processed.marketImpact.map((impact) => ({
    ...impact,
    shortTerm: replaceUncertaintyLanguage(impact.shortTerm),
    watch: impact.watch.startsWith('Watch for') 
      ? impact.watch 
      : `Watch for confirmation via: ${impact.watch}`,
  }));

  // Ensure sectors are labeled as "Most sensitive sectors:"
  if (processed.winnersLosers.sectorsUp.length > 0) {
    // Already in array format, but ensure we have at least 2-4
    if (processed.winnersLosers.sectorsUp.length < 2) {
      // Add placeholder if needed (shouldn't happen with good templates)
      processed.winnersLosers.sectorsUp = [...processed.winnersLosers.sectorsUp, 'XLE'];
    }
  }

  if (processed.winnersLosers.sectorsDown.length > 0) {
    if (processed.winnersLosers.sectorsDown.length < 2) {
      processed.winnersLosers.sectorsDown = [...processed.winnersLosers.sectorsDown, 'XLU'];
    }
  }

  // Ensure stocksToWatch has 3-6 tickers
  if (processed.winnersLosers.stocksToWatch.length < 3) {
    // Add common tickers based on category
    const defaultTickers = getDefaultTickersForCategory(processed.category);
    const existingTickers = new Set(processed.winnersLosers.stocksToWatch.map(s => s.ticker));
    for (const ticker of defaultTickers) {
      if (processed.winnersLosers.stocksToWatch.length >= 6) break;
      if (!existingTickers.has(ticker)) {
        processed.winnersLosers.stocksToWatch.push({
          ticker,
          why: getDefaultWhyForTicker(ticker, processed.category),
        });
      }
    }
  }

  // Ensure scenarios have 1-2 key variables
  processed.scenarios = processed.scenarios.map((scenario) => {
    // Ensure assumptions list key variables that would flip the scenario
    const assumptions = scenario.assumptions || [];
    if (assumptions.length < 1) {
      // Add default key variable based on category
      assumptions.push(getDefaultKeyVariable(processed.category));
    }
    return {
      ...scenario,
      assumptions: assumptions.slice(0, 2), // Max 2 key variables
    };
  });

  return processed;
}

/**
 * Replace uncertainty language with decisive phrasing
 */
function replaceUncertaintyLanguage(text: string): string {
  let result = text;

  // Replace "may" with "typically" or remove
  result = result.replace(/\b(may|might|could)\s+(be|have|see|show|indicate|suggest|lead to|result in|cause)/gi, (match, word, verb) => {
    if (verb === 'be') return 'typically is';
    if (verb === 'have') return 'typically has';
    if (verb === 'see') return 'typically sees';
    if (verb === 'show') return 'typically shows';
    if (verb === 'indicate') return 'typically indicates';
    if (verb === 'suggest') return 'typically suggests';
    if (verb === 'lead to') return 'typically leads to';
    if (verb === 'result in') return 'typically results in';
    if (verb === 'cause') return 'typically causes';
    return `typically ${verb}`;
  });

  // Replace "may" at start of sentence
  result = result.replace(/^(May|Might|Could)\s+/i, 'Typically ');

  // Replace "could potentially" with "typically"
  result = result.replace(/\bcould potentially\b/gi, 'typically');

  // Replace "might" with "typically" in general contexts
  result = result.replace(/\bmight\s+(affect|impact|influence|drive|push|pull)/gi, 'typically $1');

  // Replace "may" with "typically" when describing mechanisms
  result = result.replace(/\b(may|might)\s+(drive|push|pull|affect|impact|influence|lead to|result in)/gi, 'typically $2');

  // Clean up double "typically"
  result = result.replace(/\btypically typically\b/gi, 'typically');

  return result;
}

/**
 * Get default tickers for a category
 */
function getDefaultTickersForCategory(category: MacroEventTemplate['category']): string[] {
  const defaults: Record<MacroEventTemplate['category'], string[]> = {
    CPI: ['XLU', 'XLRE', 'QQQ', 'GLD', 'TLT', 'SPY'],
    FED: ['JPM', 'BAC', 'XLU', 'XLRE', 'QQQ', 'SPY'],
    JOBS: ['XLY', 'XLI', 'XLP', 'XLV', 'XLE', 'SPY'],
    OIL: ['XLE', 'XOM', 'CVX', 'DAL', 'UAL', 'IYT'],
    GEOPOLITICS: ['LMT', 'RTX', 'NOC', 'XLE', 'GLD', 'IWM'],
  };
  return defaults[category] || ['SPY', 'QQQ', 'XLE', 'GLD'];
}

/**
 * Get default "why" for a ticker
 */
function getDefaultWhyForTicker(ticker: string, category: MacroEventTemplate['category']): string {
  const reasons: Record<string, string> = {
    XLU: 'Rate-sensitive utilities',
    XLRE: 'Real estate sensitivity',
    QQQ: 'Duration exposure',
    GLD: 'Safe haven / real rates',
    TLT: 'Duration exposure',
    SPY: 'Broad market indicator',
    JPM: 'Bank margins',
    BAC: 'Bank margins',
    XLY: 'Consumer discretionary',
    XLI: 'Industrial exposure',
    XLP: 'Defensive positioning',
    XLV: 'Defensive positioning',
    XLE: 'Energy sector',
    XOM: 'Oil major',
    CVX: 'Oil major',
    DAL: 'Airlines cost impact',
    UAL: 'Airlines cost impact',
    IYT: 'Transport costs',
    LMT: 'Defense contractor',
    RTX: 'Aerospace defense',
    NOC: 'Defense contractor',
    IWM: 'High beta exposure',
  };
  return reasons[ticker] || 'Sector exposure';
}

/**
 * Get default key variable for a category
 */
function getDefaultKeyVariable(category: MacroEventTemplate['category']): string {
  const variables: Record<MacroEventTemplate['category'], string> = {
    CPI: 'Core CPI / PCE trend',
    FED: 'Fed dot plot revisions',
    JOBS: 'Wage growth trend',
    OIL: 'OPEC compliance / inventory data',
    GEOPOLITICS: 'Sanctions regime / energy disruption',
  };
  return variables[category] || 'Key macro variable';
}

/**
 * Validate template has required fields
 */
export function validateTemplateCompleteness(template: MacroEventTemplate): {
  valid: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  // Check sectors
  if (template.winnersLosers.sectorsUp.length < 2) {
    missing.push('sectorsUp (need 2-4)');
  }
  if (template.winnersLosers.sectorsDown.length < 2) {
    missing.push('sectorsDown (need 2-4)');
  }

  // Check stocksToWatch
  if (template.winnersLosers.stocksToWatch.length < 3) {
    missing.push('stocksToWatch (need 3-6)');
  }

  // Check scenarios have key variables
  for (const scenario of template.scenarios) {
    if (scenario.assumptions.length < 1) {
      missing.push(`scenario ${scenario.name} assumptions (need 1-2 key variables)`);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Add data availability disclaimer if needed
 */
export function addDataDisclaimers(
  template: MacroEventTemplate,
  hasMacroData: boolean,
  hasMarketData: boolean
): MacroEventTemplate {
  if (hasMacroData && hasMarketData) {
    return template; // No disclaimer needed
  }

  const processed = { ...template };

  // Add disclaimer to whatHappened if data is missing
  if (!hasMacroData || !hasMarketData) {
    const disclaimer = 'No confirming data; using typical market transmission.';
    if (!processed.whatHappened.details.includes(disclaimer)) {
      processed.whatHappened.details = [disclaimer, ...processed.whatHappened.details].slice(0, 4);
    }
  }

  return processed;
}

