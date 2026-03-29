import type {
  InvestmentHistoricalPattern,
  InvestmentHistoricalPatternMatchResult,
  InvestmentScenarioBias,
} from '@/lib/investment-analysis/eventTypes';
import type { InvestmentEventClassificationResult } from '@/lib/investment-analysis/eventTypes';

type HistoricalPatternTemplate = {
  headlineInterpretation: string;
  patterns: InvestmentHistoricalPattern[];
  impactSummary: string;
};

const PATTERN_LIBRARY: Partial<Record<InvestmentEventClassificationResult['category'], HistoricalPatternTemplate>> = {
  management_transition: {
    headlineInterpretation:
      'Leadership transitions usually hit valuation first through confidence and execution risk, with fundamentals changing only if strategy or operating cadence weakens later.',
    impactSummary:
      'This usually behaves like an execution-confidence shock: near-term multiple pressure, modest growth/margin haircut, and a higher required return until succession credibility improves.',
    patterns: [
      {
        id: 'exec_transition_multiple_reset',
        label: 'Execution confidence reset',
        period: 'Recurring pattern',
        summary: 'CEO departures often trigger a short-term derating before investors get comfortable with strategy continuity.',
        transmissionPath: 'headline shock -> lower execution confidence -> higher equity risk premium -> lower valuation support',
        typicalModelAdjustments: ['raise WACC modestly', 'trim near-term growth', 'trim early margin assumptions'],
      },
    ],
  },
  geopolitical_conflict: {
    headlineInterpretation:
      'Conflict headlines usually map to commodity, freight, and risk-premium shocks first, then to demand and margin effects depending on sector exposure.',
    impactSummary:
      'This is usually a mix of higher discount rates, higher input costs, and sector rotation. Defense and energy can benefit while import-heavy or consumer-sensitive businesses see pressure.',
    patterns: [
      {
        id: 'energy_shipping_shock',
        label: 'Energy and shipping disruption',
        period: 'Oil-shock style regimes',
        summary: 'Geopolitical escalation tends to push oil, freight, and insurance costs higher while broad risk appetite weakens.',
        transmissionPath: 'conflict escalation -> commodity/freight shock -> inflation pressure and lower confidence -> wider discount rates',
        typicalModelAdjustments: ['raise WACC', 'cut non-defense growth', 'trim margins for cost-exposed sectors'],
      },
      {
        id: 'defense_backlog_support',
        label: 'Defense spending uplift',
        period: 'Defense-capex response phases',
        summary: 'Defense contractors can see stronger backlog, revenue visibility, and mix in prolonged conflict environments.',
        transmissionPath: 'security shock -> budget reprioritization -> defense demand visibility -> better growth and margin confidence',
        typicalModelAdjustments: ['lift revenue growth for defense names', 'modestly improve margin path', 'limit WACC increase versus market'],
      },
    ],
  },
  macro_slowdown: {
    headlineInterpretation:
      'Slowdown headlines usually map to volume pressure and de-rating risk, with cyclicals hit first and defensives holding up better.',
    impactSummary:
      'This is mainly a demand and operating-leverage story. Forecasts need lower revenue growth, margin compression, and sometimes a mixed discount-rate effect depending on the rate backdrop.',
    patterns: [
      {
        id: 'cyclical_demand_reset',
        label: 'Cyclical demand reset',
        period: 'Classic slowdown pattern',
        summary: 'Growth expectations roll over before margins fully reset, especially in industrial, consumer discretionary, and enterprise spending names.',
        transmissionPath: 'weaker macro data -> lower demand expectations -> lower operating leverage -> weaker cash flow conversion',
        typicalModelAdjustments: ['cut revenue growth', 'trim margins', 'keep terminal assumptions conservative'],
      },
    ],
  },
  inflation_shock: {
    headlineInterpretation:
      'Inflation shocks usually behave like a higher-rate and margin-pressure regime, unless the company is directly linked to commodity or pricing-power upside.',
    impactSummary:
      'This is often more of a discount-rate and cost-pressure story than a pure demand story. Commodity-linked names can benefit, but duration-sensitive equities usually de-rate.',
    patterns: [
      {
        id: 'higher_for_longer_reset',
        label: 'Higher-for-longer reset',
        period: 'Inflation repricing regimes',
        summary: 'Persistent inflation tends to push policy expectations and discount rates higher, compressing long-duration valuation multiples.',
        transmissionPath: 'inflation surprise -> higher policy/rate expectations -> higher discount rates -> lower long-duration equity values',
        typicalModelAdjustments: ['raise WACC', 'trim terminal growth', 'reduce duration-heavy valuation support'],
      },
      {
        id: 'commodity_cashflow_tailwind',
        label: 'Commodity-linked revenue uplift',
        period: 'Commodity pass-through phases',
        summary: 'Energy and materials names can see stronger nominal revenue and cash flow if price realizations move faster than cost inflation.',
        transmissionPath: 'commodity shock -> stronger realized pricing -> higher cash flow for producers -> more resilient valuation support',
        typicalModelAdjustments: ['lift growth for commodity-linked sectors', 'improve margin path where pass-through exists', 'keep discount-rate pressure in view'],
      },
    ],
  },
  trade_fragmentation: {
    headlineInterpretation:
      'Trade fragmentation headlines usually map to lower global efficiency, more capex duplication, and supply-chain margin drag, with select domestic-build beneficiaries.',
    impactSummary:
      'This is mainly a growth-quality and margin-structure reset. Export-exposed and globally integrated businesses usually take lower growth and margin assumptions plus some risk-premium pressure.',
    patterns: [
      {
        id: 'export_control_decoupling',
        label: 'Export-control decoupling',
        period: 'Semiconductor and strategic-tech restrictions',
        summary: 'Export controls and decoupling pressures reduce addressable market breadth and increase supply-chain redesign costs.',
        transmissionPath: 'policy restriction -> smaller addressable market + higher supply-chain friction -> lower growth and margin durability',
        typicalModelAdjustments: ['cut revenue growth', 'trim margins', 'raise WACC modestly'],
      },
      {
        id: 'domestic_build_subsidy_tailwind',
        label: 'Domestic-build support',
        period: 'Reshoring and subsidy cycles',
        summary: 'Some industrial and infrastructure suppliers benefit when domestic production and local supply chains get policy support.',
        transmissionPath: 'fragmentation policy -> domestic capex and localization -> stronger order flow for select suppliers',
        typicalModelAdjustments: ['lift targeted growth assumptions', 'keep margins mixed due to reinvestment needs', 'separate beneficiaries from broad market losers'],
      },
    ],
  },
  debt_cycle_stress: {
    headlineInterpretation:
      'Debt-stress headlines usually resemble a funding and term-premium regime, where lower growth does not automatically mean lower discount rates.',
    impactSummary:
      'This is mainly a funding-cost and required-return story. Highly leveraged, duration-sensitive, or refinancing-dependent businesses usually need higher WACC and more conservative terminal assumptions.',
    patterns: [
      {
        id: 'term_premium_repricing',
        label: 'Term-premium repricing',
        period: 'Fiscal-stress and duration-selloff regimes',
        summary: 'Debt and fiscal stress can push the term premium higher, lifting required returns even if growth expectations weaken.',
        transmissionPath: 'debt/fiscal concern -> higher term premium -> higher discount rates -> lower valuation support',
        typicalModelAdjustments: ['raise WACC', 'keep terminal growth conservative', 'stress refinancing-sensitive names'],
      },
      {
        id: 'funding_stress_credit_pressure',
        label: 'Funding-stress and credit pressure',
        period: 'Banking and rollover stress episodes',
        summary: 'Funding stress tightens credit conditions, which can hit volumes, spreads, and equity valuation simultaneously.',
        transmissionPath: 'funding stress -> tighter credit and liquidity -> weaker growth + higher risk premium -> lower equity value',
        typicalModelAdjustments: ['cut growth', 'trim margins', 'raise WACC further for levered names'],
      },
    ],
  },
  regulatory_shift: {
    headlineInterpretation:
      'Regulatory shocks usually affect the market through changed economics, compliance costs, or addressable-market constraints rather than immediate balance-sheet changes.',
    impactSummary:
      'This is usually a margin, growth, or multiple question depending on whether the rule constrains distribution, pricing, data use, or market access.',
    patterns: [
      {
        id: 'regulatory_cost_repricing',
        label: 'Regulatory cost repricing',
        period: 'Compliance and restriction cycles',
        summary: 'Rules can raise compliance costs and reduce optionality before they show up fully in reported results.',
        transmissionPath: 'rule change -> higher compliance burden or lower flexibility -> lower margins / lower strategic value -> valuation pressure',
        typicalModelAdjustments: ['trim margins', 'cut growth where access is constrained', 'raise WACC modestly if uncertainty increases'],
      },
    ],
  },
  major_contract_win: {
    headlineInterpretation:
      'Major contract wins usually behave like backlog and visibility improvements, but only if the award is material relative to the revenue base.',
    impactSummary:
      'This is mainly a revenue-visibility and confidence story. Growth can improve, but the right move is usually targeted forecast support rather than a full multiple rerating.',
    patterns: [
      {
        id: 'backlog_visibility_upgrade',
        label: 'Backlog visibility upgrade',
        period: 'Large award cycles',
        summary: 'Material awards improve revenue visibility, especially in industrial, aerospace, and government-contracting models.',
        transmissionPath: 'contract award -> higher backlog visibility -> stronger forecast confidence -> better near-term growth support',
        typicalModelAdjustments: ['lift near-term growth', 'modestly improve margin confidence if mix is favorable', 'avoid over-expanding terminal assumptions'],
      },
    ],
  },
  product_catalyst: {
    headlineInterpretation:
      'Product catalysts usually affect the market through adoption-rate expectations and mix, with the valuation move driven by whether the launch changes the medium-term growth path.',
    impactSummary:
      'This is usually a demand-ramp story first and a multiple story second. The key modeling question is whether the catalyst changes the outer-year revenue and margin trajectory.',
    patterns: [
      {
        id: 'adoption_ramp_repricing',
        label: 'Adoption-ramp repricing',
        period: 'Launch and commercialization phases',
        summary: 'Successful launches can raise growth and mix assumptions, but the market usually waits for evidence on ramp durability.',
        transmissionPath: 'product catalyst -> better adoption expectations -> higher revenue/mix outlook -> improved cash flow and valuation support',
        typicalModelAdjustments: ['lift growth path', 'improve margin path where mix supports it', 'avoid overextending terminal value on launch headlines alone'],
      },
    ],
  },
};

export function mapEventToHistoricalPatterns(args: {
  classification: InvestmentEventClassificationResult;
  scenarioBias: InvestmentScenarioBias;
}): InvestmentHistoricalPatternMatchResult | null {
  const template = PATTERN_LIBRARY[args.classification.category];
  if (!template) return null;

  return {
    eventCategory: args.classification.category,
    scenarioBias: args.scenarioBias,
    headlineInterpretation: template.headlineInterpretation,
    patterns: template.patterns,
    impactSummary: template.impactSummary,
  };
}
