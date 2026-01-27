/**
 * Deterministic Headline Market Impact Generator
 * Generates 2-3 sentence market impact expansion for headlines
 * NO LLM REQUIRED - pure rule-based logic
 */

import { tagHeadline, type ImpactTag } from './headlineTagger';

export type HeadlineWithImpact = {
  title: string;
  impact: ImpactTag;
  publishedAt: string;
  source?: string;
  marketImpact: string; // 2-3 sentences deterministic base case
};

/**
 * Generates deterministic market impact text for a headline
 */
export function generateMarketImpact(
  headline: string,
  impact: ImpactTag,
  benchmarkReturn?: number | null,
  breadth?: { sectorsUp: number; sectorsDown: number }
): string {
  const lower = headline.toLowerCase();
  
  let impactText = '';
  
  // Rates-related impact
  if (impact === 'Rates') {
    if (/fed.*hawk|rate.*hike|tighten/i.test(headline)) {
      impactText = 'Higher rates tighten financial conditions, pressuring rate-sensitive sectors. Utilities (XLU) and real estate (XLRE) face headwinds as discount rates rise, while banks may benefit from wider net interest margins. Duration assets underperform as yields increase.';
    } else if (/fed.*dove|rate.*cut|ease/i.test(headline)) {
      impactText = 'Easier monetary policy supports growth-sensitive assets and rate-sensitive sectors. Real estate (XLRE) and utilities (XLU) rally as discount rates decline, while technology and growth stocks benefit from lower funding costs. Defensive sectors may underperform.';
    } else {
      impactText = 'Rate policy shifts impact duration-sensitive assets and financial conditions. Higher rates pressure utilities and real estate while supporting banks; lower rates support growth stocks and rate-sensitive sectors. Monitor sector rotation for directional signals.';
    }
  }
  
  // Energy-related impact
  else if (impact === 'Energy') {
    if (/oil.*up|crude.*rise|energy.*surge/i.test(headline)) {
      impactText = 'Rising energy prices boost energy sector (XLE) performance as oil majors (XOM, CVX) benefit from higher commodity prices. Airlines (DAL, UAL) and transports face cost headwinds from fuel expenses, while energy services (SLB) see increased activity. Inflation concerns may emerge.';
    } else if (/oil.*down|crude.*fall|energy.*drop/i.test(headline)) {
      impactText = 'Declining energy prices reduce input costs for energy-intensive sectors like airlines and transports. Energy sector (XLE) underperforms as commodity prices fall, while lower fuel costs support consumer discretionary spending and transportation margins.';
    } else {
      impactText = 'Energy price movements drive sector rotation and inflation expectations. Higher prices support energy stocks and inflation hedges; lower prices reduce input costs for transports and consumers. Monitor energy sector momentum for broader market implications.';
    }
  }
  
  // Earnings-related impact
  else if (impact === 'Earnings') {
    if (/beat|surprise|strong|guidance.*up/i.test(headline)) {
      impactText = 'Positive earnings surprises drive sector outperformance as corporate fundamentals strengthen. Sectors with positive revisions see multiple expansion and relative outperformance. Market breadth improves as earnings trends validate economic resilience.';
    } else if (/miss|weak|guidance.*down|cut/i.test(headline)) {
      impactText = 'Earnings disappointments pressure affected sectors as valuation multiples contract. Weak guidance signals broader economic headwinds, impacting cyclical sectors more than defensives. Market breadth narrows as earnings trends deteriorate.';
    } else {
      impactText = 'Earnings trends shape sector rotation and market sentiment. Strong earnings support risk-on positioning while weak earnings drive defensive rotation. Monitor sector-specific earnings revisions for relative performance signals.';
    }
  }
  
  // Geopolitics-related impact
  else if (impact === 'Geopolitics') {
    if (/war|attack|conflict|escalate/i.test(headline)) {
      impactText = 'Geopolitical escalation drives risk-off sentiment and safe-haven flows. Defense contractors (LMT, RTX) and energy sector benefit while travel/leisure stocks (CCL, BKNG) face headwinds. Risk assets sell off as uncertainty increases.';
    } else if (/peace|de-escalate|truce/i.test(headline)) {
      impactText = 'Geopolitical de-escalation supports risk-on positioning as uncertainty recedes. Travel/leisure stocks rally while safe-haven flows reverse. Cyclical sectors outperform defensives as risk appetite improves.';
    } else {
      impactText = 'Geopolitical developments drive risk sentiment and sector rotation. Escalation supports defense and energy while pressuring risk assets; de-escalation supports growth and travel sectors. Monitor risk-off indicators for directional shifts.';
    }
  }
  
  // Macro/default impact
  else {
    // Use benchmark and breadth context if available
    if (benchmarkReturn !== null && benchmarkReturn !== undefined) {
      const direction = benchmarkReturn >= 0 ? 'positive' : 'negative';
      impactText = `Macro developments are driving ${direction} market momentum with ${benchmarkReturn >= 0 ? '+' : ''}${benchmarkReturn.toFixed(2)}% benchmark returns. `;
    }
    
    if (breadth) {
      const isPositiveBreadth = breadth.sectorsUp > breadth.sectorsDown;
      if (isPositiveBreadth) {
        impactText += `Market breadth is positive with ${breadth.sectorsUp} sectors advancing vs ${breadth.sectorsDown} declining, indicating broad-based strength. `;
      } else {
        impactText += `Market breadth is negative with ${breadth.sectorsDown} sectors declining vs ${breadth.sectorsUp} advancing, indicating selective weakness. `;
      }
    }
    
    if (!impactText) {
      impactText = 'Macro developments are shaping market dynamics. Monitor key indicators and sector rotation for directional signals. Economic data and policy responses drive near-term market movements.';
    }
  }
  
  // Ensure 2-3 sentences
  const sentences = impactText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length < 2) {
    impactText += ' Monitor sector momentum for confirmation of directional trends.';
  }
  
  return impactText.trim();
}

