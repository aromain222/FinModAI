'use client';

import { useEffect, useCallback, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useModelEditorStore } from '@/lib/stores/modelEditor';
import { DebouncedSlider } from './DebouncedSlider';
import { BlockRenderer } from './BlockRenderer';
import { TornadoChart } from './TornadoChart';
import { SensitivityResultsTable } from './SensitivityResultsTable';
import { ModelVersionsDropdown } from './ModelVersionsDropdown';
import { modelToBlocks } from '@/lib/render/blocks';
import { oneWaySensitivity } from '@/lib/modeling/sensitivity';
import { compareVersionWithCurrent } from '@/lib/modeling/versioning';
import type { ModelVersion } from '@/lib/modeling/versioning';
import type { OneWaySensitivityResult } from '@/lib/modeling/sensitivity';
import { cn } from '@/lib/utils';
import type { ModelAndVizArtifact } from '@/lib/ai/schemas';
import { Save, History, TrendingUp } from 'lucide-react';

type ModelEditorProps = {
  artifact: ModelAndVizArtifact;
  artifactId?: string; // For versioning
  initialInputOverrides?: Record<string, number>;
  onEvaluationUpdate?: (output: any) => void;
  onArtifactUpdate?: (artifact: ModelAndVizArtifact) => void;
  className?: string;
};

/**
 * Interactive Model Editor
 * Features:
 * - Editable inputs (sliders, numbers, percent)
 * - Scenario overrides editor
 * - Instant client-side recompute
 * - Highlight low-confidence assumptions
 */
