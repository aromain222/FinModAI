import type { ModelDocument, Section, TableBlock, Column, Row, Cell } from './ModelDocument';
import type { MacroAssumptionContext } from '@/lib/models/shared/macroAssumptions';
import type { CompanyCatalystContext } from '@/lib/models/shared/companyCatalystContext';

// Minimal bridge: convert the existing worksheet preview (first sheet) into a ModelDocument.
// This keeps UI and Excel in lockstep without bespoke dashboards.

type Preview = {
  sheetName: string;
  columns: string[];
  rows: (string | number | null)[][];
};

export function buildDocumentFromPreview(
  preview: Preview | null,
  meta: {
    ticker: string;
    modelType: string;
    asOfDate: string;
    currency: string;
    units: string;
    macroContext?: MacroAssumptionContext | null;
    companyCatalystContext?: CompanyCatalystContext | null;
  }
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

  const macroSection: Section | null =
    meta.macroContext && meta.macroContext.items.length > 0
      ? {
          id: 'macro_context',
          title: 'Market Context',
          layout: 'fullWidth',
          blocks: [
            {
              type: 'callout',
              content: meta.macroContext.summary,
              variant: 'note',
            },
            {
              type: 'table',
              tableId: 'macro_context_table',
              title: 'Macro Assumptions',
              columns: [
                { key: 'assumption', label: 'Assumption', type: 'text', align: 'left', width: 24 },
                { key: 'value', label: 'Value', type: 'text', align: 'right', width: 14 },
                { key: 'relevance', label: 'Relevance', type: 'text', align: 'center', width: 12 },
                { key: 'source', label: 'Source', type: 'text', align: 'left', width: 30 },
              ],
              rows: meta.macroContext.items.map((item, index) => ({
                rowKey: `macro_${index}`,
                rowType: 'data',
                cells: {
                  assumption: { value: item.label },
                  value: { value: item.displayValue },
                  relevance: { value: item.relevance },
                  source: { value: item.source },
                },
              })),
              grid: { hideGridlines: false },
            },
          ],
        }
      : null;

  const catalystSection: Section | null =
    meta.companyCatalystContext &&
    (meta.companyCatalystContext.calendarItems.length > 0 ||
      meta.companyCatalystContext.ownershipItems.length > 0 ||
      meta.companyCatalystContext.transcriptItems.length > 0)
      ? {
          id: 'company_catalyst_context',
          title: 'Company Catalyst Context',
          layout: 'fullWidth',
          blocks: [
            {
              type: 'callout',
              content: meta.companyCatalystContext.summary,
              variant: 'note',
            },
            ...(meta.companyCatalystContext.calendarItems.length > 0
              ? [
                  {
                    type: 'table' as const,
                    tableId: 'company_catalyst_calendar_table',
                    title: 'Catalyst Calendar',
                    columns: [
                      { key: 'event', label: 'Event', type: 'text' as const, align: 'left' as const, width: 26 },
                      { key: 'date', label: 'Date', type: 'text' as const, align: 'right' as const, width: 14 },
                      { key: 'relevance', label: 'Relevance', type: 'text' as const, align: 'center' as const, width: 12 },
                      { key: 'source', label: 'Source', type: 'text' as const, align: 'left' as const, width: 28 },
                    ],
                    rows: meta.companyCatalystContext.calendarItems.map((item, index) => ({
                      rowKey: `calendar_${index}`,
                      rowType: 'data' as const,
                      cells: {
                        event: { value: item.title },
                        date: { value: item.displayDate },
                        relevance: { value: item.relevance },
                        source: { value: item.source },
                      },
                    })),
                    grid: { hideGridlines: false },
                  },
                ]
              : []),
            ...(meta.companyCatalystContext.ownershipItems.length > 0
              ? [
                  {
                    type: 'table' as const,
                    tableId: 'company_catalyst_ownership_table',
                    title: 'Ownership / Insider / Buyback',
                    columns: [
                      { key: 'signal', label: 'Signal', type: 'text' as const, align: 'left' as const, width: 26 },
                      { key: 'value', label: 'Value', type: 'text' as const, align: 'right' as const, width: 18 },
                      { key: 'relevance', label: 'Relevance', type: 'text' as const, align: 'center' as const, width: 12 },
                      { key: 'source', label: 'Source', type: 'text' as const, align: 'left' as const, width: 28 },
                    ],
                    rows: meta.companyCatalystContext.ownershipItems.map((item, index) => ({
                      rowKey: `ownership_${index}`,
                      rowType: 'data' as const,
                      cells: {
                        signal: { value: item.label },
                        value: { value: item.displayValue },
                        relevance: { value: item.relevance },
                        source: { value: item.source },
                      },
                    })),
                    grid: { hideGridlines: false },
                  },
                ]
              : []),
            ...(meta.companyCatalystContext.transcriptItems.length > 0
              ? [
                  {
                    type: 'table' as const,
                    tableId: 'company_catalyst_transcript_table',
                    title: 'Transcript Catalyst Context',
                    columns: [
                      { key: 'label', label: 'Catalyst', type: 'text' as const, align: 'left' as const, width: 24 },
                      { key: 'excerpt', label: 'Excerpt', type: 'text' as const, align: 'left' as const, width: 52 },
                      { key: 'source', label: 'Source', type: 'text' as const, align: 'left' as const, width: 24 },
                    ],
                    rows: meta.companyCatalystContext.transcriptItems.map((item, index) => ({
                      rowKey: `transcript_${index}`,
                      rowType: 'data' as const,
                      cells: {
                        label: { value: item.label },
                        excerpt: { value: item.excerpt },
                        source: { value: item.source },
                      },
                    })),
                    grid: { hideGridlines: false },
                  },
                ]
              : []),
          ],
        }
      : null;

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
    sections: [section, ...(macroSection ? [macroSection] : []), ...(catalystSection ? [catalystSection] : [])],
  };
}
