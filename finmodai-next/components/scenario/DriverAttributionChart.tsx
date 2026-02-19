/**
 * Driver Attribution Chart Component
 * 
 * Displays waterfall chart showing how each driver contributes to valuation change
 */

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { type WaterfallData } from '@/lib/attribution';
import { formatValueOrDash, formatCurrency } from '@/lib/utils';

interface DriverAttributionChartProps {
  attribution: WaterfallData | null;
  compact?: boolean;
}

export function DriverAttributionChart({ attribution, compact = false }: DriverAttributionChartProps) {
  // Skip rendering if attribution is null or empty
  if (!attribution || !attribution.sortedDrivers || attribution.sortedDrivers.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Driver Attribution
          </h3>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
          No attribution data available
        </div>
      </div>
    );
  }
  
  // Prepare waterfall data
  const waterfallData = prepareWaterfallData(attribution);
  const chartHeight = compact ? 'h-48' : 'h-80';
  const driversToShow = compact ? 3 : 5;
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Driver Attribution
        </h3>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          What moved the valuation?
        </div>
      </div>
      
      {/* Waterfall Chart */}
      <div className={chartHeight}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={waterfallData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              tick={{ fill: '#6b7280', fontSize: compact ? 10 : 12 }}
              angle={-45}
              textAnchor="end"
              height={compact ? 60 : 100}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: compact ? 10 : 12 }}
              tickFormatter={(value) => formatValueOrDash(value, formatCurrency)}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {waterfallData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      {/* Driver List */}
      {!compact && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Top Drivers (by impact)
          </div>
          {attribution.sortedDrivers.slice(0, driversToShow).map((driver, idx) => {
          const isPositive = driver.impact > 0;
          const impactPercent = Math.abs(driver.impactPercent * 100).toFixed(1);
          
          return (
            <div
              key={driver.driver}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
            >
              <div className="flex items-center space-x-3">
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  #{idx + 1}
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {driver.label}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {driver.explanation}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-sm font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                  {isPositive ? '+' : ''}{formatValueOrDash(driver.impact, formatCurrency)}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  {impactPercent}% of change
                </div>
              </div>
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
}

/**
 * Prepares data for waterfall chart
 */
function prepareWaterfallData(attribution: WaterfallData) {
  const data: Array<{
    name: string;
    value: number;
    color: string;
    impact: number;
    explanation?: string;
  }> = [];
  
  // Starting point (base valuation)
  data.push({
    name: 'Base Case',
    value: attribution.baseValuation,
    color: '#3b82f6',
    impact: 0,
  });
  
  // Add each driver's contribution
  let runningTotal = attribution.baseValuation;
  
  for (const driver of attribution.sortedDrivers) {
    const isPositive = driver.impact > 0;
    runningTotal += driver.impact;
    
    data.push({
      name: driver.label,
      value: runningTotal,
      color: isPositive ? '#10b981' : '#ef4444',
      impact: driver.impact,
      explanation: driver.explanation,
    });
  }
  
  // Ending point (scenario valuation)
  data.push({
    name: 'Scenario',
    value: attribution.scenarioValuation,
    color: '#8b5cf6',
    impact: attribution.totalDelta,
  });
  
  return data;
}

/**
 * Custom tooltip for waterfall chart
 */
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || !payload[0]) return null;
  
  const data = payload[0].payload;
  
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
      <div className="font-medium text-gray-900 dark:text-white mb-1">
        {data.name}
      </div>
      <div className="text-sm text-gray-600 dark:text-gray-400">
        Value: {formatValueOrDash(data.value, formatCurrency)}
      </div>
      {data.impact !== 0 && (
        <div className={`text-sm font-medium ${data.impact > 0 ? 'text-green-600' : 'text-red-600'}`}>
          Impact: {data.impact > 0 ? '+' : ''}{formatValueOrDash(data.impact, formatCurrency)}
        </div>
      )}
      {data.explanation && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {data.explanation}
        </div>
      )}
    </div>
  );
}

