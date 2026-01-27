"use client";

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MaPreview } from '@/components/ma/MaPreview';
import type { MergerOutput } from '@/lib/models/outputTypes';
import { PreviewShell } from './PreviewShell';

interface MergerPreviewProps {
  output: MergerOutput;
  ticker: string;
}

export function MergerPreview({ output, ticker }: MergerPreviewProps) {
  const safeTicker = ticker ?? (output as any)?.ticker ?? '';
  if (output.maInputs && output.maV1) {
    return (
      <PreviewShell title="M&A Preview" badgeText="M&A" ticker={safeTicker} subtitle="Accretion/dilution and consideration mix">
        <MaPreview inputs={output.maInputs} outputs={output.maV1} ticker={safeTicker} />
      </PreviewShell>
    );
  }

  return (
    <PreviewShell title="M&A Preview" badgeText="M&A" ticker={safeTicker}>
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardContent className="p-6 text-sm text-[var(--cb-text-muted)]">
          M&A preview data for {safeTicker} is not available. Generate the model to see the deal preview.
        </CardContent>
      </Card>
    </PreviewShell>
  );
}
