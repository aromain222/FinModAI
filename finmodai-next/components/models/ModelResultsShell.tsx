"use client";

import React, { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileText, RotateCcw, Copy, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { ToastEnhanced } from '@/components/ui/toast-enhanced';

export interface ModelResultsShellProps {
  // Header
  ticker: string;
  modelName: string;
  generatedAt: string;
  status?: 'success' | 'failed' | 'pending';
  
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
  downloadUrl,
  onDownload,
  onDownloadPdfReport,
  onViewInputs,
  onRunAgain,
  onCopyLink,
  pdfReportUrl,
  preview,
  assumptions,
  diagnostics,
  additionalAnalysis,
  state = 'generated',
  missingInputs = [],
  estimatedInputs = [],
  onCompleteAssumptions,
}: ModelResultsShellProps) {
  const [linkCopied, setLinkCopied] = React.useState(false);
  const [showAdditional, setShowAdditional] = React.useState(false);
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
      {/* Units notice - visible at top of every model */}
      <p className="text-sm font-medium text-[var(--cb-text-muted)] rounded-md bg-[var(--cb-surface)] border border-[var(--cb-border-subtle)] px-3 py-2">
        All figures in USD millions (unless otherwise noted).
      </p>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--cb-text-primary)]">
            {ticker} — {modelName}
          </h1>
          <div className="mt-2 flex items-center gap-3 text-sm text-[var(--cb-text-muted)]">
            <span>Generated {formatDate(generatedAt)}</span>
            <Badge
              variant={status === 'success' ? 'default' : status === 'failed' ? 'destructive' : 'secondary'}
              className="text-xs"
            >
              {status === 'success' ? 'Success' : status === 'failed' ? 'Failed' : 'Pending'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Action Row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Only show download button when state is 'generated' */}
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
        {/* Show assumptions completion button when state is 'assumptions_required' */}
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

      {/* Main Content - Two Columns */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Primary Preview (2/3 width) */}
        <div className="lg:col-span-2">
          {preview}
        </div>

        {/* Right Column - Secondary Info (1/3 width) */}
        <div className="space-y-4">
          {assumptions && (
            <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
              <CardHeader>
                <CardTitle className="text-base">Assumptions</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {assumptions}
              </CardContent>
            </Card>
          )}

          {diagnostics && (
            <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
              <CardHeader>
                <CardTitle className="text-base">Diagnostics</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {diagnostics}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Additional Analysis (Collapsed by Default) */}
      {additionalAnalysis && (
        <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
          <CardHeader>
            <button
              onClick={() => setShowAdditional(!showAdditional)}
              className="flex w-full items-center justify-between text-left"
            >
              <CardTitle className="text-base">Additional Analysis</CardTitle>
              <span className="text-sm text-[var(--cb-text-muted)]">
                {showAdditional ? 'Hide' : 'Show'}
              </span>
            </button>
          </CardHeader>
          {showAdditional && (
            <CardContent className="text-sm">
              {additionalAnalysis}
            </CardContent>
          )}
        </Card>
      )}

      {/* Local toasts for download failures */}
      <ToastEnhanced toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
