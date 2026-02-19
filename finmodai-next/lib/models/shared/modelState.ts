/**
 * Model State System
 * 
 * Explicit model states to prevent phantom files and guide user flow
 */

export type ModelState =
  | 'draft' // Initial state, no assumptions collected
  | 'assumptions_required' // Missing required inputs, cannot compute yet
  | 'computable' // All required inputs present, ready to generate
  | 'generating' // Currently generating Excel file
  | 'generated' // File successfully generated
  | 'failed'; // Generation failed

export interface ModelStateInfo {
  state: ModelState;
  missing: string[]; // Missing required inputs
  estimated: Array<{ key: string; value: number; source: string; confidence: 'low' | 'medium' | 'high' }>; // Auto-estimated inputs
  canGenerate: boolean; // Whether model is computable
  message?: string; // User-facing message
}

/**
 * Check if model is computable
 */
export function isModelComputable(state: ModelStateInfo): boolean {
  return state.state === 'computable' || state.state === 'generated';
}

/**
 * Get user-facing message for state
 */
export function getStateMessage(state: ModelStateInfo): string {
  switch (state.state) {
    case 'draft':
      return 'Enter assumptions to begin';
    case 'assumptions_required':
      return `Missing required inputs: ${state.missing.join(', ')}`;
    case 'computable':
      return 'Ready to generate';
    case 'generating':
      return 'Generating model...';
    case 'generated':
      return 'Model generated successfully';
    case 'failed':
      return state.message || 'Generation failed';
    default:
      return 'Unknown state';
  }
}
