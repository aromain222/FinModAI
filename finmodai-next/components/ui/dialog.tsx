'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

interface DialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

interface DialogTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
}

interface DialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          onOpenChange(false);
        }}
        className="absolute inset-0"
      />
      {children}
    </div>
  );
}

export function DialogContent({ children, className, ...props }: DialogContentProps) {
  return (
    <div
      className={cn(
        'relative z-50 w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-lg',
        className
      )}
      onClick={(e) => e.stopPropagation()}
      {...props}
    >
      {children}
    </div>
  );
}

export function DialogHeader({ children, className, ...props }: DialogHeaderProps) {
  return (
    <div className={cn('mb-4', className)} {...props}>
      {children}
    </div>
  );
}

export function DialogTitle({ children, className, ...props }: DialogTitleProps) {
  return (
    <h2 className={cn('text-lg font-semibold text-white', className)} {...props}>
      {children}
    </h2>
  );
}

export function DialogFooter({ children, className, ...props }: DialogFooterProps) {
  return (
    <div className={cn('mt-6 flex justify-end gap-2', className)} {...props}>
      {children}
    </div>
  );
}

export function DialogTrigger({ children, asChild, ...props }: { children: React.ReactNode; asChild?: boolean; [key: string]: any }) {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, props);
  }
  return <div {...props}>{children}</div>;
}
