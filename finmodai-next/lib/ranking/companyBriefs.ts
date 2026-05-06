export type CompanyBrief = {
  strategicContext: string;
  nearTermFocus: string;
  keyDriver: string;
  mainRisk: string;
  watchItems: string[];
};

const DEFAULT_BRIEF: CompanyBrief = {
  strategicContext: 'This is a ranked opportunity-board idea, so the question is whether the next catalyst changes estimates, the multiple, or positioning.',
  nearTermFocus: 'Watch the next earnings/catalyst window and whether the stock confirms the current score.',
  keyDriver: 'The strongest score factor is the main reason to keep working on the idea.',
  mainRisk: 'The setup weakens if the catalyst does not change estimates or investor positioning.',
  watchItems: ['Upcoming catalyst', 'Forecast direction', 'Score factor changes'],
};

const BRIEFS: Record<string, CompanyBrief> = {
  NVDA: {
    strategicContext: 'NVIDIA sits at the center of AI infrastructure through GPUs, networking, CUDA, and the Blackwell ramp.',
    nearTermFocus: 'The next 1-3 months are about Blackwell supply, hyperscaler capex, data-center margins, and whether demand still clears very high expectations.',
    keyDriver: 'AI accelerator demand and earnings revisions are the real driver.',
    mainRisk: 'Valuation, export controls, supply delays, or custom silicon/AMD pressure can hit the multiple quickly.',
    watchItems: ['Blackwell supply ramp', 'Hyperscaler AI capex', 'Data-center margins', 'China/export controls'],
  },
  GOOGL: {
    strategicContext: 'Alphabet is a Search and YouTube cash-flow machine with Cloud and Gemini driving the AI transition.',
    nearTermFocus: 'Watch AI Search monetization, Cloud growth, capex intensity, and antitrust headlines.',
    keyDriver: 'Search durability plus Cloud/AI estimate revisions drive the setup.',
    mainRisk: 'Regulatory remedies or AI Search monetization leakage can pressure the multiple.',
    watchItems: ['AI Search monetization', 'Google Cloud growth', 'AI capex ROI', 'Antitrust remedies'],
  },
  MSFT: {
    strategicContext: 'Microsoft is the enterprise AI platform trade through Azure, Copilot, GitHub, and OpenAI distribution.',
    nearTermFocus: 'Watch Azure AI growth, Copilot attach, capex ROI, and margin absorption.',
    keyDriver: 'Azure AI workload growth and enterprise software monetization drive revisions.',
    mainRisk: 'AI capex without visible revenue conversion can compress free-cash-flow confidence.',
    watchItems: ['Azure AI growth', 'Copilot attach', 'AI capex ROI', 'Enterprise renewals'],
  },
  AAPL: {
    strategicContext: 'Apple is a hardware ecosystem and services compounding story with AI features as the next upgrade-cycle test.',
    nearTermFocus: 'Watch iPhone demand, China, services growth, and whether AI features support upgrades.',
    keyDriver: 'Services durability and iPhone replacement demand drive near-term sentiment.',
    mainRisk: 'Weak China demand or muted AI upgrade demand can limit multiple expansion.',
    watchItems: ['iPhone demand', 'China sell-through', 'Services growth', 'AI upgrade cycle'],
  },
  AMZN: {
    strategicContext: 'Amazon combines AWS, retail margin recovery, advertising scale, and AI infrastructure demand.',
    nearTermFocus: 'Watch AWS acceleration, retail operating leverage, ad growth, and capex guidance.',
    keyDriver: 'AWS and retail margin expansion are the revision engine.',
    mainRisk: 'Higher logistics/capex spend or slower AWS growth can reset expectations.',
    watchItems: ['AWS growth', 'Retail margin', 'Ads growth', 'Capex guidance'],
  },
  META: {
    strategicContext: 'Meta is an AI ad-targeting and engagement story funded by very large social ad cash flows.',
    nearTermFocus: 'Watch ad pricing, Reels monetization, AI capex, and Reality Labs spend discipline.',
    keyDriver: 'Ad growth and operating leverage drive earnings revisions.',
    mainRisk: 'AI/metaverse capex or regulatory pressure can cap the multiple.',
    watchItems: ['Ad pricing', 'Reels monetization', 'AI capex', 'Reality Labs spend'],
  },
  TSLA: {
    strategicContext: 'Tesla is a mix of EV demand, margin pressure, autonomy optionality, and execution risk.',
    nearTermFocus: 'Watch deliveries, price cuts, gross margins, robotaxi progress, and China competition.',
    keyDriver: 'Margin stabilization and credible autonomy progress drive the stock.',
    mainRisk: 'Delivery weakness or price cuts can overwhelm the optionality narrative.',
    watchItems: ['Deliveries', 'Gross margin', 'Robotaxi milestones', 'China competition'],
  },
  AMD: {
    strategicContext: 'AMD is the second-source AI accelerator and server CPU share-gain story.',
    nearTermFocus: 'Watch MI300/AI GPU traction, data-center growth, and gross-margin progress.',
    keyDriver: 'AI GPU revenue ramps and server share gains drive revisions.',
    mainRisk: 'If NVIDIA keeps pricing power and AMD traction disappoints, the stock loses its AI catch-up premium.',
    watchItems: ['MI300 traction', 'Data-center growth', 'Server CPU share', 'Gross margin'],
  },
  PLTR: {
    strategicContext: 'Palantir is an AI software adoption story where commercial AIP demand has to justify a rich multiple.',
    nearTermFocus: 'Watch customer adds, government/commercial growth, and guidance quality.',
    keyDriver: 'AIP-driven revenue acceleration is the key driver.',
    mainRisk: 'A premium multiple leaves little room for slower growth or weaker bookings.',
    watchItems: ['AIP adoption', 'Commercial growth', 'Government renewals', 'Guidance quality'],
  },
  SOFI: {
    strategicContext: 'SoFi is a consumer-fintech operating leverage and credit-quality story.',
    nearTermFocus: 'Watch loan growth, deposit growth, credit performance, and earnings guidance.',
    keyDriver: 'Loan growth and guidance are the key earnings setup.',
    mainRisk: 'Credit deterioration or weak guidance can erase the beat narrative.',
    watchItems: ['Loan growth', 'Deposit growth', 'Credit losses', 'Guidance'],
  },
  HOOD: {
    strategicContext: 'Robinhood is a retail trading, crypto activity, cash sweep, and product-expansion story.',
    nearTermFocus: 'Watch trading volumes, crypto activity, net deposits, and margin/product adoption.',
    keyDriver: 'Retail activity and asset growth drive the near-term score.',
    mainRisk: 'Lower trading activity or crypto weakness can hit revenue momentum.',
    watchItems: ['Trading volumes', 'Crypto activity', 'Net deposits', 'Margin product adoption'],
  },
  COIN: {
    strategicContext: 'Coinbase is a crypto beta and market-structure story with operating leverage to trading volumes.',
    nearTermFocus: 'Watch crypto prices, trading volumes, ETF flows, and regulatory headlines.',
    keyDriver: 'Crypto momentum and transaction revenue drive estimate risk.',
    mainRisk: 'Crypto drawdowns or regulatory pressure can reverse the trade quickly.',
    watchItems: ['Crypto prices', 'Trading volumes', 'ETF flows', 'Regulatory headlines'],
  },
};

export function getCompanyBrief(ticker: string): CompanyBrief {
  return BRIEFS[ticker.toUpperCase()] ?? DEFAULT_BRIEF;
}
