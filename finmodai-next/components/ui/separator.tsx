'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Minimal separator component to match the rest of the UI kit.
 * Props mirror shadcn/ui Separator for drop-in compatibility.
 */
export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
  decorative?: boolean;
}

export function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  role,
  ...props
}: SeparatorProps) {
  return (
    <div
      role={decorative ? 'presentation' : role ?? 'separator'}
      aria-orientation={orientation}
      className={cn(
        'bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className
      )}
      {...props}
    />
  );
}
