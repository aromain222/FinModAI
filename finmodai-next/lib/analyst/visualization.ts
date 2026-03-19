import type { AnalystDcfDemoPayload } from '@/lib/analyst/dcfDemo';
import type { AnalystGeneratedModelPayload } from '@/lib/analyst/modelChat';
import { FINANCE_CHART_SPEC_PROMPT } from '@/lib/analyst/prompts';
import { fetchCompanyFinancials } from '@/lib/analyst/dataRetrieval';
import type { StockLookupResult } from '@/lib/data/company/lookupStock';
import { resolveCompanyProfile } from '@/lib/data/company/resolveCompanyProfile';
import { loadDemoSnapshots } from '@/lib/demo/demoSnapshotStore';
import { fetchHistoricalFinancials } from '@/lib/data/historicalFinancials';
import { type FinanceAxisFormat, type FinanceChartSpec, type FinanceSeries, validateFinanceChartSpec } from '@/lib/charts/financeChartSpec';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';

export type AnalystVisualizationPanel = {
  id: string;
  spec: FinanceChartSpec;
  height?: number;
};

export type AnalystVisualizationPayload = {
  title: string;
  subtitle: string;
  contextType: 'dcf' | 'model' | 'stock';
  contextLabel: string;
  notes: string[];
  panels: AnalystVisualizationPanel[];
};

export type ComparisonVisualizationResult = {
  visualization: AnalystVisualizationPayload;
  explanation: string;
};

type ComparisonMetricKey = 'revenue' | 'revenueGrowth' | 'ebitda' | 'netIncome' | 'eps';

type CompanyComparisonSeries = {
  ticker: string;
  companyName: string;
  quarterDate: string | null;
  metrics: Record<ComparisonMetricKey, number | null>;
  source: string;
};

type CompanyGrowthSeries = {
  ticker: string;
  companyName: string;
  periods: string[];
  revenueGrowth: number[];
  source: string;
};

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error('No JSON object found in chart spec response.');
  }
  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
}

function singleSeriesSpec(params: {
  title: string;
  subtitle?: string;
  chartType: 'line' | 'bar' | 'area' | 'scatter';
  xLabel?: string;
  yLabel?: string;
  seriesLabel: string;
  seriesKey: string;
  data: Array<{ x: string | number; y: number | null }>;
  color?: string;
  format?: FinanceAxisFormat;
  note?: string;
}): FinanceChartSpec {
  return {
    title: params.title,
    subtitle: params.subtitle,
    chartType: params.chartType,
    xLabel: params.xLabel,
    yLabel: params.yLabel,
    series: [
      {
        key: params.seriesKey,
        label: params.seriesLabel,
        color: params.color,
        axis: 'left',
        format: params.format,
      },
    ],
    data: params.data.map((point) => ({ x: point.x, [params.seriesKey]: point.y })),
    formatting: {
      xFormat: 'string',
      yLeftFormat: params.format ?? 'number',
      decimals: params.format === 'currency' ? 0 : 1,
      currencyCode: 'USD',
      compactNumbers: false,
    },
    note: params.note,
  };
}

function multiSeriesSpec(params: {
  title: string;
  subtitle?: string;
  chartType: 'line' | 'bar' | 'area' | 'scatter';
  xLabel?: string;
  yLabel?: string;
  yRightLabel?: string;
  data: Array<Record<string, string | number | null> & { x: string | number }>;
  series: FinanceSeries[];
  yLeftFormat?: FinanceAxisFormat;
  yRightFormat?: FinanceAxisFormat;
  note?: string;
}): FinanceChartSpec {
  return {
    title: params.title,
    subtitle: params.subtitle,
    chartType: params.chartType,
    xLabel: params.xLabel,
    yLabel: params.yLabel,
    yRightLabel: params.yRightLabel,
    data: params.data,
    series: params.series,
    formatting: {
      xFormat: 'string',
      yLeftFormat: params.yLeftFormat ?? 'number',
      yRightFormat: params.yRightFormat,
      decimals: (params.yLeftFormat ?? 'number') === 'currency' ? 0 : 1,
      currencyCode: 'USD',
      compactNumbers: false,
    },
    note: params.note,
  };
}

