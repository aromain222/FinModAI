'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ForecastAgentForecastResult } from '@/lib/agent/forecast/types';
import { cn } from '@/lib/utils';
import { AlertTriangle, ChevronDown, FileText } from 'lucide-react';

type ForecastRendererProps = {
  result: ForecastAgentForecastResult;
  onBuildModel?: (modelType: 'OPERATING' | 'DCF' | 'COMPS') => void;
};

const coverageColors: Record<ForecastAgentForecastResult['dataCoverage']['label'], string> = {
  Strong: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  Partial: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  Weak: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
};

function fmtPct(value: number | null): string {
  return value === null ? 'N/A' : `${value.toFixed(1)}%`;
}

function fmtMultiple(value: number | null): string {
  return value === null ? 'N/A' : `${value.toFixed(1)}x`;
}

function fmtPrice(value: number | null): string {
  return value === null ? 'N/A' : `$${Math.round(value)}`;
}

export function ForecastRenderer({ result, onBuildModel }: ForecastRendererProps) {
  const base = result.scenarios.base;
  const bull = result.scenarios.bull;
  const bear = result.scenarios.bear;

  const historicalCagr = result.historicalContext.priceCAGR_5Y;
  const impliedDelta =
    historicalCagr !== null && base.impliedCAGR !== null ? base.impliedCAGR - historicalCagr : null;

  return (
    <div className="space-y-6">
      {/* Header: Data Coverage + Ticker */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Badge className={cn('text-xs px-3 py-1', coverageColors[result.dataCoverage.label])}>
            Data Coverage: {result.dataCoverage.label}
          </Badge>
          {result.ticker && (
            <span className="text-xs text-slate-400">
              {result.ticker} · {result.horizonYears}Y horizon
            </span>
          )}
        </div>
        {result.dataCoverage.missing.length > 0 && (
          <span className="text-xs text-slate-500">
            Missing: {result.dataCoverage.missing.slice(0, 3).join(', ')}
            {result.dataCoverage.missing.length > 3 ? ` +${result.dataCoverage.missing.length - 3}` : ''}
          </span>
        )}
      </div>

      {/* Historical Context */}
      <Card className="rounded-xl border border-white/5 bg-slate-950/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Historical Context</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-white/5 bg-black/20 p-3">
            <div className="text-xs text-slate-400">Revenue CAGR (5Y)</div>
            <div className="text-sm text-slate-200">{fmtPct(result.historicalContext.revenueCAGR_5Y)}</div>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/20 p-3">
            <div className="text-xs text-slate-400">Price CAGR (5Y)</div>
            <div className="text-sm text-slate-200">{fmtPct(result.historicalContext.priceCAGR_5Y)}</div>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/20 p-3">
            <div className="text-xs text-slate-400">EBITDA Margin Avg (5Y)</div>
            <div className="text-sm text-slate-200">{fmtPct(result.historicalContext.ebitdaMarginAvg_5Y)}</div>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/20 p-3">
            <div className="text-xs text-slate-400">FCF Margin Avg (5Y)</div>
            <div className="text-sm text-slate-200">{fmtPct(result.historicalContext.fcfMarginAvg_5Y)}</div>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/20 p-3 md:col-span-2">
            <div className="text-xs text-slate-400">Current Multiple</div>
            <div className="text-sm text-slate-200">
              {result.historicalContext.currentMultiple?.metric ?? 'EV/EBITDA'}:{' '}
              {fmtMultiple(result.historicalContext.currentMultiple?.value ?? null)}
            </div>
          </div>
        </div>
      </Card>

      {/* Base Scenario (always visible) */}
      <Card className="rounded-xl border border-white/5 bg-slate-950/60 p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Base Case</h3>
            <p className="text-xs text-slate-500">
              Implied CAGR vs history:{' '}
              {impliedDelta === null ? 'N/A' : `${impliedDelta >= 0 ? '+' : ''}${impliedDelta.toFixed(1)} pts`}
            </p>
          </div>
          <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/30 text-xs">Base</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-white/5 bg-black/20 p-3">
            <div className="text-xs text-slate-400">Revenue Growth</div>
            <div className="text-sm text-slate-200">{fmtPct(base.revenueGrowth)}</div>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/20 p-3">
            <div className="text-xs text-slate-400">EBITDA Margin</div>
            <div className="text-sm text-slate-200">{fmtPct(base.margin)}</div>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/20 p-3">
            <div className="text-xs text-slate-400">Valuation Multiple</div>
            <div className="text-sm text-slate-200">{fmtMultiple(base.valuationMultiple)}</div>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/20 p-3">
            <div className="text-xs text-slate-400">Implied CAGR</div>
            <div className="text-sm text-slate-200">{fmtPct(base.impliedCAGR)}</div>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/20 p-3 md:col-span-2">
            <div className="text-xs text-slate-400">Rationale</div>
            <div className="text-sm text-slate-300">{base.rationale}</div>
          </div>
        </div>
      </Card>

      {/* Bull / Bear (collapsed by default) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <details className="group">
          <summary className="list-none cursor-pointer">
            <Card className="rounded-xl border border-white/5 bg-slate-950/60 p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">Bull Case</div>
                <div className="text-xs text-slate-500">Click to expand</div>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
            </Card>
          </summary>
          <Card className="mt-3 rounded-xl border border-white/5 bg-slate-950/60 p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Revenue Growth</span>
                <span className="text-slate-200">{fmtPct(bull.revenueGrowth)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>EBITDA Margin</span>
                <span className="text-slate-200">{fmtPct(bull.margin)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Valuation Multiple</span>
                <span className="text-slate-200">{fmtMultiple(bull.valuationMultiple)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Implied CAGR</span>
                <span className="text-slate-200">{fmtPct(bull.impliedCAGR)}</span>
              </div>
              <div className="pt-2 text-xs text-slate-300">{bull.rationale}</div>
            </div>
          </Card>
        </details>

        <details className="group">
          <summary className="list-none cursor-pointer">
            <Card className="rounded-xl border border-white/5 bg-slate-950/60 p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">Bear Case</div>
                <div className="text-xs text-slate-500">Click to expand</div>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
            </Card>
          </summary>
          <Card className="mt-3 rounded-xl border border-white/5 bg-slate-950/60 p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Revenue Growth</span>
                <span className="text-slate-200">{fmtPct(bear.revenueGrowth)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>EBITDA Margin</span>
                <span className="text-slate-200">{fmtPct(bear.margin)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Valuation Multiple</span>
                <span className="text-slate-200">{fmtMultiple(bear.valuationMultiple)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Implied CAGR</span>
                <span className="text-slate-200">{fmtPct(bear.impliedCAGR)}</span>
              </div>
              <div className="pt-2 text-xs text-slate-300">{bear.rationale}</div>
            </div>
          </Card>
        </details>
      </div>

      {/* Price Range */}
      <Card className="rounded-xl border border-white/5 bg-slate-950/60 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Price Range (Horizon End)</h3>
          <div className="text-xs text-slate-500">{result.horizonYears}Y</div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-white/5 bg-black/20 p-3">
            <div className="text-xs text-slate-400">Low</div>
            <div className="text-sm text-rose-200">{fmtPrice(result.priceRange.low)}</div>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/20 p-3">
            <div className="text-xs text-slate-400">Base</div>
            <div className="text-sm text-blue-200">{fmtPrice(result.priceRange.base)}</div>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/20 p-3">
            <div className="text-xs text-slate-400">High</div>
            <div className="text-sm text-emerald-200">{fmtPrice(result.priceRange.high)}</div>
          </div>
        </div>
      </Card>

      {/* Recommended Models */}
      {result.recommendedModels.length > 0 && (
        <Card className="rounded-xl border border-white/5 bg-slate-950/60 p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Recommended Models</h3>
          </div>
          <div className="space-y-3">
            {result.recommendedModels.map((model, idx) => (
              <div key={idx} className="rounded-lg border border-white/5 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30 text-xs mb-2">
                      {model.type}
                    </Badge>
                    <p className="text-sm text-slate-300">{model.reason}</p>
                  </div>
                  {onBuildModel && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onBuildModel(model.type)}
                      className="shrink-0"
                    >
                      Create {model.type}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Risks & What to Watch */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <h3 className="text-xs font-semibold text-amber-300">Risks</h3>
          </div>
          <ul className="space-y-2 text-xs text-amber-200/80">
            {result.keyRisks.map((risk, i) => (
              <li key={i}>• {risk}</li>
            ))}
          </ul>
        </Card>

        <Card className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-xs font-semibold text-blue-300">What to Watch</h3>
          </div>
          <ul className="space-y-2 text-xs text-blue-200/80">
            {result.whatToWatch.map((item, i) => (
              <li key={i}>• {item}</li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

