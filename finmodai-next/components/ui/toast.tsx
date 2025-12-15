/**
 * Simple Toast Component
 * 
 * Minimal toast implementation for settings page.
 */

"use client";

import { useEffect } from 'react';

interface ToastProps {
  toast: { title: string; description?: string; variant?: 'default' | 'destructive' } | null;
}

export function Toast({ toast }: ToastProps) {
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        // Toast will be cleared by parent
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5">
      <div
        className={`rounded-lg border px-4 py-3 shadow-lg ${
          toast.variant === 'destructive'
            ? 'border-red-500/20 bg-red-500/10 text-red-500'
            : 'border-[var(--cb-green)]/20 bg-[var(--cb-green)]/10 text-[var(--cb-green)]'
        }`}
      >
        <p className="font-semibold">{toast.title}</p>
        {toast.description && <p className="text-sm opacity-90">{toast.description}</p>}
      </div>
    </div>
  );
}
