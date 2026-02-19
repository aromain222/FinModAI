/**
 * Scenario Explanation Component
 * 
 * Displays natural language explanation of scenario outcomes
 */

'use client';

import { useState } from 'react';
import { Sparkles, FileText } from 'lucide-react';

interface ScenarioExplanationProps {
  headline: string;
  valuationSummary: string;
  driverBreakdown: string;
  riskFraming: string;
  assumptions: string;
  aiSummary?: string;
  aiConfidence?: 'high' | 'medium' | 'low';
}

export function ScenarioExplanation({
  headline,
  valuationSummary,
  driverBreakdown,
  riskFraming,
  assumptions,
  aiSummary,
  aiConfidence,
}: ScenarioExplanationProps) {
  const [showAI, setShowAI] = useState(false);
  const hasAI = aiSummary && aiSummary.length > 0;
  
  return (
    <div className="space-y-6">
      {/* Headline */}
      <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            {headline}
          </h3>
          
          {/* Toggle Button (only show if AI summary is available) */}
          {hasAI && (
            <button
              onClick={() => setShowAI(!showAI)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              {showAI ? (
                <>
                  <FileText className="h-4 w-4" />
                  Template Explanation
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-blue-500" />
                  AI Insights
                </>
              )}
            </button>
          )}
        </div>
      </div>
      
      {/* AI Summary (if enabled and available) */}
      {hasAI && showAI && (
        <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border-2 border-blue-300 dark:border-blue-700">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
              AI-Generated Insights
            </h4>
            {aiConfidence && (
              <span className={`text-xs font-medium px-2 py-1 rounded ${
                aiConfidence === 'high' 
                  ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200'
                  : aiConfidence === 'medium'
                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
              }`}>
                {aiConfidence} confidence
              </span>
            )}
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
              {aiSummary}
            </p>
          </div>
        </div>
      )}
      
      {/* Template-based explanation (show when AI is not enabled or not available) */}
      {(!hasAI || !showAI) && (
        <>
      
      {/* Valuation Summary */}
      <div>
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
          <svg className="w-5 h-5 mr-2 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
          </svg>
          Valuation Summary
        </div>
        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {valuationSummary}
          </p>
        </div>
      </div>
      
      {/* Driver Breakdown */}
      <div>
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
          <svg className="w-5 h-5 mr-2 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Driver Attribution
        </div>
        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {parseMarkdown(driverBreakdown)}
          </div>
        </div>
      </div>
      
      {/* Assumptions */}
      <div>
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
          <svg className="w-5 h-5 mr-2 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
          Key Assumptions
        </div>
        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {parseMarkdown(assumptions)}
          </div>
        </div>
      </div>
      
      {/* Risk Framing */}
      <div>
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
          <svg className="w-5 h-5 mr-2 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Risk Considerations
        </div>
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {parseMarkdown(riskFraming)}
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

/**
 * Simple markdown parser for basic formatting
 */
function parseMarkdown(text: string) {
  const lines = text.split('\n');
  
  return (
    <div className="space-y-2">
      {lines.map((line, idx) => {
        // Bold text
        if (line.startsWith('**') && line.endsWith('**')) {
          return (
            <div key={idx} className="font-semibold text-gray-900 dark:text-white">
              {line.replace(/\*\*/g, '')}
            </div>
          );
        }
        
        // Bullet points
        if (line.startsWith('•')) {
          return (
            <div key={idx} className="flex items-start ml-2">
              <span className="text-gray-400 mr-2">•</span>
              <span className="text-gray-700 dark:text-gray-300 text-sm">
                {line.substring(1).trim()}
              </span>
            </div>
          );
        }
        
        // Numbered lists
        if (/^\d+\./.test(line)) {
          return (
            <div key={idx} className="flex items-start ml-2">
              <span className="text-gray-500 dark:text-gray-400 mr-2 font-medium">
                {line.match(/^\d+\./)?.[0]}
              </span>
              <span className="text-gray-700 dark:text-gray-300 text-sm">
                {line.replace(/^\d+\.\s*/, '')}
              </span>
            </div>
          );
        }
        
        // Empty lines
        if (line.trim() === '') {
          return <div key={idx} className="h-2" />;
        }
        
        // Regular text
        return (
          <div key={idx} className="text-gray-700 dark:text-gray-300 text-sm">
            {line}
          </div>
        );
      })}
    </div>
  );
}
