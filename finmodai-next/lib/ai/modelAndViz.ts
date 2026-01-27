import { computeDCFSeries, type DCFInputs } from '@/lib/dcfGenerator';
import { type AgentInput, type ModelAndVizArtifact } from '@/lib/ai/schemas';
import { inferObjectiveMetricFromPrompt } from '@/lib/modeling/objectiveMetric';

type ModelKind = ModelAndVizArtifact['model']['kind'];
type Frequency = ModelAndVizArtifact['model']['index']['frequency'];

const safeText = (value: unknown) => (typeof value === 'string' ? value : value == null ? '' : String(value));

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const extractTicker = (input: AgentInput): string | null => {
  const fromContext = input.context?.ticker?.trim();
  if (fromContext) return fromContext.toUpperCase();

  const match = input.prompt.match(/\b[A-Z]{1,5}\b/g) || [];
  const blacklist = new Set(['THE', 'AND', 'FOR', 'WITH', 'BASE', 'UP', 'DOWN', 'Q1', 'Q2', 'Q3', 'Q4', 'SQL', 'DCF', 'LBO']);
  const candidate = match.find((t) => !blacklist.has(t));
  return candidate ? candidate.toUpperCase() : null;
};

const detectKind = (prompt: string): ModelKind => {
  const p = (prompt ?? '').toLowerCase();
  if (/\bdcf\b|\bwacc\b|\bterminal\b|\bfcf\b|\bfree cash flow\b/.test(p)) return 'dcf';
  if (/\bmargin\b|\bcogs\b|\bif\b.+\b(rises?|falls?|increases?|decreases?|changes?)\b/.test(p)) return 'sensitivity';
  if (/\bforecast\b|\bproject\b|\bestimate\b|\bq[1-4]\b|\bnext\b/.test(p)) return 'forecast';
  return 'generic';
};

const parseHorizon = (prompt: string): { frequency: Frequency; count: number } | null => {
  const p = (prompt ?? '').toLowerCase();

  const months = p.match(/\b(?:over|next)\s+(\d+)\s+months?\b/);
  if (months?.[1]) {
    const count = clamp(Number(months[1]), 1, 60);
    return { frequency: 'monthly', count };
  }

  const quarters = p.match(/\b(?:over|next)\s+(\d+)\s+quarters?\b/);
  if (quarters?.[1]) {
    const count = clamp(Number(quarters[1]), 1, 40);
    return { frequency: 'quarterly', count };
  }

  const years = p.match(/\b(?:over|next)\s+(\d+)\s+years?\b/);
  if (years?.[1]) {
    const count = clamp(Number(years[1]), 1, 20);
    return { frequency: 'yearly', count };
  }

  return null;
};

const buildPeriods = (frequency: Frequency, count: number, now = new Date()): string[] => {
  if (frequency === 'weekly') {
    const periods: string[] = [];
    for (let i = 0; i < count; i++) periods.push(`W${i + 1}`);
    return periods;
  }

  if (frequency === 'monthly') {
    const periods: string[] = [];
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    for (let i = 0; i < count; i++) {
      const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1));
      const yyyy = dt.getUTCFullYear();
      const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
      periods.push(`${yyyy}-${mm}`);
    }
    return periods;
  }

  if (frequency === 'quarterly') {
    const periods: string[] = [];
    const y = now.getUTCFullYear();
    const q = Math.floor(now.getUTCMonth() / 3) + 1;
    for (let i = 0; i < count; i++) {
      const qi = q + i;
      const yy = y + Math.floor((qi - 1) / 4);
      const qq = ((qi - 1) % 4) + 1;
      periods.push(`Q${qq} ${yy}`);
    }
    return periods;
  }

  // yearly
  const start = now.getUTCFullYear();
  return Array.from({ length: count }, (_, i) => String(start + i));
};

const extractShockMagnitudePctPoints = (prompt: string): number | null => {
  const p = (prompt ?? '').toLowerCase();
  const bps = p.match(/\b(\d+(?:\.\d+)?)\s*(?:bps|bp)\b/);
  if (bps?.[1]) return Number(bps[1]) / 100; // 100bp -> 1.00 percentage points

  const pct = p.match(/\b(\d+(?:\.\d+)?)\s*%\b/);
  if (pct?.[1]) return Number(pct[1]);

  return null;
};

const safePct = (value: number) => clamp(value, -1000, 1000);

