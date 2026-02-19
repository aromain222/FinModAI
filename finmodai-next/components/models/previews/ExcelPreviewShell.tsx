/**
 * ExcelPreviewShell
 * 
 * Container for literal Excel previews
 * Provides header, notes, and download CTA
 */

"use client";

import React from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExcelTable, type ExcelTableData } from './ExcelTable';

export interface ExcelPreviewShellProps {
  title: string;
  asOfDate?: string;
  currency?: string;
  units?: string;
  dataCoverage?: string[];
  tables: Array<{
    name: string;
    data: ExcelTableData;
    maxRows?: number;
  }>;
  notes?: string[];
  assumptions?: string[];
  downloadUrl?: string;
  onDownload?: () => void;
  className?: string;
}

/**
 * ExcelPreviewShell - Literal Excel preview container
 */
export function ExcelPreviewShell({
  title,
  asOfDate,
  currency,
  units,
  dataCoverage,
  tables,
  notes,
  assumptions,
  downloadUrl,
  onDownload,
  className = '',
}: ExcelPreviewShellProps) {
  return (
    <div className={`space-y-6 ${className}`}>
      {/* Model Header */}
      <div className="border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            {(currency || units) && (
              <p className="text-sm text-muted-foreground mt-1 font-medium">
                All figures in {[currency, units].filter(Boolean).join(' ') || 'local units'}.
              </p>
            )}
            {asOfDate && (
              <p className="text-xs text-muted-foreground mt-1">
                As of: {asOfDate}
              </p>
            )}
          </div>
          {(downloadUrl || onDownload) && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDownload}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Download Excel
            </Button>
          )}
        </div>
        
        {/* Data Coverage Notes */}
        {dataCoverage && dataCoverage.length > 0 && (
          <div className="mt-3 text-xs text-muted-foreground">
            <strong>Data Coverage:</strong> {dataCoverage.join(' • ')}
          </div>
        )}
      </div>
      
      {/* Primary Tables */}
      {tables.map((table, idx) => (
        <div key={idx} className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            {table.name}
          </h3>
          <div className="border border-border rounded-sm bg-background">
            <ExcelTable
              data={table.data}
              maxRows={table.maxRows}
              showTruncation={true}
            />
          </div>
        </div>
      ))}
      
      {/* Notes */}
      {notes && notes.length > 0 && (
        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-semibold mb-2">Notes</h3>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            {notes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Assumptions */}
      {assumptions && assumptions.length > 0 && (
        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-semibold mb-2">Assumptions</h3>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            {assumptions.map((assumption, idx) => (
              <li key={idx}>{assumption}</li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Download Reminder */}
      {tables.some(t => t.data.rows.length > (t.maxRows || 50)) && (
        <div className="text-center text-xs text-muted-foreground py-2 border-t border-border">
          <FileSpreadsheet className="h-4 w-4 inline mr-1" />
          Full model available in Excel download
        </div>
      )}
    </div>
  );
}
