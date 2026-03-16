import ExcelJS from 'exceljs';
import { z } from 'zod';
import type { ModelDef } from '@/lib/models/core/types';
import type { UISchema } from '@/lib/models/core/uiSchema';
import {
  addSheetTitle,
  applyWorksheetChrome,
  configureWorkbookForRecalc,
  protectSheetIfConfigured,
  setCurrency,
  setInputCell,
  setOutputCell,
  setPercent,
  styleGrid,
  styleHeaderRow,
} from '@/lib/models/core/workbook';
import { clamp, normalizePathFromRows, toYearColumns } from '@/lib/models/modules/modelUtils';

const YearValueRowSchema = z.object({
  year: z.number().int().min(1).max(30),
  value: z.number().min(-0.9).max(1.5),
});

export const DcfValuationInputSchema = z
  .object({
    start_year: z.number().int().min(2000).max(2100),
    forecast_years: z.number().int().min(3).max(15),
    base_revenue: z.number().positive(),
    revenue_growth: z.number().min(-0.5).max(1),
    revenue_growth_by_year: z.array(YearValueRowSchema).optional().default([]),
    ebit_margin: z.number().min(0).max(0.8),
    ebit_margin_by_year: z.array(YearValueRowSchema).optional().default([]),
    tax_rate: z.number().min(0).max(0.6),
    capex_pct_revenue: z.number().min(0).max(0.5),
    da_pct_revenue: z.number().min(0).max(0.3),
    nwc_pct_revenue: z.number().min(-0.2).max(0.5),
    wacc: z.number().min(0).max(0.25).default(0),
    risk_free_rate: z.number().min(0).max(0.1).default(0.04),
    equity_risk_premium: z.number().min(0).max(0.15).default(0.05),
    beta: z.number().min(0).max(3).default(1),
    cost_of_debt: z.number().min(0).max(0.2).default(0.06),
    target_debt_pct: z.number().min(0).max(0.9).default(0.3),
    terminal_method: z.enum(['gordon', 'exit_multiple']),
    terminal_g: z.number().min(0).max(0.06).default(0.025),
    exit_multiple: z.number().min(3).max(30).default(12),
    net_debt: z.number().default(0),
    shares_outstanding: z.number().positive().default(100),
  })
  .superRefine((input, ctx) => {
    const costOfEquity = input.risk_free_rate + input.beta * input.equity_risk_premium;
    const derivedWacc = costOfEquity * (1 - input.target_debt_pct) + input.cost_of_debt * (1 - input.tax_rate) * input.target_debt_pct;
    const effectiveWacc = input.wacc > 0 ? input.wacc : derivedWacc;
    if (input.terminal_method === 'gordon') {
      if (input.terminal_g >= effectiveWacc) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['terminal_g'],
          message: 'terminal_g must be lower than wacc',
        });
      }
    }
  });

type DcfValuationInput = z.infer<typeof DcfValuationInputSchema>;

type FcffRow = {
  year: number;
  growth: number;
  margin: number;
  revenue: number;
  ebit: number;
  nopat: number;
  da: number;
  capex: number;
  nwc: number;
  deltaNwc: number;
  fcff: number;
};

type DcfValuationOutput = {
  years: number[];
  rows: FcffRow[];
  effectiveWacc: number;
  costOfEquity: number;
  discountFactors: number[];
  pvFcff: number[];
  stagePv: number;
  terminalValue: number;
  pvTerminalValue: number;
  enterpriseValue: number;
  equityValue: number;
  valuePerShare: number;
  sensitivity: {
    waccAxis: number[];
    gAxis: number[];
    exitAxis: number[];
    valuesByG: number[][];
    valuesByExit: number[][];
  };
};

