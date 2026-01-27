import type { PreviewV3 } from "@/types/preview-v3";

const MAX_ROWS = 80;
const MAX_COLUMNS = 30;

const columnLabel = (index: number) => {
  let label = "";
  let i = index;
  while (i >= 0) {
    label = String.fromCharCode(65 + (i % 26)) + label;
    i = Math.floor(i / 26) - 1;
  }
  return label;
};

export const parseDelimitedText = (text: string): { columns: string[]; rows: (string | number | null)[][] } | null => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (!lines.length) return null;
  const delimiter = lines.some((l) => l.includes("\t"))
    ? "\t"
    : lines.some((l) => l.includes(","))
    ? ","
    : lines.some((l) => l.includes("|"))
    ? "|"
    : ",";
  const split = (line: string) => line.split(delimiter).map((cell) => cell.trim());
  const first = split(lines[0]);
  const hasHeader = lines.length > 1 && first.some((cell) => isNaN(Number(cell)) && cell.trim().length > 0);
  const columns = (hasHeader ? first : first.map((_, idx) => columnLabel(idx))).slice(0, MAX_COLUMNS);
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rows = dataLines.slice(0, MAX_ROWS).map((line) => {
    const parts = split(line);
    return columns.map((_, idx) => (parts[idx] === undefined ? null : parts[idx] || null));
  });
  return { columns, rows };
};

const coerceRow = (row: any, columns: string[]) =>
  columns.map((col, idx) => {
    if (Array.isArray(row)) return row[idx] === undefined ? null : row[idx];
    if (row && typeof row === "object") {
      const val = (row as any)?.[col];
      return val === undefined ? null : val;
    }
    return row === undefined ? null : row;
  });

export const buildPreviewV3FromUnknown = (
  value: any
): { preview: PreviewV3 | null; reason?: string; meta?: Record<string, any> } => {
  try {
    if (value === null || value === undefined) return { preview: null, reason: "missing" };
    let raw = value;
    if (typeof value === "string") {
      const delimited = parseDelimitedText(value);
      if (delimited) {
        const cols = delimited.columns.slice(0, MAX_COLUMNS);
        const rows = delimited.rows.slice(0, MAX_ROWS).map((r) => r.slice(0, cols.length));
        const truncated = delimited.rows.length > rows.length || delimited.columns.length > cols.length;
        return {
          preview: {
            version: 3,
            columns: cols,
            rows,
            stats: { rowCount: rows.length, colCount: cols.length, truncated },
            debugShape: "string-delimited",
          },
          meta: { rowCountBeforeCap: delimited.rows.length, colCountBeforeCap: delimited.columns.length, truncated },
        };
      }
      try {
        raw = JSON.parse(value);
      } catch {
        return { preview: null, reason: "unparseable_string" };
      }
    }

    if (raw && typeof raw === "object" && Array.isArray(raw.columns) && Array.isArray(raw.rows)) {
      const cols = (raw.columns as any[]).slice(0, MAX_COLUMNS).map((c) => String(c));
      const rowsRaw = (raw.rows as any[]).slice(0, MAX_ROWS);
      const rows = rowsRaw.map((row: any) => coerceRow(row, cols).slice(0, cols.length));
      const truncated = raw.rows.length > rows.length || raw.columns.length > cols.length;
      return {
        preview: {
          version: 3,
          sheetName: raw.sheetName || raw.sheet || raw.name,
          columns: cols,
          rows,
          stats: { rowCount: rows.length, colCount: cols.length, truncated },
          warnings: raw.warnings,
          debugShape: "columns-rows",
        },
        meta: { rowCountBeforeCap: raw.rows.length, colCountBeforeCap: raw.columns.length, truncated },
      };
    }

    if (Array.isArray(raw) && raw.length > 0 && raw.every(Array.isArray)) {
      const width = Math.min(
        MAX_COLUMNS,
        raw.reduce((m, row) => (Array.isArray(row) ? Math.max(m, row.length) : m), 0)
      );
      if (width === 0) return { preview: null, reason: "empty_array" };
      const columns = Array.from({ length: width }, (_, i) => columnLabel(i));
      const rowsRaw = raw.slice(0, MAX_ROWS);
      const rows = rowsRaw.map((row) =>
        Array.from({ length: width }, (_, i) => (row[i] === undefined ? null : row[i]))
      );
      const truncated = raw.length > rows.length;
      return {
        preview: {
          version: 3,
          columns,
          rows,
          stats: { rowCount: rows.length, colCount: columns.length, truncated },
          debugShape: "array-of-arrays",
        },
        meta: { rowCountBeforeCap: raw.length, colCountBeforeCap: width, truncated },
      };
    }

    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "object") {
      const columns = Array.from(
        new Set(
          raw.flatMap((row) =>
            row && typeof row === "object" ? Object.keys(row as Record<string, any>) : []
          )
        )
      )
        .slice(0, MAX_COLUMNS)
        .map((c) => String(c));
      if (!columns.length) return { preview: null, reason: "no_columns" };
      const rowsRaw = raw.slice(0, MAX_ROWS);
      const rows = rowsRaw.map((row) => coerceRow(row, columns));
      const truncated = raw.length > rows.length;
      return {
        preview: {
          version: 3,
          columns,
          rows,
          stats: { rowCount: rows.length, colCount: columns.length, truncated },
          debugShape: "array-of-objects",
        },
        meta: { rowCountBeforeCap: raw.length, colCountBeforeCap: columns.length, truncated },
      };
    }

    if (raw && typeof raw === "object" && Array.isArray((raw as any).rows)) {
      const rowsVal = (raw as any).rows as any[];
      const first = rowsVal[0];
      const width =
        Array.isArray(first) && first.length
          ? Math.min(MAX_COLUMNS, first.length)
          : first && typeof first === "object"
          ? Math.min(MAX_COLUMNS, Object.keys(first).length || 1)
          : Math.min(MAX_COLUMNS, 1);
      const columns = Array.from({ length: width }, (_, i) => columnLabel(i));
      const rowsRaw = rowsVal.slice(0, MAX_ROWS);
      const rows = rowsRaw.map((row) => coerceRow(row, columns));
      const truncated = rowsVal.length > rows.length;
      return {
        preview: {
          version: 3,
          columns,
          rows,
          stats: { rowCount: rows.length, colCount: columns.length, truncated },
          debugShape: "rows-only-object",
        },
        meta: { rowCountBeforeCap: rowsVal.length, colCountBeforeCap: columns.length, truncated },
      };
    }

    // Workbook-like shape: sheets with rows/data and optional drawings/shapes (LBO models include shapes)
    if (raw && typeof raw === "object" && Array.isArray((raw as any).sheets)) {
      const sheets = (raw as any).sheets as any[];
      for (const sheet of sheets) {
        if (!sheet) continue;
        const rowsVal = sheet.rows || sheet.data || sheet.table;
        if (Array.isArray(rowsVal) && rowsVal.length > 0) {
          const first = rowsVal[0];
          const width =
            Array.isArray(first) && first.length
              ? Math.min(MAX_COLUMNS, first.length)
              : first && typeof first === "object"
              ? Math.min(MAX_COLUMNS, Object.keys(first).length || 1)
              : Math.min(MAX_COLUMNS, 1);
          if (width === 0) continue;
          const columns = Array.from({ length: width }, (_, i) => columnLabel(i));
          const rowsRaw = rowsVal.slice(0, MAX_ROWS);
          const rows = rowsRaw.map((row: any) => coerceRow(row, columns));
          const truncated = rowsVal.length > rows.length;
          return {
            preview: {
              version: 3,
              sheetName: sheet.sheetName || sheet.name,
              columns,
              rows,
              stats: { rowCount: rows.length, colCount: columns.length, truncated },
              debugShape: "workbook-sheets",
              warnings: sheet.warnings,
            },
            meta: { rowCountBeforeCap: rowsVal.length, colCountBeforeCap: columns.length, truncated },
          };
        }
      }
    }

    return { preview: null, reason: "unsupported_shape", meta: { rawType: typeof raw } };
  } catch (error: any) {
    return { preview: null, reason: error?.message || "unknown_error" };
  }
};

