'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, TrendingUp, TrendingDown } from 'lucide-react';
import type { AgentOutput } from '@/lib/ai/schemas';

type ValidationResult = {
  passed: boolean;
  warnings: Array<{ code: string; message: string; affected_keys: string[] }>;
};

type DriverContribution = {
  driver: string;
  direction: 'positive' | 'negative';
  magnitude: string;
  explanation: string;
};

type ExplainabilityResult = {
  primary_metric: string;
  contributions: DriverContribution[];
};

type AssumptionsSummary = {
  placeholder_count: number;
  high_impact_placeholders: string[];
  notes: string;
};

export function ModelChecksPanel({ output }: { output: AgentOutput }) {
  if (output.type !== 'MODEL_AND_VIZ') return null;

  const validation = output.validation;
  const explainability = output.explainability;
  const assumptions_summary = output.assumptions_summary;

  if (!validation && !explainability && !assumptions_summary) return null;

  const [expanded, setExpanded] = useState(false);

  const statusColor = validation?.passed
    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
    : validation?.warnings.length
    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
    : 'bg-slate-700/50 text-slate-300 border-slate-600/30';

  const StatusIcon = validation?.passed ? CheckCircle2 : AlertTriangle;

  return (
    <Card className="border border-white/10 bg-black/40 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge className={cn('border', statusColor)}>
            <StatusIcon className="mr-1 h-3 w-3" />
            Model Checks: {validation?.passed ? 'Passed' : validation?.warnings.length ? 'Warnings' : 'Unknown'}
          </Badge>
          {validation?.warnings.length ? (
            <Badge variant="outline" className="border-amber-500/30 text-amber-200">
              {validation.warnings.length} warning{validation.warnings.length > 1 ? 's' : ''}
            </Badge>
          ) : null}
          {assumptions_summary?.placeholder_count ? (
            <Badge variant="outline" className="border-slate-500/30 text-slate-300">
              {assumptions_summary.placeholder_count} placeholder{assumptions_summary.placeholder_count > 1 ? 's' : ''}
            </Badge>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="text-slate-400 hover:text-white"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Validation Warnings */}
          {validation && validation.warnings.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-white">Validation Warnings</h4>
              <div className="space-y-2">
                {validation.warnings.map((warning, idx) => (
                  <div key={idx} className="rounded border border-amber-500/20 bg-amber-500/5 p-3 text-xs">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-3 w-3 text-amber-400" />
                      <div className="flex-1">
                        <div className="font-medium text-amber-200">{warning.code}</div>
                        <div className="mt-1 text-slate-300">{warning.message}</div>
                        {warning.affected_keys.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {warning.affected_keys.map((key) => (
                              <Badge key={key} variant="outline" className="border-slate-600/50 text-xs text-slate-400">
                                {key}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Driver Contributions */}
          {explainability && explainability.contributions.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-white">
                Driver Contributions to {explainability.primary_metric}
              </h4>
              <div className="space-y-2">
                {explainability.contributions.map((contribution, idx) => (
                  <div key={idx} className="rounded border border-white/5 bg-white/5 p-3 text-xs">
                    <div className="flex items-start gap-2">
                      {contribution.direction === 'positive' ? (
                        <TrendingUp className="mt-0.5 h-3 w-3 text-emerald-400" />
                      ) : (
                        <TrendingDown className="mt-0.5 h-3 w-3 text-rose-400" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{contribution.driver}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              'border text-xs',
                              contribution.magnitude === 'High'
                                ? 'border-rose-500/30 text-rose-300'
                                : contribution.magnitude === 'Moderate'
                                ? 'border-amber-500/30 text-amber-300'
                                : 'border-slate-600/50 text-slate-400'
                            )}
                          >
                            {contribution.magnitude}
                          </Badge>
                        </div>
                        <div className="mt-1 text-slate-300">{contribution.explanation}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assumptions Summary */}
          {assumptions_summary && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-white">Assumptions Summary</h4>
              <div className="rounded border border-white/5 bg-white/5 p-3 text-xs">
                <div className="text-slate-300">{assumptions_summary.notes}</div>
                {assumptions_summary.high_impact_placeholders.length > 0 && (
                  <div className="mt-2">
                    <div className="mb-1 text-slate-400">High-Impact Placeholders:</div>
                    <div className="flex flex-wrap gap-1">
                      {assumptions_summary.high_impact_placeholders.map((placeholder, idx) => (
                        <Badge key={idx} variant="outline" className="border-amber-500/30 text-xs text-amber-200">
                          {placeholder}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

