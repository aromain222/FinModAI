'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModelAndVizArtifact } from '@/lib/ai/schemas';
import type { AgentOutput } from '@/lib/ai/schemas';
import { exportKeyOutputsCSV, exportFullTableCSV, copyToClipboard } from '@/lib/modeling/export';
import { generateSlideSummary } from '@/lib/modeling/slideSummary';
import type { OneWaySensitivityResult } from '@/lib/modeling/sensitivity';

type ExportPackProps = {
  output: AgentOutput;
  artifact: ModelAndVizArtifact;
  sensitivityResult?: OneWaySensitivityResult | null;
};

export function ExportPack({ output, artifact, sensitivityResult }: ExportPackProps) {
  const [copiedSlide, setCopiedSlide] = useState(false);
  const [copiedJSON, setCopiedJSON] = useState(false);

  const handleDownloadKeyOutputs = () => {
    try {
      exportKeyOutputsCSV(artifact);
    } catch (error) {
      console.error('Failed to export key outputs CSV:', error);
      alert('Failed to export key outputs. Please try again.');
    }
  };

  const handleDownloadFullTable = () => {
    try {
      exportFullTableCSV(artifact);
    } catch (error) {
      console.error('Failed to export full table CSV:', error);
      alert('Failed to export full table. Please try again.');
    }
  };

  const handleCopySlideSummary = async () => {
    try {
      const summary = generateSlideSummary(output, artifact, sensitivityResult || null);
      const success = await copyToClipboard(summary);
      if (success) {
        setCopiedSlide(true);
        setTimeout(() => setCopiedSlide(false), 2000);
      } else {
        alert('Failed to copy to clipboard. Please try again.');
      }
    } catch (error) {
      console.error('Failed to generate slide summary:', error);
      alert('Failed to generate slide summary. Please try again.');
    }
  };

  const handleCopyModelJSON = async () => {
    try {
      const json = JSON.stringify(artifact, null, 2);
      const success = await copyToClipboard(json);
      if (success) {
        setCopiedJSON(true);
        setTimeout(() => setCopiedJSON(false), 2000);
      } else {
        alert('Failed to copy to clipboard. Please try again.');
      }
    } catch (error) {
      console.error('Failed to copy model JSON:', error);
      alert('Failed to copy model JSON. Please try again.');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadKeyOutputs}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Download CSV: Key Outputs
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadFullTable}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Download CSV: Full Table
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopySlideSummary}
          className={cn('gap-2', copiedSlide && 'bg-emerald-600/20 border-emerald-500/50')}
        >
          {copiedSlide ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copiedSlide ? 'Copied!' : 'Copy Slide-Ready Summary'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyModelJSON}
          className={cn('gap-2', copiedJSON && 'bg-emerald-600/20 border-emerald-500/50')}
        >
          {copiedJSON ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copiedJSON ? 'Copied!' : 'Copy Model JSON'}
        </Button>
      </div>
      <p className="text-xs text-slate-400">
        Export model outputs, summaries, and data for external use. Slide-Ready Summary is optimized for presentations.
      </p>
    </div>
  );
}

