/**
 * Merger Model Preview Generator
 * Generates structured preview for M&A merger models
 * Uses unified schema from lib/schemas/modelPreview.ts
 */

import type { MergerModelInput } from '@/lib/models/merger/schema';
import type { MergerModelOutput } from '@/lib/models/merger/compute';
import {
  type MergerPreview,
  MergerPreviewSchema,
  buildDefaultMergerPreview,
  parseModelPreview,
} from '@/lib/schemas/modelPreview';

export type MergerPreviewInputs = {
  buyerTicker: string;
  targetTicker: string;
  input: MergerModelInput;
  output: MergerModelOutput;
};

/**
 * Generate merger preview from model output
 * Always returns a valid preview, using fallback if needed
 */
export function generateMergerPreview(
  inputs: MergerPreviewInputs
): MergerPreview {
  try {
    const { buyerTicker, targetTicker, input, output } = inputs;

    // Extract key metrics from model output
    const year1Eps = output.epsAnalysis[0];
    const year2Eps = output.epsAnalysis.length > 1 ? output.epsAnalysis[1] : null;

    // Calculate accretion/dilution
    const accretionDilution = {
      year1: year1Eps.accretionDilutionPct * 100, // Convert to percentage
      year2: year2Eps ? year2Eps.accretionDilutionPct * 100 : year1Eps.accretionDilutionPct * 100,
    };

    // Extract purchase multiple (if available)
    const purchasePrice = output.dealConsideration.equityValue;
    const purchaseMultiple = 0; // Would need target standalone EBITDA to calculate

    // Build financing mix from deal consideration
    const equityValue = output.dealConsideration.equityValue;
    const cashConsideration = output.dealConsideration.cashConsideration;
    const stockConsideration = output.dealConsideration.stockConsideration;
    const newDebt = output.sourcesUses.sources.newDebt;
    
    const cashPct = equityValue > 0 ? cashConsideration / equityValue : 0;
    const stockPct = equityValue > 0 ? stockConsideration / equityValue : 0;
    const debtPct = equityValue > 0 ? newDebt / equityValue : 0;
    
    const financingMix = `${Math.round(cashPct * 100)}% cash, ${Math.round(stockPct * 100)}% stock${debtPct > 0 ? `, ${Math.round(debtPct * 100)}% debt` : ''}`;

    // Extract synergies from synergy schedules
    const revenueSynergyYear1 = input.revenueSynergies?.year1 || input.revenueSynergies?.runRate || 0;
    const cogsSavingsYear1 = input.cogsSavings?.year1 || input.cogsSavings?.runRate || 0;
    const opexSavingsYear1 = input.opexSavings?.year1 || input.opexSavings?.runRate || 0;
    const totalSynergies = revenueSynergyYear1 + cogsSavingsYear1 + opexSavingsYear1;
    const synergiesStr = totalSynergies > 0
      ? `$${(totalSynergies / 1e6).toFixed(0)}M annual run-rate`
      : 'No synergies assumed';

    // Build pro forma highlights
    const combinedYear1 = output.combinedIS[0];
    // Use combined IS values directly - standalone comparison would require separate data
    const proFormaHighlights = [
      {
        label: 'Revenue' as const,
        change: `$${(combinedYear1.revenue.total / 1e6).toFixed(0)}M`,
      },
      {
        label: 'EBITDA' as const,
        change: `$${(combinedYear1.ebitda / 1e6).toFixed(0)}M`,
      },
      {
        label: 'Net Income' as const,
        change: `$${(combinedYear1.netIncome / 1e6).toFixed(0)}M`,
      },
      {
        label: 'EPS' as const,
        change: `${accretionDilution.year1 > 0 ? '+' : ''}${accretionDilution.year1.toFixed(1)}%`,
      },
    ];

    // Determine who wins
    const whoWins: string[] = [];
    if (accretionDilution.year1 > 0) {
      whoWins.push(`${buyerTicker.toUpperCase()} shareholders (EPS accretion)`);
    }
    if (input.premiumPct && input.premiumPct > 0) {
      whoWins.push(`${targetTicker.toUpperCase()} shareholders (${(input.premiumPct * 100).toFixed(0)}% premium)`);
    }
    if (totalSynergies > 0) {
      whoWins.push('Combined entity (synergy capture)');
    }

    // Build headline
    const isAccretive = accretionDilution.year1 > 0;
    const headline = `${buyerTicker.toUpperCase()} acquisition of ${targetTicker.toUpperCase()}: ${isAccretive ? 'Accretive' : 'Dilutive'} by ${Math.abs(accretionDilution.year1).toFixed(1)}% in Year 1`;

    // Determine confidence
    const hasAllData = output.checks.allInvariantsPassed && output.checks.sourcesUsesBalanced;
    const confidence = hasAllData ? 'High' : output.checks.allInvariantsPassed ? 'Medium' : 'Low';

    // Build assumptions
    const assumptions = [
      { key: 'Purchase Multiple', value: purchaseMultiple > 0 ? `${purchaseMultiple.toFixed(1)}x EBITDA` : 'N/A' },
      { key: 'Financing Mix', value: financingMix },
      { key: 'Synergies', value: synergiesStr },
      ...(input.premiumPct ? [{ key: 'Premium', value: `${(input.premiumPct * 100).toFixed(0)}%` }] : []),
    ];

    // Build key takeaways
    const keyTakeaways = [
      `Transaction is ${isAccretive ? 'accretive' : 'dilutive'} to ${buyerTicker.toUpperCase()} EPS in Year 1`,
      `Deal consideration of $${(purchasePrice / 1e9).toFixed(1)}B${purchaseMultiple > 0 ? ` at ${purchaseMultiple.toFixed(1)}x EBITDA` : ''}`,
      totalSynergies > 0
        ? `Synergies of $${(totalSynergies / 1e6).toFixed(0)}M drive value creation`
        : 'No synergies assumed in base case',
      `Pro forma revenue of $${(combinedYear1.revenue.total / 1e6).toFixed(0)}M in Year 1`,
    ];

    // Build risks
    const risks: string[] = [];
    if (!isAccretive) {
      risks.push('EPS dilution may pressure buyer stock price');
    }
    if (input.premiumPct && input.premiumPct > 0.5) {
      risks.push('High premium may limit value creation');
    }
    if (totalSynergies === 0) {
      risks.push('No synergies assumed - integration may be challenging');
    }
    if (!output.checks.allInvariantsPassed) {
      risks.push('Model validation checks failed - review assumptions');
    }

    // Build sources
    const sources = [
      {
        provider: 'CapitalBase',
        status: (hasAllData ? 'live' : 'fallback') as 'live' | 'fallback' | 'missing',
        note: hasAllData ? 'Using model output data' : 'Using partial data with assumptions',
      },
    ];

    // Build visuals
    const visuals = [
      {
        kind: 'bar_compare' as const,
        title: 'Pro Forma Revenue (Year 1)',
        aLabel: 'Year 1',
        aValue: combinedYear1.revenue.total / 1e6,
        bLabel: 'Year 2',
        bValue: output.combinedIS.length > 1 ? output.combinedIS[1].revenue.total / 1e6 : combinedYear1.revenue.total / 1e6,
        unit: '$M',
      },
      {
        kind: 'gauge' as const,
        title: 'EPS Accretion/Dilution (Year 1)',
        value: accretionDilution.year1,
        min: -20,
        max: 20,
        unit: '%',
      },
    ];

    // Build the preview object
    const preview: MergerPreview = {
      id: crypto.randomUUID(),
      modelType: 'MERGER',
      createdAt: new Date().toISOString(),
      buyerTicker: buyerTicker.toUpperCase(),
      targetTicker: targetTicker.toUpperCase(),
      headline,
      confidence,
      sources,
      assumptions,
      keyTakeaways: keyTakeaways.slice(0, 6), // Ensure max 6
      risks: risks.slice(0, 6), // Ensure max 6
      accretionDilution,
      keyAssumptions: {
        purchaseMultiple: purchaseMultiple > 0 ? `${purchaseMultiple.toFixed(1)}x EBITDA` : 'N/A',
        financingMix,
        synergies: synergiesStr,
      },
      proFormaHighlights: proFormaHighlights.slice(0, 4), // Ensure max 4
      whoWins: whoWins.slice(0, 5), // Ensure max 5
      visuals,
    };

    // Validate against schema
    const validated = MergerPreviewSchema.safeParse(preview);
    if (!validated.success) {
      console.warn('[MergerPreview] Validation failed, using fallback:', validated.error.errors);
      return buildDefaultMergerPreview(buyerTicker, targetTicker);
    }

    return validated.data;
  } catch (error) {
    console.error('[MergerPreview] Error generating preview:', error);
    return buildDefaultMergerPreview(inputs.buyerTicker, inputs.targetTicker);
  }
}

