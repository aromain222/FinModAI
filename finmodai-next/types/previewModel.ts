/**
 * Canonical Preview Model Types
 * 
 * These types ensure the preview always has a complete structure, even when data is missing.
 */

export type PreviewYear = "LTM" | `FY+${number}`;

export type PreviewRow = {
  label: string;
  key: string;
  values: Record<string, number | null>; // per year label (e.g., "LTM", "FY+1")
  format?: "money" | "percent" | "number";
};

export type PreviewModel = {
  years: string[];
  incomeStatement: PreviewRow[];
  cashFlow: PreviewRow[];
  balanceSheet: PreviewRow[];
  diagnostics: {
    appliedDefaults: Record<string, unknown>;
    missingInputs: string[];
    balanceSheetDiffByYear: Record<string, number>;
    tiesByYear: Record<string, boolean>;
    dataSource: "generated" | "financials" | "fallback";
  };
};







