'use client';

/**
 * Ticker Autocomplete Component
 * 
 * Provides intelligent ticker search with company name, exchange, and country.
 * Prevents user confusion between similar tickers (e.g., GOOS vs GSHD).
 */

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Search, Building2, Check } from 'lucide-react';

export interface TickerResult {
  symbol: string;
  name: string;
  exchange: string;
  country?: string;
}

export interface TickerAutocompleteProps {
  value: string;
  onChange: (ticker: string) => void;
  onCompanySelected: (company: TickerResult | null) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

export function TickerAutocomplete({
  value,
  onChange,
  onCompanySelected,
  label = 'Ticker Symbol',
  placeholder = 'Enter ticker (e.g., AAPL, GOOG)',
  required = false,
  disabled = false,
}: TickerAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<TickerResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<TickerResult | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch ticker results with debounce
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!query || query.trim().length === 0) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/tickers?q=${encodeURIComponent(query)}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch tickers');
        }

        const data: TickerResult[] = await response.json();
        setResults(data);
        setIsOpen(data.length > 0);
        setHighlightedIndex(-1);
      } catch (error) {
        console.error('[TickerAutocomplete] Error fetching tickers:', error);
        setResults([]);
        setIsOpen(false);
      } finally {
        setIsLoading(false);
      }
    }, 300); // 300ms debounce

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query]);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.toUpperCase();
    setQuery(newValue);
    onChange(newValue);
    
    // Clear selection when user types
    if (selectedCompany) {
      setSelectedCompany(null);
      onCompanySelected(null);
    }
  };

  // Handle ticker selection
  const handleSelect = (ticker: TickerResult) => {
    setQuery(ticker.symbol);
    onChange(ticker.symbol);
    setSelectedCompany(ticker);
    onCompanySelected(ticker);
    setIsOpen(false);
    setResults([]);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < results.length) {
          handleSelect(results[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <Label htmlFor="ticker-input" className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      <div className="relative mt-1.5">
        <Input
          ref={inputRef}
          id="ticker-input"
          name="ticker-input"
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) {
              setIsOpen(true);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={cn(
            'pr-10',
            selectedCompany && 'border-green-500 focus-visible:ring-green-500'
          )}
        />
        
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {isLoading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          ) : selectedCompany ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <Search className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Selected company info */}
      {selectedCompany && (
        <div className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
          <Building2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            <span className="font-medium text-foreground">{selectedCompany.name}</span>
            {' · '}
            <span>{selectedCompany.symbol}</span>
            {' · '}
            <span>{selectedCompany.exchange}</span>
            {selectedCompany.country && (
              <>
                {' · '}
                <span>{selectedCompany.country}</span>
              </>
            )}
          </span>
        </div>
      )}

      {/* Dropdown results */}
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-[300px] overflow-y-auto">
          {results.map((ticker, index) => (
            <button
              key={ticker.symbol}
              type="button"
              onClick={() => handleSelect(ticker)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={cn(
                'w-full px-3 py-2.5 text-left hover:bg-accent transition-colors',
                'border-b last:border-b-0 border-border',
                'focus:outline-none focus:bg-accent',
                highlightedIndex === index && 'bg-accent'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">
                      {ticker.symbol}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {ticker.exchange}
                    </span>
                    {ticker.country && (
                      <span className="text-xs text-muted-foreground">
                        {ticker.country}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {ticker.name}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No results message */}
      {isOpen && !isLoading && results.length === 0 && query.trim().length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg p-3">
          <p className="text-sm text-muted-foreground text-center">
            No tickers found for &quot;{query}&quot;
          </p>
        </div>
      )}
    </div>
  );
}

