/**
 * Map DCF to Tear Sheet
 * Convert DCF output to tear sheet format
 */

import { TearSheet } from '../tearSheet/types';

export function mapToTearSheet(dcfOutput: Record<string, any>): TearSheet {
  return {
    ticker: dcfOutput.ticker || 'N/A',
    companyName: dcfOutput.companyName || dcfOutput.ticker || 'N/A',
    sections: [
      {
        title: 'Valuation Summary',
        content: {
          enterpriseValue: dcfOutput.enterpriseValue,
          equityValue: dcfOutput.equityValue,
          pricePerShare: dcfOutput.pricePerShare
        }
      }
    ]
  };
}

// Alias for compatibility
export const mapDcfToTearSheet = mapToTearSheet;
