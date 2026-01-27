import { OutputTypeSchema, type OutputType } from '@/lib/ai/schemas';

export type OutputTypeInferenceMethod = 'rules' | 'llm';

export type OutputTypeInference = {
  type: OutputType;
  confidence: number; // 0..1
  reason: string;
  method: OutputTypeInferenceMethod;
  ambiguous: boolean;
  candidates: Array<{ type: OutputType; score: number }>;
};

export type LlmInferType = (input: { prompt: string; candidates: OutputType[] }) => Promise<unknown>;

type Rule = { re: RegExp; weight: number; reason: string };

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const normalizeOutputType = (raw: unknown): OutputType | null => {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '_').replace(/-+/g, '_');
  const parsed = OutputTypeSchema.safeParse(cleaned);
  return parsed.success ? parsed.data : null;
};

const RULES: Record<OutputType, Rule[]> = {
  MODEL_AND_VIZ: [
    { re: /\bmodel\b|\bmodeling\b/i, weight: 3, reason: 'mentions_model' },
    { re: /\bforecast\b|\bforecasting\b/i, weight: 3, reason: 'mentions_forecast' },
    { re: /\bscenario\b|\bscenarios\b|\bsensitivity\b|\bstress\b|\bshock\b/i, weight: 3, reason: 'mentions_scenarios_or_sensitivity' },
    { re: /\bdcf\b|\bwacc\b|\bterminal\b|\bfcf\b|\bfree cash flow\b/i, weight: 4, reason: 'mentions_dcf' },
    { re: /\bquantif(y|ying)\b|\bcalculate\b|\bcompute\b/i, weight: 2, reason: 'mentions_quantify' },
  ],
  SQL_QUERY: [
    { re: /\bsql\b/i, weight: 4, reason: 'mentions_sql' },
    { re: /\bselect\b/i, weight: 3, reason: 'mentions_select' },
    { re: /\bfrom\b/i, weight: 2, reason: 'mentions_from' },
    { re: /\bjoin\b/i, weight: 2, reason: 'mentions_join' },
    { re: /\bcte\b/i, weight: 1, reason: 'mentions_cte' },
    { re: /\bpostgres|bigquery|snowflake|redshift|dbt\b/i, weight: 1, reason: 'mentions_sql_dialect_or_tool' },
  ],
  PYTHON_NOTEBOOK: [
    { re: /\bpython\b/i, weight: 4, reason: 'mentions_python' },
    { re: /\bnotebook\b|\bjupyter\b/i, weight: 3, reason: 'mentions_notebook' },
    { re: /\bpandas\b/i, weight: 2, reason: 'mentions_pandas' },
    { re: /\bnumpy\b/i, weight: 1, reason: 'mentions_numpy' },
    { re: /\bmatplotlib\b|\bseaborn\b|\bplot\b/i, weight: 1, reason: 'mentions_plotting' },
    { re: /\bstatsmodels\b|\bscikit-learn\b|\bsklearn\b/i, weight: 1, reason: 'mentions_modeling_libs' },
  ],
  SLIDE_OUTLINE: [
    { re: /\bslide\b|\bslides\b/i, weight: 3, reason: 'mentions_slides' },
    { re: /\bdeck\b/i, weight: 3, reason: 'mentions_deck' },
    { re: /\bpitch\b|\bpresentation\b/i, weight: 2, reason: 'mentions_presentation' },
    { re: /\binvestor update\b|\bboard\b|\bexec\b/i, weight: 1, reason: 'mentions_audience' },
  ],
  CHECKLIST: [
    { re: /\bchecklist\b/i, weight: 4, reason: 'mentions_checklist' },
    { re: /\btodo\b|\bto-do\b|\baction items?\b/i, weight: 3, reason: 'mentions_todo' },
    { re: /\brunbook\b|\boperational\b/i, weight: 1, reason: 'mentions_runbook' },
    { re: /\bsteps\b|\bplan\b|\bprocess\b/i, weight: 1, reason: 'mentions_steps_or_plan' },
  ],
  DCF_DRIVERS: [
    { re: /\bdcf\b/i, weight: 4, reason: 'mentions_dcf' },
    { re: /\bwacc\b|\bdiscount rate\b/i, weight: 3, reason: 'mentions_wacc' },
    { re: /\bterminal\b|\bperpetuity\b/i, weight: 2, reason: 'mentions_terminal' },
    { re: /\bfcf\b|\bfree cash flow\b/i, weight: 2, reason: 'mentions_fcf' },
    { re: /\bvaluation\b|\bintrinsic\b|\bev\b/i, weight: 1, reason: 'mentions_valuation' },
  ],
  SCENARIO_ENGINE: [
    { re: /\bscenario\b|\bscenarios\b/i, weight: 4, reason: 'mentions_scenario' },
    { re: /\bbase\b/i, weight: 1, reason: 'mentions_base' },
    { re: /\bupside\b|\bbull\b/i, weight: 2, reason: 'mentions_upside' },
    { re: /\bdownside\b|\bbear\b/i, weight: 2, reason: 'mentions_downside' },
    { re: /\bshock\b|\bshocks\b|\bstress\b/i, weight: 2, reason: 'mentions_shocks' },
    { re: /\bsensitivity\b/i, weight: 1, reason: 'mentions_sensitivity' },
  ],
  MARKET_IMPACT_BRIEF: [
    { re: /^\s*event\b[:\-]/i, weight: 5, reason: 'starts_with_event' },
    { re: /\bmarket impact\b|\bimpact brief\b|\btransmission\b/i, weight: 3, reason: 'mentions_market_impact' },
    { re: /\bwar\b|\bsanction\b|\bstrike\b|\btariff\b|\bembargo\b/i, weight: 2, reason: 'mentions_geopolitics' },
    { re: /\bhurricane\b|\bearthquake\b|\bwildfire\b|\boutage\b/i, weight: 2, reason: 'mentions_disaster' },
    { re: /\brate cuts?\b|\brate hikes?\b|\bcpi\b|\bjobs\b|\bunemployment\b/i, weight: 1, reason: 'mentions_macro_event' },
  ],
  FORECAST_BLUEPRINT: [
    { re: /\bforecast\b|\bforecasting\b/i, weight: 4, reason: 'mentions_forecast' },
    { re: /\bproject\b|\bestimate\b|\bbuild a model\b/i, weight: 2, reason: 'mentions_projection' },
    { re: /\bq[1-4]\b/i, weight: 2, reason: 'mentions_quarter' },
    { re: /\bnext quarter\b|\bnext year\b|\bnext \\d+ (weeks|months|quarters)\b/i, weight: 1, reason: 'mentions_horizon' },
    { re: /\bgrowth\b|\btrend\b|\bseasonality\b/i, weight: 1, reason: 'mentions_growth_or_seasonality' },
  ],
};