export function buildModelAndVizArtifact(input: AgentInput): { artifact: ModelAndVizArtifact; warnings: string[]; clarifying: string[] } {
  const kind = detectKind(input.prompt);
  const horizon = parseHorizon(input.prompt);

  const defaultFrequency: Frequency = kind === 'dcf' ? 'yearly' : 'quarterly';
  const defaultCount = kind === 'dcf' ? 6 : 8;
  const frequency = horizon?.frequency ?? defaultFrequency;
  const count = horizon?.count ?? defaultCount;

  const index = { frequency, periods: buildPeriods(frequency, count) };

  const warnings: string[] = [];
  const clarifying: string[] = [];

  const asOf = new Date().toISOString();

  if (kind === 'dcf') {
    const ticker = extractTicker(input) ?? 'TBD';
    const startYear = new Date().getUTCFullYear() + 1;
    const years = Array.from({ length: 6 }, (_, i) => startYear + i);

    const revenue0M = 10_000; // $10B (in $M)
    const growth = 0.08;
    const revenueByYear = years.map((_, i) => revenue0M * Math.pow(1 + growth, i));

    const dcfInputs: DCFInputs = {
      ticker,
      years,
      revenueByYear,
      ebitMargin: 0.25,
      taxRate: 0.21,
      daPercentOfRevenue: 0.04,
      changeInWCPercentOfRevenue: 0.01,
      capexPercentOfRevenue: 0.04,
      wacc: 0.09,
      terminalGrowth: 0.03,
      netDebtMillions: 0,
      sharesOutstandingMillions: 1000,
    };

    const results = computeDCFSeries(dcfInputs);
    warnings.push('placeholder_defaults');
    clarifying.push('Provide starting revenue (in $M) or use an index baseline (100).');
    clarifying.push('Confirm WACC and terminal growth assumptions.');

    const rows = years.map((year, i) => ({
      period: String(year),
      revenueM: revenueByYear[i],
      ebitM: results.ebitByYear[i],
      ufcfM: results.ufcfByYear[i],
      pvUfcfM: results.pvUfcfByYear[i],
    }));

    const charts = [
      {
        name: 'Unlevered FCF ($M)',
        chartType: 'line' as const,
        xKey: 'period',
        yKey: 'ufcfM',
        data: rows,
      },
      {
        name: 'Revenue ($M)',
        chartType: 'line' as const,
        xKey: 'period',
        yKey: 'revenueM',
        data: rows,
      },
    ];

    const artifact: ModelAndVizArtifact = {
      model: {
        kind: 'dcf',
        title: `${ticker} — Illustrative DCF model (placeholder inputs)`,
        index: { frequency: 'yearly', periods: years.map((y) => String(y)) },
        inputs: [
          { key: 'revenue0M', label: 'Starting revenue', value: revenue0M, unit: '$M', notes: 'Placeholder baseline.', source: 'placeholder' },
          { key: 'revenueGrowth', label: 'Revenue growth', value: 8, unit: '%', notes: 'Placeholder.', source: 'placeholder' },
          { key: 'ebitMargin', label: 'EBIT margin', value: 25, unit: '%', notes: 'Placeholder.', source: 'placeholder' },
          { key: 'taxRate', label: 'Tax rate', value: 21, unit: '%', notes: 'Placeholder.', source: 'placeholder' },
          { key: 'wacc', label: 'WACC', value: 9, unit: '%', notes: 'Placeholder.', source: 'placeholder' },
          { key: 'terminalGrowth', label: 'Terminal growth', value: 3, unit: '%', notes: 'Placeholder.', source: 'placeholder' },
          { key: 'netDebt', label: 'Net debt', value: 0, unit: '$M', notes: 'Placeholder.', source: 'placeholder' },
          { key: 'shares', label: 'Shares outstanding', value: 1000, unit: 'M', notes: 'Placeholder.', source: 'placeholder' },
        ],
        equations: [
          { key: 'ebit', label: 'EBIT', definition: 'Revenue × EBIT margin' },
          { key: 'UFCF', label: 'Unlevered FCF', definition: 'NOPAT + D&A − Capex − ΔNWC' },
          { key: 'terminalValue', label: 'Terminal value', definition: 'FCF × (1 + g) / (WACC − g)' },
        ],
        outputs: [
          { key: 'revenueM', label: 'Revenue', unit: '$M' },
          { key: 'ebitM', label: 'EBIT', unit: '$M' },
          { key: 'ufcfM', label: 'Unlevered FCF', unit: '$M' },
          { key: 'pvUfcfM', label: 'PV of UFCF', unit: '$M' },
        ],
      },
      evaluation: {
        asOf,
        rows,
        summary: [
          { key: 'enterpriseValueM', label: 'Enterprise value', value: results.enterpriseValue, unit: '$M' },
          { key: 'equityValueM', label: 'Equity value', value: results.equityValue, unit: '$M' },
          { key: 'pricePerShare', label: 'Implied price per share', value: results.pricePerShare ?? null, unit: '$' },
          { key: 'valid', label: 'Model valid', value: results.isValid ? 'yes' : 'no' },
          { key: 'invalidReason', label: 'Invalid reason', value: results.invalidReason ?? null },
        ],
      },
      charts,
    };

    return { artifact, warnings, clarifying: Array.from(new Set(clarifying)).slice(0, 5) };
  }

  if (kind === 'sensitivity') {
    const shockPctPoints = extractShockMagnitudePctPoints(input.prompt) ?? 2; // +2pp
    const baseCogsPct = 60;
    const shockedCogsPct = baseCogsPct + shockPctPoints;

    warnings.push('placeholder_defaults');
    if (!extractShockMagnitudePctPoints(input.prompt)) clarifying.push('What is the COGS increase magnitude (e.g., +200bp / +2%)?');
    clarifying.push('What baseline gross margin (or COGS % of revenue) should be assumed?');

    const rows = index.periods.map((period) => {
      const gmBase = 100 - baseCogsPct;
      const gmShocked = 100 - shockedCogsPct;
      return {
        period,
        grossMargin_base: safePct(gmBase),
        grossMargin_shocked: safePct(gmShocked),
        delta_pp: safePct(gmShocked - gmBase),
      };
    });

    const charts = [
      { name: 'Gross Margin (Base vs Shocked)', chartType: 'line' as const, xKey: 'period', yKey: 'grossMargin_shocked', data: rows },
      { name: 'Margin Δ (pp)', chartType: 'bar' as const, xKey: 'period', yKey: 'delta_pp', data: rows },
    ];

    const outputs = [
      { key: 'grossMargin_base', label: 'Gross margin (base)', unit: '%' },
      { key: 'grossMargin_shocked', label: 'Gross margin (shocked)', unit: '%' },
      { key: 'delta_pp', label: 'Δ margin', unit: 'pp' },
    ];

    // For sensitivity models, objective is typically the delta or margin
    const objectiveMetric = inferObjectiveMetricFromPrompt(input.prompt, outputs);

    const artifact: ModelAndVizArtifact = {
      model: {
        kind: 'sensitivity',
        title: 'Illustrative margin sensitivity model (placeholder inputs)',
        index,
        inputs: [
          { key: 'baseCogsPct', label: 'COGS (% of revenue)', value: baseCogsPct, unit: '%', notes: 'Placeholder baseline.', source: 'placeholder' },
          { key: 'cogsShock', label: 'COGS shock', value: shockPctPoints, unit: 'pp', notes: 'Parsed from prompt or default.', source: 'inferred' },
        ],
        equations: [
          { key: 'grossMargin', label: 'Gross margin', definition: '100% − COGS%' },
          { key: 'delta', label: 'Δ margin (pp)', definition: 'Shocked margin − Base margin' },
        ],
        outputs,
        objective_metric_key: objectiveMetric.key,
        objective_metric_label: objectiveMetric.label,
      },
      evaluation: { asOf, rows, summary: [] },
      charts,
    };

    return { artifact, warnings, clarifying: Array.from(new Set(clarifying)).slice(0, 5) };
  }

  // forecast / generic
  const metricLabel =
    /\brevenue\b|\barr\b|\bmrr\b/i.test(input.prompt)
      ? 'Revenue (index)'
      : /\bunits?\b|\bsales\b/i.test(input.prompt)
      ? 'Units (index)'
      : 'Metric (index)';

  const baseline = 100;
  const growthPerPeriod =
    frequency === 'monthly' ? 0.01 : frequency === 'yearly' ? 0.08 : frequency === 'weekly' ? 0.005 : 0.03;

  warnings.push('placeholder_defaults');
  clarifying.push('What baseline value should anchor the model (or should we use an index baseline of 100)?');
  clarifying.push('What growth/seasonality assumptions should be used (and over what horizon)?');

  const rows = index.periods.map((period, i) => {
    const value = baseline * Math.pow(1 + growthPerPeriod, i);
    const prev = i === 0 ? baseline : baseline * Math.pow(1 + growthPerPeriod, i - 1);
    const pop = prev ? ((value - prev) / prev) * 100 : 0;
    return { period, value: Number(value.toFixed(2)), popPct: Number(pop.toFixed(2)) };
  });

  const charts = [
    { name: metricLabel, chartType: 'line' as const, xKey: 'period', yKey: 'value', data: rows },
    { name: 'Period-over-period change (%)', chartType: 'bar' as const, xKey: 'period', yKey: 'popPct', data: rows },
  ];

  const outputs = [
    { key: 'value', label: metricLabel, unit: 'index' },
    { key: 'popPct', label: 'Period change', unit: '%' },
  ];

  // Infer objective metric from prompt
  const objectiveMetric = inferObjectiveMetricFromPrompt(input.prompt, outputs);

  const artifact: ModelAndVizArtifact = {
    model: {
      kind: kind === 'generic' ? 'generic' : 'forecast',
      title: `${safeText(metricLabel)} — illustrative model (placeholder inputs)`,
      index,
      inputs: [
        { key: 'baselineIndex', label: 'Baseline', value: baseline, unit: 'index', notes: 'Index baseline to avoid fake absolute numbers.', source: 'placeholder' },
        { key: 'growthPerPeriod', label: 'Growth per period', value: Number((growthPerPeriod * 100).toFixed(2)), unit: '%', notes: 'Placeholder.', source: 'placeholder' },
      ],
      equations: [
        { key: 'value', label: 'Metric', definition: 'Baseline × (1 + growth) ^ t' },
        { key: 'popPct', label: 'Period change (%)', definition: '(Value_t / Value_{t-1} − 1) × 100' },
      ],
      outputs,
      objective_metric_key: objectiveMetric.key,
      objective_metric_label: objectiveMetric.label,
    },
    evaluation: { asOf, rows, summary: [] },
    charts,
  };

  return { artifact, warnings, clarifying: Array.from(new Set(clarifying)).slice(0, 5) };
}

