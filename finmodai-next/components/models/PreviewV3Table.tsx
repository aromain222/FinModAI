'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import type { PreviewV3 } from '@/types/preview-v3';
import type { DerivedPreview } from '@/lib/previewDerived/types';
import { formatCell } from '@/lib/formatters/previewFormat';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

type Props = {
  preview: PreviewV3 | null;
  loading: boolean;
  status?: string | null;
  reason?: string | null;
  onDownload?: () => void;
  downloadUrl?: string;
  devDebug?: any;
  derived?: DerivedPreview | null;
};

export function PreviewV3Table({
  preview,
  loading,
  status,
  reason,
  onDownload,
  downloadUrl,
  devDebug,
  derived,
}: Props) {
  const renderTable = preview && Array.isArray(preview.columns) && Array.isArray(preview.rows);
  const isDev = process.env.NODE_ENV !== 'production';
  const unitsScale = derived?.units?.scale ?? 'UNKNOWN';
  const [maxYearColumns, setMaxYearColumns] = useState(6);

  const isSectionHeader = (row: any[]) => {
    if (!row || row.length === 0) return false;
    const label = String(row[0] ?? '').trim().toUpperCase();
    const headers = ['OPERATING METRICS', 'FREE CASH FLOW', 'VALUATION'];
    if (!headers.includes(label)) return false;
    return row.slice(1).every((cell) => !cell || String(cell).trim().toUpperCase() === label || String(cell).trim() === '');
  };

  const isFiscalYearRow = (row: any[]) => {
    const label = String(row?.[0] ?? '').trim().toUpperCase();
    return label === 'FISCAL YEAR' || label === 'YEAR' || label === 'YEARS';
  };

  const isKeyRow = (rowLabel: string) => {
    const normalized = rowLabel.trim().toUpperCase();
    return (
      normalized === 'REVENUE' ||
      normalized === 'TOTAL REVENUE' ||
      normalized === 'EBIT' ||
      normalized === 'UNLEVERED FCF' ||
      normalized === 'FREE CASH FLOW' ||
      normalized === 'UNLEVERED FREE CASH FLOW'
    );
  };

  const inferMoneyUnitSuffix = (formatted: string | null): 'B' | 'M' | null => {
    if (!formatted) return null;
    const match = formatted.trim().match(/([BM])$/);
    if (!match) return null;
    const suffix = match[1];
    if (suffix === 'B' || suffix === 'M') return suffix;
    return null;
  };

  useEffect(() => {
    const update = () => {
      const width = window.innerWidth;
      if (width < 640) return setMaxYearColumns(3);
      if (width < 768) return setMaxYearColumns(4);
      if (width < 1024) return setMaxYearColumns(5);
      if (width < 1280) return setMaxYearColumns(6);
      return setMaxYearColumns(8);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const visibleColumnIndices = useMemo(() => {
    if (!renderTable) return [];
    const total = preview.columns.length;
    const yearCount = Math.max(0, total - 1);
    const keepYears = Math.min(maxYearColumns, yearCount);
    if (keepYears <= 0) return [0];
    const startIdx = Math.max(1, total - keepYears);
    return [0, ...Array.from({ length: keepYears }, (_, idx) => startIdx + idx)];
  }, [renderTable, preview, maxYearColumns]);

  return (
    <Card className="border border-white/10 bg-black/50 text-slate-100 backdrop-blur shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">Model preview</CardTitle>
            <CardDescription className="text-slate-400">
              {status === 'generating'
                ? 'Generating preview…'
                : 'Snapshot of the generated workbook. Download for full detail.'}
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
        {loading ? (
          <div className="rounded-md border border-white/10 bg-black/60 p-4 text-sm text-slate-300">
            Loading preview…
          </div>
        ) : renderTable ? (
          <>
            <div className="rounded-md border border-white/10 bg-black/70">
              <div className="border-b border-white/5 px-3 py-2 text-xs text-slate-300">
                Sheet: {preview?.sheetName ?? 'Preview'}
              </div>
              <table className="w-full table-fixed text-[11px] leading-tight text-slate-100">
                <colgroup>
                  <col style={{ width: visibleColumnIndices.length <= 4 ? '38%' : '30%' }} />
                  {visibleColumnIndices.slice(1).map((_, idx) => (
                    <col
                      key={idx}
                      style={{
                        width: `${(visibleColumnIndices.length <= 4 ? 62 : 70) / Math.max(1, visibleColumnIndices.length - 1)}%`,
                      }}
                    />
                  ))}
                </colgroup>
                <thead className="bg-black/70">
                  <tr className="border-b border-white/10">
                    {visibleColumnIndices.map((colIdx, idx) => {
                      const col = preview.columns[colIdx];
                      const label = idx === 0 ? (col ? String(col) : 'Metric') : String(col ?? '');
                      const align = idx === 0 ? 'text-left' : 'text-right';
                      const isYearColumn = idx > 0;
                      return (
                        <th
                          key={colIdx}
                          className={`sticky top-0 z-10 px-2 py-2 ${
                            isYearColumn ? 'text-[12px] font-semibold text-slate-50' : 'text-[11px] font-semibold text-slate-200'
                          } ${align} bg-black/80 border-b border-white/10 overflow-hidden text-ellipsis whitespace-nowrap`}
                        >
                          {label || (idx === 0 ? 'Metric' : '—')}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.length === 0 ? (
                    <tr className="border-white/5">
                      <td colSpan={visibleColumnIndices.length} className="px-2 py-2 text-center text-slate-400">
                        No rows to display.
                      </td>
                    </tr>
                  ) : (
                    preview.rows.map((row, rowIdx) => {
                      if (isSectionHeader(row)) {
                        return (
                          <tr key={rowIdx} className="border-white/5 bg-white/[0.08]">
                            <td
                              colSpan={visibleColumnIndices.length}
                              className="px-2 py-2 uppercase text-[10px] font-semibold tracking-[0.18em] text-slate-200"
                            >
                              {String(row[0] ?? '').trim()}
                            </td>
                          </tr>
                        );
                      }

                      const rawRowLabel = String(row[0] ?? '');
                      const keyRow = isKeyRow(rawRowLabel);
                      const fiscalRow = isFiscalYearRow(row);

                      const sampleValueIdx = visibleColumnIndices
                        .slice(1)
                        .find((idx) => row[idx] !== null && row[idx] !== undefined && row[idx] !== '');
                      const sampleValue = sampleValueIdx !== undefined ? row[sampleValueIdx] : null;
                      const formattedSampleValue =
                        sampleValueIdx !== undefined ? formatCell(rawRowLabel.toUpperCase(), sampleValue, unitsScale, 'card') : null;
                      const inferredUnitSuffix = inferMoneyUnitSuffix(typeof formattedSampleValue === 'string' ? formattedSampleValue : null);
                      const displayRowLabel = (() => {
                        const normalized = rawRowLabel.trim().toUpperCase();
                        if (normalized === 'REVENUE' || normalized === 'TOTAL REVENUE') {
                          const suffix =
                            inferredUnitSuffix ??
                            (unitsScale === 'BILLIONS' ? 'B' : unitsScale === 'MILLIONS' ? 'M' : null);
                          if (suffix) return `${rawRowLabel} ($${suffix})`;
                          return rawRowLabel;
                        }
                        return rawRowLabel;
                      })();

                      return (
                        <tr
                          key={rowIdx}
                          className={`border-b border-white/5 last:border-0 ${
                            fiscalRow ? 'bg-white/[0.06]' : keyRow ? 'bg-white/[0.03]' : ''
                          }`}
                        >
                          {visibleColumnIndices.map((colIdx, idx) => {
                            const cell = row[colIdx];
                            const display =
                              idx === 0
                                ? displayRowLabel || '—'
                                : fiscalRow
                                ? cell === null || cell === undefined || cell === ''
                                  ? '—'
                                  : String(cell)
                                : formatCell(rawRowLabel.toUpperCase(), cell, unitsScale, 'card');
                            const align = idx === 0 ? 'text-left' : 'text-right';
                            const padY = fiscalRow ? 'py-2' : keyRow ? 'py-2' : 'py-1.5';
                            return (
                              <td
                                key={`${rowIdx}-${colIdx}`}
                                className={`px-2 ${padY} ${align} tabular-nums overflow-hidden text-ellipsis whitespace-nowrap ${
                                  idx === 0
                                    ? fiscalRow
                                      ? 'text-slate-50 font-semibold'
                                      : keyRow
                                      ? 'text-slate-50 font-semibold'
                                      : 'text-slate-200'
                                    : fiscalRow
                                    ? 'text-slate-50 font-semibold'
                                    : keyRow
                                    ? 'text-slate-50 font-semibold'
                                    : 'text-slate-100'
                                }`}
                                title={typeof display === 'string' ? display : undefined}
                              >
                                {display}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {preview.stats?.truncated && (
              <div className="text-[11px] text-slate-400">
                Showing first {preview.stats.rowCount} rows / {preview.stats.colCount} cols (truncated).
              </div>
            )}
            {preview.warnings && preview.warnings.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                {preview.warnings.map((w, i) => (
                  <div key={i}>• {w}</div>
                ))}
              </div>
            )}
          </>
        ) : status === 'generating' ? (
          <div className="rounded-md border border-white/10 bg-black/60 p-4 text-sm text-slate-200">
            Generating preview…
          </div>
        ) : status === 'failed' ? (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              Preview failed to load.
            </div>
            {reason && <p className="mt-1 text-xs text-rose-100/80">Reason: {reason}</p>}
          </div>
        ) : (
          <div className="rounded-md border border-white/10 bg-black/60 p-4 text-sm text-slate-200">
            <div className="flex items-center gap-2 text-white">
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
              Preview unavailable. Download workbook.
            </div>
            {reason && <p className="mt-2 text-xs text-slate-400">Reason: {reason}</p>}
          </div>
        )}

        {isDev && devDebug && (
          <Accordion type="single" collapsible>
            <AccordionItem value="debug">
              <AccordionTrigger className="text-xs text-emerald-300 px-2">Debug info</AccordionTrigger>
              <AccordionContent className="text-xs text-slate-200 px-2 pb-2">
                <pre className="whitespace-pre-wrap">{JSON.stringify(devDebug, null, 2)}</pre>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
