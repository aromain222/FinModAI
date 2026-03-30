/**
 * Universal "Valuation & Share Price" block for CapitalBase.
 * Used by: DCF (section title + same structure), Comps, LBO, Three-Statement.
 * Structure: Inputs (boxed) → EV source → Equity bridge → Implied price → Market comparison → Checks.
 * Units: USD (millions), Shares (millions), Price (USD/share). No blank reference rows; N/A when optional.
 */

import type ExcelJS from 'exceljs';
import {
  createNormalStyle,
  createSubHeaderStyle,
  createFormulaStyle,
  createTotalStyle,
  applyNumberFormat,
  applyBorders,
  COLORS,
} from './formatting';
import { sanitizeWorkbookText } from './workbookText';

const INPUT_FILL = 'FFE6F2FF';

function applyLabelStyle(cell: ExcelJS.Cell): void {
  cell.style = {
    ...createNormalStyle(),
    alignment: { vertical: 'middle', horizontal: 'left' },
  };
}

function applyInputCellStyle(cell: ExcelJS.Cell): void {
  const base = createFormulaStyle();
  cell.style = {
    ...base,
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: INPUT_FILL },
    },
    border: {
      top: { style: 'medium', color: { argb: COLORS.BORDER_GREY } },
      bottom: { style: 'medium', color: { argb: COLORS.BORDER_GREY } },
      left: { style: 'medium', color: { argb: COLORS.BORDER_GREY } },
      right: { style: 'medium', color: { argb: COLORS.BORDER_GREY } },
    },
    alignment: { vertical: 'middle', horizontal: 'right' },
  };
}

function setFormula(
  cell: ExcelJS.Cell,
  formula: string,
  result: number | string | null
): void {
  cell.value = { formula, result: result ?? undefined } as any;
}

export interface ValuationBlockInputs {
  /** Shares outstanding (millions). Must be > 0 for implied price. */
  sharesOutstanding: number;
  /** Market share price ($/share). Optional; if blank/0, comparison shows N/A. */
  marketSharePrice: number | null;
  /** Net debt ($ millions). Default 0. */
  netDebt: number;
}

export interface ValuationBlockOptions {
  /** Sheet to write to */
  sheet: ExcelJS.Worksheet;
  /** First row for the block */
  startRow: number;
  /** Input values */
  inputs: ValuationBlockInputs;
  /**
   * Enterprise value ($ millions) from the model.
   * If null, we show "No valuation method selected" and implied price N/A.
   */
  enterpriseValue: number | null;
  /** Short label for EV source (e.g. "DCF", "Comps (EV/EBITDA × EBITDA)", "LBO Entry") */
  evSourceLabel?: string;
  /** Optional detail line (e.g. "Median EV/EBITDA × Subject EBITDA") */
  evSourceDetail?: string;
  /** Model name for title (e.g. "DCF", "Trading Comps", "LBO", "Three-Statement") */
  modelLabel?: string;
  /**
   * If true, write cell references as formulas where possible (e.g. =B5).
   * If false, write values only (for use when block is standalone).
   */
  useFormulas?: boolean;
  /** Column for values (default 2) */
  valueCol?: number;
}

export interface ValuationBlockResult {
  /** Next row after the block */
  nextRow: number;
  /** Row of Enterprise Value */
  enterpriseValueRow: number;
  /** Row of Equity Value */
  equityValueRow: number;
  /** Row of Implied Share Price */
  impliedPriceRow: number;
  /** Row of Market Share Price input */
  marketPriceInputRow: number;
  /** Row of Upside % */
  upsideRow: number;
}

/**
 * Write the universal "Valuation & Share Price" block.
 * Units: USD millions (EV, Equity, Net Debt), Shares millions, Price $/share.
 */
