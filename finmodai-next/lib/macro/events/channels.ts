/**
 * Macro Events Channels and Uncertainty
 * Deterministic generation of likely channels and uncertainty based on event category
 * Safe, consistent content without specific facts or hallucinations
 */

import type { MacroEventCategory } from './types';

export type ChannelsAndUncertainty = {
  likely_channels: string[];
  uncertainty: string[];
};

/**
 * Generate deterministic likely channels and uncertainty based on event category
 * Content is generic, safe, and does not reference specific events or facts
 */
export function generateChannelsAndUncertainty(category: MacroEventCategory): ChannelsAndUncertainty {
  const likely_channels: string[] = [];
  const uncertainty: string[] = [];

  switch (category) {
    case 'geopolitics':
      likely_channels.push('Risk-off sentiment can pressure equities');
      likely_channels.push('Oil prices may rise if supply risk increases');
      likely_channels.push('Defense and energy sectors may outperform');
      likely_channels.push('Regional market volatility may increase (EUR, EM)');
      likely_channels.push('Safe-haven flows to Treasuries and gold');
      uncertainty.push('Magnitude depends on escalation path and sanctions');
      uncertainty.push('Market reaction may be muted if already priced in');
      uncertainty.push('Duration and containment of conflict are uncertain');
      uncertainty.push('Supply chain disruptions depend on trade routes affected');
      break;

    case 'rates':
      likely_channels.push('Higher front-end yields tighten financial conditions');
      likely_channels.push('Rate-sensitive sectors may underperform (real estate, utilities, financials)');
      likely_channels.push('Dollar strength may increase relative to other currencies');
      likely_channels.push('Yield curve shape may shift (2s10s, 5s30s)');
      likely_channels.push('Credit spreads may widen as borrowing costs rise');
      uncertainty.push('Forward guidance may matter more than the decision itself');
      uncertainty.push('Market pricing vs. Fed guidance divergence');
      uncertainty.push('Timing and magnitude of policy changes are uncertain');
      uncertainty.push('Effectiveness of communication in shaping expectations');
      break;

    case 'inflation':
      likely_channels.push('Higher inflation can lift yields and pressure growth stocks');
      likely_channels.push('Fed rate expectations may shift based on inflation persistence');
      likely_channels.push('Real yields (TIPS vs. nominal Treasuries) may adjust');
      likely_channels.push('Commodity prices and supply chains may be affected');
      likely_channels.push('Consumer discretionary vs. staples rotation may occur');
      uncertainty.push('Focus will be on core and services components');
      uncertainty.push('Revisions and seasonal effects can distort signal');
      uncertainty.push('Stickiness of core vs. headline inflation');
      uncertainty.push('Passthrough to wages and services is uncertain');
      uncertainty.push('Base effects and year-over-year comparisons matter');
      break;

    case 'jobs':
      likely_channels.push('Strong labor data can lift yields and Fed expectations');
      likely_channels.push('Wage growth and unit labor costs may impact inflation outlook');
      likely_channels.push('Consumer spending resilience may be supported');
      likely_channels.push('Labor market tightness indicators may shift');
      likely_channels.push('Sector-specific impacts (services vs. goods employment)');
      uncertainty.push('Structural vs. cyclical labor trends are unclear');
      uncertainty.push('Participation rate dynamics may affect interpretation');
      uncertainty.push('Data revisions can materially change the narrative');
      uncertainty.push('Quality of jobs and hours worked matter as much as headline number');
      break;

    case 'earnings':
      likely_channels.push('Sector-specific ETF flows may shift based on results');
      likely_channels.push('Implied volatility (VIX, sector IV) may adjust');
      likely_channels.push('Options flow and positioning may change');
      likely_channels.push('Relative performance within sector may diverge');
      likely_channels.push('Guidance revisions can outweigh current results');
      uncertainty.push('Guidance revisions and outlook are key drivers');
      uncertainty.push('Consensus vs. actual surprises determine market reaction');
      uncertainty.push('Quality of earnings (one-time items, margins) matters');
      uncertainty.push('Forward-looking commentary may outweigh historical results');
      break;

    case 'policy':
      likely_channels.push('Sector rotation may occur based on regulatory exposure');
      likely_channels.push('Fiscal multiplier effects may impact growth expectations');
      likely_channels.push('Government spending beneficiaries may outperform');
      likely_channels.push('Regulatory uncertainty may pressure affected sectors');
      likely_channels.push('Implementation timeline may affect near-term positioning');
      uncertainty.push('Legislative timeline and passage probability are uncertain');
      uncertainty.push('Implementation and enforcement details matter');
      uncertainty.push('Market reaction depends on size relative to expectations');
      uncertainty.push('Secondary effects and unintended consequences are unclear');
      break;

    case 'commodities':
      likely_channels.push('Energy sector correlation may strengthen');
      likely_channels.push('Industrial metals and manufacturing may be affected');
      likely_channels.push('Inflation expectations and breakevens may adjust');
      likely_channels.push('Currency effects (commodity-linked FX) may emerge');
      likely_channels.push('Supply-demand balance may shift sector positioning');
      uncertainty.push('Supply vs. demand balance determines direction');
      uncertainty.push('Storage and logistics constraints affect pricing');
      uncertainty.push('Geopolitical and weather factors add volatility');
      uncertainty.push('Forward curve structure may differ from spot moves');
      break;

    case 'other':
      likely_channels.push('Broad market sentiment shifts may occur');
      likely_channels.push('Sector rotation and flows may adjust');
      likely_channels.push('Cross-asset correlations may change');
      likely_channels.push('Risk-on or risk-off positioning may shift');
      uncertainty.push('Magnitude and persistence of impact are uncertain');
      uncertainty.push('Market interpretation may vary by participant');
      uncertainty.push('Context and timing relative to other events matter');
      break;

    default:
      likely_channels.push('Market reaction depends on context and timing');
      likely_channels.push('Cross-asset correlations may shift');
      uncertainty.push('Magnitude and direction of impact are uncertain');
      break;
  }

  return { likely_channels, uncertainty };
}

