"use client";

import React from 'react';
import type { ModelOutput } from '@/lib/models/outputTypes';
import { ThreeStatementPreview } from './ThreeStatementPreview';
import { DcfPreview } from './DcfPreview';
import { LboPreview } from './LboPreview';
import { CompsPreview } from './CompsPreview';
import { MergerPreview } from './MergerPreview';
import { OperatingPreview } from './OperatingPreview';
import { StandardizedPreview } from './StandardizedPreview';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

interface PreviewForModelTypeProps {
  modelType: ModelOutput['type'];
  output: ModelOutput['data'];
  ticker: string;
  onEditAssumptions?: () => void;
  rawOutput?: any; // For debug drawer
  financials?: any; // For three-statement preview
  assumptions?: any; // For three-statement preview
}

/**
 * Normalize output to handle both old and new schema formats
 */
function normalizeOutput(output: any): any {
  if (!output) return {};
  
  // If output is a string, try to parse it
  if (typeof output === 'string') {
    try {
      output = JSON.parse(output);
    } catch (e) {
      console.warn('[PreviewForModelType] Failed to parse output string:', e);
      return {};
    }
  }
  
  // Handle legacy schema mapping
  const normalized = { ...output };
  
  // Map old valuationResults to new valuation structure
  if (output.valuationResults && !output.valuation) {
    normalized.valuation = {
      impliedValuePerShare: output.valuationResults?.pricePerShare ?? output.valuationResults?.impliedValuePerShare,
      enterpriseValue: output.valuationResults?.enterpriseValue,
      equityValue: output.valuationResults?.equityValue,
      currentPrice: output.valuationResults?.currentPrice,
      upsideDownside: output.valuationResults?.upsideDownside,
    };
  }
  
  // Map old keyAssumptions to new assumptions structure
  if (output.keyAssumptions && !output.assumptions) {
    normalized.assumptions = output.keyAssumptions;
  }
  
  return normalized;
}

/**
 * Selects and renders the appropriate preview component based on model type.
 * Handles parsing errors gracefully.
 */
/**
 * Check if output has standardized preview format (KPIs, assumptions, charts, checks)
 */
function isStandardizedPreview(output: any): boolean {
  if (!output) return false;
  
  // Check if output has the new standardized format
  const hasKpis = Array.isArray(output.kpis);
  const hasAssumptions = Array.isArray(output.assumptions);
  const hasCharts = Array.isArray(output.charts);
  const hasChecks = Array.isArray(output.checks);
  
  // If it has kpis or assumptions in the standardized format, use it
  return hasKpis || hasAssumptions || (hasCharts && output.charts.length > 0) || hasChecks;
}

export function PreviewForModelType({ modelType, output, ticker, onEditAssumptions, rawOutput, financials, assumptions }: PreviewForModelTypeProps) {
  // Normalize output to handle schema variations
  const normalizedOutput = normalizeOutput(output);
  
  // Check if this is the new standardized preview format
  const isStandardized = isStandardizedPreview(normalizedOutput);
  
  // If it's a standardized preview and it's one of the supported model types, use StandardizedPreview
  if (isStandardized && (modelType === 'lbo' || modelType === 'comps' || modelType === 'merger')) {
    try {
      return (
        <StandardizedPreview
          preview={normalizedOutput as any}
          modelType={modelType}
          ticker={ticker}
        />
      );
    } catch (error) {
      console.warn('[PreviewForModelType] Error rendering standardized preview, falling back to legacy:', error);
      // Fall through to legacy previews
    }
  }
  
  try {
    switch (modelType) {
      case 'three-statement':
        return (
          <ThreeStatementPreview 
            output={normalizedOutput as any} 
            ticker={ticker} 
            isLoading={false}
            financials={financials}
            assumptions={assumptions}
          />
        );
      case 'dcf':
        return (
          <DcfPreview 
            output={normalizedOutput as any} 
            ticker={ticker} 
            onEditAssumptions={onEditAssumptions} 
            rawDcfOutput={rawOutput || null}
          />
        );
      case 'lbo':
        return <LboPreview output={normalizedOutput as any} ticker={ticker} />;
      case 'comps':
        return <CompsPreview output={normalizedOutput as any} ticker={ticker} />;
      case 'merger':
        return <MergerPreview output={normalizedOutput as any} ticker={ticker} />;
      case 'operating':
        return <OperatingPreview output={normalizedOutput as any} ticker={ticker} />;
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
    // SAFETY RULE: Log internally but never show error state - provide narrative preview
    console.error('[PreviewForModelType] Error rendering preview:', error);
    console.error('[PreviewForModelType] Output:', output);
    console.error('[PreviewForModelType] Normalized output:', normalizedOutput);
    
    // SAFETY RULE: Always render preview, never empty state
    return (
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-2">{ticker} {modelType} Model</h3>
          <p className="text-sm text-[var(--cb-text-muted)] mb-4">
            Analysis preview for {modelType} model. Review assumptions and generate model for detailed results.
          </p>
          <div className="text-xs text-[var(--cb-text-muted)]">
            <p className="mb-2">Key insights:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Model assumptions drive valuation outcomes</li>
              <li>Review sensitivity analysis for key variables</li>
              <li>Download Excel file for detailed calculations</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    );
  }
}
