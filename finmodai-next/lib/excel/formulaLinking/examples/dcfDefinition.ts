/**
 * Reference DCF Model Definition — Formula-Linking Standard
 *
 * Demonstrates how to define a complete DCF model using FormulaLinkedModelDef.
 * Every projection cell is a formula referencing named ranges.
 * The Equations tab is auto-generated from this definition.
 *
 * To build:
 *   const def = createDcfDefinition({ ...params });
 *   const builder = new FormulaLinkedBuilder(def);
 *   const workbook = await builder.build();
 */

import type { FormulaLinkedModelDef, InputSpec, LineItemSpec, CheckSpec } from '../types';

export interface DcfDefinitionParams {
  companyName: string;
  ticker: string;
  /** Historical year(s), e.g. [2024]. */
  actualYears?: number[];
  /** Projection years, e.g. [2025, 2026, 2027, 2028, 2029]. */
  forecastYears?: number[];
  /** Default input values (override any). */
  defaults?: Partial<{
    revenue: number;
    revenueGrowth: number;
    ebitdaMargin: number;
    daPercent: number;
    taxRate: number;
    capexPercent: number;
    nwcPercent: number;
    wacc: number;
    terminalGrowth: number;
    netDebt: number;
    sharesOutstanding: number;
    marketPrice: number;
  }>;
}