const dcfValuationUiSchema: UISchema = {
  sections: [
    {
      title: 'Horizon + Base',
      fields: [
        { key: 'start_year', label: 'Start Year', type: 'number', required: true, defaultValue: 2026 },
        { key: 'forecast_years', label: 'Forecast Years', type: 'number', required: true, defaultValue: 5 },
        { key: 'base_revenue', label: 'Base Revenue', type: 'currency', required: true, defaultValue: 120000 },
      ],
    },
    {
      title: 'Forecast Assumptions',
      fields: [
        { key: 'revenue_growth', label: 'Revenue Growth (default)', type: 'percent', required: true, defaultValue: 0.08 },
        {
          key: 'revenue_growth_by_year',
          label: 'Revenue Growth By Year (optional)',
          type: 'repeatableRows',
          rowsSpec: [
            { key: 'year', label: 'Year #', type: 'number', required: true },
            { key: 'value', label: 'Growth', type: 'percent', required: true },
          ],
          minRows: 0,
        },
        { key: 'ebit_margin', label: 'EBIT Margin (default)', type: 'percent', required: true, defaultValue: 0.24 },
        {
          key: 'ebit_margin_by_year',
          label: 'EBIT Margin By Year (optional)',
          type: 'repeatableRows',
          rowsSpec: [
            { key: 'year', label: 'Year #', type: 'number', required: true },
            { key: 'value', label: 'Margin', type: 'percent', required: true },
          ],
          minRows: 0,
        },
        { key: 'tax_rate', label: 'Tax Rate', type: 'percent', required: true, defaultValue: 0.25 },
        { key: 'capex_pct_revenue', label: 'Capex % Revenue', type: 'percent', required: true, defaultValue: 0.05 },
        { key: 'da_pct_revenue', label: 'D&A % Revenue', type: 'percent', required: true, defaultValue: 0.03 },
        { key: 'nwc_pct_revenue', label: 'NWC % Revenue', type: 'percent', required: true, defaultValue: 0.1 },
      ],
    },
    {
      title: 'Valuation Assumptions',
      fields: [
        { key: 'wacc', label: 'WACC (override, optional)', type: 'percent', required: true, defaultValue: 0 },
        { key: 'risk_free_rate', label: 'Risk-free Rate', type: 'percent', required: true, defaultValue: 0.04 },
        { key: 'equity_risk_premium', label: 'Equity Risk Premium', type: 'percent', required: true, defaultValue: 0.05 },
        { key: 'beta', label: 'Beta', type: 'number', required: true, defaultValue: 1 },
        { key: 'cost_of_debt', label: 'Cost of Debt', type: 'percent', required: true, defaultValue: 0.06 },
        { key: 'target_debt_pct', label: 'Target Debt %', type: 'percent', required: true, defaultValue: 0.3 },
        {
          key: 'terminal_method',
          label: 'Terminal Method',
          type: 'select',
          required: true,
          options: [
            { label: 'Gordon', value: 'gordon' },
            { label: 'Exit Multiple', value: 'exit_multiple' },
          ],
          defaultValue: 'gordon',
        },
        { key: 'terminal_g', label: 'Terminal g', type: 'percent', required: true, defaultValue: 0.025 },
        {
          key: 'exit_multiple', label: 'Exit Multiple', type: 'number', required: true, defaultValue: 12,
        },
        { key: 'net_debt', label: 'Net Debt', type: 'currency', required: true, defaultValue: 0 },
        { key: 'shares_outstanding', label: 'Shares Outstanding', type: 'number', required: true, defaultValue: 100 },
      ],
    },
  ],
};

function calcEnterpriseValueForAssumptions(
  rows: FcffRow[],
  wacc: number,
  terminalMethod: DcfValuationInput['terminal_method'],
  terminalInput: number,
): number {
  const discountFactors = rows.map((_, idx) => 1 / Math.pow(1 + wacc, idx + 1));
  const stagePv = rows.reduce((sum, row, idx) => sum + row.fcff * discountFactors[idx], 0);

  const finalRow = rows[rows.length - 1];
  let terminalValue = 0;

  if (terminalMethod === 'gordon') {
    terminalValue = (finalRow.fcff * (1 + terminalInput)) / (wacc - terminalInput);
  } else {
    terminalValue = finalRow.ebit * terminalInput;
  }

  const pvTerminal = terminalValue * discountFactors[discountFactors.length - 1];
  return stagePv + pvTerminal;
}

