import type ExcelJS from 'exceljs';

export function sanitizeNumber(input: any): number | null {
  if (input === null || input === undefined) {
    return null;
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      return null;
    }
    if (Math.abs(input) > 1e15) {
      return null;
    }
    return input;
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }
    const normalized = trimmed.replace(/,/g, '');
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    if (Math.abs(parsed) > 1e15) {
      return null;
    }
    return parsed;
  }

  if (typeof input === 'boolean') {
    return input ? 1 : 0;
  }

  return null;
}

export function sanitizeText(input: any): string | null {
  if (input === null || input === undefined) {
    return null;
  }
  if (typeof input === 'string') {
    return input;
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      return null;
    }
    return String(input);
  }
  if (typeof input === 'boolean') {
    return input ? 'TRUE' : 'FALSE';
  }
  try {
    return JSON.stringify(input);
  } catch {
    return null;
  }
}

export function setCellSafeNumber(
  ws: ExcelJS.Worksheet,
  ref: string,
  value: any
): void {
  const cell = ws.getCell(ref);
  setCellInstanceSafeNumber(cell, value);
}

export function setCellSafeText(
  ws: ExcelJS.Worksheet,
  ref: string,
  value: any
): void {
  const cell = ws.getCell(ref);
  setCellInstanceSafeText(cell, value);
}

export function setCellSafeFormula(
  ws: ExcelJS.Worksheet,
  ref: string,
  formula: string | null | undefined,
  fallbackValue?: any
): void {
  const cell = ws.getCell(ref);
  setCellInstanceSafeFormula(cell, formula, fallbackValue);
}

export function setCellInstanceSafeNumber(cell: ExcelJS.Cell, value: any): void {
  const n = sanitizeNumber(value);
  cell.value = n === null ? null : n;
}

export function setCellInstanceSafeText(cell: ExcelJS.Cell, value: any): void {
  const text = sanitizeText(value);
  cell.value = text === null ? null : text;
}

export function setCellInstanceSafeFormula(
  cell: ExcelJS.Cell,
  formula: string | null | undefined,
  fallbackValue?: any
): void {
  if (!formula || typeof formula !== 'string' || !formula.trim().length) {
    if (fallbackValue !== undefined) {
      setCellInstanceSafeNumber(cell, fallbackValue);
    } else {
      cell.value = null;
    }
    return;
  }

  const trimmed = formula.trim();
  const excelFormula = trimmed.startsWith('=') ? trimmed.slice(1) : trimmed;
  const sanitizedFallback =
    fallbackValue === undefined ? null : sanitizeNumber(fallbackValue);
  cell.value = { formula: excelFormula, result: sanitizedFallback };
}
