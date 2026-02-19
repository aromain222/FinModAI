"use client";

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MissingInputSpec } from '@/lib/models/shared/missingInputSpecs';

interface MissingInputsModalProps {
  isOpen: boolean;
  onClose: () => void;
  missingInputs: string[];
  modelType: string;
  specs?: MissingInputSpec[];
  values?: Record<string, any>;
  onApply?: (valuesPatch: Record<string, any>) => void;
  onRetry?: () => void | Promise<void>;
}

// Map technical key names to user-friendly labels
const INPUT_LABELS: Record<string, string> = {
  'rf_rate': 'Risk-Free Rate',
  'equity_risk_premium': 'Equity Risk Premium (ERP)',
  'beta': 'Beta',
  'cost_of_debt': 'Cost of Debt',
  'tax_rate_assumption': 'Tax Rate',
  'terminal_growth': 'Terminal Growth Rate',
  'exit_multiple': 'Exit Multiple',
  'entry_multiple': 'Entry Multiple',
  'transaction_fees_percent': 'Transaction Fees',
  'exit_fees_percent': 'Exit Fees',
  'debt_percent': 'Debt %',
  'equity_percent': 'Equity %',
  'interest_rate': 'Interest Rate',
  'amortization_percent': 'Mandatory Amortization',
  'cash_sweep_percent': 'Cash Sweep',
  'revenue_growth': 'Revenue Growth',
  'ebitda_margin': 'EBITDA Margin',
  'capex_pct_revenue': 'Capex % Revenue',
  'delta_nwc_pct_revenue': 'ΔNWC % Revenue',
  'tax_rate': 'Tax Rate',
  'minimum_cash_balance': 'Minimum Cash Balance',
  'revenue': 'Revenue',
  'ebitda': 'EBITDA',
  'ebit': 'EBIT',
  'net_income': 'Net Income',
  'cash': 'Cash',
  'total_debt': 'Total Debt',
  'debt_rate': 'Debt Interest Rate',
  'leverage_multiple': 'Leverage Multiple',
  'holding_period_years': 'Holding Period (Years)',
};