export const extractPreviewCandidates = (model: any): { value: unknown; path: string }[] => {
  const candidates: { value: unknown; path: string }[] = [];
  const push = (val: unknown, path: string) => {
    if (val !== undefined && val !== null) candidates.push({ value: val, path });
  };

  push(model?.preview, "model.preview");
  push(model?.results?.preview, "results.preview");
  push(model?.results?.table, "results.table");
  push(model?.results?.data, "results.data");
  push(model?.results?.workbook?.preview, "results.workbook.preview");
  push(model?.results?.workbook?.sheets?.[0]?.preview, "results.workbook.sheets[0].preview");
  push(model?.results?.workbook?.sheets?.[0]?.rows, "results.workbook.sheets[0].rows");
  push(model?.results?.workbook?.sheets?.[0]?.data, "results.workbook.sheets[0].data");

  const sheets = model?.results?.workbook?.sheets;
  if (Array.isArray(sheets)) {
    sheets.forEach((sheet: any, idx: number) => {
      push(sheet?.preview, `results.workbook.sheets[${idx}].preview`);
      push(sheet?.rows, `results.workbook.sheets[${idx}].rows`);
      push(sheet?.data, `results.workbook.sheets[${idx}].data`);
      push(sheet?.table, `results.workbook.sheets[${idx}].table`);
    });
  }

  const previewSheets = model?.preview?.sheets;
  if (Array.isArray(previewSheets)) {
    previewSheets.forEach((sheet: any, idx: number) => {
      push(sheet?.preview, `preview.sheets[${idx}].preview`);
      push(sheet?.rows, `preview.sheets[${idx}].rows`);
      push(sheet?.data, `preview.sheets[${idx}].data`);
      push(sheet, `preview.sheets[${idx}]`);
    });
  }

  return candidates;
};
