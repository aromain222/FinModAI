'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type DiagnosticEntry = {
  name: string;
  ok: boolean;
  elapsedMs: number;
  timedOut: boolean;
  error?: string;
};

type DiagnosticsPanelProps = {
  diagnostics: DiagnosticEntry[];
};

export function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps) {
  // Only show in development
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  const totalTime = diagnostics.reduce((sum, d) => sum + d.elapsedMs, 0);
  const successCount = diagnostics.filter((d) => d.ok).length;
  const failureCount = diagnostics.length - successCount;
  const timeoutCount = diagnostics.filter((d) => d.timedOut).length;

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="diagnostics" className="border-white/5">
        <AccordionTrigger className="text-xs text-slate-400 hover:text-slate-300 py-2">
          Diagnostics ({successCount}/{diagnostics.length} succeeded, {totalTime}ms total)
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-2 text-xs">
            {diagnostics.map((diag, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center justify-between p-2 rounded border',
                  diag.ok
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-rose-500/10 border-rose-500/30'
                )}
              >
                <div className="flex items-center gap-2">
                  <Badge
                    className={cn(
                      'text-xs px-1.5 py-0',
                      diag.ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                    )}
                  >
                    {diag.ok ? '✓' : '✗'}
                  </Badge>
                  <span className="font-mono text-slate-300">{diag.name}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-400">
                  {diag.timedOut && (
                    <Badge className="bg-amber-500/20 text-amber-300 text-xs px-1.5 py-0">TIMEOUT</Badge>
                  )}
                  <span>{diag.elapsedMs}ms</span>
                  {diag.error && (
                    <span className="text-rose-400 max-w-xs truncate" title={diag.error}>
                      {diag.error}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {timeoutCount > 0 && (
              <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-amber-300 text-xs">
                ⚠️ {timeoutCount} request(s) timed out. Consider increasing timeout or optimizing providers.
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

