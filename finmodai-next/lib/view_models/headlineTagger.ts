/**
 * Deterministic Headline Impact Tagger
 * Rule-based tagging (NO LLM REQUIRED)
 */

export type ImpactTag = 'Rates' | 'Energy' | 'Earnings' | 'Geopolitics' | 'Financial Stress' | 'Macro';

/**
 * Tags a headline with deterministic impact category
 * Rules:
 * - invasion / war / sanctions → Geopolitics
 * - CPI / Fed / rates → Rates
 * - oil / OPEC / crude → Energy
 * - earnings / guidance → Earnings
 * - banks / liquidity → Financial Stress
 */
export function tagHeadline(headline: string): ImpactTag {
  const lower = headline.toLowerCase();
  
  // Geopolitics: invasion, war, sanctions (check first as it's most specific)
  if (
    /invasion|war|attack|sanctions|conflict|military|defense|nato|russia|china|ukraine|israel|palestine/i.test(headline)
  ) {
    return 'Geopolitics';
  }
  
  // Rates: CPI, Fed, rates
  if (
    /cpi|inflation|rates|fed|federal reserve|powell|fomc|interest rate|yield|hawk|dove/i.test(headline)
  ) {
    return 'Rates';
  }
  
  // Energy: oil, OPEC, crude
  if (
    /oil|opec|crude|gas|energy|petroleum|refinery|drilling/i.test(headline)
  ) {
    return 'Energy';
  }
  
  // Earnings: earnings, guidance
  if (
    /earnings|guidance|revenue|profit|eps|ebitda|margin|beat|miss/i.test(headline)
  ) {
    return 'Earnings';
  }
  
  // Financial Stress: banks, liquidity
  if (
    /bank|liquidity|credit|spread|default|solvency|stress/i.test(headline)
  ) {
    return 'Financial Stress';
  }
  
  // Default: Macro
  return 'Macro';
}

