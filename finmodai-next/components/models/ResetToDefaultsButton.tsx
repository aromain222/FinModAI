/**
 * Reset to Settings Defaults Button
 * 
 * Button to reset model inputs to settings defaults.
 */

import { Button } from '@/components/ui/button';
import type { AppSettings } from '@/lib/settings/schema';

interface ResetToDefaultsButtonProps {
  modelType: 'dcf' | 'lbo' | 'merger' | 'operating' | 'three-statement' | 'comps';
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
    let defaults: any = {};
    
    switch (modelType) {
      case 'dcf':
      case 'three-statement':
        defaults = {
          taxRate: settings.defaults.valuation.taxRate,
          terminalGrowth: settings.defaults.valuation.terminalGrowth,
          forecastYears: settings.defaults.valuation.forecastYears,
          wacc: settings.defaults.valuation.wacc,
        };
        break;
      case 'lbo':
        defaults = {
          holdPeriodYears: settings.defaults.lbo.holdPeriodYears,
          interestRate: settings.defaults.lbo.interestRate,
          minCash: settings.defaults.lbo.minCash,
          feesPct: settings.defaults.lbo.feesPct,
        };
        break;
      case 'merger':
        defaults = {
          taxRate: settings.defaults.merger.taxRate,
          newDebtRate: settings.defaults.merger.newDebtRate,
          purchaseAccounting: settings.defaults.merger.intangiblesPct ? {
            enabled: true,
            intangiblesPct: settings.defaults.merger.intangiblesPct,
            intangiblesLifeYears: settings.defaults.merger.intangiblesLifeYears,
          } : undefined,
        };
        break;
      case 'operating':
        defaults = {
          months: settings.defaults.operating.forecastMonths,
          revenueModel: settings.defaults.operating.revenueModelDefault ? {
            type: settings.defaults.operating.revenueModelDefault,
          } : undefined,
          taxRate: settings.defaults.valuation.taxRate,
          currency: settings.defaults.global.currency,
        };
        break;
    }
    
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
