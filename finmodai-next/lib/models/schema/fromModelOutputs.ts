import type { ModelDocument, Column, Row, Cell, TableBlock, ProvenanceStatus } from './ModelDocument';
import type { ModelType } from '@/types/models';
import type {
  ScorecardSummary,
  ScorecardMetricRow,
} from '@/lib/models/scorecard/buildScorecardSummary';
import {
  INCOME_STATEMENT_ROW_SCHEMA,
  BALANCE_SHEET_ROW_SCHEMA,
  CASH_FLOW_ROW_SCHEMA,
} from '@/lib/modelFormat';

type ThreeStatementSummary = {
  incomeStatement: Record<string, number[]>;
  balanceSheet: Record<string, number[]>;
  cashFlow: Record<string, number[]>;
  years: number[];
};

type BuildModelDocumentParams = {
  ticker: string;
  modelType: ModelType;
  asOfDate: string;
  currency?: string;
  units?: string;
  assumptions?: Record<string, any> | null;
  dcfSummary?: any;
  threeStatementSummary?: ThreeStatementSummary | null;
  lboSummary?: any;
  debtCapacityLiteSummary?: {
    label: string;
    leverageCap: number;
    coverageCap: number;
    maxDebt: number;
    bindingConstraint: 'leverage' | 'coverage';
    headroomVsNetDebt: number | null;
    currentNetDebt: number | null;
    inputs?: {
      ebitda: number;
      maxLeverage: number;
      minInterestCoverage: number;
      interestRate: number;
    };
  } | null;
  compsSummary?: any;
  scorecardSummary?: ScorecardSummary | null;
};

type LegacyPreview = {
  sheetName: string;
  columns: string[];
  rows: (string | number | null)[][];
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const normalized = value
      .trim()
      .replace(/[\[\],]/g, '')
      .replace('%', '');
    if (!normalized) return null;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => toFiniteNumber(entry))
    .filter((entry): entry is number => entry !== null);
}

function alignSeriesLength(
  source: Array<number | null>,
  targetLength: number
): Array<number | null> {
  if (targetLength <= 0) return [];
  if (source.length >= targetLength) return source.slice(0, targetLength);
  return [...source, ...Array(targetLength - source.length).fill(null)];
}

/** Expand assumption value (scalar or array) to number[] of length n. Never stringify arrays. */
function expandAssumptionToYears(
  value: number | number[] | undefined,
  n: number
): Array<number | null> {
  if (typeof value === 'number' && Number.isFinite(value)) return Array(n).fill(value);
  if (Array.isArray(value)) {
    return Array.from({ length: n }, (_, i) => {
      const v = value[i] ?? value[value.length - 1];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    });
  }
  return Array(n).fill(null);
}

function cell(value: string | number | null | undefined, status: ProvenanceStatus = 'derived'): Cell {
  return {
    value: value ?? null,
    meta: { status },
  };
}

function inferMetricColumnType(metricLabel: string): Column['type'] {
  const label = metricLabel.toLowerCase();

  if (
    label.includes('wacc') ||
    label.includes('growth') ||
    label.includes('margin') ||
    label.includes('tax rate') ||
    label.includes('discount rate') ||
    label.includes('rate') ||
    label.includes('%')
  ) {
    return 'percent';
  }

  if (
    label.includes('enterprise value') ||
    label.includes('equity value') ||
    label.includes('terminal value') ||
    label.includes('pv ') ||
    label.includes('present value') ||
    label.includes('fcf') ||
    label.includes('free cash flow') ||
    label.includes('revenue') ||
    label.includes('debt') ||
    label.includes('cash') ||
    label.includes('value') ||
    label.includes('price per share') ||
    label.includes('per share')
  ) {
    return 'currency';
  }

  if (
    label.includes('shares') ||
    label.includes('years') ||
    label.includes('count') ||
    label.includes('volume')
  ) {
    return 'number';
  }

  return 'number';
}

function inferMetricFormatStyle(metricLabel: string): string {
  const metricType = inferMetricColumnType(metricLabel);
  if (metricType === 'percent') return 'format:percent';
  if (metricType === 'currency') {
    return metricLabel.toLowerCase().includes('per share') ? 'format:currency_2' : 'format:currency';
  }
  return 'format:number';
}

function summaryTableFromObject(
  tableId: string,
  title: string,
  values: Record<string, any>,
  status: ProvenanceStatus = 'derived'
): TableBlock {
  const entries = Object.entries(values).map(([label, rawValue]) => {
    const maybeNumber = toFiniteNumber(rawValue);
    return [label, maybeNumber !== null ? maybeNumber : rawValue] as const;
  });
  const hasOnlyNumericOrMissing = entries.every(([, value]) => value === null || value === undefined || typeof value === 'number');

  const columns: Column[] = [
    { key: 'metric', label: 'Metric', type: 'text', align: 'left', width: 32 },
    {
      key: 'value',
      label: 'Value',
      type: hasOnlyNumericOrMissing ? 'number' : 'text',
      align: 'right',
      width: 24,
    },
  ];

  const rows: Row[] = entries.map(([label, value], idx) => {
    const isMissing = value === undefined || value === null;
    const metricStyle = inferMetricFormatStyle(label);
    const inferredStatus: ProvenanceStatus = isMissing ? 'missing' : status;

    return {
      rowKey: `${tableId}_${idx}`,
      labelCell: label,
      rowType: 'data',
      cells: {
        metric: cell(label, 'reported'),
        value: {
          value: isMissing ? null : (value as string | number),
          meta: { status: inferredStatus },
          style: metricStyle,
        },
      },
    };
  });

  if (rows.length === 0) {
    rows.push({
      rowKey: `${tableId}_empty`,
      rowType: 'data',
      cells: {
        metric: cell('No data', 'missing'),
        value: cell(null, 'missing'),
      },
    });
  }

  return {
    type: 'table',
    tableId,
    title,
    columns,
    rows,
    grid: { hideGridlines: true, freezePanes: { row: 1, column: 1 } },
  };
}

function projectionTable(
  tableId: string,
  title: string,
  labels: string[],
  series: Array<{ key: string; label: string; values: Array<number | null | undefined>; status?: ProvenanceStatus }>
): TableBlock {
  const columns: Column[] = [
    { key: 'line_item', label: 'Line Item', type: 'text', align: 'left', width: 24 },
    ...labels.map((year, idx) => ({
      key: `p_${idx}`,
      label: year,
      type: 'number' as const,
      align: 'right' as const,
      width: 14,
    })),
  ];

  const rows: Row[] = series.map((s, idx) => {
    const cells: Record<string, Cell> = { line_item: cell(s.label, 'reported') };
    labels.forEach((_, colIdx) => {
      cells[`p_${colIdx}`] = cell(s.values[colIdx], s.status ?? 'derived');
    });
    return {
      rowKey: `${tableId}_${idx}`,
      rowType: 'data',
      cells,
    };
  });

  if (rows.length === 0) {
    rows.push({
      rowKey: `${tableId}_empty`,
      rowType: 'data',
      cells: {
        line_item: cell('No projection data', 'missing'),
        p_0: cell(null, 'missing'),
      },
    });
  }

  return {
    type: 'table',
    tableId,
    title,
    columns,
    rows,
    grid: { hideGridlines: false, freezePanes: { row: 1, column: 1 } },
  };
}

