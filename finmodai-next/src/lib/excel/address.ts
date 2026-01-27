// src/lib/excel/address.ts
export class ExcelAddressError extends Error {
  constructor(message: string, public meta?: Record<string, any>) {
    super(message);
    this.name = "ExcelAddressError";
  }
}

const A1_CELL = /^\$?[A-Z]{1,3}\$?[1-9]\d{0,6}$/;
const A1_RANGE = new RegExp(`^(${A1_CELL.source}):(${A1_CELL.source})$`);
const SHEET = /^(?:[A-Za-z0-9_]+|'(?:[^']|'')+')$/;

function splitSheetRef(input: string) {
  const raw = String(input ?? "").trim();
  const i = raw.indexOf("!");
  if (i === -1) return { sheet: null as string | null, ref: raw };
  return { sheet: raw.slice(0, i).trim(), ref: raw.slice(i + 1).trim() };
}

export function assertValidA1CellRef(input: string, ctx?: Record<string, any>) {
  const { sheet, ref } = splitSheetRef(input);
  if (sheet) {
    throw new ExcelAddressError(`ExcelAddressError: invalid A1 address "${input}"`, ctx);
  }

  const target = ref.toUpperCase();
  const ok = A1_CELL.test(target) || A1_RANGE.test(target);
  if (!ok) {
    throw new ExcelAddressError(`ExcelAddressError: invalid A1 address "${input}"`, ctx);
  }
  return target;
}

export function assertValidSheetQualifiedRef(input: string, ctx?: Record<string, any>) {
  const { sheet, ref } = splitSheetRef(input);
  const targetRef = ref.toUpperCase();
  const refOk = A1_CELL.test(targetRef) || A1_RANGE.test(targetRef);
  if (!refOk) {
    throw new ExcelAddressError(`ExcelAddressError: invalid A1 address "${input}"`, ctx);
  }

  if (sheet && !SHEET.test(sheet)) {
    throw new ExcelAddressError(`ExcelAddressError: invalid sheet name "${sheet}"`, ctx);
  }

  // Preserve original sheet casing; uppercase ref for consistency
  return sheet ? `${sheet}!${targetRef}` : targetRef;
}

// Legacy alias retained for compatibility
export const assertValidExcelRef = assertValidSheetQualifiedRef;

export function toExcelJSRef(input: string) {
  const { sheet, ref } = splitSheetRef(input);
  if (!sheet) return ref.toUpperCase();

  // If sheet is quoted, unquote for ExcelJS safety:  'DCF Model' -> DCF Model
  let clean = sheet;
  if (clean.startsWith("'") && clean.endsWith("'")) clean = clean.slice(1, -1).replace(/''/g, "'");
  return `${clean}!${ref.toUpperCase()}`;
}
