export type CompanyNewsHeadline = {
  title: string;
  description?: string | null;
  source?: string | null;
  publishedAt?: string | null;
};

export type NewsSentimentRead = {
  score: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
  thesis: string;
  risk: string;
  watch: string;
};

const NEGATIVE_TERMS = /\b(cut|cuts|miss|misses|weak|decline|falls?|drop|probe|lawsuit|investigation|ban|recall|delay|downgrade|underweight|risk|crash|fraud|fine|tariff)\b/i;
const POSITIVE_TERMS = /\b(beat|beats|raises?|growth|record|approval|launch|upgrade|overweight|wins?|expands?|surge|accelerat|partnership)\b/i;
const ESTIMATE_TERMS = /\b(revenue|margin|eps|earnings|guidance|deliveries|production|orders|shipments|forecast|estimate|sales)\b/i;

function companyTerms(ticker: string, companyName?: string | null): string[] {
  const terms = [ticker];
  if (companyName) terms.push(...companyName.split(/\s+/).filter(word => word.length > 3));
  if (ticker === 'TSLA') terms.push('Tesla', 'Cybertruck', 'Model 3', 'Model Y', 'FSD', 'robotaxi');
  return Array.from(new Set(terms.map(term => term.toLowerCase())));
}

function isDirectHeadline(
  ticker: string,
  headline: CompanyNewsHeadline,
  companyName?: string | null,
): boolean {
  const text = `${headline.title} ${headline.description ?? ''}`.toLowerCase();
  return companyTerms(ticker, companyName).some(term => text.includes(term));
}

function isMuskAdjacent(text: string): boolean {
  return /\b(musk|spacex|xai|x\.ai|neuralink|x corp|twitter)\b/i.test(text);
}

export function buildDeterministicNewsSentiment(
  ticker: string,
  headlines: CompanyNewsHeadline[],
  companyName?: string | null,
): NewsSentimentRead {
  if (headlines.length === 0) {
    return {
      score: 50,
      signal: 'neutral',
      confidence: 35,
      reasoning: `No recent ${ticker}-specific headlines were available, so the news read is unconfirmed rather than neutral by conviction.`,
      thesis: 'The news tape does not currently add or subtract from the investment thesis.',
      risk: 'A material company event may be missing from the available feed.',
      watch: `Watch for a verified ${ticker} earnings, guidance, product, regulatory, or estimate-revision event.`,
    };
  }

  const direct = headlines.filter(headline => isDirectHeadline(ticker, headline, companyName));
  const indirect = headlines.filter(headline => !isDirectHeadline(ticker, headline, companyName));
  const directText = direct.map(item => `${item.title} ${item.description ?? ''}`).join(' ');
  const negative = direct.filter(item => NEGATIVE_TERMS.test(`${item.title} ${item.description ?? ''}`)).length;
  const positive = direct.filter(item => POSITIVE_TERMS.test(`${item.title} ${item.description ?? ''}`)).length;
  const estimateSensitive = ESTIMATE_TERMS.test(directText);
  const score = Math.max(25, Math.min(75, 50 + (positive - negative) * 8));
  const signal = score >= 58 ? 'bullish' : score <= 42 ? 'bearish' : 'neutral';
  const topDirect = direct[0]?.title;
  const topIndirect = indirect[0];
  const indirectText = topIndirect ? `${topIndirect.title} ${topIndirect.description ?? ''}` : '';
  const indirectExplanation = topIndirect
    ? isMuskAdjacent(indirectText) && ticker === 'TSLA'
      ? ` ${topIndirect.title} is indirect to Tesla: it does not change Tesla revenue or EPS without a disclosed ownership, financing, commercial, or management-attention link.`
      : ` ${topIndirect.title} lacks a clear direct transmission path to ${ticker}, so it should not move estimates yet.`
    : '';
  const directExplanation = topDirect
    ? `${topDirect} is the most directly relevant item${estimateSensitive ? ' because it can affect operating estimates or guidance' : ', but it does not yet establish a quantified estimate change'}.`
    : `None of the loaded stories has a clear direct transmission path into ${ticker}'s revenue, margins, cash flow, or valuation.`;

  return {
    score,
    signal,
    confidence: Math.max(40, Math.min(78, 42 + direct.length * 7)),
    reasoning: `${directExplanation}${indirectExplanation}`.trim(),
    thesis: direct.length > 0
      ? `The current news tape is ${signal}, led by ${direct.length} directly relevant item${direct.length === 1 ? '' : 's'}; indirect stories are excluded from the core thesis.`
      : 'The loaded news is mostly adjacent coverage and should not change the investment thesis.',
    risk: indirect.length > direct.length
      ? 'Headline volume may overstate company relevance because adjacent people or businesses dominate the feed.'
      : 'The initial headline framing may change when quantified company disclosures arrive.',
    watch: ticker === 'TSLA' && indirect.some(item => isMuskAdjacent(`${item.title} ${item.description ?? ''}`))
      ? 'Watch for a disclosed Tesla-SpaceX transaction, ownership link, financing impact, or evidence that management attention affects Tesla execution.'
      : `Watch for a quantified ${ticker} estimate revision, guidance change, regulatory action, or confirmed operating impact.`,
  };
}

export function formatNewsContextForPrompt(
  ticker: string,
  headlines: CompanyNewsHeadline[],
  companyName?: string | null,
): string {
  if (headlines.length === 0) return 'RECENT NEWS\nNo verified company headlines were loaded.';
  const terms = companyTerms(ticker, companyName);
  const lines = headlines.slice(0, 10).map((headline, index) => {
    const text = `${headline.title} ${headline.description ?? ''}`.toLowerCase();
    const direct = terms.some(term => text.includes(term));
    const description = headline.description?.trim();
    return `${index + 1}. [${direct ? 'direct-name match' : 'possibly indirect'}] ${headline.title}${description ? ` - ${description.slice(0, 240)}` : ''} (${headline.source || 'News'}, ${headline.publishedAt || 'recent'})`;
  });
  return `RECENT NEWS FOR ${ticker}\n${lines.join('\n')}`;
}
