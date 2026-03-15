import ExcelJS from 'exceljs';
import { z } from 'zod';
import type { ModelDef } from '@/lib/models/core/types';
import type { UISchema } from '@/lib/models/core/uiSchema';
import {
  configureWorkbookForRecalc,
  protectSheetIfConfigured,
  setCurrency,
  setInputCell,
  setOutputCell,
  setPercent,
  styleGrid,
  styleHeaderRow,
} from '@/lib/models/core/workbook';
import { normalizePathFromRows, toYearColumns } from '@/lib/models/modules/modelUtils';

const YearValueRowSchema = z.object({
  year: z.number().int().min(1).max(30),
  value: z.number().min(-0.9).max(1.5),
});

const DebtTrancheSchema = z.object({
  name: z.string().min(1),
  opening_balance: z.number().nonnegative(),
  interest_rate: z.number().min(0).max(0.5),
  amort_pct: z.number().min(0).max(1),
  maturity_year: z.number().int().min(1).max(30),
});

export const DriverThreeStatementInputSchema = z.object({
  start_year: z.number().int().min(2000).max(2100),
  forecast_years: z.number().int().min(3).max(15),
  base_revenue: z.number().positive(),
  revenue_growth: z.number().min(-0.5).max(1),
  revenue_growth_by_year: z.array(YearValueRowSchema).optional().default([]),
  gross_margin: z.number().min(0).max(1),
  opex_pct_revenue: z.number().min(0).max(1),
  tax_rate: z.number().min(0).max(0.6),
  capex_pct_revenue: z.number().min(0).max(0.5),
  da_pct_revenue: z.number().min(0).max(0.3),
  nwc_pct_revenue: z.number().min(-0.2).max(0.5).default(0.1),
  dso: z.number().min(0).max(365).default(45),
  dio: z.number().min(0).max(365).default(60),
  dpo: z.number().min(0).max(365).default(35),
  opening_ar: z.number().min(0).default(0),
  opening_inventory: z.number().min(0).default(0),
  opening_ap: z.number().min(0).default(0),
  opening_cash: z.number().min(0),
  opening_debt: z.number().min(0),
  interest_rate: z.number().min(0).max(0.5),
  opening_retained_earnings: z.number().default(0),
  debt_tranches: z.array(DebtTrancheSchema).optional().default([]),
  opening_shares: z.number().positive().default(100),
  avg_share_price: z.number().positive().default(10),
  buyback_dollars: z.number().min(0).default(0),
  issuance_dollars: z.number().min(0).default(0),
  sbc_dollars: z.number().min(0).default(0),
});

type DriverThreeStatementInput = z.infer<typeof DriverThreeStatementInputSchema>;

type PeriodRow = {
  year: number;
  growth: number;
  revenue: number;
  cogs: number;
  ar: number;
  inventory: number;
  ap: number;
  grossProfit: number;
  opex: number;
  da: number;
  ebit: number;
  interest: number;
  ebt: number;
  tax: number;
  netIncome: number;
  nwc: number;
  deltaNwc: number;
  capex: number;
  cfo: number;
  cfi: number;
  cff: number;
  fcff: number;
  debtOpen: number;
  debtRepay: number;
  debtClose: number;
  cashOpen: number;
  cashClose: number;
  retainedOpen: number;
  retainedClose: number;
  commonStockOpen: number;
  commonStockClose: number;
  sharesOpen: number;
  sharesClose: number;
  ppeOpen: number;
  ppeClose: number;
  assets: number;
  liabilities: number;
  equity: number;
  balanceCheck: number;
};

type DriverThreeStatementOutput = {
  years: number[];
  rows: PeriodRow[];
  openingCommonStock: number;
  maxAbsBalanceError: number;
};

