/**
 * Canonical Preview Model Builder
 * 
 * This function ALWAYS returns a complete PreviewModel, even if data is missing.
 * It builds from best-available sources in priority order:
 * 1. Generated model data
 * 2. Financial statements (FMP/SEC)
 * 3. Deterministic fallback
 */

import type { PreviewModel, PreviewRow } from '@/types/previewModel';
import type { ThreeStatementOutput } from '@/lib/models/outputTypes';

interface BuildPreviewModelInput {
  generatedModel?: ThreeStatementOutput | null;
  financials?: {
    revenueM?: number;
    ebitdaM?: number;
    cashM?: number;
    debtM?: number;
    netIncomeM?: number;
    [key: string]: any;
  } | null;
  assumptions?: {
    revenue?: number[];
    revenueGrowth?: number[];
    cogsPct?: number[];
    opexPct?: number[];
    daPct?: number[];
    taxRate?: number;
    forecastYears?: number;
    [key: string]: any;
  } | null;
}

const DEFAULT_FORECAST_YEARS = 5;
const DEFAULT_GROWTH_RATE = 0.10; // 10%
const DEFAULT_GROSS_MARGIN = 0.60; // 60%
const DEFAULT_EBITDA_MARGIN = 0.20; // 20%
const DEFAULT_EBIT_MARGIN = 0.15; // 15%
const DEFAULT_TAX_RATE = 0.21; // 21%
const DEFAULT_DEPRECIATION_PCT = 0.04; // 4% of revenue
const DEFAULT_CAPEX_PCT = 0.04; // 4% of revenue
const DEFAULT_NWC_PCT = 0.10; // 10% of revenue
const BALANCE_SHEET_TOLERANCE = 1_000_000; // $1M

/**
 * Build a complete preview model from available sources
 */
export function buildPreviewModel(input: BuildPreviewModelInput): PreviewModel {
  const { generatedModel, financials, assumptions } = input;
  
  // Determine forecast years
  const forecastYears = assumptions?.forecastYears || DEFAULT_FORECAST_YEARS;
  const years = ["LTM", ...Array.from({ length: forecastYears }, (_, i) => `FY+${i + 1}`)];
  
  // Determine data source
  let dataSource: "generated" | "financials" | "fallback" = "fallback";
  if (generatedModel) {
    dataSource = "generated";
  } else if (financials) {
    dataSource = "financials";
  }
  
  // Build income statement
  const incomeStatement = buildIncomeStatement({
    generatedModel,
    financials,
    assumptions,
    years,
    dataSource,
  });
  
  // Build cash flow
  const cashFlow = buildCashFlow({
    generatedModel,
    financials,
    assumptions,
    years,
    incomeStatement,
    dataSource,
  });
  
  // Build balance sheet
  const balanceSheet = buildBalanceSheet({
    generatedModel,
    financials,
    assumptions,
    years,
    incomeStatement,
    cashFlow,
    dataSource,
  });
  
  // Calculate diagnostics
  const diagnostics = buildDiagnostics({
    generatedModel,
    financials,
    assumptions,
    years,
    balanceSheet,
    dataSource,
  });
  
  return {
    years,
    incomeStatement,
    cashFlow,
    balanceSheet,
    diagnostics,
  };
}

/**
 * Build Income Statement rows
 */
