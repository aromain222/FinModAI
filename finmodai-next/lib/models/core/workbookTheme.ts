import type ExcelJS from 'exceljs';

export type WorkbookAccent = 'slate' | 'emerald' | 'blue' | 'amber' | 'rose';

type WorkbookTheme = {
  tabColor: string;
  headerFill: string;
  headerFont: string;
  headerBorder: string;
  gridBorder: string;
  inputFill: string;
};

const THEMES: Record<WorkbookAccent, WorkbookTheme> = {
  slate: {
    tabColor: 'FF64748B',
    headerFill: 'FFE2E8F0',
    headerFont: 'FF0F172A',
    headerBorder: 'FFCBD5E1',
    gridBorder: 'FFE2E8F0',
    inputFill: 'FFFEF9C3',
  },
  emerald: {
    tabColor: 'FF10B981',
    headerFill: 'FFD1FAE5',
    headerFont: 'FF064E3B',
    headerBorder: 'FF6EE7B7',
    gridBorder: 'FFA7F3D0',
    inputFill: 'FFECFDF5',
  },
  blue: {
    tabColor: 'FF3B82F6',
    headerFill: 'FFDBEAFE',
    headerFont: 'FF1E3A8A',
    headerBorder: 'FF93C5FD',
    gridBorder: 'FFBFDBFE',
    inputFill: 'FFEFF6FF',
  },
  amber: {
    tabColor: 'FFF59E0B',
    headerFill: 'FFFEF3C7',
    headerFont: 'FF78350F',
    headerBorder: 'FFFCD34D',
    gridBorder: 'FFFDE68A',
    inputFill: 'FFFFFBEB',
  },
  rose: {
    tabColor: 'FFF43F5E',
    headerFill: 'FFFFE4E6',
    headerFont: 'FF881337',
    headerBorder: 'FFFDA4AF',
    gridBorder: 'FFFECDD3',
    inputFill: 'FFFFF1F2',
  },
};

const DEFAULT_HEADER_FILL = 'FFE2E8F0';
const DEFAULT_HEADER_FONT = 'FF0F172A';
const DEFAULT_HEADER_BORDER = 'FFCBD5E1';
const DEFAULT_GRID_BORDER = 'FFE2E8F0';
const DEFAULT_INPUT_FILL = 'FFFEF9C3';

function readArgb(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as { argb?: string };
  if (typeof row.argb !== 'string') return null;
  return row.argb.toUpperCase();
}

function normalizeAccent(raw: unknown): WorkbookAccent {
  if (typeof raw !== 'string') return 'slate';
  const value = raw.trim().toLowerCase();
  if (value === 'emerald' || value === 'blue' || value === 'amber' || value === 'rose' || value === 'slate') {
    return value;
  }
  return 'slate';
}

function extractThemeFromBody(rawBody: unknown): WorkbookAccent {
  if (!rawBody || typeof rawBody !== 'object') return 'slate';
  const body = rawBody as Record<string, unknown>;
  const directAccent = body.workbookAccent;
  if (typeof directAccent === 'string') return normalizeAccent(directAccent);
  const style = body.style;
  if (style && typeof style === 'object') {
    const accent = (style as Record<string, unknown>).accent;
    if (typeof accent === 'string') return normalizeAccent(accent);
  }
  return 'slate';
}

export function parseWorkbookAccent(rawBody: unknown): WorkbookAccent {
  return extractThemeFromBody(rawBody);
}

export function applyWorkbookTheme(workbook: ExcelJS.Workbook, accent: WorkbookAccent): void {
  const theme = THEMES[accent];
  if (!theme || accent === 'slate') return;

  workbook.eachSheet((sheet) => {
    sheet.properties.tabColor = { argb: theme.tabColor };
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.fill && typeof cell.fill === 'object' && cell.fill.type === 'pattern' && cell.fill.pattern === 'solid') {
          const fg = readArgb(cell.fill.fgColor);
          if (fg === DEFAULT_HEADER_FILL) {
            cell.fill = {
              ...cell.fill,
              fgColor: { argb: theme.headerFill },
            };
            const existingFont = cell.font ?? {};
            const fontColor = readArgb(existingFont.color);
            if (!fontColor || fontColor === DEFAULT_HEADER_FONT) {
              cell.font = {
                ...existingFont,
                color: { argb: theme.headerFont },
              };
            }
          } else if (fg === DEFAULT_INPUT_FILL) {
            cell.fill = {
              ...cell.fill,
              fgColor: { argb: theme.inputFill },
            };
          }
        }

        if (cell.border && typeof cell.border === 'object') {
          const border = cell.border;
          const rewriteSide = (side: typeof border.top) => {
            if (!side || typeof side !== 'object') return side;
            const color = readArgb(side.color);
            if (color === DEFAULT_HEADER_BORDER) {
              return { ...side, color: { argb: theme.headerBorder } };
            }
            if (color === DEFAULT_GRID_BORDER) {
              return { ...side, color: { argb: theme.gridBorder } };
            }
            return side;
          };

          cell.border = {
            top: rewriteSide(border.top),
            left: rewriteSide(border.left),
            right: rewriteSide(border.right),
            bottom: rewriteSide(border.bottom),
            diagonal: border.diagonal,
          };
        }
      });
    });
  });
}
