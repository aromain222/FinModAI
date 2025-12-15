'use client';

import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileSpreadsheet, AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import type { DataDiagnostics } from '@/types/diagnostics';
import { getDiagnosticsSummary, hasFailures } from '@/types/diagnostics';

export type ModelPreviewTable = {
  sheetName: string;
  columns: string[];
  rows: (string | number | null)[][];
};

type ModelPreviewProps = {
  preview: ModelPreviewTable | null;
  downloadUrl?: string;
  title?: string;
  description?: string;
  diagnostics?: DataDiagnostics[];
  modelType?: string;
};

/**
 * Helper function to check if a row is completely empty
 */
function isEmptyRow(row: (string | number | null | undefined)[]): boolean {
  return row.every(cell => {
    if (cell === null || cell === undefined) return true;
    if (typeof cell === 'number') return false;
    return String(cell).trim() === '';
  });
}

export const ModelPreview: React.FC<ModelPreviewProps> = ({
  preview,
  downloadUrl,
  title = 'Generated model preview',
  description = 'High-level view of the generated workbook. Download to see full detail.',
  diagnostics,
  modelType,
}) => {
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const hasDiagnosticIssues = diagnostics && (hasFailures(diagnostics) || diagnostics.some(d => d.warnings.length > 0));
  console.log('[DEBUG] ModelPreview component loaded, preview =', preview);

  if (!preview) {
    return (
      <Card className="border-dashed bg-muted/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4" />
            Waiting for model output
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Generate a model to see a live preview of the Excel structure here.
        </CardContent>
      </Card>
    );
  }

  const previewUnavailable =
    !preview || ((preview.columns?.length ?? 0) === 0 && (preview.rows?.length ?? 0) === 0);
  const { sheetName, columns, rows } = preview ?? { sheetName: '', columns: [], rows: [] };
  const isLboModel = modelType?.toLowerCase() === 'lbo';
  const visibleRows = (rows ?? []).filter(row => !isEmptyRow(row));

  return (
    <>
      {/* Diagnostics Card (if issues exist) */}
      {hasDiagnosticIssues && diagnostics && (
        <Card className="mb-4 border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500 mt-0.5" />
                <div>
                  <CardTitle className="text-base">Data Quality Issues Detected</CardTitle>
                  <CardDescription className="mt-1">
                    {getDiagnosticsSummary(diagnostics)}
                  </CardDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDiagnostics(!showDiagnostics)}
                className="gap-1"
              >
                {showDiagnostics ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    Hide
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    Details
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          {showDiagnostics && (
            <CardContent className="space-y-3 pt-0">
              {diagnostics.map((diag, idx) => (
                <div key={idx} className="rounded-lg border bg-background p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium mb-2">
                    <span className={diag.ok ? 'text-green-600' : 'text-red-600'}>
                      {diag.ok ? '✓' : '✗'}
                    </span>
                    <span className="capitalize">{diag.stage}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{diag.dataSource}</span>
                    {diag.durationMs && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground text-xs">{diag.durationMs}ms</span>
                      </>
                    )}
                  </div>
                  {diag.errors.length > 0 && (
                    <div className="space-y-1 mb-2">
                      {diag.errors.map((err, errIdx) => (
                        <div key={errIdx} className="text-red-600 dark:text-red-400 text-xs flex items-start gap-1.5">
                          <span className="mt-0.5">•</span>
                          <span>{err}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {diag.warnings.length > 0 && (
                    <div className="space-y-1">
                      {diag.warnings.map((warn, warnIdx) => (
                        <div key={warnIdx} className="text-amber-600 dark:text-amber-400 text-xs flex items-start gap-1.5">
                          <span className="mt-0.5">•</span>
                          <span>{warn}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {diag.usedAiFallback && (
                    <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      <span>AI fallback used</span>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}
      
      {/* Model Preview Card */}
      <Card className="border border-border bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span>{title}</span>
            {downloadUrl && (
              <Button
                asChild
                size="sm"
                className="inline-flex items-center gap-1"
                variant="outline"
              >
                <a href={downloadUrl}>
                  <Download className="h-4 w-4" />
                  Download .xlsx
                </a>
              </Button>
            )}
          </CardTitle>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          )}
        </CardHeader>

        <CardContent className="space-y-3">
          {previewUnavailable || isLboModel ? (
            <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
              <p className="font-semibold text-secondary">
                {isLboModel ? 'LBO preview not available' : 'Preview not available'}
              </p>
              <p className="mt-1">
                {isLboModel
                  ? 'Download the workbook to review Sources & Uses, purchase price allocation, debt paydown, and returns schedules.'
                  : 'Download the workbook to review the full financial model output.'}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Previewing sheet:</span>
                <span className="font-medium text-secondary">{sheetName}</span>
              </div>

              <div className="max-h-64 overflow-auto rounded-md border border-border bg-slate-50/70">
                <Table className="min-w-full text-xs">
                  <TableHeader>
                    <TableRow>
                      {columns.map((col, idx) => (
                        <TableHead key={idx} className="whitespace-nowrap">
                          {col}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRows.slice(0, 50).map((row, rowIdx) => (
                      <TableRow key={rowIdx}>
                        {row.map((cell, cellIdx) => (
                          <TableCell key={cellIdx} className="whitespace-nowrap">
                            {cell === null || cell === undefined ? '' : cell}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Showing first {Math.min(visibleRows.length, 50)} rows for preview (empty rows hidden). Download the full
                workbook for complete detail.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
};