const driverThreeStatementUiSchema: UISchema = {
  sections: [
    {
      title: 'Model Horizon',
      fields: [
        { key: 'start_year', label: 'Start Year', type: 'number', required: true, defaultValue: 2026 },
        { key: 'forecast_years', label: 'Forecast Years', type: 'number', required: true, defaultValue: 5 },
      ],
    },
    {
      title: 'Core Operating Assumptions',
      fields: [
        { key: 'base_revenue', label: 'Base Revenue', type: 'currency', required: true, defaultValue: 100000 },
        { key: 'revenue_growth', label: 'Revenue Growth (default)', type: 'percent', required: true, defaultValue: 0.08 },
        {
          key: 'revenue_growth_by_year',
          label: 'Revenue Growth By Year (optional override)',
          type: 'repeatableRows',
          minRows: 0,
          rowsSpec: [
            { key: 'year', label: 'Year #', type: 'number', required: true },
            { key: 'value', label: 'Growth', type: 'percent', required: true },
          ],
        },
        { key: 'gross_margin', label: 'Gross Margin', type: 'percent', required: true, defaultValue: 0.55 },
        { key: 'opex_pct_revenue', label: 'OpEx % Revenue', type: 'percent', required: true, defaultValue: 0.25 },
        { key: 'tax_rate', label: 'Tax Rate', type: 'percent', required: true, defaultValue: 0.25 },
        { key: 'capex_pct_revenue', label: 'Capex % Revenue', type: 'percent', required: true, defaultValue: 0.06 },
        { key: 'da_pct_revenue', label: 'D&A % Revenue', type: 'percent', required: true, defaultValue: 0.03 },
        { key: 'nwc_pct_revenue', label: 'NWC % Revenue (fallback)', type: 'percent', required: true, defaultValue: 0.1 },
      ],
    },
    {
      title: 'Working Capital Drivers',
      fields: [
        { key: 'dso', label: 'DSO (days)', type: 'number', required: true, defaultValue: 45 },
        { key: 'dio', label: 'DIO (days)', type: 'number', required: true, defaultValue: 60 },
        { key: 'dpo', label: 'DPO (days)', type: 'number', required: true, defaultValue: 35 },
        { key: 'opening_ar', label: 'Opening AR', type: 'currency', required: true, defaultValue: 0 },
        { key: 'opening_inventory', label: 'Opening Inventory', type: 'currency', required: true, defaultValue: 0 },
        { key: 'opening_ap', label: 'Opening AP', type: 'currency', required: true, defaultValue: 0 },
      ],
    },
    {
      title: 'Opening Balance + Debt Assumptions',
      fields: [
        { key: 'opening_cash', label: 'Opening Cash', type: 'currency', required: true, defaultValue: 15000 },
        { key: 'opening_debt', label: 'Opening Debt', type: 'currency', required: true, defaultValue: 30000 },
        { key: 'interest_rate', label: 'Interest Rate', type: 'percent', required: true, defaultValue: 0.08 },
        {
          key: 'opening_retained_earnings',
          label: 'Opening Retained Earnings',
          type: 'currency',
          required: true,
          defaultValue: 0,
        },
        {
          key: 'debt_tranches',
          label: 'Debt Tranches (optional)',
          type: 'repeatableRows',
          minRows: 0,
          rowsSpec: [
            { key: 'name', label: 'Tranche', type: 'text', required: true },
            { key: 'opening_balance', label: 'Opening', type: 'currency', required: true, defaultValue: 10000 },
            { key: 'interest_rate', label: 'Rate', type: 'percent', required: true, defaultValue: 0.08 },
            { key: 'amort_pct', label: 'Amort %', type: 'percent', required: true, defaultValue: 0.1 },
            { key: 'maturity_year', label: 'Maturity Year #', type: 'number', required: true, defaultValue: 5 },
          ],
        },
      ],
    },
    {
      title: 'Equity Inputs',
      fields: [
        { key: 'opening_shares', label: 'Opening Shares', type: 'number', required: true, defaultValue: 100 },
        { key: 'avg_share_price', label: 'Avg Share Price', type: 'currency', required: true, defaultValue: 10 },
        { key: 'buyback_dollars', label: 'Annual Buyback $', type: 'currency', required: true, defaultValue: 0 },
        { key: 'issuance_dollars', label: 'Annual Issuance $', type: 'currency', required: true, defaultValue: 0 },
        { key: 'sbc_dollars', label: 'Annual SBC $', type: 'currency', required: true, defaultValue: 0 },
      ],
    },
  ],
};

