/**
 * Reset to Settings Defaults Button
 * 
 * Button to reset model inputs to settings defaults.
 */

import { Button } from '@/components/ui/button';
import type { AppSettings } from '@/lib/settings/schema';

interface ResetToDefaultsButtonProps {
  modelType:
    | 'dcf'
    | 'lbo'
    | 'merger'
    | 'operating'
    | 'three-statement'
    | 'comps'
    | 'scorecard';
  settings: AppSettings;
  onReset: (defaults: any) => void;
  className?: string;
}

export function ResetToDefaultsButton({ 
  modelType, 
  settings, 
  onReset,
  className = '' 
}: ResetToDefaultsButtonProps) {
  const handleReset = () => {
    // AppSettings is a flat schema; keep resets simple and safe across model types.
    // Model-specific UIs can choose which of these fields to apply.
    const defaults: any = {
      revenueGrowth: settings.defaultRevenueGrowth,
      ebitdaMargin: settings.defaultEbitdaMargin,
      wacc: settings.defaultWACC,
      terminalGrowth: settings.defaultTerminalGrowth,
      taxRate: settings.defaultTaxRate,
      capexPctRevenue: settings.defaultCapexPctRevenue,
      nwcPctRevenue: settings.defaultNwcPctRevenue,
      projectionYears: settings.defaultProjectionYears,
    };
    
    // Remove undefined values
    Object.keys(defaults).forEach(key => {
      if (defaults[key] === undefined) delete defaults[key];
    });
    
    onReset(defaults);
  };
  
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleReset}
      className={className}
    >
      Reset to Settings Defaults
    </Button>
  );
}
