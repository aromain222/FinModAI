import { getDemoCompany, type DemoSnapshotRow } from '@/lib/data/providers/demoProvider';
import { getRun, type ModelRunRecord } from '@/lib/modelRunStore';
import type { Cell, ModelDocument, TableBlock } from '@/lib/models/schema/ModelDocument';

export type SnapshotValueFormat = 'money' | 'percent' | 'multiple' | 'text';

export type SnapshotItem = {
  label: string;
  value: number | string | null;
  format: SnapshotValueFormat;
};

export type AssumptionItem = {
  label: string;
  value: number | string | null;
  format: SnapshotValueFormat;
  source?: string;
};

export type ReportTable = {
  title: string;
  columns: string[];
  rows: Array<Array<string | number | null>>;
};

export type ModelRunReportData = {
  runId: string;
  ticker: string;
  modelType: string;
  asOfDate: string;
  generatedAt: string;
  companyName: string;
  sector: string | null;
  modelDocument: ModelDocument | null;
  snapshotItems: SnapshotItem[];
  assumptions: AssumptionItem[];
  keyTables: ReportTable[];
};

export type ModelRunReportResult =
  | { ok: true; data: ModelRunReportData }
  | { ok: false; error: string; details?: Record<string, unknown> };

type RunResult = {
  modelDocument?: unknown;
  assumptions?: unknown;
  dcfSummary?: unknown;
  lboSummary?: unknown;
  scorecardSummary?: unknown;
  debtCapacityLite?: unknown;
};

const MODEL_LABELS: Record<string, string> = {
  dcf: 'DCF',
  comps: 'COMPS',
  'football-field': 'FOOTBALL_FIELD',
  precedents: 'PRECEDENTS',
  'three-statement': 'FORECAST_MODEL',
  scorecard: 'SCORECARD',
  lbo: 'LBO',
  merger: 'MERGER',
  'debt-capacity-lite': 'DEBT_CAPACITY_LITE',
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toFinite(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/[$,%xX,\s]/g, '').trim();
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function getCellValue(cell: Cell | undefined): string | number | null {
  if (!cell) return null;
  if (typeof cell.display === 'string' && cell.display.trim().length > 0) return cell.display;
  if (typeof cell.value === 'number' || typeof cell.value === 'string') return cell.value;
  return null;
}

function getTableBlocks(doc: ModelDocument | null): TableBlock[] {
  if (!doc) return [];
  return doc.sections.flatMap((section) =>
    section.blocks.filter((block): block is TableBlock => block.type === 'table')
  );
}

function findTableById(doc: ModelDocument | null, tableId: string): TableBlock | null {
  if (!doc) return null;
  const table = getTableBlocks(doc).find((block) => block.tableId === tableId);
  return table ?? null;
}

function rowLabel(row: TableBlock['rows'][number]): string {
  if (row.labelCell && row.labelCell.trim().length > 0) return row.labelCell.trim();
  const firstCellKey = Object.keys(row.cells)[0];
  const firstCell = firstCellKey ? row.cells[firstCellKey] : undefined;
  const value = getCellValue(firstCell);
  return typeof value === 'string' ? value : row.rowKey;
}

function valueFromRow(row: TableBlock['rows'][number], preferredKeys: string[] = []): number | string | null {
  for (const key of preferredKeys) {
    const direct = getCellValue(row.cells[key]);
    if (direct !== null) return direct;
  }

  const entries = Object.entries(row.cells);
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const [, cell] = entries[i];
    const value = getCellValue(cell);
    if (value !== null && value !== '—') return value;
  }
  return null;
}

function tableToReport(table: TableBlock): ReportTable {
  const columns = table.columns.map((column) => column.label);
  const rows = table.rows.slice(0, 20).map((row) =>
    table.columns.map((column) => {
      const value = getCellValue(row.cells[column.key]);
      return value === '—' ? null : value;
    })
  );
  return {
    title: table.title || table.tableId,
    columns,
    rows,
  };
}

