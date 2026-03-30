const WORKBOOK_CHAR_REPLACEMENTS: Array<[RegExp, string]> = [
  [/[\u2013\u2014]/g, '-'],
  [/\u2022/g, '- '],
  [/\u00d7/g, 'x'],
  [/[\u2018\u2019]/g, "'"],
  [/[\u201c\u201d]/g, '"'],
  [/\u2026/g, '...'],
  [/\u00a0/g, ' '],
];

export const WORKBOOK_FONT_NAME = 'Calibri';
export const WORKBOOK_TEXT_PLACEHOLDER = 'n/a';

export function sanitizeWorkbookText(value: string): string {
  let normalized = value.normalize('NFKD');
  for (const [pattern, replacement] of WORKBOOK_CHAR_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  normalized = normalized.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
  normalized = normalized.replace(/[ \t]{2,}/g, ' ');
  normalized = normalized.replace(/ ?\n ?/g, '\n');
  return normalized.trim();
}

export function sanitizeWorkbookValue<T>(value: T): T {
  if (typeof value !== 'string') return value;
  return sanitizeWorkbookText(value) as T;
}

export function workbookPlaceholder(value?: string | null): string {
  if (value && value.trim()) return sanitizeWorkbookText(value);
  return WORKBOOK_TEXT_PLACEHOLDER;
}
