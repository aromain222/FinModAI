import type ExcelJS from 'exceljs';

/**
 * Excel address utilities to keep all column/row validation in one place.
 * Guards against treating arbitrary strings (e.g. "DCFMC") as column letters.
 */
const MAX_COLUMN_INDEX = 16384; // XFD
const MAX_ROW_INDEX = 1_048_576;
const COLUMN_LETTERS_REGEX = /^[A-Z]{1,3}$/;
const ADDRESS_REGEX = /^(?:'([^']+)'|([^'!]+))!\$([A-Z]{1,3})\$(\d+)$/;

export function assertValidColumnLetters(letters: string, context = 'column'): string {
  if (!COLUMN_LETTERS_REGEX.test(letters)) {
    throw new Error(`INVALID_COLUMN_LETTERS(${context}): ${letters}`);
  }
  const idx = columnLettersToNumber(letters);
  if (idx < 1 || idx > MAX_COLUMN_INDEX) {
    throw new Error(`INVALID_COLUMN_INDEX(${context}): ${letters} -> ${idx} (must be 1..${MAX_COLUMN_INDEX})`);
  }
  return letters;
}

export function columnLettersToNumber(letters: string): number {
  const upper = letters.toUpperCase();
  let number = 0;
  for (let i = 0; i < upper.length; i++) {
    number = number * 26 + (upper.charCodeAt(i) - 64);
  }
  return number;
}

export function columnNumberToLetter(column: number): string {
  if (!Number.isInteger(column) || column < 1 || column > MAX_COLUMN_INDEX) {
    throw new Error(`INVALID_COLUMN_NUMBER: ${column} (must be integer 1..${MAX_COLUMN_INDEX})`);
  }
  let temp = column;
  let letter = '';
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return assertValidColumnLetters(letter);
}

export function parseA1Address(address: string) {
  const match = address.match(ADDRESS_REGEX);
  if (!match) {
    throw new Error(`INVALID_A1_ADDRESS: ${address}`);
  }
  const sheet = match[1] ?? match[2];
  const colLetters = assertValidColumnLetters(match[3], `address:${address}`);
  const rowIndex = Number.parseInt(match[4], 10);
  if (!Number.isInteger(rowIndex) || rowIndex < 1 || rowIndex > MAX_ROW_INDEX) {
    throw new Error(`INVALID_ROW_INDEX(address:${address}): ${rowIndex} (must be 1..${MAX_ROW_INDEX})`);
  }
  return {
    sheet,
    colLetters,
    colIndex: columnLettersToNumber(colLetters),
    rowIndex,
  };
}

export function assertValidAddress(address: string, context = 'address') {
  parseA1Address(address); // throws with context-rich message
  return address;
}

/**
 * Add a named range with strict validation. If invalid and allowSkip=true, logs and returns false.
 */
export function addNamedRangeValidated(
  workbook: ExcelJS.Workbook,
  name: string,
  address: string,
  opts?: { allowSkip?: boolean; modelType?: string }
): boolean {
  try {
    assertValidAddress(address, `definedName:${name}`);
    workbook.definedNames.add(name, address);
    return true;
  } catch (err: any) {
    const payload = { name, address, modelType: opts?.modelType, err: String(err?.message ?? err) };
    if (opts?.allowSkip) {
      console.error('[addNamedRangeValidated] skipped invalid defined name', payload);
      return false;
    }
    console.error('[addNamedRangeValidated] failed', payload);
    throw err;
  }
}

export const ADDRESS_REGEX_STRICT = ADDRESS_REGEX;
