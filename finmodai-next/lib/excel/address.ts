// lib/excel/address.ts
import {
  ExcelAddressError,
  assertValidA1CellRef as baseAssertValidA1CellRef,
  assertValidSheetQualifiedRef as baseAssertValidSheetQualifiedRef,
  toExcelJSRef,
} from "@/src/lib/excel/address";

export { toExcelJSRef, ExcelAddressError };

const MAX_COL = 16384; // XFD
const MAX_ROW = 1048576;

const A1_CELL = /^\$?[A-Z]{1,3}\$?[1-9]\d{0,6}$/;
const A1_RANGE = new RegExp(`^(${A1_CELL.source}):(${A1_CELL.source})$`);

export function isValidExcelColumn(col: string): boolean {
  if (!col || typeof col !== "string") return false;
  const c = col.toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(c)) return false;

  // Convert letters to 1-based index
  let n = 0;
  for (let i = 0; i < c.length; i++) n = n * 26 + (c.charCodeAt(i) - 64);
  return n >= 1 && n <= MAX_COL;
}

export function isValidExcelRow(row: number): boolean {
  return Number.isInteger(row) && row >= 1 && row <= MAX_ROW;
}

export function isValidA1Address(addr: string): boolean {
  if (!addr || typeof addr !== "string") return false;
  const a = addr.toUpperCase().trim();

  // A1 or $A$1
  const m = a.match(/^\$?([A-Z]{1,3})\$?([1-9]\d{0,6})$/);
  if (!m) return false;

  const col = m[1];
  const row = Number(m[2]);
  return isValidExcelColumn(col) && isValidExcelRow(row);
}

export function isValidA1Range(range: string): boolean {
  if (!range || typeof range !== "string") return false;
  const r = range.toUpperCase().trim();
  const parts = r.split(":");
  if (parts.length !== 2) return false;
  return isValidA1Address(parts[0]) && isValidA1Address(parts[1]);
}

export function assertValidA1CellRef(ref: string, ctx?: Record<string, any> | string): string {
  const meta = typeof ctx === 'string' ? { ctx } : ctx;
  return baseAssertValidA1CellRef(ref, meta);
}

export function assertValidSheetQualifiedRef(ref: string, ctx?: Record<string, any> | string): string {
  const meta = typeof ctx === 'string' ? { ctx } : ctx;
  return baseAssertValidSheetQualifiedRef(ref, meta);
}

export function assertValidExcelColumn(col: string, ctx?: string): string {
  if (!isValidExcelColumn(col)) {
    throw new Error(
      `ExcelAddressError: invalid column "${col}"${ctx ? ` (${ctx})` : ""}`
    );
  }
  return col.toUpperCase();
}

export function assertValidA1Address(addr: string, ctx?: string): string {
  if (!isValidA1Address(addr)) {
    throw new Error(
      `ExcelAddressError: invalid A1 address "${addr}"${ctx ? ` (${ctx})` : ""}`
    );
  }
  return addr.toUpperCase().trim();
}

export function assertValidA1Range(range: string, ctx?: string): string {
  if (!isValidA1Range(range)) {
    throw new Error(
      `ExcelAddressError: invalid A1 range "${range}"${ctx ? ` (${ctx})` : ""}`
    );
  }
  return range.toUpperCase().trim();
}

/**
 * Named ranges: Excel allows lots, but your bug is mixing these with A1.
 * So: validate that named ranges are NOT A1-like, and are sane identifiers.
 */
export function assertValidNamedRangeName(name: string, ctx?: string): string {
  if (!name || typeof name !== "string") {
    throw new Error(`ExcelNameError: empty name${ctx ? ` (${ctx})` : ""}`);
  }
  const n = name.trim();

  // If it looks like A1 or A1:B2, it's NOT a name in your system (it's an address).
  if (isValidA1Address(n) || isValidA1Range(n)) {
    throw new Error(
      `ExcelNameError: named range "${n}" looks like an address${ctx ? ` (${ctx})` : ""}`
    );
  }

  // Keep it strict to avoid accidental garbage: start with letter/_ then letters/digits/._ only
  // (You can loosen later, but strict is demo-safe.)
  if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(n)) {
    throw new Error(
      `ExcelNameError: invalid named range "${n}"${ctx ? ` (${ctx})` : ""}`
    );
  }

  return n;
}

/**
 * Convert column number (1-based) to letter (A-Z, AA-ZZ, etc.)
 */
export function columnNumberToLetter(column: number): string {
  if (!Number.isInteger(column) || column <= 0) {
    throw new Error(`ExcelAddressError: column must be positive integer, got ${column}`);
  }
  let letter = '';
  let n = column;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

/**
 * Legacy alias for backward compatibility
 */
export function assertValidAddress(addr: string, ctx?: string): string {
  const trimmed = addr?.trim?.();
  if (!trimmed) {
    throw new Error(
      `ExcelAddressError: invalid A1 address "${addr}"${ctx ? ` (${ctx})` : ""}`
    );
  }

  // Allow bare cell or range only (no sheet qualifiers)
  if (trimmed.includes(":")) {
    return assertValidA1Range(trimmed, ctx);
  }
  return assertValidA1Address(trimmed, ctx);
}

/**
 * Quote sheet name if it contains spaces or special chars
 */
export function quoteSheetName(sheetName: string): string {
  // Quote if it contains spaces or special chars
  return /^[A-Za-z0-9_.]+$/.test(sheetName) ? sheetName : `'${sheetName.replace(/'/g, "''")}'`;
}

/**
 * Allows: Sheet!$C$1 or 'DCF Model'!$C$1
 */
export function isValidSheetQualifiedA1(ref: string): boolean {
  if (!ref || typeof ref !== "string") return false;
  if (ref.includes(":")) return false;
  try {
    assertValidSheetQualifiedRef(ref);
    return true;
  } catch {
    return false;
  }
}

/**
 * Allows: Sheet!$A$1:$B$2 or 'DCF Model'!$A$1:$B$2
 */
export function isValidSheetQualifiedRange(ref: string): boolean {
  if (!ref || typeof ref !== "string") return false;
  if (!ref.includes(":")) return false;
  try {
    assertValidSheetQualifiedRef(ref);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a defined name reference (can be A1, A1:B2, Sheet!A1, or Sheet!A1:B2)
 */
export function assertValidDefinedNameRef(ref: string, ctx?: string): string {
  const r = ref?.trim?.();
  if (!r) {
    throw new Error(
      `ExcelAddressError: invalid defined-name ref "${ref}"${ctx ? ` (${ctx})` : ""}`
    );
  }

  try {
    // Accept bare or sheet-qualified refs (cell or range)
    return assertValidSheetQualifiedRef(r, ctx ? { definedName: ctx } : undefined);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : `ExcelAddressError: invalid defined-name ref "${ref}"`;
    throw new Error(`${message}${ctx ? ` (${ctx})` : ""}`);
  }
}

/**
 * @deprecated Use addNamedRangeSafe from lib/excel/namedRanges.ts with named params instead
 * Thin wrapper for backward compatibility
 */
export function addNamedRangeValidated(
  workbook: ExcelJS.Workbook,
  name: string,
  address: string,
  opts?: { allowSkip?: boolean; modelType?: string }
) {
  // Import the new API
  const { addNamedRangeSafe: addNamedRangeSafeNew } = require('@/lib/excel/namedRanges');
  
  // Call with named params
  addNamedRangeSafeNew(workbook, {
    name,
    ref: address,
    context: opts ? { modelType: opts.modelType } : undefined
  });
}
