"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertCircle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NetDebtInputProps {
  currentValue: number | null | undefined;
  onUpdate: (netDebt: number) => void;
  ticker: string;
}

type Unit = 'USD' | 'USD_MM';

/**
 * Net Debt Input Component
 * 
 * Treats net debt as required user input with inline editing
 */
export function NetDebtInput({ currentValue, onUpdate, ticker }: NetDebtInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [unit, setUnit] = useState<Unit>('USD_MM');
  const [error, setError] = useState<string | null>(null);

  const hasValue = currentValue !== null && currentValue !== undefined && Number.isFinite(currentValue);

  useEffect(() => {
    if (hasValue && !isEditing) {
      // Display in millions by default
      setInputValue((currentValue! / 1e6).toFixed(1));
      setUnit('USD_MM');
    }
  }, [currentValue, hasValue, isEditing]);

  const handleSave = () => {
    const parsed = parseFloat(inputValue);
    
    if (isNaN(parsed)) {
      setError('Please enter a valid number');
      return;
    }
    
    // Convert to base currency (millions)
    const netDebtInMillions = unit === 'USD' ? parsed / 1e6 : parsed;
    
    onUpdate(netDebtInMillions * 1e6);
    setIsEditing(false);
    setError(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setError(null);
    if (hasValue) {
      setInputValue((currentValue! / 1e6).toFixed(1));
    } else {
      setInputValue('');
    }
  };

  if (!isEditing && hasValue) {
    // Display mode - value exists
    return (
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[var(--cb-text-muted)] mb-1">Net Debt (User Input)</p>
              <p className="text-lg font-semibold text-[var(--cb-text-primary)] font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                ${(currentValue! / 1e6).toFixed(1)}M
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              Edit
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isEditing && !hasValue) {
    // Missing state - prompt user
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--cb-text-primary)] mb-1">
                Net debt not provided — enter to finalize valuation
              </p>
              <p className="text-xs text-[var(--cb-text-muted)] mb-3">
                Net debt is required to calculate equity value and price per share for {ticker}.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                Enter Net Debt
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Edit mode
  return (
    <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardContent className="p-4">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[var(--cb-text-muted)] block mb-2">
              Net Debt for {ticker}
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  type="number"
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    setError(null);
                  }}
                  placeholder={unit === 'USD' ? '1234567890' : '1234.5'}
                  className={cn(
                    "font-mono",
                    error && "border-red-500"
                  )}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                  autoFocus
                />
              </div>
              <div className="flex gap-1">
                <Button
                  variant={unit === 'USD' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setUnit('USD')}
                  className="px-3"
                >
                  USD
                </Button>
                <Button
                  variant={unit === 'USD_MM' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setUnit('USD_MM')}
                  className="px-3"
                >
                  USD mm
                </Button>
              </div>
            </div>
            {error && (
              <p className="text-xs text-red-500 mt-1">{error}</p>
            )}
          </div>
          
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              className="flex-1"
            >
              <Check className="h-4 w-4 mr-1" />
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
          
          <p className="text-xs text-[var(--cb-text-muted)]">
            Net debt = Total debt - Cash. This value will be used to calculate equity value and price per share.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Compact Net Debt Display (for KPI strip)
 */
interface NetDebtKpiProps {
  value: number | null | undefined;
  onEdit?: () => void;
}

export function NetDebtKpi({ value, onEdit }: NetDebtKpiProps) {
  const hasValue = value !== null && value !== undefined && Number.isFinite(value);
  
  return (
    <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[var(--cb-text-muted)] uppercase tracking-wide text-[0.65rem]">
          Net Debt
        </p>
        {onEdit && (
          <button
            onClick={onEdit}
            className="text-[0.65rem] text-blue-400 hover:text-blue-300 uppercase tracking-wide"
          >
            {hasValue ? 'Edit' : 'Enter'}
          </button>
        )}
      </div>
      <p 
        className="text-xl font-semibold text-[var(--cb-text-primary)] font-mono"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {hasValue ? `$${(value! / 1e6).toFixed(1)}M` : '—'}
      </p>
      {!hasValue && (
        <p className="text-[0.65rem] text-amber-500 mt-1">Required</p>
      )}
    </div>
  );
}
