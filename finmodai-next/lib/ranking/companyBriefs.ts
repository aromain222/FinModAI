export type CompanyBrief = {
  strategicContext: string;
  nearTermFocus: string;
  keyDriver: string;
  mainRisk: string;
  watchItems: string[];
};

const DEFAULT_BRIEF: CompanyBrief = {
  strategicContext: 'This stock is in the ranked universe because its forecast, catalyst, momentum, valuation, and risk profile can change over a 1-3 month swing-trading window.',
  nearTermFocus: 'Watch whether the next company catalyst changes estimates, valuation multiple, or investor positioning.',
  keyDriver: 'The rank is driven by the strongest live score factor, then checked against valuation and risk.',
  mainRisk: 'The setup weakens if the catalyst fails to change estimates, multiple, or investor positioning.',
  watchItems: ['Upcoming catalyst', 'Forecast direction', 'Momentum confirmation', 'Valuation signal'],
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
  DASH: {
    strategicContext: 'DoorDash is a local-commerce platform where order frequency, GOV, advertising attach, grocery expansion, and contribution margin drive revisions.',
    nearTermFocus: 'Watch order growth, consumer frequency, ads revenue, grocery/non-restaurant traction, and delivery-margin commentary.',
    keyDriver: 'The setup works if GOV growth and ads attach lift estimates without reigniting margin concerns.',
    mainRisk: 'Consumer softness, promo pressure, driver-cost inflation, or weaker grocery economics can pressure margins and the multiple.',
    watchItems: ['Order frequency', 'GOV growth', 'Ads attach', 'Grocery traction', 'Contribution margin'],
  },
  ABNB: {
    strategicContext: 'Airbnb is a travel-demand and marketplace take-rate story where nights booked, ADR, supply growth, and regulation drive the near-term debate.',
    nearTermFocus: 'Watch nights booked, ADR, urban demand, supply additions, take rate, and city-level regulatory headlines.',
    keyDriver: 'The PM question is whether travel demand and supply growth can support estimate revisions while regulation stays contained.',
    mainRisk: 'Weak travel demand, ADR compression, host supply issues, or tougher local regulation can de-rate the stock.',
    watchItems: ['Nights booked', 'ADR', 'Supply growth', 'Take rate', 'Local regulation'],
  },
  ROKU: {
    strategicContext: 'Roku is a connected-TV advertising and platform monetization story where engagement, ad pricing, platform revenue, and operating discipline drive the stock.',
    nearTermFocus: 'Watch streaming hours, platform ARPU, ad-market recovery, inventory quality, and opex discipline.',
    keyDriver: 'The score improves if CTV ad recovery converts into platform revenue growth and cleaner margins.',
    mainRisk: 'Soft ad budgets, weak ARPU, competition from scaled platforms, or renewed spend can pressure the multiple.',
    watchItems: ['Streaming hours', 'Platform ARPU', 'CTV ad pricing', 'Opex discipline', 'Competition'],
  },
  SQ: {
    strategicContext: 'Block is a fintech ecosystem story where Square GPV, Cash App inflows, lending/Afterpay credit, bitcoin activity, and expense discipline drive revisions.',
    nearTermFocus: 'Watch seller GPV, Cash App monetization, credit losses, bitcoin volume, and operating-margin guidance.',
    keyDriver: 'The setup works if gross profit growth and expense discipline offset consumer-credit and crypto volatility.',
    mainRisk: 'Merchant softness, weaker Cash App engagement, credit losses, or crypto drawdowns can overwhelm the growth case.',
    watchItems: ['Seller GPV', 'Cash App inflows', 'Credit losses', 'Bitcoin activity', 'Opex discipline'],
  },
  PYPL: {
    strategicContext: 'PayPal is a payments turnaround story where branded checkout, Braintree margins, transaction margin dollars, and product execution drive the re-rating debate.',
    nearTermFocus: 'Watch branded checkout stabilization, Braintree profitability, transaction margin, active-account trends, and management execution.',
    keyDriver: 'The PM question is whether new product and pricing actions can stabilize transaction margins fast enough to earn multiple expansion.',
    mainRisk: 'Checkout share loss, Braintree margin pressure, weak account engagement, or slow turnaround execution can keep the stock value-trapped.',
    watchItems: ['Branded checkout', 'Braintree margin', 'Transaction margin', 'Active accounts', 'Product execution'],
  },
  SNOW: {
    strategicContext: 'Snowflake is a consumption-software and data-cloud story where product revenue growth, net retention, AI workloads, and free-cash-flow durability drive the stock.',
    nearTermFocus: 'Watch consumption trends, product revenue guide, NRR, large-customer growth, AI/data workloads, and margin discipline.',
    keyDriver: 'The setup improves if consumption stabilizes and AI/data workloads support durable product revenue growth.',
    mainRisk: 'Slower consumption, weak NRR, customer optimization, or AI investment without monetization can compress the software multiple.',
    watchItems: ['Product revenue guide', 'Consumption growth', 'Net retention', 'AI workloads', 'FCF margin'],
  },
  AFRM: {
    strategicContext: 'Affirm is a high-beta consumer credit and BNPL platform where funding costs, credit quality, GMV growth, and merchant adoption drive the stock.',
    nearTermFocus: 'Watch GMV growth, delinquencies, funding-cost commentary, merchant wins, and whether guidance supports profitable growth.',
    keyDriver: 'The rank is driven by strong forecast/momentum support, but the trade only works if credit quality and guidance hold up.',
    mainRisk: 'A weaker consumer, rising delinquencies, or higher funding costs can overwhelm growth and compress the multiple.',
    watchItems: ['GMV growth', 'Delinquencies', 'Funding costs', 'Merchant adoption', 'Guidance'],
  },
  SHOP: {
    strategicContext: 'Shopify is a commerce-infrastructure and merchant-services platform where GMV growth, attach rate, payments penetration, and operating leverage drive revisions.',
    nearTermFocus: 'Watch merchant GMV, Shopify Payments penetration, take-rate commentary, fulfillment/opex discipline, and whether AI tools improve merchant conversion.',
    keyDriver: 'The PM question is whether merchant growth and services attach can lift estimates without forcing heavier reinvestment.',
    mainRisk: 'Consumer softness, merchant churn, payments take-rate pressure, or renewed investment spend can pressure margins and the multiple.',
    watchItems: ['Merchant GMV', 'Payments attach', 'Take rate', 'Operating leverage', 'AI merchant tools'],
  },
  UBER: {
    strategicContext: 'Uber is a mobility, delivery, and logistics platform where bookings growth, take rate, driver supply, insurance costs, and margin conversion drive revisions.',
    nearTermFocus: 'Watch gross bookings, trip frequency, delivery profitability, mobility margins, insurance/legal costs, and autonomous-vehicle or regulation headlines.',
    keyDriver: 'The PM question is whether bookings growth converts into EBITDA and free-cash-flow upside without regulatory or insurance-cost pressure.',
    mainRisk: 'Gig-worker regulation, insurance inflation, weaker consumer mobility/delivery demand, or pricing pressure can hit margins and the multiple.',
    watchItems: ['Gross bookings', 'Trip growth', 'Delivery margin', 'Insurance costs', 'Gig-worker regulation'],
  },
};

