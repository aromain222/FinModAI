/**
 * Scenario Frame Selector Component
 * 
 * Allows users to select from 6 canonical scenario frames
 */

'use client';

import { SCENARIO_FRAMES, type ScenarioFrameType } from '@/lib/scenarioFrames';

interface ScenarioFrameSelectorProps {
  selectedFrame: ScenarioFrameType;
  onSelectFrame: (frameId: ScenarioFrameType) => void;
}

export function ScenarioFrameSelector({
  selectedFrame,
  onSelectFrame,
}: ScenarioFrameSelectorProps) {
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Scenario Frame
      </label>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {SCENARIO_FRAMES.map((frame) => {
          const isSelected = frame.id === selectedFrame;
          
          return (
            <button
              key={frame.id}
              onClick={() => onSelectFrame(frame.id)}
              className={`
                relative p-4 rounded-lg border-2 text-left transition-all
                ${isSelected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }
              `}
            >
              {/* Color indicator */}
              <div
                className="absolute top-3 right-3 w-3 h-3 rounded-full"
                style={{ backgroundColor: frame.color }}
              />
              
              {/* Frame name */}
              <div className="font-semibold text-gray-900 dark:text-white mb-1">
                {frame.name}
              </div>
              
              {/* Frame description */}
              <div className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                {frame.description}
              </div>
              
              {/* Selected indicator */}
              {isSelected && (
                <div className="mt-2 flex items-center text-xs text-blue-600 dark:text-blue-400">
                  <svg
                    className="w-4 h-4 mr-1"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Selected
                </div>
              )}
            </button>
          );
        })}
      </div>
      
      {/* Frame details */}
      {selectedFrame && (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Scenario Details
          </div>
          
          {(() => {
            const frame = SCENARIO_FRAMES.find(f => f.id === selectedFrame);
            if (!frame) return null;
            
            return (
              <div className="space-y-3">
                {/* Narrative */}
                <div>
                  <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Narrative
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    {frame.narrative}
                  </div>
                </div>
                
                {/* Key assumptions */}
                {frame.assumptionDeltas.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Key Assumption Changes
                    </div>
                    <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                      {frame.assumptionDeltas.map((delta, idx) => (
                        <li key={idx} className="flex items-start">
                          <span className="text-gray-400 mr-2">•</span>
                          <span>
                            <strong>{delta.label}:</strong> {delta.explanation}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {/* Risk framing */}
                {frame.riskFraming.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Key Considerations
                    </div>
                    <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                      {frame.riskFraming.map((risk, idx) => (
                        <li key={idx} className="flex items-start">
                          <span className="text-gray-400 mr-2">•</span>
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
