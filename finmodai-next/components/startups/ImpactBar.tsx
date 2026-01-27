'use client';

import { cn } from '@/lib/utils';
import type { SignalImpact } from '@/types/startups';

interface ImpactBarProps {
  signal: SignalImpact;
  maxImpact: number; // for scaling the bar
  className?: string;
}

export function ImpactBar({ signal, maxImpact, className }: ImpactBarProps) {
  const isPositive = signal.contribution > 0;
  const absContribution = Math.abs(signal.contribution);
  const barWidth = maxImpact > 0 ? (absContribution / maxImpact) * 100 : 0;

  const getSignalLabel = (type: string): string => {
    const labels: Record<string, string> = {
      mentions: 'News Mentions',
      funding: 'Funding',
      hiring: 'Hiring',
      layoffs: 'Layoffs',
      regulation: 'Regulation',
      lawsuit: 'Legal Issues',
      partnership: 'Partnerships',
      product: 'Product Launch',
      press: 'Press Coverage',
    };
    return labels[type] || type;
  };

  const getConfidenceBadge = (confidence: string) => {
    const colors = {
      high: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      medium: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      low: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    };
    return colors[confidence as keyof typeof colors] || colors.medium;
  };

  return (
    <div className={cn('space-y-1.5', className)}>
      {/* Label Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-medium text-slate-200 truncate">
            {getSignalLabel(signal.type)}
          </span>
          <span
            className={cn(
              'text-xs px-1.5 py-0.5 rounded border font-medium',
              getConfidenceBadge(signal.confidence)
            )}
          >
            {signal.confidence}
          </span>
        </div>
        <span
          className={cn(
            'text-sm font-bold tabular-nums',
            isPositive ? 'text-emerald-400' : 'text-rose-400'
          )}
        >
          {isPositive ? '+' : ''}
          {signal.contribution.toFixed(1)}
        </span>
      </div>

      {/* Bar */}
      <div className="relative h-2 bg-slate-900/60 rounded-full overflow-hidden">
        <div
          className={cn(
            'absolute left-0 top-0 h-full rounded-full transition-all duration-500',
            isPositive
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
              : 'bg-gradient-to-r from-rose-500 to-rose-400'
          )}
          style={{ width: `${Math.min(barWidth, 100)}%` }}
        />
      </div>

      {/* Description */}
      <p className="text-xs text-slate-400 leading-relaxed">{signal.description}</p>
      {signal.detail && (
        <p className="text-xs text-slate-500 italic">{signal.detail}</p>
      )}
    </div>
  );
}