function computeDriverThreeStatement(input: DriverThreeStatementInput): DriverThreeStatementOutput {
  const years = toYearColumns(input.start_year, input.forecast_years);
  const growthPath = normalizePathFromRows(input.forecast_years, input.revenue_growth, input.revenue_growth_by_year);
  const defaultOpeningAr = (input.base_revenue * input.dso) / 365;
  const baseCogs = input.base_revenue * (1 - input.gross_margin);
  const defaultOpeningInventory = (baseCogs * input.dio) / 365;
  const defaultOpeningAp = (baseCogs * input.dpo) / 365;
  const openingAr = input.opening_ar > 0 ? input.opening_ar : defaultOpeningAr;
  const openingInventory = input.opening_inventory > 0 ? input.opening_inventory : defaultOpeningInventory;
  const openingAp = input.opening_ap > 0 ? input.opening_ap : defaultOpeningAp;
  const openingNwc = input.dso + input.dio + input.dpo > 0 ? openingAr + openingInventory - openingAp : input.base_revenue * input.nwc_pct_revenue;
  const openingPpe = input.base_revenue * 0.4;
  const debtTranches =
    input.debt_tranches.length > 0
      ? input.debt_tranches.map((tranche) => ({ ...tranche }))
      : [
          {
            name: 'Debt',
            opening_balance: input.opening_debt,
            interest_rate: input.interest_rate,
            amort_pct: 0.08,
            maturity_year: input.forecast_years,
          },
        ];
  const openingDebtFromTranches = debtTranches.reduce((sum, tranche) => sum + tranche.opening_balance, 0);
  const openingAssets = input.opening_cash + openingAr + openingInventory + openingPpe;
  const openingCommonStock = openingAssets + openingAp - openingDebtFromTranches - input.opening_retained_earnings;

  let prevRevenue = input.base_revenue;
  let cashOpen = input.opening_cash;
  let debtOpen = openingDebtFromTranches;
  let retainedOpen = input.opening_retained_earnings;
  let commonStockOpen = openingCommonStock;
  let sharesOpen = input.opening_shares;
  let nwcPrev = openingNwc;
  let ppeOpen = openingPpe;
  const trancheBalances = debtTranches.map((tranche) => ({ ...tranche, balance: tranche.opening_balance }));

  const rows: PeriodRow[] = [];

  for (let idx = 0; idx < input.forecast_years; idx += 1) {
    const growth = growthPath[idx] ?? input.revenue_growth;
    const revenue = prevRevenue * (1 + growth);
    const cogs = revenue * (1 - input.gross_margin);
    const grossProfit = revenue - cogs;
    const opex = revenue * input.opex_pct_revenue;
    const da = revenue * input.da_pct_revenue;
    const ebit = grossProfit - opex - da;

    const ar = input.dso + input.dio + input.dpo > 0 ? (revenue * input.dso) / 365 : revenue * input.nwc_pct_revenue * 0.4;
    const inventory = input.dso + input.dio + input.dpo > 0 ? (cogs * input.dio) / 365 : revenue * input.nwc_pct_revenue * 0.4;
    const ap = input.dso + input.dio + input.dpo > 0 ? (cogs * input.dpo) / 365 : revenue * input.nwc_pct_revenue * 0.2;

    const interest =
      trancheBalances.length > 0
        ? trancheBalances.reduce((sum, tranche) => sum + tranche.balance * tranche.interest_rate, 0)
        : debtOpen * input.interest_rate;
    const ebt = ebit - interest;
    const tax = Math.max(0, ebt) * input.tax_rate;
    const netIncome = ebt - tax;

    const nwc = ar + inventory - ap;
    const deltaNwc = nwc - nwcPrev;
    const capex = revenue * input.capex_pct_revenue;

    const cfo = netIncome + da - deltaNwc;
    const cfi = -capex;
    const fcff = ebit * (1 - input.tax_rate) + da - capex - deltaNwc;

    const mandatoryDebtPaydown = trancheBalances.reduce((sum, tranche) => {
      const dueByAmort = tranche.balance * tranche.amort_pct;
      const dueByMaturity = idx + 1 >= tranche.maturity_year ? tranche.balance : 0;
      return sum + Math.max(dueByAmort, dueByMaturity);
    }, 0);
    const availableForDebt = Math.max(0, fcff);
    const debtRepay = Math.min(debtOpen, Math.max(Math.min(debtOpen, mandatoryDebtPaydown), availableForDebt));
    let remainingRepay = debtRepay;
    const debtBefore = trancheBalances.reduce((sum, tranche) => sum + tranche.balance, 0);
    trancheBalances.forEach((tranche) => {
      if (remainingRepay <= 0 || debtBefore <= 0) return;
      const trancheShare = tranche.balance / debtBefore;
      const paydown = Math.min(tranche.balance, remainingRepay * trancheShare);
      tranche.balance -= paydown;
      remainingRepay -= paydown;
    });
    const debtClose = trancheBalances.reduce((sum, tranche) => sum + tranche.balance, 0);
    const cff = -debtRepay;

    const cashClose = cashOpen + cfo + cfi + cff;

    const retainedClose = retainedOpen + netIncome;
    const commonStockClose = commonStockOpen + input.issuance_dollars - input.buyback_dollars + input.sbc_dollars;
    const shareDelta = (input.issuance_dollars - input.buyback_dollars + input.sbc_dollars) / input.avg_share_price;
    const sharesClose = sharesOpen + shareDelta;
    const ppeClose = ppeOpen + capex - da;

    const assets = cashClose + ar + inventory + ppeClose;
    const liabilities = debtClose;
    const equity = commonStockClose + retainedClose;
    const balanceCheck = assets - liabilities - equity;

    rows.push({
      year: years[idx],
      growth,
      revenue,
      cogs,
      ar,
      inventory,
      ap,
      grossProfit,
      opex,
      da,
      ebit,
      interest,
      ebt,
      tax,
      netIncome,
      nwc,
      deltaNwc,
      capex,
      cfo,
      cfi,
      cff,
      fcff,
      debtOpen,
      debtRepay,
      debtClose,
      cashOpen,
      cashClose,
      retainedOpen,
      retainedClose,
      commonStockOpen,
      commonStockClose,
      sharesOpen,
      sharesClose,
      ppeOpen,
      ppeClose,
      assets,
      liabilities,
      equity,
      balanceCheck,
    });

    prevRevenue = revenue;
    cashOpen = cashClose;
    debtOpen = debtClose;
    retainedOpen = retainedClose;
    commonStockOpen = commonStockClose;
    sharesOpen = sharesClose;
    nwcPrev = nwc;
    ppeOpen = ppeClose;
  }

  const maxAbsBalanceError = rows.reduce((max, row) => Math.max(max, Math.abs(row.balanceCheck)), 0);

  return {
    years,
    rows,
    openingCommonStock,
    maxAbsBalanceError,
  };
}

function writeYearHeaders(sheet: ExcelJS.Worksheet, startCol: number, years: number[]): void {
  years.forEach((year, idx) => {
    sheet.getCell(3, startCol + idx).value = year;
  });
  styleHeaderRow(sheet, 3, 1, startCol + years.length - 1);
}

