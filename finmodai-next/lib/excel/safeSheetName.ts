import ExcelJS from 'exceljs';

const INVALID_SHEET_NAME_CHARS = /[\\/*?:[\]]/g;
const MAX_SHEET_NAME_LENGTH = 31;

export function sanitizeWorksheetName(name: string | undefined | null, fallback = 'Sheet'): string {
  const base = (name ?? '').toString().trim() || fallback;
  const cleaned = base.replace(INVALID_SHEET_NAME_CHARS, ' - ').replace(/\s+/g, ' ').trim();
  const truncated = cleaned.slice(0, MAX_SHEET_NAME_LENGTH).trim();
  return truncated || fallback;
}

export function toUniqueWorksheetName(workbook: ExcelJS.Workbook, desiredName: string, fallback = 'Sheet'): string {
  const initial = sanitizeWorksheetName(desiredName, fallback);
  const existing = new Set(workbook.worksheets.map((sheet) => sheet.name.toLowerCase()));
  if (!existing.has(initial.toLowerCase())) {
    return initial;
  }

  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const suffixText = ` (${suffix})`;
    const baseMaxLength = MAX_SHEET_NAME_LENGTH - suffixText.length;
    const base = initial.slice(0, Math.max(baseMaxLength, 1)).trim() || fallback;
    const candidate = `${base}${suffixText}`;
    if (!existing.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return `${fallback.slice(0, 27)}_999`;
}