function getInputLabel(key: string): string {
  return INPUT_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function buildFallbackSpecs(missingInputs: string[]): MissingInputSpec[] {
  return missingInputs.map((key) => ({
    key,
    label: getInputLabel(key),
    type: 'number',
  }));
}

function toDisplayValue(spec: MissingInputSpec, rawValue: any): string {
  if (rawValue === null || rawValue === undefined || rawValue === '') return '';
  if (typeof rawValue === 'number' && spec.type === 'percent') {
    return (rawValue * 100).toString();
  }
  return rawValue.toString();
}

type UnitChoice = 'usd' | 'usd_k' | 'usd_m' | 'usd_b';

const UNIT_CHOICES: Array<{ value: UnitChoice; label: string; factor: number }> = [
  { value: 'usd', label: 'USD', factor: 1 },
  { value: 'usd_k', label: 'USD K', factor: 1e3 },
  { value: 'usd_m', label: 'USD M', factor: 1e6 },
  { value: 'usd_b', label: 'USD B', factor: 1e9 },
];

function defaultUnitChoice(spec: MissingInputSpec): UnitChoice {
  if ((spec.unit || '').toUpperCase() !== 'USD') return 'usd';
  switch (spec.scale) {
    case 'thousands':
      return 'usd_k';
    case 'millions':
      return 'usd_m';
    case 'billions':
      return 'usd_b';
    default:
      return 'usd';
  }
}

function stripCommonNumberChars(input: string) {
  // Allow "$", commas, and spaces in numeric input.
  return input.trim().replace(/\$/g, '').replace(/,/g, '').replace(/\s+/g, '');
}

function parseHumanNumber(input: string): { ok: boolean; value?: number; usedSuffix?: boolean; error?: string } {
  const cleaned = stripCommonNumberChars(input).toLowerCase();
  if (!cleaned) return { ok: false, error: 'Required' };

  let usedSuffix = false;
  let multiplier = 1;
  const last = cleaned.slice(-1);
  if (last === 'k' || last === 'm' || last === 'b' || last === 't') {
    usedSuffix = true;
    if (last === 'k') multiplier = 1e3;
    if (last === 'm') multiplier = 1e6;
    if (last === 'b') multiplier = 1e9;
    if (last === 't') multiplier = 1e12;
  }

  const numericPart = usedSuffix ? cleaned.slice(0, -1) : cleaned;
  // Allow a trailing % for percent fields; number coercer calls this too.
  const numericTrimmed = numericPart.endsWith('%') ? numericPart.slice(0, -1) : numericPart;
  const parsed = Number(numericTrimmed);
  if (!Number.isFinite(parsed)) return { ok: false, error: 'Invalid number' };
  return { ok: true, value: parsed * multiplier, usedSuffix };
}

function applyExpectedScale(spec: MissingInputSpec, rawUsd: number): number {
  // Convert "raw USD" to the backend expected scale.
  switch (spec.scale) {
    case 'thousands':
      return rawUsd / 1e3;
    case 'millions':
      return rawUsd / 1e6;
    case 'billions':
      return rawUsd / 1e9;
    case 'raw':
    default:
      return rawUsd;
  }
}

function coerceValue(
  spec: MissingInputSpec,
  rawValue: string,
  unitChoice: UnitChoice | undefined
): { ok: boolean; value?: any; error?: string } {
  const trimmed = rawValue.trim();
  if (!trimmed) return { ok: false, error: 'Required' };

  if (spec.type === 'text') return { ok: true, value: trimmed };

  // Percent values: UI enters "10" meaning 10%. Backend expects 0.10.
  if (spec.type === 'percent') {
    const parsed = parseHumanNumber(trimmed);
    if (!parsed.ok || parsed.value === undefined) return { ok: false, error: parsed.error || 'Invalid number' };
    return { ok: true, value: parsed.value / 100 };
  }

  // Numeric values (USD/shares/etc.)
  const parsed = parseHumanNumber(trimmed);
  if (!parsed.ok || parsed.value === undefined) return { ok: false, error: parsed.error || 'Invalid number' };

  let value = parsed.value;

  // If the user didn't use a suffix (e.g. 34.5B), apply the unit picker (USD K/M/B).
  if (!parsed.usedSuffix && (spec.unit || '').toUpperCase() === 'USD') {
    const choice = UNIT_CHOICES.find((c) => c.value === (unitChoice || 'usd')) || UNIT_CHOICES[0];
    value = value * choice.factor;
  }

  // Convert from raw USD to expected backend scale for this field.
  if ((spec.unit || '').toUpperCase() === 'USD') {
    value = applyExpectedScale(spec, value);
  }

  if (!Number.isFinite(value)) return { ok: false, error: 'Invalid number' };
  return { ok: true, value };
}

export function MissingInputsModal({
  isOpen,
  onClose,
  missingInputs,
  modelType,
  specs,
  values,
  onApply,
  onRetry,
}: MissingInputsModalProps) {
  const resolvedSpecs = useMemo(
    () => (specs && specs.length > 0 ? specs : buildFallbackSpecs(missingInputs)),
    [missingInputs, specs]
  );
  const canApply = Boolean(onApply && onRetry);

  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [unitChoices, setUnitChoices] = useState<Record<string, UnitChoice>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const nextValues: Record<string, string> = {};
    const nextUnitChoices: Record<string, UnitChoice> = {};
    resolvedSpecs.forEach((spec) => {
      const rawValue = values?.[spec.key];
      const defaultValue =
        rawValue === undefined || rawValue === null || rawValue === ''
          ? spec.defaultValue
          : rawValue;
      nextValues[spec.key] = toDisplayValue(spec, defaultValue);
      nextUnitChoices[spec.key] = defaultUnitChoice(spec);
    });
    setFormValues(nextValues);
    setUnitChoices(nextUnitChoices);
    setFormErrors({});
    setSubmitting(false);
  }, [isOpen, resolvedSpecs, values]);

  const handleApply = async () => {
    if (!canApply || !onApply || !onRetry) {
      onClose();
      return;
    }
    const nextErrors: Record<string, string> = {};
    const patch: Record<string, any> = {};
    resolvedSpecs.forEach((spec) => {
      const raw = formValues[spec.key] ?? '';
      const result = coerceValue(spec, raw, unitChoices[spec.key]);
      if (!result.ok) {
        nextErrors[spec.key] = result.error || 'Invalid value';
      } else {
        patch[spec.key] = result.value;
      }
    });

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    onApply(patch);
    await Promise.resolve(onRetry());
    setSubmitting(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--cb-border-strong)] bg-[var(--cb-surface)] p-6 shadow-lg">
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
              The following required inputs must be completed before generating the <strong>{modelType.toUpperCase()}</strong> model:
            </p>
            {canApply ? (
              <div className="mt-4 space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                {resolvedSpecs.map((spec) => (
                  <div key={spec.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-[var(--cb-text-primary)]">
                        {spec.label}
                        <span className="text-[var(--cb-danger)]"> *</span>
                      </Label>
                      {spec.unit && (
                        <span className="text-xs text-[var(--cb-text-muted)]">{spec.unit}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        inputMode={spec.type === 'text' ? 'text' : 'decimal'}
                        placeholder={
                          spec.type === 'percent'
                            ? 'e.g. 10 or 10% (10%)'
                            : (spec.unit || '').toUpperCase() === 'USD'
                              ? 'e.g. 34.5B or 34,500,000,000'
                              : 'Enter value'
                        }
                        value={formValues[spec.key] ?? ''}
                        onChange={(event) =>
                          setFormValues((prev) => ({ ...prev, [spec.key]: event.target.value }))
                        }
                        className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                        autoFocus={resolvedSpecs.length === 1}
                      />
                      {(spec.unit || '').toUpperCase() === 'USD' && spec.type === 'number' && (
                        <div className="w-28">
                          <Select
                            value={unitChoices[spec.key] || 'usd'}
                            onValueChange={(value) =>
                              setUnitChoices((prev) => ({ ...prev, [spec.key]: value as UnitChoice }))
                            }
                          >
                            <SelectTrigger className="h-10 bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {UNIT_CHOICES.map((choice) => (
                                <SelectItem key={choice.value} value={choice.value}>
                                  {choice.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {spec.defaultValue !== undefined && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setFormValues((prev) => ({
                              ...prev,
                              [spec.key]: toDisplayValue(spec, spec.defaultValue),
                            }))
                          }
                        >
                          Use default
                        </Button>
                      )}
                    </div>
                    {spec.hint && (
                      <p className="text-xs text-[var(--cb-text-muted)]">{spec.hint}</p>
                    )}
                    {formErrors[spec.key] && (
                      <p className="text-xs text-[var(--cb-danger)]">{formErrors[spec.key]}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <>
                <ul className="mt-4 space-y-2 max-h-64 overflow-y-auto">
                  {missingInputs.map((input, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm text-[var(--cb-text-primary)]">
                      <span className="text-[var(--cb-danger)]">•</span>
                      <span className="font-medium">{getInputLabel(input)}</span>
                      <span className="text-[var(--cb-text-muted)] text-xs">({input})</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 p-3 rounded-lg bg-[var(--cb-surface-alt)] border border-[var(--cb-border-subtle)]">
                  <p className="text-xs text-[var(--cb-text-secondary)]">
                    <strong>What to do:</strong> Please provide these inputs in the model form above, or use the “Use Estimates” option if available. 
                    The model cannot be generated until all required inputs are provided.
                  </p>
                </div>
              </>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={onClose} variant="outline">
                Cancel
              </Button>
              <Button onClick={handleApply} variant="default" disabled={submitting}>
                {canApply ? (submitting ? 'Re-running…' : 'Apply & Re-run') : 'I Understand'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
