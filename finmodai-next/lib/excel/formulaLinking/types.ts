/**
 * Formula-Linking Standard — Type Definitions
 *
 * Every CapitalBase model is defined as a typed ModelDefinition that drives
 * the FormulaLinkedBuilder. This guarantees:
 *   1. Inputs are raw, editable, blue-font cells with named ranges.
 *   2. All calculations are Excel formulas referencing named ranges.
 *   3. An auto-generated "Equations" tab documents every formula.
 *   4. Outputs are locked/protected (input-only editing).
 *   5. The workbook is auditable and matches real IB/PE spreadsheets.
 *
 * ─── NAMING CONVENTIONS ───
 *
 * Scalar inputs:   TaxRate, TerminalGrowth, WACC, NetDebt
 * Per-period inputs: Revenue_2024A, Revenue_2025E, Revenue_2026E, ...
 * Derived scalars:  EV, EquityValue, ImpliedPrice
 * Derived series:   EBITDA_2025E, FCF_2025E, ...
 * Ratios/pcts:      GM_2025E (gross margin), CapexPct_2025E
 *
 * ─── SIGN CONVENTIONS ───
 *
 * Positive: Revenue, EBITDA, EBIT, Net Income, Cash, Assets
 * Negative: Expenses (COGS, SGA, D&A), CapEx in CF, Debt repayment
 * Exception: CapEx inputs may be entered as positive %; formula applies sign.
 *
 * ─── PERIOD LABELS ───
 *
 * Historical: FY2024A, FY2023A (suffix A = Actual)
 * Projected:  FY2025E, FY2026E (suffix E = Estimate)
 * Terminal:   TV (terminal value column)
 */

/** Cell format type used for number formatting. */
export type CellFormat =
  | 'money0'      // $#,##0
  | 'money1'      // $#,##0.0
  | 'money2'      // $#,##0.00
  | 'pct1'        // 0.0%
  | 'pct2'        // 0.00%
  | 'number0'     // #,##0
  | 'number2'     // #,##0.00
  | 'multiple'    // #,##0.00"x"
  | 'date'        // yyyy-mm-dd
  | 'text'        // @
  | 'integer';    // #,##0

/** Whether a cell is an input (editable) or derived (formula-locked). */
export type CellRole = 'input' | 'derived' | 'constant' | 'hardcodedActual' | 'total' | 'check';

/** Time period descriptor. */
export type PeriodSuffix = 'A' | 'E' | 'TV';

export interface PeriodDef {
  /** Column index (1-based) in the worksheet. */
  col: number;
  /** e.g. 2024 */
  year: number;
  /** A = Actual, E = Estimate, TV = Terminal Value */
  suffix: PeriodSuffix;
  /** Full label, e.g. "FY2024A", "FY2025E", "TV" */
  label: string;
}

/**
 * ─── INPUT SPEC ───
 * Defines a single input cell or per-period input row.
 */
export interface InputSpec {
  /** Unique key for this input, e.g. "Revenue", "TaxRate". */
  key: string;
  /** Human label shown in col A, e.g. "Revenue", "Tax Rate". */
  label: string;
  /** Cell format. */
  format: CellFormat;
  /** Default value (scalar) or per-period defaults (array). */
  defaultValue: number | number[] | string | null;
  /** If true, this input has one value per forecast period. */
  perPeriod: boolean;
  /**
   * Named range base. For scalar: "TaxRate". For per-period: "Revenue"
   * which becomes Revenue_2024A, Revenue_2025E, etc.
   */
  namedRange: string;
  /** Sheet where this input lives (e.g. "Assumptions"). */
  sheet: string;
  /** Row within the sheet (set by builder at layout time). */
  row?: number;
  /** Description for Equations tab. */
  description?: string;
  /**
   * Role override. Most inputs are 'input'; historical actuals
   * are 'hardcodedActual'; tax rates might be 'constant'.
   */
  role?: Extract<CellRole, 'input' | 'constant' | 'hardcodedActual'>;
}

/**
 * ─── LINE ITEM SPEC ───
 * Defines a calculated row (formula-driven).
 */
export interface LineItemSpec {
  /** Unique key, e.g. "EBITDA", "FCF". */
  key: string;
  /** Human label in col A. */
  label: string;
  /** Cell format. */
  format: CellFormat;
  /** If true, formula repeats per period across columns. */
  perPeriod: boolean;
  /** Named range base (becomes EBITDA_2025E etc. if perPeriod). */
  namedRange: string;
  /** Sheet where this line item appears. */
  sheet: string;
  /** Row (set by builder). */
  row?: number;
  /**
   * Human-readable equation text for the Equations tab.
   * e.g. "Revenue × EBITDA Margin"
   */
  equationText: string;
  /**
   * Excel formula template. Use {NamedRange} placeholders that the builder
   * resolves to actual cell refs at write time.
   *
   * Per-period example: "{Revenue} * {EBITDAMargin}"
   *   → builder replaces with the cell addresses for the matching period.
   *
   * Cross-period example: "{Revenue.prev} * (1 + {RevenueGrowth})"
   *   → .prev / .next resolve to adjacent period columns.
   *
   * Cross-sheet example: "{Assumptions!TaxRate}"
   *   → resolves to the named range on the Assumptions sheet.
   *
   * Scalar ref: "{TaxRate}" → resolves to the single named range cell.
   */
  formulaTemplate: string;
  /**
   * Dependencies — list of named range keys this formula references.
   * Used for documentation and circular-ref detection.
   */
  deps: string[];
  /** Role. Default 'derived'. Use 'total' for subtotal/total rows. */
  role?: Extract<CellRole, 'derived' | 'total'>;
  /** Indent level (0 = flush left, 1 = one indent, 2 = sub-sub). */
  indent?: number;
  /** If true, this is a spacing/separator row (no formula). */
  isSpacer?: boolean;
}

