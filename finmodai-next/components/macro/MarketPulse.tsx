'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MarketPulse as MarketPulsePayload } from '@/lib/schemas/market';

type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  meta?: { asOf: string; providerUsed: string; stale: boolean; traceId: string };
  error?: { code: string; message: string };
};

export function MarketPulse() {
  const [data, setData] = useState<ApiResponse<MarketPulsePayload> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMarketData();
  }, []);

  const fetchMarketData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/market/pulse');
      
      const pulseData = (await response.json()) as ApiResponse<MarketPulsePayload>;
      if (!pulseData.ok) {
        throw new Error(pulseData.error?.message || 'Failed to fetch market data');
      }
      setData(pulseData);
      
      setLoading(false);
    } catch (err) {
      console.error('[MarketPulse] Error fetching market data:', err);
      setError('Failed to load market data');
      setLoading(false);
    }
  };

  const formatValue = (value: number | undefined, suffix = ''): string => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    return `${value.toFixed(2)}${suffix}`;
  };

  const getMinutesAgo = () => {
    if (!data?.meta?.asOf) return '';
    const now = new Date();
    const updated = new Date(data.meta.asOf);
    const diffMs = now.getTime() - updated.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins === 1) return '1 min ago';
    return `${diffMins} min ago`;
  };

  return (
    <Card className="card-premium">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-500" />
            <CardTitle className="text-heading-3">Market Pulse</CardTitle>
          </div>
          <button
            onClick={fetchMarketData}
            disabled={loading}
            className="text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
            aria-label="Refresh market data"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p className="text-sm text-rose-400 mb-3">{error}</p>
        )}
        
        {data?.data && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-800/40 bg-slate-900/30 p-3">
              <div className="text-xs text-slate-400">Advancers</div>
              <div className="text-sm font-semibold text-emerald-200">
                {loading ? '...' : data.data.breadth.advancers}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800/40 bg-slate-900/30 p-3">
              <div className="text-xs text-slate-400">Decliners</div>
              <div className="text-sm font-semibold text-rose-200">
                {loading ? '...' : data.data.breadth.decliners}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800/40 bg-slate-900/30 p-3">
              <div className="text-xs text-slate-400">VIX</div>
              <div className="text-sm font-semibold text-slate-100">
                {loading ? '...' : formatValue(data.data.vol.vix)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800/40 bg-slate-900/30 p-3">
              <div className="text-xs text-slate-400">Rates (2Y / 10Y)</div>
              <div className="text-sm font-semibold text-slate-100">
                {loading
                  ? '...'
                  : `${formatValue(data.data.rates?.twoY, '%')} / ${formatValue(data.data.rates?.tenY, '%')}`}
              </div>
            </div>
          </div>
        )}
        
        {data && !loading && (
          <div className="pt-2 border-t border-slate-800/50 flex items-center justify-between">
            {data?.meta && (
              <Badge variant="outline" className="border-emerald-700/50 text-emerald-400 bg-emerald-950/20 text-xs">
                Source: {data.meta.providerUsed}
                {data.meta.stale ? ' (stale)' : ''}
              </Badge>
            )}
            <span className="text-xs text-slate-500">
              Updated {getMinutesAgo()}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
