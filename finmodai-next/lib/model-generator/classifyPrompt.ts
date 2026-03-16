export type ModelGeneratorType =
  | 'DCF'
  | 'THREE_STATEMENT'
  | 'CAP_TABLE'
  | 'SAAS_OPERATING_MODEL'
  | 'COMPS'
  | 'PRECEDENTS'
  | 'LBO';

export function classifyPrompt(prompt: string): ModelGeneratorType | null {
  const text = prompt.toLowerCase();

  if (/\bdcf\b/.test(text)) return 'DCF';
  if (/\blbo\b|\bleveraged buyout\b/.test(text)) return 'LBO';
  if (/\bprecedent(?:s| transaction(?:s)?)\b|\bprecedent trans(?:action)?s?\b|\bprecent trxn\b/.test(text)) return 'PRECEDENTS';
  if (/\bcomps?\b|\bcomparable company\b|\btrading comps?\b/.test(text)) return 'COMPS';
  if (
    /\bthree[-\s]?(?:statement|statements|statememnt|statment)\b|\b3[-\s]?(?:statement|statements|statememnt|statment)\b|\bthree[-\s]?(?:statement|statements|statememnt|statment)\s+model\b|\bfinancial statements?\b|\bincome statement\b|\bbalance sheet\b|\bcash flow(?: statement)?\b/.test(text)
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
