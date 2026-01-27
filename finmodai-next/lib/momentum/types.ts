/**
 * Momentum Scoring System - Transparent and Explainable
 * 
 * Score formula:
 * momentumScore = 15×zscore(mentions) + 10×funding + 6×hiring 
 *                 - 12×negativeTone - 8×regulation - 6×lawsuits - 5×layoffs
 * 
 * Clamped to [-100, 100]
 */

export interface MomentumInputs {
  mentions: number;
  fundingSignals: number;
  hiringSignals: number;
  negativeToneShare: number; // 0-1 scaled
  regulationMentions: number;
  lawsuitMentions: number;
  layoffMentions: number;
}

export interface MomentumDriver {
  label: string;
  contribution: number;
  detail?: string;
}

export type MomentumDirection = 'up' | 'down' | 'flat';
export type MomentumStrength = 'mild' | 'moderate' | 'strong';

export interface MomentumBreakdown {
  score: number; // -100..100
  direction: MomentumDirection;
  strength: MomentumStrength;
  explanation: string;
  
  bullDrivers: MomentumDriver[];
  bearDrivers: MomentumDriver[];
  
  inputs: MomentumInputs & {
    zscoreMentions: number;
    mean?: number;
    stdDev?: number;
  };
}

/**
 * Calculate z-score for mentions
 * z = (current - mean) / stdDev
 * If stdDev = 0, return 0
 */
export function calculateZScore(
  current: number,
  allValues: number[]
): { zscore: number; mean: number; stdDev: number } {
  if (allValues.length === 0) {
    return { zscore: 0, mean: 0, stdDev: 0 };
  }
  
  const mean = allValues.reduce((sum, val) => sum + val, 0) / allValues.length;
  
  const variance = allValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / allValues.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) {
    return { zscore: 0, mean, stdDev: 0 };
  }
  
  const zscore = (current - mean) / stdDev;
  return { zscore, mean, stdDev };
}

/**
 * Calculate momentum score and full breakdown
 */
export function calculateMomentumBreakdown(
  inputs: MomentumInputs,
  allMentions: number[] // For z-score calculation
): MomentumBreakdown {
  // Calculate z-score for mentions
  const { zscore: zscoreMentions, mean, stdDev } = calculateZScore(inputs.mentions, allMentions);
  
  // Calculate individual contributions
  const mentionsContribution = 15 * zscoreMentions;
  const fundingContribution = 10 * inputs.fundingSignals;
  const hiringContribution = 6 * inputs.hiringSignals;
  const negativeToneContribution = -12 * inputs.negativeToneShare;
  const regulationContribution = -8 * inputs.regulationMentions;
  const lawsuitContribution = -6 * inputs.lawsuitMentions;
  const layoffContribution = -5 * inputs.layoffMentions;
  
  // Calculate raw score
  const rawScore = 
    mentionsContribution +
    fundingContribution +
    hiringContribution +
    negativeToneContribution +
    regulationContribution +
    lawsuitContribution +
    layoffContribution;
  
  // Clamp to [-100, 100]
  const score = Math.max(-100, Math.min(100, rawScore));
  
  // Determine direction and strength
  const direction: MomentumDirection = 
    score > 5 ? 'up' : 
    score < -5 ? 'down' : 
    'flat';
  
  const absScore = Math.abs(score);
  const strength: MomentumStrength = 
    absScore >= 50 ? 'strong' :
    absScore >= 20 ? 'moderate' :
    'mild';
  
  // Build bull drivers (positive contributions)
  const bullDrivers: MomentumDriver[] = [];
  
  if (mentionsContribution > 0) {
    bullDrivers.push({
      label: 'News Mentions',
      contribution: mentionsContribution,
      detail: `${inputs.mentions} mentions (${zscoreMentions.toFixed(2)}σ above baseline)`,
    });
  }
  
  if (fundingContribution > 0) {
    bullDrivers.push({
      label: 'Funding Signals',
      contribution: fundingContribution,
      detail: `${inputs.fundingSignals} funding announcements detected`,
    });
  }
  
  if (hiringContribution > 0) {
    bullDrivers.push({
      label: 'Hiring Activity',
      contribution: hiringContribution,
      detail: `${inputs.hiringSignals} hiring signals tracked`,
    });
  }
  
  // Sort bull drivers by contribution desc
  bullDrivers.sort((a, b) => b.contribution - a.contribution);
  
  // Build bear drivers (negative contributions)
  const bearDrivers: MomentumDriver[] = [];
  
  if (negativeToneContribution < 0) {
    bearDrivers.push({
      label: 'Negative Coverage',
      contribution: negativeToneContribution,
      detail: `${(inputs.negativeToneShare * 100).toFixed(0)}% of coverage has negative tone`,
    });
  }
  
  if (regulationContribution < 0) {
    bearDrivers.push({
      label: 'Regulatory Mentions',
      contribution: regulationContribution,
      detail: `${inputs.regulationMentions} regulatory/compliance mentions`,
    });
  }
  
  if (lawsuitContribution < 0) {
    bearDrivers.push({
      label: 'Legal Issues',
      contribution: lawsuitContribution,
      detail: `${inputs.lawsuitMentions} lawsuit/litigation mentions`,
    });
  }
  
  if (layoffContribution < 0) {
    bearDrivers.push({
      label: 'Layoffs',
      contribution: layoffContribution,
      detail: `${inputs.layoffMentions} layoff/downsizing mentions`,
    });
  }
  
  // Sort bear drivers by contribution asc (most negative first)
  bearDrivers.sort((a, b) => a.contribution - b.contribution);
  
  // Generate explanation
  const explanation = generateExplanation(direction, strength, bullDrivers, bearDrivers);
  
  return {
    score,
    direction,
    strength,
    explanation,
    bullDrivers,
    bearDrivers,
    inputs: {
      ...inputs,
      zscoreMentions,
      mean,
      stdDev,
    },
  };
}

/**
 * Generate human-readable explanation
 */
function generateExplanation(
  direction: MomentumDirection,
  strength: MomentumStrength,
  bullDrivers: MomentumDriver[],
  bearDrivers: MomentumDriver[]
): string {
  if (direction === 'flat') {
    return 'Momentum is neutral with balanced positive and negative signals.';
  }
  
  if (direction === 'up') {
    const topBull = bullDrivers[0]?.label || 'positive signals';
    const secondBull = bullDrivers[1]?.label;
    
    if (bearDrivers.length === 0) {
      return `Momentum is ${strength}ly positive driven by ${topBull.toLowerCase()}${secondBull ? ` and ${secondBull.toLowerCase()}` : ''}.`;
    } else {
      const topBear = bearDrivers[0]?.label || 'negative factors';
      return `Momentum is ${strength}ly positive as ${topBull.toLowerCase()}${secondBull ? ` and ${secondBull.toLowerCase()}` : ''} outweighed ${topBear.toLowerCase()}.`;
    }
  }
  
  // direction === 'down'
  const topBear = bearDrivers[0]?.label || 'negative signals';
  const secondBear = bearDrivers[1]?.label;
  
  if (bullDrivers.length === 0) {
    return `Momentum is ${strength}ly negative due to ${topBear.toLowerCase()}${secondBear ? ` and ${secondBear.toLowerCase()}` : ''}.`;
  } else {
    const topBull = bullDrivers[0]?.label || 'positive factors';
    return `Momentum is ${strength}ly negative as ${topBear.toLowerCase()}${secondBear ? ` and ${secondBear.toLowerCase()}` : ''} outweighed ${topBull.toLowerCase()}.`;
  }
}

