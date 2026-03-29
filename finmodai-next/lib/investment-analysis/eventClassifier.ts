import type {
  InvestmentEventCategory,
  InvestmentEventClassificationInput,
  InvestmentEventClassificationResult,
  InvestmentEventConfidence,
} from '@/lib/investment-analysis/eventTypes';

type CategoryRule = {
  category: Exclude<InvestmentEventCategory, 'unknown'>;
  label: string;
  patterns: Array<{ pattern: RegExp; signal: string; weight: number }>;
  sectorBoosts?: Array<{ pattern: RegExp; signal: string; weight: number }>;
};

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: 'management_transition',
    label: 'CEO Departure / Management Transition',
    patterns: [
      { pattern: /\bceo\b.*\b(step(?:ping)? down|retir(?:e|es|ing)|resign(?:s|ed|ing))\b/i, signal: 'explicit_ceo_departure', weight: 5 },
      { pattern: /\bfounder\b.*\b(step(?:ping)? down|retir(?:e|es|ing)|resign(?:s|ed|ing))\b/i, signal: 'founder_departure', weight: 5 },
      { pattern: /\bmanagement transition\b|\bsuccession\b/i, signal: 'management_transition', weight: 3 },
      { pattern: /\bnew ceo\b|\binterim ceo\b/i, signal: 'new_ceo', weight: 3 },
    ],
  },
  {
    category: 'geopolitical_conflict',
    label: 'War / Geopolitical Conflict',
    patterns: [
      { pattern: /\bwar\b|\bwartime\b|\bwar environment\b/i, signal: 'war', weight: 5 },
      { pattern: /\bgeopolitical\b|\bgeopolitics\b/i, signal: 'geopolitical', weight: 4 },
      { pattern: /\bconflict\b|\bmilitary escalation\b/i, signal: 'conflict', weight: 4 },
      { pattern: /\bsanction(?:s)?\b/i, signal: 'sanctions', weight: 3 },
    ],
    sectorBoosts: [
      { pattern: /\bdefen[cs]e\b|\baerospace\b|\bgovernment contracting\b/i, signal: 'defense_sector_context', weight: 1 },
    ],
  },
  {
    category: 'macro_slowdown',
    label: 'Recession / Macro Slowdown',
    patterns: [
      { pattern: /\brecession\b|\brecessionary\b/i, signal: 'recession', weight: 5 },
      { pattern: /\bmacro slowdown\b|\beconomic slowdown\b/i, signal: 'macro_slowdown', weight: 4 },
      { pattern: /\bweak demand\b|\bdemand slowdown\b/i, signal: 'demand_slowdown', weight: 3 },
      { pattern: /\bconsumer pullback\b|\benterprise spending slowdown\b/i, signal: 'spending_slowdown', weight: 3 },
    ],
  },
  {
    category: 'inflation_shock',
    label: 'Inflation / Commodity Shock',
    patterns: [
      { pattern: /\binflation shock\b|\binflation surge\b|\bsticky inflation\b|\bhigher for longer\b/i, signal: 'inflation_shock', weight: 5 },
      { pattern: /\boil shock\b|\benergy shock\b|\bcommodity shock\b/i, signal: 'commodity_shock', weight: 5 },
      { pattern: /\binput cost\b|\bcost inflation\b|\bfreight inflation\b/i, signal: 'cost_inflation', weight: 3 },
      { pattern: /\bbreakevens?\b|\binflation expectations?\b/i, signal: 'inflation_expectations', weight: 3 },
    ],
  },
  {
    category: 'trade_fragmentation',
    label: 'Trade Fragmentation / Decoupling',
    patterns: [
      { pattern: /\btariffs?\b|\btrade war\b|\bimport duties?\b|\blevies\b/i, signal: 'tariffs', weight: 5 },
      { pattern: /\bexport controls?\b|\bchip controls?\b/i, signal: 'export_controls', weight: 5 },
      { pattern: /\bdecoupling\b|\bfriendshoring\b|\breshoring\b/i, signal: 'trade_fragmentation', weight: 4 },
      { pattern: /\bsupply chain shift\b|\bsupply chain disruption\b/i, signal: 'supply_chain_shift', weight: 3 },
    ],
    sectorBoosts: [
      { pattern: /\bsemiconductors?\b|\bhardware\b|\bindustrials?\b|\bconsumer electronics\b/i, signal: 'global_supply_chain_sector', weight: 1 },
    ],
  },
  {
    category: 'debt_cycle_stress',
    label: 'Debt Cycle / Fiscal Stress',
    patterns: [
      { pattern: /\bdebt crisis\b|\bdebt stress\b|\bdebt burden\b|\bunsustainable debt\b/i, signal: 'debt_stress', weight: 5 },
      { pattern: /\bfiscal deficits?\b|\bfiscal stress\b|\bfiscal dominance\b/i, signal: 'fiscal_stress', weight: 4 },
      { pattern: /\bterm premium\b|\btreasury supply\b|\bbond vigilantes\b/i, signal: 'term_premium', weight: 4 },
      { pattern: /\bsovereign stress\b|\brefinancing stress\b|\bsovereign default\b|\bbalance of payments crisis\b/i, signal: 'sovereign_refinancing', weight: 3 },
      { pattern: /\bbank run\b|\bbanking crisis\b|\bbank failures?\b|\bdeposit flight\b|\bliquidity crisis\b/i, signal: 'banking_crisis', weight: 5 },
      { pattern: /\bsudden stop\b|\bfunding stress\b|\brollover risk\b/i, signal: 'funding_crisis', weight: 4 },
    ],
    sectorBoosts: [
      { pattern: /\breal estate\b|\butilities\b|\bfinancials?\b/i, signal: 'duration_sensitive_sector', weight: 1 },
    ],
  },
  {
    category: 'regulatory_shift',
    label: 'Regulation Shift',
    patterns: [
      { pattern: /\bregulat(?:ion|ory)\b/i, signal: 'regulation', weight: 4 },
      { pattern: /\bantitrust\b|\bexport controls?\b/i, signal: 'regulatory_action', weight: 4 },
      { pattern: /\bcrackdown\b|\bcompliance burden\b/i, signal: 'regulatory_pressure', weight: 3 },
      { pattern: /\bpolicy shift\b|\bnew rules?\b/i, signal: 'policy_shift', weight: 3 },
    ],
  },
  {
    category: 'major_contract_win',
    label: 'Major Contract Win',
    patterns: [
      { pattern: /\bmajor contract\b|\blarge contract\b/i, signal: 'major_contract', weight: 4 },
      { pattern: /\bcontract win\b|\bwon (?:a |the )?(?:contract|deal)\b/i, signal: 'contract_win', weight: 5 },
      { pattern: /\bgovernment contract\b|\bprogram award\b/i, signal: 'government_award', weight: 4 },
      { pattern: /\bmultiyear deal\b|\blong-term agreement\b/i, signal: 'long_term_deal', weight: 3 },
    ],
  },
  {
    category: 'product_catalyst',
    label: 'Product Catalyst',
    patterns: [
      { pattern: /\bproduct catalyst\b|\bmajor launch\b/i, signal: 'product_catalyst', weight: 4 },
      { pattern: /\blaunch(?:ing|ed)?\b|\brollout\b/i, signal: 'launch', weight: 3 },
      { pattern: /\bapproval\b|\bcommercialization\b/i, signal: 'approval', weight: 3 },
      { pattern: /\bnew product cycle\b|\brefresh cycle\b/i, signal: 'product_cycle', weight: 4 },
    ],
    sectorBoosts: [
      { pattern: /\bbiotech\b|\bmedtech\b|\bsemiconductor\b|\bconsumer electronics\b/i, signal: 'product_sensitive_sector', weight: 1 },
    ],
  },
];

