/**
 * Data Quality Warning Component
 * 
 * Displays warnings when data quality is low or medium
 */

'use client';

import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

interface DataQualityWarningProps {
  dataQuality: 'high' | 'medium' | 'low';
  warnings: string[];
}

export function DataQualityWarning({ dataQuality, warnings }: DataQualityWarningProps) {
  // Don't show anything for high quality data with no warnings
  if (dataQuality === 'high' && warnings.length === 0) {
    return null;
  }
  
  const config = getQualityConfig(dataQuality);
  
  return (
    <div className={`rounded-lg border p-4 ${config.bgColor} ${config.borderColor}`}>
      <div className="flex items-start space-x-3">
        <div className={`flex-shrink-0 ${config.iconColor}`}>
          {config.icon}
        </div>
        
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className={`text-sm font-semibold ${config.textColor}`}>
              Data Quality: {config.label}
            </h4>
            <span className={`text-xs font-medium px-2 py-1 rounded ${config.badgeBg} ${config.badgeText}`}>
              {dataQuality.toUpperCase()}
            </span>
          </div>
          
          {warnings.length > 0 && (
            <ul className={`text-sm space-y-1 ${config.listColor}`}>
              {warnings.map((warning, idx) => (
                <li key={idx} className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          )}
          
          <p className={`text-xs ${config.suggestionColor}`}>
            {config.suggestion}
          </p>
        </div>
      </div>
    </div>
  );
}

function getQualityConfig(quality: 'high' | 'medium' | 'low') {
  switch (quality) {
    case 'low':
      return {
        label: 'Low',
        icon: <AlertTriangle className="h-5 w-5" />,
        iconColor: 'text-red-600 dark:text-red-400',
        textColor: 'text-red-900 dark:text-red-100',
        listColor: 'text-red-800 dark:text-red-200',
        suggestionColor: 'text-red-700 dark:text-red-300',
        bgColor: 'bg-red-50 dark:bg-red-900/20',
        borderColor: 'border-red-200 dark:border-red-800',
        badgeBg: 'bg-red-100 dark:bg-red-900/40',
        badgeText: 'text-red-800 dark:text-red-200',
        suggestion: '⚠️ Results are directional only. Critical data is missing. Consider using a ticker with more complete financial data.',
      };
    case 'medium':
      return {
        label: 'Medium',
        icon: <AlertCircle className="h-5 w-5" />,
        iconColor: 'text-amber-600 dark:text-amber-400',
        textColor: 'text-amber-900 dark:text-amber-100',
        listColor: 'text-amber-800 dark:text-amber-200',
        suggestionColor: 'text-amber-700 dark:text-amber-300',
        bgColor: 'bg-amber-50 dark:bg-amber-900/20',
        borderColor: 'border-amber-200 dark:border-amber-800',
        badgeBg: 'bg-amber-100 dark:bg-amber-900/40',
        badgeText: 'text-amber-800 dark:text-amber-200',
        suggestion: 'Some data points are missing or inferred. Results should be used as estimates.',
      };
    case 'high':
      return {
        label: 'High',
        icon: <Info className="h-5 w-5" />,
        iconColor: 'text-blue-600 dark:text-blue-400',
        textColor: 'text-blue-900 dark:text-blue-100',
        listColor: 'text-blue-800 dark:text-blue-200',
        suggestionColor: 'text-blue-700 dark:text-blue-300',
        bgColor: 'bg-blue-50 dark:bg-blue-900/20',
        borderColor: 'border-blue-200 dark:border-blue-800',
        badgeBg: 'bg-blue-100 dark:bg-blue-900/40',
        badgeText: 'text-blue-800 dark:text-blue-200',
        suggestion: 'Data quality is good. Results are based on comprehensive financial data.',
      };
  }
}
