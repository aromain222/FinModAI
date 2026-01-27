'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CompanyPickerProps {
  onSelect: (ticker: string) => void;
  initialValue?: string;
  error?: string | null;
}

const QUICK_PICKS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'SPY'];

const COMPANY_NAMES: Record<string, string> = {
  AAPL: 'Apple Inc.',
  MSFT: 'Microsoft Corporation',
  NVDA: 'NVIDIA Corporation',
  AMZN: 'Amazon.com Inc.',
  GOOGL: 'Alphabet Inc.',
  SPY: 'S&P 500 ETF',
  TSLA: 'Tesla Inc.',
  META: 'Meta Platforms Inc.',
  NFLX: 'Netflix Inc.',
  DIS: 'The Walt Disney Company',
};

export function CompanyPicker({ onSelect, initialValue = '', error }: CompanyPickerProps) {
  const [query, setQuery] = useState(initialValue);
  const [matches, setMatches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Autofocus on mount
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const upperQuery = query.toUpperCase().trim();
    if (upperQuery.length === 0) {
      setMatches([]);
      return;
    }

    // Simple matching: check if ticker starts with query or company name includes query
    const allTickers = Object.keys(COMPANY_NAMES);
    const filtered = allTickers.filter((ticker) => {
      const name = COMPANY_NAMES[ticker];
      return ticker.startsWith(upperQuery) || name.toUpperCase().includes(upperQuery);
    });

    setMatches(filtered.slice(0, 10));
  }, [query]);

  const handleSelect = (ticker: string) => {
    onSelect(ticker.toUpperCase());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const upperQuery = query.toUpperCase().trim();
      if (matches.length > 0) {
        handleSelect(matches[0]);
      } else if (upperQuery.length > 0) {
        // Allow direct entry even if not in known list
        handleSelect(upperQuery);
      }
    } else if (e.key === 'Escape') {
      setQuery('');
      inputRef.current?.blur();
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="rounded-2xl border border-[var(--cb-border,rgba(255,255,255,0.08))] bg-[var(--cb-surface,rgba(255,255,255,0.02))] p-8 shadow-xl">
        {/* Icon + Title */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--cb-accent,rgba(56,189,248,0.1))] text-[var(--cb-accent-text,rgb(56,189,248))]">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-[var(--cb-text-primary,#e5e7eb)]">
              Select a company
            </h2>
            <p className="mt-1 text-sm text-[var(--cb-text-muted,#9ca3af)]">
              Choose a ticker to run downside/base/upside scenarios across revenue, margins, multiples, and leverage.
            </p>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Search input */}
        <div className="mb-6">
          <label htmlFor="company-search" className="mb-2 block text-sm font-medium text-[var(--cb-text-muted,#9ca3af)]">
            Search ticker
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--cb-text-muted,#9ca3af)]" />
            <input
              ref={inputRef}
              id="company-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder="Search ticker (e.g., AAPL)…"
              className={cn(
                "w-full rounded-lg border border-[var(--cb-border,rgba(255,255,255,0.12))] bg-[var(--cb-input-bg,rgba(0,0,0,0.3))] py-3 pl-11 pr-4 text-[var(--cb-text-primary,#e5e7eb)] placeholder-[var(--cb-text-muted,#6b7280)] outline-none ring-2 ring-transparent transition-all",
                "focus:border-[var(--cb-accent,rgb(56,189,248))] focus:ring-[var(--cb-accent,rgb(56,189,248))]/20"
              )}
              autoComplete="off"
            />
          </div>

          {/* Search results dropdown */}
          {matches.length > 0 && query.length > 0 && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-[var(--cb-border,rgba(255,255,255,0.08))] bg-[var(--cb-surface,rgba(0,0,0,0.5))] shadow-lg">
              {matches.map((ticker) => (
                <button
                  key={ticker}
                  onClick={() => handleSelect(ticker)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--cb-hover,rgba(255,255,255,0.05))]"
                >
                  <div>
                    <div className="font-semibold text-[var(--cb-text-primary,#e5e7eb)]">
                      {ticker}
                    </div>
                    <div className="text-sm text-[var(--cb-text-muted,#9ca3af)]">
                      {COMPANY_NAMES[ticker] || 'Unknown Company'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick picks */}
        <div>
          <label className="mb-3 block text-sm font-medium text-[var(--cb-text-muted,#9ca3af)]">
            Quick picks
          </label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {QUICK_PICKS.map((ticker) => (
              <button
                key={ticker}
                onClick={() => handleSelect(ticker)}
                className={cn(
                  "group relative overflow-hidden rounded-lg border border-[var(--cb-border,rgba(255,255,255,0.12))] bg-[var(--cb-card-bg,rgba(255,255,255,0.03))] px-4 py-3 text-left transition-all",
                  "hover:border-[var(--cb-accent,rgb(56,189,248))] hover:bg-[var(--cb-hover,rgba(56,189,248,0.1))]",
                  "focus:outline-none focus:ring-2 focus:ring-[var(--cb-accent,rgb(56,189,248))]/40"
                )}
              >
                <div className="relative z-10">
                  <div className="font-semibold text-[var(--cb-text-primary,#e5e7eb)] group-hover:text-[var(--cb-accent-text,rgb(56,189,248))]">
                    {ticker}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--cb-text-muted,#9ca3af)]">
                    {COMPANY_NAMES[ticker]?.split(' ')[0] || ticker}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Help text */}
        <div className="mt-6 text-center text-xs text-[var(--cb-text-muted,#6b7280)]">
          Press <kbd className="rounded border border-[var(--cb-border,rgba(255,255,255,0.12))] bg-[var(--cb-input-bg,rgba(0,0,0,0.3))] px-1.5 py-0.5 font-mono">Enter</kbd> to select top match
          {' · '}
          <kbd className="rounded border border-[var(--cb-border,rgba(255,255,255,0.12))] bg-[var(--cb-input-bg,rgba(0,0,0,0.3))] px-1.5 py-0.5 font-mono">Esc</kbd> to clear
        </div>
      </div>
    </div>
  );
}
