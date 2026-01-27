'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, AlertCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toSafeText } from '@/lib/utils/toSafeText';

type HealthCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

type HealthResponse = {
  status: 'green' | 'yellow' | 'red';
  checks: HealthCheck[];
  lastCheckedISO: string;
};

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health/demo', { cache: 'no-store' });
  if (!res.ok) {
    return {
      status: 'red',
      checks: [{ name: 'health_endpoint', ok: false, detail: `HTTP ${res.status}` }],
      lastCheckedISO: new Date().toISOString(),
    };
  }
  return res.json();
}

export function DemoHealth() {
  const [isOpen, setIsOpen] = useState(false);
  
  const { data, isLoading } = useQuery<HealthResponse>({
    queryKey: ['demo-health'],
    queryFn: fetchHealth,
    refetchInterval: 30000, // Check every 30 seconds
    staleTime: 10000,
  });

  if (!data) return null;

  const status = data.status;
  const statusColor =
    status === 'green'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      : status === 'yellow'
      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
      : 'bg-rose-500/10 text-rose-400 border-rose-500/30';

  const StatusIcon =
    status === 'green' ? CheckCircle2 : status === 'yellow' ? AlertCircle : XCircle;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
          statusColor
        )}
        title="Demo Health Status"
      >
        <StatusIcon className="h-3.5 w-3.5" />
        <span>Demo Health</span>
        {isOpen ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-white/10 bg-slate-950 p-4 shadow-xl z-50">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Demo Health Checks</h3>
            <span className={cn('text-xs', status === 'green' ? 'text-emerald-400' : status === 'yellow' ? 'text-amber-400' : 'text-rose-400')}>
              {status.toUpperCase()}
            </span>
          </div>
          <div className="space-y-2">
            {data.checks.map((check) => (
              <div key={check.name} className="flex items-start gap-2 text-xs">
                {check.ok ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
                ) : (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-rose-400" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white capitalize">{check.name.replace(/_/g, ' ')}</div>
                  <div className="text-slate-400">{toSafeText(check.detail)}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-white/10 pt-2 text-[10px] text-slate-500">
            Last checked: {new Date(data.lastCheckedISO).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
}

