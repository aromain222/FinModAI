import type { ModelDocument, Section, TableBlock, Column, Row, Cell } from './ModelDocument';

// Minimal bridge: convert the existing worksheet preview (first sheet) into a ModelDocument.
// This keeps UI and Excel in lockstep without bespoke dashboards.

type Preview = {
  sheetName: string;
  columns: string[];
  rows: (string | number | null)[][];
};

export function buildDocumentFromPreview(
  preview: Preview | null,
  meta: { ticker: string; modelType: string; asOfDate: string; currency: string; units: string }
): ModelDocument | null {
  if (!preview) return null;

  const columns: Column[] = preview.columns.map((col, idx) => ({
    key: `col_${idx}`,
    label: col || `Col ${idx + 1}`,
    type: idx === 0 ? 'text' : 'number',
    align: idx === 0 ? 'left' : 'right',
  }));

  const rows: Row[] = preview.rows.map((r, rIdx) => ({
    rowKey: `row_${rIdx}`,
    rowType: rIdx === 0 ? 'header' : 'data',
    labelCell: typeof r[0] === 'string' ? (r[0] as string) : undefined,
    cells: columns.reduce<Record<string, Cell>>((acc, col, cIdx) => {
      const val = r[cIdx];
      acc[col.key] = {
        value: val === undefined ? null : val,
      };
      return acc;
    }, {}),
  }));

  const table: TableBlock = {
    type: 'table',
    tableId: 'sheet_1',
    title: preview.sheetName,
    columns,
    rows,
    grid: { hideGridlines: false },
  };

  const section: Section = {
    id: 'primary',
    title: preview.sheetName,
    layout: 'fullWidth',
    blocks: [table],
  };

  return {
    meta: {
      modelType: meta.modelType as any,
      companyName: meta.ticker,
      ticker: meta.ticker,
      asOfDate: meta.asOfDate,
      currency: meta.currency,
      units: meta.units,
      generatedAt: new Date().toISOString(),
    },
    sections: [section],
  };
}