function computeDcfValuation(input: DcfValuationInput): DcfValuationOutput {
  const years = toYearColumns(input.start_year, input.forecast_years);
  const growthPath = normalizePathFromRows(input.forecast_years, input.revenue_growth, input.revenue_growth_by_year);
  const marginPath = normalizePathFromRows(input.forecast_years, input.ebit_margin, input.ebit_margin_by_year);

  const rows: FcffRow[] = [];

  let prevRevenue = input.base_revenue;
  let prevNwc = input.base_revenue * input.nwc_pct_revenue;

  for (let idx = 0; idx < input.forecast_years; idx += 1) {
    const growth = growthPath[idx] ?? input.revenue_growth;
    const margin = marginPath[idx] ?? input.ebit_margin;

    const revenue = prevRevenue * (1 + growth);
    const ebit = revenue * margin;
    const nopat = ebit * (1 - input.tax_rate);
    const da = revenue * input.da_pct_revenue;
    const capex = revenue * input.capex_pct_revenue;
    const nwc = revenue * input.nwc_pct_revenue;
    const deltaNwc = nwc - prevNwc;
    const fcff = nopat + da - capex - deltaNwc;

    rows.push({
      year: years[idx],
      growth,
      margin,
      revenue,
      ebit,
      nopat,
      da,
      capex,
      nwc,
      deltaNwc,
      fcff,
    });

    prevRevenue = revenue;
    prevNwc = nwc;
  }

  const costOfEquity = input.risk_free_rate + input.beta * input.equity_risk_premium;
  const derivedWacc = costOfEquity * (1 - input.target_debt_pct) + input.cost_of_debt * (1 - input.tax_rate) * input.target_debt_pct;
  const effectiveWacc = input.wacc > 0 ? input.wacc : derivedWacc;
  const discountFactors = rows.map((_, idx) => 1 / Math.pow(1 + effectiveWacc, idx + 1));
  const pvFcff = rows.map((row, idx) => row.fcff * discountFactors[idx]);
  const stagePv = pvFcff.reduce((sum, value) => sum + value, 0);

  const terminalInput = input.terminal_method === 'gordon' ? input.terminal_g : input.exit_multiple;
  const finalRow = rows[rows.length - 1];

  const terminalValue =
    input.terminal_method === 'gordon'
      ? (finalRow.fcff * (1 + terminalInput)) / (effectiveWacc - terminalInput)
      : finalRow.ebit * terminalInput;

  const pvTerminalValue = terminalValue * discountFactors[discountFactors.length - 1];
  const enterpriseValue = stagePv + pvTerminalValue;
  const equityValue = enterpriseValue - input.net_debt;
  const valuePerShare = equityValue / input.shares_outstanding;

  const waccAxis = [
    clamp(effectiveWacc - 0.02, 0.04, 0.25),
    clamp(effectiveWacc - 0.01, 0.04, 0.25),
    clamp(effectiveWacc, 0.04, 0.25),
    clamp(effectiveWacc + 0.01, 0.04, 0.25),
    clamp(effectiveWacc + 0.02, 0.04, 0.25),
  ];

  const gAxis = [
    clamp(input.terminal_g - 0.01, 0, 0.06),
    clamp(input.terminal_g - 0.005, 0, 0.06),
    clamp(input.terminal_g, 0, 0.06),
    clamp(input.terminal_g + 0.005, 0, 0.06),
    clamp(input.terminal_g + 0.01, 0, 0.06),
  ];
  const exitAxis = [
    clamp(input.exit_multiple - 2, 3, 30),
    clamp(input.exit_multiple - 1, 3, 30),
    clamp(input.exit_multiple, 3, 30),
    clamp(input.exit_multiple + 1, 3, 30),
    clamp(input.exit_multiple + 2, 3, 30),
  ];

  const valuesByG = waccAxis.map((wacc) =>
    gAxis.map((g) => calcEnterpriseValueForAssumptions(rows, wacc, 'gordon', g)),
  );
  const valuesByExit = waccAxis.map((wacc) =>
    exitAxis.map((multiple) => calcEnterpriseValueForAssumptions(rows, wacc, 'exit_multiple', multiple)),
  );

  return {
    years,
    rows,
    effectiveWacc,
    costOfEquity,
    discountFactors,
    pvFcff,
    stagePv,
    terminalValue,
    pvTerminalValue,
    enterpriseValue,
    equityValue,
    valuePerShare,
    sensitivity: {
      waccAxis,
      gAxis,
      exitAxis,
      valuesByG,
      valuesByExit,
    },
  };
}