function buildDcfSections(params: BuildModelDocumentParams) {
  const dcf = params.dcfSummary || {};
  const valuation = dcf.valuationResults || {};
  const assumptions = dcf.keyAssumptions || params.assumptions || {};
  const results = dcf.results || {};
  const labels = Array.isArray(results.years)
    ? results.years.map((v: any) => String(v))
    : Array.isArray(results.revenueByYear)
      ? results.revenueByYear.map((_: any, idx: number) => `Y${idx + 1}`)
      : [];

  return [
    {
      id: 'dcf_valuation_summary',
      title: 'Valuation Summary',
      layout: 'fullWidth' as const,
      blocks: [
        summaryTableFromObject('dcf_summary', 'Valuation Summary', {
          'Enterprise Value': valuation.enterpriseValue,
          'Equity Value': valuation.equityValue,
          'Price Per Share': valuation.pricePerShare,
          'PV Explicit FCF': valuation.pvExplicitFCF,
          'PV Terminal Value': valuation.pvTerminalValue,
        }),
      ],
    },
    {
      id: 'dcf_projection',
      title: 'Projection Table',
      layout: 'fullWidth' as const,
      blocks: [
        projectionTable('dcf_projection_table', 'Projected Drivers', labels, [
          { key: 'revenue', label: 'Revenue', values: results.revenueByYear || [], status: 'derived' },
          { key: 'fcf', label: 'Free Cash Flow', values: results.ufcfByYear || [], status: 'derived' },
        ]),
      ],
    },
    {
      id: 'dcf_assumptions',
      title: 'Key Assumptions',
      layout: 'fullWidth' as const,
      blocks: [
        summaryTableFromObject('dcf_assumptions_table', 'Assumptions', {
          WACC: assumptions.wacc,
          'Terminal Growth': assumptions.terminalGrowth,
          'Year 1 Revenue Growth': assumptions.year1RevenueGrowth,
          'EBITDA Margin': assumptions.ebitdaMargin,
        }, 'user_provided'),
      ],
    },
  ];
}

function buildThreeStatementSections(params: BuildModelDocumentParams) {
  const assumptions = params.assumptions || {};
  const summary = params.threeStatementSummary;

  if (summary && summary.years && summary.years.length > 0) {
    // Full three-statement model: Income Statement, Balance Sheet, Cash Flow, Assumptions (projection-style)
    const years = summary.years.map((y) => String(y));
    const yearsLen = years.length;

    const statementToSeries = (st: Record<string, number[]>, schema: { key: string; label: string; kind?: string }[]) =>
      schema
        .filter((s) => s.kind !== 'spacer')
        .map((s) => {
          const arr = st[s.key];
          const values = Array.isArray(arr) ? alignSeriesLength(arr.map((v) => (Number.isFinite(v) ? v : null)), yearsLen) : Array(yearsLen).fill(null);
          return { key: s.key, label: s.label, values, status: 'derived' as ProvenanceStatus };
        });

    const isSeries = statementToSeries(summary.incomeStatement, INCOME_STATEMENT_ROW_SCHEMA);
    const bsSeries = statementToSeries(summary.balanceSheet, BALANCE_SHEET_ROW_SCHEMA);
    const cfSeries = statementToSeries(summary.cashFlow, CASH_FLOW_ROW_SCHEMA);

    const assumptionsSeries = [
      { key: 'revenueGrowth', label: 'Revenue Growth (%)', values: expandAssumptionToYears((assumptions as any).revenueGrowth, yearsLen), status: 'user_provided' as ProvenanceStatus },
      { key: 'ebitdaMargin', label: 'EBITDA Margin (%)', values: expandAssumptionToYears((assumptions as any).ebitdaMargin, yearsLen), status: 'user_provided' as ProvenanceStatus },
      { key: 'taxRate', label: 'Tax Rate (%)', values: expandAssumptionToYears((assumptions as any).taxRate, yearsLen), status: 'user_provided' as ProvenanceStatus },
      { key: 'capexPctRevenue', label: 'Capex % Revenue (%)', values: expandAssumptionToYears((assumptions as any).capexPctRevenue, yearsLen), status: 'user_provided' as ProvenanceStatus },
    ];

    return [
      {
        id: 'three_statement_income',
        title: 'Income Statement',
        layout: 'fullWidth' as const,
        blocks: [projectionTable('three_statement_income_table', 'Income Statement', years, isSeries)],
      },
      {
        id: 'three_statement_balance',
        title: 'Balance Sheet',
        layout: 'fullWidth' as const,
        blocks: [projectionTable('three_statement_balance_table', 'Balance Sheet', years, bsSeries)],
      },
      {
        id: 'three_statement_cashflow',
        title: 'Cash Flow Statement',
        layout: 'fullWidth' as const,
        blocks: [projectionTable('three_statement_cashflow_table', 'Cash Flow Statement', years, cfSeries)],
      },
      {
        id: 'three_statement_assumptions',
        title: 'Driver Assumptions',
        layout: 'fullWidth' as const,
        blocks: [projectionTable('three_statement_assumptions_table', 'Driver Assumptions', years, assumptionsSeries)],
      },
    ];
  }

  // Fallback: heuristic 4-row projection when no threeStatementSummary
  const years = Array.isArray(assumptions.years) && assumptions.years.length > 0
    ? assumptions.years.map((y: any) => String(y))
    : Array.from({ length: 5 }, (_, idx) => String(new Date().getFullYear() + idx + 1));
  const yearsLen = years.length;

  const revenueSeriesRaw = toNumberArray(assumptions.revenue);
  const baseRevenue = revenueSeriesRaw[0] ?? toFiniteNumber(assumptions.revenue) ?? 1000;
  const revenueGrowth = toFiniteNumber((assumptions as any).revenueGrowth) ?? toFiniteNumber((assumptions as any).revenueGrowthPct) ?? 0.08;
  const projectedRevenue: number[] = [];
  for (let idx = 0; idx < yearsLen; idx += 1) {
    const explicitValue = revenueSeriesRaw[idx];
    if (explicitValue !== undefined) {
      projectedRevenue.push(explicitValue);
      continue;
    }
    const prev = projectedRevenue[idx - 1] ?? baseRevenue;
    projectedRevenue.push(idx === 0 ? baseRevenue * (1 + revenueGrowth) : prev * (1 + revenueGrowth));
  }

  const revenue = alignSeriesLength(projectedRevenue, yearsLen);
  const cogsSeriesRaw = toNumberArray((assumptions as any).cogs);
  const cogsPct = toFiniteNumber((assumptions as any).cogsPct?.[0]) ?? toFiniteNumber((assumptions as any).cogsPct) ?? 0.6;
  const cogsDerived = revenue.map((rev) => (rev === null ? null : rev * cogsPct));
  const cogs = alignSeriesLength(cogsSeriesRaw.length ? cogsSeriesRaw : cogsDerived, yearsLen);

  const ebitdaSeriesRaw = toNumberArray((assumptions as any).ebitda);
  const ebitdaMargin = toFiniteNumber((assumptions as any).ebitdaMargin) ?? 0.25;
  const ebitdaDerived = revenue.map((rev) => (rev === null ? null : rev * ebitdaMargin));
  const ebitda = alignSeriesLength(ebitdaSeriesRaw.length ? ebitdaSeriesRaw : ebitdaDerived, yearsLen);

  const netIncomeSeriesRaw = toNumberArray((assumptions as any).netIncome);
  const taxRate = toFiniteNumber((assumptions as any).taxRate) ?? 0.25;
  const netIncomeDerived = ebitda.map((value) => (value === null ? null : value * (1 - taxRate)));
  const netIncome = alignSeriesLength(netIncomeSeriesRaw.length ? netIncomeSeriesRaw : netIncomeDerived, yearsLen);

  const assumptionsSeries = [
    { key: 'revenueGrowth', label: 'Revenue Growth (%)', values: expandAssumptionToYears((assumptions as any).revenueGrowth, yearsLen), status: 'user_provided' as ProvenanceStatus },
    { key: 'ebitdaMargin', label: 'EBITDA Margin (%)', values: expandAssumptionToYears((assumptions as any).ebitdaMargin, yearsLen), status: 'user_provided' as ProvenanceStatus },
    { key: 'taxRate', label: 'Tax Rate (%)', values: expandAssumptionToYears((assumptions as any).taxRate, yearsLen), status: 'user_provided' as ProvenanceStatus },
    { key: 'capexPctRevenue', label: 'Capex % Revenue (%)', values: expandAssumptionToYears((assumptions as any).capexPctRevenue, yearsLen), status: 'user_provided' as ProvenanceStatus },
  ];

  const projectionBlock = projectionTable('three_statement_projection_table', 'Projected Financials', years, [
    { key: 'revenue', label: 'Revenue', values: revenue, status: 'derived' },
    { key: 'cogs', label: 'COGS', values: cogs, status: cogsSeriesRaw.length ? 'derived' : 'inferred' },
    { key: 'ebitda', label: 'EBITDA', values: ebitda, status: ebitdaSeriesRaw.length ? 'derived' : 'inferred' },
    { key: 'net_income', label: 'Net Income', values: netIncome, status: netIncomeSeriesRaw.length ? 'derived' : 'inferred' },
  ]);

  return [
    {
      id: 'three_statement_projection',
      title: 'Three-Statement Projection',
      layout: 'fullWidth' as const,
      blocks: [projectionBlock],
    },
    {
      id: 'three_statement_assumptions',
      title: 'Assumptions',
      layout: 'fullWidth' as const,
      blocks: [projectionTable('three_statement_assumptions_table', 'Driver Assumptions', years, assumptionsSeries)],
    },
  ];
}

