'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { downloadWorkbook } from '@/lib/downloadWorkbook';

type DownloadModelButtonProps = {
  ticker: string;
  modelType: string;
  variant?: 'ghost' | 'default' | 'outline';
};

export function DownloadModelButton({ ticker, modelType, variant = 'outline' }: DownloadModelButtonProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      await downloadWorkbook({ ticker, modelType });
    } catch (error) {
      console.error('Download failed', error);
      alert('Failed to download model. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button size="sm" variant={variant} disabled={downloading} onClick={handleDownload}>
      {downloading ? 'Downloading…' : 'Download'}
    </Button>
  );
}
