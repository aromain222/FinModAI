import type { EventImpact } from './types';

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Deterministic event impact inference.
 * Weights (documented):
 * - Surprise / wording: 40%
 * - Market direction heuristics by category: 30%
 * - Breadth (number of channels affected): 20%
 * - Persistence bias by category (macro > geo > single-stock): 10%
 */
export function inferEventImpact(event: { title?: string; headline?: string; category?: string; topic?: string; impact?: any }): EventImpact {
  const text = (event.headline || event.title || '').toLowerCase();
  const category = (event.topic || event.category || '').toLowerCase();

  // Base template
  let channels = { rates: 0, fx: 0, equities: 0, credit: 0, commodities: 0 };
  let direction: EventImpact['direction'] = 'neutral';
  let primaryChannel: EventImpact['primaryChannel'] = 'macro';
  let whyItMatters = 'No explicit expectation provided; assessing from headline context.';
  let transmission: string[] = [];
  let winners: string[] = [];
  let losers: string[] = [];
  let watchNext: string[] = [];
  let baseScore = 40;
  let confidence = 0.4;
  let horizon: EventImpact['timeHorizon'] = '1w';

  const boost = (channel: keyof typeof channels, delta: number) => {
    channels[channel] = clamp(channels[channel] + delta, -3, 3);
  };

  const contains = (needle: string) => text.includes(needle.toLowerCase());

  // Helpers for surprise wording
  const isHot = /(higher|hot|beat|surprise|jump|surges?|spikes?)/.test(text);
  const isCool = /(lower|cool|miss|falls?|eases?|soft)/.test(text);

  // Category-based logic
  if (category.includes('cpi') || category.includes('inflation') || contains('cpi')) {
    primaryChannel = 'rates';
    horizon = '1-3m';
    if (isHot) {
      boost('rates', 2);
      boost('fx', 1);
      boost('equities', -2);
      boost('credit', -1);
      boost('commodities', 1);
      direction = 'risk_off';
      whyItMatters = 'Inflation read hotter than expected, lifting rate expectations and discount rates.';
      transmission = ['Front-end yields reprice higher', 'USD supported vs majors', 'Duration/growth equities de-rate', 'Credit spreads drift wider on tighter policy risk'];
      winners = ['USD', 'Value/Financials', 'Energy'];
      losers = ['Long-duration tech', 'HY credit'];
      baseScore = 75;
      confidence = 0.7;
    } else if (isCool) {
      boost('rates', -2);
      boost('fx', -1);
      boost('equities', 2);
      boost('credit', 1);
      boost('commodities', -1);
      direction = 'risk_on';
      whyItMatters = 'Inflation read cooler than expected, easing rate path and supporting risk multiples.';
      transmission = ['Front-end yields drift lower', 'USD softens', 'Growth equities/multiples expand', 'Credit tightens on easier policy path'];
      winners = ['Growth/Tech', 'HY credit'];
      losers = ['USD', 'Staples vs growth'];
      baseScore = 70;
      confidence = 0.7;
    }
    watchNext = ['Next CPI/PCE print', 'Fed speakers on inflation path'];
  } else if (category.includes('jobs') || category.includes('payroll') || contains('payroll')) {
    primaryChannel = 'rates';
    horizon = '1w';
    if (isHot) {
      boost('rates', 2);
      boost('fx', 1);
      boost('equities', -1);
      direction = 'risk_off';
      whyItMatters = 'Stronger labor data keeps policy tight, pressuring duration and supporting USD.';
      transmission = ['Front-end rates reprice higher', 'USD bid vs low yielders', 'Equity multiples compress modestly'];
      winners = ['Banks', 'USD'];
      losers = ['Long-duration tech'];
      baseScore = 65;
      confidence = 0.6;
    } else if (isCool) {
      boost('rates', -1);
      boost('fx', -1);
      boost('equities', 1);
      direction = 'risk_on';
      whyItMatters = 'Softer labor reduces tightening risk, modestly supporting duration and risk assets.';
      transmission = ['Front-end yields ease', 'USD softer', 'Equities stabilize on lower discount rates'];
      winners = ['Growth equities', 'Rates duration'];
      losers = ['USD'];
      baseScore = 60;
      confidence = 0.55;
    }
    watchNext = ['Initial claims', 'Next payrolls print'];
  } else if (category.includes('fed') || category.includes('ecb') || category.includes('boe') || contains('fed')) {
    primaryChannel = 'rates';
    horizon = 'intraday';
    const hawkish = contains('hawk') || contains('higher for longer') || contains('raise') || contains('hike');
    const dovish = contains('dove') || contains('cut') || contains('pause') || contains('pivot');
    if (hawkish) {
      boost('rates', 2);
      boost('fx', 1);
      boost('equities', -2);
      boost('credit', -1);
      direction = 'risk_off';
      whyItMatters = 'Hawkish central bank rhetoric tightens financial conditions via higher yields and stronger USD.';
      transmission = ['Yields rise across curve', 'USD bid', 'Risk assets de-rate on higher discount rates'];
      winners = ['Value/Financials'];
      losers = ['Growth equities', 'EM FX', 'HY credit'];
      baseScore = 70;
      confidence = 0.65;
    } else if (dovish) {
      boost('rates', -2);
      boost('fx', -1);
      boost('equities', 2);
      boost('credit', 1);
      direction = 'risk_on';
      whyItMatters = 'Dovish guidance eases financial conditions, supporting multiples and credit.';
      transmission = ['Yields fall', 'USD softens', 'Equity multiples expand', 'Credit tightens'];
      winners = ['Growth/Tech', 'HY credit', 'EM FX'];
      losers = ['USD'];
      baseScore = 70;
      confidence = 0.65;
    }
    watchNext = ['Next policy meeting', 'Central bank minutes', 'Rates path market-implied'];
  } else if (category.includes('oil') || category.includes('energy') || contains('opec') || contains('crude')) {
    primaryChannel = 'commodities';
    horizon = '1-3m';
    const isSupplyShock = contains('cut') || contains('disruption') || contains('strike') || contains('attack') || contains('shutdown');
    const isPriceDrop = contains('fall') || contains('down') || contains('oversupply');
    if (isSupplyShock || isHot) {
      boost('commodities', 3);
      boost('rates', 1);
      boost('equities', -1);
      boost('fx', 1);
      direction = 'mixed';
      whyItMatters = 'Oil supply shock lifts energy prices and inflation expectations, tightening conditions at the margin.';
      transmission = ['Crude up, feeds into headline inflation', 'Rates risk premium higher', 'Energy equities outperform while consumers/airlines lag'];
      winners = ['Energy (XLE)', 'Oil majors'];
      losers = ['Airlines', 'Consumers', 'Rates duration'];
      baseScore = 75;
      confidence = 0.65;
    } else if (isPriceDrop || isCool) {
      boost('commodities', -2);
      boost('equities', 1);
      boost('rates', -1);
      direction = 'risk_on';
      whyItMatters = 'Falling oil eases input costs and headline inflation, supporting consumers and duration.';
      transmission = ['Crude lower eases inflation', 'Rates drift lower', 'Consumer/airlines benefit'];
      winners = ['Airlines', 'Consumer Discretionary'];
      losers = ['Energy equities'];
      baseScore = 60;
      confidence = 0.55;
    }
    watchNext = ['EIA weekly crude stocks', 'OPEC commentary', 'WTI front-month level'];
  } else if (category.includes('credit') || contains('downgrade') || contains('spread')) {
    primaryChannel = 'credit';
    horizon = '1w';
    if (contains('widen') || contains('downgrade') || contains('default')) {
      boost('credit', -3);
      boost('equities', -2);
      boost('rates', 1);
      direction = 'risk_off';
      whyItMatters = 'Credit stress widens spreads, pressuring risk assets and tightening financial conditions.';
      transmission = ['Spreads widen', 'Risk assets de-rate', 'Flight to quality in rates'];
      winners = ['UST duration', 'Defensives'];
      losers = ['HY credit', 'Cyclicals'];
      baseScore = 70;
      confidence = 0.6;
    } else if (contains('tighten') || contains('upgrade')) {
      boost('credit', 2);
      boost('equities', 1);
      direction = 'risk_on';
      whyItMatters = 'Credit tightening signals improving risk appetite and fundamentals.';
      transmission = ['Spreads tighten', 'Risk assets supported', 'Funding easier'];
      winners = ['HY credit', 'Cyclicals'];
      losers = ['UST duration'];
      baseScore = 60;
      confidence = 0.55;
    }
    watchNext = ['CDX/ITRAXX levels', 'HY ETF flows'];
  } else {
    // Default neutral
    whyItMatters = 'No explicit expectation provided; monitoring for follow-through.';
    transmission = ['Await price confirmation', 'Assess sector-specific exposure', 'Monitor subsequent headlines'];
    baseScore = 40;
    confidence = 0.4;
    horizon = '1w';
    direction = 'neutral';
  }

  const breadthScore = Object.values(channels).reduce((acc, v) => acc + Math.abs(v), 0);
  const score = clamp(
    Math.round(
      baseScore * 0.7 +
        breadthScore * 2 * 0.2 + // 20% weight to breadth (scaled)
        confidence * 100 * 0.1
    ),
    10,
    100
  );

  return {
    score,
    direction,
    confidence,
    primaryChannel,
    channels,
    whyItMatters,
    transmission,
    likelyWinners: winners,
    likelyLosers: losers,
    watchNext,
    timeHorizon: horizon,
  };
}

export { clamp };
