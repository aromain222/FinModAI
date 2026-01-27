'use client';

import { useMemo, useState, useCallback, memo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AgentOutputSchema, type AgentInput, type AgentOutput, type ModelAndVizArtifact } from '@/lib/ai/schemas';
import { ensureRenderBlocks } from '@/lib/ai/renderBlocks';
import { BlockRenderer } from '@/components/agent/BlockRenderer';
import { ClarifyingWorkflow } from '@/components/agent/ClarifyingWorkflow';
import { ModelChecksPanel } from '@/components/agent/ModelChecksPanel';
import { ModelVersionsDropdown } from '@/components/agent/ModelVersionsDropdown';
import { SensitivityPanel } from '@/components/agent/SensitivityPanel';
import { ObjectiveMetricSelector } from '@/components/agent/ObjectiveMetricSelector';
import { ExportPack } from '@/components/agent/ExportPack';
import type { OneWaySensitivityResult } from '@/lib/modeling/sensitivity';

// Memoized components to prevent unnecessary re-renders
const MemoizedSensitivityPanel = memo(SensitivityPanel);
const MemoizedExportPack = memo(({ output, artifact, sensitivityResult }: { output: AgentOutput; artifact: ModelAndVizArtifact; sensitivityResult: OneWaySensitivityResult | null }) => (
  <Card className="border border-white/10 bg-black/40 p-5">
    <div className="mb-3">
      <h3 className="text-lg font-semibold text-white">Export Pack</h3>
      <p className="text-xs text-slate-400 mt-1">Download data and copy summaries for external use</p>
    </div>
    <ExportPack 
      output={output}
      artifact={artifact}
      sensitivityResult={sensitivityResult}
    />
  </Card>
));
MemoizedExportPack.displayName = 'MemoizedExportPack';

export function AgentOutputRenderer(props: {
  output: AgentOutput | unknown;
  originalPrompt?: string;
  context?: AgentInput['context'];
  onResolved?: (next: AgentOutput) => void;
}) {
  const parsed = useMemo(() => AgentOutputSchema.safeParse(props.output), [props.output]);
  const output = parsed.success ? ensureRenderBlocks(parsed.data) : null;

  const [copied, setCopied] = useState(false);
  const [, forceUpdate] = useState({});
  const [sensitivityResult, setSensitivityResult] = useState<OneWaySensitivityResult | null>(null);

  const handleObjectiveMetricChange = useCallback((key: string, label: string) => {
    if (output && output.type === 'MODEL_AND_VIZ' && output.artifact) {
      output.artifact.model.objective_metric_key = key;
      output.artifact.model.objective_metric_label = label;
      // Force re-render
      forceUpdate({});
    }
  }, [output]);

  if (!output) {
    return (
      <Card className="border border-white/10 bg-black/40 p-5">
        <div className="text-sm text-slate-300">Artifact unavailable (invalid agent output).</div>
        <pre className="mt-3 text-xs text-slate-400 whitespace-pre-wrap break-words">{JSON.stringify(props.output, null, 2)}</pre>
      </Card>
    );
  }

  const confidencePct = Math.round(output.confidence * 100);
  const confidenceClass =
    confidencePct >= 75
      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
      : confidencePct >= 45
      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
      : 'bg-slate-700/40 text-slate-300 border-slate-600/30';

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(output, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border border-white/10 bg-black/40 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold text-white truncate">{output.title}</div>
            <div className="mt-1 text-sm text-slate-300">{output.summary}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <Badge className={cn('border', confidenceClass)}>{confidencePct}% confidence</Badge>
              <Badge className="bg-white/5 text-slate-200 border border-white/10">{output.type}</Badge>
              {(output.warnings ?? []).slice(0, 3).map((w) => (
                <Badge key={w} variant="outline" className="border-white/10 text-slate-400">
                  {w}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {output.type === 'MODEL_AND_VIZ' && output.artifact && (
              <ModelVersionsDropdown
                artifactId={output.id}
                currentArtifact={output.artifact}
                onRestore={(restoredData) => {
                  console.log('Version restored:', restoredData);
                  // TODO: Apply restored data to editor state
                }}
              />
            )}
            <Button variant="secondary" size="sm" onClick={onCopy}>
              {copied ? 'Copied' : 'Copy JSON'}
            </Button>
          </div>
        </div>

        {output.clarifying_questions.length && props.originalPrompt && props.onResolved ? (
          <ClarifyingWorkflow
            output={output}
            originalPrompt={props.originalPrompt}
            context={props.context}
            onResolved={props.onResolved}
          />
        ) : null}
      </Card>

      {output.type === 'MODEL_AND_VIZ' && output.artifact ? (
        <Card className="border border-white/10 bg-black/40 p-5">
          <ObjectiveMetricSelector
            artifact={output.artifact}
            onMetricChange={handleObjectiveMetricChange}
          />
        </Card>
      ) : null}

      {output.type === 'MODEL_AND_VIZ' && (output.validation || output.explainability || output.assumptions_summary) ? (
        <ModelChecksPanel output={output} />
      ) : null}

      {output.type === 'MODEL_AND_VIZ' && output.artifact ? (
        <>
          <MemoizedSensitivityPanel 
            artifact={output.artifact}
            onSensitivityResult={setSensitivityResult}
          />
          <MemoizedExportPack 
            output={output}
            artifact={output.artifact}
            sensitivityResult={sensitivityResult}
          />
        </>
      ) : null}

      <BlockRenderer blocks={output.render_blocks} />

      <details className="rounded-lg border border-white/10 bg-black/30 p-4">
        <summary className="cursor-pointer select-none text-xs text-slate-400">Raw JSON</summary>
        <pre className="mt-3 text-xs text-slate-300 whitespace-pre-wrap break-words">{JSON.stringify(output, null, 2)}</pre>
      </details>
    </div>
  );
}
