'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VersionComparison, ModelVersion } from '@/lib/modeling/versioning';
import { format } from 'date-fns';

type ComparisonPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: ModelVersion;
  comparison: VersionComparison;
};

export function ComparisonPanel({ open, onOpenChange, version, comparison }: ComparisonPanelProps) {
  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') {
      if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
      if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
      if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
      return value.toFixed(2);
    }
    return String(value);
  };

  const formatDelta = (delta: number | string | undefined, deltaPct?: number): string => {
    if (delta === undefined) return '';
    if (typeof delta === 'string') return delta;
    const sign = delta >= 0 ? '+' : '';
    const pctStr = deltaPct !== undefined ? ` (${sign}${deltaPct.toFixed(1)}%)` : '';
    return `${sign}${formatValue(delta)}${pctStr}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700 text-slate-200">
        <DialogHeader>
          <DialogTitle>Compare with Version</DialogTitle>
          <div className="text-sm text-slate-400">
            {version.label || 'Unnamed Version'} • {format(new Date(version.created_at), 'MMM dd, yyyy HH:mm')}
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Inputs Changed */}
          {comparison.inputs_changed.length > 0 && (
            <Card className="border-slate-700 bg-slate-800/50 p-4">
              <h3 className="mb-3 text-lg font-semibold text-white">Inputs Changed ({comparison.inputs_changed.length})</h3>
              <div className="space-y-3">
                {comparison.inputs_changed.map((change) => (
                  <div
                    key={change.key}
                    className="rounded border border-slate-700 bg-slate-900/50 p-3"
                  >
                    <div className="mb-2 font-medium text-white">{change.label}</div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-slate-400">
                        {change.before === null ? (
                          <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">
                            New
                          </Badge>
                        ) : (
                          formatValue(change.before)
                        )}
                      </span>
                      <ArrowRight className="h-4 w-4 text-slate-500" />
                      <span className="text-slate-200">
                        {change.after === null ? (
                          <Badge variant="outline" className="border-rose-500/30 text-rose-300">
                            Removed
                          </Badge>
                        ) : (
                          formatValue(change.after)
                        )}
                      </span>
                      {change.delta !== undefined && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'ml-auto',
                            typeof change.delta === 'number' && change.delta > 0
                              ? 'border-emerald-500/30 text-emerald-300'
                              : typeof change.delta === 'number' && change.delta < 0
                              ? 'border-rose-500/30 text-rose-300'
                              : 'border-slate-600/50 text-slate-400'
                          )}
                        >
                          {typeof change.delta === 'number' && change.delta > 0 && <TrendingUp className="mr-1 h-3 w-3" />}
                          {typeof change.delta === 'number' && change.delta < 0 && <TrendingDown className="mr-1 h-3 w-3" />}
                          {formatDelta(change.delta)}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Formulas Changed */}
          {comparison.formulas_changed.length > 0 && (
            <Card className="border-slate-700 bg-slate-800/50 p-4">
              <h3 className="mb-3 text-lg font-semibold text-white">Formulas Changed ({comparison.formulas_changed.length})</h3>
              <div className="space-y-3">
                {comparison.formulas_changed.map((change) => (
                  <div
                    key={change.key}
                    className="rounded border border-slate-700 bg-slate-900/50 p-3"
                  >
                    <div className="mb-2 font-medium text-white">{change.label}</div>
                    <div className="space-y-1 text-sm font-mono">
                      {change.before && (
                        <div className="text-slate-400">
                          <span className="text-xs text-slate-500">Before: </span>
                          {change.before}
                        </div>
                      )}
                      {change.after && (
                        <div className="text-slate-200">
                          <span className="text-xs text-slate-500">After: </span>
                          {change.after}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Outputs Changed */}
          {comparison.outputs_changed.length > 0 && (
            <Card className="border-slate-700 bg-slate-800/50 p-4">
              <h3 className="mb-3 text-lg font-semibold text-white">Outputs Changed ({comparison.outputs_changed.length})</h3>
              <div className="space-y-3">
                {comparison.outputs_changed.map((change) => (
                  <div
                    key={change.key}
                    className="rounded border border-slate-700 bg-slate-900/50 p-3"
                  >
                    <div className="mb-2 font-medium text-white">{change.label}</div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-slate-400">{formatValue(change.before)}</span>
                      <ArrowRight className="h-4 w-4 text-slate-500" />
                      <span className="text-slate-200">{formatValue(change.after)}</span>
                      {(change.delta !== undefined || change.delta_pct !== undefined) && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'ml-auto',
                            (change.delta_pct ?? 0) > 0
                              ? 'border-emerald-500/30 text-emerald-300'
                              : (change.delta_pct ?? 0) < 0
                              ? 'border-rose-500/30 text-rose-300'
                              : 'border-slate-600/50 text-slate-400'
                          )}
                        >
                          {(change.delta_pct ?? 0) > 0 && <TrendingUp className="mr-1 h-3 w-3" />}
                          {(change.delta_pct ?? 0) < 0 && <TrendingDown className="mr-1 h-3 w-3" />}
                          {formatDelta(change.delta, change.delta_pct)}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* No Changes */}
          {comparison.inputs_changed.length === 0 &&
            comparison.formulas_changed.length === 0 &&
            comparison.outputs_changed.length === 0 && (
              <Card className="border-slate-700 bg-slate-800/50 p-6 text-center">
                <Minus className="mx-auto mb-2 h-8 w-8 text-slate-500" />
                <div className="text-slate-400">No changes detected</div>
              </Card>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

