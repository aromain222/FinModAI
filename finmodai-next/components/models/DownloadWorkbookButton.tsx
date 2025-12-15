'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { downloadWorkbook, type DownloadWorkbookParams } from '@/lib/downloadWorkbook';

type DownloadWorkbookButtonProps = {
  ticker: string;
  modelType: string;
  requestBody?: Record<string, any> | null;
  className?: string;
};

export function DownloadWorkbookButton({
  ticker,
  modelType,
  requestBody,
  className,
}: DownloadWorkbookButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className={className ?? 'mt-4'}>
      <Button onClick={handleDownload} disabled={loading} size="sm">
        {loading ? 'Generating...' : 'Download workbook (.xlsx)'}
      </Button>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
