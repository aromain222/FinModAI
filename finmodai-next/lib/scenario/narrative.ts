import OpenAI from 'openai';
import { getOpenAIKey } from '@/lib/openaiKey';
import type { ScenarioComparison } from '@/lib/scenario/compare';

export type ScenarioBaselineMetrics = {
  revenue_ltm: number;
  ebitda_margin: number;
  net_margin: number;
  net_debt: number;
  shares_outstanding?: number;
};

type NarrativePayload = {
  baseline_metrics: ScenarioBaselineMetrics;
  bull_delta: ScenarioComparison;
  bear_delta: ScenarioComparison;
  instructions: {
    bullets: number;
    tone: string;
    constraints: string[];
  };
};

type NarrativeResponse = {
  bullets: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function selectPrimaryDriver(delta: ScenarioComparison): { label: string; value: number } {
  const candidates = [
    { label: 'revenue growth', value: Math.abs(delta.driversImpactBreakdown.revenueChangePct) },
    { label: 'margin expansion', value: Math.abs(delta.driversImpactBreakdown.marginExpansionPct) },
    { label: 'terminal growth', value: Math.abs(delta.driversImpactBreakdown.terminalGrowthPct) },
  ];
  candidates.sort((a, b) => b.value - a.value);
  return candidates[0];
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function buildDeterministicNarrative(
  baseline: ScenarioBaselineMetrics,
  bull: ScenarioComparison,
  bear: ScenarioComparison
): string[] {
  const primary = selectPrimaryDriver(bull);
  const growthSensitivity = Math.abs(bull.driversImpactBreakdown.revenueChangePct) + Math.abs(bear.driversImpactBreakdown.revenueChangePct);
  const marginSensitivity = Math.abs(bull.driversImpactBreakdown.marginExpansionPct) + Math.abs(bear.driversImpactBreakdown.marginExpansionPct);
  const terminalSensitivity = Math.abs(bull.driversImpactBreakdown.terminalGrowthPct) + Math.abs(bear.driversImpactBreakdown.terminalGrowthPct);

  const sensitivityLabel =
    marginSensitivity >= growthSensitivity
      ? 'margin expansion'
      : 'revenue growth';

  const riskSkew =
    Math.abs(bear.deltaEnterpriseValue) > Math.abs(bull.deltaEnterpriseValue)
      ? 'downside skew'
      : 'upside skew';

  return [
    `Primary valuation driver is ${primary.label} in the upside case (${formatPercent(primary.value)} of EV delta).`,
    `Sensitivity tilts toward ${sensitivityLabel}, with secondary exposure to terminal growth (${formatPercent(terminalSensitivity)} combined impact).`,
    `Risk concentration shows a ${riskSkew}; bear case EV delta of ${formatCurrency(bear.deltaEnterpriseValue)} vs bull case ${formatCurrency(bull.deltaEnterpriseValue)}.`,
    `Baseline profitability anchors outcomes (EBITDA margin ${formatPercent(clamp(baseline.ebitda_margin, -1, 1))}, net margin ${formatPercent(clamp(baseline.net_margin, -1, 1))}).`,
  ];
}

export async function generateScenarioNarrative(
  baseline: ScenarioBaselineMetrics,
  bullDelta: ScenarioComparison,
  bearDelta: ScenarioComparison
): Promise<string[]> {
  const apiKey = getOpenAIKey('service');
  if (!apiKey) {
    return buildDeterministicNarrative(baseline, bullDelta, bearDelta);
  }

  const openai = new OpenAI({ apiKey });

  const payload: NarrativePayload = {
    baseline_metrics: baseline,
    bull_delta: bullDelta,
    bear_delta: bearDelta,
    instructions: {
      bullets: 4,
      tone: 'Investment banking memo. Concise, factual.',
      constraints: [
        'Use only numbers provided in input.',
        'No invented figures or ranges.',
        'Focus on primary valuation driver, growth vs margin sensitivity, risk concentration.',
      ],
    },
  };

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-5.4',
      messages: [
        {
          role: 'system',
          content:
            'You are a senior IB analyst. Return JSON only with a "bullets" array of 3-5 concise points. No extra keys.',
        },
        {
          role: 'user',
          content: JSON.stringify(payload),
        },
      ],
      temperature: 0.2,
    });

    const content = completion.choices[0]?.message?.content || '';
    const parsed = JSON.parse(content) as NarrativeResponse;
    if (!parsed || !Array.isArray(parsed.bullets)) {
      return buildDeterministicNarrative(baseline, bullDelta, bearDelta);
    }
    const bullets = parsed.bullets.filter(b => typeof b === 'string' && b.trim().length > 0);
    if (bullets.length < 3) {
      return buildDeterministicNarrative(baseline, bullDelta, bearDelta);
    }
    return bullets.slice(0, 5);
  } catch {
    return buildDeterministicNarrative(baseline, bullDelta, bearDelta);
  }
}
