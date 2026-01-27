'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import type { PreviewV2 } from '@/types/preview';

type PreviewV2Props = {
  previewV2: PreviewV2 | null;
  isLoading?: boolean;
  reason?: string | null;
  status?: string | null;
  onDownload?: () => void;
  downloadUrl?: string;
};

export function PreviewV2({
  previewV2,
  isLoading = false,
  reason,
  status,
  onDownload,
  downloadUrl,
}: PreviewV2Props) {
  const renderTable = previewV2 && Array.isArray(previewV2.columns) && Array.isArray(previewV2.rows);

  return (
    <Card className="border border-white/10 bg-black/50 text-slate-100 backdrop-blur shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">Model preview</CardTitle>
            <CardDescription className="text-slate-400">
              {status === 'generating'
                ? 'Generating preview…'
                : 'Snapshot of the generated workbook. Download for full fidelity.'}
            </CardDescription>
          </div>
          {(onDownload || downloadUrl) && (
            <Button
              type="button"
              size="sm"
              className="inline-flex items-center gap-1 bg-emerald-600 text-white hover:bg-emerald-500"
              variant="default"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onDownload) {
                  onDownload();
                } else if (downloadUrl) {
                  window.open(downloadUrl, '_blank', 'noopener,noreferrer');
                }
              }}
            >
              <Download className="h-4 w-4" />
              Download .xlsx
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="rounded-md border border-white/10 bg-black/60 p-4 text-sm text-slate-300">
            Loading preview…
          </div>
        ) : renderTable ? (
          <div className="overflow-x-auto rounded-md border border-white/10 bg-black/70">
            <div className="border-b border-white/5 px-3 py-2 text-xs text-slate-300">
              Sheet: {previewV2?.sheetName ?? 'Preview'}
            </div>
            <Table className="min-w-full text-xs">
              <TableHeader className="bg-black/60">
                <TableRow>
                  {previewV2.columns.map((col, idx) => (
                    <TableHead key={idx} className="whitespace-nowrap text-slate-200">
                      {col}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewV2.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={previewV2.columns.length} className="text-center text-slate-400">
                      No rows to display.
                    </TableCell>
                  </TableRow>
                ) : (
                  previewV2.rows.map((row, rowIdx) => (
                    <TableRow key={rowIdx} className="border-white/5">
                      {row.map((cell, cellIdx) => (
                        <TableCell key={`${rowIdx}-${cellIdx}`} className="text-slate-100">
                          {cell === null ? '—' : String(cell)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-md border border-white/10 bg-black/60 p-4 text-sm text-slate-200">
            <div className="flex items-center gap-2 text-white">
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
              {status === 'generating'
                ? 'Generating preview…'
                : 'Preview unavailable. Download workbook.'}
            </div>
            {reason && <p className="mt-2 text-xs text-slate-400">Reason: {reason}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