function buildLboSections(params: BuildModelDocumentParams) {
  const summary = params.lboSummary || {};
  const projections = Array.isArray(summary.projections) ? summary.projections : [];
  const labels = projections.map((p: any, idx: number) => String(p.year || `Y${idx + 1}`));
  const entryEV = toFiniteNumber(summary.returns?.entryEV) ?? null;
  const entryEbitda = toFiniteNumber(summary.inputs?.ebitda) ?? null;
  const entryMultiple = entryEV !== null && entryEbitda ? entryEV / entryEbitda : null;
  const exitMultiple = toFiniteNumber(summary.inputs?.exitMultiple) ?? null;
  const debtPercent = toFiniteNumber(summary.inputs?.debtPercent) ?? null;
  const equityPercent = toFiniteNumber(summary.inputs?.equityPercent) ?? null;
  const equityInvested = toFiniteNumber(summary.sourcesAndUses?.sources?.sponsorEquity) ?? null;
  const holdingPeriod = toFiniteNumber(summary.inputs?.holdingPeriodYears ?? summary.inputs?.holdPeriod) ?? null;
  const exitFees = toFiniteNumber(summary.returns?.exitEV) !== null && toFiniteNumber(summary.inputs?.exitFeesPercent) !== null
    ? (toFiniteNumber(summary.returns?.exitEV) as number) * (toFiniteNumber(summary.inputs?.exitFeesPercent) as number)
    : null;
  const exitDebt = toFiniteNumber(summary.debtSchedule?.[summary.debtSchedule?.length - 1]?.endingBalance) ?? null;
  const exitExcessCash = toFiniteNumber(summary.returns?.exitExcessCash) ?? null;
  const exitNetDebt = exitDebt !== null && exitExcessCash !== null ? exitDebt - exitExcessCash : exitDebt;
  const warnings: string[] = Array.isArray(summary.warnings)
    ? summary.warnings.filter((w: unknown): w is string => typeof w === 'string' && w.trim().length > 0)
    : [];

  const operatingTable = projectionTable('lbo_operating_table', 'Operating Performance', labels, [
    { key: 'revenue', label: 'Revenue', values: projections.map((p: any) => p.revenue), status: 'derived' },
    { key: 'ebitda', label: 'EBITDA', values: projections.map((p: any) => p.ebitda), status: 'derived' },
    { key: 'ebitda_margin', label: 'EBITDA Margin', values: projections.map((p: any) => p.ebitdaMargin), status: 'derived' },
    { key: 'capex', label: 'Capex', values: projections.map((p: any) => p.capex), status: 'derived' },
    { key: 'delta_nwc', label: 'ΔNWC', values: projections.map((p: any) => p.nwcChange), status: 'derived' },
    { key: 'fcf', label: 'Unlevered Free Cash Flow', values: projections.map((p: any) => p.freeCashFlow), status: 'derived' },
  ]);

  const debtTable = projectionTable('lbo_debt_table', 'Debt Schedule', labels, [
    { key: 'begin_debt', label: 'Beginning Debt', values: summary.debtSchedule?.map((d: any) => d.beginningBalance) || [], status: 'derived' },
    { key: 'interest', label: 'Interest Expense', values: summary.debtSchedule?.map((d: any) => d.interest) || [], status: 'derived' },
    { key: 'cash_available', label: 'Cash Available for Debt Service', values: summary.debtSchedule?.map((d: any) => d.cashAvailableForDebt) || [], status: 'derived' },
    { key: 'mandatory_required', label: 'Mandatory Amortization (Required)', values: summary.debtSchedule?.map((d: any) => d.mandatoryAmortizationRequired) || [], status: 'derived' },
    { key: 'mandatory_actual', label: 'Mandatory Amortization (Actual)', values: summary.debtSchedule?.map((d: any) => d.mandatoryAmortization) || [], status: 'derived' },
    { key: 'sweep', label: 'Cash Sweep Repayment', values: summary.debtSchedule?.map((d: any) => d.cashSweep) || [], status: 'derived' },
    { key: 'total_repay', label: 'Total Debt Repayment', values: summary.debtSchedule?.map((d: any) => d.totalDebtRepayment) || [], status: 'derived' },
    { key: 'ending_debt', label: 'Ending Debt', values: summary.debtSchedule?.map((d: any) => d.endingBalance) || [], status: 'derived' },
    { key: 'excess_cash', label: 'Excess Cash', values: summary.debtSchedule?.map((d: any) => d.excessCash) || [], status: 'derived' },
  ]);

  const sourcesUsesTable = (tableId: string, title: string, rows: Array<{ label: string; value: number | null; rowType?: Row['rowType'] }>): TableBlock => ({
    type: 'table',
    tableId,
    title,
    columns: [
      { key: 'metric', label: 'Metric', type: 'text', align: 'left', width: 32 },
      { key: 'value', label: 'Value', type: 'number', align: 'right', width: 20 },
    ],
    rows: rows.map((row, idx) => ({
      rowKey: `${tableId}_${idx}`,
      labelCell: row.label,
      rowType: row.rowType || 'data',
      cells: {
        metric: cell(row.label, 'reported'),
        value: {
          value: row.value ?? null,
          meta: { status: row.value === null ? 'missing' : 'derived', method: row.rowType === 'total' ? 'sumAbove' : undefined },
          style: inferMetricFormatStyle(row.label),
        },
      },
    })),
    grid: { hideGridlines: true, freezePanes: { row: 1, column: 1 } },
  });

  const buildIrrFormula = (equity: number | null, exitEquity: number | null, years: number | null): string | null => {
    if (equity === null || exitEquity === null || !years || years < 1) return null;
    const cashFlows = [-equity, ...Array(Math.max(years - 1, 0)).fill(0), exitEquity];
    const values = cashFlows.map((v) => Number.isFinite(v) ? v.toFixed(6) : '0');
    return `=IRR({${values.join(',')}})`;
  };

  const irrFormula = buildIrrFormula(equityInvested, summary.returns?.exitEquityValue ?? null, holdingPeriod);

  const exitReturnsTable: TableBlock = {
    type: 'table',
    tableId: 'lbo_exit_returns_table',
    title: 'Exit & Returns',
    columns: [
      { key: 'metric', label: 'Metric', type: 'text', align: 'left', width: 32 },
      { key: 'value', label: 'Value', type: 'number', align: 'right', width: 24 },
    ],
    rows: [
      {
        rowKey: 'exit_ev',
        labelCell: 'Exit Enterprise Value',
        rowType: 'data',
        cells: {
          metric: cell('Exit Enterprise Value', 'reported'),
          value: { value: summary.returns?.exitEV ?? null, meta: { status: 'derived' }, style: inferMetricFormatStyle('Exit Enterprise Value') },
        },
      },
      {
        rowKey: 'exit_fees',
        labelCell: 'Exit Fees',
        rowType: 'data',
        cells: {
          metric: cell('Exit Fees', 'reported'),
          value: { value: exitFees, meta: { status: 'derived' }, style: inferMetricFormatStyle('Exit Fees') },
        },
      },
      {
        rowKey: 'exit_net_debt',
        labelCell: 'Net Debt at Exit',
        rowType: 'data',
        cells: {
          metric: cell('Net Debt at Exit', 'reported'),
          value: { value: exitNetDebt, meta: { status: 'derived' }, style: inferMetricFormatStyle('Net Debt at Exit') },
        },
      },
      {
        rowKey: 'exit_excess_cash',
        labelCell: 'Excess Cash at Exit',
        rowType: 'data',
        cells: {
          metric: cell('Excess Cash at Exit', 'reported'),
          value: { value: exitExcessCash, meta: { status: exitExcessCash === null ? 'missing' : 'derived' }, style: inferMetricFormatStyle('Excess Cash') },
        },
      },
      {
        rowKey: 'equity_exit',
        labelCell: 'Equity Value at Exit',
        rowType: 'data',
        cells: {
          metric: cell('Equity Value at Exit', 'reported'),
          value: { value: summary.returns?.exitEquityValue ?? null, meta: { status: 'derived' }, style: inferMetricFormatStyle('Equity Value') },
        },
      },
      {
        rowKey: 'equity_invested',
        labelCell: 'Equity Invested',
        rowType: 'data',
        cells: {
          metric: cell('Equity Invested', 'reported'),
          value: { value: equityInvested, meta: { status: 'derived' }, style: inferMetricFormatStyle('Equity Invested') },
        },
      },
      {
        rowKey: 'moic',
        labelCell: 'MOIC',
        rowType: 'data',
        cells: {
          metric: cell('MOIC', 'reported'),
          value: { value: summary.returns?.moic ?? null, meta: { status: 'derived' }, style: inferMetricFormatStyle('MOIC') },
        },
      },
      {
        rowKey: 'irr',
        labelCell: 'IRR',
        rowType: 'data',
        cells: {
          metric: cell('IRR', 'reported'),
          value: {
            value: summary.returns?.irr ?? null,
            formula: irrFormula ?? undefined,
            meta: { status: 'derived' },
            style: inferMetricFormatStyle('IRR'),
          },
        },
      },
    ],
    grid: { hideGridlines: true, freezePanes: { row: 1, column: 1 } },
  };

  const debtFullyRepaidYear = summary.debtSchedule?.find((d: any) => typeof d.endingBalance === 'number' && d.endingBalance <= 0)?.year;

  return [
    {
      id: 'lbo_return_summary',
      title: 'Deal Summary',
      subtitle: 'User-defined LBO assumptions',
      sheetName: 'Summary',
      layout: 'fullWidth' as const,
      blocks: [
        {
          type: 'callout' as const,
          content: 'Simplified LBO — Free-API Compatible. Financing assumptions are simplified.',
        },
        summaryTableFromObject('lbo_deal_summary_table', 'Deal Overview', {
          'Entry Enterprise Value': entryEV,
          'Entry Multiple (EV/EBITDA)': entryMultiple,
          'Debt %': debtPercent,
          'Equity %': equityPercent,
          'Equity Invested': equityInvested,
          'Holding Period (Years)': holdingPeriod,
          'Exit Multiple (EV/EBITDA)': exitMultiple,
        }, 'user_provided'),
        summaryTableFromObject('lbo_return_summary_table', 'Key Returns', {
          IRR: summary.returns?.irr,
          MOIC: summary.returns?.moic,
          'Exit Equity Value': summary.returns?.exitEquityValue,
        }),
      ],
    },
    {
      id: 'lbo_sources_uses',
      title: 'Sources & Uses',
      sheetName: 'Sources & Uses',
      layout: 'fullWidth' as const,
      blocks: [
        sourcesUsesTable('lbo_uses_table', 'Uses', [
          { label: 'Purchase Enterprise Value', value: toFiniteNumber(summary.sourcesAndUses?.uses?.purchasePrice) },
          { label: 'Transaction Fees', value: toFiniteNumber(summary.sourcesAndUses?.uses?.transactionFees) },
          { label: 'Total Uses', value: toFiniteNumber(summary.sourcesAndUses?.uses?.total), rowType: 'total' },
        ]),
        sourcesUsesTable('lbo_sources_table', 'Sources', [
          { label: 'Debt Raised', value: toFiniteNumber(summary.sourcesAndUses?.sources?.seniorDebt) },
          { label: 'Equity Invested', value: toFiniteNumber(summary.sourcesAndUses?.sources?.sponsorEquity) },
          { label: 'Total Sources', value: toFiniteNumber(summary.sourcesAndUses?.sources?.total), rowType: 'total' },
        ]),
      ],
    },
    {
      id: 'lbo_operating_performance',
      title: 'Operating Performance',
      sheetName: 'Operating Projections',
      layout: 'fullWidth' as const,
      blocks: [
        operatingTable,
      ],
    },
    {
      id: 'lbo_debt_schedule',
      title: 'Debt Schedule',
      sheetName: 'Debt Schedule',
      layout: 'fullWidth' as const,
      blocks: [
        debtTable,
        ...(debtFullyRepaidYear
          ? [
              {
                type: 'callout' as const,
                content: `Debt fully repaid by year ${debtFullyRepaidYear}.`,
              },
            ]
          : []),
      ],
    },
    {
      id: 'lbo_exit_returns',
      title: 'Exit & Returns',
      sheetName: 'Returns',
      layout: 'fullWidth' as const,
      blocks: [
        exitReturnsTable,
        {
          type: 'text' as const,
          content: 'Returns based on entry equity investment and exit equity value.',
        },
      ],
    },
    ...(warnings.length > 0
      ? [
          {
            id: 'lbo_warnings',
            title: 'Warnings & Notes',
            sheetName: 'Returns',
            layout: 'fullWidth' as const,
            blocks: warnings.map((warning) => ({
              type: 'callout' as const,
              variant: 'warning' as const,
              content: warning,
            })),
          },
        ]
      : []),
  ];
}

