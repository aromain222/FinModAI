'use client';

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModelAndVizArtifact } from '@/lib/ai/schemas';
import { getObjectiveMetric } from '@/lib/modeling/objectiveMetric';
import { TornadoChart } from './TornadoChart';
import { SensitivityResultsTable } from './SensitivityResultsTable';
import { TwoWaySensitivityTable } from './TwoWaySensitivityTable';
import type { OneWaySensitivityResult, TwoWaySensitivityGrid } from '@/lib/modeling/sensitivity';

type SensitivityPanelProps = {
  artifact: ModelAndVizArtifact;
  onSensitivityResult?: (result: OneWaySensitivityResult | null) => void;
};

export function SensitivityPanel({ artifact, onSensitivityResult }: SensitivityPanelProps) {
  const [selectedMetric, setSelectedMetric] = useState<string>('');
  const [selectedXInput, setSelectedXInput] = useState<string>('');
  const [selectedYInput, setSelectedYInput] = useState<string>('');
  const [oneWayResult, setOneWayResult] = useState<OneWaySensitivityResult | null>(null);
  const [twoWayResult, setTwoWayResult] = useState<TwoWaySensitivityGrid | null>(null);
  const [analysisMode, setAnalysisMode] = useState<'one-way' | 'two-way'>('one-way');

  // Memoize outputs and inputs to prevent recalculation
  const outputs = useMemo(() => artifact.model.outputs || [], [artifact.model.outputs]);
  const inputs = useMemo(() => artifact.model.inputs || [], [artifact.model.inputs]);
  
  const numericInputs = useMemo(() => {
    return inputs.filter((inp) => {
      const val = typeof inp.value === 'number' ? inp.value : typeof inp.value === 'string' ? Number(inp.value) : null;
      return val !== null && Number.isFinite(val);
    });
  }, [inputs]);

  // Set default metric from objective metric or first output
  const objectiveMetric = useMemo(() => getObjectiveMetric(artifact), [artifact]);
  
  // Use useEffect to set initial metric to avoid React warnings
  useEffect(() => {
    if (!selectedMetric && objectiveMetric.key) {
      setSelectedMetric(objectiveMetric.key);
    }
  }, [objectiveMetric.key, selectedMetric]);

  const oneWayMutation = useMutation({
    mutationFn: async ({ metricKey, pct, topN }: { metricKey: string; pct: number; topN: number }) => {
      const { oneWaySensitivity } = await import('@/lib/modeling/sensitivity');
      return oneWaySensitivity(artifact, metricKey, pct, topN);
    },
    onSuccess: (result) => {
      setOneWayResult(result);
      setAnalysisMode('one-way');
      if (onSensitivityResult) {
        onSensitivityResult(result);
      }
    },
  });

  const twoWayMutation = useMutation({
    mutationFn: async ({
      metricKey,
      xKey,
      yKey,
      steps,
      pct,
    }: {
      metricKey: string;
      xKey: string;
      yKey: string;
      steps: number;
      pct: number;
    }) => {
      const { twoWaySensitivity } = await import('@/lib/modeling/sensitivity');
      return twoWaySensitivity(artifact, metricKey, xKey, yKey, steps, pct);
    },
    onSuccess: (result) => {
      setTwoWayResult(result);
      setAnalysisMode('two-way');
    },
  });

  const handleRunOneWay = useCallback(() => {
    if (!selectedMetric) return;
    oneWayMutation.mutate({ metricKey: selectedMetric, pct: 0.1, topN: 8 });
  }, [selectedMetric, oneWayMutation]);

  const handleRunTwoWay = useCallback(() => {
    if (!selectedMetric || !selectedXInput || !selectedYInput) return;
    twoWayMutation.mutate({ metricKey: selectedMetric, xKey: selectedXInput, yKey: selectedYInput, steps: 5, pct: 0.2 });
  }, [selectedMetric, selectedXInput, selectedYInput, twoWayMutation]);

  return (
    <Card className="border border-white/10 bg-black/40 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Sensitivity Analysis</h3>
        <div className="flex gap-2">
          <Button
            variant={analysisMode === 'one-way' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAnalysisMode('one-way')}
          >
            1-Way
          </Button>
          <Button
            variant={analysisMode === 'two-way' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAnalysisMode('two-way')}
          >
            2-Way
          </Button>
        </div>
      </div>

      {/* Metric Selection */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-slate-300">Output Metric</label>
        <Select value={selectedMetric} onValueChange={setSelectedMetric}>
          <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
            <SelectValue placeholder="Select metric" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            {outputs.map((output) => (
              <SelectItem key={output.key} value={output.key} className="text-white">
                {output.label} ({output.key})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 1-Way Sensitivity */}
      {analysisMode === 'one-way' && (
        <>
          <div className="mb-4">
            <Button
              onClick={handleRunOneWay}
              disabled={!selectedMetric || oneWayMutation.isPending}
              className="w-full"
            >
              {oneWayMutation.isPending ? 'Running Analysis...' : 'Run 1-Way Sensitivity'}
            </Button>
            <p className="mt-2 text-xs text-slate-400">
              Varies each input by ±10% and measures impact on {outputs.find((o) => o.key === selectedMetric)?.label || selectedMetric}
            </p>
          </div>

          {oneWayResult && (
            <div className="space-y-4">
              {oneWayResult.warnings.length > 0 && (
                <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 text-amber-400" />
                    <div className="flex-1 text-xs text-amber-200">
                      <div className="font-medium mb-1">Warnings:</div>
                      <ul className="list-disc list-inside space-y-1">
                        {oneWayResult.warnings.map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {oneWayResult.impacts.length > 0 ? (
                <>
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-white">
                      Base Value: {oneWayResult.metric_base_value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </h4>
                    <TornadoChart result={oneWayResult} />
                  </div>
                  <SensitivityResultsTable result={oneWayResult} />
                </>
              ) : (
                <div className="rounded border border-slate-700 bg-slate-900/50 p-4 text-center text-sm text-slate-400">
                  No sensitivity results available. Try running the analysis.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* 2-Way Sensitivity */}
      {analysisMode === 'two-way' && (
        <>
          <div className="mb-4 space-y-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">X-Axis Input</label>
              <Select value={selectedXInput} onValueChange={setSelectedXInput}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                  <SelectValue placeholder="Select input" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  {numericInputs.map((input) => (
                    <SelectItem key={input.key} value={input.key} className="text-white">
                      {input.label} ({input.key})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Y-Axis Input</label>
              <Select value={selectedYInput} onValueChange={setSelectedYInput}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                  <SelectValue placeholder="Select input" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  {numericInputs.filter((inp) => inp.key !== selectedXInput).map((input) => (
                    <SelectItem key={input.key} value={input.key} className="text-white">
                      {input.label} ({input.key})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleRunTwoWay}
              disabled={!selectedMetric || !selectedXInput || !selectedYInput || twoWayMutation.isPending}
              className="w-full"
            >
              {twoWayMutation.isPending ? 'Running Analysis...' : 'Run 2-Way Sensitivity'}
            </Button>
            <p className="text-xs text-slate-400">
              Creates a {5}x{5} grid varying both inputs by ±20%
            </p>
          </div>

          {twoWayResult && (
            <div className="space-y-4">
              {twoWayResult.warnings.length > 0 && (
                <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 text-amber-400" />
                    <div className="flex-1 text-xs text-amber-200">
                      <div className="font-medium mb-1">Warnings:</div>
                      <ul className="list-disc list-inside space-y-1">
                        {twoWayResult.warnings.map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {twoWayResult.grid.length > 0 ? (
                <TwoWaySensitivityTable result={twoWayResult} />
              ) : (
                <div className="rounded border border-slate-700 bg-slate-900/50 p-4 text-center text-sm text-slate-400">
                  No 2-way sensitivity results available. Try running the analysis.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

