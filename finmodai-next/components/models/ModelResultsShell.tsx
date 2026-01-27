"use client";

import React, { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileText, RotateCcw, Copy, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface ModelResultsShellProps {
  // Header
  ticker: string;
  modelName: string;
  generatedAt: string;
  status?: 'success' | 'failed' | 'pending';
  
  // Actions
  downloadUrl?: string;
  onDownload?: (e?: React.MouseEvent) => void;
  onViewInputs?: () => void;
  onRunAgain?: () => void;
  onCopyLink?: () => void;
  
  // Content
  preview: ReactNode;
  assumptions?: ReactNode;
  diagnostics?: ReactNode;
  
  // Optional additional analysis (collapsed by default)
  additionalAnalysis?: ReactNode;
}

export function ModelResultsShell({
  ticker,
  modelName,
  generatedAt,
  status = 'success',
  downloadUrl,
  onDownload,
  onViewInputs,
  onRunAgain,
  onCopyLink,
  preview,
  assumptions,
  diagnostics,
  additionalAnalysis,
}: ModelResultsShellProps) {
  const [linkCopied, setLinkCopied] = React.useState(false);
  const [showAdditional, setShowAdditional] = React.useState(false);

  const handleCopyLink = () => {
    if (onCopyLink) {
      onCopyLink();
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
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
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-heading-1">
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
        {(onDownload || downloadUrl) && (
          <Button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onDownload) {
                onDownload(e);
              } else if (downloadUrl) {
                window.open(downloadUrl, '_blank', 'noopener,noreferrer');
              }
            }}
            size="sm"
            variant="default"
            className="gap-2"
            disabled={false}
          >
            <Download className="h-4 w-4" />
            Download Excel
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
        {/* KPI / quick analysis (optional) */}
        {additionalAnalysis && (
          <div className="lg:col-span-3">
            <div className="card-premium p-3">
              <div className="flex items-center gap-4">{additionalAnalysis}</div>
            </div>
          </div>
        )}
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
    </div>
  );
}
