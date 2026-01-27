/***********************  GENERATED FILE  ************************/
'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--cb-bg)] disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default:
          'bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700',
        secondary:
          'border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] text-[var(--cb-text-secondary)] hover:border-emerald-400/30 hover:text-[var(--cb-text-primary)]',
        ghost:
          'bg-transparent text-[var(--cb-text-muted)] hover:bg-white/5 hover:text-[var(--cb-text-primary)]',
        outline:
          'border border-[var(--cb-border)] bg-transparent text-[var(--cb-text-secondary)] hover:bg-[var(--cb-surface-subtle)]',
        destructive: 'bg-rose-600 text-white hover:bg-rose-500',
        link: 'text-emerald-400 underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-lg px-8',
        icon: 'h-10 w-10'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
