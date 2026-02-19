'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getEmptyError, type EmptyErrorConfig } from '@/lib/loadingCopy';

export interface EmptyStateProps {
  title: string;
  hint: string;
  className?: string;
}

export function EmptyState({ title, hint, className }: EmptyStateProps) {
  return (
    <Card className={cn('p-6 text-center', className)}>
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
    </Card>
  );
}

export interface ErrorStateProps {
  title: string;
  onRetry: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({ title, onRetry, retryLabel = 'Retry', className }: ErrorStateProps) {
  return (
    <Card className={cn('p-6 text-center border-destructive/30', className)}>
      <div className="flex flex-col items-center gap-3">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="font-medium text-destructive">{title}</p>
        <Button onClick={onRetry} variant="outline" size="sm">
          {retryLabel}
        </Button>
      </div>
    </Card>
  );
}

export function getEmptyErrorConfig(key: 'marketBrief' | 'marketNews' | 'companyModel' | 'excelExport' | 'macroDashboard' | 'default'): EmptyErrorConfig {
  return getEmptyError(key);
}
