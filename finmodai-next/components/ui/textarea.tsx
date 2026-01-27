'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[110px] w-full rounded-2xl border border-[var(--cb-border)] bg-[var(--cb-input-bg)] px-4 py-3 text-sm text-[var(--cb-input-text)] shadow-sm placeholder:text-[var(--cb-input-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cb-green)] disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
