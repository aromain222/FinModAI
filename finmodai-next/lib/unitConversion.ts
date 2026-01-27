/**
 * Unit Conversion Helpers
 * 
 * Ensures consistent handling of monetary units across the entire app.
 * Standard: All monetary values are stored in MILLIONS of currency units.
 */
export const UNITS = 'USD_MILLIONS';

/**
 * Convert a raw dollar value to millions
 * @param value - Value in full dollars
 * @returns Value in millions, or 0 if invalid
 */
export function toMillions(value: number | null | undefined): number {
  if (value === null || value === undefined || !isFinite(value)) {
    return 0;
  }
  return value / 1_000_000;
}

/**
 * Parse a string like "$123.4B" or "$5.6M" to millions
 * @param str - String with format like "$123.4B", "$5.6M", or "$1234.5K"
 * @returns Value in millions, or 0 if invalid
 */
export function parseBillionsString(str: string | null | undefined): number {
  if (!str || typeof str !== 'string') {
    return 0;
  }

  // Remove $ and whitespace
  const cleaned = str.replace(/[$,\s]/g, '').trim();
  
  // Match pattern: number + optional unit (B/M/K)
  const match = cleaned.match(/^([-+]?[\d.]+)([BMK])?$/i);
  
  if (!match) {
    // Try to parse as plain number (assume dollars)
    const num = parseFloat(cleaned);
    return isFinite(num) ? toMillions(num) : 0;
  }
  
  const value = parseFloat(match[1]);
  const unit = match[2]?.toUpperCase();
  
  if (!isFinite(value)) {
    return 0;
  }
  
  switch (unit) {
    case 'B': // Billions → multiply by 1000 to get millions
      return value * 1000;
    case 'M': // Already in millions
      return value;
    case 'K': // Thousands → divide by 1000 to get millions
      return value / 1000;
    default: // No unit → assume dollars
      return toMillions(value);
  }
}

/**
 * Format millions to a human-readable string
 * @param millions - Value in millions
 * @param decimals - Number of decimal places (default 1)
 * @returns Formatted string like "$123.4B" or "$5.6M"
 */
export function formatMillions(millions: number, decimals: number = 1): string {
  if (!isFinite(millions)) {
    return '$0.0M';
  }
  
  const abs = Math.abs(millions);
  const sign = millions < 0 ? '-' : '';
  
  if (abs >= 1000) {
    // Display as billions
    return `${sign}$${(abs / 1000).toFixed(decimals)}B`;
  } else if (abs >= 1) {
    // Display as millions
    return `${sign}$${abs.toFixed(decimals)}M`;
  } else {
    // Display as thousands
    return `${sign}$${(abs * 1000).toFixed(decimals)}K`;
  }
}

/**
 * Validate that a value is in a reasonable range for millions
 * @param millions - Value to check
 * @param fieldName - Name of field for error messages
 * @returns true if valid, throws if invalid
 */
export function validateMillions(
  millions: number,
  fieldName: string,
  minMillions: number = 0,
  maxMillions: number = 10_000_000 // $10 trillion
): boolean {
  if (!isFinite(millions)) {
    throw new Error(`${fieldName} is not a finite number: ${millions}`);
  }
  
  if (millions < minMillions || millions > maxMillions) {
    console.warn(
      `[validateMillions] ${fieldName} out of range: ${formatMillions(millions)} ` +
      `(expected ${formatMillions(minMillions)} to ${formatMillions(maxMillions)})`
    );
  }
  
  return true;
}

/**
 * Ensure a value is already in millions (detect if accidentally in full dollars)
 * @param value - Value to check
 * @param fieldName - Name of field for logging
 * @returns Value in millions
 */
export function ensureMillions(value: number, fieldName: string): number {
  if (!isFinite(value) || value === 0) {
    return 0;
  }
  
  // If value is > 1 billion (as a number), it's likely in full dollars
  // Example: 293_812_000_000 (MSFT net debt in dollars) should be 293_812 in millions
  if (Math.abs(value) > 1_000_000_000) {
    console.warn(
      `[ensureMillions] ${fieldName} appears to be in full dollars (${value.toLocaleString()}), ` +
      `converting to millions: ${formatMillions(toMillions(value))}`
    );
    return toMillions(value);
  }
  
  return value;
}
