/**
 * Scenario Overview Component
 * 
 * Compact overview tab showing key metrics at a glance
 */

'use client';

import { type TickerSnapshot } from '@/lib/tickerDataService';
import { type ValuationResult } from '@/lib/frameEngine';
import { type ScenarioFrame } from '@/lib/scenarioFrames';
import { formatValueOrDash, formatCurrency } from '@/lib/utils';
import { TrendingUp, TrendingDown, Activity, DollarSign } from 'lucide-react';

interface ScenarioOverviewProps {
  tickerSnapshot: TickerSnapshot;
  baseValuation: ValuationResult;
  scenarioValuation: ValuationResult;
  selectedFrame: ScenarioFrame;
}

export function ScenarioOverview({
  tickerSnapshot,
  baseValuation,
  scenarioValuation,
  selectedFrame,
}: ScenarioOverviewProps) {
  const delta = scenarioValuation.enterpriseValue - baseValuation.enterpriseValue;
  const deltaPercent = baseValuation.enterpriseValue !== 0
    ? (delta / baseValuation.enterpriseValue) * 100
    : 0;
  const isPositive = delta > 0;
  
  return (
    <div className="space-y-6">
      {/* Company Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {tickerSnapshot.companyName}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {tickerSnapshot.ticker}
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600 dark:text-gray-400">Current Price</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatValueOrDash(tickerSnapshot.currentPrice, (v) => `$${v.toFixed(2)}`)}
            </div>
          </div>
        </div>
        
        {/* Key Company Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <MetricCard
            label="Market Cap"
            value={formatValueOrDash(tickerSnapshot.marketCap, formatCurrency)}
            icon={<DollarSign className="h-4 w-4" />}
          />
          <MetricCard
            label="Beta"
            value={formatValueOrDash(tickerSnapshot.beta, (v) => v.toFixed(2))}
            subtitle={tickerSnapshot.betaSource}
            icon={<Activity className="h-4 w-4" />}
          />
          <MetricCard
            label="Volatility"
            value={formatValueOrDash(tickerSnapshot.volatility, (v) => `${(v * 100).toFixed(1)}%`)}
            subtitle={tickerSnapshot.volatilitySource}
            icon={<Activity className="h-4 w-4" />}
          />
          <MetricCard
            label="Data Quality"
            value={tickerSnapshot.dataQuality.toUpperCase()}
            valueColor={getQualityColor(tickerSnapshot.dataQuality)}
          />
        </div>
      </div>
      
      {/* Valuation Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Base Case */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
            Base Case EV
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-white">
            {formatValueOrDash(baseValuation.enterpriseValue, formatCurrency)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Equity: {formatValueOrDash(baseValuation.impliedEquityValue, formatCurrency)}
          </div>
          {baseValuation.impliedSharePrice && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Per Share: {formatValueOrDash(baseValuation.impliedSharePrice, (v) => `$${v.toFixed(2)}`)}
            </div>
          )}
        </div>
        
        {/* Scenario */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center justify-between">
            <span>{selectedFrame.name} EV</span>
            <span
              className="px-2 py-1 rounded text-xs font-medium text-white"
              style={{ backgroundColor: selectedFrame.color }}
            >
              Scenario
            </span>
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-white">
            {formatValueOrDash(scenarioValuation.enterpriseValue, formatCurrency)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Equity: {formatValueOrDash(scenarioValuation.impliedEquityValue, formatCurrency)}
          </div>
          {scenarioValuation.impliedSharePrice && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Per Share: {formatValueOrDash(scenarioValuation.impliedSharePrice, (v) => `$${v.toFixed(2)}`)}
            </div>
          )}
        </div>
        
        {/* Delta */}
        <div className={`rounded-lg border p-6 ${
          isPositive 
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
            : delta < 0
            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center">
            {isPositive ? (
              <TrendingUp className="h-4 w-4 mr-1 text-green-600" />
            ) : delta < 0 ? (
              <TrendingDown className="h-4 w-4 mr-1 text-red-600" />
            ) : null}
            Change
          </div>
          <div className={`text-3xl font-bold ${
            isPositive 
              ? 'text-green-600 dark:text-green-400' 
              : delta < 0
              ? 'text-red-600 dark:text-red-400'
              : 'text-gray-600 dark:text-gray-400'
          }`}>
            {delta !== 0 ? (isPositive ? '+' : '') : ''}
            {formatValueOrDash(delta, formatCurrency)}
          </div>
          {deltaPercent !== 0 && (
            <div className={`text-lg font-semibold mt-1 ${
              isPositive 
                ? 'text-green-600 dark:text-green-400' 
                : delta < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-600 dark:text-gray-400'
            }`}>
              {isPositive ? '+' : ''}{deltaPercent.toFixed(1)}%
            </div>
          )}
        </div>
      </div>
      
      {/* Scenario Description */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
          Scenario Description
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {selectedFrame.description}
        </p>
      </div>
    </div>
  );
}

function MetricCard({ 
  label, 
  value, 
  subtitle, 
  icon,
  valueColor 
}: { 
  label: string; 
  value: string; 
  subtitle?: string;
  icon?: React.ReactNode;
  valueColor?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-gray-600 dark:text-gray-400">{label}</div>
        {icon && <div className="text-gray-400 dark:text-gray-500">{icon}</div>}
      </div>
      <div className={`text-lg font-bold ${valueColor || 'text-gray-900 dark:text-white'}`}>
        {value}
      </div>
      {subtitle && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {subtitle}
        </div>
      )}
    </div>
  );
}

function getQualityColor(quality: 'high' | 'medium' | 'low'): string {
  switch (quality) {
    case 'high':
      return 'text-green-600 dark:text-green-400';
    case 'medium':
      return 'text-amber-600 dark:text-amber-400';
    case 'low':
      return 'text-red-600 dark:text-red-400';
  }
}