function buildCompsSections(params: BuildModelDocumentParams) {
  const comps = params.compsSummary || {};
  const subject = comps.subject || comps.target || comps.targetCompany || comps.company || null;
  const peers = Array.isArray(comps.peers) ? comps.peers : [];
  const sector = (params.assumptions as any)?.sector || comps.sector || comps.metadata?.sector || null;
  const industry = (params.assumptions as any)?.industry || comps.industry || comps.metadata?.industry || null;

  const normalizeShares = (value: unknown): number | null => {
    const num = toFiniteNumber(value);
    if (num === null) return null;
    // Canonical model/export paths store shares in millions.
    // Only downscale if a raw share count slips through.
    return num > 1_000_000 ? num / 1_000_000 : num;
  };

  const subjectName = subject?.name || subject?.companyName || params.ticker;
  const subjectTicker = subject?.ticker || params.ticker;
  const subjectMarketCap = toFiniteNumber(subject?.marketCap);
  const subjectPrice = toFiniteNumber(subject?.price);
  const subjectRevenue = toFiniteNumber(subject?.revenue);
  const subjectEbitda = toFiniteNumber(subject?.ebitda);
  const subjectNetIncome = toFiniteNumber(subject?.netIncome);
  const subjectCash = toFiniteNumber(subject?.cash);
  const subjectDebt = toFiniteNumber(subject?.totalDebt ?? subject?.debt);
  const subjectShares = normalizeShares(subject?.sharesOutstanding ?? subject?.shares);
  let subjectNetDebt = toFiniteNumber(subject?.netDebt);
  if (subjectNetDebt === null && subjectDebt !== null && subjectCash !== null) {
    subjectNetDebt = subjectDebt - subjectCash;
  }

  const overviewIdentityTable: TableBlock = {
    type: 'table',
    tableId: 'comps_overview_identity',
    title: 'Target Company',
    columns: [
      { key: 'metric', label: 'Metric', type: 'text', align: 'left', width: 28 },
      { key: 'value', label: 'Value', type: 'text', align: 'left', width: 32 },
    ],
    rows: [
      {
        rowKey: 'overview_company',
        labelCell: 'Company',
        rowType: 'data',
        cells: {
          metric: cell('Company', 'reported'),
          value: cell(subjectName, 'reported'),
        },
      },
      {
        rowKey: 'overview_ticker',
        labelCell: 'Ticker',
        rowType: 'data',
        cells: {
          metric: cell('Ticker', 'reported'),
          value: cell(subjectTicker, 'reported'),
        },
      },
      {
        rowKey: 'overview_sector',
        labelCell: 'Sector',
        rowType: 'data',
        cells: {
          metric: cell('Sector', 'reported'),
          value: cell(sector || '—', sector ? 'reported' : 'missing'),
        },
      },
      {
        rowKey: 'overview_industry',
        labelCell: 'Industry',
        rowType: 'data',
        cells: {
          metric: cell('Industry', 'reported'),
          value: cell(industry || '—', industry ? 'reported' : 'missing'),
        },
      },
    ],
  };

  const overviewMarketTable: TableBlock = {
    type: 'table',
    tableId: 'comps_overview_market',
    title: 'Market Data (LTM)',
    columns: [
      { key: 'metric', label: 'Metric', type: 'text', align: 'left', width: 28 },
      { key: 'value', label: 'Value', type: 'number', align: 'right', width: 20 },
    ],
    rows: [
      {
        rowKey: 'overview_marketcap',
        labelCell: 'Market Cap',
        rowType: 'data',
        cells: {
          metric: cell('Market Cap', 'reported'),
          value: { value: subjectMarketCap, meta: { status: subjectMarketCap !== null ? 'reported' : 'missing' }, style: 'format:currency' },
        },
      },
      {
        rowKey: 'overview_price',
        labelCell: 'Share Price',
        rowType: 'data',
        cells: {
          metric: cell('Share Price', 'reported'),
          value: { value: subjectPrice, meta: { status: subjectPrice !== null ? 'reported' : 'missing' }, style: 'format:currency_2' },
        },
      },
      {
        rowKey: 'overview_netdebt',
        labelCell: 'Net Debt',
        rowType: 'data',
        cells: {
          metric: cell('Net Debt', 'reported'),
          value: { value: subjectNetDebt, meta: { status: subjectNetDebt !== null ? 'reported' : 'missing' }, style: 'format:currency' },
        },
      },
      {
        rowKey: 'overview_shares',
        labelCell: 'Shares Outstanding',
        rowType: 'data',
        cells: {
          metric: cell('Shares Outstanding', 'reported'),
          value: { value: subjectShares, meta: { status: subjectShares !== null ? 'reported' : 'missing' }, style: 'format:number' },
        },
      },
    ],
  };

  const peerColumns: Column[] = [
    { key: 'company', label: 'Company Name', type: 'text', align: 'left', width: 28 },
    { key: 'ticker', label: 'Ticker', type: 'text', align: 'center', width: 10 },
    { key: 'market_cap', label: 'Market Cap', type: 'currency', align: 'right', width: 16 },
    { key: 'revenue', label: 'Revenue (LTM)', type: 'currency', align: 'right', width: 16 },
    { key: 'ebitda', label: 'EBITDA (LTM)', type: 'currency', align: 'right', width: 16 },
    { key: 'net_income', label: 'Net Income (LTM)', type: 'currency', align: 'right', width: 16 },
    { key: 'cash', label: 'Cash', type: 'currency', align: 'right', width: 14 },
    { key: 'total_debt', label: 'Total Debt', type: 'currency', align: 'right', width: 14 },
    { key: 'enterprise_value', label: 'Enterprise Value', type: 'currency', align: 'right', width: 18 },
    { key: 'ev_revenue', label: 'EV / Revenue', type: 'multiple', align: 'right', width: 12 },
    { key: 'ev_ebitda', label: 'EV / EBITDA', type: 'multiple', align: 'right', width: 12 },
    { key: 'pe', label: 'P / E', type: 'multiple', align: 'right', width: 10 },
  ];

  const peerRows: Row[] = [subject, ...peers].filter(Boolean).map((peer: any, idx: number) => {
    const marketCap = toFiniteNumber(peer?.marketCap);
    const cash = toFiniteNumber(peer?.cash);
    const totalDebt = toFiniteNumber(peer?.totalDebt ?? peer?.debt);
    const revenue = toFiniteNumber(peer?.revenue);
    const ebitda = toFiniteNumber(peer?.ebitda);
    const netIncome = toFiniteNumber(peer?.netIncome);
    const enterpriseValue = toFiniteNumber(peer?.enterpriseValue ?? peer?.ev);

    const evFormula =
      marketCap !== null && totalDebt !== null && cash !== null
        ? '=IF(OR({market_cap}="",{total_debt}="",{cash}=""),"",{market_cap}+{total_debt}-{cash})'
        : undefined;
    const evRevenueFormula =
      revenue !== null
        ? '=IF(OR({enterprise_value}="",{revenue}=""),"",{enterprise_value}/{revenue})'
        : undefined;
    const evEbitdaFormula =
      ebitda !== null
        ? '=IF(OR({enterprise_value}="",{ebitda}=""),"",{enterprise_value}/{ebitda})'
        : undefined;
    const peFormula =
      netIncome !== null
        ? '=IF(OR({market_cap}="",{net_income}=""),"",{market_cap}/{net_income})'
        : undefined;

    return {
      rowKey: `peer_${idx}`,
      rowType: 'data',
      labelCell: peer?.companyName || peer?.name || peer?.ticker || 'Peer',
      cells: {
        company: cell(peer?.companyName || peer?.name || peer?.ticker || 'Peer', 'reported'),
        ticker: cell(peer?.ticker || '—', 'reported'),
        market_cap: cell(marketCap, marketCap !== null ? 'reported' : 'missing'),
        revenue: cell(revenue, revenue !== null ? 'reported' : 'missing'),
        ebitda: cell(ebitda, ebitda !== null ? 'reported' : 'missing'),
        net_income: cell(netIncome, netIncome !== null ? 'reported' : 'missing'),
        cash: cell(cash, cash !== null ? 'reported' : 'missing'),
        total_debt: cell(totalDebt, totalDebt !== null ? 'reported' : 'missing'),
        enterprise_value: {
          value: enterpriseValue,
          meta: { status: enterpriseValue !== null ? 'derived' : 'missing' },
          formula: evFormula,
        },
        ev_revenue: {
          value: toFiniteNumber(peer?.evToRevenue ?? peer?.evRevenue) ?? null,
          meta: { status: 'derived' },
          formula: evRevenueFormula,
        },
        ev_ebitda: {
          value: toFiniteNumber(peer?.evToEbitda ?? peer?.evEbitda) ?? null,
          meta: { status: 'derived' },
          formula: evEbitdaFormula,
        },
        pe: {
          value: toFiniteNumber(peer?.peRatio ?? peer?.pe) ?? null,
          meta: { status: 'derived' },
          formula: peFormula,
        },
      },
    };
  });

  if (peerRows.length === 0) {
    peerRows.push({
      rowKey: 'peer_empty',
      rowType: 'data',
      cells: {
        company: cell('No peers available', 'missing'),
        ticker: cell(null, 'missing'),
        market_cap: cell(null, 'missing'),
        revenue: cell(null, 'missing'),
        ebitda: cell(null, 'missing'),
        net_income: cell(null, 'missing'),
        cash: cell(null, 'missing'),
        total_debt: cell(null, 'missing'),
        enterprise_value: cell(null, 'missing'),
        ev_revenue: cell(null, 'missing'),
        ev_ebitda: cell(null, 'missing'),
        pe: cell(null, 'missing'),
      },
    });
  }

  const multiplesSummaryColumns: Column[] = [
    { key: 'stat', label: 'Statistic', type: 'text', align: 'left', width: 18 },
    { key: 'ev_revenue', label: 'EV / Revenue', type: 'multiple', align: 'right', width: 14 },
    { key: 'ev_ebitda', label: 'EV / EBITDA', type: 'multiple', align: 'right', width: 14 },
    { key: 'pe', label: 'P / E', type: 'multiple', align: 'right', width: 12 },
  ];

  const multipleValues = {
    evToRevenue: peers
      .map((peer: any) => toFiniteNumber(peer?.evToRevenue ?? peer?.evRevenue))
      .filter((value: number | null): value is number => value !== null && value > 0),
    evToEbitda: peers
      .map((peer: any) => toFiniteNumber(peer?.evToEbitda ?? peer?.evEbitda))
      .filter((value: number | null): value is number => value !== null && value > 0),
    peRatio: peers
      .map((peer: any) => toFiniteNumber(peer?.peRatio ?? peer?.pe))
      .filter((value: number | null): value is number => value !== null && value > 0),
  };
  const calcMean = (values: number[]): number | null =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const calcMin = (values: number[]): number | null => (values.length > 0 ? Math.min(...values) : null);
  const calcMax = (values: number[]): number | null => (values.length > 0 ? Math.max(...values) : null);

  const median = comps.medianMultiples || {};
  const mean = {
    evToRevenue: toFiniteNumber(comps?.meanMultiples?.evToRevenue) ?? calcMean(multipleValues.evToRevenue),
    evToEbitda: toFiniteNumber(comps?.meanMultiples?.evToEbitda) ?? calcMean(multipleValues.evToEbitda),
    peRatio: toFiniteNumber(comps?.meanMultiples?.peRatio) ?? calcMean(multipleValues.peRatio),
  };
  const minMax = {
    evToRevenue: {
      min: toFiniteNumber(comps?.minMaxMultiples?.evToRevenue?.min) ?? calcMin(multipleValues.evToRevenue),
      max: toFiniteNumber(comps?.minMaxMultiples?.evToRevenue?.max) ?? calcMax(multipleValues.evToRevenue),
    },
    evToEbitda: {
      min: toFiniteNumber(comps?.minMaxMultiples?.evToEbitda?.min) ?? calcMin(multipleValues.evToEbitda),
      max: toFiniteNumber(comps?.minMaxMultiples?.evToEbitda?.max) ?? calcMax(multipleValues.evToEbitda),
    },
    peRatio: {
      min: toFiniteNumber(comps?.minMaxMultiples?.peRatio?.min) ?? calcMin(multipleValues.peRatio),
      max: toFiniteNumber(comps?.minMaxMultiples?.peRatio?.max) ?? calcMax(multipleValues.peRatio),
    },
  };
  const blendedImpliedPrice = toFiniteNumber(comps?.impliedValuation?.blendedPricePerShare);
  const blendedImpliedEquity = toFiniteNumber(comps?.impliedValuation?.blendedEquityValue);

  const multiplesSummaryRows: Row[] = [
    {
      rowKey: 'summary_median',
      rowType: 'data',
      labelCell: 'Median',
      cells: {
        stat: cell('Median', 'derived'),
        ev_revenue: cell(toFiniteNumber(median.evToRevenue), 'derived'),
        ev_ebitda: cell(toFiniteNumber(median.evToEbitda), 'derived'),
        pe: cell(toFiniteNumber(median.peRatio), 'derived'),
      },
    },
    {
      rowKey: 'summary_mean',
      rowType: 'data',
      labelCell: 'Mean',
      cells: {
        stat: cell('Mean', 'derived'),
        ev_revenue: cell(toFiniteNumber(mean.evToRevenue), 'derived'),
        ev_ebitda: cell(toFiniteNumber(mean.evToEbitda), 'derived'),
        pe: cell(toFiniteNumber(mean.peRatio), 'derived'),
      },
    },
    {
      rowKey: 'summary_min',
      rowType: 'data',
      labelCell: 'Min',
      cells: {
        stat: cell('Min', 'derived'),
        ev_revenue: cell(toFiniteNumber(minMax.evToRevenue?.min), 'derived'),
        ev_ebitda: cell(toFiniteNumber(minMax.evToEbitda?.min), 'derived'),
        pe: cell(toFiniteNumber(minMax.peRatio?.min), 'derived'),
      },
    },
    {
      rowKey: 'summary_max',
      rowType: 'data',
      labelCell: 'Max',
      cells: {
        stat: cell('Max', 'derived'),
        ev_revenue: cell(toFiniteNumber(minMax.evToRevenue?.max), 'derived'),
        ev_ebitda: cell(toFiniteNumber(minMax.evToEbitda?.max), 'derived'),
        pe: cell(toFiniteNumber(minMax.peRatio?.max), 'derived'),
      },
    },
  ];

  const impliedColumns: Column[] = [
    { key: 'method', label: 'Method', type: 'text', align: 'left', width: 18 },
    { key: 'selected_multiple', label: 'Selected Multiple', type: 'multiple', align: 'right', width: 16 },
    { key: 'target_metric', label: 'Target Metric', type: 'currency', align: 'right', width: 16 },
    { key: 'implied_ev', label: 'Implied Enterprise Value', type: 'currency', align: 'right', width: 18 },
    { key: 'net_debt', label: 'Net Debt', type: 'currency', align: 'right', width: 14 },
    { key: 'implied_equity', label: 'Implied Equity Value', type: 'currency', align: 'right', width: 18 },
    { key: 'shares_outstanding', label: 'Shares Outstanding (mm)', type: 'number', align: 'right', width: 18 },
    { key: 'implied_price', label: 'Implied Price / Share', type: 'currency', align: 'right', width: 16 },
  ];

  const impliedRows: Row[] = [
    {
      rowKey: 'implied_ev_revenue',
      rowType: 'data',
      labelCell: 'EV / Revenue',
      cells: {
        method: cell('EV / Revenue', 'derived'),
        selected_multiple: cell(toFiniteNumber(median.evToRevenue), 'derived'),
        target_metric: cell(subjectRevenue, subjectRevenue !== null ? 'reported' : 'missing'),
        implied_ev: {
          value: null,
          meta: { status: 'derived' },
          formula: '=IF(OR({selected_multiple}="",{target_metric}=""),"",{selected_multiple}*{target_metric})',
        },
        net_debt: cell(subjectNetDebt, subjectNetDebt !== null ? 'reported' : 'missing'),
        implied_equity: {
          value: null,
          meta: { status: 'derived' },
          formula: '=IF(OR({implied_ev}="",{net_debt}=""),"",{implied_ev}-{net_debt})',
        },
        shares_outstanding: cell(subjectShares, subjectShares !== null ? 'reported' : 'missing'),
        implied_price: {
          value: null,
          meta: { status: 'derived' },
          formula: '=IF(OR({implied_equity}="",{shares_outstanding}=""),"",{implied_equity}/{shares_outstanding})',
          style: 'format:currency_2',
        },
      },
    },
    {
      rowKey: 'implied_ev_ebitda',
      rowType: 'data',
      labelCell: 'EV / EBITDA',
      cells: {
        method: cell('EV / EBITDA', 'derived'),
        selected_multiple: cell(toFiniteNumber(median.evToEbitda), 'derived'),
        target_metric: cell(subjectEbitda, subjectEbitda !== null ? 'reported' : 'missing'),
        implied_ev: {
          value: null,
          meta: { status: 'derived' },
          formula: '=IF(OR({selected_multiple}="",{target_metric}=""),"",{selected_multiple}*{target_metric})',
        },
        net_debt: cell(subjectNetDebt, subjectNetDebt !== null ? 'reported' : 'missing'),
        implied_equity: {
          value: null,
          meta: { status: 'derived' },
          formula: '=IF(OR({implied_ev}="",{net_debt}=""),"",{implied_ev}-{net_debt})',
        },
        shares_outstanding: cell(subjectShares, subjectShares !== null ? 'reported' : 'missing'),
        implied_price: {
          value: null,
          meta: { status: 'derived' },
          formula: '=IF(OR({implied_equity}="",{shares_outstanding}=""),"",{implied_equity}/{shares_outstanding})',
          style: 'format:currency_2',
        },
      },
    },
    {
      rowKey: 'implied_pe',
      rowType: 'data',
      labelCell: 'P / E',
      cells: {
        method: cell('P / E', 'derived'),
        selected_multiple: cell(toFiniteNumber(median.peRatio), 'derived'),
        target_metric: cell(subjectNetIncome, subjectNetIncome !== null ? 'reported' : 'missing'),
        implied_ev: cell(null, 'missing'),
        net_debt: cell(null, 'missing'),
        implied_equity: {
          value: null,
          meta: { status: 'derived' },
          formula: '=IF(OR({selected_multiple}="",{target_metric}=""),"",{selected_multiple}*{target_metric})',
        },
        shares_outstanding: cell(subjectShares, subjectShares !== null ? 'reported' : 'missing'),
        implied_price: {
          value: null,
          meta: { status: 'derived' },
          formula: '=IF(OR({implied_equity}="",{shares_outstanding}=""),"",{implied_equity}/{shares_outstanding})',
          style: 'format:currency_2',
        },
      },
    },
  ];
  if (blendedImpliedPrice !== null || blendedImpliedEquity !== null) {
    impliedRows.push({
      rowKey: 'implied_blended',
      rowType: 'data',
      labelCell: 'Weighted Blend',
      cells: {
        method: cell('Weighted Blend (40/40/20)', 'derived'),
        selected_multiple: cell(null, 'missing'),
        target_metric: cell(null, 'missing'),
        implied_ev: cell(null, 'missing'),
        net_debt: cell(null, 'missing'),
        implied_equity: cell(blendedImpliedEquity, blendedImpliedEquity !== null ? 'derived' : 'missing'),
        shares_outstanding: cell(subjectShares, subjectShares !== null ? 'reported' : 'missing'),
        implied_price: {
          value: blendedImpliedPrice,
          meta: { status: blendedImpliedPrice !== null ? 'derived' : 'missing' },
          style: 'format:currency_2',
        },
      },
    });
  }

  return [
    {
      id: 'comps_overview',
      title: 'Overview',
      sheetName: 'Overview',
      layout: 'fullWidth' as const,
      blocks: [overviewIdentityTable, overviewMarketTable],
    },
    {
      id: 'comps_peer_data',
      title: 'Peer Data',
      sheetName: 'Peer Data',
      layout: 'fullWidth' as const,
      blocks: [
        {
          type: 'table' as const,
          tableId: 'comps_peer_table',
          title: 'Peer Data',
          columns: peerColumns,
          rows: peerRows,
          grid: { hideGridlines: false, freezePanes: { row: 1, column: 1 } },
        },
      ],
    },
    {
      id: 'comps_multiples_summary',
      title: 'Multiples Summary',
      sheetName: 'Multiples Summary',
      layout: 'fullWidth' as const,
      blocks: [
        {
          type: 'table' as const,
          tableId: 'comps_multiples_summary',
          title: 'Multiples Summary',
          columns: multiplesSummaryColumns,
          rows: multiplesSummaryRows,
          grid: { hideGridlines: false, freezePanes: { row: 1, column: 1 } },
        },
      ],
    },
    {
      id: 'comps_implied_valuation',
      title: 'Implied Valuation',
      sheetName: 'Implied Valuation',
      layout: 'fullWidth' as const,
      blocks: [
        {
          type: 'table' as const,
          tableId: 'comps_implied_valuation',
          title: 'Implied Valuation',
          columns: impliedColumns,
          rows: impliedRows,
          grid: { hideGridlines: false, freezePanes: { row: 1, column: 1 } },
        },
      ],
    },
  ];
}