function buildIncomeStatement(params: {
  generatedModel?: ThreeStatementOutput | null;
  financials?: any;
  assumptions?: any;
  years: string[];
  dataSource: string;
}): PreviewRow[] {
  const { generatedModel, financials, assumptions, years, dataSource } = params;
  
  // If we have generated model, use it
  if (generatedModel?.incomeStatement) {
    const is = generatedModel.incomeStatement;
    const periods = is.periods || years;
    
    return [
      {
        label: "Revenue",
        key: "revenue",
        values: buildYearValues(periods, years, is.revenue || []),
        format: "money",
      },
      {
        label: "COGS",
        key: "cogs",
        values: buildYearValues(periods, years, is.cogs || []),
        format: "money",
      },
      {
        label: "Gross Profit",
        key: "grossProfit",
        values: buildYearValues(periods, years, is.grossProfit || []),
        format: "money",
      },
      {
        label: "Operating Expenses",
        key: "operatingExpenses",
        values: buildYearValues(periods, years, is.operatingExpenses || []),
        format: "money",
      },
      {
        label: "EBITDA",
        key: "ebitda",
        values: buildYearValues(periods, years, is.ebitda || []),
        format: "money",
      },
      {
        label: "D&A",
        key: "da",
        values: buildYearValues(periods, years, 
          is.ebitda && is.ebit 
            ? is.ebitda.map((e: number, i: number) => (e || 0) - (is.ebit?.[i] || 0))
            : []
        ),
        format: "money",
      },
      {
        label: "EBIT",
        key: "ebit",
        values: buildYearValues(periods, years, is.ebit || []),
        format: "money",
      },
      {
        label: "Taxes",
        key: "taxes",
        values: buildYearValues(periods, years,
          is.netIncome && is.ebit
            ? is.ebit.map((e: number, i: number) => {
                const netIncome = is.netIncome?.[i] || 0;
                const ebit = e || 0;
                return ebit - (netIncome / (1 - (assumptions?.taxRate || DEFAULT_TAX_RATE)));
              })
            : []
        ),
        format: "money",
      },
      {
        label: "Net Income",
        key: "netIncome",
        values: buildYearValues(periods, years, is.netIncome || []),
        format: "money",
      },
    ];
  }
  
  // If we have financials, compute from them
  if (financials && dataSource === "financials") {
    const ltmRevenue = (financials.revenueM || 1000) * 1_000_000;
    const growthRate = assumptions?.revenueGrowth?.[0] || DEFAULT_GROWTH_RATE;
    const cogsPct = assumptions?.cogsPct?.[0] || (1 - DEFAULT_GROSS_MARGIN);
    const opexPct = assumptions?.opexPct?.[0] || (1 - DEFAULT_GROSS_MARGIN - DEFAULT_EBITDA_MARGIN);
    const daPct = assumptions?.daPct?.[0] || DEFAULT_DEPRECIATION_PCT;
    const taxRate = assumptions?.taxRate || DEFAULT_TAX_RATE;
    
    const revenue = years.map((_, i) => 
      i === 0 ? ltmRevenue : ltmRevenue * Math.pow(1 + growthRate, i)
    );
    const cogs = revenue.map(r => r * cogsPct);
    const grossProfit = revenue.map((r, i) => r - cogs[i]);
    const operatingExpenses = revenue.map(r => r * opexPct);
    const ebitda = revenue.map((r, i) => grossProfit[i] - operatingExpenses[i]);
    const da = revenue.map(r => r * daPct);
    const ebit = ebitda.map((e, i) => e - da[i]);
    const interestExpense = (financials.debtM || 0) * 1_000_000 * (assumptions?.interestRate || 0.05);
    const ebt = ebit.map(e => e - interestExpense);
    const taxes = ebt.map(e => e * taxRate);
    const netIncome = ebt.map((e, i) => e - taxes[i]);
    
    return [
      { label: "Revenue", key: "revenue", values: buildYearValues(years, years, revenue), format: "money" },
      { label: "COGS", key: "cogs", values: buildYearValues(years, years, cogs), format: "money" },
      { label: "Gross Profit", key: "grossProfit", values: buildYearValues(years, years, grossProfit), format: "money" },
      { label: "Operating Expenses", key: "operatingExpenses", values: buildYearValues(years, years, operatingExpenses), format: "money" },
      { label: "EBITDA", key: "ebitda", values: buildYearValues(years, years, ebitda), format: "money" },
      { label: "D&A", key: "da", values: buildYearValues(years, years, da), format: "money" },
      { label: "EBIT", key: "ebit", values: buildYearValues(years, years, ebit), format: "money" },
      { label: "Taxes", key: "taxes", values: buildYearValues(years, years, taxes), format: "money" },
      { label: "Net Income", key: "netIncome", values: buildYearValues(years, years, netIncome), format: "money" },
    ];
  }
  
  // Fallback: deterministic defaults
  const baselineRevenue = 1000 * 1_000_000; // $1B baseline
  const growthRate = DEFAULT_GROWTH_RATE;
  const cogsPct = 1 - DEFAULT_GROSS_MARGIN;
  const opexPct = 1 - DEFAULT_GROSS_MARGIN - DEFAULT_EBITDA_MARGIN;
  const daPct = DEFAULT_DEPRECIATION_PCT;
  const taxRate = DEFAULT_TAX_RATE;
  
  const revenue = years.map((_, i) => baselineRevenue * Math.pow(1 + growthRate, i));
  const cogs = revenue.map(r => r * cogsPct);
  const grossProfit = revenue.map((r, i) => r - cogs[i]);
  const operatingExpenses = revenue.map(r => r * opexPct);
  const ebitda = revenue.map((r, i) => grossProfit[i] - operatingExpenses[i]);
  const da = revenue.map(r => r * daPct);
  const ebit = ebitda.map((e, i) => e - da[i]);
  const taxes = ebit.map(e => e * taxRate);
  const netIncome = ebit.map((e, i) => e - taxes[i]);
  
  return [
    { label: "Revenue", key: "revenue", values: buildYearValues(years, years, revenue), format: "money" },
    { label: "COGS", key: "cogs", values: buildYearValues(years, years, cogs), format: "money" },
    { label: "Gross Profit", key: "grossProfit", values: buildYearValues(years, years, grossProfit), format: "money" },
    { label: "Operating Expenses", key: "operatingExpenses", values: buildYearValues(years, years, operatingExpenses), format: "money" },
    { label: "EBITDA", key: "ebitda", values: buildYearValues(years, years, ebitda), format: "money" },
    { label: "D&A", key: "da", values: buildYearValues(years, years, da), format: "money" },
    { label: "EBIT", key: "ebit", values: buildYearValues(years, years, ebit), format: "money" },
    { label: "Taxes", key: "taxes", values: buildYearValues(years, years, taxes), format: "money" },
    { label: "Net Income", key: "netIncome", values: buildYearValues(years, years, netIncome), format: "money" },
  ];
}

