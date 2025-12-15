"use client";

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  showBack?: boolean;
  rightActions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  backHref,
  showBack = true,
  rightActions,
  className,
}: PageHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  return (
    <header className={cn('space-y-4', className)}>
      {showBack && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="text-[var(--cb-text-secondary)] hover:text-[var(--cb-text-primary)]"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-[var(--cb-text-primary)] sm:text-3xl">{title}</h1>
          {subtitle && <p className="text-sm text-[var(--cb-text-secondary)] sm:text-base">{subtitle}</p>}
        </div>
        {rightActions && <div className="flex items-center gap-2">{rightActions}</div>}
      </div>
    </header>
  );
}