function scorecardStyleForUnit(unit: ScorecardMetricRow['unit']): string {
  switch (unit) {
    case 'money':
      return 'format:money_mm';
    case 'percent':
      return 'format:percent_1';
    case 'multiple':
      return 'format:multiple_1';
    default:
      return 'format:number';
  }
}

function buildScorecardSections(params: BuildModelDocumentParams) {
  const summary = params.scorecardSummary;
  const company = summary?.company || {
    ticker: params.ticker,
    companyName: params.ticker,
    sector: null,
    asOfDate: params.asOfDate,
    peerCount: 0,
    availableMetricCount: 0,
    benchmarkedMetricCount: 0,
  };
  const metrics = Array.isArray(summary?.metrics) ? summary.metrics : [];
  const screeningNote =
    typeof summary?.screeningNote === 'string' && summary.screeningNote.trim().length > 0
      ? summary.screeningNote.trim()
      : `${company.companyName || params.ticker} is being screened on profitability and balance-sheet durability rather than valued precisely. Use this output to decide whether the company deserves deeper work.`;
  const coverageNote =
    typeof summary?.coverageNote === 'string' && summary.coverageNote.trim().length > 0
      ? summary.coverageNote.trim()
      : 'Benchmark coverage is limited when underlying company data is incomplete, so blank cells should be treated as data gaps rather than a model conclusion.';
  const peerCountDisplay =
    typeof company.peerCount === 'number' && Number.isFinite(company.peerCount)
      ? `${company.peerCount.toFixed(0)} peers`
      : '—';
  const availableMetricsDisplay =
    typeof company.availableMetricCount === 'number' && Number.isFinite(company.availableMetricCount)
      ? `${company.availableMetricCount.toFixed(0)} / ${metrics.length || 5}`
      : '—';
  const benchmarkedMetricsDisplay =
    typeof company.benchmarkedMetricCount === 'number' && Number.isFinite(company.benchmarkedMetricCount)
      ? `${company.benchmarkedMetricCount.toFixed(0)} / ${metrics.length || 5}`
      : '—';

  const overviewTable: TableBlock = {
    type: 'table',
    tableId: 'scorecard_company_overview',
    title: 'Company Overview',
    columns: [
      { key: 'metric', label: 'Metric', type: 'text', align: 'left', width: 28 },
      { key: 'value', label: 'Value', type: 'text', align: 'left', width: 34 },
    ],
    rows: [
      {
        rowKey: 'overview_name',
        rowType: 'data',
        cells: {
          metric: cell('Company Name', 'reported'),
          value: cell(company.companyName || params.ticker, 'reported'),
        },
      },
      {
        rowKey: 'overview_ticker',
        rowType: 'data',
        cells: {
          metric: cell('Ticker', 'reported'),
          value: cell(company.ticker || params.ticker, 'reported'),
        },
      },
      {
        rowKey: 'overview_sector',
        rowType: 'data',
        cells: {
          metric: cell('Sector', 'reported'),
          value: cell(company.sector || '—', company.sector ? 'reported' : 'missing'),
        },
      },
      {
        rowKey: 'overview_asof',
        rowType: 'data',
        cells: {
          metric: cell('As of Date', 'reported'),
          value: cell(company.asOfDate || params.asOfDate || '—', company.asOfDate ? 'reported' : 'missing'),
        },
      },
      {
        rowKey: 'overview_peer_count',
        rowType: 'data',
        cells: {
          metric: cell('Peer Set', 'reported'),
          value: cell(peerCountDisplay, peerCountDisplay === '—' ? 'missing' : 'derived'),
        },
      },
      {
        rowKey: 'overview_available_metrics',
        rowType: 'data',
        cells: {
          metric: cell('Metrics Populated', 'reported'),
          value: cell(availableMetricsDisplay, availableMetricsDisplay === '—' ? 'missing' : 'derived'),
        },
      },
      {
        rowKey: 'overview_benchmarked_metrics',
        rowType: 'data',
        cells: {
          metric: cell('Benchmarked Metrics', 'reported'),
          value: cell(benchmarkedMetricsDisplay, benchmarkedMetricsDisplay === '—' ? 'missing' : 'derived'),
        },
      },
    ],
  };

  const metricTable: TableBlock = {
    type: 'table',
    tableId: 'scorecard_metrics',
    title: 'Metrics',
    columns: [
      { key: 'label', label: 'Metric', type: 'text', align: 'left', width: 28 },
      { key: 'value', label: 'Value', type: 'number', align: 'right', width: 16 },
      { key: 'sector_median', label: 'Sector Median', type: 'number', align: 'right', width: 16 },
      { key: 'percentile', label: 'Percentile', type: 'percent', align: 'right', width: 14, format: '0.0%' },
      { key: 'notes', label: 'Notes', type: 'text', align: 'left', width: 40 },
    ],
    rows:
      metrics.length > 0
        ? metrics.map((metric, index) => {
            const valueStatus: ProvenanceStatus =
              metric.value === null ? 'missing' : 'derived';
            const medianStatus: ProvenanceStatus =
              metric.sectorMedian === null ? 'missing' : 'derived';
            const percentileStatus: ProvenanceStatus =
              metric.percentile === null ? 'missing' : 'derived';
            const unitStyle = scorecardStyleForUnit(metric.unit);
            const percentileValue =
              typeof metric.percentile === 'number'
                ? metric.percentile / 100
                : null;

            return {
              rowKey: `scorecard_metric_${index}`,
              rowType: 'data' as const,
              labelCell: metric.label,
              cells: {
                label: cell(metric.label, 'reported'),
                value: {
                  value: metric.value === null ? '—' : metric.value,
                  meta: { status: valueStatus },
                  style: unitStyle,
                },
                sector_median: {
                  value: metric.sectorMedian === null ? '—' : metric.sectorMedian,
                  meta: { status: medianStatus },
                  style: unitStyle,
                },
                percentile: {
                  value: percentileValue === null ? '—' : percentileValue,
                  meta: { status: percentileStatus },
                  style: 'format:percent_1',
                },
                notes: cell(metric.notes || '—', metric.notes ? 'reported' : 'missing'),
              },
            };
          })
        : [
            {
              rowKey: 'scorecard_empty',
              rowType: 'data' as const,
              cells: {
                label: cell('No scorecard metrics available', 'missing'),
                value: cell('—', 'missing'),
                sector_median: cell('—', 'missing'),
                percentile: cell('—', 'missing'),
                notes: cell('—', 'missing'),
              },
            },
          ],
    footnotes: [
      'Percentiles are shown only when at least five usable peer observations exist for that metric.',
      'Blank benchmark cells reflect missing source-company or peer data rather than a workbook formula error.',
    ],
  };

  return [
    {
      id: 'scorecard_overview',
      title: 'Scorecard',
      sheetName: 'Scorecard',
      layout: 'fullWidth' as const,
      blocks: [
        { type: 'text' as const, content: screeningNote },
        { type: 'callout' as const, content: coverageNote, variant: 'note' as const },
        { type: 'text' as const, content: 'All figures in USD millions unless otherwise noted.' },
        overviewTable,
        metricTable,
      ],
    },
  ];
}

