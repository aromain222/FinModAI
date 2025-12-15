'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'flex h-11 w-full rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-input-bg)] px-4 py-2 text-sm text-[var(--cb-input-text)] shadow-sm ring-offset-transparent transition placeholder:text-[var(--cb-input-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cb-green)]',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };
