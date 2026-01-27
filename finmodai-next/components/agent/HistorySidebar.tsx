'use client';

import { useMemo } from 'react';
import { Trash2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

import { cn } from '@/lib/utils';
import type { OutputType } from '@/lib/ai/schemas';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

export type AgentArtifactHistoryItem = {
  id: string;
  created_at: string;
  type: OutputType;
  title: string;
  summary: string;
  prompt: string;
};

const safeText = (value: unknown) => (typeof value === 'string' ? value : value == null ? '' : String(value));

export function HistorySidebar(props: {
  items: AgentArtifactHistoryItem[];
  selectedId: string | null;
  isLoading?: boolean;
  isRefreshing?: boolean;
  onSelect: (id: string) => void;
  onRefresh?: () => void;
  onDelete?: (id: string) => void;
}) {
  const selectedId = props.selectedId;

  const rows = useMemo(
    () =>
      (Array.isArray(props.items) ? props.items : []).map((item) => {
        const created = new Date(item.created_at);
        const createdLabel = Number.isNaN(created.getTime()) ? '—' : format(created, 'MMM dd, HH:mm');
        return { ...item, createdLabel };
      }),
    [props.items]
  );

  return (
    <Card className="rounded-2xl border border-white/5 bg-slate-950/60 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">History</div>
          <div className="text-[11px] text-slate-500">{rows.length ? `${rows.length} saved artifacts` : 'No artifacts yet'}</div>
        </div>

        <div className="flex items-center gap-2">
          {props.onRefresh ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={props.onRefresh}
              disabled={Boolean(props.isRefreshing)}
              aria-label="Refresh history"
              className="h-9 w-9"
            >
              <RefreshCw className={cn('h-4 w-4', props.isRefreshing ? 'animate-spin' : '')} />
            </Button>
          ) : null}
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-260px)]">
        <div className="p-2">
          {props.isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="rounded-xl border border-white/5 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-4 w-32 bg-white/10" />
                    <Skeleton className="h-4 w-16 bg-white/10" />
                  </div>
                  <Skeleton className="mt-2 h-3 w-full bg-white/10" />
                  <Skeleton className="mt-1 h-3 w-3/4 bg-white/10" />
                </div>
              ))}
            </div>
          ) : rows.length ? (
            <div className="space-y-2">
              {rows.map((item) => {
                const active = selectedId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => props.onSelect(item.id)}
                    className={cn(
                      'group w-full rounded-xl border px-3 py-3 text-left transition-colors',
                      active ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-white/5 bg-black/20 hover:border-white/10'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className={cn('truncate text-sm font-semibold', active ? 'text-white' : 'text-slate-200')}>
                            {safeText(item.title) || 'Untitled'}
                          </div>
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs text-slate-400">{safeText(item.summary) || '—'}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          <Badge className="border border-white/10 bg-white/5 text-slate-200 text-[10px]">{item.type}</Badge>
                          <span>{item.createdLabel}</span>
                        </div>
                      </div>

                      {props.onDelete ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            props.onDelete?.(item.id);
                          }}
                          aria-label="Delete artifact"
                        >
                          <Trash2 className="h-4 w-4 text-slate-400 hover:text-rose-300" />
                        </Button>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-sm text-slate-400">Generate an artifact to see it here.</div>
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}