function extractAssumptionsFromTables(doc: ModelDocument | null): AssumptionItem[] {
  const assumptionsTableIds = new Set([
    'dcf_assumptions_table',
    'three_statement_assumptions_table',
    'scorecard_metrics',
  ]);
  const tables = getTableBlocks(doc).filter((table) => assumptionsTableIds.has(table.tableId));
  const items: AssumptionItem[] = [];

  for (const table of tables) {
    for (const row of table.rows) {
      const label = rowLabel(row);
      if (!label || /no .*available/i.test(label)) continue;
      const value = valueFromRow(row);
      if (value === null) continue;
      const normalized = typeof value === 'string' ? value.trim() : value;
      if (normalized === '') continue;

      let format: SnapshotValueFormat = 'text';
      if (typeof value === 'number') {
        if (/margin|growth|wacc|rate|percent|%/i.test(label)) format = 'percent';
        else if (/multiple|\/|x$/i.test(label)) format = 'multiple';
        else format = 'money';
      } else if (/%/.test(value)) {
        format = 'percent';
      }

      items.push({
        label,
        value: normalized,
        format,
      });
    }
  }

  // Keep assumptions concise and stable.
  return items.slice(0, 12);
}

function extractDcfSnapshot(result: RunResult): SnapshotItem[] {
  const dcfSummary = isObject(result.dcfSummary) ? result.dcfSummary : {};
  const valuation = isObject(dcfSummary.valuationResults) ? dcfSummary.valuationResults : {};
  const assumptions = isObject(dcfSummary.keyAssumptions) ? dcfSummary.keyAssumptions : {};
  const results = isObject(dcfSummary.results) ? dcfSummary.results : {};

  const ev = toFinite(valuation.enterpriseValue);
  const equity = toFinite(valuation.equityValue);
  const implied = toFinite(valuation.pricePerShare);
  const wacc = toFinite(assumptions.wacc);
  const terminalGrowth = toFinite(assumptions.terminalGrowth);
  const pvTerminal = toFinite(results.pvTerminalValue);
  const enterprise = toFinite(results.enterpriseValue) ?? ev;
  const terminalPct = pvTerminal !== null && enterprise !== null && enterprise !== 0 ? pvTerminal / enterprise : null;

  return [
    { label: 'Enterprise Value', value: ev, format: 'money' as const },
    { label: 'Equity Value', value: equity, format: 'money' as const },
    { label: 'Implied Price / Share', value: implied, format: 'money' as const },
    { label: 'WACC', value: wacc, format: 'percent' as const },
    { label: 'Terminal Growth', value: terminalGrowth, format: 'percent' as const },
    { label: '% EV from Terminal Value', value: terminalPct, format: 'percent' as const },
  ].filter((item) => item.value !== null) as SnapshotItem[];
}

function extractCompsSnapshot(doc: ModelDocument | null): SnapshotItem[] {
  const summaryTable = findTableById(doc, 'comps_multiples_summary');
  const impliedTable = findTableById(doc, 'comps_implied_valuation');

  const medianRow = summaryTable?.rows.find((row) => row.rowKey === 'summary_median');
  const evRev = medianRow ? toFinite(valueFromRow(medianRow, ['ev_revenue'])) : null;
  const evEbitda = medianRow ? toFinite(valueFromRow(medianRow, ['ev_ebitda'])) : null;
  const pe = medianRow ? toFinite(valueFromRow(medianRow, ['pe'])) : null;

  const blendRow = impliedTable?.rows.find((row) => row.rowKey === 'implied_blended');
  const impliedBlend = blendRow ? toFinite(valueFromRow(blendRow, ['implied_price'])) : null;

  return [
    { label: 'Median EV / Revenue', value: evRev, format: 'multiple' as const },
    { label: 'Median EV / EBITDA', value: evEbitda, format: 'multiple' as const },
    { label: 'Median P / E', value: pe, format: 'multiple' as const },
    { label: 'Blended Implied Price', value: impliedBlend, format: 'money' as const },
  ].filter((item) => item.value !== null) as SnapshotItem[];
}

