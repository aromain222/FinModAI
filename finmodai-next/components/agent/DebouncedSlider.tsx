'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { getInputMetadata, formatNumberWithAbbreviation } from '@/lib/modeling/inputMetadata';
import { formatPercent, formatCurrencyCompact, formatNumber as formatNumberUtil } from '@/lib/format/number';

type DebouncedSliderProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  inputKey?: string; // For auto-detection of metadata
  defaultValue?: number; // For calculating default bounds
  onChange: (value: number) => void;
  onDebouncedChange?: (value: number) => void;
  debounceMs?: number;
  disabled?: boolean;
  className?: string;
};

/**
 * Debounced slider with immediate visual feedback
 * - Updates UI immediately on drag (for responsiveness)
 * - Debounces onChange callback (for expensive computations)
 */
export function DebouncedSlider({
  label,
  value,
  min: providedMin,
  max: providedMax,
  step: providedStep,
  unit: providedUnit = '',
  inputKey = '',
  defaultValue,
  onChange,
  onDebouncedChange,
  debounceMs = 150,
  disabled = false,
  className,
}: DebouncedSliderProps) {
  // Auto-detect metadata if not provided
  const metadata = useMemo(() => {
    if (providedMin !== undefined && providedMax !== undefined && providedStep !== undefined) {
      return {
        min: providedMin,
        max: providedMax,
        step: providedStep,
        unit: providedUnit,
        isPercentage: false,
        isCurrency: false,
        isCount: false,
      };
    }
    
    const key = inputKey || label.toLowerCase().replace(/\s+/g, '');
    const defaultVal = defaultValue !== undefined ? defaultValue : value;
    return getInputMetadata(key, providedUnit || undefined, defaultVal);
  }, [inputKey, label, providedUnit, defaultValue, value, providedMin, providedMax, providedStep]);

  const { min, max, step, unit } = metadata;
  
  const [displayValue, setDisplayValue] = useState(value);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastDebouncedValueRef = useRef<number>(value);

  // Update display value when prop changes (external update)
  useEffect(() => {
    setDisplayValue(value);
    lastDebouncedValueRef.current = value;
  }, [value]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  const handleChange = useCallback(
    (newValue: number) => {
      // Clamp value
      const clampedValue = Math.max(min, Math.min(max, newValue));

      // Immediate UI update (no debounce)
      setDisplayValue(clampedValue);
      onChange(clampedValue);

      // Debounced callback for expensive operations
      if (onDebouncedChange) {
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }

        debounceTimeoutRef.current = setTimeout(() => {
          if (lastDebouncedValueRef.current !== clampedValue) {
            onDebouncedChange(clampedValue);
            lastDebouncedValueRef.current = clampedValue;
          }
        }, debounceMs);
      }
    },
    [min, max, onChange, onDebouncedChange, debounceMs]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(e.target.value);
      if (!Number.isNaN(newValue)) {
        handleChange(newValue);
      }
    },
    [handleChange]
  );

  const formatValue = useMemo(() => {
    if (metadata.isPercentage) {
      // Handle both 0-1 and 0-100 scales
      const pctValue = metadata.unit === '%' || Math.abs(displayValue) > 1 ? displayValue : displayValue * 100;
      return formatPercent(pctValue, 1);
    }
    
    if (metadata.isCurrency) {
      // Use compact formatting for large currency values
      if (unit === '$M' || unit === 'M') {
        return formatCurrencyCompact(displayValue, 1);
      }
      return formatCurrencyCompact(displayValue, 2);
    }
    
    if (metadata.isCount) {
      // Integer formatting with commas
      return Math.round(displayValue).toLocaleString();
    }
    
    // Generic number with abbreviations for large values
    if (Math.abs(displayValue) >= 1000) {
      return formatNumberWithAbbreviation(displayValue, step < 1 ? 1 : 0);
    }
    
    // Regular formatting with appropriate decimals
    const decimals = step < 1 ? (step < 0.01 ? 2 : 1) : 0;
    return formatNumberUtil(displayValue, decimals, false) + (unit ? ` ${unit}` : '');
  }, [displayValue, unit, step, metadata]);
  
  const formatMinMax = useCallback((val: number) => {
    if (metadata.isPercentage) {
      const pctValue = metadata.unit === '%' || Math.abs(val) > 1 ? val : val * 100;
      return formatPercent(pctValue, 1);
    }
    if (metadata.isCurrency) {
      return formatCurrencyCompact(val, 1);
    }
    if (metadata.isCount) {
      return Math.round(val).toLocaleString();
    }
    if (Math.abs(val) >= 1000) {
      return formatNumberWithAbbreviation(val, 0);
    }
    return formatNumberUtil(val, step < 1 ? 1 : 0, false) + (unit ? ` ${unit}` : '');
  }, [metadata, unit, step]);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor={label} className="text-sm font-medium text-slate-300">
          {label}
        </Label>
        <span className="text-sm font-semibold text-emerald-400">{formatValue}</span>
      </div>
      <input
        id={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={displayValue}
        onChange={handleInputChange}
        disabled={disabled}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <div className="flex justify-between text-xs text-slate-500">
        <span>{formatMinMax(min)}</span>
        <span>{formatMinMax(max)}</span>
      </div>
    </div>
  );
}

