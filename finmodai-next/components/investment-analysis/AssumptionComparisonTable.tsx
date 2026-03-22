'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { InvestmentEventAppliedAssumptionChange } from '@/lib/investment-analysis';

export type AssumptionComparisonTableProps = {
  title?: string;
  description?: string;
  changes: InvestmentEventAppliedAssumptionChange[];
  editable?: boolean;
};

function directionBadgeClass(change: InvestmentEventAppliedAssumptionChange): string {
  const field = change.field;
  const delta = Array.isArray(change.deltaValue) ? change.deltaValue : [change.deltaValue];
  const allPositive = delta.every((value) => value > 0);
  const allNegative = delta.every((value) => value < 0);

  // Keep the signal muted and finance-oriented. For WACC, "up" is not
  // visually framed as positive because it usually pressures value.
  if (field === 'wacc') {
    if (allPositive) return 'border-slate-300 bg-slate-100 text-slate-900';
    if (allNegative) return 'border-slate-300 bg-slate-50 text-slate-900';
    return 'border-slate-300 bg-slate-50 text-slate-900';
  }

  if (allPositive) return 'border-emerald-300/80 bg-emerald-50 text-emerald-900';
  if (allNegative) return 'border-amber-300/80 bg-amber-50 text-amber-900';
  return 'border-slate-300 bg-slate-50 text-slate-900';
}

function directionLabel(change: InvestmentEventAppliedAssumptionChange): string {
  const delta = Array.isArray(change.deltaValue) ? change.deltaValue : [change.deltaValue];
  const allPositive = delta.every((value) => value > 0);
  const allNegative = delta.every((value) => value < 0);

  if (allPositive) return 'Up';
  if (allNegative) return 'Down';
  return 'Mixed';
}

function RationaleDetail({ rationale }: { rationale: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-xs font-medium text-[var(--cb-text-muted)] underline decoration-dotted underline-offset-4 hover:text-[var(--cb-text-primary)]"
          >
            Why
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-5">
          {rationale}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function AssumptionComparisonTable({
  title = 'Assumption Comparison',
  description = 'Base versus adjusted assumptions after event-aware changes.',
  changes,
  editable = false,
}: AssumptionComparisonTableProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {editable ? <Badge variant="outline">Editable Next</Badge> : null}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Assumption</TableHead>
              <TableHead>Base</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>Adjusted</TableHead>
              <TableHead className="w-[120px]">Interpretation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {changes.map((change) => (
              <TableRow key={change.field}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--cb-text-primary)]">{change.label}</span>
                    <Badge variant="outline" className={cn('text-[10px]', directionBadgeClass(change))}>
                      {directionLabel(change)}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-[var(--cb-text-primary)]">{change.display.original}</TableCell>
                <TableCell className="font-medium text-[var(--cb-text-primary)]">{change.display.delta}</TableCell>
                <TableCell className="text-[var(--cb-text-primary)]">{change.display.updated}</TableCell>
                <TableCell>
                  <RationaleDetail rationale={change.rationale} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
