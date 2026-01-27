/**
 * Helper functions for building macro events from templates
 */

import { createHash } from 'crypto';
import { generateEventTemplate, generateFallbackTemplate, type TemplateInputs } from './macroEventTemplates';
import type { MacroEvent, MacroEventType } from './macroEventBuilder';

export type MacroEventCategory = 'CPI' | 'Jobs' | 'Fed' | 'Oil' | 'Geopolitics' | 'Earnings/Credit' | 'FX';

/**
 * Map category to template category
 */
function mapCategoryToTemplate(category: MacroEventCategory): 'CPI' | 'FED' | 'JOBS' | 'OIL' | 'GEOPOLITICS' {
  const mapping: Record<MacroEventCategory, 'CPI' | 'FED' | 'JOBS' | 'OIL' | 'GEOPOLITICS'> = {
    'CPI': 'CPI',
    'Fed': 'FED',
    'Jobs': 'JOBS',
    'Oil': 'OIL',
    'Geopolitics': 'GEOPOLITICS',
    'Earnings/Credit': 'FED', // Map to FED for now
    'FX': 'FED', // Map to FED for now
  };
  return mapping[category] || 'FED';
}

/**
 * Map template category to event type
 */
function mapTemplateCategoryToType(category: 'CPI' | 'FED' | 'JOBS' | 'OIL' | 'GEOPOLITICS'): MacroEventType {
  const mapping: Record<'CPI' | 'FED' | 'JOBS' | 'OIL' | 'GEOPOLITICS', MacroEventType> = {
    'CPI': 'Rates',
    'FED': 'Rates',
    'JOBS': 'Growth/Labor',
    'OIL': 'Energy',
    'GEOPOLITICS': 'Geopolitics',
  };
  return mapping[category];
}

/**
 * Generate stable eventId hash
 */
function generateEventId(title: string, date: string, category: string, region: string = 'global'): string {
  const input = `${title}|${date}|${category}|${region}`;
  return createHash('sha256').update(input).digest('hex').substring(0, 16);
}

/**
 * Convert template to MacroEvent
 */
export function templateToMacroEvent(
  template: Awaited<ReturnType<typeof generateEventTemplate>>,
  category: MacroEventCategory,
  publishedAt: string,
  region: string
): MacroEvent | null {
  if (!template) return null;

  const eventId = generateEventId(template.eventTitle, publishedAt, template.category, region);
  const type = mapTemplateCategoryToType(template.category);

  // Ensure all required fields are present (template is validated by zod, but TypeScript needs help)
  return {
    eventId,
    category: template.category,
    eventTitle: template.eventTitle,
    whatHappened: {
      oneLine: template.whatHappened.oneLine,
      details: template.whatHappened.details || [],
    },
    marketImpact: template.marketImpact.map((impact) => ({
      bucket: impact.bucket,
      shortTerm: impact.shortTerm,
      watch: impact.watch,
    })),
    winnersLosers: {
      sectorsUp: template.winnersLosers.sectorsUp || [],
      sectorsDown: template.winnersLosers.sectorsDown || [],
      stocksToWatch: template.winnersLosers.stocksToWatch.map((stock) => ({
        ticker: stock.ticker,
        why: stock.why,
      })),
    },
    scenarios: template.scenarios.map((scenario) => ({
      name: scenario.name,
      prob: scenario.prob,
      assumptions: scenario.assumptions || [],
      assetMoves: {
        SPY: scenario.assetMoves.SPY,
        VIX: scenario.assetMoves.VIX,
        '10Y': scenario.assetMoves['10Y'],
        WTI: scenario.assetMoves.WTI,
        Gold: scenario.assetMoves.Gold,
      },
    })),
    confidence: template.confidence,
    sources: template.sources.map((source) => ({
      name: source.name,
      url: source.url || '',
    })),
    publishedAt,
    region,
    // Legacy fields
    type,
    title: template.eventTitle,
  };
}

/**
 * Build event from template inputs
 */
export async function buildEventFromTemplate(
  category: MacroEventCategory,
  inputs: TemplateInputs,
  publishedAt: string,
  region: string,
  deterministic: boolean = false
): Promise<MacroEvent> {
  const templateCategory = mapCategoryToTemplate(category);
  
  // Try LLM generation first
  let template = await generateEventTemplate(templateCategory, inputs, 1, deterministic);
  
  // Fallback to deterministic template if LLM fails
  if (!template) {
    template = generateFallbackTemplate(templateCategory, inputs);
    // Apply phrasing rules to fallback too
    if (deterministic) {
      const { applyPhrasingRules, addDataDisclaimers } = await import('./macroEventPhrasing');
      const hasMacroData = !!(inputs.macroData?.cpi !== null || inputs.macroData?.unemployment !== null || inputs.macroData?.fedFunds !== null);
      const hasMarketData = !!(inputs.marketData?.spyReturn !== null || inputs.marketData?.oilMove !== null || inputs.marketData?.ratesMove !== null);
      template = applyPhrasingRules(template, deterministic);
      template = addDataDisclaimers(template, hasMacroData, hasMarketData);
    }
  }

  const event = templateToMacroEvent(template, category, publishedAt, region);
  if (!event) {
    // Ultimate fallback: create minimal event from fallback template
    const eventId = generateEventId(inputs.headlineText, publishedAt, category, region);
    return {
      eventId,
      category: templateCategory,
      eventTitle: inputs.headlineText.substring(0, 120),
      whatHappened: {
        oneLine: template.whatHappened.oneLine,
        details: template.whatHappened.details || [],
      },
      marketImpact: template.marketImpact.map((impact) => ({
        bucket: impact.bucket,
        shortTerm: impact.shortTerm,
        watch: impact.watch,
      })),
      winnersLosers: {
        sectorsUp: template.winnersLosers.sectorsUp || [],
        sectorsDown: template.winnersLosers.sectorsDown || [],
        stocksToWatch: template.winnersLosers.stocksToWatch.map((stock) => ({
          ticker: stock.ticker,
          why: stock.why,
        })),
      },
      scenarios: template.scenarios.map((scenario) => ({
        name: scenario.name,
        prob: scenario.prob,
        assumptions: scenario.assumptions || [],
        assetMoves: {
          SPY: scenario.assetMoves.SPY,
          VIX: scenario.assetMoves.VIX,
          '10Y': scenario.assetMoves['10Y'],
          WTI: scenario.assetMoves.WTI,
          Gold: scenario.assetMoves.Gold,
        },
      })),
      confidence: template.confidence,
      sources: (inputs.sources || [{ name: 'Unknown', url: '' }]).map((source) => ({
        name: source.name || 'Unknown',
        url: source.url || '',
      })),
      publishedAt,
      region,
      type: mapTemplateCategoryToType(templateCategory),
      title: inputs.headlineText.substring(0, 120),
    };
  }

  return event;
}

