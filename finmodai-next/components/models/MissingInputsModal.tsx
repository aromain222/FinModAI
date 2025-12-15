"use client";

import { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MissingInputsModalProps {
  isOpen: boolean;
  onClose: () => void;
  missingInputs: string[];
  modelType: string;
}

export function MissingInputsModal({ isOpen, onClose, missingInputs, modelType }: MissingInputsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--cb-border-strong)] bg-[var(--cb-surface)] p-6 shadow-lg">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-[var(--cb-text-muted)] hover:bg-[var(--cb-surface-alt)] hover:text-[var(--cb-text-primary)]"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-start gap-3">
          <div className="rounded-full bg-[var(--cb-danger)]/10 p-2">
            <AlertCircle className="h-6 w-6 text-[var(--cb-danger)]" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-[var(--cb-text-primary)]">
              Required Inputs Missing
            </h2>
            <p className="mt-1 text-sm text-[var(--cb-text-secondary)]">
              The following required inputs must be completed before generating the {modelType.toUpperCase()} model:
            </p>
            <ul className="mt-4 space-y-2">
              {missingInputs.map((input, index) => (
                <li key={index} className="flex items-center gap-2 text-sm text-[var(--cb-text-primary)]">
                  <span className="text-[var(--cb-danger)]">•</span>
                  <span>{input}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex justify-end">
              <Button onClick={onClose} variant="default">
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
