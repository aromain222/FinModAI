/**
 * Agent Router
 * 
 * Deterministic routing from prompt -> intent -> models
 * Uses rule-based keyword matching, no LLM for routing decisions.
 */

import type { Intent, ModelToCreate } from '@/lib/ai/pipelineSchema';

/**
 * Extract ticker symbols from prompt using regex
 * Supports: AAPL, $AAPL, AAPL,MSFT,TSLA, etc.
 */
export function extractTickers(prompt: string): string[] {
  // Pattern matches:
  // - $TICKER or TICKER (1-5 uppercase letters/numbers)
  // - Comma-separated lists
  const tickerPattern = /\$?([A-Z]{1,5})(?:\s*,\s*\$?([A-Z]{1,5}))*/g;
  const matches = prompt.match(/\b[A-Z]{1,5}\b/g) || [];
  
  // Filter out common words that match ticker pattern
  const stopWords = new Set([
    'THE', 'AND', 'OR', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS',
    'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'MAN', 'NEW', 'NOW',
    'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'ITS', 'LET', 'PUT', 'SAY', 'SHE',
    'TOO', 'USE', 'YEAR', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP',
    'OCT', 'NOV', 'DEC', 'USD', 'EUR', 'GBP', 'API', 'URL', 'HTTP', 'HTML', 'JSON',
  ]);

  // Extract tickers (uppercase, 1-5 chars)
  const tickers = matches
    .filter((t) => !stopWords.has(t))
    .map((t) => t.toUpperCase())
    .filter((t, i, arr) => arr.indexOf(t) === i); // Deduplicate

  return tickers;
}

/**
 * Classify intent from prompt using keyword matching
 * Returns one of: FORECAST, VALUATION, MERGER, OPERATING, SCENARIO, MARKET_BRIEF, MIXED
 */
export function classifyIntent(prompt: string): Intent {
  const lower = prompt.toLowerCase();

  // Check for explicit intent keywords (order matters - more specific first)

  // MARKET_BRIEF: market analysis, news, why did it move
  if (
    lower.includes('why did') ||
    lower.includes('why did it') ||
    lower.includes('why did the') ||
    lower.includes('market brief') ||
    lower.includes('news impact') ||
    lower.includes('what happened to') ||
    lower.includes('why did the market') ||
    lower.includes('explain the move') ||
    lower.includes('what drove')
  ) {
    return 'MARKET_BRIEF';
  }

  // SCENARIO: stress testing, what-if, scenarios
  if (
    lower.includes('what happens if') ||
    lower.includes('stress test') ||
    lower.includes('scenario') ||
    lower.includes('what-if') ||
    lower.includes('sensitivity') ||
    lower.includes('upside') ||
    lower.includes('downside') ||
    lower.includes('base case') ||
    lower.includes('bear case') ||
    lower.includes('bull case')
  ) {
    return 'SCENARIO';
  }

  // MERGER: acquisition, merger, accretive
  if (
    lower.includes('merger') ||
    lower.includes('acquisition') ||
    lower.includes('accretive') ||
    lower.includes('dilutive') ||
    lower.includes('m&a') ||
    lower.includes('merger and acquisition') ||
    lower.includes('takeover') ||
    lower.includes('buyout')
  ) {
    return 'MERGER';
  }

  // OPERATING: runway, burn rate, operating plan, budget
  if (
    lower.includes('runway') ||
    lower.includes('burn rate') ||
    lower.includes('burn') ||
    lower.includes('budget') ||
    lower.includes('operating plan') ||
    lower.includes('operating model') ||
    lower.includes('cash runway') ||
    lower.includes('months of runway')
  ) {
    return 'OPERATING';
  }

  // FORECAST: forecast, projection, price target, CAGR, next N years
  if (
    lower.includes('forecast') ||
    lower.includes('projection') ||
    lower.includes('project') ||
    lower.includes('price target') ||
    lower.includes('pt') ||
    lower.includes('cagr') ||
    lower.includes('next') && (lower.includes('year') || lower.includes('quarter') || lower.includes('month')) ||
    lower.includes('years') ||
    lower.includes('growth rate') ||
    lower.includes('revenue growth') ||
    lower.includes('sales forecast')
  ) {
    return 'FORECAST';
  }

  // VALUATION: value, worth, intrinsic, DCF, valuation
  if (
    lower.includes('value') ||
    lower.includes('worth') ||
    lower.includes('intrinsic') ||
    lower.includes('dcf') ||
    lower.includes('valuation') ||
    lower.includes('fair value') ||
    lower.includes('target price') ||
    lower.includes('should trade at')
  ) {
    return 'VALUATION';
  }

  // MIXED: Multiple intents detected
  const hasForecast = lower.includes('forecast') || lower.includes('projection') || lower.includes('cagr');
  const hasValuation = lower.includes('value') || lower.includes('dcf') || lower.includes('valuation');
  const hasScenario = lower.includes('scenario') || lower.includes('sensitivity');
  const hasOperating = lower.includes('operating') || lower.includes('runway') || lower.includes('burn');

  const intentCount = [hasForecast, hasValuation, hasScenario, hasOperating].filter(Boolean).length;
  if (intentCount > 1) {
    return 'MIXED';
  }

  // Default to FORECAST if ambiguous (most common use case)
  return 'FORECAST';
}

