/**
 * applyEventMutation
 *
 * Pure function that applies Claude-generated assumption deltas to the current
 * financial model. bps fields are converted to decimal before addition.
 */

export interface CurrentModel {
  revenue_growth: number;      // decimal  e.g. 0.10 = 10%
  ebitda_margin: number;       // decimal  e.g. 0.25 = 25%
  wacc: number;                // decimal  e.g. 0.10 = 10%
  terminal_growth: number;     // decimal  e.g. 0.025 = 2.5%
  capex_pct_revenue: number;   // decimal  e.g. 0.04 = 4%
}

export interface AssumptionDeltas {
  revenue_growth_delta: number;       // decimal  e.g. -0.02 = -2 pp
  ebitda_margin_delta_bps: number;    // bps      e.g. -50 = -0.50 pp
  wacc_delta_bps: number;             // bps      e.g. +25 = +0.25 pp
  terminal_growth_delta: number;      // decimal  e.g. -0.005 = -0.5 pp
  capex_delta_pct_revenue: number;    // decimal  e.g. 0.005 = +0.5 pp
}

export function applyEventMutation(
  currentModel: CurrentModel,
  deltas: AssumptionDeltas
): CurrentModel {
  return {
    revenue_growth:    currentModel.revenue_growth    + deltas.revenue_growth_delta,
    ebitda_margin:     currentModel.ebitda_margin     + deltas.ebitda_margin_delta_bps / 10000,
    wacc:              currentModel.wacc              + deltas.wacc_delta_bps / 10000,
    terminal_growth:   currentModel.terminal_growth   + deltas.terminal_growth_delta,
    capex_pct_revenue: currentModel.capex_pct_revenue + deltas.capex_delta_pct_revenue,
  };
}
