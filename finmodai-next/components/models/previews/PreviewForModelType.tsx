"use client";

import React from 'react';
import type { ModelOutput } from '@/lib/models/outputTypes';
import { ThreeStatementPreview } from './ThreeStatementPreview';
import { DcfPreview } from './DcfPreview';
import { LboPreview } from './LboPreview';
import { CompsPreview } from './CompsPreview';
import { MergerPreview } from './MergerPreview';
import { OperatingPreview } from './OperatingPreview';
import { ScorecardPreview } from './ScorecardPreview';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

interface PreviewForModelTypeProps {
  // Legacy preview router. Newer flows render ModelDocument via ModelPreviewRenderer.
  // Keep this permissive to avoid type drift across model output shapes.
  modelType: string;
  output: any;
  ticker: string;
  onEditAssumptions?: () => void;
  rawOutput?: any; // For debug drawer
}

/**
 * Selects and renders the appropriate preview component based on model type.
 * Handles parsing errors gracefully.
 */
export function PreviewForModelType({ modelType, output, ticker, onEditAssumptions, rawOutput }: PreviewForModelTypeProps) {
  try {
    // Extract preview from rawOutput if available (from API response)
    const preview = rawOutput?.preview || output?.preview || null;
    
    // Create a unified output object with preview
    const outputWithPreview = preview ? { ...output, preview } : output;
    
    switch (modelType) {
      case 'three-statement':
        // Use literal preview if available (preview from generatePreviewFromWorkbook)
        if (rawOutput?.preview && rawOutput.preview.columns && rawOutput.preview.columns.length > 0) {
          const { LiteralThreeStatementPreview } = require('./LiteralThreeStatementPreview');
          return (
            <LiteralThreeStatementPreview
              preview={rawOutput.preview}
              ticker={ticker}
              downloadUrl={rawOutput.downloadUrl}
              onDownload={onEditAssumptions} // Reuse for download
            />
          );
        }
        return <ThreeStatementPreview output={outputWithPreview as any} ticker={ticker} />;
      case 'dcf':
        return (
          <DcfPreview 
            output={outputWithPreview as any} 
            ticker={ticker} 
            onEditAssumptions={onEditAssumptions} 
            rawDcfOutput={rawOutput || null}
          />
        );
      case 'lbo':
        return <LboPreview output={outputWithPreview as any} ticker={ticker} />;
      case 'comps':
        // Use literal preview if available (preview from generatePreviewFromWorkbook)
        if (rawOutput?.preview && rawOutput.preview.columns && rawOutput.preview.columns.length > 0) {
          const { LiteralCompsPreview } = require('./LiteralCompsPreview');
          return (
            <LiteralCompsPreview
              preview={rawOutput.preview}
              ticker={ticker}
              downloadUrl={rawOutput.downloadUrl}
              onDownload={onEditAssumptions} // Reuse for download
            />
          );
        }
        return <CompsPreview output={outputWithPreview as any} ticker={ticker} onEditPeers={onEditAssumptions} />;
      case 'merger':
        return <MergerPreview output={outputWithPreview as any} ticker={ticker} />;
      case 'operating':
        return <OperatingPreview output={outputWithPreview as any} ticker={ticker} />;
      case 'scorecard':
        return <ScorecardPreview output={rawOutput || outputWithPreview} ticker={ticker} />;
      default:
        return (
          <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
            <CardContent className="p-6 text-center text-sm text-[var(--cb-text-muted)]">
              Preview not available for model type: {modelType}
            </CardContent>
          </Card>
        );
    }
  } catch (error: any) {
    console.error('[PreviewForModelType] Error rendering preview:', error);
    return (
      <Card className="border-[var(--cb-danger)]/50 bg-[var(--cb-danger)]/5">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-sm text-[var(--cb-danger)]">
            <AlertTriangle className="h-5 w-5" />
            <span>Preview parsing error: {error?.message || 'Unknown error'}</span>
          </div>
          <p className="mt-2 text-xs text-[var(--cb-text-muted)]">
            The model was generated successfully, but the preview could not be rendered. Download the Excel file to view
            the full results.
          </p>
        </CardContent>
      </Card>
    );
  }
}