export function createDcfDefinition(params: DcfDefinitionParams): FormulaLinkedModelDef {
  const {
    companyName,
    ticker,
    actualYears = [2024],
    forecastYears = [2025, 2026, 2027, 2028, 2029],
    defaults = {},
  } = params;

  const d = {
    revenue: defaults.revenue ?? 1000,
    revenueGrowth: defaults.revenueGrowth ?? 0.08,
    ebitdaMargin: defaults.ebitdaMargin ?? 0.25,
    daPercent: defaults.daPercent ?? 0.03,
    taxRate: defaults.taxRate ?? 0.25,
    capexPercent: defaults.capexPercent ?? 0.04,
    nwcPercent: defaults.nwcPercent ?? 0.05,
    wacc: defaults.wacc ?? 0.10,
    terminalGrowth: defaults.terminalGrowth ?? 0.025,
    netDebt: defaults.netDebt ?? 0,
    sharesOutstanding: defaults.sharesOutstanding ?? 100,
    marketPrice: defaults.marketPrice ?? 0,
  };

  /* ─── INPUTS ─── */

  const inputs: InputSpec[] = [
    // Assumptions sheet — per-period
    {
      key: 'Revenue',
      label: 'Revenue',
      format: 'money0',
      defaultValue: [d.revenue, ...forecastYears.map(() => 0)],
      perPeriod: true,
      namedRange: 'Revenue',
      sheet: 'Assumptions',
      description: 'Total revenue. Historical is actual; projections driven by growth rate.',
      role: 'input',
    },
    {
      key: 'RevenueGrowth',
      label: 'Revenue Growth %',
      format: 'pct1',
      defaultValue: forecastYears.map(() => d.revenueGrowth),
      perPeriod: true,
      namedRange: 'RevenueGrowth',
      sheet: 'Assumptions',
      description: 'Year-over-year revenue growth rate.',
    },
    {
      key: 'EBITDAMargin',
      label: 'EBITDA Margin %',
      format: 'pct1',
      defaultValue: d.ebitdaMargin,
      perPeriod: true,
      namedRange: 'EBITDAMargin',
      sheet: 'Assumptions',
    },
    {
      key: 'DAPercent',
      label: 'D&A % of Revenue',
      format: 'pct1',
      defaultValue: d.daPercent,
      perPeriod: true,
      namedRange: 'DAPercent',
      sheet: 'Assumptions',
    },
    {
      key: 'TaxRate',
      label: 'Tax Rate',
      format: 'pct1',
      defaultValue: d.taxRate,
      perPeriod: false,
      namedRange: 'TaxRate',
      sheet: 'Assumptions',
      role: 'constant',
    },
    {
      key: 'CapexPercent',
      label: 'CapEx % of Revenue',
      format: 'pct1',
      defaultValue: d.capexPercent,
      perPeriod: true,
      namedRange: 'CapexPercent',
      sheet: 'Assumptions',
    },
    {
      key: 'NWCPercent',
      label: 'Change in NWC % of Rev',
      format: 'pct1',
      defaultValue: d.nwcPercent,
      perPeriod: true,
      namedRange: 'NWCPercent',
      sheet: 'Assumptions',
    },
    // Valuation inputs (scalar)
    {
      key: 'WACC',
      label: 'WACC',
      format: 'pct2',
      defaultValue: d.wacc,
      perPeriod: false,
      namedRange: 'WACC',
      sheet: 'Assumptions',
    },
    {
      key: 'TerminalGrowth',
      label: 'Terminal Growth Rate',
      format: 'pct2',
      defaultValue: d.terminalGrowth,
      perPeriod: false,
      namedRange: 'TerminalGrowth',
      sheet: 'Assumptions',
    },
    {
      key: 'NetDebt',
      label: 'Net Debt',
      format: 'money0',
      defaultValue: d.netDebt,
      perPeriod: false,
      namedRange: 'NetDebt',
      sheet: 'Assumptions',
    },
    {
      key: 'SharesOut',
      label: 'Shares Outstanding (M)',
      format: 'number2',
      defaultValue: d.sharesOutstanding,
      perPeriod: false,
      namedRange: 'SharesOut',
      sheet: 'Assumptions',
    },
    {
      key: 'MarketPrice',
      label: 'Current Market Price',
      format: 'money2',
      defaultValue: d.marketPrice,
      perPeriod: false,
      namedRange: 'MarketPrice',
      sheet: 'Assumptions',
    },
  ];

  /* ─── LINE ITEMS ─── */

  const lineItems: LineItemSpec[] = [
    // Projections sheet — Income Statement
    {
      key: 'ProjectedRevenue',
      label: 'Revenue',
      format: 'money0',
      perPeriod: true,
      namedRange: 'ProjRevenue',
      sheet: 'Projections',
      equationText: 'Prior Revenue × (1 + Revenue Growth)',
      formulaTemplate: '{Revenue.prev}*(1+{RevenueGrowth})',
      deps: ['Revenue', 'RevenueGrowth'],
      role: 'derived',
    },
    {
      key: 'EBITDA',
      label: 'EBITDA',
      format: 'money0',
      perPeriod: true,
      namedRange: 'EBITDA',
      sheet: 'Projections',
      equationText: 'Revenue × EBITDA Margin',
      formulaTemplate: '{ProjectedRevenue}*{EBITDAMargin}',
      deps: ['ProjectedRevenue', 'EBITDAMargin'],
    },
    {
      key: 'DA',
      label: '(-) Depreciation & Amortization',
      format: 'money0',
      perPeriod: true,
      namedRange: 'DA',
      sheet: 'Projections',
      equationText: 'Revenue × D&A %',
      formulaTemplate: '-ABS({ProjectedRevenue}*{DAPercent})',
      deps: ['ProjectedRevenue', 'DAPercent'],
      indent: 1,
    },
    {
      key: 'EBIT',
      label: 'EBIT',
      format: 'money0',
      perPeriod: true,
      namedRange: 'EBIT',
      sheet: 'Projections',
      equationText: 'EBITDA + D&A (D&A is negative)',
      formulaTemplate: '{EBITDA}+{DA}',
      deps: ['EBITDA', 'DA'],
      role: 'total',
    },
    {
      key: 'Taxes',
      label: '(-) Taxes on EBIT',
      format: 'money0',
      perPeriod: true,
      namedRange: 'Taxes',
      sheet: 'Projections',
      equationText: 'EBIT × Tax Rate (negative)',
      formulaTemplate: '-ABS({EBIT}*{TaxRate})',
      deps: ['EBIT', 'TaxRate'],
      indent: 1,
    },
    {
      key: 'NOPAT',
      label: 'NOPAT',
      format: 'money0',
      perPeriod: true,
      namedRange: 'NOPAT',
      sheet: 'Projections',
      equationText: 'EBIT + Taxes (Taxes negative)',
      formulaTemplate: '{EBIT}+{Taxes}',
      deps: ['EBIT', 'Taxes'],
      role: 'total',
    },
    // Free Cash Flow
    {
      key: 'AddBackDA',
      label: '(+) D&A',
      format: 'money0',
      perPeriod: true,
      namedRange: 'AddBackDA',
      sheet: 'Projections',
      equationText: 'Add back D&A to NOPAT',
      formulaTemplate: '-{DA}',
      deps: ['DA'],
      indent: 1,
    },
    {
      key: 'CapEx',
      label: '(-) Capital Expenditures',
      format: 'money0',
      perPeriod: true,
      namedRange: 'CapEx',
      sheet: 'Projections',
      equationText: 'Revenue × CapEx % (negative)',
      formulaTemplate: '-ABS({ProjectedRevenue}*{CapexPercent})',
      deps: ['ProjectedRevenue', 'CapexPercent'],
      indent: 1,
    },
    {
      key: 'DeltaNWC',
      label: '(-) Change in NWC',
      format: 'money0',
      perPeriod: true,
      namedRange: 'DeltaNWC',
      sheet: 'Projections',
      equationText: 'Revenue × NWC % (negative)',
      formulaTemplate: '-ABS({ProjectedRevenue}*{NWCPercent})',
      deps: ['ProjectedRevenue', 'NWCPercent'],
      indent: 1,
    },
    {
      key: 'UFCF',
      label: 'Unlevered Free Cash Flow',
      format: 'money0',
      perPeriod: true,
      namedRange: 'UFCF',
      sheet: 'Projections',
      equationText: 'NOPAT + D&A + CapEx + ΔNWC',
      formulaTemplate: '{NOPAT}+{AddBackDA}+{CapEx}+{DeltaNWC}',
      deps: ['NOPAT', 'AddBackDA', 'CapEx', 'DeltaNWC'],
      role: 'total',
    },
    // Valuation sheet — DCF waterfall (scalar)
    {
      key: 'TerminalValue',
      label: 'Terminal Value (Gordon Growth)',
      format: 'money0',
      perPeriod: false,
      namedRange: 'TerminalValue',
      sheet: 'Valuation',
      equationText: 'Last-Year UFCF × (1 + g) / (WACC - g)',
      formulaTemplate: '{UFCF}*(1+{TerminalGrowth})/({WACC}-{TerminalGrowth})',
      deps: ['UFCF', 'TerminalGrowth', 'WACC'],
    },
    {
      key: 'EnterpriseValue',
      label: 'Enterprise Value',
      format: 'money0',
      perPeriod: false,
      namedRange: 'EV',
      sheet: 'Valuation',
      equationText: 'Sum of discounted FCFs + discounted Terminal Value',
      formulaTemplate: '{TerminalValue}',
      deps: ['TerminalValue'],
      role: 'total',
    },
    {
      key: 'EquityValue',
      label: 'Equity Value',
      format: 'money0',
      perPeriod: false,
      namedRange: 'EquityValue',
      sheet: 'Valuation',
      equationText: 'Enterprise Value - Net Debt',
      formulaTemplate: '{EnterpriseValue}-{NetDebt}',
      deps: ['EnterpriseValue', 'NetDebt'],
      role: 'total',
    },
    {
      key: 'ImpliedPrice',
      label: 'Implied Share Price',
      format: 'money2',
      perPeriod: false,
      namedRange: 'ImpliedPrice',
      sheet: 'Valuation',
      equationText: 'Equity Value / Shares Outstanding',
      formulaTemplate: '{EquityValue}/{SharesOut}',
      deps: ['EquityValue', 'SharesOut'],
      role: 'total',
    },
    {
      key: 'UpsidePct',
      label: 'Upside / (Downside) %',
      format: 'pct1',
      perPeriod: false,
      namedRange: 'UpsidePct',
      sheet: 'Valuation',
      equationText: '(Implied Price / Market Price) - 1',
      formulaTemplate: 'IF({MarketPrice}=0,"N/A",{ImpliedPrice}/{MarketPrice}-1)',
      deps: ['ImpliedPrice', 'MarketPrice'],
    },
  ];

  /* ─── CHECKS ─── */

  const checks: CheckSpec[] = [
    {
      key: 'FCFConsistency',
      label: 'FCF = NOPAT + D&A - CapEx - ΔNWC',
      formulaTemplate: 'ABS({UFCF}-({NOPAT}+{AddBackDA}+{CapEx}+{DeltaNWC}))<0.01',
      equationText: 'UFCF should equal NOPAT + D&A add-back + CapEx + ΔNWC within rounding',
      deps: ['UFCF', 'NOPAT', 'AddBackDA', 'CapEx', 'DeltaNWC'],
      perPeriod: true,
    },
    {
      key: 'WACCvsGrowth',
      label: 'WACC > Terminal Growth',
      formulaTemplate: '{WACC}>{TerminalGrowth}',
      equationText: 'WACC must exceed terminal growth for Gordon Growth model validity',
      deps: ['WACC', 'TerminalGrowth'],
      perPeriod: false,
    },
    {
      key: 'PositiveEV',
      label: 'Enterprise Value > 0',
      formulaTemplate: '{EnterpriseValue}>0',
      equationText: 'Enterprise value should be positive under base case',
      deps: ['EnterpriseValue'],
      perPeriod: false,
    },
    {
      key: 'SharesPositive',
      label: 'Shares Outstanding > 0',
      formulaTemplate: '{SharesOut}>0',
      equationText: 'Must have positive shares for per-share calculation',
      deps: ['SharesOut'],
      perPeriod: false,
    },
  ];

  /* ─── SHEETS ─── */

  return {
    name: 'DCF Valuation',
    slug: 'dcf-valuation',
    companyName,
    ticker,
    units: 'USD millions',
    periods: {
      actuals: actualYears,
      estimates: forecastYears,
      includeTerminal: false,
    },
    inputs,
    lineItems,
    checks,
    sheets: [
      {
        name: 'Assumptions',
        description: 'All editable model inputs and driver assumptions.',
        hasTimeSeries: true,
        freezeRow: 3,
        freezeCol: 1,
        sections: [
          {
            title: 'Revenue & Growth',
            sheet: 'Assumptions',
            items: ['Revenue', 'RevenueGrowth'],
          },
          {
            title: 'Margins & Operating',
            sheet: 'Assumptions',
            items: ['EBITDAMargin', 'DAPercent', 'TaxRate'],
          },
          {
            title: 'Capital Requirements',
            sheet: 'Assumptions',
            items: ['CapexPercent', 'NWCPercent'],
          },
          {
            title: 'Valuation Inputs',
            sheet: 'Assumptions',
            items: ['WACC', 'TerminalGrowth', 'NetDebt', 'SharesOut', 'MarketPrice'],
          },
        ],
      },
      {
        name: 'Projections',
        description: 'Income statement, NOPAT, and unlevered free cash flow projections.',
        hasTimeSeries: true,
        freezeRow: 3,
        freezeCol: 1,
        sections: [
          {
            title: 'Income Statement',
            sheet: 'Projections',
            items: ['ProjectedRevenue', 'EBITDA', 'DA', 'EBIT', 'Taxes', 'NOPAT'],
          },
          {
            title: 'Free Cash Flow',
            sheet: 'Projections',
            items: ['AddBackDA', 'CapEx', 'DeltaNWC', 'UFCF'],
          },
        ],
      },
      {
        name: 'Valuation',
        description: 'DCF valuation waterfall: Terminal Value → EV → Equity Value → Implied Price.',
        hasTimeSeries: false,
        freezeRow: 3,
        freezeCol: 1,
        sections: [
          {
            title: 'DCF Valuation',
            sheet: 'Valuation',
            items: ['TerminalValue', 'EnterpriseValue', 'EquityValue', 'ImpliedPrice', 'UpsidePct'],
          },
        ],
      },
    ],
  };
}