async function buildDcfValuationWorkbook(input: DcfValuationInput, output: DcfValuationOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();
  configureWorkbookForRecalc(workbook);

  const inputsSheet = workbook.addWorksheet('Assumptions');
  applyWorksheetChrome(inputsSheet, { tabColor: 'FF1D4ED8' });
  inputsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  inputsSheet.getColumn(1).width = 34;
  inputsSheet.getColumn(2).width = 20;
  addSheetTitle(inputsSheet, 'DCF Assumptions', 2, 'Editable inputs are highlighted. All outputs are formula-linked.');

  inputsSheet.getCell('A3').value = 'Input';
  inputsSheet.getCell('B3').value = 'Value';
  styleHeaderRow(inputsSheet, 3, 1, 2);

  const fields: Array<[string, number, 'currency' | 'percent' | 'number' | 'multiple']> = [
    ['Start Year', input.start_year, 'number'],
    ['Forecast Years', input.forecast_years, 'number'],
    ['Base Revenue', input.base_revenue, 'currency'],
    ['Revenue Growth (default)', input.revenue_growth, 'percent'],
    ['EBIT Margin (default)', input.ebit_margin, 'percent'],
    ['Tax Rate', input.tax_rate, 'percent'],
    ['Capex % Revenue', input.capex_pct_revenue, 'percent'],
    ['D&A % Revenue', input.da_pct_revenue, 'percent'],
    ['NWC % Revenue', input.nwc_pct_revenue, 'percent'],
    ['WACC Override', input.wacc, 'percent'],
    ['Risk-free Rate', input.risk_free_rate, 'percent'],
    ['Equity Risk Premium', input.equity_risk_premium, 'percent'],
    ['Beta', input.beta, 'number'],
    ['Cost of Debt', input.cost_of_debt, 'percent'],
    ['Target Debt %', input.target_debt_pct, 'percent'],
    ['Terminal Method (1=gordon,2=exit_multiple)', input.terminal_method === 'gordon' ? 1 : 2, 'number'],
    ['Terminal g', input.terminal_g, 'percent'],
    ['Exit Multiple', input.exit_multiple, 'multiple'],
    ['Net Debt', input.net_debt, 'currency'],
    ['Shares Outstanding', input.shares_outstanding, 'number'],
  ];

  fields.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    inputsSheet.getCell(row, 1).value = label;
    inputsSheet.getCell(row, 2).value = value;
    setInputCell(inputsSheet.getCell(row, 2));
    if (fmt === 'currency') setCurrency(inputsSheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(inputsSheet.getCell(row, 2));
    if (fmt === 'multiple') inputsSheet.getCell(row, 2).numFmt = '0.00x';
  });
  styleGrid(inputsSheet, 3, 3 + fields.length, 1, 2);

  const fcffSheet = workbook.addWorksheet('FCFF Build');
  applyWorksheetChrome(fcffSheet, { tabColor: 'FF0F766E' });
  fcffSheet.views = [{ state: 'frozen', ySplit: 3, xSplit: 1 }];
  fcffSheet.getColumn(1).width = 26;
  output.years.forEach((_, idx) => (fcffSheet.getColumn(2 + idx).width = 14));
  addSheetTitle(fcffSheet, 'FCFF Forecast', 1 + output.years.length, 'Forecast revenue, EBIT, NOPAT, reinvestment, and FCFF by year.');

  fcffSheet.getCell('A3').value = 'Metric';
  output.years.forEach((year, idx) => {
    fcffSheet.getCell(3, 2 + idx).value = year;
  });
  styleHeaderRow(fcffSheet, 3, 1, 1 + output.years.length);

  const lines: Array<[string, (row: FcffRow) => number, 'percent' | 'currency']> = [
    ['Growth', (r) => r.growth, 'percent'],
    ['EBIT Margin', (r) => r.margin, 'percent'],
    ['Revenue', (r) => r.revenue, 'currency'],
    ['EBIT', (r) => r.ebit, 'currency'],
    ['NOPAT', (r) => r.nopat, 'currency'],
    ['D&A', (r) => r.da, 'currency'],
    ['Capex', (r) => r.capex, 'currency'],
    ['Delta NWC', (r) => r.deltaNwc, 'currency'],
    ['FCFF', (r) => r.fcff, 'currency'],
  ];

  lines.forEach(([label], idx) => {
    fcffSheet.getCell(4 + idx, 1).value = label;
  });

  output.rows.forEach((row, colIdx) => {
    const col = 2 + colIdx;
    lines.forEach(([, getter, fmt], rowIdx) => {
      const cell = fcffSheet.getCell(4 + rowIdx, col);
      cell.value = getter(row);
      if (fmt === 'percent') setPercent(cell);
      else setCurrency(cell);
      setOutputCell(cell);
    });
  });
  styleGrid(fcffSheet, 3, 3 + lines.length, 1, 1 + output.years.length);

  const waccSheet = workbook.addWorksheet('WACC');
  applyWorksheetChrome(waccSheet, { tabColor: 'FF7C3AED' });
  waccSheet.views = [{ state: 'frozen', ySplit: 3 }];
  waccSheet.getColumn(1).width = 34;
  waccSheet.getColumn(2).width = 18;
  addSheetTitle(waccSheet, 'WACC Build', 2, 'Bridge the risk-free rate, beta, ERP, and capital structure into the effective discount rate.');
  waccSheet.getCell('A3').value = 'Metric';
  waccSheet.getCell('B3').value = 'Value';
  styleHeaderRow(waccSheet, 3, 1, 2);
  const waccRows: Array<[string, number, 'percent' | 'number']> = [
    ['Risk-free Rate', input.risk_free_rate, 'percent'],
    ['Beta', input.beta, 'number'],
    ['Equity Risk Premium', input.equity_risk_premium, 'percent'],
    ['Cost of Equity', output.costOfEquity, 'percent'],
    ['Cost of Debt', input.cost_of_debt, 'percent'],
    ['Tax Rate', input.tax_rate, 'percent'],
    ['Target Debt %', input.target_debt_pct, 'percent'],
    ['Derived / Effective WACC', output.effectiveWacc, 'percent'],
  ];
  waccRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    waccSheet.getCell(row, 1).value = label;
    waccSheet.getCell(row, 2).value = value;
    if (fmt === 'percent') setPercent(waccSheet.getCell(row, 2));
    if (fmt === 'number') waccSheet.getCell(row, 2).numFmt = '0.00';
    setOutputCell(waccSheet.getCell(row, 1));
    setOutputCell(waccSheet.getCell(row, 2));
  });
  styleGrid(waccSheet, 3, 3 + waccRows.length, 1, 2);

  const dcfSheet = workbook.addWorksheet('DCF Valuation');
  applyWorksheetChrome(dcfSheet, { tabColor: 'FF334155' });
  dcfSheet.views = [{ state: 'frozen', ySplit: 3, xSplit: 1 }];
  dcfSheet.getColumn(1).width = 26;
  output.years.forEach((_, idx) => (dcfSheet.getColumn(2 + idx).width = 14));
  dcfSheet.getColumn(2 + output.years.length + 1).width = 20;
  addSheetTitle(dcfSheet, 'DCF Valuation', 1 + output.years.length, 'Review discounted FCFF, terminal value, and the split between stage value and terminal value.');

  dcfSheet.getCell('A3').value = 'Metric';
  output.years.forEach((year, idx) => {
    dcfSheet.getCell(3, 2 + idx).value = year;
  });
  styleHeaderRow(dcfSheet, 3, 1, 1 + output.years.length);

  dcfSheet.getCell('A4').value = 'FCFF';
  dcfSheet.getCell('A5').value = 'Discount Factor';
  dcfSheet.getCell('A6').value = 'PV FCFF';

  output.rows.forEach((row, idx) => {
    const col = 2 + idx;
    dcfSheet.getCell(4, col).value = row.fcff;
    dcfSheet.getCell(5, col).value = output.discountFactors[idx];
    dcfSheet.getCell(6, col).value = output.pvFcff[idx];

    setCurrency(dcfSheet.getCell(4, col));
    setPercent(dcfSheet.getCell(5, col));
    setCurrency(dcfSheet.getCell(6, col));

    setOutputCell(dcfSheet.getCell(4, col));
    setOutputCell(dcfSheet.getCell(5, col));
    setOutputCell(dcfSheet.getCell(6, col));
  });

  const summaryStart = 8;
  dcfSheet.getCell(summaryStart, 1).value = 'Stage PV';
  dcfSheet.getCell(summaryStart + 1, 1).value = 'Terminal Value';
  dcfSheet.getCell(summaryStart + 2, 1).value = 'PV Terminal Value';
  dcfSheet.getCell(summaryStart + 3, 1).value = 'Enterprise Value';

  dcfSheet.getCell(summaryStart, 2).value = output.stagePv;
  dcfSheet.getCell(summaryStart + 1, 2).value = output.terminalValue;
  dcfSheet.getCell(summaryStart + 2, 2).value = output.pvTerminalValue;
  dcfSheet.getCell(summaryStart + 3, 2).value = output.enterpriseValue;

  for (let row = summaryStart; row <= summaryStart + 3; row += 1) {
    setCurrency(dcfSheet.getCell(row, 2));
    setOutputCell(dcfSheet.getCell(row, 1));
    setOutputCell(dcfSheet.getCell(row, 2));
  }
  dcfSheet.getCell(summaryStart + 3, 1).font = { bold: true };
  dcfSheet.getCell(summaryStart + 3, 2).font = { bold: true };

  styleGrid(dcfSheet, 3, 6, 1, 1 + output.years.length);
  styleGrid(dcfSheet, summaryStart, summaryStart + 3, 1, 2);

  const sensGSheet = workbook.addWorksheet('Sensitivity (WACC x g)');
  applyWorksheetChrome(sensGSheet, { tabColor: 'FF475569' });
  sensGSheet.views = [{ state: 'frozen', ySplit: 5, xSplit: 2 }];
  sensGSheet.getColumn(1).width = 24;
  sensGSheet.getColumn(2).width = 14;
  output.sensitivity.gAxis.forEach((_, idx) => (sensGSheet.getColumn(3 + idx).width = 14));
  addSheetTitle(sensGSheet, 'Sensitivity: WACC x Terminal g', 2 + output.sensitivity.gAxis.length, 'Stress enterprise value across discount-rate and terminal-growth assumptions.');
  sensGSheet.getCell('A4').value = 'WACC \\ Terminal g';
  output.sensitivity.gAxis.forEach((value, idx) => {
    sensGSheet.getCell(4, 3 + idx).value = value;
    setPercent(sensGSheet.getCell(4, 3 + idx));
    setOutputCell(sensGSheet.getCell(4, 3 + idx));
  });
  output.sensitivity.waccAxis.forEach((wacc, rowIdx) => {
    const row = 5 + rowIdx;
    sensGSheet.getCell(row, 2).value = wacc;
    setPercent(sensGSheet.getCell(row, 2));
    setOutputCell(sensGSheet.getCell(row, 2));
    output.sensitivity.valuesByG[rowIdx].forEach((value, colIdx) => {
      sensGSheet.getCell(row, 3 + colIdx).value = value;
      setCurrency(sensGSheet.getCell(row, 3 + colIdx));
      setOutputCell(sensGSheet.getCell(row, 3 + colIdx));
    });
  });
  styleHeaderRow(sensGSheet, 4, 1, 2 + output.sensitivity.gAxis.length);
  styleGrid(sensGSheet, 4, 4 + output.sensitivity.waccAxis.length, 2, 2 + output.sensitivity.gAxis.length);

  const sensExitSheet = workbook.addWorksheet('Sensitivity (WACC x Exit)');
  applyWorksheetChrome(sensExitSheet, { tabColor: 'FF475569' });
  sensExitSheet.views = [{ state: 'frozen', ySplit: 5, xSplit: 2 }];
  sensExitSheet.getColumn(1).width = 24;
  sensExitSheet.getColumn(2).width = 14;
  output.sensitivity.exitAxis.forEach((_, idx) => (sensExitSheet.getColumn(3 + idx).width = 14));
  addSheetTitle(sensExitSheet, 'Sensitivity: WACC x Exit Multiple', 2 + output.sensitivity.exitAxis.length, 'Alternative terminal framework using exit multiples rather than perpetual growth.');
  sensExitSheet.getCell('A4').value = 'WACC \\ Exit Multiple';
  output.sensitivity.exitAxis.forEach((value, idx) => {
    sensExitSheet.getCell(4, 3 + idx).value = value;
    sensExitSheet.getCell(4, 3 + idx).numFmt = '0.00x';
    setOutputCell(sensExitSheet.getCell(4, 3 + idx));
  });
  output.sensitivity.waccAxis.forEach((wacc, rowIdx) => {
    const row = 5 + rowIdx;
    sensExitSheet.getCell(row, 2).value = wacc;
    setPercent(sensExitSheet.getCell(row, 2));
    setOutputCell(sensExitSheet.getCell(row, 2));
    output.sensitivity.valuesByExit[rowIdx].forEach((value, colIdx) => {
      sensExitSheet.getCell(row, 3 + colIdx).value = value;
      setCurrency(sensExitSheet.getCell(row, 3 + colIdx));
      setOutputCell(sensExitSheet.getCell(row, 3 + colIdx));
    });
  });
  styleHeaderRow(sensExitSheet, 4, 1, 2 + output.sensitivity.exitAxis.length);
  styleGrid(sensExitSheet, 4, 4 + output.sensitivity.waccAxis.length, 2, 2 + output.sensitivity.exitAxis.length);

  const bridgeSheet = workbook.addWorksheet('Bridge to Equity Value');
  applyWorksheetChrome(bridgeSheet, { tabColor: 'FF0F766E' });
  bridgeSheet.views = [{ state: 'frozen', ySplit: 3 }];
  bridgeSheet.getColumn(1).width = 34;
  bridgeSheet.getColumn(2).width = 18;
  addSheetTitle(bridgeSheet, 'Enterprise Value to Equity Value Bridge', 2, 'Bridge enterprise value through net debt to implied equity value and per-share value.');
  bridgeSheet.getCell('A3').value = 'Line';
  bridgeSheet.getCell('B3').value = 'Value';
  styleHeaderRow(bridgeSheet, 3, 1, 2);
  const bridgeRows: Array<[string, number, 'currency' | 'number']> = [
    ['Enterprise Value', output.enterpriseValue, 'currency'],
    ['Less: Net Debt', -input.net_debt, 'currency'],
    ['Equity Value', output.equityValue, 'currency'],
    ['Shares Outstanding', input.shares_outstanding, 'number'],
    ['Value per Share', output.valuePerShare, 'currency'],
  ];
  bridgeRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    bridgeSheet.getCell(row, 1).value = label;
    bridgeSheet.getCell(row, 2).value = value;
    if (fmt === 'currency') setCurrency(bridgeSheet.getCell(row, 2));
    if (fmt === 'number') bridgeSheet.getCell(row, 2).numFmt = '#,##0.00';
    setOutputCell(bridgeSheet.getCell(row, 1));
    setOutputCell(bridgeSheet.getCell(row, 2));
  });
  bridgeSheet.getCell('A8').font = { bold: true };
  bridgeSheet.getCell('B8').font = { bold: true };
  styleGrid(bridgeSheet, 3, 8, 1, 2);

  const checksSheet = workbook.addWorksheet('Checks');
  applyWorksheetChrome(checksSheet, { tabColor: 'FFB45309' });
  checksSheet.views = [{ state: 'frozen', ySplit: 3 }];
  checksSheet.getColumn(1).width = 34;
  checksSheet.getColumn(2).width = 18;
  checksSheet.getColumn(3).width = 12;
  addSheetTitle(checksSheet, 'Checks', 3, 'Use this tab to confirm the discounting logic and value-per-share output remain valid.');
  checksSheet.getCell('A3').value = 'Check';
  checksSheet.getCell('B3').value = 'Value';
  checksSheet.getCell('C3').value = 'Status';
  styleHeaderRow(checksSheet, 3, 1, 3);
  checksSheet.getCell('A4').value = 'WACC > terminal g';
  checksSheet.getCell('B4').value = output.effectiveWacc - input.terminal_g;
  checksSheet.getCell('C4').value = output.effectiveWacc > input.terminal_g ? 'PASS' : 'FAIL';
  checksSheet.getCell('A5').value = 'Value/share finite';
  checksSheet.getCell('B5').value = Number.isFinite(output.valuePerShare) ? output.valuePerShare : 0;
  checksSheet.getCell('C5').value = Number.isFinite(output.valuePerShare) ? 'PASS' : 'FAIL';
  setPercent(checksSheet.getCell('B4'));
  setCurrency(checksSheet.getCell('B5'));
  for (let row = 4; row <= 5; row += 1) {
    setOutputCell(checksSheet.getCell(row, 1));
    setOutputCell(checksSheet.getCell(row, 2));
    setOutputCell(checksSheet.getCell(row, 3));
  }
  styleGrid(checksSheet, 3, 5, 1, 3);

  await Promise.all(workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)));

  return workbook;
}

export const dcfValuationModel: ModelDef<DcfValuationInput, DcfValuationOutput> = {
  slug: 'dcf-valuation',
  name: 'DCF Valuation Model',
  category: 'Corporate Finance',
  description: 'Forecast FCFF, discount cash flows, and value the business with terminal and sensitivity analysis.',
  inputSchema: DcfValuationInputSchema,
  uiSchema: dcfValuationUiSchema,
  compute: computeDcfValuation,
  buildWorkbook: buildDcfValuationWorkbook,
  filename: () => 'CapitalBase_DCF_Valuation.xlsx',
};
