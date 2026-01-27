// lib/excel/namedRanges.ts
import type ExcelJS from 'exceljs';

/**
 * Unambiguous API for adding Excel defined names.
 * Uses named parameters to prevent argument swapping.
 * 
 * @param workbook - ExcelJS workbook instance
 * @param params - Named parameters object
 * @param params.name - Defined name (e.g., "CB_META_UNITS")
 * @param params.ref - Excel reference (e.g., "$C$1" or "'DCF Model'!$C$1")
 * @param params.context - Optional context for error messages
 * 
 * @throws Error if arguments are swapped or invalid
 */
export function addNamedRangeSafe(
  workbook: ExcelJS.Workbook,
  params: { name: string; ref: string; context?: Record<string, any> }
): void {
  const { name, ref, context } = params;

  // Validate name is not empty
  if (!name || typeof name !== 'string') {
    throw new Error(
      `ExcelNameError: name must be a non-empty string${formatContext(context)}`
    );
  }

  // Validate ref is not empty
  if (!ref || typeof ref !== 'string') {
    throw new Error(
      `ExcelAddressError: ref must be a non-empty string${formatContext(context)}`
    );
  }

  const trimmedName = name.trim();
  const trimmedRef = ref.trim();

  // SWAP DETECTION: Check if name looks like a ref
  if (
    trimmedName.includes('!') ||
    trimmedName.includes('$') ||
    trimmedName.includes(':') ||
    /^\$?[A-Z]{1,3}\$?[1-9]\d{0,6}$/.test(trimmedName) || // A1 cell
    /^\$?[A-Z]{1,3}\$?[1-9]\d{0,6}:\$?[A-Z]{1,3}\$?[1-9]\d{0,6}$/.test(trimmedName) // A1:B2 range
  ) {
    throw new Error(
      `SWAPPED_ARGS: "name" looks like an Excel ref ("${trimmedName}"). ` +
      `Did you swap name and ref?${formatContext(context)}`
    );
  }

  // SWAP DETECTION: Check if ref looks like a name token (and has no digits)
  if (
    /^[A-Za-z_][A-Za-z0-9_.]*$/.test(trimmedRef) &&
    !/\d/.test(trimmedRef) &&
    !trimmedRef.includes('!') &&
    !trimmedRef.includes('$') &&
    !trimmedRef.includes(':')
  ) {
    throw new Error(
      `SWAPPED_ARGS: "ref" looks like a name token ("${trimmedRef}"). ` +
      `Did you swap name and ref?${formatContext(context)}`
    );
  }

  // Validate name is a proper defined name token
  // Allow: letters, digits, underscore, dot
  // Must start with letter or underscore
  // No: !, $, :, or pure digits
  if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(trimmedName)) {
    throw new Error(
      `ExcelNameError: invalid defined name "${trimmedName}". ` +
      `Must start with letter/underscore, contain only letters/digits/underscore/dot${formatContext(context)}`
    );
  }

  // Validate ref is an Excel reference
  // Allow: $C$1, $C$1:$D$10, Sheet1!$C$1, 'DCF Model'!$C$1
  const refValidation = validateExcelRef(trimmedRef);
  if (!refValidation.valid) {
    throw new Error(
      `ExcelAddressError: invalid Excel ref "${trimmedRef}". ${refValidation.reason}${formatContext(context)}`
    );
  }

  // Normalize sheet-qualified refs for ExcelJS
  // ExcelJS doesn't like quoted sheet names in definedNames.add
  const normalizedRef = normalizeRefForExcelJS(trimmedRef);

  // ExcelJS API: definedNames.add(name, address)
  // Note: ExcelJS uses (name, address) order, not (address, name)
  try {
    workbook.definedNames.add(trimmedName, normalizedRef);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to add defined name "${trimmedName}" -> "${normalizedRef}": ${message}${formatContext(context)}`
    );
  }
}

/**
 * Validate Excel reference format
 */
function validateExcelRef(ref: string): { valid: boolean; reason?: string } {
  // Pattern for A1 cell: $C$1, C1, $C1, C$1
  const A1_CELL = /^\$?[A-Z]{1,3}\$?[1-9]\d{0,6}$/;
  
  // Pattern for A1 range: $C$1:$D$10
  const A1_RANGE = /^\$?[A-Z]{1,3}\$?[1-9]\d{0,6}:\$?[A-Z]{1,3}\$?[1-9]\d{0,6}$/;
  
  // Pattern for sheet name: Sheet1 or 'DCF Model' (quoted if spaces/special chars)
  const SHEET = /^(?:[A-Za-z0-9_]+|'(?:[^']|'')+')$/;

  // Check if sheet-qualified
  const bangIndex = ref.indexOf('!');
  if (bangIndex !== -1) {
    const sheet = ref.slice(0, bangIndex);
    const addr = ref.slice(bangIndex + 1);

    if (!SHEET.test(sheet)) {
      return { valid: false, reason: `Invalid sheet name "${sheet}"` };
    }

    if (!A1_CELL.test(addr) && !A1_RANGE.test(addr)) {
      return { valid: false, reason: `Invalid A1 address "${addr}"` };
    }

    return { valid: true };
  }

  // Bare ref (no sheet)
  if (A1_CELL.test(ref) || A1_RANGE.test(ref)) {
    return { valid: true };
  }

  return { valid: false, reason: 'Not a valid A1 cell or range' };
}

/**
 * Normalize sheet-qualified refs for ExcelJS
 * ExcelJS doesn't like quoted sheet names in definedNames.add
 * 'DCF Model'!$C$1 -> DCF Model!$C$1
 */
function normalizeRefForExcelJS(ref: string): string {
  const bangIndex = ref.indexOf('!');
  if (bangIndex === -1) {
    // No sheet qualifier, return as-is (uppercase for consistency)
    return ref.toUpperCase();
  }

  const sheet = ref.slice(0, bangIndex);
  const addr = ref.slice(bangIndex + 1);

  // Unquote sheet name if quoted
  let cleanSheet = sheet;
  if (cleanSheet.startsWith("'") && cleanSheet.endsWith("'")) {
    cleanSheet = cleanSheet.slice(1, -1).replace(/''/g, "'");
  }

  // Return normalized ref with uppercase address
  return `${cleanSheet}!${addr.toUpperCase()}`;
}

/**
 * Format context object for error messages
 */
function formatContext(context?: Record<string, any>): string {
  if (!context || Object.keys(context).length === 0) return '';
  
  const parts = Object.entries(context)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(', ');
  
  return ` (${parts})`;
}
