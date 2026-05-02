export type PmPlaybookId =
  | 'ai_capex'
  | 'search_antitrust'
  | 'cpi_fed'
  | 'earnings_guidance'
  | 'cloud_growth'
  | 'semiconductor_demand'
  | 'generic_catalyst';

export type RetrievedPmPlaybook = {
  id: PmPlaybookId;
  label: string;
  score: number;
  whatPriced: string;
  estimateRevisionRisk: string;
  multipleImpact: string;
  positioningRisk: string;
  timeHorizon: string;
  forecastOverlay: string;
};

type PmPlaybookTemplate = Omit<RetrievedPmPlaybook, 'score'> & {
  matchers: RegExp[];
};

const PM_PLAYBOOKS: PmPlaybookTemplate[] = [
  {
    id: 'ai_capex',
    label: 'AI capex return-on-invested-capital test',
    matchers: [/\b(ai capex|capex|data centers?|tpu|infrastructure spend|ai infrastructure|compute spend)\b/i],
    whatPriced: 'Market is pricing sustained AI investment as a growth asset, not just a cost burden.',
    estimateRevisionRisk: 'Risk is negative if capex rises without visible revenue acceleration or Cloud margin improvement.',
    multipleImpact: 'Multiple expands if AI spend has clear ROI; compresses if investors reframe it as structurally lower FCF conversion.',
    positioningRisk: 'Mega-cap tech holders are crowded in the AI capex trade, so weak ROI evidence can create fast de-risking.',
    timeHorizon: '1-3 months for guidance and capex commentary; 6-12 months for proof in revenue and margin.',
    forecastOverlay: 'Use a small positive overlay only if spend is paired with demand or margin evidence; otherwise use a negative FCF/multiple overlay.',
  },
  {
    id: 'search_antitrust',
    label: 'Search regulatory overhang',
    matchers: [/\b(search|google)\b.*\b(antitrust|regulat|eu|doj|remed(y|ies)|data[-\s]?sharing|competition)\b/i, /\b(antitrust|regulat|eu|doj|remed(y|ies)|data[-\s]?sharing)\b/i],
    whatPriced: 'Market discounts regulatory risk, but usually not a severe impairment to Search distribution or data advantages.',
    estimateRevisionRisk: 'Near-term estimates may not move unless remedies change traffic acquisition costs, default distribution, or ad monetization.',
    multipleImpact: 'Primary effect is higher risk premium and lower terminal multiple on Search cash flows.',
    positioningRisk: 'Long-only holders may tolerate slow legal process, but event-driven funds can pressure the stock around remedy headlines.',
    timeHorizon: 'Headline risk is immediate; fundamental impact is usually multi-quarter to multi-year.',
    forecastOverlay: 'Use a negative overlay when remedies look more concrete; use a scenario range when process risk is still unresolved.',
  },
  {
    id: 'cpi_fed',
    label: 'Macro rates beta',
    matchers: [/\b(cpi|inflation|pce|fomc|fed|rates?|payroll|nonfarm|jobs|treasury yields?|real yields?)\b/i],
    whatPriced: 'Market is pricing a path for rates and inflation; the stock reacts to deviations from that path.',
    estimateRevisionRisk: 'Company estimates rarely change immediately, but discount-rate assumptions and risk appetite do.',
    multipleImpact: 'Lower real yields support long-duration multiples; higher-for-longer rates compress multiples.',
    positioningRisk: 'Macro-sensitive mega-cap positioning can amplify moves when the release changes rate-cut odds.',
    timeHorizon: 'Intraday to 30 days, depending on whether the release resets the next Fed path.',
    forecastOverlay: 'Map dovish/cooler surprises to a positive multiple overlay and hawkish/hotter surprises to a negative overlay.',
  },
  {
    id: 'earnings_guidance',
    label: 'Earnings guidance reset',
    matchers: [/\b(earnings|guidance|guide|outlook|estimate|consensus|eps|revenue estimate|margin guide)\b/i],
    whatPriced: 'Market is pricing consensus numbers plus management credibility around the next guide.',
    estimateRevisionRisk: 'High: guidance, backlog, margins, and demand commentary can force analyst revisions.',
    multipleImpact: 'Multiple follows the quality of the guide: cleaner growth and margin durability support expansion; messy bridges compress it.',
    positioningRisk: 'Crowded winners can sell off on good-but-not-better guidance; underowned names can squeeze on clean raises.',
    timeHorizon: 'Immediate through 30 days as analysts update models and PMs resize positions.',
    forecastOverlay: 'Use a larger overlay only when guidance changes forward estimates, not just when the reported quarter beats.',
  },
  {
    id: 'cloud_growth',
    label: 'Cloud growth and operating leverage',
    matchers: [/\b(cloud|google cloud|gcp|azure|aws|cloud margin|cloud growth|backlog)\b/i],
    whatPriced: 'Market is pricing Cloud as the incremental growth and operating leverage engine.',
    estimateRevisionRisk: 'Positive if revenue acceleration and margin expansion both show up; negative if growth needs heavier spending.',
    multipleImpact: 'Sustained Cloud acceleration supports a higher blended growth multiple; margin disappointment caps re-rating.',
    positioningRisk: 'Investors may rotate within mega-cap AI beneficiaries depending on which platform shows the best incremental ROI.',
    timeHorizon: '30 days for narrative and estimate revisions; several quarters for margin proof.',
    forecastOverlay: 'Positive overlay when Cloud acceleration offsets capex; mixed overlay when growth is real but FCF conversion weakens.',
  },
  {
    id: 'semiconductor_demand',
    label: 'AI semiconductor demand cycle',
    matchers: [/\b(semiconductor|gpu|blackwell|h100|h200|b200|cuda|accelerator|data center demand|hyperscaler|custom silicon|asic)\b/i],
    whatPriced: 'Market is pricing durable AI infrastructure demand and high visibility into the accelerator cycle.',
    estimateRevisionRisk: 'High if supply, lead times, pricing, or hyperscaler orders change forward revenue assumptions.',
    multipleImpact: 'Multiple holds if demand durability extends beyond the current backlog; compresses if investors see peak-cycle risk.',
    positioningRisk: 'AI semis are crowded, so small changes in growth durability can produce outsized factor and momentum moves.',
    timeHorizon: '30 days for order/guidance headlines; 1-2 quarters for revenue conversion.',
    forecastOverlay: 'Use a positive overlay for confirmed demand acceleration, and a negative overlay for pricing, supply, or custom-silicon risk.',
  },
  {
    id: 'generic_catalyst',
    label: 'Generic catalyst discipline',
    matchers: [],
    whatPriced: 'Market may already price part of the headline; only incremental information should change the forecast.',
    estimateRevisionRisk: 'Low unless the catalyst changes revenue, margin, cash flow, or risk assumptions.',
    multipleImpact: 'Multiple impact should be limited unless the event changes durability, risk premium, or terminal economics.',
    positioningRisk: 'Positioning matters only if the name is crowded or the catalyst challenges the dominant narrative.',
    timeHorizon: '30 days for headline digestion; longer if it requires financial proof.',
    forecastOverlay: 'Keep overlay small unless there is a clear estimate, multiple, or positioning channel.',
  },
];

export function retrievePmPlaybookForEvent(params: {
  ticker: string;
  title: string;
  impact: string;
  kind?: string | null;
}): RetrievedPmPlaybook {
  const text = `${params.ticker} ${params.title} ${params.impact} ${params.kind ?? ''}`;
  const scored = PM_PLAYBOOKS.map((template) => {
    const score = template.matchers.reduce((sum, matcher) => sum + (matcher.test(text) ? 1 : 0), 0);
    return { template, score };
  }).sort((left, right) => right.score - left.score);
  const winner = scored[0]?.score ? scored[0].template : PM_PLAYBOOKS.find((template) => template.id === 'generic_catalyst') ?? PM_PLAYBOOKS[PM_PLAYBOOKS.length - 1];
  const score = scored[0]?.score ? Math.min(1, scored[0].score / Math.max(1, winner.matchers.length)) : 0.25;
  return {
    id: winner.id,
    label: winner.label,
    score,
    whatPriced: winner.whatPriced,
    estimateRevisionRisk: winner.estimateRevisionRisk,
    multipleImpact: winner.multipleImpact,
    positioningRisk: winner.positioningRisk,
    timeHorizon: winner.timeHorizon,
    forecastOverlay: winner.forecastOverlay,
  };
}
