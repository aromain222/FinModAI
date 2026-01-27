/**
 * Safe Workbook Reader
 * 
 * Provides safe, explainable, and debuggable reading of named ranges from Excel workbooks.
 * Never returns null - always returns an object with value or missing reason.
 */

import ExcelJS from 'exceljs';

export interface ReadNamedNumberResult {
  value?: number;
  missing?: string;
}

function getDefinedNameRange(
  workbook: ExcelJS.Workbook,
  name: string
): string | null {
  const model: any = (workbook as any).definedNames?.model;
  const names: any[] | undefined = model?.names;
  if (!Array.isArray(names)) return null;

  const hit = names.find((n) => n?.name === name);
  if (!hit) return null;
  const ranges = (hit as any).ranges;
  if (Array.isArray(ranges) && ranges.length > 0) {
    const first = ranges[0];
    // ExcelJS sometimes stores as string or { range }
    return typeof first === 'string' ? first : (first?.range as string | undefined) ?? null;
  }
  return null;
}

/**
 * Safely read a numeric value from a named range in an Excel workbook.
 * 
 * @param workbook - The ExcelJS workbook to read from
 * @param name - The name of the named range (e.g., 'CB_OUT_SHARES_OUT')
 * @returns Object with `value` (if found and numeric) or `missing` (reason if not found/invalid)
 * 
 * @example
 * const result = readNamedNumber(workbook, 'CB_OUT_SHARES_OUT');
 * if (result.value !== undefined) {
 *   console.log(`Shares: ${result.value}`);
 * } else {
 *   console.warn(`Shares missing: ${result.missing}`);
 * }
 */
export function readNamedNumber(
  workbook: ExcelJS.Workbook,
  name: string
): ReadNamedNumberResult {
  // Step 1: Check if workbook is valid
  if (!workbook) {
    return { missing: `Workbook is null or undefined` };
  }

  // Step 2: Check if named range exists
  const reference = getDefinedNameRange(workbook, name);
  if (!reference) {
    // List available named ranges for debugging
    const model: any = (workbook as any).definedNames?.model;
    const names: any[] = model?.names || [];
    const availableNames = names.map((n: any) => n?.name).filter(Boolean);
    return {
      missing: `Named range '${name}' does not exist. Available names: ${availableNames.length > 0 ? availableNames.join(', ') : 'none'}`,
    };
  }

  // Step 4: Extract sheet name and cell address
  // Format: "SheetName!$B$45" or "'Sheet Name'!$B$45"
  const match = reference.match(/^(?:'([^']+)'|([^!]+))!\$([A-Z]+)\$(\d+)$/);
  if (!match) {
    return { missing: `Named range '${name}' has unsupported reference format: ${reference}` };
  }

  const sheetName = match[1] || match[2];
  const col = match[3];
  const row = parseInt(match[4], 10);

  // Step 5: Get the worksheet
  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) {
    const availableSheets = workbook.worksheets.map(ws => ws.name);
    return {
      missing: `Sheet '${sheetName}' not found for named range '${name}'. Available sheets: ${availableSheets.join(', ')}`,
    };
  }

  // Step 6: Get the cell
  const cell = worksheet.getCell(`${col}${row}`);
  if (!cell) {
    return { missing: `Cell ${col}${row} not found in sheet '${sheetName}' for named range '${name}'` };
  }

  // Step 7: Extract and validate numeric value
  const rawValue = cell.value;

  // Handle formula cells (use result if available)
  if (rawValue && typeof rawValue === 'object' && 'result' in rawValue) {
    const formulaValue = rawValue as { result?: number | string | null; formula?: string };
    const result = formulaValue.result;
    
    if (result === null || result === undefined) {
      return {
        missing: `Named range '${name}' (${reference}) is a formula with no result. Formula: ${formulaValue.formula || 'unknown'}`,
      };
    }
    
    if (typeof result === 'number') {
      if (!Number.isFinite(result)) {
        return { missing: `Named range '${name}' (${reference}) contains non-finite number: ${result}` };
      }
      return { value: result };
    }
    
    if (typeof result === 'string') {
      const parsed = parseNumericString(result);
      if (parsed === null) {
        return {
          missing: `Named range '${name}' (${reference}) formula result is non-numeric string: "${result}"`,
        };
      }
      return { value: parsed };
    }
    
    return {
      missing: `Named range '${name}' (${reference}) formula result is unexpected type: ${typeof result}`,
    };
  }

  // Handle direct numeric values
  if (typeof rawValue === 'number') {
    if (!Number.isFinite(rawValue)) {
      return { missing: `Named range '${name}' (${reference}) contains non-finite number: ${rawValue}` };
    }
    return { value: rawValue };
  }

  // Handle string values (try to parse)
  if (typeof rawValue === 'string') {
    const parsed = parseNumericString(rawValue);
    if (parsed === null) {
      return {
        missing: `Named range '${name}' (${reference}) contains non-numeric string: "${rawValue}"`,
      };
    }
    return { value: parsed };
  }

  // Handle null/undefined
  if (rawValue === null || rawValue === undefined) {
    return { missing: `Named range '${name}' (${reference}) is empty (null or undefined)` };
  }

  // Handle other types
  return {
    missing: `Named range '${name}' (${reference}) contains unexpected type: ${typeof rawValue} (${JSON.stringify(rawValue)})`,
  };
}

