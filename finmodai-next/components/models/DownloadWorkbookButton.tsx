'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { downloadWorkbook } from '@/lib/downloadWorkbook';

type DownloadWorkbookButtonProps = {
  ticker: string;
  modelType: string;
  modelId: string;
  className?: string;
};

export function DownloadWorkbookButton({
  ticker,
  modelType,
  modelId,
  className,
}: DownloadWorkbookButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await downloadWorkbook({ ticker, modelType, modelId });
      if (!result.success && result.expected) {
        setError(result.message);
      }
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
