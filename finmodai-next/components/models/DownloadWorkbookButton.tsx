'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { downloadWorkbook, type DownloadWorkbookParams } from '@/lib/downloadWorkbook';
import { LOADING_TABS, getEmptyError } from '@/lib/loadingCopy';

type DownloadWorkbookButtonProps = {
  ticker: string;
  modelType: string;
  requestBody?: Record<string, any> | null;
  className?: string;
};

const STEP_INTERVAL_MS = 800;

export function DownloadWorkbookButton({
  ticker,
  modelType,
  requestBody,
  className,
}: DownloadWorkbookButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  const excelCopy = LOADING_TABS.excelExport;
  const steps = excelCopy.steps;

  useEffect(() => {
    if (!loading || steps.length === 0) return;
    const id = setInterval(() => {
      setStepIndex((i) => (i + 1) % steps.length);
    }, STEP_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loading, steps.length]);

  const handleDownload = async () => {
    if (!requestBody) {
      setError('Model inputs unavailable. Regenerate the model and try again.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await downloadWorkbook({ ticker, modelType, ...requestBody } as DownloadWorkbookParams);
    } catch (err: any) {
      setError(err?.message || 'Failed to download workbook.');
    } finally {
      setLoading(false);
    }
  };

  const emptyError = getEmptyError('excelExport');
  const loadingLabel = loading ? steps[stepIndex] ?? 'Preparing Excel…' : 'Download workbook (.xlsx)';

  return (
    <div className={className ?? 'mt-4'}>
      <Button onClick={handleDownload} disabled={loading} size="sm" aria-busy={loading} aria-live="polite">
        {loadingLabel}
      </Button>
      {error && (
        <div className="mt-2 flex items-center gap-2">
          <p className="text-xs text-destructive">{emptyError.errorTitle('Excel')}</p>
          <Button variant="outline" size="sm" onClick={() => { setError(null); handleDownload(); }}>
            {emptyError.retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
