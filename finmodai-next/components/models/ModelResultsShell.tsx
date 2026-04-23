"use client";

import React, { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileText, RotateCcw, Copy, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ToastEnhanced } from '@/components/ui/toast-enhanced';

export interface ModelResultsShellProps {
  // Header
  ticker: string;
  modelName: string;
  generatedAt: string;
  status?: 'success' | 'failed' | 'pending';
  companyContext?: string | null;
  takeaway?: string | null;
  
  // Actions
  downloadUrl?: string;
  onDownload?: () => void;
  onDownloadPdfReport?: () => void;
  onViewInputs?: () => void;
  onRunAgain?: () => void;
  onCopyLink?: () => void;
  pdfReportUrl?: string;
  
  // Content
  preview: ReactNode;
  assumptions?: ReactNode;
  diagnostics?: ReactNode;
  
  // Optional additional analysis (collapsed by default)
  additionalAnalysis?: ReactNode;
  
  // Model state
  state?: 'draft' | 'assumptions_required' | 'computable' | 'generating' | 'generated' | 'failed';
  missingInputs?: string[];
  estimatedInputs?: Array<{ key: string; value: number; source: string; confidence: 'low' | 'medium' | 'high' }>;
  onCompleteAssumptions?: () => void;
}

export function ModelResultsShell({
  ticker,
  modelName,
  generatedAt,
  status = 'success',
  companyContext,
  takeaway,
  downloadUrl,
  onDownload,
  onDownloadPdfReport,
  onViewInputs,
  onRunAgain,
  onCopyLink,
  pdfReportUrl,
  preview,
  assumptions,
  diagnostics: _diagnostics,
  additionalAnalysis: _additionalAnalysis,
  state = 'generated',
  missingInputs = [],
  estimatedInputs = [],
  onCompleteAssumptions,
}: ModelResultsShellProps) {
  const [linkCopied, setLinkCopied] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const { toasts, showToast, removeToast } = useToast();

  const handleCopyLink = () => {
    if (onCopyLink) {
      onCopyLink();
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleDownloadClick = async () => {
    if (isDownloading) return;
    // Validate state before download
    if (state !== 'generated') {
      showToast({
        title: 'Model not ready',
        description: state === 'assumptions_required' 
          ? 'Please complete required assumptions first.'
          : `Model state: ${state}. Cannot download until model is generated.`,
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsDownloading(true);
      if (!downloadUrl && onDownload) {
        await onDownload();
        return;
      }

      if (!downloadUrl) {
        showToast({
          title: 'Download unavailable',
          description: 'No download URL provided. Please regenerate the model.',
          variant: 'destructive',
        });
        return;
      }

      // Validate download URL format
      const isValidUrl =
        downloadUrl.startsWith('http://') ||
        downloadUrl.startsWith('https://') ||
        downloadUrl.startsWith('data:application');

      if (!isValidUrl || downloadUrl.endsWith('/')) {
        console.error('[ModelResultsShell] Invalid download URL format:', downloadUrl);
        showToast({
          title: 'Download failed',
          description: 'Invalid download URL. Please regenerate the model.',
          variant: 'destructive',
        });
        return;
      }

      // Trigger navigation to signed URL; keep async to allow spinner
      window.location.assign(downloadUrl);
    } catch (err) {
      console.error('[ModelResultsShell] Download failed', err);
      // Best-effort: call onDownload fallback if provided
      onDownload?.();
      showToast({
        title: 'Download failed',
        description: err instanceof Error ? err.message : 'Please retry in a moment.',
        variant: 'destructive',
      });
    } finally {
      setTimeout(() => setIsDownloading(false), 1500);
    }
  };

  const downloadPdfFromUrl = async (url: string) => {
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      let message = `PDF download failed (${response.status}).`;
      try {
        const errorData = await response.json();
        message = errorData?.message || errorData?.error || message;
      } catch {
        const text = await response.text().catch(() => '');
        if (text) message = text;
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = 'CapitalBase_Report.pdf';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(blobUrl);
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--cb-text-primary)]">
            {ticker} — {modelName}
          </h1>
          {companyContext ? (
            <p className="mt-2 max-w-2xl text-sm text-[var(--cb-text-secondary)]">{companyContext}</p>
          ) : null}
          <div className="mt-2 flex items-center gap-3 text-sm text-[var(--cb-text-muted)]">
            <Badge
              variant={status === 'success' ? 'default' : status === 'failed' ? 'destructive' : 'secondary'}
              className="text-xs"
            >
              {status === 'success' ? 'Ready' : status === 'failed' ? 'Failed' : 'Pending'}
            </Badge>
            <span>{formatDate(generatedAt)}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(downloadUrl || onDownload) && state === 'generated' && (
          <Button
            onClick={handleDownloadClick}
            size="sm"
            variant="default"
            className="gap-2"
            disabled={isDownloading}
          >
            <Download className="h-4 w-4" />
            {isDownloading ? 'Preparing…' : 'Download Excel'}
          </Button>
        )}
        {(pdfReportUrl || onDownloadPdfReport) && state === 'generated' && (
          <Button
            onClick={async () => {
              try {
                if (onDownloadPdfReport) {
                  onDownloadPdfReport();
                  return;
                }
                if (pdfReportUrl) {
                  await downloadPdfFromUrl(pdfReportUrl);
                }
              } catch (err) {
                showToast({
                  title: 'PDF download failed',
                  description: err instanceof Error ? err.message : 'Please retry in a moment.',
                  variant: 'destructive',
                });
                console.error('[ModelResultsShell] PDF download failed', err);
              }
            }}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            Download PDF Report
          </Button>
        )}
        {state === 'assumptions_required' && (
          <Button
            onClick={onCompleteAssumptions || (() => {})}
            size="sm"
            variant="default"
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            Complete Assumptions
          </Button>
        )}
        {onViewInputs && (
          <Button
            onClick={onViewInputs}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            View Inputs
          </Button>
        )}
        {onCopyLink && (
          <Button
            onClick={handleCopyLink}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            {linkCopied ? (
              <>
                <Check className="h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy Link
              </>
            )}
          </Button>
        )}
        {onRunAgain && (
          <Button
            onClick={onRunAgain}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Run Again
          </Button>
        )}
      </div>

      {takeaway ? (
        <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-[var(--cb-text-primary)]">Takeaway</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm leading-6 text-[var(--cb-text-secondary)]">
            {takeaway}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {preview}
        </div>

        <div className="space-y-4">
          {assumptions && (
            <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
              <CardHeader>
                <CardTitle className="text-base">Key Assumptions</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {assumptions}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ToastEnhanced toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
