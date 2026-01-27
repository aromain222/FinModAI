import type { ResolvedModelFacts, Fact, FactSource } from './factsTypes';

const nowISO = () => new Date().toISOString();
const isValidNumber = (n: any, allowZero = false) =>
  typeof n === 'number' && Number.isFinite(n) && (allowZero ? true : n !== 0);

const fact = <T>(value: T | null, source: FactSource, confidence: 'high' | 'med' | 'low', notes: string[] = []): Fact<T> => ({
  value,
  source,
  confidence,
  asOf: nowISO(),
  notes,
});

const safeSource = (value: any): FactSource => {
  const allowed: FactSource[] = [
    'results',
    'sheet',
    'fmp',
    'stooq',
    'polygon',
    'finnhub',
    'alphavantage',
    'sec',
    'openai',
    'derived',
    'unknown',
    'unavailable',
  ];
  return allowed.includes(value) ? value : 'unknown';
};

const toConfidence = (value?: number | null): 'high' | 'med' | 'low' => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'low';
  if (value >= 0.75) return 'high';
  if (value >= 0.5) return 'med';
  return 'low';
};

export function resolveFacts(input: { model: any; derivedPreview: any }): ResolvedModelFacts {
  const { model, derivedPreview } = input;
  const results = typeof model?.results === 'string' ? tryParse(model.results) : model?.results || {};
  const storedFacts = results?.facts || {};
  const ticker = model?.ticker || '';

  const sheet = derivedPreview || {};
  const sheetOutputs = sheet.keyOutputs || {};
  const companyName =
    model?.company_name ||
    storedFacts?.companyName ||
    results?.companyName ||
    sheet?.sheetMeta?.companyName ||
    null;

  const sharesFromResults =
    storedFacts?.sharesOutstandingMm ??
    results?.sharesOutstandingMm ??
    results?.shares ??
    results?.sharesOutstanding ??
    results?.capitalization?.sharesOutstanding ??
    null;
  const sharesFromSheet = sheetOutputs?.shares ?? sheetOutputs?.sharesMm ?? null;

  const sharesSource = safeSource(storedFacts?.sources?.shares || results?.sharesSource || 'results');
  const shares =
    isValidNumber(sharesFromResults) && sharesFromResults! > 0
      ? fact(sharesFromResults, sharesSource, toConfidence(storedFacts?.confidence?.shares))
      : isValidNumber(sharesFromSheet) && sharesFromSheet! > 0
      ? fact(sharesFromSheet, 'sheet', 'high')
      : fact<number>(null, 'unavailable', 'low');

  const netDebtFromResults =
    storedFacts?.netDebt ??
    results?.netDebt ??
    results?.valuation?.netDebt ??
    null;
  const netDebtFromSheet = sheetOutputs?.netDebt ?? null;
  const netDebt = isValidNumber(netDebtFromResults, true)
    ? fact(netDebtFromResults, safeSource(storedFacts?.sources?.netDebt ?? 'results'), toConfidence(storedFacts?.confidence?.netDebt))
    : isValidNumber(netDebtFromSheet, true)
    ? fact(netDebtFromSheet, 'sheet', 'med')
    : fact<number>(null, 'unavailable', 'low');

  const hasExplicitMarketPrice =
    results && typeof results === 'object' && Object.prototype.hasOwnProperty.call(results, 'marketPrice');
  const marketPriceFromResults = hasExplicitMarketPrice ? results.marketPrice : storedFacts?.marketPrice ?? null;
  const marketPriceSourceCandidate =
    storedFacts?.sources?.price ??
    results?.marketPriceSource ??
    results?.factSources?.price ??
    'results';
  const marketPrice = isValidNumber(marketPriceFromResults, false)
    ? fact(marketPriceFromResults, safeSource(marketPriceSourceCandidate), toConfidence(storedFacts?.confidence?.price))
    : fact<number>(null, 'unavailable', 'low');

  const marketCapVal =
    isValidNumber(storedFacts?.marketCap, false)
      ? storedFacts.marketCap
      : isValidNumber(results?.marketCap, false)
      ? results.marketCap
      : null;

  return {
    ticker,
    companyName: companyName ? fact(companyName, 'results', 'high') : fact<string>(null, 'unavailable', 'low'),
    sharesOutstandingMm: shares,
    marketPrice,
    marketCap: marketCapVal
      ? fact(marketCapVal, safeSource(storedFacts?.sources?.marketCap ?? 'results'), 'high')
      : fact<number>(null, 'unavailable', 'low'),
    netDebtMillions: netDebt,
  };
}

function tryParse(json: string) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
