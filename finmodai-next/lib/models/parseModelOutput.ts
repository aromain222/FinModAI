/**
 * Parse Model Output
 * Parse and extract data from model outputs
 */

export function parseModelOutput(output: Record<string, any>): Record<string, any> {
  return {
    ...output,
    parsed: true,
    timestamp: new Date().toISOString()
  };
}