const explicitTypeRules: Array<{ type: OutputType; re: RegExp; weight: number; reason: string }> = OutputTypeSchema.options.map((type) => ({
  type,
  re: new RegExp(`\\b${type}\\b`, 'i'),
  weight: 10,
  reason: `explicit_${type.toLowerCase()}`,
}));

export function inferOutputTypeRules(prompt: string): OutputTypeInference & { shouldUseLlm: boolean } {
  const p = (prompt ?? '').toString();
  const candidates: Array<{ type: OutputType; score: number; reasons: string[] }> = [];

  for (const type of OutputTypeSchema.options) {
    let score = 0;
    const reasons: string[] = [];

    for (const rule of explicitTypeRules) {
      if (rule.type !== type) continue;
      if (rule.re.test(p)) {
        score += rule.weight;
        reasons.push(rule.reason);
      }
    }

    for (const rule of RULES[type]) {
      if (rule.re.test(p)) {
        score += rule.weight;
        reasons.push(rule.reason);
      }
    }

    candidates.push({ type, score, reasons });
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0];
  const second = candidates[1];

  const topScore = top?.score ?? 0;
  const secondScore = second?.score ?? 0;

  const type = topScore > 0 ? top.type : 'FORECAST_BLUEPRINT';
  const baseConfidence = topScore <= 0 ? 0.2 : topScore / (topScore + secondScore + 1);
  const confidence = clamp01(baseConfidence);

  const ambiguous = topScore <= 1 || confidence < 0.6 || topScore - secondScore < 2;
  const shouldUseLlm = confidence < 0.55;

  const reasonParts: string[] = [];
  const topReasons = candidates.find((c) => c.type === type)?.reasons ?? [];
  if (topReasons.length) reasonParts.push(`matched=${topReasons.join(',')}`);
  if (topScore <= 0) reasonParts.push('no_strong_keywords');
  reasonParts.push(`scores=${type}:${topScore},second:${second?.type ?? 'n/a'}:${secondScore}`);

  return {
    type,
    method: 'rules',
    reason: reasonParts.join(' '),
    confidence,
    ambiguous,
    candidates: candidates.map((c) => ({ type: c.type, score: c.score })),
    shouldUseLlm,
  };
}

export async function inferOutputType(prompt: string, opts?: { llmInferType?: LlmInferType | null }): Promise<OutputTypeInference> {
  const rules = inferOutputTypeRules(prompt);
  const llmInferType = opts?.llmInferType ?? null;

  if (!llmInferType || !rules.shouldUseLlm) {
    const { shouldUseLlm, ...rest } = rules;
    return rest;
  }

  try {
    const raw = await llmInferType({ prompt, candidates: OutputTypeSchema.options });
    const extracted =
      typeof raw === 'string'
        ? raw
        : raw && typeof raw === 'object'
        ? typeof (raw as any).type === 'string'
          ? (raw as any).type
          : typeof (raw as any).outputType === 'string'
          ? (raw as any).outputType
          : null
        : null;

    const parsed = normalizeOutputType(extracted);
    if (!parsed) {
      const { shouldUseLlm, ...rest } = rules;
      return { ...rest, reason: `${rest.reason} llm_invalid_type`, method: 'rules' };
    }

    const { shouldUseLlm, ...rest } = rules;
    return {
      ...rest,
      type: parsed,
      method: 'llm',
      confidence: clamp01(0.5 + rest.confidence * 0.5),
      reason: `${rest.reason} llm_selected=${parsed}`,
    };
  } catch {
    const { shouldUseLlm, ...rest } = rules;
    return { ...rest, reason: `${rest.reason} llm_failed`, method: 'rules' };
  }
}