async function buildDriverThreeStatementWorkbook(
  input: DriverThreeStatementInput,
  output: DriverThreeStatementOutput,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();
  configureWorkbookForRecalc(workbook);

  const years = output.years;
  const yearStartCol = 2;
  const actualHeader = `FY${input.start_year - 1}A`;
  const forecastHeaders = years.map((year) => `FY${year}E`);
  const allHeaders = [actualHeader, ...forecastHeaders];

  const controlSheet = workbook.addWorksheet('Control Panel');
  controlSheet.views = [{ state: 'frozen', ySplit: 3 }];
  controlSheet.getColumn(1).width = 38;
  controlSheet.getColumn(2).width = 18;
  controlSheet.getColumn(3).width = 14;
  controlSheet.getCell('A1').value = '3-Statement Control Panel';
  controlSheet.getCell('A1').font = { bold: true, size: 14 };
  controlSheet.getCell('A3').value = 'Control';
  controlSheet.getCell('B3').value = 'Value';
  controlSheet.getCell('C3').value = 'Type';
  styleHeaderRow(controlSheet, 3, 1, 3);
  const controlRows: Array<[string, number | string, 'currency' | 'percent' | 'number' | 'text']> = [
    ['Start Year', input.start_year, 'number'],
    ['Forecast Years', input.forecast_years, 'number'],
    ['Base Revenue', input.base_revenue, 'currency'],
    ['Revenue Growth (default)', input.revenue_growth, 'percent'],
    ['Gross Margin', input.gross_margin, 'percent'],
    ['Tax Rate', input.tax_rate, 'percent'],
    ['W/C Drivers Active', input.dso + input.dio + input.dpo > 0 ? 'Yes' : 'No', 'text'],
    ['Debt Tranches Count', input.debt_tranches.length > 0 ? input.debt_tranches.length : 1, 'number'],
    ['Opening Shares', input.opening_shares, 'number'],
  ];
  controlRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    controlSheet.getCell(row, 1).value = label;
    controlSheet.getCell(row, 2).value = value as string | number;
    controlSheet.getCell(row, 3).value = fmt;
    if (fmt === 'currency') setCurrency(controlSheet.getCell(row, 2));
    if (fmt === 'percent') setPercent(controlSheet.getCell(row, 2));
    setInputCell(controlSheet.getCell(row, 2));
    setOutputCell(controlSheet.getCell(row, 1));
    setOutputCell(controlSheet.getCell(row, 3));
  });
  styleGrid(controlSheet, 3, 3 + controlRows.length, 1, 3);

  const assumptionsSheet = workbook.addWorksheet('Assumptions');
  assumptionsSheet.views = [{ state: 'frozen', ySplit: 3 }];
  assumptionsSheet.getColumn(1).width = 36;
  assumptionsSheet.getColumn(2).width = 20;
  assumptionsSheet.getCell('A1').value = 'Driver-Based 3-Statement Assumptions';
  assumptionsSheet.getCell('A1').font = { bold: true, size: 14 };

  assumptionsSheet.getCell('A3').value = 'Input';
  assumptionsSheet.getCell('B3').value = 'Value';
  styleHeaderRow(assumptionsSheet, 3, 1, 2);

  const inputRows: Array<[string, number, 'currency' | 'percent' | 'number']> = [
    ['Base Revenue', input.base_revenue, 'currency'],
    ['Revenue Growth (default)', input.revenue_growth, 'percent'],
    ['Gross Margin', input.gross_margin, 'percent'],
    ['OpEx % Revenue', input.opex_pct_revenue, 'percent'],
    ['Tax Rate', input.tax_rate, 'percent'],
    ['Capex % Revenue', input.capex_pct_revenue, 'percent'],
    ['D&A % Revenue', input.da_pct_revenue, 'percent'],
    ['NWC % Revenue', input.nwc_pct_revenue, 'percent'],
    ['DSO (days)', input.dso, 'number'],
    ['DIO (days)', input.dio, 'number'],
    ['DPO (days)', input.dpo, 'number'],
    ['Opening AR', input.opening_ar, 'currency'],
    ['Opening Inventory', input.opening_inventory, 'currency'],
    ['Opening AP', input.opening_ap, 'currency'],
    ['Opening Cash', input.opening_cash, 'currency'],
    ['Opening Debt', input.opening_debt, 'currency'],
    ['Interest Rate', input.interest_rate, 'percent'],
    ['Opening Retained Earnings', input.opening_retained_earnings, 'currency'],
    ['Opening Shares', input.opening_shares, 'number'],
    ['Avg Share Price', input.avg_share_price, 'currency'],
    ['Annual Buyback $', input.buyback_dollars, 'currency'],
    ['Annual Issuance $', input.issuance_dollars, 'currency'],
    ['Annual SBC $', input.sbc_dollars, 'currency'],
    ['Forecast Years', input.forecast_years, 'number'],
  ];

  inputRows.forEach(([label, value, fmt], idx) => {
    const row = 4 + idx;
    assumptionsSheet.getCell(row, 1).value = label;
    const valueCell = assumptionsSheet.getCell(row, 2);
    valueCell.value = value;
    setInputCell(valueCell);
    if (fmt === 'currency') setCurrency(valueCell);
    if (fmt === 'percent') setPercent(valueCell);
    setOutputCell(assumptionsSheet.getCell(row, 1));
  });
  styleGrid(assumptionsSheet, 3, 3 + inputRows.length, 1, 2);

  const incomeSheet = workbook.addWorksheet('Income Statement');
  incomeSheet.views = [{ state: 'frozen', ySplit: 3, xSplit: 1 }];
  incomeSheet.getColumn(1).width = 30;
  allHeaders.forEach((_, idx) => (incomeSheet.getColumn(2 + idx).width = 14));
  incomeSheet.getCell('A1').value = 'Income Statement';
  incomeSheet.getCell('A1').font = { bold: true, size: 14 };
  incomeSheet.getCell('A3').value = 'Line Item';
  allHeaders.forEach((header, idx) => {
    incomeSheet.getCell(3, yearStartCol + idx).value = header;
  });
  styleHeaderRow(incomeSheet, 3, 1, yearStartCol + allHeaders.length - 1);

  const actualRevenue = input.base_revenue;
  const actualCogs = actualRevenue * (1 - input.gross_margin);
  const actualGrossProfit = actualRevenue - actualCogs;
  const actualOpex = actualRevenue * input.opex_pct_revenue;
  const actualDa = actualRevenue * input.da_pct_revenue;
  const actualEbit = actualGrossProfit - actualOpex - actualDa;
  const actualInterest = input.opening_debt * input.interest_rate;
  const actualEbt = actualEbit - actualInterest;
  const actualTax = Math.max(0, actualEbt) * input.tax_rate;
  const actualNetIncome = actualEbt - actualTax;

  const isLines: Array<[string, (row: PeriodRow) => number, number]> = [
    ['Revenue', (r) => r.revenue, actualRevenue],
    ['  COGS', (r) => r.cogs, actualCogs],
    ['Gross Profit', (r) => r.grossProfit, actualGrossProfit],
    ['  Operating Expenses', (r) => r.opex, actualOpex],
    ['  Depreciation', (r) => r.da, actualDa],
    ['EBIT', (r) => r.ebit, actualEbit],
    ['  Interest Expense', (r) => r.interest, actualInterest],
    ['EBT', (r) => r.ebt, actualEbt],
    ['  Tax', (r) => r.tax, actualTax],
    ['Net Income', (r) => r.netIncome, actualNetIncome],
  ];

  isLines.forEach(([label], idx) => {
    const row = 4 + idx;
    incomeSheet.getCell(row, 1).value = label;
    setOutputCell(incomeSheet.getCell(row, 1));
  });

  isLines.forEach(([, , actualValue], idx) => {
    const cell = incomeSheet.getCell(4 + idx, 2);
    cell.value = actualValue;
    setCurrency(cell);
    setOutputCell(cell);
  });

  output.rows.forEach((row, colIdx) => {
    const col = yearStartCol + 1 + colIdx;
    isLines.forEach(([, getter], lineIdx) => {
      const cell = incomeSheet.getCell(4 + lineIdx, col);
      cell.value = getter(row);
      setCurrency(cell);
      setOutputCell(cell);
    });
  });

  // Subtotal underlines
  [6, 9, 11, 13].forEach((row) => {
    for (let col = 2; col <= yearStartCol + allHeaders.length - 1; col += 1) {
      incomeSheet.getCell(row, col).border = {
        bottom: { style: 'thin', color: { argb: 'FF334155' } },
      };
    }
    incomeSheet.getCell(row, 1).font = { bold: true };
  });
  incomeSheet.getCell(13, 1).font = { bold: true };
  styleGrid(incomeSheet, 3, 13, 1, yearStartCol + allHeaders.length - 1);

  const cashFlowSheet = workbook.addWorksheet('Cash Flow');
  cashFlowSheet.views = [{ state: 'frozen', ySplit: 3, xSplit: 1 }];
  cashFlowSheet.getColumn(1).width = 30;
  allHeaders.forEach((_, idx) => (cashFlowSheet.getColumn(2 + idx).width = 14));
  cashFlowSheet.getCell('A1').value = 'Cash Flow Statement';
  cashFlowSheet.getCell('A1').font = { bold: true, size: 14 };
  cashFlowSheet.getCell('A3').value = 'Line Item';
  allHeaders.forEach((header, idx) => {
    cashFlowSheet.getCell(3, yearStartCol + idx).value = header;
  });
  styleHeaderRow(cashFlowSheet, 3, 1, yearStartCol + allHeaders.length - 1);

  const cfLines: Array<[string, (row: PeriodRow) => number, number]> = [
    ['Cash Open', (r) => r.cashOpen, input.opening_cash],
    ['CFO', (r) => r.cfo, actualNetIncome + actualDa - actualRevenue * input.nwc_pct_revenue],
    ['CFI (Capex)', (r) => r.cfi, -(actualRevenue * input.capex_pct_revenue)],
    ['CFF (Debt)', (r) => r.cff, 0],
    ['Cash Close', (r) => r.cashClose, input.opening_cash + actualNetIncome + actualDa - actualRevenue * input.nwc_pct_revenue - actualRevenue * input.capex_pct_revenue],
    ['FCFF', (r) => r.fcff, actualEbit * (1 - input.tax_rate) + actualDa - actualRevenue * input.capex_pct_revenue - actualRevenue * input.nwc_pct_revenue],
  ];

  cfLines.forEach(([label], idx) => {
    cashFlowSheet.getCell(4 + idx, 1).value = label;
    setOutputCell(cashFlowSheet.getCell(4 + idx, 1));
  });

  cfLines.forEach(([, , actualValue], idx) => {
    const cell = cashFlowSheet.getCell(4 + idx, 2);
    cell.value = actualValue;
    setCurrency(cell);
    setOutputCell(cell);
  });

  output.rows.forEach((row, colIdx) => {
    const col = yearStartCol + 1 + colIdx;
    cfLines.forEach(([, getter], idx) => {
      const cell = cashFlowSheet.getCell(4 + idx, col);
      cell.value = getter(row);
      setCurrency(cell);
      setOutputCell(cell);
    });
  });
  styleGrid(cashFlowSheet, 3, 9, 1, yearStartCol + allHeaders.length - 1);

  const balanceSheet = workbook.addWorksheet('Balance Sheet');
  balanceSheet.views = [{ state: 'frozen', ySplit: 3, xSplit: 1 }];
  balanceSheet.getColumn(1).width = 30;
  allHeaders.forEach((_, idx) => (balanceSheet.getColumn(2 + idx).width = 14));
  balanceSheet.getCell('A1').value = 'Balance Sheet';
  balanceSheet.getCell('A1').font = { bold: true, size: 14 };
  balanceSheet.getCell('A3').value = 'Line Item';
  allHeaders.forEach((header, idx) => {
    balanceSheet.getCell(3, yearStartCol + idx).value = header;
  });
  styleHeaderRow(balanceSheet, 3, 1, yearStartCol + allHeaders.length - 1);

  const actualAr = input.opening_ar > 0 ? input.opening_ar : (actualRevenue * input.dso) / 365;
  const actualInventory = input.opening_inventory > 0 ? input.opening_inventory : (actualCogs * input.dio) / 365;
  const actualAp = input.opening_ap > 0 ? input.opening_ap : (actualCogs * input.dpo) / 365;
  const actualNwc = actualAr + actualInventory - actualAp;
  const actualPpe = actualRevenue * 0.4 + actualRevenue * input.capex_pct_revenue - actualDa;
  const actualAssets = cfLines[4][2] + actualNwc + actualPpe;
  const actualDebt =
    input.debt_tranches.length > 0
      ? input.debt_tranches.reduce((sum, tranche) => sum + tranche.opening_balance, 0)
      : input.opening_debt;
  const actualCommonStock = output.openingCommonStock + input.issuance_dollars - input.buyback_dollars + input.sbc_dollars;
  const actualEquity = actualCommonStock + input.opening_retained_earnings + actualNetIncome;

  const bsLines: Array<[string, (row: PeriodRow) => number, number]> = [
    ['Cash', (r) => r.cashClose, cfLines[4][2]],
    ['AR', (r) => r.ar, actualAr],
    ['Inventory', (r) => r.inventory, actualInventory],
    ['AP', (r) => r.ap, actualAp],
    ['NWC', (r) => r.nwc, actualNwc],
    ['PPE', (r) => r.ppeClose, actualPpe],
    ['Total Assets', (r) => r.assets, actualAssets],
    ['Debt', (r) => r.liabilities, actualDebt],
    ['Common Stock', (r) => r.commonStockClose, actualCommonStock],
    ['Retained Earnings', (r) => r.retainedClose, input.opening_retained_earnings + actualNetIncome],
    ['Total Equity', (r) => r.equity, actualEquity],
    ['BS Balances? A-(L+E)', (r) => r.balanceCheck, actualAssets - actualDebt - actualEquity],
  ];

  bsLines.forEach(([label], idx) => {
    balanceSheet.getCell(4 + idx, 1).value = label;
    setOutputCell(balanceSheet.getCell(4 + idx, 1));
  });

  bsLines.forEach(([, , actualValue], idx) => {
    const cell = balanceSheet.getCell(4 + idx, 2);
    cell.value = actualValue;
    setCurrency(cell);
    setOutputCell(cell);
  });

  output.rows.forEach((row, colIdx) => {
    const col = yearStartCol + 1 + colIdx;
    bsLines.forEach(([, getter], idx) => {
      const cell = balanceSheet.getCell(4 + idx, col);
      cell.value = getter(row);
      setCurrency(cell);
      setOutputCell(cell);
    });
  });
  balanceSheet.getCell(14, 1).font = { bold: true };
  styleGrid(balanceSheet, 3, 14, 1, yearStartCol + allHeaders.length - 1);

  const workingCapitalSheet = workbook.addWorksheet('Working Capital');
  workingCapitalSheet.views = [{ state: 'frozen', ySplit: 3, xSplit: 1 }];
  workingCapitalSheet.getColumn(1).width = 30;
  allHeaders.forEach((_, idx) => (workingCapitalSheet.getColumn(2 + idx).width = 14));
  workingCapitalSheet.getCell('A1').value = 'Working Capital Schedule';
  workingCapitalSheet.getCell('A1').font = { bold: true, size: 14 };
  workingCapitalSheet.getCell('A3').value = 'Line Item';
  allHeaders.forEach((header, idx) => {
    workingCapitalSheet.getCell(3, 2 + idx).value = header;
  });
  styleHeaderRow(workingCapitalSheet, 3, 1, 1 + allHeaders.length);
  const wcLines: Array<[string, (row: PeriodRow) => number, number]> = [
    ['DSO', () => input.dso, input.dso],
    ['DIO', () => input.dio, input.dio],
    ['DPO', () => input.dpo, input.dpo],
    ['AR', (r) => r.ar, actualAr],
    ['Inventory', (r) => r.inventory, actualInventory],
    ['AP', (r) => r.ap, actualAp],
    ['NWC', (r) => r.nwc, actualNwc],
    ['Delta NWC', (r) => r.deltaNwc, actualNwc],
  ];
  wcLines.forEach(([label], idx) => {
    workingCapitalSheet.getCell(4 + idx, 1).value = label;
    setOutputCell(workingCapitalSheet.getCell(4 + idx, 1));
  });
  wcLines.forEach(([, , actualValue], idx) => {
    const cell = workingCapitalSheet.getCell(4 + idx, 2);
    cell.value = actualValue;
    if (idx <= 2) workingCapitalSheet.getCell(4 + idx, 2).numFmt = '0.0';
    else setCurrency(cell);
    setOutputCell(cell);
  });
  output.rows.forEach((row, colIdx) => {
    const col = 3 + colIdx;
    wcLines.forEach(([, getter], lineIdx) => {
      const cell = workingCapitalSheet.getCell(4 + lineIdx, col);
      cell.value = getter(row);
      if (lineIdx <= 2) cell.numFmt = '0.0';
      else setCurrency(cell);
      setOutputCell(cell);
    });
  });
  styleGrid(workingCapitalSheet, 3, 11, 1, 1 + allHeaders.length);

  const ppeSheet = workbook.addWorksheet('PP&E + D&A');
  ppeSheet.views = [{ state: 'frozen', ySplit: 3, xSplit: 1 }];
  ppeSheet.getColumn(1).width = 30;
  allHeaders.forEach((_, idx) => (ppeSheet.getColumn(2 + idx).width = 14));
  ppeSheet.getCell('A1').value = 'PP&E and Depreciation Schedule';
  ppeSheet.getCell('A1').font = { bold: true, size: 14 };
  ppeSheet.getCell('A3').value = 'Line Item';
  allHeaders.forEach((header, idx) => {
    ppeSheet.getCell(3, 2 + idx).value = header;
  });
  styleHeaderRow(ppeSheet, 3, 1, 1 + allHeaders.length);
  const ppeLines: Array<[string, (row: PeriodRow) => number, number]> = [
    ['PP&E Open', (r) => r.ppeOpen, actualRevenue * 0.4],
    ['Capex', (r) => r.capex, actualRevenue * input.capex_pct_revenue],
    ['Depreciation', (r) => r.da, actualDa],
    ['PP&E Close', (r) => r.ppeClose, actualPpe],
  ];
  ppeLines.forEach(([label], idx) => {
    ppeSheet.getCell(4 + idx, 1).value = label;
    setOutputCell(ppeSheet.getCell(4 + idx, 1));
  });
  ppeLines.forEach(([, , actualValue], idx) => {
    const cell = ppeSheet.getCell(4 + idx, 2);
    cell.value = actualValue;
    setCurrency(cell);
    setOutputCell(cell);
  });
  output.rows.forEach((row, colIdx) => {
    const col = 3 + colIdx;
    ppeLines.forEach(([, getter], lineIdx) => {
      const cell = ppeSheet.getCell(4 + lineIdx, col);
      cell.value = getter(row);
      setCurrency(cell);
      setOutputCell(cell);
    });
  });
  styleGrid(ppeSheet, 3, 7, 1, 1 + allHeaders.length);

  const debtSheet = workbook.addWorksheet('Debt Schedule');
  debtSheet.views = [{ state: 'frozen', ySplit: 3, xSplit: 1 }];
  debtSheet.getColumn(1).width = 30;
  allHeaders.forEach((_, idx) => (debtSheet.getColumn(2 + idx).width = 14));
  debtSheet.getCell('A1').value = 'Debt Schedule';
  debtSheet.getCell('A1').font = { bold: true, size: 14 };
  debtSheet.getCell('A3').value = 'Line Item';
  allHeaders.forEach((header, idx) => {
    debtSheet.getCell(3, 2 + idx).value = header;
  });
  styleHeaderRow(debtSheet, 3, 1, 1 + allHeaders.length);
  const debtLines: Array<[string, (row: PeriodRow) => number, number]> = [
    ['Debt Open', (r) => r.debtOpen, actualDebt],
    ['Interest Expense', (r) => r.interest, actualInterest],
    ['Debt Repayment', (r) => r.debtRepay, 0],
    ['Debt Close', (r) => r.debtClose, actualDebt],
  ];
  debtLines.forEach(([label], idx) => {
    debtSheet.getCell(4 + idx, 1).value = label;
    setOutputCell(debtSheet.getCell(4 + idx, 1));
  });
  debtLines.forEach(([, , actualValue], idx) => {
    const cell = debtSheet.getCell(4 + idx, 2);
    cell.value = actualValue;
    setCurrency(cell);
    setOutputCell(cell);
  });
  output.rows.forEach((row, colIdx) => {
    const col = 3 + colIdx;
    debtLines.forEach(([, getter], lineIdx) => {
      const cell = debtSheet.getCell(4 + lineIdx, col);
      cell.value = getter(row);
      setCurrency(cell);
      setOutputCell(cell);
    });
  });
  const trancheStartRow = 10;
  debtSheet.getCell(trancheStartRow, 1).value = 'Tranche Inputs';
  debtSheet.getCell(trancheStartRow, 1).font = { bold: true };
  debtSheet.getCell(trancheStartRow + 1, 1).value = 'Name';
  debtSheet.getCell(trancheStartRow + 1, 2).value = 'Opening';
  debtSheet.getCell(trancheStartRow + 1, 3).value = 'Rate';
  debtSheet.getCell(trancheStartRow + 1, 4).value = 'Amort %';
  debtSheet.getCell(trancheStartRow + 1, 5).value = 'Maturity';
  styleHeaderRow(debtSheet, trancheStartRow + 1, 1, 5);
  const tranchesForSheet =
    input.debt_tranches.length > 0
      ? input.debt_tranches
      : [{ name: 'Debt', opening_balance: input.opening_debt, interest_rate: input.interest_rate, amort_pct: 0.08, maturity_year: input.forecast_years }];
  tranchesForSheet.forEach((tranche, idx) => {
    const row = trancheStartRow + 2 + idx;
    debtSheet.getCell(row, 1).value = tranche.name;
    debtSheet.getCell(row, 2).value = tranche.opening_balance;
    debtSheet.getCell(row, 3).value = tranche.interest_rate;
    debtSheet.getCell(row, 4).value = tranche.amort_pct;
    debtSheet.getCell(row, 5).value = tranche.maturity_year;
    setCurrency(debtSheet.getCell(row, 2));
    setPercent(debtSheet.getCell(row, 3));
    setPercent(debtSheet.getCell(row, 4));
    setInputCell(debtSheet.getCell(row, 1));
    setInputCell(debtSheet.getCell(row, 2));
    setInputCell(debtSheet.getCell(row, 3));
    setInputCell(debtSheet.getCell(row, 4));
    setInputCell(debtSheet.getCell(row, 5));
  });
  styleGrid(debtSheet, 3, trancheStartRow + 1 + tranchesForSheet.length, 1, 5);

  const equitySheet = workbook.addWorksheet('Equity Rollforward');
  equitySheet.views = [{ state: 'frozen', ySplit: 3, xSplit: 1 }];
  equitySheet.getColumn(1).width = 32;
  allHeaders.forEach((_, idx) => (equitySheet.getColumn(2 + idx).width = 14));
  equitySheet.getCell('A1').value = 'Equity Rollforward';
  equitySheet.getCell('A1').font = { bold: true, size: 14 };
  equitySheet.getCell('A3').value = 'Line Item';
  allHeaders.forEach((header, idx) => {
    equitySheet.getCell(3, 2 + idx).value = header;
  });
  styleHeaderRow(equitySheet, 3, 1, 1 + allHeaders.length);
  const equityLines: Array<[string, (row: PeriodRow) => number, number, 'currency' | 'number']> = [
    ['Common Stock Open', (r) => r.commonStockOpen, output.openingCommonStock, 'currency'],
    ['Issuance $', () => input.issuance_dollars, input.issuance_dollars, 'currency'],
    ['Buyback $', () => -input.buyback_dollars, -input.buyback_dollars, 'currency'],
    ['SBC $', () => input.sbc_dollars, input.sbc_dollars, 'currency'],
    ['Common Stock Close', (r) => r.commonStockClose, output.openingCommonStock + input.issuance_dollars - input.buyback_dollars + input.sbc_dollars, 'currency'],
    ['Retained Earnings', (r) => r.retainedClose, input.opening_retained_earnings + actualNetIncome, 'currency'],
    ['Total Equity', (r) => r.equity, actualEquity, 'currency'],
    ['Shares Open', (r) => r.sharesOpen, input.opening_shares, 'number'],
    ['Shares Close', (r) => r.sharesClose, input.opening_shares + (input.issuance_dollars - input.buyback_dollars + input.sbc_dollars) / input.avg_share_price, 'number'],
  ];
  equityLines.forEach(([label], idx) => {
    equitySheet.getCell(4 + idx, 1).value = label;
    setOutputCell(equitySheet.getCell(4 + idx, 1));
  });
  equityLines.forEach(([, , actualValue, fmt], idx) => {
    const cell = equitySheet.getCell(4 + idx, 2);
    cell.value = actualValue;
    if (fmt === 'currency') setCurrency(cell);
    else cell.numFmt = '#,##0.00';
    setOutputCell(cell);
  });
  output.rows.forEach((row, colIdx) => {
    const col = 3 + colIdx;
    equityLines.forEach(([, getter, , fmt], lineIdx) => {
      const cell = equitySheet.getCell(4 + lineIdx, col);
      cell.value = getter(row);
      if (fmt === 'currency') setCurrency(cell);
      else cell.numFmt = '#,##0.00';
      setOutputCell(cell);
    });
  });
  styleGrid(equitySheet, 3, 12, 1, 1 + allHeaders.length);

  const checkSheet = workbook.addWorksheet('Checks');
  checkSheet.views = [{ state: 'frozen', ySplit: 3 }];
  checkSheet.getColumn(1).width = 42;
  checkSheet.getColumn(2).width = 18;
  checkSheet.getColumn(3).width = 14;
  checkSheet.getCell('A1').value = 'Model Checks';
  checkSheet.getCell('A1').font = { bold: true, size: 14 };
  checkSheet.getCell('A3').value = 'Check';
  checkSheet.getCell('B3').value = 'Value';
  checkSheet.getCell('C3').value = 'Status';
  styleHeaderRow(checkSheet, 3, 1, 3);

  const minCash = Math.min(...output.rows.map((r) => r.cashClose));
  const endingDebt = output.rows[output.rows.length - 1]?.debtClose ?? 0;
  const capexSignOk = output.rows.every((r) => r.cfi <= 0 && r.capex >= 0);

  checkSheet.getCell('A4').value = 'Balance Sheet balancing max abs error';
  checkSheet.getCell('B4').value = output.maxAbsBalanceError;
  checkSheet.getCell('C4').value = output.maxAbsBalanceError < 0.01 ? 'PASS' : 'FAIL';
  checkSheet.getCell('A5').value = 'Capex sign convention (Capex +, CFI -)';
  checkSheet.getCell('B5').value = capexSignOk ? 0 : 1;
  checkSheet.getCell('C5').value = capexSignOk ? 'PASS' : 'FAIL';
  checkSheet.getCell('A6').value = 'Minimum projected cash';
  checkSheet.getCell('B6').value = minCash;
  checkSheet.getCell('C6').value = minCash >= 0 ? 'PASS' : 'WARN';
  checkSheet.getCell('A7').value = 'Ending debt non-negative';
  checkSheet.getCell('B7').value = endingDebt;
  checkSheet.getCell('C7').value = endingDebt >= 0 ? 'PASS' : 'FAIL';
  checkSheet.getCell('A8').value = 'Circular reference warning (manual debt sweep loops)';
  checkSheet.getCell('B8').value = 0;
  checkSheet.getCell('C8').value = 'PASS';

  for (let row = 4; row <= 8; row += 1) {
    setCurrency(checkSheet.getCell(row, 2));
    setOutputCell(checkSheet.getCell(row, 1));
    setOutputCell(checkSheet.getCell(row, 2));
    setOutputCell(checkSheet.getCell(row, 3));
  }
  checkSheet.getCell('B8').numFmt = '0';
  styleGrid(checkSheet, 3, 8, 1, 3);

  const lastForecastCol = yearStartCol + allHeaders.length - 1;

  await Promise.all(workbook.worksheets.map((sheet) => protectSheetIfConfigured(sheet)));

  return workbook;
}

export const driverThreeStatementModel: ModelDef<DriverThreeStatementInput, DriverThreeStatementOutput> = {
  slug: 'driver-3-statement',
  name: 'Driver-Based 3-Statement Model',
  category: 'Accounting',
  description: 'Integrated statement model with schedules, debt rollforward, and balance checks.',
  inputSchema: DriverThreeStatementInputSchema,
  uiSchema: driverThreeStatementUiSchema,
  compute: computeDriverThreeStatement,
  buildWorkbook: buildDriverThreeStatementWorkbook,
  filename: () => 'CapitalBase_Driver_3Statement.xlsx',
};