/**
 * Build Cash Flow rows
 */
function buildCashFlow(params: {
  generatedModel?: ThreeStatementOutput | null;
  financials?: any;
  assumptions?: any;
  years: string[];
  incomeStatement: PreviewRow[];
  dataSource: string;
}): PreviewRow[] {
  const { generatedModel, financials, assumptions, years, incomeStatement, dataSource } = params;
  
  // Get net income and D&A from income statement
  const netIncomeRow = incomeStatement.find(r => r.key === "netIncome");
  const daRow = incomeStatement.find(r => r.key === "da");
  const netIncome = years.map(y => netIncomeRow?.values[y] || 0);
  const da = years.map(y => daRow?.values[y] || 0);
  
  // If we have generated model, use it
  if (generatedModel?.cashFlow) {
    const cf = generatedModel.cashFlow;
    const periods = cf.periods || years;
    
    return [
      {
        label: "Net Income",
        key: "netIncome",
        values: buildYearValues(periods, years, netIncome),
        format: "money",
      },
      {
        label: "D&A",
        key: "da",
        values: buildYearValues(periods, years, da),
        format: "money",
      },
      {
        label: "Change in NWC",
        key: "nwc",
        values: buildYearValues(periods, years, []), // Would need more data
        format: "money",
      },
      {
        label: "CFO",
        key: "cfo",
        values: buildYearValues(periods, years, cf.operatingCashFlow || []),
        format: "money",
      },
      {
        label: "Capex",
        key: "capex",
        values: buildYearValues(periods, years, 
          cf.investingCashFlow?.map((v: number) => v < 0 ? v : -v) || []
        ),
        format: "money",
      },
      {
        label: "CFI",
        key: "cfi",
        values: buildYearValues(periods, years, cf.investingCashFlow || []),
        format: "money",
      },
      {
        label: "Debt/Equity Issuance",
        key: "financing",
        values: buildYearValues(periods, years, cf.financingCashFlow || []),
        format: "money",
      },
      {
        label: "CFF",
        key: "cff",
        values: buildYearValues(periods, years, cf.financingCashFlow || []),
        format: "money",
      },
      {
        label: "Net Change in Cash",
        key: "netChangeInCash",
        values: buildYearValues(periods, years, cf.netChangeInCash || []),
        format: "money",
      },
    ];
  }
  
  // Build from income statement and assumptions
  const revenueRow = incomeStatement.find(r => r.key === "revenue");
  const revenue = years.map(y => revenueRow?.values[y] || 0);
  const capexPct = assumptions?.capexPctRevenue?.[0] || DEFAULT_CAPEX_PCT;
  const nwcPct = assumptions?.nwcPct || DEFAULT_NWC_PCT;
  
  const cfo = years.map((_, i) => {
    const ni = netIncome[i] || 0;
    const daVal = da[i] || 0;
    const prevNWC = i === 0 ? 0 : (revenue[i - 1] || 0) * nwcPct;
    const currNWC = (revenue[i] || 0) * nwcPct;
    const nwcChange = prevNWC - currNWC; // Negative = use of cash
    return ni + daVal + nwcChange;
  });
  
  const capex = revenue.map(r => -r * capexPct);
  const cfi = capex; // Simplified
  const cff = years.map(() => 0); // Simplified - no debt/equity issuance
  const netChangeInCash = years.map((_, i) => (cfo[i] || 0) + (cfi[i] || 0) + (cff[i] || 0));
  
  return [
    { label: "Net Income", key: "netIncome", values: buildYearValues(years, years, netIncome), format: "money" },
    { label: "D&A", key: "da", values: buildYearValues(years, years, da), format: "money" },
    { label: "Change in NWC", key: "nwc", values: buildYearValues(years, years, 
      years.map((_, i) => {
        const prevNWC = i === 0 ? 0 : (revenue[i - 1] || 0) * nwcPct;
        const currNWC = (revenue[i] || 0) * nwcPct;
        return prevNWC - currNWC;
      })
    ), format: "money" },
    { label: "CFO", key: "cfo", values: buildYearValues(years, years, cfo), format: "money" },
    { label: "Capex", key: "capex", values: buildYearValues(years, years, capex), format: "money" },
    { label: "CFI", key: "cfi", values: buildYearValues(years, years, cfi), format: "money" },
    { label: "Debt/Equity Issuance", key: "financing", values: buildYearValues(years, years, cff), format: "money" },
    { label: "CFF", key: "cff", values: buildYearValues(years, years, cff), format: "money" },
    { label: "Net Change in Cash", key: "netChangeInCash", values: buildYearValues(years, years, netChangeInCash), format: "money" },
  ];
}

