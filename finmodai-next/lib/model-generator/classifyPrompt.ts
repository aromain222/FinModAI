export type ModelGeneratorType =
  | 'DCF'
  | 'THREE_STATEMENT'
  | 'CAP_TABLE'
  | 'SAAS_OPERATING_MODEL'
  | 'COMPS'
  | 'DEBT_CAPACITY_LITE'
  | 'FOOTBALL_FIELD'
  | 'MERGER'
  | 'PRECEDENTS'
  | 'LBO';

export function classifyPrompt(prompt: string): ModelGeneratorType | null {
  const text = prompt.toLowerCase();
  const threeStatementPattern =
    /\bthree[-\s]?(?:statement|statements|statememnt|statment|statemenrt|statememt)\b|\b3[-\s]?(?:statement|statements|statememnt|statment|statemenrt|statememt)\b|\bthree[-\s]?(?:statement|statements|statememnt|statment|statemenrt|statememt)\s+model\b/;
  const forecastIntentPattern =
    /\b(?:forecast|forecasting|projection|projections|projected|operating forecast|operating case|forecast model|projection model|build projections?)\b/;
  const forecastLineItemPattern =
    /\b(?:revenue|ebitda|ebit|net income|capex|working capital|cash flow|ending cash|debt|balance sheet|income statement)\b/;
  const operatingModelPattern =
    /\b(?:\d+[-\s]?year\s+operating model|operating model)\b/;
  const compareCompsPattern =
    /\b(compare|comparison|versus|vs\.?|against)\b/.test(text) &&
    /\b(as investments?|investment case|valuation|valuations|multiple|multiples|peers?)\b/.test(text);

  if (/\bdcf\b/.test(text)) return 'DCF';
  if (/\blbo\b|\bleveraged buyout\b/.test(text)) return 'LBO';
  if (/\bdebt capacity\b|\bleverage headroom\b|\binterest coverage\b|\bcredit stats\b/.test(text)) return 'DEBT_CAPACITY_LITE';
  if (/\bfootball field\b|\bvaluation football field\b/.test(text)) return 'FOOTBALL_FIELD';
  if (
    /\b(?:merger model|m&a model|accretion(?:\s*\/\s*|\s+and\s+|\s+)\s*dilution|accretive|dilutive)\b/.test(text) ||
    (/\b(?:acquir(?:e|es|ing)|buy(?:ing)?|merg(?:er|ing with))\b/.test(text) && /\b(?:for|at)\s+\$?\d/.test(text))
  ) {
    return 'MERGER';
  }
  if (/\bprecedent(?:s| transaction(?:s)?)\b|\bprecedent trans(?:action)?s?\b|\bprecent trxn\b/.test(text)) return 'PRECEDENTS';
  if (/\bcomps?\b|\bcomparable company\b|\btrading comps?\b/.test(text) || compareCompsPattern) return 'COMPS';
  if (
    threeStatementPattern.test(text) ||
    (forecastIntentPattern.test(text) && forecastLineItemPattern.test(text)) ||
    (/\b(build|create|generate|run|show|output)\b/.test(text) &&
      /\b(?:forecast|projection|projections|operating forecast|operating case)\b/.test(text)) ||
    (operatingModelPattern.test(text) &&
      (forecastLineItemPattern.test(text) || /\b\d+[-\s]?year\b/.test(text))) ||
    /\bfinancial statements?\b|\bincome statement\b|\bbalance sheet\b|\bcash flow(?: statement)?\b/.test(text)
  ) {
    return 'THREE_STATEMENT';
  }
  if (
    /\bcap\s?table\b/.test(text) ||
    /\bseed round\b/.test(text) ||
    /\bseries a\b/.test(text) ||
    /\bpre-money\b/.test(text)
  ) {
    return 'CAP_TABLE';
  }
  if (/\bsaas\b|\barr\b/.test(text)) return 'SAAS_OPERATING_MODEL';

  return null;
}
