import {
  getDemoCompany,
  getDemoSnapshotsBySector,
  getDemoSnapshot,
  type DemoSnapshotRow,
} from '@/lib/data/providers/demoProvider';
import type { ModelInputs } from '@/types/modelInputs';

export type ScorecardUnit = 'money' | 'percent' | 'multiple';

export type ScorecardMetricRow = {
  label: string;
  value: number | null;
  unit: ScorecardUnit;
  sectorMedian: number | null;
  percentile: number | null;
  notes?: string;
};

export type ScorecardSummary = {
  company: {
    ticker: string;
    companyName: string;
    sector: string | null;
    asOfDate: string | null;
    peerCount?: number;
    availableMetricCount?: number;
    benchmarkedMetricCount?: number;
  };
  metrics: ScorecardMetricRow[];
  screeningNote?: string;
  coverageNote?: string;
};

type DerivedMetrics = {
  ebitdaMargin: number | null;
  netMargin: number | null;
  netDebt: number | null;
  netDebtToEbitda: number | null;
  cashToDebt: number | null;
};

type DerivedMetricFallbacks = {
  revenue: number | null;
  ebitda: number | null;
  netIncome: number | null;
  cash: number | null;
  totalDebt: number | null;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const percentileRank = (subject: number | null, peers: number[]): number | null => {
  if (subject === null || peers.length < 5) return null;
  const lessOrEqualCount = peers.filter((value) => value <= subject).length;
  return (lessOrEqualCount / peers.length) * 100;
};

const deriveMetrics = (row: DemoSnapshotRow): DerivedMetrics => {
  const revenue = toFiniteNumber(row.revenue_ltm);
  const ebitda = toFiniteNumber(row.ebitda_ltm);
  const netIncome = toFiniteNumber(row.net_income_ltm);
  const cash = toFiniteNumber(row.cash);
  const totalDebt = toFiniteNumber(row.total_debt);

  const netDebt =
    cash !== null && totalDebt !== null ? totalDebt - cash : null;
  const ebitdaMargin =
    revenue !== null && revenue > 0 && ebitda !== null ? ebitda / revenue : null;
  const netMargin =
    revenue !== null && revenue > 0 && netIncome !== null ? netIncome / revenue : null;
  const netDebtToEbitda =
    netDebt !== null && ebitda !== null && ebitda > 0 ? netDebt / ebitda : null;
  const cashToDebt =
    cash !== null && totalDebt !== null && totalDebt > 0 ? cash / totalDebt : null;

  return {
    ebitdaMargin,
    netMargin,
    netDebt,
    netDebtToEbitda,
    cashToDebt,
  };
};

const deriveFallbacksFromModelInputs = (modelInputs: ModelInputs | null | undefined): DerivedMetricFallbacks => {
  if (!modelInputs) {
    return {
      revenue: null,
      ebitda: null,
      netIncome: null,
      cash: null,
      totalDebt: null,
    };
  }

  const revenue =
    Array.isArray(modelInputs.historicals?.revenue) && modelInputs.historicals.revenue.length > 0
      ? toFiniteNumber(modelInputs.historicals.revenue[modelInputs.historicals.revenue.length - 1])
      : null;
  const margin =
    typeof modelInputs.assumptions?.margin === 'number' && Number.isFinite(modelInputs.assumptions.margin)
      ? modelInputs.assumptions.margin
      : null;
  const taxRate =
    typeof modelInputs.assumptions?.taxRate === 'number' && Number.isFinite(modelInputs.assumptions.taxRate)
      ? modelInputs.assumptions.taxRate
      : null;
  const ebitda = revenue !== null && margin !== null ? revenue * margin : null;
  const netIncome =
    revenue !== null && margin !== null && taxRate !== null ? revenue * margin * (1 - taxRate) * 0.8 : null;
  const netDebt =
    typeof modelInputs.capitalStructure?.netDebt === 'number' && Number.isFinite(modelInputs.capitalStructure.netDebt)
      ? modelInputs.capitalStructure.netDebt
      : null;

  return {
    revenue,
    ebitda,
    netIncome,
    cash: netDebt !== null && netDebt < 0 ? Math.abs(netDebt) : null,
    totalDebt: netDebt !== null && netDebt > 0 ? netDebt : null,
  };
};

const deriveMetricsWithFallbacks = (
  row: DemoSnapshotRow,
  fallbackInputs?: ModelInputs | null
): DerivedMetrics => {
  const base = deriveMetrics(row);
  if (
    base.ebitdaMargin !== null &&
    base.netMargin !== null &&
    base.netDebt !== null &&
    base.netDebtToEbitda !== null &&
    base.cashToDebt !== null
  ) {
    return base;
  }

  const rawRevenue = toFiniteNumber(row.revenue_ltm);
  const rawEbitda = toFiniteNumber(row.ebitda_ltm);
  const rawNetIncome = toFiniteNumber(row.net_income_ltm);
  const rawCash = toFiniteNumber(row.cash);
  const rawTotalDebt = toFiniteNumber(row.total_debt);
  const fallbacks = deriveFallbacksFromModelInputs(fallbackInputs);

  const revenue = rawRevenue ?? fallbacks.revenue;
  const ebitda = rawEbitda ?? fallbacks.ebitda;
  const netIncome = rawNetIncome ?? fallbacks.netIncome;
  const cash = rawCash ?? fallbacks.cash;
  const totalDebt = rawTotalDebt ?? fallbacks.totalDebt;
  const netDebt = cash !== null && totalDebt !== null ? totalDebt - cash : fallbacks.totalDebt;

  return {
    ebitdaMargin:
      base.ebitdaMargin !== null ? base.ebitdaMargin : revenue !== null && revenue > 0 && ebitda !== null ? ebitda / revenue : null,
    netMargin:
      base.netMargin !== null ? base.netMargin : revenue !== null && revenue > 0 && netIncome !== null ? netIncome / revenue : null,
    netDebt: base.netDebt !== null ? base.netDebt : netDebt ?? null,
    netDebtToEbitda:
      base.netDebtToEbitda !== null
        ? base.netDebtToEbitda
        : netDebt !== null && ebitda !== null && ebitda > 0
        ? netDebt / ebitda
        : null,
    cashToDebt:
      base.cashToDebt !== null
        ? base.cashToDebt
        : cash !== null && totalDebt !== null && totalDebt > 0
        ? cash / totalDebt
        : null,
  };
};

const valuesForMetric = (
  peers: DemoSnapshotRow[],
  selector: (metrics: DerivedMetrics) => number | null
): number[] =>
  peers
    .map((peer) => selector(deriveMetrics(peer)))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

const buildManualScorecardSummary = (modelInputs: ModelInputs): ScorecardSummary => {
  const revenue = Array.isArray(modelInputs.historicals?.revenue)
    ? modelInputs.historicals.revenue[modelInputs.historicals.revenue.length - 1] ?? null
    : null;
  const margin =
    typeof modelInputs.assumptions?.margin === 'number' && Number.isFinite(modelInputs.assumptions.margin)
      ? modelInputs.assumptions.margin
      : null;
  const taxRate =
    typeof modelInputs.assumptions?.taxRate === 'number' && Number.isFinite(modelInputs.assumptions.taxRate)
      ? modelInputs.assumptions.taxRate
      : null;
  const netDebt =
    typeof modelInputs.capitalStructure?.netDebt === 'number' && Number.isFinite(modelInputs.capitalStructure.netDebt)
      ? modelInputs.capitalStructure.netDebt
      : null;

  const ebitda = revenue !== null && margin !== null ? revenue * margin : null;
  const netIncome =
    revenue !== null && margin !== null && taxRate !== null ? revenue * margin * (1 - taxRate) * 0.8 : null;

  const inferredCashToDebt =
    typeof netDebt === 'number' && netDebt < 0 ? null : null;

  return {
    company: {
      ticker: modelInputs.company.ticker?.trim().toUpperCase() || 'PRIVATE',
      companyName: modelInputs.company.name || 'Private Company',
      sector: null,
      asOfDate: modelInputs.metadata?.asOfDate || null,
      peerCount: 0,
      availableMetricCount: 3,
      benchmarkedMetricCount: 0,
    },
    metrics: [
      {
        label: 'EBITDA Margin',
        value: margin,
        unit: 'percent',
        sectorMedian: null,
        percentile: null,
        notes: margin === null ? 'Margin assumption unavailable.' : 'Derived from manual margin input.',
      },
      {
        label: 'Net Margin',
        value:
          revenue !== null && revenue > 0 && netIncome !== null
            ? netIncome / revenue
            : null,
        unit: 'percent',
        sectorMedian: null,
        percentile: null,
        notes:
          revenue !== null && revenue > 0 && netIncome !== null
            ? 'Derived from manual revenue, margin, and tax assumptions.'
            : 'Revenue, margin, or tax input unavailable.',
      },
      {
        label: 'Net Debt',
        value: netDebt,
        unit: 'money',
        sectorMedian: null,
        percentile: null,
        notes: netDebt === null ? 'Optional net debt input not provided.' : 'Taken from manual capital structure input.',
      },
      {
        label: 'Net Debt / EBITDA',
        value:
          typeof netDebt === 'number' && typeof ebitda === 'number' && ebitda > 0
            ? netDebt / ebitda
            : null,
        unit: 'multiple',
        sectorMedian: null,
        percentile: null,
        notes:
          typeof netDebt === 'number' && typeof ebitda === 'number' && ebitda > 0
            ? 'Computed from manual net debt and inferred EBITDA.'
            : 'Requires manual net debt and positive EBITDA.',
      },
      {
        label: 'Cash / Debt',
        value: inferredCashToDebt,
        unit: 'multiple',
        sectorMedian: null,
        percentile: null,
        notes: 'Cash and total debt are not collected separately in private/manual mode.',
      },
    ],
    screeningNote:
      'This scorecard is a rules-based operating and balance-sheet screen for manually entered companies. It is useful for prioritizing follow-up work, not for proving valuation or underwriting quality on its own.',
    coverageNote:
      'Sector benchmarks are unavailable in private/manual mode, so percentile and median comparisons are intentionally left blank.',
  };
};

export async function buildScorecardSummary(
  ticker: string,
  options?: {
    modelInputs?: ModelInputs | null;
    privateManualMode?: boolean;
  }
): Promise<ScorecardSummary> {
  if (options?.privateManualMode && options.modelInputs) {
    return buildManualScorecardSummary(options.modelInputs);
  }

  const cleanTicker = ticker.trim().toUpperCase();
  const subject = await getDemoCompany(cleanTicker);

  if (!subject) {
    throw new Error('Demo company not found in demo_company_snapshots');
  }

  const subjectMetrics = deriveMetricsWithFallbacks(subject, options?.modelInputs);
  const sector = subject.sector?.trim() || null;
  const sectorRows = sector ? await getDemoSnapshotsBySector(sector) : [];
  const mergedSectorRows = await Promise.all(
    sectorRows.map(async (row) => {
      const rowTicker = String(row.ticker || '').trim().toUpperCase();
      return rowTicker ? (await getDemoSnapshot(rowTicker)) ?? row : row;
    })
  );
  const peers = mergedSectorRows.filter(
    (row) => String(row.ticker || '').toUpperCase() !== cleanTicker
  );

  const ebitdaMarginPeers = valuesForMetric(peers, (m) => m.ebitdaMargin);
  const netMarginPeers = valuesForMetric(peers, (m) => m.netMargin);
  const netDebtPeers = valuesForMetric(peers, (m) => m.netDebt);
  const netDebtToEbitdaPeers = valuesForMetric(peers, (m) => m.netDebtToEbitda);
  const cashToDebtPeers = valuesForMetric(peers, (m) => m.cashToDebt);

  const metrics: ScorecardMetricRow[] = [
    {
      label: 'EBITDA Margin',
      value: subjectMetrics.ebitdaMargin,
      unit: 'percent',
      sectorMedian: median(ebitdaMarginPeers),
      percentile: percentileRank(subjectMetrics.ebitdaMargin, ebitdaMarginPeers),
      notes: subjectMetrics.ebitdaMargin === null ? 'Revenue or EBITDA unavailable.' : undefined,
    },
    {
      label: 'Net Margin',
      value: subjectMetrics.netMargin,
      unit: 'percent',
      sectorMedian: median(netMarginPeers),
      percentile: percentileRank(subjectMetrics.netMargin, netMarginPeers),
      notes: subjectMetrics.netMargin === null ? 'Revenue or net income unavailable.' : undefined,
    },
    {
      label: 'Net Debt',
      value: subjectMetrics.netDebt,
      unit: 'money',
      sectorMedian: median(netDebtPeers),
      percentile: percentileRank(subjectMetrics.netDebt, netDebtPeers),
      notes: subjectMetrics.netDebt === null ? 'Cash or total debt unavailable.' : undefined,
    },
    {
      label: 'Net Debt / EBITDA',
      value: subjectMetrics.netDebtToEbitda,
      unit: 'multiple',
      sectorMedian: median(netDebtToEbitdaPeers),
      percentile: percentileRank(subjectMetrics.netDebtToEbitda, netDebtToEbitdaPeers),
      notes:
        subjectMetrics.netDebtToEbitda === null
          ? 'Requires positive EBITDA and net debt.'
          : undefined,
    },
    {
      label: 'Cash / Debt',
      value: subjectMetrics.cashToDebt,
      unit: 'multiple',
      sectorMedian: median(cashToDebtPeers),
      percentile: percentileRank(subjectMetrics.cashToDebt, cashToDebtPeers),
      notes:
        subjectMetrics.cashToDebt === null
          ? 'Requires positive total debt.'
          : undefined,
    },
  ];

  const availableMetricCount = metrics.filter((metric) => metric.value !== null).length;
  const benchmarkedMetricCount = metrics.filter(
    (metric) => metric.value !== null && metric.sectorMedian !== null
  ).length;
  const peerCount = peers.length;
  const screeningNote =
    `${cleanTicker} is screened against ${peerCount} ${sector || 'sector'} peers using profitability and balance-sheet durability metrics. This is a first-pass quality screen, not a standalone investment conclusion.`;
  const coverageNote =
    availableMetricCount === metrics.length && benchmarkedMetricCount === metrics.length
      ? `All ${metrics.length} core metrics are populated and benchmarked against the current peer set.`
      : `${availableMetricCount} of ${metrics.length} core metrics are populated for the subject company and ${benchmarkedMetricCount} of ${metrics.length} have usable peer benchmarks. Missing values reflect current cached company-data gaps, not a workbook error.`;

  return {
    company: {
      ticker: cleanTicker,
      companyName: subject.company_name || cleanTicker,
      sector,
      asOfDate: subject.as_of_date || null,
      peerCount,
      availableMetricCount,
      benchmarkedMetricCount,
    },
    metrics,
    screeningNote,
    coverageNote,
  };
}