const GROUPS = {
  aiSemis: [
    'NVDA', 'AMD', 'AVGO', 'TSM', 'ASML', 'ARM', 'MU', 'INTC', 'QCOM', 'SMCI',
    'MRVL', 'TXN', 'ADI', 'NXPI', 'LRCX', 'KLAC', 'AMAT', 'ON', 'MPWR', 'TER',
  ],
  enterpriseSoftware: [
    'PLTR', 'CRM', 'ADBE', 'INTU', 'ADSK', 'WDAY', 'SNOW', 'NOW', 'DDOG',
    'NET', 'MDB', 'CRWD', 'PANW', 'ZS', 'OKTA', 'TEAM', 'SNPS', 'CDNS', 'ANET',
  ],
  internetPlatforms: [
    'META', 'AMZN', 'GOOGL', 'NFLX', 'ROKU', 'SHOP', 'SPOT', 'PDD', 'BABA',
    'BIDU', 'JD', 'SE', 'MELI', 'UBER', 'DASH', 'ABNB', 'BKNG',
  ],
  fintechCrypto: [
    'SOFI', 'HOOD', 'COIN', 'AFRM', 'SQ', 'PYPL', 'MSTR', 'RIOT', 'MARA',
    'UPST', 'LCID',
  ],
  banksAndCapitalMarkets: [
    'JPM', 'GS', 'BAC', 'C', 'MS', 'BLK', 'SCHW', 'AXP', 'COF', 'ALLY',
    'DFS', 'KKR', 'BX', 'APO', 'ICE', 'CME', 'SPGI', 'MCO', 'BRK.B', 'TROW',
    'USB', 'PNC',
  ],
  healthcare: [
    'LLY', 'NVO', 'UNH', 'HUM', 'CI', 'ELV', 'CVS', 'ABBV', 'MRK', 'PFE',
    'BMY', 'GILD', 'AMGN', 'REGN', 'VRTX', 'ISRG', 'SYK', 'MDT', 'TMO',
    'DHR', 'BSX', 'ZBH',
  ],
  consumer: [
    'AAPL', 'DIS', 'WMT', 'COST', 'TGT', 'HD', 'LOW', 'NKE', 'SBUX',
    'MCD', 'CMG', 'YUM', 'KO', 'PEP', 'PG', 'CL', 'EL', 'LULU', 'TJX',
    'ULTA', 'RCL', 'CCL',
  ],
  industrialEnergy: [
    'TSLA', 'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'OXY', 'LNG', 'NEE', 'DUK',
    'SO', 'GE', 'HON', 'CAT', 'DE', 'ETN', 'EMR', 'PH', 'BA', 'LMT', 'RTX',
    'FSLR', 'ENPH', 'DELL', 'HPE', 'HPQ', 'STX', 'WDC',
  ],
} as const;