function buildDebtCapacityLiteSections(params: BuildModelDocumentParams) {
  const summary = params.debtCapacityLiteSummary || null;
  if (!summary) {
    return [
      {
        id: 'debt_capacity_lite',
        title: 'Debt Capacity Lite',
        layout: 'fullWidth' as const,
        blocks: [
          summaryTableFromObject(
            'debt_capacity_lite_summary',
            'Debt Capacity Lite',
            {
              Ticker: params.ticker,
              Label: 'Debt Capacity Lite (Demo assumptions)',
              Status: 'No output available',
            },
            'missing'
          ),
        ],
      },
    ];
  }

  return [
    {
      id: 'debt_capacity_lite',
      title: 'Debt Capacity Lite',
      layout: 'fullWidth' as const,
      blocks: [
        summaryTableFromObject(
          'debt_capacity_lite_summary',
          summary.label || 'Debt Capacity Lite (Demo assumptions)',
          {
            EBITDA: summary.inputs?.ebitda ?? null,
            'Max Leverage (x)': summary.inputs?.maxLeverage ?? null,
            'Min Interest Coverage (x)': summary.inputs?.minInterestCoverage ?? null,
            'Interest Rate': summary.inputs?.interestRate ?? null,
            'Leverage-based Cap': summary.leverageCap,
            'Coverage-based Cap': summary.coverageCap,
            'Selected Max Debt': summary.maxDebt,
            'Binding Constraint': summary.bindingConstraint,
            'Current Net Debt': summary.currentNetDebt,
            'Headroom vs Net Debt': summary.headroomVsNetDebt,
          },
          'reported'
        ),
      ],
    },
  ];
}

