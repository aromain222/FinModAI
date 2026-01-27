'use client';

import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModelAndVizArtifact } from '@/lib/ai/schemas';
import { getObjectiveMetric, findOutputByKey } from '@/lib/modeling/objectiveMetric';

type ObjectiveMetricSelectorProps = {
  artifact: ModelAndVizArtifact;
  onMetricChange?: (key: string, label: string) => void;
};

export function ObjectiveMetricSelector({ artifact, onMetricChange }: ObjectiveMetricSelectorProps) {
  const currentObjective = getObjectiveMetric(artifact);
  const [selectedKey, setSelectedKey] = useState<string>(currentObjective.key);

  // Update selected key when artifact changes
  useEffect(() => {
    const updated = getObjectiveMetric(artifact);
    setSelectedKey(updated.key);
  }, [artifact.model.objective_metric_key, artifact.model.objective_metric_label]);

  const handleChange = (newKey: string) => {
    const output = findOutputByKey(artifact.model.outputs, newKey);
    if (output) {
      setSelectedKey(newKey);
      // Update artifact in-place
      artifact.model.objective_metric_key = output.key;
      artifact.model.objective_metric_label = output.label;
      if (onMetricChange) {
        onMetricChange(output.key, output.label);
      }
    }
  };

  const selectedOutput = artifact.model.outputs.find((out) => out.key === selectedKey);
  const confidence = currentObjective.confidence;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-emerald-400" />
        <Label htmlFor="objective-metric" className="text-sm font-medium text-slate-300">
          Objective Metric
        </Label>
        <Badge
          variant="outline"
          className={cn(
            'text-xs',
            confidence === 'high'
              ? 'border-emerald-500/30 text-emerald-300'
              : confidence === 'medium'
              ? 'border-amber-500/30 text-amber-300'
              : 'border-slate-600/50 text-slate-400'
          )}
        >
          {confidence === 'high' ? 'High confidence' : confidence === 'medium' ? 'Medium confidence' : 'Auto-selected'}
        </Badge>
      </div>
      <Select value={selectedKey} onValueChange={handleChange}>
        <SelectTrigger id="objective-metric" className="bg-slate-900 border-slate-700 text-white">
          <SelectValue placeholder="Select objective metric" />
        </SelectTrigger>
        <SelectContent className="bg-slate-900 border-slate-700">
          {artifact.model.outputs.map((output) => (
            <SelectItem key={output.key} value={output.key} className="text-white">
              {output.label} ({output.key})
              {output.unit && <span className="text-slate-400 ml-2">— {output.unit}</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedOutput && (
        <p className="text-xs text-slate-400">
          Charts, sensitivity analysis, and key outputs will focus on <strong>{selectedOutput.label}</strong>
        </p>
      )}
    </div>
  );
}

