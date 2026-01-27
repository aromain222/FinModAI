'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { downloadWorkbook } from '@/lib/downloadWorkbook';
import { useToast } from '@/components/ToastProvider';

type DownloadModelButtonProps = {
  ticker: string;
  modelType: string;
  modelId: string;
  variant?: 'ghost' | 'default' | 'outline';
  disabled?: boolean;
};

export function DownloadModelButton({
  ticker,
  modelType,
  modelId,
  variant = 'outline',
  disabled = false,
}: DownloadModelButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const { showToast } = useToast();
  const isDisabled = disabled || downloading;

  const handleDownload = async () => {
    if (isDisabled) return;
    try {
      setDownloading(true);
      const result = await downloadWorkbook({ ticker, modelType, modelId });
      if (!result.success && result.expected) {
        showToast({
          title: 'Download unavailable',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to download model.';
      console.error('Download failed', error);
      showToast({
        title: 'Download failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button size="sm" variant={variant} disabled={isDisabled} onClick={handleDownload}>
      {downloading ? 'Downloading…' : 'Download'}
    </Button>
  );
}