const SUMMARY_CLEANUP_PATTERNS: Array<[RegExp, string]> = [
  [/\bknowing\b\s*/i, ''],
  [/\bassuming\b\s*/i, ''],
  [/\bgiven\b\s*/i, ''],
  [/\bamid\b\s*/i, ''],
  [/\bwith\b\s*/i, ''],
];

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').replace(/[.]+$/, '');
}

function normalizeSummary(rawEventText: string): string {
  let summary = normalizeText(rawEventText);
  for (const [pattern, replacement] of SUMMARY_CLEANUP_PATTERNS) {
    summary = summary.replace(pattern, replacement);
  }
  return summary.charAt(0).toUpperCase() + summary.slice(1);
}

function toConfidence(score: number): InvestmentEventConfidence {
  if (score >= 5) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

function buildRationale(label: string, matchedSignals: string[], sector?: string | null): string {
  const signalText = matchedSignals.length > 0 ? matchedSignals.join(', ') : 'no strong event signals';
  const sectorText = sector ? ` Sector context: ${sector}.` : '';
  return `Classified as ${label} based on matched signals: ${signalText}.${sectorText}`;
}

export function classifyInvestmentEvent(
  input: InvestmentEventClassificationInput,
): InvestmentEventClassificationResult {
  const rawEventText = normalizeText(input.rawEventText);
  const sector = input.sector?.trim() || null;

  if (!rawEventText) {
    return {
      category: 'unknown',
      confidence: 'low',
      score: 0,
      normalizedEventSummary: '',
      rationale: 'No event text was provided, so the classifier returned the safe fallback.',
      matchedSignals: [],
    };
  }

  const scoringText = `${rawEventText} ${sector ?? ''}`.trim();
  let bestCategory: InvestmentEventClassificationResult | null = null;

  for (const rule of CATEGORY_RULES) {
    const matchedSignals: string[] = [];
    let score = 0;

    for (const entry of rule.patterns) {
      if (entry.pattern.test(scoringText)) {
        matchedSignals.push(entry.signal);
        score += entry.weight;
      }
    }

    for (const boost of rule.sectorBoosts ?? []) {
      if (sector && boost.pattern.test(sector)) {
        matchedSignals.push(boost.signal);
        score += boost.weight;
      }
    }

    if (!bestCategory || score > bestCategory.score) {
      bestCategory = {
        category: rule.category,
        confidence: toConfidence(score),
        score,
        normalizedEventSummary: normalizeSummary(rawEventText),
        rationale: buildRationale(rule.label, matchedSignals, sector),
        matchedSignals,
      };
    }
  }

  if (!bestCategory || bestCategory.score < 3) {
    return {
      category: 'unknown',
      confidence: 'low',
      score: bestCategory?.score ?? 0,
      normalizedEventSummary: normalizeSummary(rawEventText),
      rationale: 'The event text did not match a strong V1 category confidently enough, so the classifier returned the safe fallback.',
      matchedSignals: bestCategory?.matchedSignals ?? [],
    };
  }

  return bestCategory;
}
