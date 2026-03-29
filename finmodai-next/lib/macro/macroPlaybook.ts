export type MacroPlaybookDirection = 'up' | 'down' | 'mixed' | 'unknown';
export type MacroPlaybookBias = 'Risk-On' | 'Risk-Off' | 'Hawkish' | 'Dovish' | 'Neutral';

export type MacroPlaybookTheme =
  | 'commodity_shipping_shock'
  | 'trade_fragmentation'
  | 'debt_cycle_stress'
  | 'financial_crisis'
  | 'reserve_realignment'
  | 'institutional_constraint';

export type MacroPlaybookMatch = {
  theme: MacroPlaybookTheme;
  label: string;
  sourceBooks: string[];
  whyMarketsCare: string;
  transmissionPath: string[];
  watchItems: string[];
  scenarioGuidance: string[];
  aiGuidance: string[];
  bias: MacroPlaybookBias;
  confidence: 'medium' | 'high';
  sectors: Array<{ sector: string; direction: MacroPlaybookDirection; rationale: string }>;
};

type MacroPlaybookRule = MacroPlaybookMatch & {
  patterns: RegExp[];
};

const PLAYBOOK_RULES: MacroPlaybookRule[] = [
  {
    theme: 'commodity_shipping_shock',
    label: 'Commodity and Shipping Shock',
    sourceBooks: ['Geopolitical Alpha', 'The Changing World Order'],
    patterns: [
      /\b(oil|brent|wti|crude|lng|pipeline|refinery|energy supply)\b/i,
      /\b(strait|hormuz|shipping route|shipping lanes|freight|cargo|tanker|maritime)\b/i,
      /\b(blockade|supply disruption|port disruption)\b/i,
    ],
    whyMarketsCare:
      'Commodity and shipping shocks usually hit markets through inflation expectations first, then through policy constraints, margin pressure, and weaker real demand. The first-order move is rarely just oil itself; it is the knock-on effect on rates, FX, and sector leadership.',
    transmissionPath: [
      'Geopolitical or logistics shock -> energy and freight costs rise',
      'Inflation expectations and breakevens move higher',
      'Central banks have less room to ease',
      'Energy and defense outperform while transports, chemicals, and discretionary lag',
    ],
    watchItems: ['Brent and WTI', 'Shipping rates', '5Y5Y inflation expectations', '2Y and 10Y yields', 'Airline and transport relative performance'],
    scenarioGuidance: [
      'Raise WACC if the business is fuel-, freight-, or duration-sensitive.',
      'Pressure margins where pricing power is weak and input costs reset faster than end prices.',
      'Keep nominal revenue effects separate from real-volume effects.',
    ],
    aiGuidance: [
      'Explain the transmission through inflation and policy, not only through commodity prices.',
      'Call out which sectors benefit from the supply shock and which absorb the cost shock.',
    ],
    bias: 'Risk-Off',
    confidence: 'high',
    sectors: [
      { sector: 'Energy', direction: 'up', rationale: 'Supply and freight risk raise commodity risk premia and cash flow expectations.' },
      { sector: 'Industrials', direction: 'down', rationale: 'Transport and logistics-heavy names face cost pressure and demand risk.' },
      { sector: 'Consumer Discretionary', direction: 'down', rationale: 'Fuel and freight passthrough weakens real purchasing power.' },
    ],
  },
  {
    theme: 'trade_fragmentation',
    label: 'Trade Fragmentation and Strategic Decoupling',
    sourceBooks: ['Geopolitical Alpha', 'The Changing World Order'],
    patterns: [
      /\b(tariff|tariffs|export controls?|trade war|import duties?|quota)\b/i,
      /\b(decoupling|friendshoring|reshoring|supply chain shift|trade restriction)\b/i,
      /\b(semiconductor restrictions?|chip controls?|sanctions?)\b/i,
    ],
    whyMarketsCare:
      'Trade fragmentation changes markets through margin structure, capex duplication, and a slower global efficiency regime. The market effect is usually a longer-lasting multiple and profitability reset rather than a one-day headline move.',
    transmissionPath: [
      'Trade restriction or export control -> supply chains become less efficient',
      'Input costs and compliance costs rise while addressable markets shrink',
      'Capex shifts toward redundancy and domestic capacity',
      'Margins and long-duration multiples compress across exposed sectors',
    ],
    watchItems: ['New tariff schedules', 'Export-control scope', 'Capex relocation commentary', 'FX moves in export-sensitive regions', 'Semiconductor and industrial relative performance'],
    scenarioGuidance: [
      'Lower medium-term revenue growth for globally exposed exporters and platform businesses.',
      'Compress margins if compliance, sourcing, or duplication costs rise.',
      'Use a higher discount rate when policy visibility and addressable market certainty deteriorate.',
    ],
    aiGuidance: [
      'Frame this as a regime shift in globalization efficiency, not just a political headline.',
      'Separate short-term retaliation risk from long-term capital-allocation and margin effects.',
    ],
    bias: 'Risk-Off',
    confidence: 'high',
    sectors: [
      { sector: 'Technology', direction: 'down', rationale: 'Semiconductor and hardware supply chains are highly exposed to export controls and addressable-market loss.' },
      { sector: 'Industrials', direction: 'down', rationale: 'Cross-border manufacturing and sourcing complexity usually raise cost and execution risk.' },
      { sector: 'Materials', direction: 'mixed', rationale: 'Domestic buildout can help selected suppliers even as global trade volume slows.' },
    ],
  },
  {
    theme: 'debt_cycle_stress',
    label: 'Debt Cycle and Fiscal Stress',
    sourceBooks: ['The Changing World Order', 'This Time Is Different'],
    patterns: [
      /\b(debt burden|debt crisis|fiscal deficits?|treasury supply|term premium)\b/i,
      /\b(deficit financing|debt servicing|bond vigilantes|fiscal dominance)\b/i,
      /\b(surging debt|unsustainable debt|sovereign stress|sovereign default|default risk)\b/i,
    ],
    whyMarketsCare:
      'Late-cycle debt stress usually forces markets to reprice the cost of capital, not just growth. When debt servicing and issuance become central, duration, FX credibility, and equity multiples all become more fragile together.',
    transmissionPath: [
      'Debt burden and issuance pressure rise',
      'Term premium and funding concerns increase',
      'Discount rates stay higher and fiscal flexibility weakens',
      'Long-duration assets and financing-sensitive sectors de-rate first',
    ],
    watchItems: ['Long-end Treasury yields', 'Term premium proxies', 'Auction demand', 'Fiscal deficit headlines', 'Gold and USD reaction'],
    scenarioGuidance: [
      'Increase WACC and trim terminal growth for duration-sensitive businesses.',
      'Stress refinancing-heavy or balance-sheet-intensive sectors harder than asset-light defensives.',
      'Do not assume lower growth automatically means lower discount rates in debt-stress regimes.',
    ],
    aiGuidance: [
      'Explain the distinction between growth slowdown and debt-capital stress.',
      'Call out when the market is repricing real rates, term premium, or sovereign credibility rather than just earnings.',
    ],
    bias: 'Hawkish',
    confidence: 'medium',
    sectors: [
      { sector: 'Real Estate', direction: 'down', rationale: 'Financing-sensitive cash flows are directly exposed to a higher term premium.' },
      { sector: 'Utilities', direction: 'down', rationale: 'Bond-proxy sectors struggle when duration becomes harder to own.' },
      { sector: 'Materials', direction: 'up', rationale: 'Gold and hard-asset proxies can benefit if debt concerns weaken confidence in fiat assets.' },
    ],
  },
  {
    theme: 'financial_crisis',
    label: 'Banking and Sovereign Funding Crisis',
    sourceBooks: ['This Time Is Different'],
    patterns: [
      /\b(bank run|banking crisis|bank failures?|deposit flight|liquidity crisis)\b/i,
      /\bcredit boom|credit bust|sudden stop|funding stress|rollover risk\b/i,
      /\bsovereign default|restructuring|imf program|balance of payments crisis\b/i,
    ],
    whyMarketsCare:
      'Financial crises transmit through the balance sheet before they show up in macro data. Once deposit confidence, rollover risk, or sovereign funding comes into question, markets reprice creditworthiness, liquidity, and policy capacity at the same time.',
    transmissionPath: [
      'Leverage or funding stress appears',
      'Depositors, lenders, and investors pull back together',
      'Credit availability contracts while risk premia and liquidity preference surge',
      'Banks, cyclicals, and financing-sensitive assets underperform as policy backstops become the key variable',
    ],
    watchItems: ['Bank deposit flows', 'Funding spreads', 'CDS and sovereign spreads', 'Emergency liquidity facilities', 'Credit issuance windows'],
    scenarioGuidance: [
      'Raise WACC materially for leveraged, cyclical, and externally financed businesses.',
      'Stress revenue and margin together when credit contraction threatens end-demand and working capital.',
      'Use a wider bear-case range because crisis regimes are nonlinear.',
    ],
    aiGuidance: [
      'Explain the balance-sheet channel first: funding, rollover, deposits, collateral, and sovereign credibility.',
      'Do not describe a banking panic as a simple growth slowdown; the transmission is faster and more reflexive.',
    ],
    bias: 'Risk-Off',
    confidence: 'high',
    sectors: [
      { sector: 'Financials', direction: 'down', rationale: 'Banks and lenders absorb funding stress first through deposits, spreads, and balance-sheet confidence.' },
      { sector: 'Real Estate', direction: 'down', rationale: 'Credit-sensitive asset classes reprice quickly when financing channels weaken.' },
      { sector: 'Consumer Staples', direction: 'up', rationale: 'Defensive cash-flow sectors often outperform when credit conditions tighten abruptly.' },
    ],
  },
  {
    theme: 'reserve_realignment',
    label: 'Reserve and Capital-Flow Realignment',
    sourceBooks: ['The Changing World Order', 'Geopolitical Alpha'],
    patterns: [
      /\b(reserve currency|de-dollarization|reserve diversification|capital controls?)\b/i,
      /\b(currency realignment|fx reserves?|gold buying|sanctions evasion)\b/i,
      /\b(cross-border payments|settlement system|dollar funding)\b/i,
    ],
    whyMarketsCare:
      'Reserve and capital-flow shifts matter because they can change the relative demand for duration, the dollar, and reserve assets over time. The market signal is usually gradual, but once it bites, it affects funding costs, commodities, and geopolitical hedging demand together.',
    transmissionPath: [
      'Reserve-management or sanctions regime shifts alter capital-flow incentives',
      'Demand for reserve assets and funding currencies changes',
      'FX, gold, and real-asset preferences reprice before equities fully absorb it',
      'Global multinationals and financing-heavy sectors then feel the secondary effects',
    ],
    watchItems: ['Dollar index', 'Gold', 'Official reserve headlines', 'Cross-border settlement policy', 'EM FX and sovereign spreads'],
    scenarioGuidance: [
      'Stress FX translation and cost of capital separately.',
      'Increase scenario weight on commodities, hard assets, and external-balance sensitivity.',
      'Use lower confidence unless there is concrete policy or reserve-flow evidence.',
    ],
    aiGuidance: [
      'Treat reserve-transition headlines as structural and slower-moving unless paired with a funding shock.',
      'Highlight capital flows, reserve preferences, and settlement systems rather than generic geopolitical commentary.',
    ],
    bias: 'Neutral',
    confidence: 'medium',
    sectors: [
      { sector: 'Materials', direction: 'up', rationale: 'Gold and hard-asset demand can strengthen under reserve-diversification themes.' },
      { sector: 'Financials', direction: 'mixed', rationale: 'Funding and FX dynamics can help or hurt depending on balance-sheet structure and dollar exposure.' },
      { sector: 'Technology', direction: 'mixed', rationale: 'Large multinationals face translation and cross-border demand uncertainty rather than a clean directional read-through.' },
    ],
  },
  {
    theme: 'institutional_constraint',
    label: 'Institutional and Policy Constraint',
    sourceBooks: ['Geopolitical Alpha'],
    patterns: [
      /\b(committee|senate|parliament|bureaucracy|institutional constraints?)\b/i,
      /\b(policy process|confirmation|implementation risk|coalition)\b/i,
      /\bcentral bank independence|court challenge|regulatory process\b/i,
    ],
    whyMarketsCare:
      'Institutional constraints often determine whether a headline becomes policy reality. Markets overreact when they trade the statement but ignore the implementation path, so the real edge is in separating headline intent from institutional capacity and timing.',
    transmissionPath: [
      'Headline or political signal emerges',
      'Institutions, courts, agencies, or coalitions shape implementation',
      'Market repricing is either validated or reversed as process reality sets in',
    ],
    watchItems: ['Implementation timeline', 'Agency guidance', 'Court or legislative hurdles', 'Follow-up official statements'],
    scenarioGuidance: [
      'Keep first-order model shocks smaller when policy implementation is uncertain.',
      'Use scenario ranges rather than a single hard-coded outcome.',
      'Raise confidence only when process and enforcement become clearer.',
    ],
    aiGuidance: [
      'Explicitly distinguish signal from implementation.',
      'Lower confidence on low-signal political process stories that lack a clear transmission path.',
    ],
    bias: 'Neutral',
    confidence: 'medium',
    sectors: [
      { sector: 'Financials', direction: 'mixed', rationale: 'Policy implementation risk matters, but the direct economic effect is often delayed.' },
      { sector: 'Technology', direction: 'mixed', rationale: 'Regulatory or trade headlines matter only once scope and enforcement become concrete.' },
    ],
  },
];

export function findMacroPlaybookMatches(text: string): MacroPlaybookMatch[] {
  const haystack = text.trim();
  if (!haystack) return [];
  return PLAYBOOK_RULES.filter((rule) => rule.patterns.some((pattern) => pattern.test(haystack))).map(
    ({ patterns: _patterns, ...rule }) => rule,
  );
}

export function buildMacroPlaybookPromptContext(text: string): string {
  const matches = findMacroPlaybookMatches(text);
  if (matches.length === 0) return '';

  return matches
    .slice(0, 2)
    .map((match, index) => {
      const why = match.whyMarketsCare;
      const path = match.transmissionPath.join(' -> ');
      const scenario = match.scenarioGuidance.join(' ');
      return `Framework ${index + 1}: ${match.label} (${match.sourceBooks.join(', ')}). Markets care because ${why} Transmission path: ${path}. Scenario guidance: ${scenario}`;
    })
    .join('\n');
}