const COMPARISON_ALIASES: Array<{ ticker: string; patterns: RegExp[] }> = [
  { ticker: 'MSFT', patterns: [/\bmicrosoft'?s?\b/i, /\bmsft\b/i] },
  { ticker: 'GOOGL', patterns: [/\bgoogle'?s?\b/i, /\balphabet'?s?\b/i, /\bgoogl\b/i, /\bgoog\b/i] },
  { ticker: 'NVDA', patterns: [/\bnvidia'?s?\b/i, /\bnvda\b/i] },
  { ticker: 'AAPL', patterns: [/\bapple'?s?\b/i, /\baapl\b/i] },
  { ticker: 'AMZN', patterns: [/\bamazon'?s?\b/i, /\bamzn\b/i] },
  { ticker: 'META', patterns: [/\bmeta'?s?\b/i, /\bfacebook'?s?\b/i, /\bmeta platforms\b/i, /\bmeta\b/i] },
  { ticker: 'TSLA', patterns: [/\btesla'?s?\b/i, /\btsla\b/i] },
  { ticker: 'ORCL', patterns: [/\boracle'?s?\b/i, /\borcl\b/i] },
  { ticker: 'CRM', patterns: [/\bsalesforce'?s?\b/i, /\bcrm\b/i] },
];

function normalizePromptText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeCompanyName(value: string): string {
  return normalizePromptText(value)
    .replace(/\b(incorporated|inc|corp|corporation|holdings|holding|group|plc|limited|ltd|company|co)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasComparisonIntent(prompt: string): boolean {
  return /\b(compare|comparison|comparing|compairing|compasirng|versus|vs\.?|against|with)\b/i.test(prompt);
}

function inferComparisonMetric(prompt: string): ComparisonMetricKey | 'multi' | null {
  const text = normalizePromptText(prompt);
  if (/\b(revenue growth|sales growth|top line growth|growth in revenue|growth of revenue|revenueg growth|revenue grow(th)?|reveneue growth|reveenue growth)\b/.test(text)) {
    return 'revenueGrowth';
  }
  if (/\b(eps|earnings per share)\b/.test(text)) return 'eps';
  if (/\b(ebitda)\b/.test(text)) return 'ebitda';
  if (/\b(net income|net profit|profit)\b/.test(text)) return 'netIncome';
  if (/\b(revenue|reveneue|reveenue|sales|top line|topline)\b/.test(text)) return 'revenue';
  if (/\b(earnings|quarter|results)\b/.test(text)) return 'multi';
  return null;
}

function isComparisonChartPrompt(prompt: string): boolean {
  return hasComparisonIntent(prompt) && inferComparisonMetric(prompt) !== null;
}

function comparisonDriverSummary(ticker: string): string {
  switch (ticker) {
    case 'MSFT':
      return 'Microsoft revenue is primarily driven by Azure and the broader commercial cloud stack, with Office and other enterprise software adding a large recurring base.';
    case 'GOOGL':
      return 'Alphabet revenue is primarily driven by Google Search and YouTube advertising, with Google Cloud as the main secondary growth engine.';
    case 'NVDA':
      return 'NVIDIA revenue is primarily driven by data-center and AI accelerator demand, with gaming and networking as secondary contributors.';
    case 'AAPL':
      return 'Apple revenue is primarily driven by iPhone hardware, with services and wearables supporting mix and margin.';
    case 'AMZN':
      return 'Amazon revenue is primarily driven by e-commerce volume and third-party seller services, with AWS carrying outsized profit importance.';
    case 'META':
      return 'Meta revenue is primarily driven by digital advertising across its social platforms, with ad pricing and engagement as the key drivers.';
    default:
      return `${ticker} revenue should be tied to its core operating segments and any current cycle strength in demand, pricing, or mix.`;
  }
}

export function revenueDriverSummary(ticker: string): string {
  return comparisonDriverSummary(ticker);
}

function resolveMentionedTickers(prompt: string, snapshots: Record<string, { companyName?: string | null }>): string[] {
  const normalizedPrompt = normalizePromptText(prompt);
  const matched = new Map<string, { position: number; score: number }>();

  for (const alias of COMPARISON_ALIASES) {
    for (const pattern of alias.patterns) {
      const hit = pattern.exec(prompt);
      if (hit?.index !== undefined) {
        const existing = matched.get(alias.ticker);
        if (!existing || hit.index < existing.position) {
          matched.set(alias.ticker, { position: hit.index, score: 900 });
        }
        break;
      }
    }
  }

  for (const ticker of Object.keys(snapshots)) {
    const tickerPattern = new RegExp(`\\b${ticker.replace('.', '\\.')}\\b`, 'i');
    const tickerMatch = prompt.match(tickerPattern);
    if (tickerMatch?.index !== undefined) {
      matched.set(ticker, { position: tickerMatch.index, score: 1000 });
    }
  }

  for (const [ticker, snapshot] of Object.entries(snapshots)) {
    const normalizedName = normalizeCompanyName(snapshot.companyName ?? '');
    if (!normalizedName || normalizedName.length < 3) continue;
    const idx = normalizedPrompt.indexOf(normalizedName);
    if (idx >= 0) {
      const existing = matched.get(ticker);
      if (!existing || idx < existing.position) {
        matched.set(ticker, { position: idx, score: normalizedName.length });
      }
    }
  }

  return Array.from(matched.entries())
    .sort((left, right) => {
      if (left[1].position !== right[1].position) return left[1].position - right[1].position;
      return right[1].score - left[1].score;
    })
    .map(([ticker]) => ticker)
    .slice(0, 2);
}

async function fetchComparisonSeries(ticker: string): Promise<CompanyComparisonSeries | null> {
  const financials = await fetchCompanyFinancials(ticker);
  if (financials && Object.values(financials.latestQuarter).some((value) => value !== null && value !== financials.latestQuarter.date)) {
    return {
      ticker: financials.ticker,
      companyName: financials.companyName,
      quarterDate: financials.latestQuarter.date,
      metrics: {
        revenue: financials.latestQuarter.revenue,
        revenueGrowth: null,
        ebitda: financials.latestQuarter.ebitda,
        netIncome: financials.latestQuarter.netIncome,
        eps: financials.latestQuarter.eps,
      },
      source: 'fmp_latest_quarter',
    };
  }

  const profile = await resolveCompanyProfile({ ticker });
  if (!profile?.snapshot) return null;

  return {
    ticker: profile.company.ticker,
    companyName: profile.company.name ?? ticker,
    quarterDate: profile.snapshot.asOfDate,
    metrics: {
      revenue: profile.snapshot.revenueLtm,
      revenueGrowth: null,
      ebitda: profile.snapshot.ebitdaLtm,
      netIncome: profile.snapshot.netIncomeLtm,
      eps: null,
    },
    source: 'company_snapshot_ltm_fallback',
  };
}

async function fetchRevenueGrowthSeries(ticker: string): Promise<CompanyGrowthSeries | null> {
  const historical = await fetchHistoricalFinancials(ticker, 5);
  if (historical && historical.years.length >= 3 && historical.revenue.length >= 3) {
    const ordered = historical.years
      .map((year, idx) => ({ year, revenue: historical.revenue[idx] }))
      .filter((row) => typeof row.revenue === 'number' && Number.isFinite(row.revenue) && row.revenue > 0)
      .sort((left, right) => left.year - right.year);

    if (ordered.length >= 3) {
      const periods: string[] = [];
      const growth: number[] = [];
      for (let idx = 1; idx < ordered.length; idx += 1) {
        const prev = ordered[idx - 1]?.revenue ?? 0;
        const curr = ordered[idx]?.revenue ?? 0;
        if (prev <= 0 || curr <= 0) continue;
        periods.push(`${ordered[idx].year}`);
        growth.push(((curr - prev) / prev) * 100);
      }

      if (periods.length >= 2) {
        return {
          ticker: historical.ticker,
          companyName: historical.ticker,
          periods,
          revenueGrowth: growth,
          source: `${historical.dataSource.toLowerCase()}_historical_annual`,
        };
      }
    }
  }

  const profile = await resolveCompanyProfile({ ticker });
  const history = (profile?.snapshot as { revenueHistory?: Array<Record<string, unknown>> } | undefined)?.revenueHistory;
  if (Array.isArray(history) && history.length >= 3) {
    const ordered = history
      .map((item) => ({
        period: String(item.period ?? item.year ?? item.date ?? '').trim(),
        revenue: typeof item.revenue === 'number' ? Number(item.revenue) : null,
      }))
      .filter((item) => item.period && typeof item.revenue === 'number' && Number.isFinite(item.revenue) && item.revenue > 0);

    const periods: string[] = [];
    const growth: number[] = [];
    for (let idx = 1; idx < ordered.length; idx += 1) {
      const prev = ordered[idx - 1]?.revenue ?? 0;
      const curr = ordered[idx]?.revenue ?? 0;
      if (prev <= 0 || curr <= 0) continue;
      periods.push(ordered[idx].period);
      growth.push(((curr - prev) / prev) * 100);
    }

    if (periods.length >= 2) {
      return {
        ticker: profile?.company.ticker ?? ticker,
        companyName: profile?.company.name ?? ticker,
        periods,
        revenueGrowth: growth,
        source: 'company_snapshot_revenue_history',
      };
    }
  }

  return null;
}

function formatMetricLabel(metric: ComparisonMetricKey): string {
  switch (metric) {
    case 'revenue':
      return 'Revenue';
    case 'revenueGrowth':
      return 'Revenue Growth';
    case 'ebitda':
      return 'EBITDA';
    case 'netIncome':
      return 'Net Income';
    case 'eps':
      return 'EPS';
  }
}

function formatModelTypeLabel(modelType: AnalystGeneratedModelPayload['modelType']): string {
  return modelType.replace(/_/g, ' ');
}

function buildModelVisualization(payload: AnalystGeneratedModelPayload): AnalystVisualizationPayload | null {
  const inputs = payload.extractedInputs as Record<string, unknown>;

  if (payload.modelType === 'THREE_STATEMENT') {
    const revenueGrowth = Array.isArray(inputs.revenueGrowth) ? inputs.revenueGrowth : [];
    const ebitMargin = Array.isArray(inputs.ebitMargin) ? inputs.ebitMargin : [];
    const years = Array.from({ length: Math.max(revenueGrowth.length, ebitMargin.length) }, (_, idx) => `Y${idx + 1}`);
    if (years.length === 0) return null;

    return {
      title: `${payload.title} Visualization`,
      subtitle: 'Standalone chart generated from the current model assumptions.',
      contextType: 'model',
      contextLabel: payload.title,
      notes: ['This chart isolates the forecast path so the user can read the operating assumptions without reopening the full model card.'],
      panels: [
        {
          id: 'forecast-assumptions',
          height: 280,
          spec: multiSeriesSpec({
            title: 'Forecast Assumption Paths',
            subtitle: 'Revenue growth and EBIT margin by forecast year.',
            chartType: 'line',
            xLabel: 'Forecast Year',
            yLabel: 'Percent',
            yLeftFormat: 'percent',
            data: years.map((year, idx) => ({
              x: year,
              revenueGrowth: typeof revenueGrowth[idx] === 'number' ? Number(revenueGrowth[idx]) * 100 : null,
              ebitMargin: typeof ebitMargin[idx] === 'number' ? Number(ebitMargin[idx]) * 100 : null,
            })),
            series: [
              { key: 'revenueGrowth', label: 'Revenue Growth', color: '#2563eb', axis: 'left', format: 'percent' },
              { key: 'ebitMargin', label: 'EBIT Margin', color: '#16a34a', axis: 'left', format: 'percent' },
            ],
          }),
        },
      ],
    };
  }

  if (payload.modelType === 'COMPS') {
    const peers = Array.isArray(inputs.peers) ? (inputs.peers as Array<Record<string, unknown>>) : [];
    const peerRows = peers
      .slice(0, 8)
      .map((peer) => ({
        label: String(peer.ticker ?? peer.name ?? 'Peer'),
        revenue: typeof peer.revenue === 'number' ? Number(peer.revenue) : 0,
        ebitda: typeof peer.ebitda === 'number' ? Number(peer.ebitda) : 0,
      }))
      .filter((row) => row.revenue > 0 || row.ebitda > 0);
    if (peerRows.length === 0) return null;

    return {
      title: `${payload.title} Visualization`,
      subtitle: 'Standalone peer chart generated from the current comps output.',
      contextType: 'model',
      contextLabel: payload.title,
      notes: ['Peer operating scale is shown separately so the user can read the comps output without carrying the full workbook payload into the thread.'],
      panels: [
        {
          id: 'peer-operating-scale',
          height: 300,
          spec: multiSeriesSpec({
            title: 'Peer Operating Scale',
            subtitle: 'Revenue and EBITDA across the selected peer set.',
            chartType: 'bar',
            xLabel: 'Peer',
            yLabel: 'USD millions',
            yLeftFormat: 'currency',
            data: peerRows.map((row) => ({ x: row.label, revenue: row.revenue, ebitda: row.ebitda })),
            series: [
              { key: 'revenue', label: 'Revenue', color: '#2563eb', axis: 'left', format: 'currency', renderAs: 'bar' },
              { key: 'ebitda', label: 'EBITDA', color: '#16a34a', axis: 'left', format: 'currency', renderAs: 'bar' },
            ],
          }),
        },
      ],
    };
  }

  if (payload.modelType === 'PRECEDENTS') {
    const transactions = Array.isArray(inputs.transactions) ? (inputs.transactions as Array<Record<string, unknown>>) : [];
    const rows = transactions
      .slice(0, 8)
      .map((transaction) => ({
        label: String(transaction.target ?? transaction.transaction ?? 'Deal'),
        revenueMultiple: typeof transaction.revenueMultiple === 'number' ? Number(transaction.revenueMultiple) : 0,
        ebitdaMultiple: typeof transaction.ebitdaMultiple === 'number' ? Number(transaction.ebitdaMultiple) : 0,
      }))
      .filter((row) => row.revenueMultiple > 0 || row.ebitdaMultiple > 0);
    if (rows.length === 0) return null;

    return {
      title: `${payload.title} Visualization`,
      subtitle: 'Standalone transaction multiple chart generated from the current precedent set.',
      contextType: 'model',
      contextLabel: payload.title,
      notes: ['Use this chart artifact when the user wants just the visual read-through, not the full precedent model card.'],
      panels: [
        {
          id: 'transaction-multiples',
          height: 300,
          spec: multiSeriesSpec({
            title: 'Transaction Multiples',
            subtitle: 'EV / Revenue and EV / EBITDA across selected deals.',
            chartType: 'bar',
            xLabel: 'Transaction',
            yLabel: 'Multiple',
            yLeftFormat: 'multiple',
            data: rows.map((row) => ({ x: row.label, revenueMultiple: row.revenueMultiple, ebitdaMultiple: row.ebitdaMultiple })),
            series: [
              { key: 'revenueMultiple', label: 'EV / Revenue', color: '#2563eb', axis: 'left', format: 'multiple', renderAs: 'bar' },
              { key: 'ebitdaMultiple', label: 'EV / EBITDA', color: '#f59e0b', axis: 'left', format: 'multiple', renderAs: 'bar' },
            ],
          }),
        },
      ],
    };
  }

  if (payload.modelType === 'LBO') {
    const revenueGrowth = Array.isArray(inputs.revenueGrowth) ? inputs.revenueGrowth : [];
    if (revenueGrowth.length === 0) return null;
    return {
      title: `${payload.title} Visualization`,
      subtitle: 'Standalone underwriting chart generated from the current LBO assumptions.',
      contextType: 'model',
      contextLabel: payload.title,
      notes: ['This chart isolates the underwriting curve so the user can focus on the operating path separately from the full deal model.'],
      panels: [
        {
          id: 'underwriting-growth',
          height: 280,
          spec: singleSeriesSpec({
            title: 'Underwriting Growth Path',
            subtitle: 'Revenue growth by year under the current LBO case.',
            chartType: 'line',
            xLabel: 'Forecast Year',
            yLabel: 'Revenue Growth',
            seriesLabel: 'Revenue Growth',
            seriesKey: 'revenueGrowth',
            format: 'percent',
            color: '#2563eb',
            data: revenueGrowth.map((value, idx) => ({ x: `Y${idx + 1}`, y: typeof value === 'number' ? Number(value) * 100 : null })),
          }),
        },
      ],
    };
  }

  if (payload.modelType === 'CAP_TABLE') {
    const founderShares = typeof inputs.founderShares === 'number' ? Number(inputs.founderShares) : 0;
    const raiseAmount = typeof inputs.raiseAmount === 'number' ? Number(inputs.raiseAmount) : 0;
    const preMoney = typeof inputs.preMoney === 'number' ? Number(inputs.preMoney) : 0;
    if (founderShares === 0 && raiseAmount === 0 && preMoney === 0) return null;

    return {
      title: `${payload.title} Visualization`,
      subtitle: 'Standalone financing structure chart generated from the current cap table inputs.',
      contextType: 'model',
      contextLabel: payload.title,
      notes: ['This lets the user discuss dilution visually without carrying the full cap table card into the thread.'],
      panels: [
        {
          id: 'financing-structure',
          height: 280,
          spec: multiSeriesSpec({
            title: 'Financing Structure Snapshot',
            subtitle: 'Founder shares, raise amount, and pre-money value in the current round.',
            chartType: 'bar',
            xLabel: 'Round',
            data: [{ x: 'Round', founderShares, raiseAmount, preMoney }],
            series: [
              { key: 'founderShares', label: 'Founder Shares', color: '#2563eb', axis: 'left', format: 'number', renderAs: 'bar' },
              { key: 'raiseAmount', label: 'Raise Amount', color: '#16a34a', axis: 'left', format: 'currency', renderAs: 'bar' },
              { key: 'preMoney', label: 'Pre-Money', color: '#f59e0b', axis: 'left', format: 'currency', renderAs: 'bar' },
            ],
            yLeftFormat: 'number',
          }),
        },
      ],
    };
  }

  if (payload.modelType === 'SAAS_OPERATING_MODEL') {
    const growthRate = typeof inputs.growthRate === 'number' ? Number(inputs.growthRate) * 100 : 0;
    const grossMargin = typeof inputs.grossMargin === 'number' ? Number(inputs.grossMargin) * 100 : 0;
    const churn = typeof inputs.churn === 'number' ? Number(inputs.churn) * 100 : 0;
    const cac = typeof inputs.cac === 'number' ? Number(inputs.cac) : 0;
    const arpu = typeof inputs.arpu === 'number' ? Number(inputs.arpu) : 0;
    if ([growthRate, grossMargin, churn, cac, arpu].every((value) => value === 0)) return null;

    return {
      title: `${payload.title} Visualization`,
      subtitle: 'Standalone SaaS driver chart generated from the current model assumptions.',
      contextType: 'model',
      contextLabel: payload.title,
      notes: ['This chart isolates the operating drivers so the user can focus on the main SaaS levers separately from the workbook card.'],
      panels: [
        {
          id: 'saas-driver-snapshot',
          height: 300,
          spec: singleSeriesSpec({
            title: 'Operating Driver Snapshot',
            subtitle: 'Growth, margin, churn, CAC, and ARPU under the current case.',
            chartType: 'bar',
            xLabel: 'Driver',
            yLabel: 'Value',
            seriesLabel: 'Value',
            seriesKey: 'value',
            color: '#2563eb',
            data: [
              { x: 'Growth', y: growthRate },
              { x: 'Gross Margin', y: grossMargin },
              { x: 'Churn', y: churn },
              { x: 'CAC', y: cac },
              { x: 'ARPU', y: arpu },
            ],
          }),
        },
      ],
    };
  }

  return {
    title: `${payload.title} Visualization`,
    subtitle: 'No dedicated chart template exists yet for this model type.',
    contextType: 'model',
    contextLabel: `${formatModelTypeLabel(payload.modelType)} model`,
    notes: ['This model type still needs a bespoke standalone chart template.'],
    panels: [],
  };
}

function buildDcfVisualization(payload: AnalystDcfDemoPayload): AnalystVisualizationPayload {
  const scenarioBars = [
    { name: 'Bear', value: payload.scenarios.bear.pricePerShare ?? 0, fill: '#dc2626' },
    { name: 'Base', value: payload.scenarios.base.pricePerShare ?? 0, fill: '#2563eb' },
    { name: 'Bull', value: payload.scenarios.bull.pricePerShare ?? 0, fill: '#16a34a' },
  ];

  return {
    title: `${payload.companyName} DCF Visualization`,
    subtitle: 'Standalone chart package generated from the current DCF output.',
    contextType: 'dcf',
    contextLabel: `${payload.companyName} (${payload.ticker})`,
      notes: ['This chart artifact is separate from the DCF card so the user can focus on the visuals without the workbook framing.'],
      panels: [
        {
          id: 'dcf-forecast',
          height: 280,
          spec: multiSeriesSpec({
            title: 'Base Forecast',
            subtitle: 'Revenue and FCFF under the current base case.',
            chartType: 'line',
            xLabel: 'Year',
            yLabel: 'Revenue',
            yRightLabel: 'FCFF',
            yLeftFormat: 'currency',
            yRightFormat: 'currency',
            data: payload.forecast.map((row) => ({ x: row.year, revenue: row.revenue, fcff: row.fcff })),
            series: [
              { key: 'revenue', label: 'Revenue', color: '#2563eb', axis: 'left', format: 'currency' },
              { key: 'fcff', label: 'FCFF', color: '#16a34a', axis: 'right', format: 'currency' },
            ],
          }),
        },
        {
          id: 'dcf-scenarios',
          height: 260,
          spec: singleSeriesSpec({
            title: 'Scenario Value / Share',
            subtitle: 'Bear, base, and bull value per share.',
            chartType: 'bar',
            xLabel: 'Scenario',
            yLabel: 'Value / Share',
            seriesLabel: 'Value / Share',
            seriesKey: 'valuePerShare',
            color: '#2563eb',
            format: 'currency',
            data: scenarioBars.map((entry) => ({ x: entry.name, y: entry.value })),
          }),
        },
      ],
    };
}

export function buildRevenueForecastVisualizationFromDcf(payload: AnalystDcfDemoPayload): AnalystVisualizationPayload {
  return {
    title: `${payload.companyName} Revenue Forecast`,
    subtitle: `Standalone ${payload.years}-year revenue chart generated from the current deterministic forecast path.`,
    contextType: 'dcf',
    contextLabel: `${payload.companyName} (${payload.ticker})`,
    notes: [
      'This is a standalone forecast chart, separate from the full DCF card.',
      `Forecast horizon: ${payload.years} years.`,
      ...payload.notes.slice(0, 2),
    ],
    panels: [
      {
        id: 'revenue-forecast',
        height: 300,
        spec: singleSeriesSpec({
          title: 'Revenue Forecast',
          subtitle: 'Projected revenue by forecast year.',
          chartType: 'line',
          xLabel: 'Year',
          yLabel: 'Revenue',
          seriesLabel: 'Revenue',
          seriesKey: 'revenue',
          color: '#2563eb',
          format: 'currency',
          data: payload.forecast.map((row) => ({ x: row.year, y: row.revenue })),
        }),
      },
    ],
  };
}

function buildStockVisualization(payload: StockLookupResult): AnalystVisualizationPayload {
  return {
    title: `${payload.companyName ?? payload.ticker} Visualization`,
    subtitle: 'Standalone market chart generated from the current company context.',
    contextType: 'stock',
    contextLabel: `${payload.companyName ?? payload.ticker} (${payload.ticker})`,
    notes: ['This chart artifact is separate from the stock card so the user can work directly with the visual.'],
      panels: [
        {
          id: 'stock-chart',
          height: 260,
          spec:
            payload.chart.kind === 'price'
              ? singleSeriesSpec({
                  title: 'Recent Price Trend',
                  subtitle: 'Recent available price series.',
                  chartType: 'line',
                  xLabel: 'Date',
                  yLabel: 'Price',
                  seriesLabel: payload.ticker,
                  seriesKey: 'price',
                  color: '#10b981',
                  format: 'currency',
                  data: payload.chart.points.map((point) => ({ x: point.label, y: point.value })),
                })
              : singleSeriesSpec({
                  title: 'Fundamental Snapshot',
                  subtitle: 'Revenue, EBITDA, and net income snapshot.',
                  chartType: 'bar',
                  xLabel: 'Metric',
                  yLabel: 'USD millions',
                  seriesLabel: 'Value',
                  seriesKey: 'value',
                  color: '#2563eb',
                  format: 'currency',
                  data: payload.chart.points.map((point) => ({ x: point.label, y: point.value })),
                }),
        },
      ],
    };
}

export function buildVisualizationFromCurrentArtifact(input: {
  currentModel?: AnalystGeneratedModelPayload | null;
  currentDcf?: AnalystDcfDemoPayload | null;
  currentStock?: StockLookupResult | null;
}): AnalystVisualizationPayload | null {
  if (input.currentDcf) return buildDcfVisualization(input.currentDcf);
  if (input.currentModel) return buildModelVisualization(input.currentModel);
  if (input.currentStock) return buildStockVisualization(input.currentStock);
  return null;
}

export async function generateVisualizationSpecFromPrompt(params: {
  prompt: string;
  factsContext?: string | null;
  currentArtifactContext?: string | null;
  stockLookup?: StockLookupResult | null;
  attachmentContext?: string | null;
  macroEventsContext?: string | null;
}): Promise<FinanceChartSpec | null> {
  const stockBlock = params.stockLookup
    ? [
        `Stock lookup context for ${params.stockLookup.companyName ?? params.stockLookup.ticker} (${params.stockLookup.ticker})`,
        `Price: ${params.stockLookup.price ?? 'n/a'}`,
        `Market cap: ${params.stockLookup.marketCap ?? 'n/a'}`,
        `Revenue LTM: ${params.stockLookup.revenueLtm ?? 'n/a'}`,
        `EBITDA LTM: ${params.stockLookup.ebitdaLtm ?? 'n/a'}`,
        `Net income LTM: ${params.stockLookup.netIncomeLtm ?? 'n/a'}`,
        `Chart data: ${JSON.stringify(params.stockLookup.chart.points)}`,
      ].join('\n')
    : null;

  const result = await generateTextWithProviderFallback({
    preferredProvider: 'anthropic',
    clientType: 'service',
    maxTokens: 1400,
    temperature: 0,
    messages: [
      { role: 'system', content: FINANCE_CHART_SPEC_PROMPT },
      {
        role: 'user',
        content: [
          `User request: ${params.prompt}`,
          params.factsContext ? `Sourced facts:\n${params.factsContext}` : null,
          params.currentArtifactContext ? `Current artifact context:\n${params.currentArtifactContext}` : null,
          stockBlock,
          params.attachmentContext ? `Uploaded context:\n${params.attachmentContext}` : null,
          params.macroEventsContext ? `Macro event context:\n${params.macroEventsContext}` : null,
        ]
          .filter((item): item is string => Boolean(item))
          .join('\n\n'),
      },
    ],
  });

  if (!result?.text) return null;
  try {
    const parsed = extractJsonObject(result.text);
    return validateFinanceChartSpec(parsed);
  } catch {
    return null;
  }
}

export async function buildComparisonVisualizationFromPrompt(prompt: string): Promise<ComparisonVisualizationResult | null> {
  if (!isComparisonChartPrompt(prompt)) return null;

  const snapshots = await loadDemoSnapshots();
  const tickers = resolveMentionedTickers(prompt, snapshots);
  if (tickers.length < 2) return null;

  const metricPreference = inferComparisonMetric(prompt);
  if (metricPreference === 'revenueGrowth') {
    const growthSeries = (await Promise.all(tickers.map((ticker) => fetchRevenueGrowthSeries(ticker)))).filter(
      (item): item is CompanyGrowthSeries => Boolean(item)
    );
    if (growthSeries.length < 2) return null;

    const allPeriods = Array.from(new Set(growthSeries.flatMap((company) => company.periods))).sort();
    const notes: string[] = [
      'This chart was generated directly from the prompt, not from an existing model artifact.',
      ...growthSeries.map((company) => `${company.ticker}: ${company.source}`),
      ...growthSeries.map((company) => comparisonDriverSummary(company.ticker)),
    ];
    const explanation = `${comparisonDriverSummary(growthSeries[0].ticker)} ${comparisonDriverSummary(growthSeries[1].ticker)}`;

    return {
      explanation,
      visualization: {
        title: `${growthSeries[0].companyName} vs ${growthSeries[1].companyName} Revenue Growth`,
        subtitle: 'Historical annual revenue growth comparison built from the latest available company financial history.',
        contextType: 'stock',
        contextLabel: `${growthSeries[0].ticker} vs ${growthSeries[1].ticker}`,
        notes,
        panels: [
          {
            id: 'comparison-revenue-growth',
            height: 300,
            spec: multiSeriesSpec({
              title: 'Revenue Growth Comparison',
              subtitle: 'Historical annual revenue growth by company.',
              chartType: 'line',
              xLabel: 'Period',
              yLabel: 'Revenue Growth',
              yLeftFormat: 'percent',
              data: allPeriods.map((period) => {
                const row: Record<string, string | number | null> & { x: string | number } = { x: period };
                for (const company of growthSeries) {
                  const periodIdx = company.periods.indexOf(period);
                  row[company.ticker] = periodIdx >= 0 ? Number(company.revenueGrowth[periodIdx].toFixed(1)) : null;
                }
                return row;
              }),
              series: growthSeries.map((company, idx) => ({
                key: company.ticker,
                label: company.ticker,
                color: idx === 0 ? '#76b7ff' : '#7ce7ac',
                axis: 'left',
                format: 'percent',
              })),
            }),
          },
        ],
      },
    };
  }

  const series = (await Promise.all(tickers.map((ticker) => fetchComparisonSeries(ticker)))).filter(
    (item): item is CompanyComparisonSeries => Boolean(item)
  );
  if (series.length < 2) return null;

  const metricOrder: ComparisonMetricKey[] =
    metricPreference && metricPreference !== 'multi'
      ? [metricPreference]
      : ['revenue', 'ebitda', 'netIncome', 'eps'];
  const availableMetrics = metricOrder.filter((metric) => series.some((company) => typeof company.metrics[metric] === 'number'));
  if (availableMetrics.length === 0) return null;

  const notes: string[] = [
    'This chart was generated directly from the prompt, not from an existing model artifact.',
    ...series.map((company) =>
      `${company.ticker}: ${company.source === 'fmp_latest_quarter' ? 'latest quarterly earnings' : 'LTM snapshot fallback'}`
    ),
    ...series.map((company) => comparisonDriverSummary(company.ticker)),
  ];
  const explanation = `${comparisonDriverSummary(series[0].ticker)} ${comparisonDriverSummary(series[1].ticker)}`;

  return {
    explanation,
    visualization: {
      title: `${series[0].companyName} vs ${series[1].companyName} Comparison`,
      subtitle: 'Direct comparison chart built from the latest available company financial context.',
      contextType: 'stock',
      contextLabel: `${series[0].ticker} vs ${series[1].ticker}`,
      notes,
      panels: availableMetrics.map((metric) => ({
        id: `comparison-${metric}`,
        height: 280,
        spec: singleSeriesSpec({
          title: `${formatMetricLabel(metric)} Comparison`,
          subtitle:
            metric === 'eps'
              ? 'Latest available EPS by company.'
              : `Latest available ${formatMetricLabel(metric).toLowerCase()} by company.`,
          chartType: 'bar',
          xLabel: 'Company',
          yLabel: metric === 'eps' ? 'EPS' : formatMetricLabel(metric),
          seriesLabel: formatMetricLabel(metric),
          seriesKey: metric,
          color: '#76b7ff',
          format: metric === 'eps' ? 'currency' : 'currency',
          data: series.map((company) => ({ x: company.ticker, y: typeof company.metrics[metric] === 'number' ? company.metrics[metric] : 0 })),
        }),
      })),
    },
  };
}