/**
 * Propose models based on intent
 * Returns array of ModelToCreate objects with appropriate defaults
 */
export function proposeModels(
  intent: Intent,
  prompt: string,
  tickers: string[]
): Omit<ModelToCreate, 'title'>[] {
  const lower = prompt.toLowerCase();
  const ticker = tickers[0] || 'COMPANY';
  const models: Omit<ModelToCreate, 'title'>[] = [];

  switch (intent) {
    case 'FORECAST':
      models.push({
        modelType: 'OPERATING',
        why: 'Operating model is needed to forecast revenue, expenses, and cash flow over the forecast period.',
        inputsNeeded: [
          'Historical revenue and growth rates',
          'Cost structure and margin assumptions',
          'Cash position and burn rate',
        ],
        prefill: {
          ticker,
          forecastYears: lower.includes('year') ? 5 : lower.includes('quarter') ? 8 : 4,
        },
      });

      // Add SCENARIO_ENGINE if prompt mentions scenarios
      if (lower.includes('scenario') || lower.includes('sensitivity') || lower.includes('what-if')) {
        models.push({
          modelType: 'SCENARIO_ENGINE',
          why: 'Scenario engine allows you to test multiple forecast assumptions and see their impact.',
          inputsNeeded: [
            'Base case forecast',
            'Key sensitivity variables',
            'Scenario ranges (optimistic/pessimistic)',
          ],
          prefill: {
            baseModel: 'OPERATING',
            ticker,
          },
        });
      }
      break;

    case 'VALUATION':
      // Always recommend DCF + COMPS for valuation
      models.push({
        modelType: 'DCF',
        why: 'DCF model calculates intrinsic value based on discounted cash flows.',
        inputsNeeded: [
          'Free cash flow projections',
          'Terminal growth rate',
          'Weighted average cost of capital (WACC)',
        ],
        prefill: {
          ticker,
          forecastYears: 5,
        },
      });

      models.push({
        modelType: 'COMPS',
        why: 'Comparable companies analysis provides market-based valuation multiples.',
        inputsNeeded: [
          'Peer company tickers',
          'Trading multiples (EV/Revenue, EV/EBITDA, P/E)',
          'Market data',
        ],
        prefill: {
          ticker,
        },
      });
      break;

    case 'MERGER':
      models.push({
        modelType: 'MERGER',
        why: 'Merger model analyzes accretion/dilution, pro forma financials, and deal structure.',
        inputsNeeded: [
          'Buyer and target company financials',
          'Purchase price and consideration mix',
          'Synergy assumptions',
          'Integration costs',
        ],
        prefill: {
          buyerTicker: tickers[0] || 'BUYER',
          targetTicker: tickers[1] || 'TARGET',
        },
      });
      break;

    case 'OPERATING':
      models.push({
        modelType: 'OPERATING',
        why: 'Operating model tracks revenue, expenses, cash flow, and runway over time.',
        inputsNeeded: [
          'Revenue model and growth assumptions',
          'Cost structure (COGS, OpEx)',
          'Working capital requirements',
          'Cash position',
        ],
        prefill: {
          ticker,
          focusArea: lower.includes('runway') ? 'runway' : lower.includes('burn') ? 'burn' : 'operating',
        },
      });
      break;

    case 'SCENARIO':
      // Determine base model from context
      let baseModel: 'DCF' | 'OPERATING' | 'MERGER' = 'OPERATING';
      if (lower.includes('valuation') || lower.includes('value') || lower.includes('dcf')) {
        baseModel = 'DCF';
      } else if (lower.includes('merger') || lower.includes('acquisition')) {
        baseModel = 'MERGER';
      }

      models.push({
        modelType: 'SCENARIO_ENGINE',
        why: 'Scenario engine enables stress testing and sensitivity analysis across multiple scenarios.',
        inputsNeeded: [
          'Base model to analyze',
          'Key sensitivity variables',
          'Scenario definitions (base/upside/downside)',
        ],
        prefill: {
          baseModel,
          ticker,
          scenarios: ['Base', 'Upside', 'Downside'],
        },
      });

      // If base model is OPERATING or DCF, suggest creating it first
      if (baseModel === 'OPERATING') {
        models.unshift({
          modelType: 'OPERATING',
          why: 'Create operating model first, then run scenario analysis on it.',
          inputsNeeded: [
            'Revenue model',
            'Cost structure',
            'Cash flow assumptions',
          ],
          prefill: {
            ticker,
            forecastYears: 5,
          },
        });
      } else if (baseModel === 'DCF') {
        models.unshift({
          modelType: 'DCF',
          why: 'Create DCF model first, then run scenario analysis on valuation inputs.',
          inputsNeeded: [
            'Free cash flow projections',
            'Terminal value assumptions',
            'WACC inputs',
          ],
          prefill: {
            ticker,
            forecastYears: 5,
          },
        });
      }
      break;

    case 'MARKET_BRIEF':
      // MARKET_BRIEF doesn't create models, only memo outputs
      // Return empty array - outputs will be handled separately
      break;

    case 'MIXED':
      // For mixed intents, propose the most relevant models
      if (lower.includes('forecast') || lower.includes('projection')) {
        models.push({
          modelType: 'OPERATING',
          why: 'Operating model supports forecasting and scenario analysis.',
          inputsNeeded: [
            'Historical financials',
            'Growth assumptions',
            'Cost structure',
          ],
          prefill: {
            ticker,
            forecastYears: 5,
          },
        });
      }
      if (lower.includes('value') || lower.includes('valuation') || lower.includes('dcf')) {
        models.push({
          modelType: 'DCF',
          why: 'DCF model provides intrinsic valuation.',
          inputsNeeded: [
            'Free cash flow projections',
            'Terminal growth rate',
            'WACC',
          ],
          prefill: {
            ticker,
            forecastYears: 5,
          },
        });
      }
      if (lower.includes('scenario') || lower.includes('sensitivity')) {
        models.push({
          modelType: 'SCENARIO_ENGINE',
          why: 'Scenario engine enables multi-scenario analysis.',
          inputsNeeded: [
            'Base model',
            'Sensitivity variables',
            'Scenario ranges',
          ],
          prefill: {
            ticker,
          },
        });
      }
      break;
  }

  return models;
}

/**
 * Main router function
 * Extracts tickers, classifies intent, and proposes models
 */
export function routePrompt(prompt: string): {
  intent: Intent;
  tickers: string[];
  models: Omit<ModelToCreate, 'title'>[];
} {
  const tickers = extractTickers(prompt);
  const intent = classifyIntent(prompt);
  const models = proposeModels(intent, prompt, tickers);

  return {
    intent,
    tickers,
    models,
  };
}

