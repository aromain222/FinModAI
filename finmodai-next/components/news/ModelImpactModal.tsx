'use client';

import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type ScenarioCase = {
  probability: number;
  expected_direction?: 'up' | 'neutral' | 'down';
  magnitude?: number;
  impact?: number;
};

type ModelImpactData = {
  impact_summary?: {
    direction?: 'bullish' | 'bearish' | 'neutral';
    primary_driver?: string;
    valuation_change?: number;
    base_valuation?: number;
    new_valuation?: number;
  };
  model_changes?: {
    growth_delta?: number;
    margin_delta?: number;
    discount_rate_delta?: number;
  };
  scenarios?: { bull?: ScenarioCase; base?: ScenarioCase; bear?: ScenarioCase } | null;
  signal?: { position?: string; conviction?: number; size_pct?: number; primary_driver?: string } | null;
  confidence?: number | null;
};

type Props = {
  open: boolean;
  onClose: (open: boolean) => void;
  data: ModelImpactData | null;
  loading?: boolean;
  error?: string | null;
};

function positionColor(position?: string): string {
  if (position === 'LONG') return 'text-emerald-400';
  if (position === 'SHORT') return 'text-rose-400';
  return 'text-zinc-300';
}

function directionColor(direction?: string): string {
  if (direction === 'bullish') return 'text-emerald-400';
  if (direction === 'bearish') return 'text-rose-400';
  return 'text-zinc-400';
}

function formatPct(value?: number, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`;
}

function Delta({ label, value }: { label: string; value?: number }) {
  const formatted = formatPct(value, 2);
  const color = value == null ? 'text-zinc-400' : value > 0 ? 'text-emerald-400' : value < 0 ? 'text-rose-400' : 'text-zinc-400';
  return (
    <div className="rounded border border-zinc-800 p-3">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</p>
      <p className={`mt-1 text-base font-semibold ${color}`}>{formatted}</p>
    </div>
  );
}

function ScenarioBar({ label, scenario }: { label: string; scenario?: ScenarioCase }) {
  const value = scenario?.magnitude ?? scenario?.impact;
  const color = value == null ? 'text-zinc-400' : value > 0 ? 'text-emerald-400' : value < 0 ? 'text-rose-400' : 'text-zinc-400';
  return (
    <div className="rounded border border-zinc-800 p-3">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</p>
      <p className={`mt-1 text-base font-semibold ${color}`}>{formatPct(value)}</p>
      <p className="mt-0.5 text-[10px] capitalize text-zinc-500">
        {scenario?.expected_direction ?? 'neutral'} · {scenario?.probability != null ? `${Math.round(scenario.probability * 100)}% prob` : '-'}
      </p>
    </div>
  );
}

export function ModelImpactModal({ open, onClose, data, loading, error }: Props) {
  const signal = data?.signal;
  const impact = data?.model_changes;
  const scenarios = data?.scenarios;
  const summary = data?.impact_summary;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl border border-zinc-800 bg-zinc-950 text-white">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Model Impact</DialogTitle>
          <DialogDescription className="text-zinc-500">
            Event-driven DCF sensitivity and signal output.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-16 text-sm text-zinc-400">
            Running model analysis…
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Unable to analyze this event.</div>
              <div className="mt-1 text-rose-200/80">{error}</div>
            </div>
          </div>
        )}

        {!loading && !error && !data && (
          <div className="py-8 text-center text-sm text-zinc-500">No model impact data returned.</div>
        )}

        {!loading && !error && data && (
          <div className="space-y-6">
            {/* Header: signal + DCF result */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">Signal</p>
                <p className={`text-2xl font-bold ${positionColor(signal?.position)}`}>
                  {signal?.position ?? '—'}
                </p>
                {signal?.primary_driver && (
                  <p className="mt-0.5 text-xs text-zinc-400">Driver: {signal.primary_driver}</p>
                )}
              </div>

              {summary && (
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500">DCF Valuation Δ</p>
                  <p className={`text-2xl font-bold ${directionColor(summary.direction)}`}>
                    {formatPct(summary.valuation_change)}
                  </p>
                  {summary.base_valuation != null && summary.new_valuation != null && (
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {Math.round(summary.base_valuation)} → {Math.round(summary.new_valuation)}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Model deltas */}
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">Model Changes</p>
              <div className="grid grid-cols-3 gap-3">
                <Delta label="Growth" value={impact?.growth_delta} />
                <Delta label="Margin" value={impact?.margin_delta} />
                <Delta label="Discount Rate" value={impact?.discount_rate_delta} />
              </div>
              {summary?.primary_driver && (
                <p className="mt-1 text-[10px] text-zinc-500">Primary driver: {summary.primary_driver}</p>
              )}
            </div>

            {/* Scenarios */}
            {scenarios && (
              <div>
                <p className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">Scenarios</p>
                <div className="grid grid-cols-3 gap-3">
                  <ScenarioBar label="Bull" scenario={scenarios.bull} />
                  <ScenarioBar label="Base" scenario={scenarios.base} />
                  <ScenarioBar label="Bear" scenario={scenarios.bear} />
                </div>
              </div>
            )}

            {/* Conviction + size */}
            <div className="border-t border-zinc-800 pt-4 flex gap-6 text-sm">
              <div>
                <span className="text-zinc-500">Conviction </span>
                <span className="font-semibold text-zinc-200">
                  {signal?.conviction != null ? `${Math.round(signal.conviction * 100)}%` : '—'}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Size </span>
                <span className="font-semibold text-zinc-200">
                  {signal?.size_pct != null ? `${signal.size_pct}%` : '—'}
                </span>
              </div>
              {data.confidence != null && (
                <div>
                  <span className="text-zinc-500">AI Confidence </span>
                  <span className="font-semibold text-zinc-200">
                    {Math.round(data.confidence * 100)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