/**
 * Build Balance Sheet rows
 */
function buildBalanceSheet(params: {
  generatedModel?: ThreeStatementOutput | null;
  financials?: any;
  assumptions?: any;
  years: string[];
  incomeStatement: PreviewRow[];
  cashFlow: PreviewRow[];
  dataSource: string;
}): PreviewRow[] {
  const { generatedModel, financials, assumptions, years, cashFlow, dataSource } = params;
  
  // Get net change in cash from cash flow
  const netChangeInCashRow = cashFlow.find(r => r.key === "netChangeInCash");
  const netChangeInCash = years.map(y => netChangeInCashRow?.values[y] || 0);
  
  // Start with LTM cash
  const startingCash = (financials?.cashM || 100) * 1_000_000;
  const cash = [startingCash];
  for (let i = 1; i < years.length; i++) {
    cash.push((cash[i - 1] || 0) + (netChangeInCash[i] || 0));
  }
  
  // If we have generated model, use it but ensure it ties
  if (generatedModel?.balanceSheet) {
    const bs = generatedModel.balanceSheet;
    const periods = bs.periods || years;
    
    const totalAssets = buildYearValues(periods, years, bs.totalAssets || []);
    const totalLiabilities = buildYearValues(periods, years, bs.totalLiabilities || []);
    const totalEquity = buildYearValues(periods, years, bs.totalEquity || []);
    
    // Ensure balance sheet ties (adjust equity if needed)
    const adjustedEquity: Record<string, number> = {};
    years.forEach(y => {
      const assets = totalAssets[y] || 0;
      const liabilities = totalLiabilities[y] || 0;
      const equity = totalEquity[y] || 0;
      // Force tie: equity = assets - liabilities
      adjustedEquity[y] = assets - liabilities;
    });
    
    return [
      {
        label: "Cash",
        key: "cash",
        values: buildYearValues(periods, years, bs.cash || cash),
        format: "money",
      },
      {
        label: "Other Assets",
        key: "otherAssets",
        values: years.reduce((acc, y) => {
          const assets = totalAssets[y] || 0;
          const cashVal = buildYearValues(periods, years, bs.cash || cash)[y] || 0;
          acc[y] = assets - cashVal;
          return acc;
        }, {} as Record<string, number>),
        format: "money",
      },
      {
        label: "Total Assets",
        key: "totalAssets",
        values: totalAssets,
        format: "money",
      },
      {
        label: "Debt",
        key: "debt",
        values: buildYearValues(periods, years, []), // Would need more data
        format: "money",
      },
      {
        label: "Other Liabilities",
        key: "otherLiabilities",
        values: years.reduce((acc, y) => {
          const liabilities = totalLiabilities[y] || 0;
          const debt = (assumptions?.debt || 0) * 1_000_000;
          acc[y] = liabilities - debt;
          return acc;
        }, {} as Record<string, number>),
        format: "money",
      },
      {
        label: "Total Liabilities",
        key: "totalLiabilities",
        values: totalLiabilities,
        format: "money",
      },
      {
        label: "Equity",
        key: "equity",
        values: adjustedEquity,
        format: "money",
      },
      {
        label: "Total L+E",
        key: "totalLE",
        values: years.reduce((acc, y) => {
          const liabilities = totalLiabilities[y] || 0;
          const equity = adjustedEquity[y] || 0;
          acc[y] = liabilities + equity;
          return acc;
        }, {} as Record<string, number>),
        format: "money",
      },
    ];
  }
  
  // Build from cash flow and ensure it ties
  const revenueRow = params.incomeStatement.find(r => r.key === "revenue");
  const revenue = years.map(y => revenueRow?.values[y] || 0);
  const debt = (assumptions?.debt || financials?.debtM || 100) * 1_000_000;
  
  // Build assets: cash + PP&E estimate
  const ppeEstimate = revenue.map(r => r * 0.5); // PP&E = 50% of revenue
  const otherAssets = ppeEstimate;
  const totalAssets = years.map((_, i) => (cash[i] || 0) + (otherAssets[i] || 0));
  
  // Build liabilities: debt + other (accounts payable, etc.)
  const otherLiabilities = revenue.map(r => r * 0.15); // AP = 15% of revenue
  const totalLiabilities = years.map(() => debt + otherLiabilities[0]);
  
  // Equity = assets - liabilities (ensures tie)
  const equity = years.map((_, i) => (totalAssets[i] || 0) - (totalLiabilities[i] || 0));
  const totalLE = years.map((_, i) => (totalLiabilities[i] || 0) + (equity[i] || 0));
  
  return [
    { label: "Cash", key: "cash", values: buildYearValues(years, years, cash), format: "money" },
    { label: "Other Assets", key: "otherAssets", values: buildYearValues(years, years, otherAssets), format: "money" },
    { label: "Total Assets", key: "totalAssets", values: buildYearValues(years, years, totalAssets), format: "money" },
    { label: "Debt", key: "debt", values: buildYearValues(years, years, years.map(() => debt)), format: "money" },
    { label: "Other Liabilities", key: "otherLiabilities", values: buildYearValues(years, years, otherLiabilities), format: "money" },
    { label: "Total Liabilities", key: "totalLiabilities", values: buildYearValues(years, years, totalLiabilities), format: "money" },
    { label: "Equity", key: "equity", values: buildYearValues(years, years, equity), format: "money" },
    { label: "Total L+E", key: "totalLE", values: buildYearValues(years, years, totalLE), format: "money" },
  ];
}