function includesTicker(group: readonly string[], ticker: string): boolean {
  return group.includes(ticker);
}

function inferCompanyBrief(ticker: string): CompanyBrief {
  if (includesTicker(GROUPS.aiSemis, ticker)) {
    return {
      strategicContext: `${ticker} is a semiconductor / AI-infrastructure swing idea where the market trades revisions, backlog quality, gross margins, and capex-cycle read-throughs.`,
      nearTermFocus: 'Watch AI demand, order commentary, inventory digestion, supply constraints, and whether guidance supports the current multiple.',
      keyDriver: 'Estimate revision risk from data-center, AI accelerator, memory, or equipment demand is the key driver.',
      mainRisk: 'A capex pause, margin pressure, export restriction, or weaker order commentary can hit both estimates and the multiple quickly.',
      watchItems: ['AI/data-center demand', 'Gross margin', 'Backlog/orders', 'Inventory cycle', 'Capex commentary'],
    };
  }

  if (includesTicker(GROUPS.enterpriseSoftware, ticker)) {
    return {
      strategicContext: `${ticker} is an enterprise-software setup where investors are testing AI monetization, bookings durability, net retention, and margin discipline.`,
      nearTermFocus: 'Watch billings, remaining performance obligations, customer adds, AI product attach, and guidance tone.',
      keyDriver: 'Bookings and guidance revisions drive the 1-3 month thesis more than the long-term TAM story.',
      mainRisk: 'Weak billings, slower consumption, churn, or AI spend without monetization can compress the software multiple.',
      watchItems: ['Billings/RPO', 'AI attach', 'Net retention', 'Guidance', 'Operating margin'],
    };
  }

  if (includesTicker(GROUPS.internetPlatforms, ticker)) {
    return {
      strategicContext: `${ticker} is an internet/platform idea where ad demand, commerce activity, engagement, take-rate, and AI/product changes drive revisions.`,
      nearTermFocus: 'Watch user engagement, ad pricing, marketplace volume, margin commentary, and regulatory or product headlines.',
      keyDriver: 'The PM question is whether near-term usage and monetization can push estimates higher without raising risk premium.',
      mainRisk: 'Ad softness, weaker engagement, regulation, or higher investment spend can pressure the multiple before fundamentals fully show it.',
      watchItems: ['Engagement', 'Ad/GMV growth', 'Take rate', 'Margin guide', 'Regulatory headlines'],
    };
  }

  if (includesTicker(GROUPS.fintechCrypto, ticker)) {
    return {
      strategicContext: `${ticker} is a high-beta fintech / crypto-credit idea where volumes, funding costs, credit quality, and retail risk appetite can move the stock fast.`,
      nearTermFocus: 'Watch transaction volume, net interest/funding costs, delinquencies, deposits, crypto activity, and guidance.',
      keyDriver: 'Revenue momentum and credit/funding quality decide whether the swing trade deserves a higher score.',
      mainRisk: 'A weaker consumer, rising losses, crypto drawdown, or funding-cost pressure can overwhelm growth.',
      watchItems: ['Volume/GMV', 'Credit quality', 'Funding costs', 'Crypto beta', 'Guidance'],
    };
  }

  if (includesTicker(GROUPS.banksAndCapitalMarkets, ticker)) {
    return {
      strategicContext: `${ticker} is a financials setup where rates, credit, capital markets activity, deposits, and buyback capacity drive the near-term case.`,
      nearTermFocus: 'Watch net interest income, credit costs, trading/IB activity, capital returns, and rate-cut expectations.',
      keyDriver: 'The score should move when the market reprices credit risk, rate sensitivity, or capital-markets revenue.',
      mainRisk: 'Deposit pressure, credit deterioration, weak deal activity, or adverse rate moves can reset the thesis.',
      watchItems: ['NII/deposits', 'Credit costs', 'IB/trading activity', 'Buybacks', 'Rates'],
    };
  }

  if (includesTicker(GROUPS.healthcare, ticker)) {
    return {
      strategicContext: `${ticker} is a healthcare setup where pipeline data, utilization, reimbursement, guidance, and product-cycle durability drive investor debate.`,
      nearTermFocus: 'Watch clinical/regulatory updates, volume trends, pricing, payer commentary, and guidance revisions.',
      keyDriver: 'Pipeline/product evidence and forward guidance determine whether estimates or the multiple can move in the window.',
      mainRisk: 'Trial/regulatory disappointment, pricing pressure, reimbursement risk, or weaker utilization can break the setup.',
      watchItems: ['Pipeline/regulatory updates', 'Volume/utilization', 'Pricing', 'Guidance', 'Margin'],
    };
  }

  if (includesTicker(GROUPS.consumer, ticker)) {
    return {
      strategicContext: `${ticker} is a consumer swing idea where traffic, pricing, inventory, margins, and consumer-spending data drive the rank.`,
      nearTermFocus: 'Watch same-store sales, traffic, basket size, inventory, promo intensity, and margin guidance.',
      keyDriver: 'The setup works if demand and margins hold better than investors expect over the next catalyst window.',
      mainRisk: 'Consumer weakness, promotional pressure, inventory issues, or weak guidance can quickly de-rate the stock.',
      watchItems: ['Traffic/sales', 'Pricing/promo intensity', 'Inventory', 'Margins', 'Guidance'],
    };
  }

  if (includesTicker(GROUPS.industrialEnergy, ticker)) {
    return {
      strategicContext: `${ticker} is an industrial / energy / hard-asset setup where orders, commodity prices, policy, margins, and cycle timing drive the trade.`,
      nearTermFocus: 'Watch order backlog, commodity moves, policy headlines, margin guide, production/delivery data, and capex plans.',
      keyDriver: 'Cycle evidence and margin guidance decide whether investors add or cut exposure in the 1-3 month window.',
      mainRisk: 'A weaker cycle, commodity reversal, execution miss, policy shock, or margin compression can turn the setup quickly.',
      watchItems: ['Orders/backlog', 'Commodity or policy moves', 'Margins', 'Deliveries/production', 'Capex'],
    };
  }

  return DEFAULT_BRIEF;
}

export function getCompanyBrief(ticker: string): CompanyBrief {
  const normalized = ticker.toUpperCase();
  return BRIEFS[normalized] ?? inferCompanyBrief(normalized);
}
