'use client';

import { useEffect, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { addPosition } from '@/lib/portfolio/storage';
import type { ActivePosition } from '@/lib/portfolio/types';

interface AddPositionModalProps {
  open: boolean;
  onClose: () => void;
  prefillTicker?: string;
}

interface FormState {
  ticker: string;
  shares: string;
  costBasis: string;
  thesis: string;
  submitToAlpaca: boolean;
}

const DEFAULT_FORM: FormState = {
  ticker: '',
  shares: '',
  costBasis: '',
  thesis: '',
  submitToAlpaca: true,
};

export function AddPositionModal({ open, onClose, prefillTicker }: AddPositionModalProps) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  useEffect(() => {
    if (open && prefillTicker) {
      setForm(prev => ({ ...prev, ticker: prefillTicker.toUpperCase() }));
    }
  }, [open, prefillTicker]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleChange(field: keyof FormState, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const ticker = form.ticker.trim().toUpperCase();
    const shares = parseFloat(form.shares);
    const costBasis = parseFloat(form.costBasis);

    if (!ticker) { setError('Ticker is required.'); return; }
    if (!Number.isFinite(shares) || shares <= 0) { setError('Shares must be a positive number.'); return; }
    if (!Number.isFinite(costBasis) || costBasis <= 0) { setError('Cost basis must be a positive number.'); return; }

    setSubmitting(true);
    try {
      const position: ActivePosition = {
        id: crypto.randomUUID(),
        ticker,
        entryDate: new Date().toISOString().split('T')[0],
        entryPrice: costBasis,
        currentPrice: costBasis,
        shares,
        costBasis,
        entryScore: 5,
        currentScore: 5,
        entrySignal: 'yellow',
        currentSignal: 'yellow',
        status: 'building',
        thesisDrift: 'stable',
        thesisSummary: form.thesis.trim() || '',
        currentStance: '',
        nextCatalyst: '',
        keyRisks: '',
        watchItems: [],
        timeline: [],
        thesisSnapshots: [],
        addedAt: new Date().toISOString(),
      };

      addPosition(position);

      const alpacaPromise = form.submitToAlpaca
        ? fetch('/api/execution/position-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker, side: 'buy', shares }),
          })
        : Promise.resolve(null);

      const pmPromise = fetch('/api/pm/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          entryDate: position.entryDate,
          entryPrice: costBasis,
          shares,
          thesis: form.thesis.trim() || null,
        }),
      });

      await Promise.allSettled([alpacaPromise, pmPromise]);

      window.dispatchEvent(new Event('capitalbase:portfolio-updated'));
      setForm(DEFAULT_FORM);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--cb-border)] bg-[var(--cb-surface)] p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Add position"
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--cb-text-primary)]">Add position</h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded p-1 text-[var(--cb-text-muted)] hover:text-[var(--cb-text-primary)]"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Ticker */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--cb-text-secondary)]">
              Ticker <span className="text-[var(--cb-text-muted)]">(required)</span>
            </label>
            <input
              type="text"
              value={form.ticker}
              onChange={e => handleChange('ticker', e.target.value.toUpperCase())}
              placeholder="AAPL"
              maxLength={10}
              required
              className="w-full cursor-pointer rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-3 py-1.5 text-sm text-[var(--cb-text-primary)] placeholder:text-[var(--cb-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--cb-border)]"
            />
          </div>

          {/* Shares */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--cb-text-secondary)]">
              Shares <span className="text-[var(--cb-text-muted)]">(required)</span>
            </label>
            <input
              type="number"
              value={form.shares}
              onChange={e => handleChange('shares', e.target.value)}
              placeholder="100"
              min="0.0001"
              step="any"
              required
              className="w-full cursor-pointer rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-3 py-1.5 text-sm text-[var(--cb-text-primary)] placeholder:text-[var(--cb-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--cb-border)]"
            />
          </div>

          {/* Cost basis */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--cb-text-secondary)]">
              Cost basis per share <span className="text-[var(--cb-text-muted)]">(required)</span>
            </label>
            <input
              type="number"
              value={form.costBasis}
              onChange={e => handleChange('costBasis', e.target.value)}
              placeholder="150.00"
              min="0.0001"
              step="any"
              required
              className="w-full cursor-pointer rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-3 py-1.5 text-sm text-[var(--cb-text-primary)] placeholder:text-[var(--cb-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--cb-border)]"
            />
          </div>

          {/* Entry thesis */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--cb-text-secondary)]">
              Entry thesis <span className="text-[var(--cb-text-muted)]">(optional)</span>
            </label>
            <textarea
              value={form.thesis}
              onChange={e => handleChange('thesis', e.target.value)}
              placeholder="Why are you entering this position?"
              rows={3}
              className="w-full cursor-pointer resize-none rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-3 py-1.5 text-sm text-[var(--cb-text-primary)] placeholder:text-[var(--cb-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--cb-border)]"
            />
          </div>

          {/* Submit to Alpaca */}
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.submitToAlpaca}
              onChange={e => handleChange('submitToAlpaca', e.target.checked)}
              className="cursor-pointer accent-[var(--cb-text-primary)]"
            />
            <span className="text-xs text-[var(--cb-text-secondary)]">Submit to Alpaca paper?</span>
          </label>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-lg border border-[var(--cb-border)] px-3 py-1.5 text-xs text-[var(--cb-text-secondary)] hover:text-[var(--cb-text-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="cursor-pointer flex items-center gap-1.5 rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--cb-text-primary)] hover:bg-[var(--cb-surface)] disabled:opacity-50"
            >
              <Plus size={13} />
              {submitting ? 'Adding...' : 'Add position'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
