import { getMarketCandidates } from '@/lib/enrich/sources/marketApis';
import { getSecCandidates } from '@/lib/enrich/sources/sec';
import { fetchScrapeSources } from '@/lib/enrich/sources/scrape';
import { openaiExtractFacts } from '@/lib/enrich/openaiExtract';
import { chooseBestCandidate, type FactCandidate } from '@/lib/enrich/validate';

export type EnrichedFactsResult = {
  sharesOutstandingMm: number | null;
  marketPrice: number | null;
  marketCap: number | null;
  netDebt: number | null;
  companyName: string | null;
  sources: Record<string, string>;
  confidence: Record<string, number>;
  asOf?: string | null;
  provenance?: Array<{ source: string; url?: string | null }>;
};

export async function resolveEnrichedFacts(params: { ticker: string; enterpriseValue?: number | null }) {
  const { ticker, enterpriseValue } = params;

  const market = await getMarketCandidates(ticker);
  const sec = await getSecCandidates(ticker);

  const shareCandidates = [
    ...market.shareCandidates,
    ...(sec.sharesCandidate ? [sec.sharesCandidate] : []),
  ];
  const priceCandidates = [...market.priceCandidates];
  const marketCapCandidates = [...market.marketCapCandidates];
  const netDebtCandidates: FactCandidate[] = sec.netDebtCandidate ? [sec.netDebtCandidate] : [];

  const sharesChosen = chooseBestCandidate(shareCandidates, { kind: 'shares' });
  const priceChosen = chooseBestCandidate(priceCandidates, { kind: 'price' });
  const marketCapChosen = marketCapCandidates.find((cand) => Number.isFinite(cand.value)) ?? {
    value: null,
    source: 'unavailable',
    confidence: 0,
  };
  const netDebtChosen = chooseBestCandidate(netDebtCandidates, {
    kind: 'netDebt',
    enterpriseValue,
  });

  const needsOpenAi =
    !sharesChosen.value ||
    !priceChosen.value ||
    (!netDebtChosen.value && sec.rawText);

  let openAiFacts = null;
  if (needsOpenAi) {
    const scraped = await fetchScrapeSources(ticker);
    const sources = [
      ...(sec.rawText ? [{ url: 'https://data.sec.gov/api/xbrl/companyfacts/', text: sec.rawText }] : []),
      ...scraped,
    ];
    openAiFacts = await openaiExtractFacts({
      ticker,
      sources,
      candidates: {
        shares: sharesChosen.value,
        price: priceChosen.value,
        marketCap: marketCapChosen.value,
        netDebt: netDebtChosen.value,
      },
    });
  }

  const openAiShare = openAiFacts?.shares_outstanding
    ? ({
        value: openAiFacts.shares_outstanding,
        source: 'openai',
        confidence: openAiFacts.confidence,
        unit: openAiFacts.shares_units ?? 'shares',
        asOf: openAiFacts.as_of_date ?? null,
        notes: openAiFacts.notes ? [openAiFacts.notes] : [],
      } satisfies FactCandidate)
    : null;

  const openAiPrice = openAiFacts?.market_price
    ? ({
        value: openAiFacts.market_price,
        source: 'openai',
        confidence: openAiFacts.confidence,
        unit: 'usd',
        asOf: openAiFacts.as_of_date ?? null,
        notes: openAiFacts.notes ? [openAiFacts.notes] : [],
      } satisfies FactCandidate)
    : null;

  const openAiNetDebt = openAiFacts?.net_debt
    ? ({
        value: openAiFacts.net_debt,
        source: 'openai',
        confidence: openAiFacts.confidence,
        unit: 'usd',
        asOf: openAiFacts.as_of_date ?? null,
        notes: openAiFacts.notes ? [openAiFacts.notes] : [],
      } satisfies FactCandidate)
    : null;

  const finalShares = chooseBestCandidate(
    [...shareCandidates, ...(openAiShare ? [openAiShare] : [])],
    { kind: 'shares' }
  );
  const finalPrice = chooseBestCandidate(
    [...priceCandidates, ...(openAiPrice ? [openAiPrice] : [])],
    { kind: 'price' }
  );
  const finalNetDebt = chooseBestCandidate(
    [...netDebtCandidates, ...(openAiNetDebt ? [openAiNetDebt] : [])],
    { kind: 'netDebt', enterpriseValue }
  );

  let derivedShares: FactCandidate | null = null;
  if (!finalShares.value && marketCapChosen.value && finalPrice.value) {
    derivedShares = {
      value: marketCapChosen.value / finalPrice.value,
      source: 'derived',
      confidence: 0.3,
      unit: 'shares',
      notes: ['Derived from market cap / price'],
    };
  }

  const finalSharesWithDerived = chooseBestCandidate(
    [...shareCandidates, ...(openAiShare ? [openAiShare] : []), ...(derivedShares ? [derivedShares] : [])],
    { kind: 'shares' }
  );

  let derivedPrice: FactCandidate | null = null;
  if (!finalPrice.value && marketCapChosen.value && finalSharesWithDerived.value) {
    derivedPrice = {
      value: marketCapChosen.value / (finalSharesWithDerived.value * 1_000_000),
      source: 'derived',
      confidence: 0.3,
      unit: 'usd',
      notes: ['Derived from market cap / shares'],
    };
  }

  const finalPriceWithDerived = chooseBestCandidate(
    [...priceCandidates, ...(openAiPrice ? [openAiPrice] : []), ...(derivedPrice ? [derivedPrice] : [])],
    { kind: 'price' }
  );

  const provenance = [
    ...(openAiFacts?.sources?.map((s) => ({ source: s.name, url: s.url })) ?? []),
  ];

  return {
    sharesOutstandingMm: finalSharesWithDerived.value,
    marketPrice: finalPriceWithDerived.value,
    marketCap: marketCapChosen.value ?? null,
    netDebt: finalNetDebt.value,
    companyName: market.companyName,
    sources: {
      shares: finalSharesWithDerived.source,
      price: finalPriceWithDerived.source,
      netDebt: finalNetDebt.source,
      marketCap: marketCapChosen.source ?? 'unavailable',
    },
    confidence: {
      shares: finalSharesWithDerived.confidence,
      price: finalPriceWithDerived.confidence,
      netDebt: finalNetDebt.confidence,
      marketCap: marketCapChosen.confidence ?? 0,
    },
    asOf: openAiFacts?.as_of_date ?? finalSharesWithDerived.asOf ?? finalPriceWithDerived.asOf ?? null,
    provenance,
  } as EnrichedFactsResult;
}
