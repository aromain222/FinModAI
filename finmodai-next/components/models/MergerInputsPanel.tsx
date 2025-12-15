"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { MissingInputsModal } from './MissingInputsModal';
import { getMissingMergerInputs, validateMergerInputs, type MergerModelInput } from '@/lib/models/merger/schema';

interface MergerInputsPanelProps {
  inputs: Partial<MergerModelInput>;
  onChange: (inputs: Partial<MergerModelInput>) => void;
  onValidate?: (isValid: boolean, missing: string[]) => void;
  pulledData?: any; // Pulled financial data
}

export function MergerInputsPanel({ inputs, onChange, onValidate, pulledData }: MergerInputsPanelProps) {
  const [missingInputsModalOpen, setMissingInputsModalOpen] = useState(false);
  const [missingInputs, setMissingInputs] = useState<string[]>([]);
  
  // Initialize integration costs array when forecast years changes
  useEffect(() => {
    const forecastYears = inputs.forecastYears || 5;
    if (!inputs.integrationCosts || inputs.integrationCosts.length !== forecastYears) {
      const newArray = Array(forecastYears).fill(0);
      if (inputs.integrationCosts) {
        // Preserve existing values
        inputs.integrationCosts.forEach((val, idx) => {
          if (idx < forecastYears) newArray[idx] = val;
        });
      }
      // Only update if different to avoid loops
      const needsUpdate = !inputs.integrationCosts || 
                         inputs.integrationCosts.length !== forecastYears ||
                         inputs.integrationCosts.some((val, idx) => idx >= forecastYears);
      if (needsUpdate) {
        onChange({ ...inputs, integrationCosts: newArray });
      }
    }
  }, [inputs.forecastYears]); // Only depend on forecastYears
  
  // Validate on every change
  useEffect(() => {
    const missing = getMissingMergerInputs(inputs, pulledData);
    setMissingInputs(missing);
    if (onValidate) {
      onValidate(missing.length === 0, missing);
    }
  }, [inputs, pulledData]); // Remove onValidate from deps to avoid loops
  
  const handleChange = (key: keyof MergerModelInput, value: any) => {
    const updated = { ...inputs, [key]: value };
    onChange(updated);
  };
  
  const handleArrayChange = (key: 'integrationCosts', index: number, value: number) => {
    const current = inputs[key] || [];
    const updated = [...current];
    updated[index] = value;
    handleChange(key, updated);
  };
  
  const forecastYears = inputs.forecastYears || 5;
  
  // Check if revenue synergies exist
  const hasRevenueSynergy = inputs.revenueSynergies && (
    (inputs.revenueSynergies.runRate !== undefined && inputs.revenueSynergies.runRate > 0) ||
    (inputs.revenueSynergies.year1 !== undefined && inputs.revenueSynergies.year1 > 0) ||
    (inputs.revenueSynergies.year2 !== undefined && inputs.revenueSynergies.year2 > 0) ||
    (inputs.revenueSynergies.year3 !== undefined && inputs.revenueSynergies.year3 > 0) ||
    (inputs.revenueSynergies.year4 !== undefined && inputs.revenueSynergies.year4 > 0) ||
    (inputs.revenueSynergies.year5 !== undefined && inputs.revenueSynergies.year5 > 0)
  );
  
  return (
    <>
      <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle className="text-lg text-[var(--cb-text-primary)]">
            Buyer & Target <span className="text-[var(--cb-danger)]">*</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="buyer-ticker" className="text-[var(--cb-text-primary)]">
                Buyer Ticker <span className="text-[var(--cb-danger)]">*</span>
              </Label>
              <Input
                id="buyer-ticker"
                value={inputs.buyerTicker || ''}
                onChange={(e) => handleChange('buyerTicker', e.target.value.toUpperCase())}
                placeholder="AAPL"
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="target-ticker" className="text-[var(--cb-text-primary)]">
                Target Ticker <span className="text-[var(--cb-danger)]">*</span>
              </Label>
              <Input
                id="target-ticker"
                value={inputs.targetTicker || ''}
                onChange={(e) => handleChange('targetTicker', e.target.value.toUpperCase())}
                placeholder="MSFT"
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
              />
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle className="text-lg text-[var(--cb-text-primary)]">
            Deal Terms <span className="text-[var(--cb-danger)]">*</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="deal-structure" className="text-[var(--cb-text-primary)]">
              Deal Structure <span className="text-[var(--cb-danger)]">*</span>
            </Label>
            <select
              id="deal-structure"
              value={inputs.dealStructure || ''}
              onChange={(e) => handleChange('dealStructure', e.target.value)}
              className="w-full rounded-md border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-3 py-2 text-[var(--cb-text-primary)]"
            >
              <option value="">Select...</option>
              <option value="cash">Cash</option>
              <option value="stock">Stock</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="offer-price" className="text-[var(--cb-text-primary)]">
                Offer Price ($)
              </Label>
              <Input
                id="offer-price"
                type="number"
                step="0.01"
                value={inputs.offerPrice || ''}
                onChange={(e) => handleChange('offerPrice', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="150.00"
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="premium-pct" className="text-[var(--cb-text-primary)]">
                Premium (%)
              </Label>
              <Input
                id="premium-pct"
                type="number"
                step="0.1"
                value={inputs.premiumPct ? inputs.premiumPct * 100 : ''}
                onChange={(e) => handleChange('premiumPct', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                placeholder="30.0"
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
              />
            </div>
          </div>
          
          {(inputs.dealStructure === 'stock' || inputs.dealStructure === 'mixed') && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="stock-pct" className="text-[var(--cb-text-primary)]">
                  Stock % (of equity value)
                </Label>
                <Input
                  id="stock-pct"
                  type="number"
                  step="0.1"
                  value={inputs.stockPct ? inputs.stockPct * 100 : ''}
                  onChange={(e) => handleChange('stockPct', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                  placeholder="50.0"
                  className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="exchange-ratio" className="text-[var(--cb-text-primary)]">
                  Exchange Ratio
                </Label>
                <Input
                  id="exchange-ratio"
                  type="number"
                  step="0.001"
                  value={inputs.exchangeRatio || ''}
                  onChange={(e) => handleChange('exchangeRatio', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="1.250"
                  className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                />
              </div>
            </div>
          )}
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="fees-total" className="text-[var(--cb-text-primary)]">
                Fees Total ($M) <span className="text-[var(--cb-danger)]">*</span>
              </Label>
              <Input
                id="fees-total"
                type="number"
                step="0.1"
                value={inputs.feesTotal || ''}
                onChange={(e) => handleChange('feesTotal', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="500"
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fees-treatment" className="text-[var(--cb-text-primary)]">
                Fees Treatment <span className="text-[var(--cb-danger)]">*</span>
              </Label>
              <select
                id="fees-treatment"
                value={inputs.feesTreatment || ''}
                onChange={(e) => handleChange('feesTreatment', e.target.value as 'expense' | 'capitalize')}
                className="w-full rounded-md border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-3 py-2 text-[var(--cb-text-primary)]"
              >
                <option value="">Select...</option>
                <option value="expense">Expense</option>
                <option value="capitalize">Capitalize</option>
              </select>
            </div>
          </div>
          
          <div className="space-y-1">
            <Label htmlFor="forecast-years" className="text-[var(--cb-text-primary)]">
              Forecast Years (3-5) <span className="text-[var(--cb-danger)]">*</span>
            </Label>
            <Input
              id="forecast-years"
              type="number"
              min="3"
              max="5"
              step="1"
              value={inputs.forecastYears || 5}
              onChange={(e) => handleChange('forecastYears', e.target.value ? parseInt(e.target.value) : 5)}
              className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
            />
          </div>
          
          <div className="space-y-1">
            <Label htmlFor="tax-rate" className="text-[var(--cb-text-primary)]">
              Tax Rate (%) {pulledData?.buyer?.taxRate || pulledData?.target?.taxRate ? '' : <span className="text-[var(--cb-danger)]">*</span>}
            </Label>
            <Input
              id="tax-rate"
              type="number"
              step="0.1"
              value={inputs.taxRate ? inputs.taxRate * 100 : (pulledData?.buyer?.taxRate ? pulledData.buyer.taxRate * 100 : pulledData?.target?.taxRate ? pulledData.target.taxRate * 100 : '')}
              onChange={(e) => handleChange('taxRate', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
              placeholder="21.0"
              className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
            />
            {(pulledData?.buyer?.taxRate || pulledData?.target?.taxRate) && (
              <p className="text-xs text-[var(--cb-text-muted)]">Using pulled tax rate</p>
            )}
          </div>
        </CardContent>
      </Card>
      
      <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle className="text-lg text-[var(--cb-text-primary)]">
            Funding
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="buyer-cash" className="text-[var(--cb-text-primary)]">
                Buyer Cash Used ($M)
              </Label>
              <Input
                id="buyer-cash"
                type="number"
                step="0.1"
                value={inputs.buyerCashUsed || ''}
                onChange={(e) => handleChange('buyerCashUsed', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="5000"
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-debt" className="text-[var(--cb-text-primary)]">
                New Debt ($M)
              </Label>
              <Input
                id="new-debt"
                type="number"
                step="0.1"
                value={inputs.newDebt || ''}
                onChange={(e) => handleChange('newDebt', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="10000"
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
              />
            </div>
          </div>
          
          {inputs.newDebt !== undefined && inputs.newDebt > 0 && (
            <div className="space-y-1">
              <Label htmlFor="new-debt-rate" className="text-[var(--cb-text-primary)]">
                New Debt Rate (%) <span className="text-[var(--cb-danger)]">*</span>
              </Label>
              <Input
                id="new-debt-rate"
                type="number"
                step="0.1"
                value={inputs.newDebtRate ? inputs.newDebtRate * 100 : ''}
                onChange={(e) => handleChange('newDebtRate', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                placeholder="5.0"
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
              />
            </div>
          )}
          
          <div className="space-y-1">
            <Label htmlFor="min-cash" className="text-[var(--cb-text-primary)]">
              Min Cash (minimum buyer cash retained) ($M)
            </Label>
            <Input
              id="min-cash"
              type="number"
              step="0.1"
              value={inputs.minCash || ''}
              onChange={(e) => handleChange('minCash', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="1000"
              className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
            />
          </div>
        </CardContent>
      </Card>
      
      <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle className="text-lg text-[var(--cb-text-primary)]">
            Synergies
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="rev-synergy-runrate" className="text-[var(--cb-text-primary)]">
              Revenue Synergy Run Rate ($M)
            </Label>
            <Input
              id="rev-synergy-runrate"
              type="number"
              step="0.1"
              value={inputs.revenueSynergies?.runRate || ''}
              onChange={(e) => handleChange('revenueSynergies', {
                ...inputs.revenueSynergies,
                runRate: e.target.value ? parseFloat(e.target.value) : undefined,
              })}
              placeholder="500"
              className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
            />
          </div>
          
          <div className="space-y-1">
            <Label htmlFor="rev-synergy-ramp" className="text-[var(--cb-text-primary)]">
              Ramp Years
            </Label>
            <Input
              id="rev-synergy-ramp"
              type="number"
              step="1"
              min="1"
              max="10"
              value={inputs.revenueSynergies?.rampYears || ''}
              onChange={(e) => handleChange('revenueSynergies', {
                ...inputs.revenueSynergies,
                rampYears: e.target.value ? parseInt(e.target.value) : undefined,
              })}
              placeholder="3"
              className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
            />
          </div>
          
          {hasRevenueSynergy && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="synergy-cogs-pct" className="text-[var(--cb-text-primary)]">
                  Synergy COGS % <span className="text-[var(--cb-danger)]">*</span>
                </Label>
                <Input
                  id="synergy-cogs-pct"
                  type="number"
                  step="0.1"
                  value={inputs.synergyCOGSPct ? inputs.synergyCOGSPct * 100 : ''}
                  onChange={(e) => handleChange('synergyCOGSPct', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                  placeholder="60.0"
                  className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="synergy-gm-pct" className="text-[var(--cb-text-primary)]">
                  Synergy Gross Margin % <span className="text-[var(--cb-danger)]">*</span>
                </Label>
                <Input
                  id="synergy-gm-pct"
                  type="number"
                  step="0.1"
                  value={inputs.synergyGrossMarginPct ? inputs.synergyGrossMarginPct * 100 : ''}
                  onChange={(e) => handleChange('synergyGrossMarginPct', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                  placeholder="40.0"
                  className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                />
              </div>
            </div>
          )}
          
          <div className="space-y-1">
            <Label htmlFor="cogs-savings-runrate" className="text-[var(--cb-text-primary)]">
              COGS Savings Run Rate ($M)
            </Label>
            <Input
              id="cogs-savings-runrate"
              type="number"
              step="0.1"
              value={inputs.cogsSavings?.runRate || ''}
              onChange={(e) => handleChange('cogsSavings', {
                ...inputs.cogsSavings,
                runRate: e.target.value ? parseFloat(e.target.value) : undefined,
              })}
              placeholder="200"
              className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
            />
          </div>
          
          <div className="space-y-1">
            <Label htmlFor="opex-savings-runrate" className="text-[var(--cb-text-primary)]">
              OpEx Savings Run Rate ($M)
            </Label>
            <Input
              id="opex-savings-runrate"
              type="number"
              step="0.1"
              value={inputs.opexSavings?.runRate || ''}
              onChange={(e) => handleChange('opexSavings', {
                ...inputs.opexSavings,
                runRate: e.target.value ? parseFloat(e.target.value) : undefined,
              })}
              placeholder="150"
              className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-[var(--cb-text-primary)]">
              Integration Costs ($M) - Year by Year <span className="text-[var(--cb-danger)]">*</span>
            </Label>
            <p className="text-xs text-[var(--cb-text-muted)]">
              Must provide {forecastYears} values (can be zeros)
            </p>
            <div className="grid gap-2 md:grid-cols-5">
              {Array.from({ length: forecastYears }, (_, i) => {
                const currentValue = (inputs.integrationCosts && inputs.integrationCosts[i] !== undefined) 
                  ? inputs.integrationCosts[i] 
                  : 0;
                
                return (
                  <div key={i} className="space-y-1">
                    <Label htmlFor={`integration-cost-${i}`} className="text-xs text-[var(--cb-text-muted)]">
                      Year {i + 1}
                    </Label>
                    <Input
                      id={`integration-cost-${i}`}
                      type="number"
                      step="0.1"
                      min="0"
                      value={currentValue}
                      onChange={(e) => {
                        const currentArray = inputs.integrationCosts || Array(forecastYears).fill(0);
                        const newArray = [...currentArray];
                        newArray[i] = e.target.value ? parseFloat(e.target.value) : 0;
                        handleChange('integrationCosts', newArray);
                      }}
                      placeholder="0"
                      className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardHeader>
          <CardTitle className="text-lg text-[var(--cb-text-primary)]">
            Purchase Accounting <span className="text-[var(--cb-danger)]">*</span>
          </CardTitle>
          <CardDescription className="text-[var(--cb-text-secondary)]">
            Purchase accounting is enabled by default
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="purchase-accounting"
              checked={inputs.purchaseAccountingEnabled !== false}
              onChange={(e) => handleChange('purchaseAccountingEnabled', e.target.checked)}
              className="h-4 w-4 accent-[var(--cb-green)]"
            />
            <Label htmlFor="purchase-accounting" className="text-[var(--cb-text-primary)]">
              Enable Purchase Accounting
            </Label>
          </div>
          
          {inputs.purchaseAccountingEnabled !== false && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="intangibles-pct" className="text-[var(--cb-text-primary)]">
                  Intangibles % <span className="text-[var(--cb-danger)]">*</span>
                </Label>
                <Input
                  id="intangibles-pct"
                  type="number"
                  step="0.1"
                  value={inputs.intangiblesPct ? inputs.intangiblesPct * 100 : ''}
                  onChange={(e) => handleChange('intangiblesPct', e.target.value ? parseFloat(e.target.value) / 100 : undefined)}
                  placeholder="30.0"
                  className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="intangibles-life" className="text-[var(--cb-text-primary)]">
                  Intangibles Life (years) <span className="text-[var(--cb-danger)]">*</span>
                </Label>
                <Input
                  id="intangibles-life"
                  type="number"
                  step="1"
                  min="1"
                  max="40"
                  value={inputs.intangiblesLifeYears || ''}
                  onChange={(e) => handleChange('intangiblesLifeYears', e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="15"
                  className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)]"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
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
        modelType="merger"
      />
    </>
  );
}