/**
 * Parse a string into a number, handling currency symbols, commas, and other formatting.
 */
function parseNumericString(str: string): number | null {
  if (!str || typeof str !== 'string') {
    return null;
  }

  // Remove common formatting: currency symbols, commas, spaces, parentheses (for negatives)
  const cleaned = str
    .trim()
    .replace(/[$€£¥,\s]/g, '')
    .replace(/^\(/, '-') // Negative numbers in parentheses: (123) -> -123
    .replace(/\)$/, '');

  // Handle percentage strings
  if (cleaned.endsWith('%')) {
    const num = Number(cleaned.slice(0, -1));
    if (Number.isFinite(num)) {
      return num / 100; // Convert percentage to decimal
    }
    return null;
  }

  // Try to parse as number
  const parsed = Number(cleaned);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  // Handle special cases like "N/A", "—", etc.
  const normalized = cleaned.toUpperCase();
  if (['N/A', 'NA', '—', '-', 'NULL', 'UNDEFINED'].includes(normalized)) {
    return null;
  }

  return null;
}

/**
 * Read multiple named numbers at once, returning a map of results.
 * Useful for reading all valuation outputs in one call.
 */
export function readNamedNumbers(
  workbook: ExcelJS.Workbook,
  names: string[]
): Record<string, ReadNamedNumberResult> {
  const results: Record<string, ReadNamedNumberResult> = {};
  for (const name of names) {
    results[name] = readNamedNumber(workbook, name);
  }
  return results;
}

export interface ReadNamedTextResult {
  value?: string;
  missing?: string;
}

/**
 * Safely read a text value from a named range in an Excel workbook.
 * Used for metadata like units ("mm" or "actual").
 * 
 * @param workbook - The ExcelJS workbook to read from
 * @param name - The name of the named range (e.g., 'CB_META_UNITS')
 * @returns Object with `value` (if found) or `missing` (reason if not found/invalid)
 */
export function readNamedText(
  workbook: ExcelJS.Workbook,
  name: string
): ReadNamedTextResult {
  // Step 1: Check if workbook is valid
  if (!workbook) {
    return { missing: `Workbook is null or undefined` };
  }

  // Step 2: Check if named range exists
  const reference = getDefinedNameRange(workbook, name);

  if (!reference) {
    const model: any = (workbook as any).definedNames?.model;
    const names: any[] = model?.names || [];
    const availableNames = names.map((n: any) => n?.name).filter(Boolean);
    return {
      missing: `Named range '${name}' does not exist. Available names: ${
        availableNames.length > 0 ? availableNames.join(', ') : 'none'
      }`,
    };
  }

  // Step 4: Extract sheet name and cell address
  const match = reference.match(/^(?:'([^']+)'|([^!]+))!\$([A-Z]+)\$(\d+)$/);
  if (!match) {
    return { missing: `Named range '${name}' has unsupported reference format: ${reference}` };
  }

  const sheetName = match[1] || match[2];
  const col = match[3];
  const row = parseInt(match[4], 10);

  // Step 5: Get the worksheet
  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) {
    const availableSheets = workbook.worksheets.map(ws => ws.name);
    return {
      missing: `Sheet '${sheetName}' not found for named range '${name}'. Available sheets: ${availableSheets.join(', ')}`,
    };
  }

  // Step 6: Get the cell
  const cell = worksheet.getCell(`${col}${row}`);
  if (!cell) {
    return { missing: `Cell ${col}${row} not found in sheet '${sheetName}' for named range '${name}'` };
  }

  // Step 7: Extract text value
  const rawValue = cell.value;

  if (rawValue === null || rawValue === undefined) {
    return { missing: `Named range '${name}' (${reference}) is empty (null or undefined)` };
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return { missing: `Named range '${name}' (${reference}) contains empty string` };
    }
    return { value: trimmed };
  }

  if (typeof rawValue === 'number') {
    return { value: String(rawValue) };
  }

  // Handle formula cells
  if (rawValue && typeof rawValue === 'object' && 'result' in rawValue) {
    const formulaValue = rawValue as { result?: number | string | null; formula?: string };
    const result = formulaValue.result;
    
    if (result === null || result === undefined) {
      return {
        missing: `Named range '${name}' (${reference}) is a formula with no result. Formula: ${formulaValue.formula || 'unknown'}`,
      };
    }
    
    if (typeof result === 'string') {
      const trimmed = result.trim();
      return trimmed ? { value: trimmed } : { missing: `Named range '${name}' (${reference}) formula result is empty string` };
    }
    
    return { value: String(result) };
  }

  return {
    missing: `Named range '${name}' (${reference}) contains unexpected type: ${typeof rawValue} (${JSON.stringify(rawValue)})`,
  };
}