export function ModelEditor({
  artifact: initialArtifact,
  artifactId,
  initialInputOverrides = {},
  onEvaluationUpdate,
  onArtifactUpdate,
  className,
}: ModelEditorProps) {
  const {
    artifact,
    evaluationOutput,
    inputOverrides,
    scenarioOverrides,
    isLoading,
    error,
    setArtifact,
    setEvaluationOutput,
    updateInput,
    updateScenarioOverride,
    removeScenarioOverride,
    setLoading,
    setError,
  } = useModelEditorStore();

  // Sensitivity analysis state
  const [sensitivityResult, setSensitivityResult] = useState<OneWaySensitivityResult | null>(null);
  const [isRunningSensitivity, setIsRunningSensitivity] = useState(false);
  const [selectedMetricKey, setSelectedMetricKey] = useState<string>('');

  // Versioning state
  const [createVersionOpen, setCreateVersionOpen] = useState(false);
  const [versionLabel, setVersionLabel] = useState('');
  const [versionNotes, setVersionNotes] = useState('');
  const [compareVersion, setCompareVersion] = useState<ModelVersion | null>(null);

  // Initialize artifact on mount
  useEffect(() => {
    setArtifact(initialArtifact);
    // Apply initial overrides
    Object.entries(initialInputOverrides).forEach(([key, value]) => {
      updateInput(key, value);
    });
  }, [initialArtifact, setArtifact]);

  // Fetch evaluation when inputs change
  const evaluateModel = useCallback(async () => {
    if (!artifact) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/models/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artifact,
          inputOverrides,
          scenarioOverrides,
          generateScenarios: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Evaluation failed');
      }

      const data = await response.json();
      setEvaluationOutput(data.output);
      
      if (onEvaluationUpdate) {
        onEvaluationUpdate(data.output);
      }
    } catch (err: any) {
      console.error('[ModelEditor] evaluation error', err);
      setError(err.message || 'Failed to evaluate model');
    } finally {
      setLoading(false);
    }
  }, [artifact, inputOverrides, setLoading, setError, setEvaluationOutput, onEvaluationUpdate]);

  // Debounced evaluation (triggered on input changes)
  useEffect(() => {
    if (!artifact) return;

    const timeoutId = setTimeout(() => {
      evaluateModel();
    }, 200); // 200ms debounce for evaluation

    return () => clearTimeout(timeoutId);
  }, [artifact, inputOverrides, evaluateModel]);

  // Prepare inputs with overrides for display
  const effectiveInputs = useMemo(() => {
    if (!artifact) return [];
    
    return artifact.model.inputs.map((input) => {
      const overrideValue = inputOverrides[input.key];
      const effectiveValue = overrideValue !== undefined ? overrideValue : input.value;
      
      return {
        ...input,
        value: effectiveValue,
        originalValue: input.value,
        isOverridden: overrideValue !== undefined,
      };
    });
  }, [artifact, inputOverrides]);

  // Group inputs by category
  const inputGroups = useMemo(() => {
    const groups: Record<string, typeof effectiveInputs> = {
      'Base Inputs': [],
      'Scenarios': [],
    };

    effectiveInputs.forEach((input) => {
      // Determine if it's a scenario input (for now, just put all in Base)
      groups['Base Inputs'].push(input);
    });

    return groups;
  }, [effectiveInputs]);

  // Get scenario override values for a specific scenario
  const getScenarioInputValue = useCallback(
    (scenarioId: string, inputKey: string): number | null => {
      const override = scenarioOverrides.find(
        (o) => o.scenarioId === scenarioId && o.inputKey === inputKey
      );
      return override?.value ?? null;
    },
    [scenarioOverrides]
  );

  // Highlight low-confidence assumptions
  const isLowConfidence = useCallback((input: typeof effectiveInputs[0]) => {
    // Check source field: 'placeholder' or 'inferred' are low confidence
    return input.source === 'placeholder' || input.source === 'inferred';
  }, []);

  if (!artifact) {
    return (
      <div className="text-sm text-slate-400 p-4">No model artifact available.</div>
    );
  }

  const renderBlocks = evaluationOutput
    ? modelToBlocks(artifact, evaluationOutput)
    : [];

  return (
    <div className={cn('space-y-6', className)}>
      {/* Error Display */}
      {error && (
        <Card className="border-red-500/50 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">Error: {error}</p>
        </Card>
      )}

      {/* Loading Indicator */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
          Recomputing model...
        </div>
      )}

      {/* Header Actions */}
      {artifactId && (
        <div className="flex items-center justify-end gap-2">
          <ModelVersionsDropdown
            artifactId={artifactId}
            currentArtifact={artifact || initialArtifact}
            onRestore={(restored) => {
              const restoredArtifact = {
                ...(artifact || initialArtifact),
                model: {
                  ...(artifact || initialArtifact).model,
                  inputs: restored.base_inputs || (artifact || initialArtifact).model.inputs,
                  equations: restored.formula_overrides || (artifact || initialArtifact).model.equations,
                },
              };
              setArtifact(restoredArtifact);
              if (onEvaluationUpdate) {
                onEvaluationUpdate(null); // Trigger re-evaluation
              }
            }}
          />
          <Dialog open={createVersionOpen} onOpenChange={setCreateVersionOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Save className="h-4 w-4" />
                Save Version
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save Model Version</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Label (optional)</Label>
                  <Input
                    value={versionLabel}
                    onChange={(e) => setVersionLabel(e.target.value)}
                    placeholder="e.g., Baseline Q1 2024"
                  />
                </div>
                <div>
                  <Label>Notes (optional)</Label>
                  <Textarea
                    value={versionNotes}
                    onChange={(e) => setVersionNotes(e.target.value)}
                    placeholder="Describe what changed in this version..."
                    rows={3}
                  />
                </div>
                <Button
                  onClick={async () => {
                    if (!artifactId) return;
                    try {
                      const res = await fetch('/api/model/version', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          artifact_id: artifactId,
                          label: versionLabel || null,
                          notes: versionNotes || null,
                        }),
                      });
                      if (res.ok) {
                        setCreateVersionOpen(false);
                        setVersionLabel('');
                        setVersionNotes('');
                      }
                    } catch (err) {
                      console.error('Failed to save version', err);
                    }
                  }}
                >
                  Save
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <Tabs defaultValue="inputs" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="inputs">Inputs</TabsTrigger>
          <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
          <TabsTrigger value="sensitivity">Sensitivity</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="outputs">Outputs</TabsTrigger>
        </TabsList>

        {/* Inputs Tab */}
        <TabsContent value="inputs" className="space-y-4">
          <Card className="border border-white/10 bg-black/40 p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Model Inputs
            </h3>
            
            <div className="space-y-6">
              {effectiveInputs.map((input) => {
                const isLowConf = isLowConfidence(input);
                
                return (
                  <div
                    key={input.key}
                    className={cn(
                      'rounded-lg border p-4 transition-colors',
                      isLowConf
                        ? 'border-yellow-500/30 bg-yellow-500/5'
                        : 'border-white/10 bg-black/20',
                      input.isOverridden && 'ring-2 ring-emerald-500/50'
                    )}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium text-slate-300">
                          {input.label}
                        </Label>
                        {isLowConf && (
                          <Badge
                            variant="outline"
                            className="border-yellow-500/50 bg-yellow-500/10 text-yellow-400 text-[10px]"
                          >
                            {input.source || 'Low Confidence'}
                          </Badge>
                        )}
                        {input.isOverridden && (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/50 bg-emerald-500/10 text-emerald-400 text-[10px]"
                          >
                            Overridden
                          </Badge>
                        )}
                      </div>
                      {input.originalValue !== input.value && (
                        <button
                          onClick={() => updateInput(input.key, input.originalValue)}
                          className="text-xs text-slate-400 hover:text-slate-300"
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    <DebouncedSlider
                      label={input.label}
                      inputKey={input.key}
                      value={input.value}
                      defaultValue={input.originalValue}
                      unit={input.unit}
                      onChange={(value) => updateInput(input.key, value)}
                      className={cn(isLowConf && 'opacity-90')}
                    />

                    {input.notes && (
                      <p className="mt-2 text-xs text-slate-400">{input.notes}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>

        {/* Scenarios Tab */}
        <TabsContent value="scenarios" className="space-y-4">
          <Card className="border border-white/10 bg-black/40 p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Scenario Overrides
            </h3>
            <p className="mb-4 text-xs text-slate-400">
              Override specific inputs for Base, Upside, or Downside scenarios.
            </p>

            <Tabs defaultValue="base" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="base">Base</TabsTrigger>
                <TabsTrigger value="upside">Upside</TabsTrigger>
                <TabsTrigger value="downside">Downside</TabsTrigger>
              </TabsList>

              {['base', 'upside', 'downside'].map((scenarioId) => {
                const scenarioName = scenarioId.charAt(0).toUpperCase() + scenarioId.slice(1);
                
                return (
                  <TabsContent key={scenarioId} value={scenarioId} className="space-y-4">
                    <div className="space-y-4">
                      {effectiveInputs.map((input) => {
                        const scenarioValue = getScenarioInputValue(
                          scenarioName,
                          input.key
                        );
                        const effectiveValue =
                          scenarioValue !== null ? scenarioValue : input.value;
                        const hasOverride = scenarioValue !== null;

                        return (
                          <div
                            key={input.key}
                            className={cn(
                              'rounded-lg border p-4',
                              hasOverride
                                ? 'border-emerald-500/30 bg-emerald-500/5'
                                : 'border-white/10 bg-black/20'
                            )}
                          >
                            <div className="mb-3 flex items-center justify-between gap-2">
                              <Label className="text-sm font-medium text-slate-300">
                                {input.label}
                              </Label>
                              {hasOverride && (
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className="border-emerald-500/50 bg-emerald-500/10 text-emerald-400 text-[10px]"
                                  >
                                    Override
                                  </Badge>
                                  <button
                                    onClick={() =>
                                      removeScenarioOverride(scenarioName, input.key)
                                    }
                                    className="text-xs text-slate-400 hover:text-slate-300"
                                  >
                                    Remove
                                  </button>
                                </div>
                              )}
                            </div>

                            <DebouncedSlider
                              label={`${input.label} (${scenarioName})`}
                              inputKey={input.key}
                              value={effectiveValue}
                              defaultValue={input.originalValue}
                              unit={input.unit}
                              onChange={(value) =>
                                updateScenarioOverride(scenarioName, input.key, value)
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          </Card>
        </TabsContent>

        {/* Outputs Tab */}
        <TabsContent value="outputs" className="space-y-4">
          {renderBlocks.length > 0 ? (
            <BlockRenderer blocks={renderBlocks} />
          ) : (
            <Card className="border border-white/10 bg-black/40 p-5">
              <p className="text-sm text-slate-400">
                {isLoading
                  ? 'Evaluating model...'
                  : 'No output available. Adjust inputs to see results.'}
              </p>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

