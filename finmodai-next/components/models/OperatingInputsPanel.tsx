"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { MissingInputsModal } from './MissingInputsModal';
import { getMissingOperatingInputs, type OperatingModelInput } from '@/lib/models/operating/schema';

interface OperatingInputsPanelProps {
  inputs: Partial<OperatingModelInput>;
  onChange: (inputs: Partial<OperatingModelInput>) => void;
  onValidate?: (isValid: boolean, missing: string[]) => void;
}

export function OperatingInputsPanel({ inputs, onChange, onValidate }: OperatingInputsPanelProps) {
  const [missingInputsModalOpen, setMissingInputsModalOpen] = useState(false);
  const [missingInputs, setMissingInputs] = useState<string[]>([]);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number | null>(null);
  const [bulkValue, setBulkValue] = useState<string>('');
  
  const months = inputs.months || 12;
  
  // Initialize schedules when months changes
  useEffect(() => {
    if (inputs.months && inputs.months !== months) {
      const newMonths = inputs.months;
      const updated: Partial<OperatingModelInput> = { ...inputs };
      
      // Resize hires schedule
      if (updated.opexModel?.hiresSchedule) {
        const current = updated.opexModel.hiresSchedule;
        const newSchedule = Array(newMonths).fill(0);
        current.forEach((val: unknown, idx: number) => {
          const n = typeof val === 'number' ? val : Number(val);
          if (idx < newMonths && Number.isFinite(n)) newSchedule[idx] = n;
        });
        updated.opexModel = { ...updated.opexModel, hiresSchedule: newSchedule };
      }
      
      // Resize capex schedule
      if (updated.capexSchedule) {
        const current = updated.capexSchedule;
        const newSchedule = Array(newMonths).fill(0);
        current.forEach((val: unknown, idx: number) => {
          const n = typeof val === 'number' ? val : Number(val);
          if (idx < newMonths && Number.isFinite(n)) newSchedule[idx] = n;
        });
        updated.capexSchedule = newSchedule;
      }
      
      // Resize debt repayment schedule
      if (updated.debt?.principalRepaymentSchedule) {
        const current = updated.debt.principalRepaymentSchedule;
        const newSchedule = Array(newMonths).fill(0);
        current.forEach((val: unknown, idx: number) => {
          const n = typeof val === 'number' ? val : Number(val);
          if (idx < newMonths && Number.isFinite(n)) newSchedule[idx] = n;
        });
        updated.debt = { ...updated.debt, principalRepaymentSchedule: newSchedule };
      }
      
      onChange(updated);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inputs/months/onChange intentionally partial
  }, [inputs.months]);
  
  // Validate on every change
  useEffect(() => {
    const missing = getMissingOperatingInputs(inputs);
    setMissingInputs(missing);
    if (onValidate) {
      onValidate(missing.length === 0, missing);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onValidate intentionally not in deps
  }, [inputs]);
  
  const handleChange = (key: string, value: any) => {
    const keys = key.split('.');
    if (keys.length === 1) {
      onChange({ ...inputs, [key]: value });
    } else {
      const [first, ...rest] = keys;
      const nested = (inputs as any)[first] || {};
      
      // Deep clone and update nested path
      const updated = JSON.parse(JSON.stringify(nested));
      let current = updated;
      for (let i = 0; i < rest.length - 1; i++) {
        if (!current[rest[i]]) {
          current[rest[i]] = {};
        }
        current = current[rest[i]];
      }
      current[rest[rest.length - 1]] = value;
      
      onChange({ ...inputs, [first]: updated });
    }
  };
  
  const handleArrayChange = (key: string, index: number, value: number) => {
    // Handle nested paths (e.g., 'opexModel.hiresSchedule')
    const keys = key.split('.');
    let current: number[] = [];
    
    if (keys.length === 1) {
      current = ((inputs as any)[key] || []) as number[];
    } else {
      // Navigate nested path
      let nested = inputs as any;
      for (const k of keys) {
        nested = nested?.[k];
        if (nested === undefined) break;
      }
      current = (nested || []) as number[];
    }
    
    // Ensure array is the right length
    if (current.length < months) {
      current = [...current, ...Array(months - current.length).fill(0)];
    }
    
    const updated = [...current];
    updated[index] = value;
    handleChange(key, updated);
  };

  // Parse clipboard text into numbers
  const parsePastedNumbers = (text: string): number[] => {
    // Split by commas, spaces, tabs, or newlines
    const tokens = text.split(/[,\s\t\n]+/).filter(t => t.trim());
    const numbers: number[] = [];
    
    for (const token of tokens) {
      const num = parseFloat(token.trim());
      if (!isNaN(num) && isFinite(num)) {
        // Clamp negatives to 0
        numbers.push(Math.max(0, num));
      }
    }
    
    return numbers;
  };

  // Apply bulk value to hires schedule
  const applyBulkToHires = (value: number, startIndex: number = 0, endIndex: number = months - 1) => {
    const current = inputs.opexModel?.hiresSchedule || Array(months).fill(0);
    const updated = [...current];
    
    for (let i = startIndex; i <= endIndex && i < months; i++) {
      updated[i] = Math.max(0, Math.round(value));
    }
    
    handleChange('opexModel.hiresSchedule', updated);
  };

  // Handle paste in hires schedule
  const handleHiresPaste = (e: React.ClipboardEvent<HTMLInputElement>, startIndex: number) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const numbers = parsePastedNumbers(pastedText);
    
    if (numbers.length === 0) return;
    
    const current = inputs.opexModel?.hiresSchedule || Array(months).fill(0);
    const updated = [...current];
    
    // Fill sequentially from startIndex
    const fillCount = Math.min(numbers.length, months - startIndex);
    for (let i = 0; i < fillCount; i++) {
      updated[startIndex + i] = Math.max(0, Math.round(numbers[i]));
    }
    
    handleChange('opexModel.hiresSchedule', updated);
  };

  // Handle paste in bulk value input
  const handleBulkValuePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const numbers = parsePastedNumbers(pastedText);
    
    if (numbers.length === 0) return;
    
    const current = inputs.opexModel?.hiresSchedule || Array(months).fill(0);
    const updated = [...current];
    
    // Fill sequentially from month 1
    const fillCount = Math.min(numbers.length, months);
    for (let i = 0; i < fillCount; i++) {
      updated[i] = Math.max(0, Math.round(numbers[i]));
    }
    
    handleChange('opexModel.hiresSchedule', updated);
  };
  
  // Compute preview KPIs
  const previewKPIs = computePreviewKPIs(inputs);
  
  return (
    <>
      <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle className="text-lg text-[var(--cb-text-primary)]">
            Global Settings <span className="text-[var(--cb-danger)]">*</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="start-month" className="text-[var(--cb-text-primary)]">
                Start Month (YYYY-MM) <span className="text-[var(--cb-danger)]">*</span>
              </Label>
              <Input
                id="start-month"
                type="text"
                pattern="\d{4}-\d{2}"
                value={inputs.startMonth || ''}
                onChange={(e) => handleChange('startMonth', e.target.value)}
                placeholder="2024-01"
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="months" className="text-[var(--cb-text-primary)]">
                Months (12-36) <span className="text-[var(--cb-danger)]">*</span>
              </Label>
              <Input
                id="months"
                type="number"
                min="12"
                max="36"
                step="1"
                value={inputs.months || 12}
                onChange={(e) => handleChange('months', e.target.value ? parseInt(e.target.value) : 12)}
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
              />
            </div>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="currency" className="text-[var(--cb-text-primary)]">
                Currency
              </Label>
              <Input
                id="currency"
                value={inputs.currency || 'USD'}
                onChange={(e) => handleChange('currency', e.target.value)}
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tax-rate" className="text-[var(--cb-text-primary)]">
                Tax Rate (%) <span className="text-[var(--cb-danger)]">*</span>
              </Label>
              <Input
                id="tax-rate"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={inputs.taxRate ? inputs.taxRate * 100 : ''}
                onChange={(e) => handleChange('taxRate', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                placeholder="21.0"
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
              />
            </div>
          </div>
          
          <div className="space-y-1">
            <Label htmlFor="starting-cash" className="text-[var(--cb-text-primary)]">
              Starting Cash ($) <span className="text-[var(--cb-danger)]">*</span>
            </Label>
            <Input
              id="starting-cash"
              type="number"
              step="0.01"
              value={inputs.startingCash || ''}
              onChange={(e) => handleChange('startingCash', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="1000000"
              className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
            />
          </div>
        </CardContent>
      </Card>
      
      <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle className="text-lg text-[var(--cb-text-primary)]">
            Revenue Model <span className="text-[var(--cb-danger)]">*</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-[var(--cb-text-primary)]">Revenue Model Type</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="revenue-type"
                  value="saas"
                  checked={inputs.revenueModel?.type === 'saas'}
                  onChange={() => handleChange('revenueModel', { type: 'saas' })}
                  className="accent-[var(--cb-green)]"
                />
                <span className="text-[var(--cb-text-primary)]">SaaS</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="revenue-type"
                  value="priceVolume"
                  checked={inputs.revenueModel?.type === 'priceVolume'}
                  onChange={() => handleChange('revenueModel', { type: 'priceVolume' })}
                  className="accent-[var(--cb-green)]"
                />
                <span className="text-[var(--cb-text-primary)]">Price×Volume</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="revenue-type"
                  value="manual"
                  checked={inputs.revenueModel?.type === 'manual'}
                  onChange={() => handleChange('revenueModel', { type: 'manual' })}
                  className="accent-[var(--cb-green)]"
                />
                <span className="text-[var(--cb-text-primary)]">Manual</span>
              </label>
            </div>
          </div>
          
          {inputs.revenueModel?.type === 'saas' && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="starting-customers" className="text-[var(--cb-text-primary)]">
                    Starting Customers <span className="text-[var(--cb-danger)]">*</span>
                  </Label>
                  <Input
                    id="starting-customers"
                    type="number"
                    min="0"
                    value={inputs.revenueModel?.startingCustomers || ''}
                    onChange={(e) => handleChange('revenueModel.startingCustomers', e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="1000"
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="starting-arpu" className="text-[var(--cb-text-primary)]">
                    Starting ARPU ($) <span className="text-[var(--cb-danger)]">*</span>
                  </Label>
                  <Input
                    id="starting-arpu"
                    type="number"
                    step="0.01"
                    min="0"
                    value={inputs.revenueModel?.startingARPU || ''}
                    onChange={(e) => handleChange('revenueModel.startingARPU', e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="50.00"
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="new-adds" className="text-[var(--cb-text-primary)]">
                    New Adds (constant or schedule) <span className="text-[var(--cb-danger)]">*</span>
                  </Label>
                  <Input
                    id="new-adds"
                    type="number"
                    min="0"
                    value={typeof inputs.revenueModel?.newAdds === 'number' ? inputs.revenueModel.newAdds : ''}
                    onChange={(e) => handleChange('revenueModel.newAdds', e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="50"
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                  <p className="text-xs text-[var(--cb-text-muted)]">Enter constant value (schedule input coming soon)</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="churn-pct" className="text-[var(--cb-text-primary)]">
                    Churn % <span className="text-[var(--cb-danger)]">*</span>
                  </Label>
                  <Input
                    id="churn-pct"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={typeof inputs.revenueModel?.churnPct === 'number' ? inputs.revenueModel.churnPct * 100 : ''}
                    onChange={(e) => handleChange('revenueModel.churnPct', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                    placeholder="2.0"
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
              </div>
              
              <div className="space-y-1">
                <Label htmlFor="expansion-pct" className="text-[var(--cb-text-primary)]">
                  Expansion % <span className="text-[var(--cb-danger)]">*</span>
                </Label>
                <Input
                  id="expansion-pct"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={typeof inputs.revenueModel?.expansionPct === 'number' ? inputs.revenueModel.expansionPct * 100 : ''}
                  onChange={(e) => handleChange('revenueModel.expansionPct', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                  placeholder="1.0"
                  className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                />
              </div>
            </div>
          )}
          
          {inputs.revenueModel?.type === 'priceVolume' && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="starting-units" className="text-[var(--cb-text-primary)]">
                    Starting Units <span className="text-[var(--cb-danger)]">*</span>
                  </Label>
                  <Input
                    id="starting-units"
                    type="number"
                    min="0"
                    value={inputs.revenueModel?.startingUnits || ''}
                    onChange={(e) => handleChange('revenueModel.startingUnits', e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="10000"
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="starting-price" className="text-[var(--cb-text-primary)]">
                    Starting Price ($) <span className="text-[var(--cb-danger)]">*</span>
                  </Label>
                  <Input
                    id="starting-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={inputs.revenueModel?.startingPrice || ''}
                    onChange={(e) => handleChange('revenueModel.startingPrice', e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="10.00"
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="unit-growth" className="text-[var(--cb-text-primary)]">
                    Unit Growth (constant or schedule) <span className="text-[var(--cb-danger)]">*</span>
                  </Label>
                  <Input
                    id="unit-growth"
                    type="number"
                    step="0.1"
                    value={typeof inputs.revenueModel?.unitGrowth === 'number' ? inputs.revenueModel.unitGrowth * 100 : ''}
                    onChange={(e) => handleChange('revenueModel.unitGrowth', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                    placeholder="5.0"
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                  <p className="text-xs text-[var(--cb-text-muted)]">Enter as % (e.g., 5.0 for 5%)</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="price-change" className="text-[var(--cb-text-primary)]">
                    Price Change (constant or schedule) <span className="text-[var(--cb-danger)]">*</span>
                  </Label>
                  <Input
                    id="price-change"
                    type="number"
                    step="0.1"
                    value={typeof inputs.revenueModel?.priceChange === 'number' ? inputs.revenueModel.priceChange * 100 : ''}
                    onChange={(e) => handleChange('revenueModel.priceChange', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                    placeholder="2.0"
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                  <p className="text-xs text-[var(--cb-text-muted)]">Enter as % (e.g., 2.0 for 2%)</p>
                </div>
              </div>
            </div>
          )}
          
          {inputs.revenueModel?.type === 'manual' && (
            <div className="space-y-2">
              <Label className="text-[var(--cb-text-primary)]">
                Revenue Schedule ($) - Month by Month <span className="text-[var(--cb-danger)]">*</span>
              </Label>
              <p className="text-xs text-[var(--cb-text-muted)]">
                Must provide {months} values
              </p>
              <div className="grid gap-2 md:grid-cols-6 max-h-60 overflow-y-auto">
                {Array.from({ length: months }, (_, i) => (
                  <div key={i} className="space-y-1">
                    <Label htmlFor={`revenue-${i}`} className="text-xs text-[var(--cb-text-muted)]">
                      Month {i + 1}
                    </Label>
                    <Input
                      id={`revenue-${i}`}
                      type="number"
                      step="0.01"
                      value={inputs.revenueModel?.revenueSchedule?.[i] !== undefined ? inputs.revenueModel.revenueSchedule[i] : ''}
                      onChange={(e) => {
                        const current = inputs.revenueModel?.revenueSchedule || Array(months).fill(0);
                        const newSchedule = [...current];
                        newSchedule[i] = e.target.value ? parseFloat(e.target.value) : 0;
                        handleChange('revenueModel.revenueSchedule', newSchedule);
                      }}
                      placeholder="0"
                      className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle className="text-lg text-[var(--cb-text-primary)]">
            COGS Model <span className="text-[var(--cb-danger)]">*</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-[var(--cb-text-primary)]">COGS Model Type</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="cogs-type"
                  value="pctRevenue"
                  checked={inputs.cogsModel?.type === 'pctRevenue'}
                  onChange={() => handleChange('cogsModel', { type: 'pctRevenue' })}
                  className="accent-[var(--cb-green)]"
                />
                <span className="text-[var(--cb-text-primary)]">% of Revenue</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="cogs-type"
                  value="unitCost"
                  checked={inputs.cogsModel?.type === 'unitCost'}
                  onChange={() => handleChange('cogsModel', { type: 'unitCost' })}
                  className="accent-[var(--cb-green)]"
                  disabled={inputs.revenueModel?.type !== 'priceVolume'}
                />
                <span className="text-[var(--cb-text-primary)]">Unit Cost</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="cogs-type"
                  value="fixedPlusVariable"
                  checked={inputs.cogsModel?.type === 'fixedPlusVariable'}
                  onChange={() => handleChange('cogsModel', { type: 'fixedPlusVariable' })}
                  className="accent-[var(--cb-green)]"
                />
                <span className="text-[var(--cb-text-primary)]">Fixed + Variable</span>
              </label>
            </div>
          </div>
          
          {inputs.cogsModel?.type === 'pctRevenue' && (
            <div className="space-y-1">
              <Label htmlFor="cogs-pct" className="text-[var(--cb-text-primary)]">
                COGS % <span className="text-[var(--cb-danger)]">*</span>
              </Label>
              <Input
                id="cogs-pct"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={inputs.cogsModel?.cogsPct ? inputs.cogsModel.cogsPct * 100 : ''}
                onChange={(e) => handleChange('cogsModel.cogsPct', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                placeholder="40.0"
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
              />
            </div>
          )}
          
          {inputs.cogsModel?.type === 'unitCost' && (
            <div className="space-y-1">
              <Label htmlFor="unit-cost" className="text-[var(--cb-text-primary)]">
                Unit Cost ($) <span className="text-[var(--cb-danger)]">*</span>
              </Label>
              <Input
                id="unit-cost"
                type="number"
                step="0.01"
                min="0"
                value={inputs.cogsModel?.unitCost || ''}
                onChange={(e) => handleChange('cogsModel.unitCost', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="4.00"
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
              />
              {inputs.revenueModel?.type !== 'priceVolume' && (
                <p className="text-xs text-[var(--cb-danger)]">Unit cost requires Price×Volume revenue model</p>
              )}
            </div>
          )}
          
          {inputs.cogsModel?.type === 'fixedPlusVariable' && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="fixed-cogs" className="text-[var(--cb-text-primary)]">
                  Fixed COGS ($) <span className="text-[var(--cb-danger)]">*</span>
                </Label>
                <Input
                  id="fixed-cogs"
                  type="number"
                  step="0.01"
                  min="0"
                  value={inputs.cogsModel?.fixedCOGS || ''}
                  onChange={(e) => handleChange('cogsModel.fixedCOGS', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="50000"
                  className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="variable-cogs-pct" className="text-[var(--cb-text-primary)]">
                  Variable COGS % <span className="text-[var(--cb-danger)]">*</span>
                </Label>
                <Input
                  id="variable-cogs-pct"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={inputs.cogsModel?.variableCOGSPct ? inputs.cogsModel.variableCOGSPct * 100 : ''}
                  onChange={(e) => handleChange('cogsModel.variableCOGSPct', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                  placeholder="30.0"
                  className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle className="text-lg text-[var(--cb-text-primary)]">
            Operating Expenses <span className="text-[var(--cb-danger)]">*</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="starting-headcount" className="text-[var(--cb-text-primary)]">
                Starting Headcount <span className="text-[var(--cb-danger)]">*</span>
              </Label>
              <Input
                id="starting-headcount"
                type="number"
                min="0"
                value={inputs.opexModel?.startingHeadcount || ''}
                onChange={(e) => handleChange('opexModel.startingHeadcount', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="50"
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cost-per-head" className="text-[var(--cb-text-primary)]">
                Fully Loaded Cost Per Head ($) <span className="text-[var(--cb-danger)]">*</span>
              </Label>
              <Input
                id="cost-per-head"
                type="number"
                step="0.01"
                min="0"
                value={inputs.opexModel?.fullyLoadedCostPerHead || ''}
                onChange={(e) => handleChange('opexModel.fullyLoadedCostPerHead', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="15000"
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label className="text-[var(--cb-text-primary)]">
              Hires Schedule - Month by Month <span className="text-[var(--cb-danger)]">*</span>
            </Label>
            <p className="text-xs text-[var(--cb-text-muted)]">
              Must provide {months} values (can be zeros)
            </p>
            
            {/* Bulk Actions Row */}
            <div className="flex flex-wrap items-end gap-2 p-2 bg-[var(--cb-surface-alt)] rounded-lg border border-[var(--cb-border-subtle)]">
              <div className="flex-1 min-w-[120px]">
                <Label htmlFor="bulk-hires-value" className="text-xs text-[var(--cb-text-muted)] mb-1 block">
                  Bulk value
                </Label>
                <Input
                  id="bulk-hires-value"
                  type="number"
                  step="1"
                  min="0"
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  onPaste={handleBulkValuePaste}
                  placeholder="80"
                  className="bg-[var(--cb-surface)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)] text-sm h-8"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const value = parseFloat(bulkValue);
                  if (!isNaN(value) && isFinite(value)) {
                    applyBulkToHires(value, 0, months - 1);
                    setBulkValue('');
                  }
                }}
                className="h-8 text-xs"
                disabled={!bulkValue || isNaN(parseFloat(bulkValue))}
              >
                Apply to all {months}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const value = parseFloat(bulkValue);
                  if (!isNaN(value) && isFinite(value) && selectedMonthIndex !== null) {
                    applyBulkToHires(value, selectedMonthIndex, months - 1);
                    setBulkValue('');
                  }
                }}
                className="h-8 text-xs"
                disabled={!bulkValue || isNaN(parseFloat(bulkValue)) || selectedMonthIndex === null}
              >
                Apply to remaining
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  applyBulkToHires(0, 0, months - 1);
                  setBulkValue('');
                }}
                className="h-8 text-xs"
              >
                Clear all
              </Button>
            </div>
            <p className="text-xs text-[var(--cb-text-muted)] italic">
              Tip: paste 12 numbers separated by commas/spaces/newlines.
            </p>
            
            <div className="grid gap-2 md:grid-cols-6 max-h-60 overflow-y-auto">
              {Array.from({ length: months }, (_, i) => (
                <div key={i} className="space-y-1">
                  <Label htmlFor={`hires-${i}`} className="text-xs text-[var(--cb-text-muted)]">
                    Month {i + 1}
                  </Label>
                  <Input
                    id={`hires-${i}`}
                    type="number"
                    step="1"
                    min="0"
                    value={inputs.opexModel?.hiresSchedule?.[i] !== undefined ? inputs.opexModel.hiresSchedule[i] : 0}
                    onChange={(e) => handleArrayChange('opexModel.hiresSchedule', i, e.target.value ? parseInt(e.target.value) : 0)}
                    onFocus={() => setSelectedMonthIndex(i)}
                    onPaste={(e) => handleHiresPaste(e, i)}
                    placeholder="0"
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
              ))}
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-[var(--cb-text-primary)]">Sales & Marketing</Label>
              <div className="flex gap-4 mb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="sm-driver"
                    value="fixed"
                    checked={inputs.opexModel?.salesMarketing?.driverType === 'fixed'}
                    onChange={() => handleChange('opexModel.salesMarketing', { driverType: 'fixed' })}
                    className="accent-[var(--cb-green)]"
                  />
                  <span className="text-[var(--cb-text-primary)]">Fixed</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="sm-driver"
                    value="pctRevenue"
                    checked={inputs.opexModel?.salesMarketing?.driverType === 'pctRevenue'}
                    onChange={() => handleChange('opexModel.salesMarketing', { driverType: 'pctRevenue' })}
                    className="accent-[var(--cb-green)]"
                  />
                  <span className="text-[var(--cb-text-primary)]">% of Revenue</span>
                </label>
              </div>
              {inputs.opexModel?.salesMarketing?.driverType === 'fixed' && (
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={inputs.opexModel?.salesMarketing?.monthlyAmount || ''}
                  onChange={(e) => handleChange('opexModel.salesMarketing.monthlyAmount', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="50000"
                  className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                />
              )}
              {inputs.opexModel?.salesMarketing?.driverType === 'pctRevenue' && (
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={inputs.opexModel?.salesMarketing?.pct ? inputs.opexModel.salesMarketing.pct * 100 : ''}
                  onChange={(e) => handleChange('opexModel.salesMarketing.pct', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                  placeholder="15.0"
                  className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                />
              )}
            </div>
            
            <div className="space-y-1">
              <Label className="text-[var(--cb-text-primary)]">General & Administrative</Label>
              <div className="flex gap-4 mb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="ga-driver"
                    value="fixed"
                    checked={inputs.opexModel?.generalAdmin?.driverType === 'fixed'}
                    onChange={() => handleChange('opexModel.generalAdmin', { driverType: 'fixed' })}
                    className="accent-[var(--cb-green)]"
                  />
                  <span className="text-[var(--cb-text-primary)]">Fixed</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="ga-driver"
                    value="pctRevenue"
                    checked={inputs.opexModel?.generalAdmin?.driverType === 'pctRevenue'}
                    onChange={() => handleChange('opexModel.generalAdmin', { driverType: 'pctRevenue' })}
                    className="accent-[var(--cb-green)]"
                  />
                  <span className="text-[var(--cb-text-primary)]">% of Revenue</span>
                </label>
              </div>
              {inputs.opexModel?.generalAdmin?.driverType === 'fixed' && (
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={inputs.opexModel?.generalAdmin?.monthlyAmount || ''}
                  onChange={(e) => handleChange('opexModel.generalAdmin.monthlyAmount', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="30000"
                  className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                />
              )}
              {inputs.opexModel?.generalAdmin?.driverType === 'pctRevenue' && (
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={inputs.opexModel?.generalAdmin?.pct ? inputs.opexModel.generalAdmin.pct * 100 : ''}
                  onChange={(e) => handleChange('opexModel.generalAdmin.pct', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                  placeholder="10.0"
                  className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                />
              )}
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  id="rnd-enabled"
                  checked={inputs.opexModel?.rndEnabled || false}
                  onChange={(e) => handleChange('opexModel.rndEnabled', e.target.checked)}
                  className="h-4 w-4 accent-[var(--cb-green)]"
                />
                <Label htmlFor="rnd-enabled" className="text-[var(--cb-text-primary)]">
                  Enable R&D
                </Label>
              </div>
              {inputs.opexModel?.rndEnabled && (
                <>
                  <div className="flex gap-4 mb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="rnd-driver"
                        value="fixed"
                        checked={inputs.opexModel?.rnd?.driverType === 'fixed'}
                        onChange={() => handleChange('opexModel.rnd', { driverType: 'fixed' })}
                        className="accent-[var(--cb-green)]"
                      />
                      <span className="text-[var(--cb-text-primary)]">Fixed</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="rnd-driver"
                        value="pctRevenue"
                        checked={inputs.opexModel?.rnd?.driverType === 'pctRevenue'}
                        onChange={() => handleChange('opexModel.rnd', { driverType: 'pctRevenue' })}
                        className="accent-[var(--cb-green)]"
                      />
                      <span className="text-[var(--cb-text-primary)]">% of Revenue</span>
                    </label>
                  </div>
                  {inputs.opexModel?.rnd?.driverType === 'fixed' && (
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={inputs.opexModel?.rnd?.monthlyAmount || ''}
                      onChange={(e) => handleChange('opexModel.rnd.monthlyAmount', e.target.value ? parseFloat(e.target.value) : undefined)}
                      placeholder="40000"
                      className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                    />
                  )}
                  {inputs.opexModel?.rnd?.driverType === 'pctRevenue' && (
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={inputs.opexModel?.rnd?.pct ? inputs.opexModel.rnd.pct * 100 : ''}
                      onChange={(e) => handleChange('opexModel.rnd.pct', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                      placeholder="8.0"
                      className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle className="text-lg text-[var(--cb-text-primary)]">
            Cash & Capital
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-[var(--cb-text-primary)]">
              Capex Schedule ($) - Month by Month <span className="text-[var(--cb-danger)]">*</span>
            </Label>
            <p className="text-xs text-[var(--cb-text-muted)]">
              Must provide {months} values (can be zeros)
            </p>
            <div className="grid gap-2 md:grid-cols-6 max-h-60 overflow-y-auto">
              {Array.from({ length: months }, (_, i) => (
                <div key={i} className="space-y-1">
                  <Label htmlFor={`capex-${i}`} className="text-xs text-[var(--cb-text-muted)]">
                    Month {i + 1}
                  </Label>
                  <Input
                    id={`capex-${i}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={inputs.capexSchedule?.[i] !== undefined ? inputs.capexSchedule[i] : 0}
                    onChange={(e) => handleArrayChange('capexSchedule', i, e.target.value ? parseFloat(e.target.value) : 0)}
                    placeholder="0"
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
              ))}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="debt-enabled"
              checked={inputs.debt !== undefined}
              onChange={(e) => handleChange('debt', e.target.checked ? {
                startingDebt: 0,
                interestRate: 0,
                principalRepaymentSchedule: Array(months).fill(0),
              } : undefined)}
              className="h-4 w-4 accent-[var(--cb-green)]"
            />
            <Label htmlFor="debt-enabled" className="text-[var(--cb-text-primary)]">
              Enable Debt
            </Label>
          </div>
          
          {inputs.debt && (
            <div className="space-y-4 pl-6 border-l-2 border-[var(--cb-border-subtle)]">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="starting-debt" className="text-[var(--cb-text-primary)]">
                    Starting Debt ($)
                  </Label>
                  <Input
                    id="starting-debt"
                    type="number"
                    step="0.01"
                    min="0"
                    value={inputs.debt?.startingDebt || ''}
                    onChange={(e) => handleChange('debt.startingDebt', e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="0"
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="debt-interest-rate" className="text-[var(--cb-text-primary)]">
                    Interest Rate (%)
                  </Label>
                  <Input
                    id="debt-interest-rate"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={inputs.debt?.interestRate ? inputs.debt.interestRate * 100 : ''}
                    onChange={(e) => handleChange('debt.interestRate', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                    placeholder="5.0"
                    className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-[var(--cb-text-primary)]">
                  Principal Repayment Schedule ($) - Month by Month
                </Label>
                <div className="grid gap-2 md:grid-cols-6 max-h-60 overflow-y-auto">
                  {Array.from({ length: months }, (_, i) => (
                    <div key={i} className="space-y-1">
                      <Label htmlFor={`debt-repayment-${i}`} className="text-xs text-[var(--cb-text-muted)]">
                        Month {i + 1}
                      </Label>
                      <Input
                        id={`debt-repayment-${i}`}
                        type="number"
                        step="0.01"
                        min="0"
                        value={inputs.debt?.principalRepaymentSchedule?.[i] !== undefined ? inputs.debt.principalRepaymentSchedule[i] : 0}
                        onChange={(e) => {
                          const current = inputs.debt?.principalRepaymentSchedule || Array(months).fill(0);
                          const newSchedule = [...current];
                          newSchedule[i] = e.target.value ? parseFloat(e.target.value) : 0;
                          handleChange('debt.principalRepaymentSchedule', newSchedule);
                        }}
                        placeholder="0"
                        className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Preview KPIs */}
      {previewKPIs && (
        <Card className="border border-[var(--cb-green)]/20 bg-[var(--cb-green)]/5">
          <CardHeader>
            <CardTitle className="text-lg text-[var(--cb-text-primary)]">
              Preview KPIs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <p className="text-xs text-[var(--cb-text-muted)]">Total Revenue</p>
                <p className="text-lg font-semibold text-[var(--cb-text-primary)]">
                  ${(previewKPIs.totalRevenue / 1000).toFixed(1)}M
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--cb-text-muted)]">Avg Gross Margin</p>
                <p className="text-lg font-semibold text-[var(--cb-text-primary)]">
                  {previewKPIs.avgGrossMargin !== null ? `${(previewKPIs.avgGrossMargin * 100).toFixed(1)}%` : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--cb-text-muted)]">Total EBITDA</p>
                <p className="text-lg font-semibold text-[var(--cb-text-primary)]">
                  ${(previewKPIs.totalEBITDA / 1000).toFixed(1)}M
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--cb-text-muted)]">Ending Cash</p>
                <p className={`text-lg font-semibold ${previewKPIs.endingCash < 0 ? 'text-[var(--cb-danger)]' : 'text-[var(--cb-text-primary)]'}`}>
                  ${(previewKPIs.endingCash / 1000).toFixed(1)}M
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {missingInputs.length > 0 && (
        <div className="rounded-lg border border-[var(--cb-danger)]/20 bg-[var(--cb-danger)]/5 p-3">
          <p className="text-sm font-semibold text-[var(--cb-danger)]">
            {missingInputs.length} required input{missingInputs.length > 1 ? 's' : ''} missing
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMissingInputsModalOpen(true)}
            className="mt-2"
          >
            View Missing Inputs
          </Button>
        </div>
      )}
      
      <MissingInputsModal
        isOpen={missingInputsModalOpen}
        onClose={() => setMissingInputsModalOpen(false)}
        missingInputs={missingInputs}
        modelType="operating"
      />
    </>
  );
}

/**
 * Compute Preview KPIs (simplified - would need full compute for accurate)
 */
function computePreviewKPIs(inputs: Partial<OperatingModelInput>): {
  totalRevenue: number;
  avgGrossMargin: number | null;
  totalEBITDA: number;
  endingCash: number;
} | null {
  // Simplified preview - would need full compute for accuracy
  // For now, return null to avoid misleading numbers
  return null;
}