function buildDefaultSections(params: BuildModelDocumentParams) {
  return [
    {
      id: 'model_summary',
      title: `${params.modelType.toUpperCase()} Summary`,
      layout: 'fullWidth' as const,
      blocks: [
        summaryTableFromObject('model_summary_table', 'Model Summary', {
          Ticker: params.ticker,
          'Model Type': params.modelType,
          'As Of': params.asOfDate,
        }, 'reported'),
      ],
    },
  ];
}

export function buildDocumentFromModelOutputs(params: BuildModelDocumentParams): ModelDocument {
  const meta = {
    modelType: params.modelType === 'operating' ? 'operating' : params.modelType,
    companyName: params.ticker,
    ticker: params.ticker,
    asOfDate: params.asOfDate,
    currency: params.currency || 'USD',
    units: params.units || 'millions',
    generatedAt: new Date().toISOString(),
  } as ModelDocument['meta'];

  const sections =
    params.modelType === 'dcf' || params.modelType === 'reverse-dcf'
      ? buildDcfSections(params)
      : params.modelType === 'three-statement'
        ? buildThreeStatementSections(params)
        : params.modelType === 'lbo'
          ? buildLboSections(params)
          : params.modelType === 'debt-capacity-lite'
            ? buildDebtCapacityLiteSections(params)
          : params.modelType === 'comps'
            ? buildCompsSections(params)
            : params.modelType === 'scorecard'
              ? buildScorecardSections(params)
            : buildDefaultSections(params);

  return { meta, sections };
}

export function buildLegacyPreviewFromDocument(document: ModelDocument | null): LegacyPreview | null {
  if (!document || document.sections.length === 0) return null;
  const firstSection = document.sections[0];
  const firstTable = firstSection.blocks.find((b) => b.type === 'table') as TableBlock | undefined;
  if (!firstTable) return null;

  const columns = firstTable.columns.map((col) => col.label);
  const rows = firstTable.rows.map((row) =>
    firstTable.columns.map((col) => {
      const c = row.cells[col.key];
      return c?.display ?? c?.value ?? null;
    })
  );

  return {
    sheetName: firstTable.title || firstSection.title || document.meta.modelType,
    columns,
    rows,
  };
}