function extractThreeStatementSnapshot(doc: ModelDocument | null): SnapshotItem[] {
  const incomeTable = findTableById(doc, 'three_statement_income_table') || findTableById(doc, 'three_statement_projection_table');
  if (!incomeTable) return [];

  const revenueRow = incomeTable.rows.find((row) => /revenue/i.test(row.rowKey) || /revenue/i.test(rowLabel(row)));
  const ebitdaRow = incomeTable.rows.find((row) => /ebitda/i.test(row.rowKey) || /ebitda/i.test(rowLabel(row)));

  const revenueValues = revenueRow
    ? incomeTable.columns
        .slice(1)
        .map((column) => toFinite(getCellValue(revenueRow.cells[column.key])))
        .filter((value): value is number => value !== null)
    : [];
  const ebitdaValues = ebitdaRow
    ? incomeTable.columns
        .slice(1)
        .map((column) => toFinite(getCellValue(ebitdaRow.cells[column.key])))
        .filter((value): value is number => value !== null)
    : [];

  const startRevenue = revenueValues.length > 0 ? revenueValues[0] : null;
  const endRevenue = revenueValues.length > 0 ? revenueValues[revenueValues.length - 1] : null;
  const periods = revenueValues.length > 1 ? revenueValues.length - 1 : 0;
  const revenueCagr =
    startRevenue !== null && endRevenue !== null && startRevenue > 0 && periods > 0
      ? Math.pow(endRevenue / startRevenue, 1 / periods) - 1
      : null;
  const endEbitda = ebitdaValues.length > 0 ? ebitdaValues[ebitdaValues.length - 1] : null;
  const endMargin =
    endRevenue !== null && endRevenue > 0 && endEbitda !== null
      ? endEbitda / endRevenue
      : null;

  return [
    { label: 'Start Revenue', value: startRevenue, format: 'money' as const },
    { label: 'End Revenue', value: endRevenue, format: 'money' as const },
    { label: 'Revenue CAGR', value: revenueCagr, format: 'percent' as const },
    { label: 'End EBITDA Margin', value: endMargin, format: 'percent' as const },
  ].filter((item) => item.value !== null) as SnapshotItem[];
}

function extractScorecardSnapshot(result: RunResult): SnapshotItem[] {
  const scorecard = isObject(result.scorecardSummary) ? result.scorecardSummary : {};
  const metricsRaw = Array.isArray(scorecard.metrics) ? scorecard.metrics : [];
  const metrics = metricsRaw
    .filter((row): row is Record<string, unknown> => isObject(row))
    .slice(0, 4)
    .map<SnapshotItem>((row) => ({
      label: toText(row.label) || 'Metric',
      value: typeof row.value === 'number' ? row.value : null,
      format:
        row.unit === 'percent'
          ? 'percent'
          : row.unit === 'multiple'
          ? 'multiple'
          : row.unit === 'money'
          ? 'money'
          : 'text',
    }))
    .filter((item) => item.value !== null);
  return metrics;
}

function extractDebtCapacitySnapshot(result: RunResult): SnapshotItem[] {
  const summary = isObject(result.debtCapacityLite) ? result.debtCapacityLite : {};
  const leverageCap = toFinite(summary.leverageCap);
  const coverageCap = toFinite(summary.coverageCap);
  const maxDebt = toFinite(summary.maxDebt);
  const currentNetDebt = toFinite(summary.currentNetDebt);
  const headroom = toFinite(summary.headroomVsNetDebt);
  const bindingRaw = toText(summary.bindingConstraint);

  return [
    { label: 'Leverage-Based Cap', value: leverageCap, format: 'money' as const },
    { label: 'Coverage-Based Cap', value: coverageCap, format: 'money' as const },
    { label: 'Selected Max Debt', value: maxDebt, format: 'money' as const },
    { label: 'Current Net Debt', value: currentNetDebt, format: 'money' as const },
    { label: 'Headroom vs Net Debt', value: headroom, format: 'money' as const },
    {
      label: 'Binding Constraint',
      value:
        bindingRaw === 'leverage'
          ? 'Leverage'
          : bindingRaw === 'coverage'
            ? 'Coverage'
            : null,
      format: 'text' as const,
    },
  ].filter((item) => item.value !== null) as SnapshotItem[];
}

