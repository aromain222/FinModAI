/**
 * Enhanced Toast Component
 * 
 * Supports multiple toasts with animations.
 */

"use client";

import { useEffect } from 'react';
import { X } from 'lucide-react';

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

interface ToastEnhancedProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

export function ToastEnhanced({ toasts, onRemove }: ToastEnhancedProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="animate-in slide-in-from-bottom-5 fade-in duration-300 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm"
          style={{
            backgroundColor: toast.variant === 'destructive' 
              ? 'rgba(239, 68, 68, 0.1)' 
              : 'rgba(0, 227, 135, 0.1)',
            borderColor: toast.variant === 'destructive'
              ? 'rgba(239, 68, 68, 0.2)'
              : 'rgba(0, 227, 135, 0.2)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className={`font-semibold ${
                toast.variant === 'destructive' ? 'text-red-500' : 'text-[var(--cb-green)]'
              }`}>
                {toast.title}
              </p>
              {toast.description && (
                <p className="text-sm opacity-90 text-[var(--cb-text-primary)] mt-1">
                  {toast.description}
                </p>
              )}
            </div>
            <button
              onClick={() => onRemove(toast.id)}
              className="text-[var(--cb-text-muted)] hover:text-[var(--cb-text-primary)] transition"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
