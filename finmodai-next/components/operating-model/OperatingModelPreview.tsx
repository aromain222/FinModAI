'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { OperatingModelPreview } from '@/lib/view_models/operatingModelPreview';

type OperatingModelPreviewProps = {
  preview: OperatingModelPreview;
  ticker: string;
};

/**
 * Cash runway gauge component
 */
function CashRunwayGauge({ months }: { months: number }) {
  // Bucket into ranges for display
  const getBucket = (m: number): { label: string; color: string; percent: number } => {
    if (m < 6) return { label: '<6 months', color: 'bg-rose-500', percent: Math.min(100, (m / 6) * 100) };
    if (m < 12) return { label: '6-12 months', color: 'bg-amber-500', percent: Math.min(100, ((m - 6) / 6) * 100) };
    if (m < 18) return { label: '12-18 months', color: 'bg-yellow-500', percent: Math.min(100, ((m - 12) / 6) * 100) };
    if (m < 24) return { label: '18-24 months', color: 'bg-emerald-500', percent: Math.min(100, ((m - 18) / 6) * 100) };
    return { label: '24+ months', color: 'bg-emerald-600', percent: 100 };
  };

  const bucket = getBucket(months);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Cash Runway</span>
        <span className="text-sm font-semibold text-white">{bucket.label}</span>
      </div>
      <div className="relative h-3 w-full rounded-full bg-slate-800 overflow-hidden">
        <div
          className={cn('h-full transition-all duration-500', bucket.color)}
          style={{ width: `${bucket.percent}%` }}
        />
      </div>
      <div className="text-xs text-slate-400">
        Estimated: {months} months
      </div>
    </div>
  );
}

export function OperatingModelPreview({ preview, ticker }: OperatingModelPreviewProps) {
  const confidenceColors: Record<OperatingModelPreview['confidence'], string> = {
    Low: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    Medium: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
    High: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  };

  return (
    <Card className="rounded-2xl border border-white/5 bg-slate-950/70 backdrop-blur-sm p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-lg font-semibold text-white">Operating Model Preview</h3>
          <Badge className={cn('text-xs px-2 py-0.5', confidenceColors[preview.confidence])}>
            {preview.confidence} Confidence
          </Badge>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">{preview.headline}</p>
      </div>

      {/* Cash Runway Gauge */}
      <div className="mb-6 p-4 rounded-lg border border-white/5 bg-slate-900/40">
        <CashRunwayGauge months={preview.runway.cashMonths} />
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="text-xs text-slate-400">
            <span className="font-semibold">Burn Rate:</span> {preview.runway.burnRate}
          </div>
        </div>
      </div>

      {/* Operating Trends */}
      <div className="mb-6 p-4 rounded-lg border border-white/5 bg-slate-900/40">
        <div className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">Operating Trends</div>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-slate-500 text-xs mt-0.5">•</span>
            <div className="flex-1">
              <span className="text-xs font-semibold text-slate-300">Revenue:</span>
              <span className="text-xs text-slate-400 ml-2">{preview.operatingTrend.revenue}</span>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-slate-500 text-xs mt-0.5">•</span>
            <div className="flex-1">
              <span className="text-xs font-semibold text-slate-300">Margin:</span>
              <span className="text-xs text-slate-400 ml-2">{preview.operatingTrend.margin}</span>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-slate-500 text-xs mt-0.5">•</span>
            <div className="flex-1">
              <span className="text-xs font-semibold text-slate-300">OpEx:</span>
              <span className="text-xs text-slate-400 ml-2">{preview.operatingTrend.opex}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Key Drivers */}
      <div className="mb-6">
        <div className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">Key Operating Drivers</div>
        <ul className="space-y-2">
          {preview.keyDrivers.map((driver, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
              <span className="text-emerald-400 mt-0.5">•</span>
              <span>{driver}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Sensitivities */}
      <div className="mb-6">
        <div className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">Sensitivities</div>
        <div className="flex flex-wrap gap-2">
          {preview.sensitivities.map((sensitivity, i) => (
            <Badge
              key={i}
              className="bg-slate-800/50 text-slate-300 border-slate-700/50 text-xs px-3 py-1.5 cursor-default"
            >
              <span className="font-semibold">{sensitivity.variable}</span>
              <span className="mx-1.5 text-slate-400">→</span>
              <span>{sensitivity.impact}</span>
            </Badge>
          ))}
        </div>
      </div>

      {/* Management Questions */}
      <div className="pt-4 border-t border-white/5">
        <div className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">Management Questions</div>
        <ul className="space-y-2">
          {preview.managementQuestions.map((question, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
              <span className="text-blue-400 mt-0.5">?</span>
              <span>{question}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

