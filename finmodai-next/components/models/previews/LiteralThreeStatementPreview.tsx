/**
 * Literal Three-Statement Preview
 * 
 * Read-only rendering of Excel Three-Statement model
 * Matches Excel exactly - no transformations, no calculations, no dashboards
 */

"use client";

import React from 'react';
import { ExcelPreviewShell } from './ExcelPreviewShell';
import type { ExcelTableData } from './ExcelTable';
import type { WorkbookPreview } from '@/lib/generatePreview';

interface LiteralThreeStatementPreviewProps {
  preview: WorkbookPreview | null;
  ticker: string;
  downloadUrl?: string;
  onDownload?: () => void;
}

/**
 * Literal Three-Statement Preview - Excel rendered in browser
 */
export function LiteralThreeStatementPreview({
  preview,
  ticker,
  downloadUrl,
  onDownload,
}: LiteralThreeStatementPreviewProps) {
  if (!preview || !preview.columns || preview.columns.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4 border border-border rounded">
        Preview not available. Download Excel to view the full model.
      </div>
    );
  }

  // Extract header info from first few rows if they exist
  // In Excel, rows 1-3 are typically header/metadata
  const headerRows = preview.rows.slice(0, 4);
  const titleRow = headerRows.find(row => 
    row.some(cell => String(cell || '').includes(ticker) || String(cell || '').includes('Three-Statement'))
  );
  
  const asOfDate = headerRows.find(row => 
    row.some(cell => String(cell || '').toLowerCase().includes('as of') || String(cell || '').toLowerCase().includes('date'))
  )?.[1]?.toString() || new Date().toLocaleDateString();

  // Data rows start after header section (typically row 4+)
  const dataStartRow = headerRows.length > 0 ? headerRows.length : 0;
  const dataRows = preview.rows.slice(dataStartRow);

  // Notes from the last rows (if they contain "Note" or "Source")
  const notes: string[] = [];
  
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

  // Convert preview to ExcelTableData format
  const tableData: ExcelTableData = {
    columns: preview.columns,
    rows: dataRows,
    headerRows: 1,
    frozenColumns: 1, // First column (Period/Line Item) typically frozen
  };

  return (
    <ExcelPreviewShell
      title={`${ticker} - Three-Statement Model`}
      asOfDate={asOfDate}
      currency="USD"
      units="millions"
      dataCoverage={dataCoverage.length > 0 ? dataCoverage : undefined}
      tables={[
        {
          name: "Three-Statement Model",
          data: tableData,
          maxRows: 100, // Show first 100 rows, truncate rest
        },
      ]}
      notes={notes.length > 0 ? notes : undefined}
      downloadUrl={downloadUrl}
      onDownload={onDownload}
    />
  );
}
