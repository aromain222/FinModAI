/**
 * Literal Comps Preview
 * 
 * Read-only rendering of Excel Trading Comps model
 * Matches Excel exactly - no transformations, no calculations
 */

"use client";

import React from 'react';
import { ExcelPreviewShell } from './ExcelPreviewShell';
import type { ExcelTableData } from './ExcelTable';
import type { WorkbookPreview } from '@/lib/generatePreview';

interface LiteralCompsPreviewProps {
  preview: WorkbookPreview | null;
  ticker: string;
  downloadUrl?: string;
  onDownload?: () => void;
}

/**
 * Literal Comps Preview - Excel rendered in browser
 */
export function LiteralCompsPreview({
  preview,
  ticker,
  downloadUrl,
  onDownload,
}: LiteralCompsPreviewProps) {
  if (!preview || !preview.columns || preview.columns.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4 border border-border rounded">
        Preview not available. Download Excel to view the full model.
      </div>
    );
  }

  // Convert preview to ExcelTableData format
  const tableData: ExcelTableData = {
    columns: preview.columns,
    rows: preview.rows,
    headerRows: 1,
    frozenColumns: 2, // Company and Ticker columns typically frozen
  };

  // Extract header info from first few rows if they exist
  // In Excel, rows 1-4 are typically header/metadata
  const headerRows = preview.rows.slice(0, 4);
  const titleRow = headerRows.find(row => 
    row.some(cell => String(cell || '').includes(ticker) || String(cell || '').includes('Trading Comps'))
  );
  
  const asOfDate = headerRows.find(row => 
    row.some(cell => String(cell || '').toLowerCase().includes('as of') || String(cell || '').toLowerCase().includes('date'))
  )?.[1]?.toString() || new Date().toLocaleDateString();

  // Data rows start after header section (typically row 7+)
  // For preview, we'll show all rows but ExcelTable will handle truncation
  const dataStartRow = headerRows.length > 0 ? headerRows.length : 0;
  const dataRows = preview.rows.slice(dataStartRow);

  // Notes from the last rows (if they contain "Note" or "Source")
  const notes: string[] = [];
  const assumptions: string[] = [];
  
  // Check last rows for notes
  const lastRows = preview.rows.slice(-5);
  lastRows.forEach(row => {
    const rowText = row.join(' ').toLowerCase();
    if (rowText.includes('note') || rowText.includes('source')) {
      const note = row.filter(cell => cell !== null && cell !== '').join(' ');
      if (note) notes.push(note);
    }
  });

  // Data coverage from header/metadata
  const dataCoverage: string[] = [];
  headerRows.forEach(row => {
    const rowText = row.join(' ').toLowerCase();
    if (rowText.includes('source') || rowText.includes('coverage')) {
      const coverage = row.filter(cell => cell !== null && cell !== '').join(' ');
      if (coverage) dataCoverage.push(coverage);
    }
  });

  return (
    <ExcelPreviewShell
      title={`${ticker} - Trading Comps Analysis`}
      asOfDate={asOfDate}
      currency="USD"
      units="millions"
      dataCoverage={dataCoverage.length > 0 ? dataCoverage : undefined}
      tables={[
        {
          name: "Trading Comps",
          data: {
            columns: preview.columns,
            rows: dataRows,
            headerRows: 1,
            frozenColumns: 2,
          },
          maxRows: 50, // Show first 50 rows, truncate rest
        },
      ]}
      notes={notes.length > 0 ? notes : undefined}
      downloadUrl={downloadUrl}
      onDownload={onDownload}
    />
  );
}