function extractPreviewRowSnapshot(doc: ModelDocument | null, labels: Array<{ label: string; matcher: RegExp; format: SnapshotValueFormat }>) {
  const table = getTableBlocks(doc)[0];
  if (!table) return [];

  return labels
    .map<SnapshotItem | null>((config) => {
      const row = table.rows.find((candidate) => config.matcher.test(rowLabel(candidate)));
      if (!row) return null;
      const value = valueFromRow(row);
      if (value === null) return null;
      return {
        label: config.label,
        value,
        format: config.format,
      };
    })
    .filter((item): item is SnapshotItem => item !== null);
}

function extractSnapshotItems(
  modelType: string,
  doc: ModelDocument | null,
  result: RunResult
): SnapshotItem[] {
  if (modelType === 'dcf') return extractDcfSnapshot(result);
  if (modelType === 'comps') return extractCompsSnapshot(doc);
  if (modelType === 'football-field') {
    return extractPreviewRowSnapshot(doc, [
      { label: 'Trading Mid EV', matcher: /^trading mid ev$/i, format: 'money' },
      { label: 'Precedent Mid EV', matcher: /^precedent mid ev$/i, format: 'money' },
      { label: 'Trading Mid Price', matcher: /^trading mid price$/i, format: 'money' },
      { label: 'Precedent Mid Price', matcher: /^precedent mid price$/i, format: 'money' },
    ]);
  }
  if (modelType === 'precedents') {
    return extractPreviewRowSnapshot(doc, [
      { label: 'Subject Revenue', matcher: /^subject revenue$/i, format: 'money' },
      { label: 'Subject EBITDA', matcher: /^subject ebitda$/i, format: 'money' },
      { label: 'Median EV / Revenue', matcher: /^median ev \/ revenue$/i, format: 'multiple' },
      { label: 'Median EV / EBITDA', matcher: /^median ev \/ ebitda$/i, format: 'multiple' },
      { label: 'Implied EV (Revenue)', matcher: /^implied ev \(revenue\)$/i, format: 'money' },
      { label: 'Implied EV (EBITDA)', matcher: /^implied ev \(ebitda\)$/i, format: 'money' },
    ]);
  }
  if (modelType === 'three-statement') return extractThreeStatementSnapshot(doc);
  if (modelType === 'scorecard') return extractScorecardSnapshot(result);
  if (modelType === 'debt-capacity-lite') return extractDebtCapacitySnapshot(result);
  if (modelType === 'merger') {
    return extractPreviewRowSnapshot(doc, [
      { label: 'Deal Value', matcher: /^deal value$/i, format: 'money' },
      { label: 'Standalone EPS', matcher: /^standalone eps$/i, format: 'money' },
      { label: 'Pro Forma Revenue', matcher: /^pro forma revenue$/i, format: 'money' },
      { label: 'Pro Forma EBITDA', matcher: /^pro forma ebitda$/i, format: 'money' },
      { label: 'Pro Forma EPS', matcher: /^pro forma eps$/i, format: 'money' },
      { label: 'EPS Accretion / Dilution', matcher: /^eps accretion \/ dilution$/i, format: 'percent' },
    ]);
  }
  return [];
}

function keyTableIdsForModel(modelType: string): string[] {
  if (modelType === 'dcf') {
    return ['dcf_summary', 'dcf_projection_table', 'dcf_assumptions_table'];
  }
  if (modelType === 'comps') {
    return ['comps_peer_table', 'comps_multiples_summary', 'comps_implied_valuation'];
  }
  if (modelType === 'football-field' || modelType === 'precedents' || modelType === 'merger') {
    return ['sheet_1'];
  }
  if (modelType === 'three-statement') {
    return ['three_statement_income_table', 'three_statement_balance_table', 'three_statement_cashflow_table'];
  }
  if (modelType === 'scorecard') {
    return ['scorecard_company_overview', 'scorecard_metrics'];
  }
  if (modelType === 'debt-capacity-lite') {
    return ['debt_capacity_lite_summary'];
  }
  return [];
}

