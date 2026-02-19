/**
 * Valuation Outcome Component
 * 
 * Displays valuation results with base vs scenario comparison
 */

'use client';

import { type ValuationResult } from '@/lib/frameEngine';
import { formatValueOrDash, formatCurrency } from '@/lib/utils';

interface ValuationOutcomeProps {
  baseValuation: ValuationResult;
  scenarioValuation: ValuationResult;
  scenarioName: string;
  scenarioColor: string;
  compact?: boolean; // If true, hide breakdown section
}

export function ValuationOutcome({
  baseValuation,
  scenarioValuation,
  scenarioName,
  scenarioColor,
  compact = false,
}: ValuationOutcomeProps) {
  const delta = scenarioValuation.enterpriseValue - baseValuation.enterpriseValue;
  const deltaPercent = baseValuation.enterpriseValue !== 0 
    ? (delta / baseValuation.enterpriseValue) * 100 
    : 0;
  const isPositive = delta > 0;
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Valuation Outcome
        </h3>
        <div
          className="px-3 py-1 rounded-full text-sm font-medium text-white"
          style={{ backgroundColor: scenarioColor }}
        >
          {scenarioName}
        </div>
      </div>
      
      {/* Main comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Base Case */}
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Base Case EV
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatValueOrDash(baseValuation.enterpriseValue)}
          </div>
        </div>
        
        {/* Scenario */}
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            {scenarioName} EV
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatValueOrDash(scenarioValuation.enterpriseValue)}
          </div>
        </div>
        
        {/* Delta */}
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Change
          </div>
          <div className={`text-2xl font-bold ${isPositive ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-600'}`}>
            {delta !== 0 ? (isPositive ? '+' : '') : ''}{formatValueOrDash(delta)}
          </div>
          {deltaPercent !== 0 && (
            <div className={`text-sm ${isPositive ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-600'}`}>
              {isPositive ? '+' : ''}{deltaPercent.toFixed(1)}%
            </div>
          )}
        </div>
      </div>
      
      {/* Breakdown - Hidden in compact mode */}
      {!compact && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Base Case Breakdown */}
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Base Case Breakdown
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">PV of Cash Flows</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {formatValueOrDash(baseValuation.pvOfProjectedCashFlows)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">PV of Terminal Value</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {formatValueOrDash(baseValuation.pvOfTerminalValue)}
              </span>
            </div>
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between">
              <span className="font-medium text-gray-700 dark:text-gray-300">Enterprise Value</span>
              <span className="font-bold text-gray-900 dark:text-white">
                {formatValueOrDash(baseValuation.enterpriseValue)}
              </span>
            </div>
          </div>
        </div>
        
        {/* Scenario Breakdown */}
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            {scenarioName} Breakdown
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">PV of Cash Flows</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {formatValueOrDash(scenarioValuation.pvOfProjectedCashFlows)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">PV of Terminal Value</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {formatValueOrDash(scenarioValuation.pvOfTerminalValue)}
              </span>
            </div>
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between">
              <span className="font-medium text-gray-700 dark:text-gray-300">Enterprise Value</span>
              <span className="font-bold text-gray-900 dark:text-white">
                {formatValueOrDash(scenarioValuation.enterpriseValue)}
              </span>
            </div>
          </div>
        </div>
      </div>
      )}
      
      {/* Terminal Value Contribution */}
      {!compact && baseValuation.enterpriseValue > 0 && scenarioValuation.enterpriseValue > 0 && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
            Terminal Value Contribution
          </div>
          <div className="text-sm text-blue-900 dark:text-blue-100">
            Base: {((baseValuation.pvOfTerminalValue / baseValuation.enterpriseValue) * 100).toFixed(0)}% | 
            {' '}{scenarioName}: {((scenarioValuation.pvOfTerminalValue / scenarioValuation.enterpriseValue) * 100).toFixed(0)}%
          </div>
        </div>
      )}
    </div>
  );
}

