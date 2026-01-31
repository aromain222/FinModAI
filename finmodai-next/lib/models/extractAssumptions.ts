/**
 * Extract Assumptions
 * Extract assumptions from model data
 */

export function extractAssumptions(data: Record<string, any>): Record<string, any> {
  const assumptions: Record<string, any> = {};
  
  // Extract common assumption fields
  const assumptionFields = [
    'revenueGrowth',
    'ebitdaMargin',
    'wacc',
    'terminalGrowth',
    'taxRate',
    'capexPctRevenue',
    'nwcPctRevenue'
  ];
  
  for (const field of assumptionFields) {
    if (data[field] !== undefined) {
      assumptions[field] = data[field];
    }
  }
  
  return assumptions;
}

// Alias for compatibility
export const extractModelAssumptions = extractAssumptions;
