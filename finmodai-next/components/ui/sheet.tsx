/**
 * Sheet Component (Side Panel)
 * 
 * A slide-out panel component for displaying content from the side
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  side?: 'left' | 'right' | 'top' | 'bottom';
  className?: string;
}

export function Sheet({ open, onOpenChange, side = 'right', children, className }: SheetProps) {
  if (!open) return null;

  const sideClasses = {
    left: 'left-0 top-0 h-full',
    right: 'right-0 top-0 h-full',
    top: 'top-0 left-0 w-full',
    bottom: 'bottom-0 left-0 w-full',
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/50 transition-opacity"
        onClick={() => onOpenChange(false)}
      />
      
      {/* Sheet Panel */}
      <div
        className={cn(
          'fixed z-50 w-full max-w-lg bg-slate-950 border-l border-white/5 shadow-2xl transition-transform duration-300 ease-out flex flex-col',
          sideClasses[side],
          side === 'right' && 'translate-x-0',
          side === 'left' && 'translate-x-0',
          side === 'top' && 'translate-y-0',
          side === 'bottom' && 'translate-y-0',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>
  );
}

export interface SheetHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  onClose?: () => void;
}

export function SheetHeader({ children, onClose, className, ...props }: SheetHeaderProps) {
  return (
    <div
      className={cn('flex items-start justify-between p-6 border-b border-white/5', className)}
      {...props}
    >
      <div className="flex-1">{children}</div>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-4 p-2 hover:bg-slate-800 rounded-lg transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-slate-400" />
        </button>
      )}
    </div>
  );
}

export interface SheetTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

export function SheetTitle({ children, className, ...props }: SheetTitleProps) {
  return (
    <h2 className={cn('text-xl font-semibold text-white', className)} {...props}>
      {children}
    </h2>
  );
}

export interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export function SheetContent({ children, className, ...props }: SheetContentProps) {
  return (
    <div
      className={cn('flex-1 overflow-y-auto p-6', className)}
      {...props}
    >
      {children}
    </div>
  );
}