/**
 * ─── CHECK SPEC ───
 * A model integrity check (balance sheet balances, CF ties, etc.)
 */
export interface CheckSpec {
  /** Unique key, e.g. "BSBalance", "CashTieOut". */
  key: string;
  /** Human label: "Balance Sheet Balances", "Cash Tie-Out". */
  label: string;
  /**
   * Formula template that should evaluate to TRUE (or 0).
   * e.g. "ABS({TotalAssets} - {TotalLiabEquity}) < 0.01"
   */
  formulaTemplate: string;
  /**
   * Human-readable equation for the Equations tab.
   * e.g. "Total Assets = Total Liabilities + Equity"
   */
  equationText: string;
  /** Dependencies. */
  deps: string[];
  /** If true, check is per-period. */
  perPeriod: boolean;
  /**
   * Expected result: TRUE, 0, or "OK".
   * The builder writes an IF wrapper: =IF(formula, "PASS", "FAIL")
   */
  expectedResult?: 'TRUE' | 'OK' | 0;
}

/**
 * ─── SECTION SPEC ───
 * Groups line items and inputs into visual sections on a sheet.
 */
export interface SectionSpec {
  /** Section title, e.g. "Income Statement", "Free Cash Flow". */
  title: string;
  /** Sheet this section appears on. */
  sheet: string;
  /** Ordered list of input and line-item keys in this section. */
  items: string[];
}

/**
 * ─── SHEET SPEC ───
 * Defines a worksheet in the model.
 */
export interface SheetSpec {
  /** Sheet name (max 31 chars). */
  name: string;
  /** Sheet purpose description. */
  description?: string;
  /** Column where labels go (default 1). */
  labelCol?: number;
  /** Column where first data value goes (default 2 for scalar, varies for time-series). */
  dataStartCol?: number;
  /** If true, this sheet has time-series columns. */
  hasTimeSeries?: boolean;
  /** Freeze pane row (default: after header). */
  freezeRow?: number;
  /** Freeze pane col (default: label col). */
  freezeCol?: number;
  /** Ordered sections. */
  sections: SectionSpec[];
}

/**
 * ─── MODEL DEFINITION ───
 * The complete specification for a formula-linked Excel model.
 */
export interface FormulaLinkedModelDef {
  /** Model name, e.g. "DCF Valuation", "LBO Model". */
  name: string;
  /** Short slug for filenames. */
  slug: string;
  /** Company name (populated at runtime). */
  companyName?: string;
  /** Ticker (populated at runtime). */
  ticker?: string;
  /** Currency / units label. */
  units?: string;

  /**
   * Period configuration.
   * The builder uses this to create period columns and named ranges.
   */
  periods: {
    /** Historical actual years, e.g. [2023, 2024]. */
    actuals: number[];
    /** Projected estimate years, e.g. [2025, 2026, 2027, 2028, 2029]. */
    estimates: number[];
    /** Include terminal value column? */
    includeTerminal?: boolean;
  };

  /** All input specifications. */
  inputs: InputSpec[];
  /** All calculated line-item specifications. */
  lineItems: LineItemSpec[];
  /** All model-integrity checks. */
  checks: CheckSpec[];
  /** Sheet definitions (layout order). */
  sheets: SheetSpec[];

  /**
   * Optional: known circular references that are intentional.
   * e.g. ["InterestExpense<->DebtBalance"] in an LBO iterative solver.
   * The builder will label these in the Equations tab rather than error.
   */
  intentionalCirculars?: string[];
}

/**
 * ─── RESOLVED CELL ADDRESS ───
 * After the builder lays out rows, every input and line item
 * gets a resolved address for formula substitution.
 */
export interface ResolvedAddress {
  /** Key from InputSpec or LineItemSpec. */
  key: string;
  /** Sheet name. */
  sheet: string;
  /** Row number. */
  row: number;
  /** For scalar: single column. For per-period: map of period label → column. */
  columns: Map<string, number>;
  /** The named range(s) created. */
  namedRanges: string[];
}

/**
 * ─── EQUATIONS ROW ───
 * One row in the auto-generated Equations tab.
 */
export interface EquationsRow {
  /** Line item name. */
  itemName: string;
  /** Human-readable equation. */
  equationText: string;
  /** Resolved Excel formula string. */
  excelFormula: string;
  /** Named range dependencies. */
  dependencies: string;
  /** Location(s): "Sheet!CellRange". */
  locations: string;
  /** Role (input/derived/total/check). */
  role: CellRole;
}