export function writeValuationBlock(
  opts: ValuationBlockOptions
): ValuationBlockResult {
  const {
    sheet,
    startRow,
    inputs,
    enterpriseValue,
    evSourceLabel,
    evSourceDetail,
    modelLabel = 'Model',
    useFormulas = false,
    valueCol = 2,
  } = opts;

  let row = startRow;
  const B = valueCol;

  // Title
  sheet.getCell(row, 1).value = 'Valuation & Share Price';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  sheet.mergeCells(row, 1, row, 2);
  row++;

  sheet.getCell(row, 1).value = 'Units: USD (millions), Shares (millions), Price (USD/share)';
  sheet.getCell(row, 1).style = {
    ...createNormalStyle(),
    font: { ...createNormalStyle().font, size: 9 },
    alignment: { horizontal: 'left' },
  };
  row += 2;

  // A) INPUTS (boxed)
  const inputsStartRow = row;
  sheet.getCell(row, 1).value = 'Inputs';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  sheet.getCell(row, 1).value = 'Shares Outstanding';
  sheet.getCell(row, 2).value = inputs.sharesOutstanding;
  applyNumberFormat(sheet.getCell(row, B), 'INTEGER');
  applyLabelStyle(sheet.getCell(row, 1));
  applyInputCellStyle(sheet.getCell(row, B));
  row++;

  sheet.getCell(row, 1).value = 'Market Share Price';
  sheet.getCell(row, 2).value = inputs.marketSharePrice ?? null;
  applyNumberFormat(sheet.getCell(row, B), 'CURRENCY_DECIMALS');
  applyLabelStyle(sheet.getCell(row, 1));
  applyInputCellStyle(sheet.getCell(row, B));
  try {
    sheet.getCell(row, B).note = { texts: [{ font: { size: 9 }, text: 'Current trading price used for comparison.' }] };
  } catch {
    /* notes optional */
  }
  row++;

  sheet.getCell(row, 1).value = 'Net Debt';
  sheet.getCell(row, 2).value = inputs.netDebt;
  applyNumberFormat(sheet.getCell(row, B), 'CURRENCY');
  applyLabelStyle(sheet.getCell(row, 1));
  applyInputCellStyle(sheet.getCell(row, B));
  try {
    sheet.getCell(row, B).note = { texts: [{ font: { size: 9 }, text: 'Debt minus cash. Converts Enterprise Value to Equity Value.' }] };
  } catch {
    /* notes optional */
  }
  row++;

  applyBorders(sheet, inputsStartRow, row - 1, 1, 2, 'all');
  row += 2;

  // B) MODEL-SPECIFIC ENTERPRISE VALUE
  const evSectionStart = row;
  if (evSourceLabel) {
    sheet.getCell(row, 1).value = sanitizeWorkbookText(evSourceLabel);
    applyLabelStyle(sheet.getCell(row, 1));
    row++;
  }
  if (evSourceDetail) {
    sheet.getCell(row, 1).value = sanitizeWorkbookText(evSourceDetail);
    sheet.getCell(row, 1).style = { ...createNormalStyle(), font: { ...createNormalStyle().font, size: 9 }, alignment: { horizontal: 'left' } };
    row++;
  }

  const evValueRow = row;
  sheet.getCell(row, 1).value = 'Enterprise Value';
  if (enterpriseValue !== null && Number.isFinite(enterpriseValue)) {
    sheet.getCell(row, B).value = enterpriseValue;
    applyNumberFormat(sheet.getCell(row, B), 'CURRENCY');
  } else {
    sheet.getCell(row, B).value = 'N/A';
    sheet.getCell(row, B).style = createNormalStyle();
  }
  sheet.getCell(row, 1).style = { ...createTotalStyle(), alignment: { horizontal: 'left' } };
  sheet.getCell(row, B).style = createTotalStyle();
  row += 2;

  // C) EQUITY VALUE BRIDGE
  sheet.getCell(row, 1).value = 'Enterprise Value';
  if (useFormulas && enterpriseValue !== null) {
    setFormula(sheet.getCell(row, B), `=B${evValueRow}`, enterpriseValue);
  } else {
    sheet.getCell(row, B).value = enterpriseValue ?? 0;
  }
  applyNumberFormat(sheet.getCell(row, B), 'CURRENCY');
  sheet.getCell(row, 1).style = { ...createTotalStyle(), alignment: { horizontal: 'left' } };
  sheet.getCell(row, B).style = createTotalStyle();
  row++;

  sheet.getCell(row, 1).value = '(-) Net Debt';
  sheet.getCell(row, B).value = -inputs.netDebt;
  applyNumberFormat(sheet.getCell(row, B), 'CURRENCY');
  applyLabelStyle(sheet.getCell(row, 1));
  sheet.getCell(row, B).style = createFormulaStyle();
  row++;

  const equityValueRow = row;
  const equityValue = enterpriseValue !== null ? enterpriseValue - inputs.netDebt : 0;
  sheet.getCell(row, 1).value = '= Equity Value';
  sheet.getCell(row, B).value = equityValue;
  applyNumberFormat(sheet.getCell(row, B), 'CURRENCY');
  sheet.getCell(row, 1).style = { ...createTotalStyle(), alignment: { horizontal: 'left' } };
  sheet.getCell(row, B).style = createTotalStyle();
  row += 2;

  // D) IMPLIED SHARE PRICE
  const impliedPriceRow = row;
  const impliedPrice =
    inputs.sharesOutstanding > 0 && enterpriseValue !== null
      ? (enterpriseValue - inputs.netDebt) / inputs.sharesOutstanding
      : null;
  sheet.getCell(row, 1).value = '= Implied Share Price';
  if (impliedPrice !== null) {
    sheet.getCell(row, B).value = impliedPrice;
    applyNumberFormat(sheet.getCell(row, B), 'CURRENCY_DECIMALS');
  } else {
    sheet.getCell(row, B).value = 'N/A';
  }
  sheet.getCell(row, 1).style = { ...createTotalStyle(), alignment: { horizontal: 'left' } };
  sheet.getCell(row, B).style = createTotalStyle();
  row += 2;

  // E) MARKET COMPARISON
  sheet.getCell(row, 1).value = 'Market comparison';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  sheet.getCell(row, 1).value = 'Implied Share Price';
  sheet.getCell(row, B).value = impliedPrice ?? 'N/A';
  if (impliedPrice !== null) applyNumberFormat(sheet.getCell(row, B), 'CURRENCY_DECIMALS');
  applyLabelStyle(sheet.getCell(row, 1));
  sheet.getCell(row, B).style = createFormulaStyle();
  row++;

  const marketPriceInputRow = row;
  sheet.getCell(row, 1).value = 'Market Share Price (input)';
  sheet.getCell(row, B).value = inputs.marketSharePrice ?? null;
  applyNumberFormat(sheet.getCell(row, B), 'CURRENCY_DECIMALS');
  applyLabelStyle(sheet.getCell(row, 1));
  sheet.getCell(row, B).style = createFormulaStyle();
  row++;

  const upsideRow = row;
  const hasMarket = inputs.marketSharePrice != null && inputs.marketSharePrice > 0;
  const upsidePct = hasMarket && impliedPrice != null ? impliedPrice / inputs.marketSharePrice! - 1 : null;
  const diffPerShare = hasMarket && impliedPrice != null ? impliedPrice - inputs.marketSharePrice! : null;

  sheet.getCell(row, 1).value = '= Upside / (Downside) %';
  sheet.getCell(row, B).value = upsidePct != null ? upsidePct : 'N/A';
  if (typeof sheet.getCell(row, B).value === 'number') {
    sheet.getCell(row, B).numFmt = '0.0%';
  }
  applyLabelStyle(sheet.getCell(row, 1));
  sheet.getCell(row, B).style = createFormulaStyle();
  row++;

  sheet.getCell(row, 1).value = '= $ Difference per share';
  sheet.getCell(row, B).value = diffPerShare != null ? diffPerShare : 'N/A';
  if (typeof sheet.getCell(row, B).value === 'number') {
    applyNumberFormat(sheet.getCell(row, B), 'CURRENCY_DECIMALS');
  }
  applyLabelStyle(sheet.getCell(row, 1));
  sheet.getCell(row, B).style = createFormulaStyle();
  row += 2;

  // VALIDATION CHECKS
  sheet.getCell(row, 1).value =
    inputs.sharesOutstanding <= 0
      ? 'Shares must be greater than 0'
      : 'Shares OK';
  sheet.getCell(row, 1).style = {
    ...createNormalStyle(),
    font: {
      ...createNormalStyle().font,
      size: 9,
      color: { argb: inputs.sharesOutstanding <= 0 ? 'FFC00000' : 'FF008000' },
    },
    alignment: { horizontal: 'left' },
  };
  row++;

  sheet.getCell(row, 1).value = !hasMarket
    ? 'Market comparison unavailable'
    : 'Market comparison OK';
  sheet.getCell(row, 1).style = {
    ...createNormalStyle(),
    font: {
      ...createNormalStyle().font,
      size: 9,
      color: { argb: !hasMarket ? 'FF666666' : 'FF008000' },
    },
    alignment: { horizontal: 'left' },
  };

  return {
    nextRow: row + 1,
    enterpriseValueRow: evValueRow,
    equityValueRow,
    impliedPriceRow,
    marketPriceInputRow,
    upsideRow,
  };
}