function extractKeyTables(doc: ModelDocument | null, modelType: string): ReportTable[] {
  if (!doc) return [];
  const allTables = getTableBlocks(doc);
  const preferredIds = keyTableIdsForModel(modelType);
  const selected: TableBlock[] = [];

  for (const tableId of preferredIds) {
    const table = allTables.find((item) => item.tableId === tableId);
    if (table) selected.push(table);
    if (selected.length >= 3) break;
  }

  if (selected.length < 3) {
    for (const table of allTables) {
      if (selected.includes(table)) continue;
      selected.push(table);
      if (selected.length >= 3) break;
    }
  }

  return selected.map(tableToReport);
}

function normalizeModelDocument(value: unknown): ModelDocument | null {
  if (!isObject(value)) return null;
  const sections = (value as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return null;
  return value as unknown as ModelDocument;
}

function labelModelType(modelType: string): string {
  return MODEL_LABELS[modelType] ?? modelType.toUpperCase();
}

function addNetDebtAssumption(
  assumptions: AssumptionItem[],
  result: RunResult,
  modelType: string
): AssumptionItem[] {
  if (modelType !== 'dcf') return assumptions;
  const dcfSummary = isObject(result.dcfSummary) ? result.dcfSummary : {};
  const results = isObject(dcfSummary.results) ? dcfSummary.results : {};
  const inputs = isObject(dcfSummary.inputs) ? dcfSummary.inputs : {};
  const netDebt = toFinite(results.netDebt) ?? toFinite((inputs as Record<string, unknown>).netDebtMillions);
  const sourceRaw = toText((inputs as Record<string, unknown>).netDebtSource) || 'reported';
  const source =
    sourceRaw === 'estimated_ai' || sourceRaw === 'estimated_rules'
      ? 'Estimated'
      : sourceRaw === 'unknown'
      ? 'Unavailable'
      : 'Reported';

  if (netDebt === null) return assumptions;
  if (assumptions.some((item) => /net debt/i.test(item.label))) return assumptions;
  return [
    ...assumptions,
    {
      label: 'Net Debt',
      value: netDebt,
      format: 'money',
      source,
    },
  ];
}

async function resolveCompanyInfo(run: ModelRunRecord): Promise<{
  companyName: string;
  sector: string | null;
  asOfDate: string;
}> {
  const snapshot: DemoSnapshotRow | null = await getDemoCompany(run.ticker);
  return {
    companyName: snapshot?.company_name?.trim() || run.ticker,
    sector: snapshot?.sector?.trim() || null,
    asOfDate: snapshot?.as_of_date || run.asOfDate,
  };
}

export async function getModelRunReportContext(runId: string): Promise<ModelRunReportResult> {
  const normalizedRunId = String(runId || '').trim();
  if (!normalizedRunId) {
    return {
      ok: false,
      error: 'invalid_run_id',
      details: { message: 'runId is required' },
    };
  }

  const run = getRun(normalizedRunId);
  if (!run) {
    return {
      ok: false,
      error: 'run_not_found',
      details: { runId: normalizedRunId },
    };
  }

  if (run.status !== 'generated') {
    return {
      ok: false,
      error: 'run_not_ready',
      details: { status: run.status, runId: normalizedRunId },
    };
  }

  const result: RunResult = isObject(run.result) ? (run.result as RunResult) : {};
  const modelDocument = normalizeModelDocument(result.modelDocument);
  const companyInfo = await resolveCompanyInfo(run);
  const snapshotItems = extractSnapshotItems(run.modelType, modelDocument, result);
  let assumptions = extractAssumptionsFromTables(modelDocument);
  assumptions = addNetDebtAssumption(assumptions, result, run.modelType);
  const keyTables = extractKeyTables(modelDocument, run.modelType);

  return {
    ok: true,
    data: {
      runId: run.id,
      ticker: run.ticker,
      modelType: labelModelType(run.modelType),
      asOfDate: companyInfo.asOfDate,
      generatedAt: run.updatedAt || run.createdAt,
      companyName: companyInfo.companyName,
      sector: companyInfo.sector,
      modelDocument,
      snapshotItems,
      assumptions,
      keyTables,
    },
  };
}