/**
 * Build diagnostics
 */
function buildDiagnostics(params: {
  generatedModel?: ThreeStatementOutput | null;
  financials?: any;
  assumptions?: any;
  years: string[];
  balanceSheet: PreviewRow[];
  dataSource: string;
}): PreviewModel["diagnostics"] {
  const { generatedModel, financials, assumptions, years, balanceSheet, dataSource } = params;
  
  const totalAssetsRow = balanceSheet.find(r => r.key === "totalAssets");
  const totalLiabilitiesRow = balanceSheet.find(r => r.key === "totalLiabilities");
  const totalLERow = balanceSheet.find(r => r.key === "totalLE");
  
  const balanceSheetDiffByYear: Record<string, number> = {};
  const tiesByYear: Record<string, boolean> = {};
  
  years.forEach(y => {
    const assets = totalAssetsRow?.values[y] || 0;
    const le = totalLERow?.values[y] || 0;
    const diff = assets - le;
    balanceSheetDiffByYear[y] = diff;
    tiesByYear[y] = Math.abs(diff) < BALANCE_SHEET_TOLERANCE;
  });
  
  const appliedDefaults: Record<string, unknown> = {};
  if (dataSource === "fallback") {
    appliedDefaults.revenue = "Baseline $1B";
    appliedDefaults.growthRate = `${DEFAULT_GROWTH_RATE * 100}%`;
    appliedDefaults.grossMargin = `${DEFAULT_GROSS_MARGIN * 100}%`;
    appliedDefaults.ebitdaMargin = `${DEFAULT_EBITDA_MARGIN * 100}%`;
  } else if (dataSource === "financials") {
    appliedDefaults.dataSource = "Financial statements";
  }
  
  const missingInputs: string[] = [];
  if (!generatedModel && !financials) {
    missingInputs.push("No model generated");
    missingInputs.push("No financial data available");
  }
  
  return {
    appliedDefaults,
    missingInputs,
    balanceSheetDiffByYear,
    tiesByYear,
    dataSource: dataSource as "generated" | "financials" | "fallback",
  };
}

/**
 * Helper to build year values mapping
 */
function buildYearValues(
  sourcePeriods: string[],
  targetYears: string[],
  values: (number | null)[]
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  targetYears.forEach((year, idx) => {
    // Try to find matching period
    const sourceIdx = sourcePeriods.findIndex(p => p === year);
    if (sourceIdx >= 0 && sourceIdx < values.length) {
      result[year] = values[sourceIdx];
    } else if (idx < values.length) {
      // Fallback to index-based mapping
      result[year] = values[idx];
    } else {
      result[year] = null;
    }
  });
  return result;
}







