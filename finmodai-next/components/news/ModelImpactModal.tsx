'use client';

import { Dialog, DialogContent } from '@/components/ui/dialog';

type ScenarioCase = { probability: number; impact: number };

type ModelImpactData = {
  event?: string;
  analysis?: {
    signal?: { position?: string; conviction?: number; size_pct?: number; primary_driver?: string };
    model_impact?: { growth_delta?: number; margin_delta?: number; discount_rate_delta?: number; primary_driver?: string };
    scenarios?: { bull?: ScenarioCase; base?: ScenarioCase; bear?: ScenarioCase };
    confidence?: number;
  } | null;
  dcf?: {
    base_valuation: number;
    new_valuation: number;
    valuation_change: number;
    direction: 'bullish' | 'bearish' | 'neutral';
  };
};

type Props = {
  open: boolean;
  onClose: (open: boolean) => void;
  data: ModelImpactData | null;
  loading?: boolean;
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

function Delta({ label, value }: { label: string; value?: number }) {
  const formatted = value != null ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%` : '—';
  const color = value == null ? 'text-zinc-400' : value > 0 ? 'text-emerald-400' : value < 0 ? 'text-rose-400' : 'text-zinc-400';
  return (
    <div className="rounded border border-zinc-800 p-3">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</p>
      <p className={`mt-1 text-base font-semibold ${color}`}>{formatted}</p>
    </div>
  );
}

function ScenarioBar({ label, value }: { label: string; value?: number }) {
  const pct = value != null ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%` : '—';
  const color = value == null ? 'text-zinc-400' : value > 0 ? 'text-emerald-400' : value < 0 ? 'text-rose-400' : 'text-zinc-400';
  return (
    <div className="rounded border border-zinc-800 p-3">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</p>
      <p className={`mt-1 text-base font-semibold ${color}`}>{pct}</p>
    </div>
  );
}

export function ModelImpactModal({ open, onClose, data, loading }: Props) {
  const signal = data?.analysis?.signal;
  const impact = data?.analysis?.model_impact;
  const scenarios = data?.analysis?.scenarios;
  const dcf = data?.dcf;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl border border-zinc-800 bg-zinc-950 text-white">
        {loading && (
          <div className="flex items-center justify-center py-16 text-sm text-zinc-400">
            Running model analysis…
          </div>
        )}

        {!loading && !data && (
          <div className="py-8 text-center text-sm text-zinc-500">No data returned.</div>
        )}

        {!loading && data && (
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

              {dcf && (
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500">DCF Valuation Δ</p>
                  <p className={`text-2xl font-bold ${directionColor(dcf.direction)}`}>
                    {dcf.valuation_change >= 0 ? '+' : ''}{(dcf.valuation_change * 100).toFixed(1)}%
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {Math.round(dcf.base_valuation)} → {Math.round(dcf.new_valuation)}
                  </p>
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
            </div>

            {/* Scenarios */}
            {scenarios && (
              <div>
                <p className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">Scenarios</p>
                <div className="grid grid-cols-3 gap-3">
                  <ScenarioBar label="Bull" value={scenarios.bull?.impact} />
                  <ScenarioBar label="Base" value={scenarios.base?.impact} />
                  <ScenarioBar label="Bear" value={scenarios.bear?.impact} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-3">
                  {(['bull', 'base', 'bear'] as const).map((key) => (
                    <p key={key} className="text-center text-[10px] text-zinc-500">
                      {scenarios[key]?.probability != null
                        ? `${Math.round(scenarios[key]!.probability * 100)}% prob`
                        : ''}
                    </p>
                  ))}
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
              {data.analysis?.confidence != null && (
                <div>
                  <span className="text-zinc-500">AI Confidence </span>
                  <span className="font-semibold text-zinc-200">
                    {Math.round(data.analysis.confidence * 100)}%
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
